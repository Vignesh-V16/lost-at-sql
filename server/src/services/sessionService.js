import mongoose from 'mongoose';
import { InvestigationSession, SESSION_STATUS, EVENT_STATES } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import {
  computeExpiresAt, isSessionExpired, sessionRemainingMs, sessionElapsedMs, initialStates, deriveProgression, SCORE_TX,
} from '../engine/index.js';
import { caseService } from './caseService.js';
import { eventService } from './eventService.js';
import { scoringService } from './scoringService.js';
import { auditService } from './auditService.js';
import { sessionView, briefingView } from '../serializers/participantView.js';
import { emitFeed, emitToUser, SOCKET_EVENTS } from '../sockets/emitters.js';

const MAX_RETRIES = 8;

/**
 * Session lifecycle (spec §5–7, §10, §28–30).
 *
 * Every state change goes through `mutate()`: load → check → change → save
 * with optimistic concurrency. A concurrent writer makes save() throw a
 * VersionError and the whole step is retried on fresh state, so two
 * simultaneous submits can never both complete the same challenge.
 */
export const sessionService = {
  async findForUser(user, eventId) {
    const event = eventId || (await eventService.current())._id;
    return InvestigationSession.findOne({ event, participant: user._id });
  },

  /** Event + case config + session (may be null) for a participant request. */
  async context(user) {
    const config = await caseService.config();
    const event = await eventService.current();
    const session = await InvestigationSession.findOne({ event: event._id, participant: user._id });
    return { config, event, session };
  },

  async briefing(user) {
    const event = await eventService.current();
    if (![EVENT_STATES.LIVE, EVENT_STATES.PAUSED, EVENT_STATES.ENDED, EVENT_STATES.ARCHIVED].includes(event.status)) {
      throw ApiError.locked('The investigation has not started yet.', 'EVENT_NOT_STARTED');
    }
    return briefingView(event, user);
  },

  /**
   * POST /investigation/start — idempotent create-or-resume.
   */
  async start(user, { ip, requestId } = {}) {
    const config = await caseService.config();
    const event = await eventService.current();
    const existing = await InvestigationSession.findOne({ event: event._id, participant: user._id });
    if (existing) {
      await this.expireIfNeeded(existing, event);
      return { session: existing, resumed: true, view: sessionView(existing, event, config) };
    }
    if (event.status !== EVENT_STATES.LIVE) {
      const codes = { [EVENT_STATES.PAUSED]: ['EVENT_PAUSED', 'The coordinator has paused the investigation.'], [EVENT_STATES.ENDED]: ['EVENT_ENDED', 'The investigation has ended.'], [EVENT_STATES.ARCHIVED]: ['EVENT_ENDED', 'The investigation has ended.'] };
      const [code, message] = codes[event.status] || ['EVENT_NOT_STARTED', 'The investigation has not started yet.'];
      throw ApiError.locked(message, code);
    }
    if (!user.isActive) throw ApiError.forbidden('This investigator credential has been revoked.', 'ACCOUNT_DISABLED');
    const activeCount = await InvestigationSession.countDocuments({ event: event._id });
    if (activeCount >= event.maxParticipants) throw ApiError.conflict('The investigation is at capacity.', 'EVENT_FULL');

    const now = new Date();
    const policy = scoringService.policyOf(event);
    const doc = new InvestigationSession({
      event: event._id,
      participant: user._id,
      team: user.team?._id || user.team || undefined,
      status: SESSION_STATUS.ACTIVE,
      startedAt: now,
      expiresAt: computeExpiresAt(now, event.durationMinutes),
      lastActivityAt: now,
      score: 0,
      suspectStates: new Map(config.entityIds.map((id) => [id, 'UNKNOWN'])),
      timeline: [{ at: now, type: 'SESSION_STARTED' }],
    });
    scoringService.charge(doc, policy, SCORE_TX.INITIAL, { key: 'initial', at: now });
    const progression = deriveProgression(config, doc);
    doc.currentFileCode = progression.currentFileCode;
    doc.currentChallengeCode = progression.currentChallengeCode;
    try {
      await doc.save();
    } catch (err) {
      if (err.code === 11000) {
        // Lost a race with another tab — resume the one that won.
        const winner = await InvestigationSession.findOne({ event: event._id, participant: user._id });
        return { session: winner, resumed: true, view: sessionView(winner, event, config) };
      }
      throw err;
    }
    await auditService.record({ actor: user, action: 'INVESTIGATION_STARTED', target: String(doc._id), ip, requestId });
    emitFeed(SOCKET_EVENTS.PARTICIPANT_STARTED, { participantId: String(user._id), sessionId: String(doc._id), displayName: user.displayName, team: user.team?.name || null });
    logger.info(`Session started for ${user.username}`);
    return { session: doc, resumed: false, view: sessionView(doc, event, config) };
  },

  /** Marks a session TIME_EXPIRED when its deadline has passed. Returns the (possibly updated) session. */
  async expireIfNeeded(session, event) {
    if (!session || session.status !== SESSION_STATUS.ACTIVE) return session;
    if (!isSessionExpired(session, event)) return session;
    const now = new Date();
    const res = await InvestigationSession.updateOne(
      { _id: session._id, status: SESSION_STATUS.ACTIVE },
      { $set: { status: SESSION_STATUS.TIME_EXPIRED, expiredAt: now, elapsedMs: sessionElapsedMs(session, now.getTime()) }, $push: { timeline: { at: now, type: 'TIME_EXPIRED' } }, $inc: { __v: 1 } },
    );
    if (res.modifiedCount) {
      session.status = SESSION_STATUS.TIME_EXPIRED;
      session.expiredAt = now;
      emitFeed(SOCKET_EVENTS.TIME_EXPIRED, { sessionId: String(session._id), participantId: String(session.participant) });
      emitToUser(session.participant, SOCKET_EVENTS.TIMER_EXPIRED, { sessionId: String(session._id), at: now.getTime() });
      await auditService.record({ action: 'SESSION_TIME_EXPIRED', target: String(session._id) });
    } else {
      const fresh = await InvestigationSession.findById(session._id);
      return fresh || session;
    }
    return session;
  },

  /** Throws unless the participant has a running, unexpired session and the event is LIVE. */
  assertActive(session, event) {
    if (!session) throw ApiError.notFound('No investigation session. Open the case file to begin.', 'SESSION_NOT_FOUND');
    if (session.status === SESSION_STATUS.DISQUALIFIED) throw ApiError.locked('The coordinator has ended this investigation after an integrity review.', 'SESSION_DISQUALIFIED');
    if (session.proctorLocked) throw ApiError.locked('Your session is on hold for an exam-integrity review. Raise your hand for the coordinator.', 'PROCTOR_LOCKED');
    if (session.status === SESSION_STATUS.COMPLETED) throw ApiError.conflict('The case is already closed.', 'SESSION_COMPLETED');
    if (session.status === SESSION_STATUS.TIME_EXPIRED) throw ApiError.locked('Time is up. The investigation session has expired.', 'SESSION_EXPIRED');
    switch (event.status) {
      case EVENT_STATES.LIVE:
        break;
      case EVENT_STATES.PAUSED:
        throw ApiError.locked('The coordinator has paused the investigation.', 'EVENT_PAUSED');
      case EVENT_STATES.ENDED:
      case EVENT_STATES.ARCHIVED:
        throw ApiError.locked('The investigation has ended.', 'EVENT_ENDED');
      default:
        throw ApiError.locked('The investigation has not started yet.', 'EVENT_NOT_STARTED');
    }
    if (isSessionExpired(session, event)) throw ApiError.locked('Time is up. The investigation session has expired.', 'SESSION_EXPIRED');
  },

  /** Context + active check (expiring the session first if its clock ran out). */
  async requireActive(user) {
    const ctx = await this.context(user);
    if (ctx.session) ctx.session = await this.expireIfNeeded(ctx.session, ctx.event);
    this.assertActive(ctx.session, ctx.event);
    return ctx;
  },

  /**
   * Atomic state change with optimistic concurrency.
   * `fn(doc, ctx)` mutates the freshly loaded document and returns a result;
   * return `{ skipSave: true, ... }` to finish without writing.
   */
  async mutate(sessionId, fn, { requireActive = true } = {}) {
    const config = await caseService.config();
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const event = await eventService.current({ fresh: attempt > 0 });
      const doc = await InvestigationSession.findById(sessionId);
      if (!doc) throw ApiError.notFound('Investigation session not found', 'SESSION_NOT_FOUND');
      if (requireActive) this.assertActive(doc, event);
      const result = await fn(doc, { config, event, now: new Date() });
      if (result && result.skipSave) return result;
      doc.lastActivityAt = new Date();
      try {
        await doc.save();
        return result;
      } catch (err) {
        if (err instanceof mongoose.Error.VersionError || err.name === 'VersionError') {
          logger.debug(`session ${sessionId}: version conflict, retry ${attempt + 1}`);
          // a short jittered pause so simultaneous writers stop colliding on every retry
          await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1) + Math.floor(Math.random() * 25)));
          continue;
        }
        throw err;
      }
    }
    throw ApiError.conflict('Another request changed this session at the same time. Please retry.', 'STALE_SESSION');
  },

  view(session, event, config) {
    return sessionView(session, event, config);
  },

  async touch(sessionId) {
    await InvestigationSession.updateOne({ _id: sessionId }, { $set: { lastActivityAt: new Date() } });
  },

  /* ------------------------------------------------ event-driven bulk ops */

  /** Freeze/shift: after a pause of `ms`, every ACTIVE session's deadline moves forward by the same amount. */
  async shiftActiveDeadlines(eventId, ms, reason) {
    if (!ms) return 0;
    const res = await InvestigationSession.updateMany(
      { event: eventId, status: SESSION_STATUS.ACTIVE },
      [{ $set: { expiresAt: { $add: ['$expiresAt', ms] }, pausedTotalMs: { $add: [{ $ifNull: ['$pausedTotalMs', 0] }, reason === 'pause' ? ms : 0] }, __v: { $add: ['$__v', 1] } } }],
    );
    return res.modifiedCount;
  },

  /** End of event: every ACTIVE session becomes TIME_EXPIRED. */
  async expireAll(eventId, reason = 'EVENT_ENDED') {
    const now = new Date();
    const active = await InvestigationSession.find({ event: eventId, status: SESSION_STATUS.ACTIVE }).select('_id participant startedAt pausedTotalMs').lean();
    if (!active.length) return 0;
    await InvestigationSession.bulkWrite(
      active.map((s) => ({
        updateOne: {
          filter: { _id: s._id, status: SESSION_STATUS.ACTIVE },
          update: { $set: { status: SESSION_STATUS.TIME_EXPIRED, expiredAt: now, elapsedMs: sessionElapsedMs(s, now.getTime()) }, $push: { timeline: { at: now, type: 'TIME_EXPIRED', note: reason } }, $inc: { __v: 1 } },
        },
      })),
    );
    for (const s of active) {
      emitToUser(s.participant, SOCKET_EVENTS.TIMER_EXPIRED, { sessionId: String(s._id), at: now.getTime(), reason });
      emitFeed(SOCKET_EVENTS.TIME_EXPIRED, { sessionId: String(s._id), participantId: String(s.participant), reason });
    }
    return active.length;
  },

  /** Watchdog: expire sessions whose own clock ran out while the participant was away. */
  async expireOverdue(event) {
    if (event.status !== EVENT_STATES.LIVE) return 0;
    const overdue = await InvestigationSession.find({ event: event._id, status: SESSION_STATUS.ACTIVE, expiresAt: { $lte: new Date() } }).select('_id participant status startedAt expiresAt pausedTotalMs').lean();
    let n = 0;
    for (const s of overdue) {
      // eslint-disable-next-line no-await-in-loop
      const after = await this.expireIfNeeded({ ...s, status: SESSION_STATUS.ACTIVE }, event);
      if (after.status === SESSION_STATUS.TIME_EXPIRED) n += 1;
    }
    return n;
  },

  remainingMs(session, event) {
    return sessionRemainingMs(session, event);
  },
};
