import { sessionService } from './sessionService.js';
import { auditService } from './auditService.js';
import { emitFeed, emitToUser, SOCKET_EVENTS } from '../sockets/emitters.js';
import { ApiError } from '../utils/ApiError.js';
import { VIOLATION_WEIGHTS, proctorPolicy } from '../engine/proctor.js';
import { SESSION_STATUS } from '../engine/index.js';
import { leaderboardService } from './leaderboardService.js';

/*
 * proctorService — the exam-integrity record for one investigation.
 *
 * The browser can *detect* that a participant left the page, opened a
 * context menu or tried to paste; it cannot stop someone reading a second
 * device, and a determined participant can disable the client checks. So
 * this is a record, not a wall: every flag is stored on the session, shown
 * live to the coordinator, and kept for the post-event review. Only when a
 * coordinator opts in (`proctoring.maxViolations` > 0 with onLimit 'lock')
 * does it act on its own.
 */

/** Serious enough to write to the audit log, not just the session. */
const AUDITED = new Set(['FULLSCREEN_EXIT', 'DEVTOOLS_KEY', 'PASTE', 'MULTI_SESSION', 'PRINT']);

const MAX_STORED = 300; // keep the session document bounded; counts stay exact
const DEDUPE_MS = 900; // a client that fires the same flag twice in a tick counts once

