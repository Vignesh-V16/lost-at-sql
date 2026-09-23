import { Event, EVENT_STATES } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { transition, EVENT_ACTIONS, eventTimerState, eventRemainingMs, EngineError } from '../engine/index.js';
import { emitEventState, emitToAll, SOCKET_EVENTS } from '../sockets/emitters.js';
import { auditService } from './auditService.js';
import { sessionService } from './sessionService.js';
import { caseService } from './caseService.js';
import { eventView } from '../serializers/participantView.js';

/**
 * Event lifecycle + event clock (spec §4, §6).
 *
 * Transitions are computed by the pure state machine and written as a
 * compare-and-swap on `{ _id, status: <expected> }`, so two coordinators
 * pressing START at once cannot both succeed. Session clocks are shifted
 * in bulk on resume/extend and expired in bulk on end.
 */
let watchdog = null;
let cached = null;
let cachedAt = 0;
const CACHE_MS = 750;

function toEngineError(err) {
  if (err instanceof EngineError) return ApiError.conflict(err.message, err.code);
  return err;
}

export const eventService = {
  publicState(event) {
    return eventView(event);
  },

  /** Current event (short in-memory cache — participant endpoints hit this on every call). */
  async current({ fresh = false } = {}) {
    if (!fresh && cached && Date.now() - cachedAt < CACHE_MS) return cached;
    cached = await Event.getSingleton();
    cachedAt = Date.now();
    return cached;
  },

  invalidate() {
    cached = null;
    cachedAt = 0;
  },

  async getEvent() {
    return this.current({ fresh: true });
  },

  async getState() {
    const event = await this.current();
    return eventView(event);
  },

  async broadcast(event) {
    const doc = event || (await this.current({ fresh: true }));
    emitEventState(eventView(doc));
  },

  /**
   * Compare-and-swap transition. `patch` is applied together with the new status.
   */
  async applyTransition(action, actor, { patch = {}, audit, announce } = {}) {
    const event = await this.current({ fresh: true });
    let next;
    try {
      next = transition(event.status, action);
    } catch (err) {
      throw toEngineError(err);
    }
    const { __meta: meta = {}, ...fields } = patch;
    const updated = await Event.findOneAndUpdate(
      { _id: event._id, status: event.status },
      { $set: { status: next, ...fields } },
      { new: true },
    );
    if (!updated) throw ApiError.conflict('The event changed while this action was in flight. Reload and retry.', 'EVENT_STATE_CONFLICT');
    this.invalidate();
    caseService.invalidate();
    if (audit) await auditService.record({ actor, action: audit, target: 'event', meta: { from: event.status, to: next, ...meta } });
    await this.broadcast(updated);
    if (announce) emitToAll(SOCKET_EVENTS.ANNOUNCEMENT, announce);
    return { previous: event, event: updated };
  },

  async updateSettings(patch, actor) {
    const event = await this.current({ fresh: true });
    const locked = [EVENT_STATES.LIVE, EVENT_STATES.PAUSED].includes(event.status);
    const structural = ['durationMinutes', 'dataset', 'scoringPolicy', 'queryScope', 'entities', 'finalAttemptPolicy'];
    if (locked && structural.some((k) => patch[k] !== undefined) && !patch.force) {
      throw ApiError.conflict('Scoring, duration, dataset and entities are locked while the investigation is live. Pass force=true to override (audited).', 'EVENT_CONTENT_LOCKED');
    }
    const editable = ['name', 'description', 'caseNumber', 'startsAt', 'durationMinutes', 'registrationOpen', 'maxParticipants', 'exposeQueryHistory', 'proctoring', 'dataset', 'queryScope', 'queryPolicy', 'scoringPolicy', 'leaderboardPolicy', 'finalAttemptPolicy', 'entities', 'briefing', 'landing', 'reveal'];
    const nested = ['queryPolicy', 'scoringPolicy', 'leaderboardPolicy', 'finalAttemptPolicy', 'proctoring', 'briefing', 'landing', 'reveal'];
    for (const key of editable) {
      if (patch[key] === undefined) continue;
      if (nested.includes(key)) {
        const current = event[key] && typeof event[key].toObject === 'function' ? event[key].toObject() : { ...(event[key] || {}) };
        event.set(key, { ...current, ...patch[key] });
      } else {
        event[key] = patch[key];
      }
    }
    event.contentVersion = (event.contentVersion || 1) + 1;
    await event.save();
    this.invalidate();
    caseService.invalidate();
    await auditService.record({ actor, action: 'EVENT_SETTINGS_UPDATED', target: 'event', meta: { keys: Object.keys(patch), forced: Boolean(patch.force && locked) } });
    await this.broadcast(event);
    return event;
  },

  async ready(actor) {
    return (await this.applyTransition(EVENT_ACTIONS.READY, actor, { audit: 'EVENT_READY' })).event;
  },

  async schedule(startsAt, actor) {
    const when = new Date(startsAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) throw ApiError.badRequest('startsAt must be a future timestamp');
    return (await this.applyTransition(EVENT_ACTIONS.SCHEDULE, actor, { patch: { startsAt: when }, audit: 'EVENT_SCHEDULED' })).event;
  },

  async start(actor, { automatic = false } = {}) {
    const event = await this.current({ fresh: true });
    if (event.status === EVENT_STATES.PAUSED) return this.resume(actor);
    const { event: updated } = await this.applyTransition(EVENT_ACTIONS.START, actor, {
      patch: { startedAt: new Date(), pausedAt: null, pausedTotalMs: 0, extendedMs: 0, endedAt: null, startsAt: event.startsAt || null },
      audit: automatic ? 'EVENT_AUTO_STARTED' : 'EVENT_STARTED',
      announce: { tone: 'cyan', title: 'INVESTIGATION STARTED', body: 'The case file is open. Recover Black Cipher.' },
    });
    logger.info(`Event STARTED (${automatic ? 'scheduled' : 'coordinator'})`);
    return updated;
  },

  async pause(actor) {
    const { event } = await this.applyTransition(EVENT_ACTIONS.PAUSE, actor, {
      patch: { pausedAt: new Date() },
      audit: 'EVENT_PAUSED',
      announce: { tone: 'crimson', title: 'INVESTIGATION PAUSED', body: 'The coordinator has paused the investigation. Your clock is frozen.' },
    });
    return event;
  },

  async resume(actor) {
    const before = await this.current({ fresh: true });
    const pauseMs = before.pausedAt ? Math.max(0, Date.now() - new Date(before.pausedAt).getTime()) : 0;
    const { event } = await this.applyTransition(EVENT_ACTIONS.RESUME, actor, {
      patch: { pausedAt: null, pausedTotalMs: (before.pausedTotalMs || 0) + pauseMs, __meta: { pauseMs } },
      audit: 'EVENT_RESUMED',
      announce: { tone: 'cyan', title: 'INVESTIGATION RESUMED', body: 'The clock is running again.' },
    });
    const shifted = await sessionService.shiftActiveDeadlines(event._id, pauseMs, 'pause');
    logger.info(`Event RESUMED after ${pauseMs}ms — shifted ${shifted} session deadline(s)`);
    return event;
  },

  async extend(minutes, actor) {
    const event = await this.current({ fresh: true });
    if (![EVENT_STATES.LIVE, EVENT_STATES.PAUSED].includes(event.status)) {
      throw ApiError.conflict('Time can only be extended while the investigation is running', 'EVENT_NOT_LIVE');
    }
    const ms = minutes * 60000;
    const updated = await Event.findOneAndUpdate({ _id: event._id, status: event.status }, { $inc: { extendedMs: ms } }, { new: true });
    if (!updated) throw ApiError.conflict('The event changed while this action was in flight.', 'EVENT_STATE_CONFLICT');
    this.invalidate();
    const shifted = await sessionService.shiftActiveDeadlines(event._id, ms, 'extend');
    await auditService.record({ actor, action: 'EVENT_EXTENDED', target: 'event', meta: { minutes, sessionsShifted: shifted } });
    await this.broadcast(updated);
    emitToAll(SOCKET_EVENTS.ANNOUNCEMENT, { tone: 'cyan', title: 'TIME EXTENDED', body: `${minutes} additional minute${minutes === 1 ? '' : 's'} granted by the coordinator.` });
    return updated;
  },

  async end(actor, { automatic = false } = {}) {
    const before = await this.current({ fresh: true });
    if (before.status === EVENT_STATES.ENDED) return before;
    const patch = { endedAt: new Date() };
    if (before.status === EVENT_STATES.PAUSED && before.pausedAt) {
      patch.pausedTotalMs = (before.pausedTotalMs || 0) + (Date.now() - new Date(before.pausedAt).getTime());
      patch.pausedAt = null;
    }
    const { event } = await this.applyTransition(EVENT_ACTIONS.END, actor, {
      patch,
      audit: automatic ? 'EVENT_TIMED_OUT' : 'EVENT_ENDED',
      announce: { tone: 'crimson', title: automatic ? 'TIME IS UP' : 'INVESTIGATION ENDED', body: automatic ? 'The investigation window has closed. Final scores are being computed.' : 'The coordinator has closed the case.' },
    });
    const expired = await sessionService.expireAll(event._id, automatic ? 'EVENT_TIMED_OUT' : 'EVENT_ENDED');
    logger.info(`Event ENDED (${automatic ? 'timer' : 'coordinator'}) — ${expired} active session(s) expired`);
    return event;
  },

  async archive(actor) {
    return (await this.applyTransition(EVENT_ACTIONS.ARCHIVE, actor, { patch: { archivedAt: new Date() }, audit: 'EVENT_ARCHIVED' })).event;
  },

  /** Clock/state back to DRAFT. Participant data is removed by resetService. */
  async resetClock(actor) {
    return (await this.applyTransition(EVENT_ACTIONS.RESET, actor, {
      patch: { startedAt: null, pausedAt: null, pausedTotalMs: 0, extendedMs: 0, endedAt: null, archivedAt: null, startsAt: null },
      audit: 'EVENT_RESET',
    })).event;
  },

  timer(event) {
    return eventTimerState(event);
  },

  startWatchdog() {
    if (watchdog) return;
    watchdog = setInterval(async () => {
      try {
        const event = await Event.findOne({ singleton: 'EVENT' });
        if (!event) return;
        if (event.status === EVENT_STATES.SCHEDULED && event.startsAt && new Date(event.startsAt).getTime() <= Date.now()) {
          await this.start(null, { automatic: true });
          return;
        }
        if (event.status !== EVENT_STATES.LIVE) return;
        if (eventRemainingMs(event) <= 0) {
          await this.end(null, { automatic: true });
          return;
        }
        await sessionService.expireOverdue(event);
      } catch (err) {
        logger.warn('Event watchdog error', err.message);
      }
    }, 2000);
    watchdog.unref?.();
  },

  stopWatchdog() {
    if (watchdog) clearInterval(watchdog);
    watchdog = null;
  },
};
