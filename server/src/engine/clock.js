/**
 * Clocks — pure arithmetic over persisted timestamps (spec §6, §41).
 *
 * Event clock:   startedAt, pausedAt, pausedTotalMs, extendedMs, durationMinutes, status
 * Session clock: startedAt, expiresAt (shifted by the service whenever the event is paused/extended)
 *
 * Never store remainingSeconds. Everything is derived from `now`.
 */
import { EVENT_STATES } from './eventStateMachine.js';

export const SESSION_STATUS = Object.freeze({
  ACTIVE: 'active',
  COMPLETED: 'completed',
  TIME_EXPIRED: 'time_expired',
  /** ended by the coordinator after an integrity review; progress is kept, the leaderboard is not */
  DISQUALIFIED: 'disqualified',
});

const ms = (d) => (d ? new Date(d).getTime() : null);

export function eventTotalMs(event) {
  return (Number(event.durationMinutes) || 0) * 60000 + (Number(event.extendedMs) || 0);
}

export function eventElapsedMs(event, now = Date.now()) {
  const start = ms(event.startedAt);
  if (!start) return 0;
  let paused = Number(event.pausedTotalMs) || 0;
  if (event.status === EVENT_STATES.PAUSED && event.pausedAt) paused += Math.max(0, now - ms(event.pausedAt));
  if ((event.status === EVENT_STATES.ENDED || event.status === EVENT_STATES.ARCHIVED) && event.endedAt) {
    return Math.max(0, Math.min(ms(event.endedAt), now) - start - paused);
  }
  return Math.max(0, now - start - paused);
}

export function eventRemainingMs(event, now = Date.now()) {
  if (event.status === EVENT_STATES.ENDED || event.status === EVENT_STATES.ARCHIVED) return 0;
  if (!event.startedAt || [EVENT_STATES.DRAFT, EVENT_STATES.READY, EVENT_STATES.SCHEDULED].includes(event.status)) return eventTotalMs(event);
  return Math.max(0, eventTotalMs(event) - eventElapsedMs(event, now));
}

export function eventTimerState(event, now = Date.now()) {
  return {
    status: event.status,
    totalMs: eventTotalMs(event),
    elapsedMs: eventElapsedMs(event, now),
    remainingMs: eventRemainingMs(event, now),
    startedAt: event.startedAt || null,
    pausedAt: event.pausedAt || null,
    endedAt: event.endedAt || null,
    startsAt: event.startsAt || null,
    serverTime: now,
  };
}

/** While the event is paused the session clock is frozen at the moment of the pause. */
export function sessionEffectiveNow(event, now = Date.now()) {
  if (event && event.status === EVENT_STATES.PAUSED && event.pausedAt) return Math.min(now, ms(event.pausedAt));
  return now;
}

/**
 * Remaining investigation time for one session: the smaller of the
 * session's own deadline and the event's deadline.
 */
export function sessionRemainingMs(session, event, now = Date.now()) {
  if (!session || !session.expiresAt) return 0;
  if (session.status !== SESSION_STATUS.ACTIVE) return 0;
  const own = ms(session.expiresAt) - sessionEffectiveNow(event, now);
  const ev = event ? eventRemainingMs(event, now) : own;
  return Math.max(0, Math.min(own, ev));
}

export function isSessionExpired(session, event, now = Date.now()) {
  if (!session || session.status !== SESSION_STATUS.ACTIVE) return false;
  if (event && (event.status === EVENT_STATES.ENDED || event.status === EVENT_STATES.ARCHIVED)) return true;
  return sessionRemainingMs(session, event, now) <= 0;
}

export function sessionElapsedMs(session, now = Date.now()) {
  const start = ms(session.startedAt);
  if (!start) return 0;
  const end = session.completedAt ? ms(session.completedAt) : now;
  return Math.max(0, end - start - (Number(session.pausedTotalMs) || 0));
}

export function computeExpiresAt(startedAt, durationMinutes) {
  return new Date(ms(startedAt) + (Number(durationMinutes) || 0) * 60000);
}

export function formatClock(msValue) {
  const total = Math.max(0, Math.floor(msValue / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
