import mongoose from 'mongoose';
import { InvestigationSession, QueryAttempt, Leaderboard, IdempotencyKey, AuditLog, Team, User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { auditService } from './auditService.js';
import { eventService } from './eventService.js';
import { datasetService } from './datasetService.js';
import { leaderboardService } from './leaderboardService.js';
import { emitToUser, emitToAll, SOCKET_EVENTS } from '../sockets/emitters.js';

export const RESET_MODES = Object.freeze({
  RESET_EVENT: 'RESET_EVENT',
  RESET_PARTICIPANT: 'RESET_PARTICIPANT',
  RESET_TEAM: 'RESET_TEAM',
  RESET_LEADERBOARD: 'RESET_LEADERBOARD',
  RESET_INVESTIGATION_DATA: 'RESET_INVESTIGATION_DATA',
});

/** Runs `fn(session)` inside a transaction when the deployment supports them (replica set); otherwise plainly. */
async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    try {
      await session.withTransaction(async () => {
        result = await fn(session);
      });
    } catch (err) {
      // Standalone mongod: transactions unsupported → run without one.
      if (/Transaction numbers are only allowed|replica set|IllegalOperation/i.test(err.message || '')) {
        result = await fn(null);
      } else {
        throw err;
      }
    }
    return result;
  } finally {
    await session.endSession();
  }
}

async function removeSessions(filter, mongoSession) {
  const sessions = await InvestigationSession.find(filter).select('_id participant').lean();
  const ids = sessions.map((s) => s._id);
  if (!ids.length) return { sessions: 0, attempts: 0 };
  const opts = mongoSession ? { session: mongoSession } : {};
  const [attempts] = await Promise.all([
    QueryAttempt.deleteMany({ session: { $in: ids } }, opts),
    Leaderboard.deleteMany({ session: { $in: ids } }, opts),
    IdempotencyKey.deleteMany({ user: { $in: sessions.map((s) => s.participant) } }, opts),
    InvestigationSession.deleteMany({ _id: { $in: ids } }, opts),
  ]);
  for (const s of sessions) emitToUser(s.participant, SOCKET_EVENTS.SESSION_RESET, { at: Date.now() });
  return { sessions: ids.length, attempts: attempts.deletedCount };
}

/**
 * Explicit, audited reset workflow (spec §33). Every mode documents the
 * collections it touches; nothing else is deleted.
 */
export const resetService = {
  RESET_MODES,

  async run({ mode, target, confirm }, actor, { ip, requestId } = {}) {
    const event = await eventService.current({ fresh: true });
    if (!Object.values(RESET_MODES).includes(mode)) throw ApiError.badRequest(`Unknown reset mode ${mode}`);
    if (confirm !== event.slug && confirm !== 'RESET') throw ApiError.badRequest(`Confirm the reset by passing confirm="${event.slug}"`, 'RESET_CONFIRMATION_REQUIRED');

    let summary;
    switch (mode) {
      case RESET_MODES.RESET_EVENT: {
        summary = await withTransaction((s) => removeSessions({ event: event._id }, s));
        await Leaderboard.deleteMany({ event: event._id });
        await eventService.resetClock(actor);
        emitToAll(SOCKET_EVENTS.SESSION_RESET, { at: Date.now(), scope: 'event' });
        break;
      }
      case RESET_MODES.RESET_PARTICIPANT: {
        if (!target) throw ApiError.badRequest('target participant id required');
        const user = await User.findById(target);
        if (!user || user.role !== 'participant') throw ApiError.notFound('Participant not found', 'PARTICIPANT_NOT_FOUND');
        summary = await withTransaction((s) => removeSessions({ event: event._id, participant: user._id }, s));
        await leaderboardService.rerank();
        break;
      }
      case RESET_MODES.RESET_TEAM: {
        if (!target) throw ApiError.badRequest('target team id required');
        const team = await Team.findById(target);
        if (!team) throw ApiError.notFound('Team not found', 'TEAM_NOT_FOUND');
        const members = await User.find({ team: team._id, role: 'participant' }).select('_id').lean();
        summary = await withTransaction((s) => removeSessions({ event: event._id, participant: { $in: members.map((m) => m._id) } }, s));
        await leaderboardService.rerank();
        break;
      }
      case RESET_MODES.RESET_LEADERBOARD: {
        const res = await Leaderboard.deleteMany({ event: event._id });
        const rebuilt = await leaderboardService.recomputeAll();
        summary = { removed: res.deletedCount, rebuilt };
        break;
      }
      case RESET_MODES.RESET_INVESTIGATION_DATA: {
        const tables = await datasetService.reset(actor, { dataset: event.dataset });
        summary = { tables };
        break;
      }
      default:
        throw ApiError.badRequest('Unknown reset mode');
    }
    await auditService.record({ actor, action: mode, target: target ? String(target) : 'event', meta: summary, ip, requestId });
    logger.warn(`${mode} by ${actor?.username || 'system'} → ${JSON.stringify(summary)}`);
    return { mode, ...summary };
  },

  /** Wipes the audit log — only reachable from the seed CLI, never from the API. */
  async clearAuditLog() {
    return AuditLog.collection.deleteMany({});
  },
};