export const proctorService = {
  /**
   * Record one flag. Never throws on a locked session — the point is to keep
   * recording — but it does require a session that has actually started.
   */
  async record(user, { type, durationMs = 0, file = '', meta = {} } = {}, { ip, requestId } = {}) {
    const kind = String(type || '').toUpperCase();
    if (!(kind in VIOLATION_WEIGHTS)) throw ApiError.badRequest(`Unknown proctor flag ${kind}`, 'PROCTOR_TYPE');
    const { session, event } = await sessionService.context(user);
    if (!session) throw ApiError.notFound('No investigation session.', 'SESSION_NOT_FOUND');
    const policy = proctorPolicy(event);
    if (!policy.enabled) return { recorded: false, violations: session.violationCount || 0, locked: false };

    const weight = VIOLATION_WEIGHTS[kind];
    const away = Math.max(0, Math.min(Number(durationMs) || 0, 6 * 60 * 60 * 1000));

    const outcome = await sessionService.mutate(
      session._id,
      (doc, { now }) => {
        const last = doc.violations[doc.violations.length - 1];
        if (last && last.type === kind && now - new Date(last.at).getTime() < DEDUPE_MS) {
          return { skipSave: true, deduped: true, violations: doc.violationCount || 0, locked: Boolean(doc.proctorLocked) };
        }
        doc.violations.push({ type: kind, at: now, file: String(file || '').slice(0, 24), durationMs: away, meta });
        if (doc.violations.length > MAX_STORED) doc.violations.splice(0, doc.violations.length - MAX_STORED);
        doc.violationCount = (doc.violationCount || 0) + weight;
        doc.awayMs = (doc.awayMs || 0) + away;
        let locked = Boolean(doc.proctorLocked);
        if (!locked && policy.maxViolations > 0 && policy.onLimit === 'lock' && doc.violationCount >= policy.maxViolations) {
          doc.proctorLocked = true;
          doc.proctorLockedAt = now;
          locked = true;
          doc.timeline.push({ at: now, type: 'PROCTOR_LOCKED', note: `${doc.violationCount} flags` });
        }
        return { violations: doc.violationCount, awayMs: doc.awayMs, locked, weight };
      },
      { requireActive: false }, // a paused or finished session still records
    );

    if (outcome.deduped) return { recorded: false, violations: outcome.violations, locked: outcome.locked };

    emitFeed(SOCKET_EVENTS.PROCTOR_FLAG, {
      sessionId: String(session._id),
      participantId: String(user._id),
      displayName: user.displayName,
      type: kind,
      at: Date.now(),
      durationMs: away,
      file,
      violations: outcome.violations,
      locked: outcome.locked,
    });
    if (AUDITED.has(kind) || outcome.locked) {
      await auditService.record({ actor: user, action: outcome.locked ? 'PROCTOR_LOCKED' : 'PROCTOR_FLAG', target: kind, meta: { violations: outcome.violations, durationMs: away, file }, ip, requestId });
    }
    if (outcome.locked) emitToUser(user._id, SOCKET_EVENTS.SESSION_UPDATE, { reason: 'PROCTOR_LOCKED', at: Date.now() });

    return {
      recorded: true,
      violations: outcome.violations,
      awayMs: outcome.awayMs,
      locked: outcome.locked,
      warn: policy.warnLimit > 0 && outcome.violations >= policy.warnLimit,
      limit: policy.maxViolations,
    };
  },

  /**
   * End an investigation after an integrity review. The work is kept — every
   * solved file, the score and the whole flag record stay on the session for
   * the appeal — but the session is closed to further action and drops off
   * the leaderboard. A reason is required: the participant is shown it.
   */
  async disqualify(sessionId, reason, actor, { ip, requestId } = {}) {
    const text = String(reason || '').trim();
    if (text.length < 3) throw ApiError.badRequest('Give a reason — the participant is shown it.', 'REASON_REQUIRED');
    const outcome = await sessionService.mutate(
      sessionId,
      (doc, { now }) => {
        if (doc.status === SESSION_STATUS.DISQUALIFIED) return { skipSave: true, already: true, participant: doc.participant, score: doc.score };
        doc.status = SESSION_STATUS.DISQUALIFIED;
        doc.disqualifiedAt = now;
        doc.disqualifiedReason = text.slice(0, 300);
        doc.disqualifiedBy = actor?._id;
        doc.proctorLocked = false; // the hold is superseded by the decision
        doc.timeline.push({ at: now, type: 'DISQUALIFIED', note: text.slice(0, 120) });
        return { participant: doc.participant, score: doc.score, violations: doc.violationCount || 0 };
      },
      { requireActive: false },
    );
    if (!outcome.already) {
      await leaderboardService.remove(sessionId);
      await auditService.record({ actor, action: 'SESSION_DISQUALIFIED', target: String(sessionId), meta: { reason: text, violations: outcome.violations }, ip, requestId });
      emitFeed(SOCKET_EVENTS.PROCTOR_FLAG, { sessionId: String(sessionId), participantId: String(outcome.participant), type: 'DISQUALIFIED', reason: text, at: Date.now() });
      emitToUser(outcome.participant, SOCKET_EVENTS.SESSION_UPDATE, { reason: 'DISQUALIFIED', at: Date.now() });
    }
    return { disqualified: true, alreadyDisqualified: Boolean(outcome.already), reason: text };
  },

  /** Undo a disqualification — the session becomes active again with its work intact. */
  async reinstate(sessionId, actor, { ip, requestId } = {}) {
    const outcome = await sessionService.mutate(
      sessionId,
      (doc, { now }) => {
        if (doc.status !== SESSION_STATUS.DISQUALIFIED) return { skipSave: true, notDisqualified: true, participant: doc.participant };
        doc.status = doc.finalCorrect ? SESSION_STATUS.COMPLETED : SESSION_STATUS.ACTIVE;
        doc.disqualifiedAt = undefined;
        doc.disqualifiedReason = '';
        doc.disqualifiedBy = undefined;
        doc.timeline.push({ at: now, type: 'REINSTATED', note: '' });
        return { participant: doc.participant, status: doc.status };
      },
      { requireActive: false },
    );
    if (outcome.notDisqualified) throw ApiError.conflict('That session is not disqualified.', 'NOT_DISQUALIFIED');
    leaderboardService.scheduleUpsert(sessionId);
    await auditService.record({ actor, action: 'SESSION_REINSTATED', target: String(sessionId), ip, requestId });
    emitToUser(outcome.participant, SOCKET_EVENTS.SESSION_UPDATE, { reason: 'REINSTATED', at: Date.now() });
    return { disqualified: false, status: outcome.status };
  },

  /** Coordinator clears a lock (and optionally the count) after talking to the participant. */
  async unlock(sessionId, { reset = false } = {}, actor) {
    const outcome = await sessionService.mutate(
      sessionId,
      (doc, { now }) => {
        doc.proctorLocked = false;
        doc.proctorLockedAt = undefined;
        if (reset) {
          doc.violationCount = 0;
          doc.awayMs = 0;
        }
        doc.timeline.push({ at: now, type: 'PROCTOR_UNLOCKED', note: reset ? 'count reset' : '' });
        return { violations: doc.violationCount, participant: doc.participant };
      },
      { requireActive: false },
    );
    await auditService.record({ actor, action: 'PROCTOR_UNLOCKED', target: String(sessionId), meta: { reset } });
    emitToUser(outcome.participant, SOCKET_EVENTS.SESSION_UPDATE, { reason: 'PROCTOR_UNLOCKED', at: Date.now() });
    return { locked: false, violations: outcome.violations };
  },
};
