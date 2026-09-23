import { QueryAttempt, InvestigationSession, DatabaseTable } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { guardSql } from '../utils/sqlGuard.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { validate, ResultSet, normalizeCell, deriveProgression, FILE_STATUS, CHALLENGE_STATUS, SCORE_TX, HINT_SCOPES, sessionRemainingMs } from '../engine/index.js';
import { sqlService, hashSql, hashResult } from './sqlService.js';
import { sessionService } from './sessionService.js';
import { scoringService } from './scoringService.js';
import { outcomeService } from './outcomeService.js';
import { leaderboardService } from './leaderboardService.js';
import { auditService } from './auditService.js';
import { fileView, evidenceView, queryAttemptView } from '../serializers/participantView.js';
import { emitFeed, emitToUser, SOCKET_EVENTS } from '../sockets/emitters.js';

const inFlight = new Map(); // sessionId → concurrent query count
const MAX_IN_FLIGHT = 2;

function fileUnlocked(derived, file) {
  return Boolean(file.forceUnlocked) || (derived && derived.status !== FILE_STATUS.LOCKED);
}

function unlockedOrThrow(config, session, code) {
  const file = config.byFile.get(String(code || '').toUpperCase());
  if (!file) throw ApiError.notFound('Case file not found', 'CASE_FILE_NOT_FOUND');
  const progression = deriveProgression(config, session || { files: [] });
  const derived = progression.files.find((f) => f.code === file.code);
  if (!fileUnlocked(derived, file)) throw ApiError.forbidden('This case file is still locked. Close the previous file first.', 'FILE_LOCKED');
  return { file, derived, progression };
}

function sqlErrorToApi(err) {
  if (err.code === 'SQL_TIMEOUT') return new ApiError(408, 'SQL_TIMEOUT', err.message);
  if (err.code === 'SQL_ENGINE_OFFLINE' || err.code === 'SQL_ENGINE_RESTART') return new ApiError(503, err.code, 'The query engine is restarting — try again in a moment.');
  return new ApiError(400, 'SQL_ERROR', err.message || 'SQL error');
}

async function recordAttempt(session, user, event, file, challenge, sql, outcome) {
  try {
    const doc = await QueryAttempt.create({
      session: session._id,
      participant: user._id,
      event: event._id,
      team: session.team || undefined,
      caseFile: file?.code,
      challenge: challenge?.code,
      sql,
      sqlHash: hashSql(sql),
      ...outcome,
    });
    return doc;
  } catch (err) {
    logger.warn('QueryAttempt write failed', err.message);
    return null;
  }
}

/** Passive evidence: definitions with a trigger cell appearing in a focused result set. */
function discoverPassive(config, session, result) {
  if (!result || result.rowCount === 0 || result.rowCount > env.EVIDENCE_MAX_ROWS) return [];
  const rs = new ResultSet(result);
  const found = [];
  for (const def of config.evidence) {
    const trig = def.passiveTrigger;
    if (!trig || !trig.column) continue;
    if (session.evidence.some((e) => e.code === def.code)) continue;
    if (!rs.hasColumn(trig.column)) continue;
    const target = normalizeCell(trig.value);
    if (rs.values(trig.column).includes(target)) found.push(def.code);
  }
  return found;
}

export const challengeService = {
  /* ------------------------------------------------------------- reads */

  async openFile(user, code) {
    const { config, event, session } = await sessionService.context(user);
    if (!session) throw ApiError.notFound('No investigation session. Open the case file to begin.', 'SESSION_NOT_FOUND');
    const { file, derived } = unlockedOrThrow(config, session, code);
    let sessionFile = session.fileProgress(file.code);
    if (session.status === 'active' && (!sessionFile || !sessionFile.openedAt)) {
      await sessionService.mutate(session._id, (doc, { now }) => {
        const fp = doc.fileProgress(file.code, { create: true });
        if (!fp.openedAt) {
          fp.openedAt = now;
          doc.timeline.push({ at: now, type: 'FILE_STARTED', file: file.code });
          for (const ch of file.challenges) doc.challengeProgress(file.code, ch.code, { create: true });
        }
        return { opened: true };
      }, { requireActive: false }).catch((err) => logger.debug(`openFile mutate skipped: ${err.code || err.message}`));
      emitFeed(SOCKET_EVENTS.FILE_STARTED, { sessionId: String(session._id), participantId: String(user._id), file: file.code });
      const fresh = await InvestigationSession.findById(session._id);
      sessionFile = fresh?.fileProgress(file.code) || sessionFile;
    }
    return fileView(file, derived, sessionFile);
  },

  /** Schema (columns + 5 sample rows) of the tables a file points at — or the whole dataset in `dataset` scope. */
  async schema(user, code) {
    const { config, event, session } = await sessionService.context(user);
    const { file } = unlockedOrThrow(config, session, code);
    const names = event.queryScope === 'allowedTables' || file.tables?.length ? file.tables : [];
    const filter = names.length ? { name: { $in: names } } : {};
    const tables = await DatabaseTable.find(filter).sort({ order: 1 }).lean();
    return tables.map((t) => ({
      name: t.name,
      description: t.description,
      columns: t.columns.map((c) => ({ name: c.name, type: c.type, isPrimary: Boolean(c.isPrimary) || (t.primaryKey || []).includes(c.name), references: c.references || null })),
      primaryKey: t.primaryKey || [],
      rowCount: t.rowCount,
      sample: { columns: t.columns.map((c) => c.name), rows: t.rows.slice(0, 5).map((r) => t.columns.map((c) => r[c.name] ?? null)) },
    }));
  },

  /* ------------------------------------------------------------- query */

  async query(user, code, sql, { ip, requestId } = {}) {
    const { config, event, session } = await sessionService.requireActive(user);
    const { file, derived } = unlockedOrThrow(config, session, code);
    const challengeCode = derived?.currentChallengeCode || file.challenges[file.challenges.length - 1]?.code;
    const challenge = file.challenges.find((c) => c.code === challengeCode) || null;

    const guard = guardSql(sql, { maxLength: event.queryPolicy?.maxLength || 4000 });
    if (!guard.ok) {
      await recordAttempt(session, user, event, file, challenge, String(sql || '').slice(0, 20000), { status: 'rejected', errorType: guard.code, errorMessage: guard.message, blockedReason: guard.code });
      await InvestigationSession.updateOne({ _id: session._id }, { $inc: { 'stats.queries': 1, 'stats.blocked': 1 }, $set: { 'stats.lastQueryAt': new Date(), lastActivityAt: new Date() } });
      await auditService.record({ actor: user, action: 'SQL_BLOCKED', target: file.code, meta: { code: guard.code }, ip, requestId });
      emitFeed(SOCKET_EVENTS.SQL_BLOCKED, { sessionId: String(session._id), participantId: String(user._id), file: file.code, reason: guard.code });
      throw new ApiError(400, guard.code, guard.message);
    }

    const key = String(session._id);
    if ((inFlight.get(key) || 0) >= MAX_IN_FLIGHT) throw new ApiError(429, 'TOO_MANY_QUERIES', 'Wait for your running query to finish.');
    inFlight.set(key, (inFlight.get(key) || 0) + 1);
    let result;
    try {
      result = await sqlService.execute(guard.sql, { maxRows: event.queryPolicy?.maxRows || env.QUERY_MAX_ROWS, timeoutMs: event.queryPolicy?.timeoutMs || env.QUERY_TIMEOUT_MS });
    } catch (err) {
      const status = err.code === 'SQL_TIMEOUT' ? 'timeout' : 'error';
      await recordAttempt(session, user, event, file, challenge, guard.sql, { status, errorType: err.code || 'SQL_ERROR', errorMessage: err.message });
      await InvestigationSession.updateOne({ _id: session._id }, { $inc: { 'stats.queries': 1, 'stats.failed': 1 }, $set: { 'stats.lastQueryAt': new Date(), lastActivityAt: new Date() } });
      emitFeed(SOCKET_EVENTS.QUERY_EXECUTED, { sessionId: String(session._id), participantId: String(user._id), file: file.code, challenge: challenge?.code, status });
      throw sqlErrorToApi(err);
    } finally {
      const n = (inFlight.get(key) || 1) - 1;
      if (n <= 0) inFlight.delete(key);
      else inFlight.set(key, n);
    }

    const attempt = await recordAttempt(session, user, event, file, challenge, guard.sql, {
      status: 'success',
      rowCount: result.rowCount,
      columns: result.columns,
      truncated: result.truncated,
      durationMs: result.durationMs,
      resultHash: hashResult(result),
    });
    await InvestigationSession.updateOne({ _id: session._id }, { $inc: { 'stats.queries': 1, 'stats.successful': 1 }, $set: { 'stats.lastQueryAt': new Date(), lastActivityAt: new Date() } });

    let newEvidence = [];
    const passive = discoverPassive(config, session, result);
    if (passive.length) {
      const awarded = await sessionService.mutate(session._id, (doc, { now }) => outcomeService.awardEvidence(doc, passive, { type: 'query', ref: attempt ? String(attempt._id) : '', file: file.code }, now));
      newEvidence = (awarded || []).map((c) => evidenceView(config.evidenceByCode.get(c), { discoveredAt: new Date() }));
      if (attempt && awarded?.length) await QueryAttempt.updateOne({ _id: attempt._id }, { $set: { evidenceDiscovered: awarded } });
      for (const c of awarded || []) emitFeed(SOCKET_EVENTS.EVIDENCE_DISCOVERED, { sessionId: String(session._id), participantId: String(user._id), evidence: c, via: 'query' });
    }

    emitFeed(SOCKET_EVENTS.QUERY_EXECUTED, { sessionId: String(session._id), participantId: String(user._id), file: file.code, challenge: challenge?.code, status: 'success', rowCount: result.rowCount, durationMs: result.durationMs });
    return {
      queryAttemptId: attempt ? String(attempt._id) : null,
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
      truncated: result.truncated,
      durationMs: result.durationMs,
      newEvidence,
      remainingMs: sessionRemainingMs(session, event),
      serverTime: Date.now(),
    };
  },

  /* -------------------------------------------------------------- hints */

  async useHint(user, code, hintId, { ip, requestId } = {}) {
    /* A hint this session already paid for is served free in any state —
       paused, over, time up, case closed — so its box comes back after a
       reload on a page that is otherwise readable. Only a new charge needs
       the live gate. */
    const ctx = await sessionService.context(user);
    if (!ctx.session) throw ApiError.notFound('No investigation session. Open the case file to begin.', 'SESSION_NOT_FOUND');
    const { config } = ctx;
    const { file, derived } = unlockedOrThrow(config, ctx.session, code);
    let challenge = null;
    let hint = null;
    for (const ch of file.challenges) {
      const h = (ch.hints || []).find((x) => String(x._id) === String(hintId) || x.code === String(hintId).toUpperCase());
      if (h) {
        challenge = ch;
        hint = h;
        break;
      }
    }
    if (!hint) throw ApiError.notFound('Hint not found', 'HINT_NOT_FOUND');
    const status = derived.challenges.find((c) => c.code === challenge.code)?.status;
    if (status === CHALLENGE_STATUS.LOCKED) throw ApiError.conflict('That part of the file is not open yet.', 'CHALLENGE_NOT_ACTIVE');
    const paid = ctx.session.challengeProgress(file.code, challenge.code)?.hintsUsed?.find((h) => String(h.hint) === String(hint._id));
    if (paid) return { hintId: String(hint._id), code: hint.code, challenge: challenge.code, text: hint.text, penaltyApplied: 0, alreadyUsed: true, score: ctx.session.score };
    if (status === CHALLENGE_STATUS.COMPLETED) throw ApiError.conflict('That part of the file is already closed — a hint cannot help it now.', 'CHALLENGE_CLOSED');
    const { event, session } = await sessionService.requireActive(user);
    const policy = scoringService.policyOf(event);

    const outcome = await sessionService.mutate(session._id, (doc, { now }) => {
      const fp = doc.fileProgress(file.code, { create: true });
      if (!fp.openedAt) fp.openedAt = now;
      const cp = doc.challengeProgress(file.code, challenge.code, { create: true });
      const already = cp.hintsUsed.find((h) => String(h.hint) === String(hint._id));
      if (already) return { skipSave: true, text: hint.text, charged: 0, already: true, score: doc.score };

      let charged = 0;
      const override = hint.penalty ?? undefined;
      if (policy.hintPenaltyScope === HINT_SCOPES.FILE) {
        if (!fp.hintCharged) {
          const { tx, applied } = scoringService.charge(doc, policy, SCORE_TX.HINT_USED, { key: `${file.code}:hint`, override, ref: { file: file.code, challenge: challenge.code, hint: hint.code }, at: now });
          charged = applied ? -tx.delta : 0;
          fp.hintCharged = true;
        }
      } else {
        const { tx, applied } = scoringService.charge(doc, policy, SCORE_TX.HINT_USED, { key: `${challenge.code}:hint:${hint.code}`, override, ref: { file: file.code, challenge: challenge.code, hint: hint.code }, at: now });
        charged = applied ? -tx.delta : 0;
      }
      cp.hintsUsed.push({ hint: hint._id, code: hint.code, usedAt: now, charged });
      doc.timeline.push({ at: now, type: 'HINT_USED', file: file.code, challenge: challenge.code, delta: -charged });
      return { text: hint.text, charged, already: false, score: doc.score };
    });

    if (!outcome.already) {
      await auditService.record({ actor: user, action: 'HINT_USED', target: `${file.code}/${challenge.code}/${hint.code}`, meta: { charged: outcome.charged }, ip, requestId });
      emitFeed(SOCKET_EVENTS.HINT_USED, { sessionId: String(session._id), participantId: String(user._id), file: file.code, challenge: challenge.code, hint: hint.code, charged: outcome.charged });
      if (outcome.charged) {
        emitFeed(SOCKET_EVENTS.SCORE_CHANGED, { sessionId: String(session._id), participantId: String(user._id), score: outcome.score, delta: -outcome.charged, reason: 'HINT_USED' });
        leaderboardService.scheduleUpsert(session._id);
      }
      emitToUser(user._id, SOCKET_EVENTS.SESSION_UPDATE, { score: outcome.score, reason: 'HINT_USED', at: Date.now() });
    }
    return { hintId: String(hint._id), code: hint.code, challenge: challenge.code, text: outcome.text, penaltyApplied: outcome.charged, alreadyUsed: outcome.already, score: outcome.score };
  },

  /* ------------------------------------------------------------- submit */

  /**
   * POST /cases/:code/submit  { queryAttemptId | sql, answer?, challengeCode? }
   * Re-executes the participant's SQL server-side, validates the result set,
   * then applies the outcome atomically.
   */
  async submit(user, code, body = {}, { ip, requestId } = {}) {
    const { config, event, session } = await sessionService.requireActive(user);
    const { file, derived } = unlockedOrThrow(config, session, code);
    const wantedCode = body.challengeCode ? String(body.challengeCode).toUpperCase() : derived.currentChallengeCode;
    const challenge = file.challenges.find((c) => c.code === wantedCode) || null;
    if (!challenge) {
      if (derived.status === FILE_STATUS.COMPLETED) return this.alreadyCompleted(session, event, config, file, file.challenges[file.challenges.length - 1]);
      throw ApiError.conflict('There is no open challenge in this file.', 'CHALLENGE_NOT_ACTIVE');
    }
    if (challenge.kind === 'FINAL_DEDUCTION') throw ApiError.badRequest('Submit the final deduction through /final/submit', 'USE_FINAL_SUBMIT');
    const status = derived.challenges.find((c) => c.code === challenge.code)?.status;
    if (status === CHALLENGE_STATUS.COMPLETED) return this.alreadyCompleted(session, event, config, file, challenge);
    if (status !== CHALLENGE_STATUS.ACTIVE) throw ApiError.conflict('That part of the file is not open yet.', 'CHALLENGE_NOT_ACTIVE');
    const maxAttempts = Number(challenge.attemptPolicy?.maxAttempts) || 0;
    const cpNow = session.challengeProgress(file.code, challenge.code);
    if (maxAttempts && (cpNow?.attempts || 0) >= maxAttempts) throw ApiError.conflict('No attempts remain for this file.', 'ATTEMPTS_EXHAUSTED');

    /* resolve the SQL to validate */
    let sql = null;
    let attemptId = null;
    if (body.queryAttemptId) {
      const attempt = await QueryAttempt.findOne({ _id: body.queryAttemptId, session: session._id }).lean();
      if (!attempt) throw ApiError.notFound('That query does not belong to this session.', 'QUERY_ATTEMPT_NOT_FOUND');
      if (attempt.status !== 'success') throw ApiError.badRequest('Only a successful query can be submitted as a finding.', 'QUERY_ATTEMPT_FAILED');
      sql = attempt.sql;
      attemptId = attempt._id;
    } else if (typeof body.sql === 'string' && body.sql.trim()) {
      const guard = guardSql(body.sql, { maxLength: event.queryPolicy?.maxLength || 4000 });
      if (!guard.ok) throw new ApiError(400, guard.code, guard.message);
      sql = guard.sql;
    } else {
      throw ApiError.badRequest('Run a query first, then submit its result as your finding.', 'QUERY_REQUIRED');
    }

    let result;
    try {
      result = await sqlService.execute(sql, { maxRows: event.queryPolicy?.maxRows || env.QUERY_MAX_ROWS, timeoutMs: event.queryPolicy?.timeoutMs || env.QUERY_TIMEOUT_MS });
    } catch (err) {
      throw sqlErrorToApi(err);
    }
    const resultSet = new ResultSet(result);
    const verdict = validate(challenge.validation, { result: resultSet, answer: body.answer, sql, evidence: new Set(session.evidence.map((e) => e.code)) });
    const policy = scoringService.policyOf(event);

    const outcome = await sessionService.mutate(session._id, (doc, { now }) => {
      const progression = deriveProgression(config, doc);
      const st = progression.files.find((f) => f.code === file.code)?.challenges.find((c) => c.code === challenge.code)?.status;
      if (st === CHALLENGE_STATUS.COMPLETED) return { skipSave: true, already: true };
      if (st !== CHALLENGE_STATUS.ACTIVE) throw ApiError.conflict('That part of the file is not open yet.', 'CHALLENGE_NOT_ACTIVE');
      if (verdict.correct) {
        const applied = outcomeService.completeChallenge(doc, config, file, challenge, { resultSet, queryAttemptId: attemptId, sql, now });
        return { correct: true, ...applied, score: doc.score };
      }
      if (!verdict.penalize) {
        // Not a finding yet (missing column, gate not open, answer not given): the prototype
        // showed a message instead of a Submit button — no attempt is recorded, nothing is charged.
        const existing = doc.challengeProgress(file.code, challenge.code);
        return { skipSave: true, correct: false, soft: true, penalty: 0, attempts: existing?.attempts || 0, wrongAttempts: existing?.wrongAttempts || 0, score: doc.score };
      }
      const cp = outcomeService.recordWrongAttempt(doc, file, challenge, now);
      let penalty = 0;
      if (verdict.penalize) {
        const { tx, applied } = scoringService.charge(doc, policy, SCORE_TX.WRONG_SUBMISSION, {
          key: `${challenge.code}:wrong:${cp.wrongAttempts}`,
          override: challenge.attemptPolicy?.wrongPenaltyOverride ?? undefined,
          ref: { file: file.code, challenge: challenge.code, attempt: cp.wrongAttempts },
          at: now,
        });
        penalty = applied ? -tx.delta : 0;
      }
      return { correct: false, penalty, attempts: cp.attempts, wrongAttempts: cp.wrongAttempts, score: doc.score };
    });

    if (outcome.already) return this.alreadyCompleted(session, event, config, file, challenge);

    const fresh = await InvestigationSession.findById(session._id);
    const remainingMs = sessionRemainingMs(fresh, event);
    const base = { correct: outcome.correct, reason: verdict.reason, score: outcome.score, remainingMs, serverTime: Date.now(), challenge: challenge.code, file: file.code };

    if (outcome.correct) {
      await auditService.record({ actor: user, action: 'CHALLENGE_COMPLETED', target: `${file.code}/${challenge.code}`, meta: { evidence: outcome.evidenceAwarded }, ip, requestId });
      for (const c of outcome.evidenceAwarded) emitFeed(SOCKET_EVENTS.EVIDENCE_DISCOVERED, { sessionId: String(session._id), participantId: String(user._id), evidence: c, via: challenge.code });
      if (outcome.fileCompleted) emitFeed(SOCKET_EVENTS.FILE_COMPLETED, { sessionId: String(session._id), participantId: String(user._id), file: file.code, filesCompleted: outcome.progression.completedCount });
      leaderboardService.scheduleUpsert(session._id);
      emitToUser(user._id, SOCKET_EVENTS.SESSION_UPDATE, { score: outcome.score, reason: 'CHALLENGE_COMPLETED', file: file.code, challenge: challenge.code, at: Date.now() });
      const nextFile = outcome.progression.files.find((f) => f.status === FILE_STATUS.AVAILABLE && f.code !== file.code) || null;
      return {
        ...base,

        message: challenge.successMessage || '',
        successLabel: challenge.successLabel || '',
        fileCompleted: outcome.fileCompleted,
        nextChallengeCode: outcome.progression.files.find((f) => f.code === file.code)?.currentChallengeCode || null,
        unlockedFileCode: outcome.fileCompleted ? outcome.progression.currentFileCode : null,
        nextFileCode: nextFile?.code || outcome.progression.currentFileCode || null,
        finalUnlocked: outcome.progression.finalUnlocked,
        evidenceAwarded: outcome.evidenceAwarded.map((c) => evidenceView(config.evidenceByCode.get(c) || { code: c, title: c, summary: '' }, { discoveredAt: new Date() })),
        transitions: outcome.transitions,
        connections: outcome.connections,
        suspects: fresh ? sessionService.view(fresh, event, config).suspects : [],
      };
    }

    if (!outcome.soft) await auditService.record({ actor: user, action: 'WRONG_SUBMISSION', target: `${file.code}/${challenge.code}`, meta: { reason: verdict.reason, penalty: outcome.penalty }, ip, requestId });
    if (outcome.penalty) {
      emitFeed(SOCKET_EVENTS.SCORE_CHANGED, { sessionId: String(session._id), participantId: String(user._id), score: outcome.score, delta: -outcome.penalty, reason: 'WRONG_SUBMISSION' });
      leaderboardService.scheduleUpsert(session._id);
    }
    if (!outcome.soft) emitToUser(user._id, SOCKET_EVENTS.SESSION_UPDATE, { score: outcome.score, reason: 'WRONG_SUBMISSION', at: Date.now() });
    return {
      ...base,
      soft: Boolean(outcome.soft),
      message: verdict.message || challenge.failureMessage || 'Not quite.',
      penalty: outcome.penalty,
      attempts: outcome.attempts,
      attemptsRemaining: maxAttempts ? Math.max(0, maxAttempts - outcome.attempts) : null,
      needsAnswer: verdict.reason === 'ANSWER_REQUIRED',
      gateOpen: challenge.kind === 'RESULT_SET_THEN_BOOLEAN' && verdict.reason !== 'PRIOR_RESULT_REQUIRED' && verdict.reason !== 'MISSING_COLUMN' && verdict.reason !== 'NO_RESULT',
    };
  },

  alreadyCompleted(session, event, config, file, challenge) {
    const cp = session.challengeProgress(file.code, challenge.code);
    return {
      correct: true,
      alreadyCompleted: true,
      reason: 'ALREADY_COMPLETED',
      score: session.score,
      remainingMs: sessionRemainingMs(session, event),
      serverTime: Date.now(),
      challenge: challenge.code,
      file: file.code,
      message: challenge.successMessage || '',
      completedAt: cp?.completedAt || null,
    };
  },

  /* ------------------------------------------------------------ history */

  async history(user, { limit = 50 } = {}) {
    const { event, session } = await sessionService.context(user);
    if (!session) return [];
    if (event.exposeQueryHistory === false) throw ApiError.forbidden('Query history is disabled for this event.', 'HISTORY_DISABLED');
    const rows = await QueryAttempt.find({ session: session._id }).sort({ executedAt: -1 }).limit(Math.min(Number(limit) || 50, 200)).lean();
    return rows.map(queryAttemptView);
  },

  async recent({ limit = 100, status, session, challenge, since } = {}) {
    const filter = {};
    if (status) filter.status = status;
    if (session) filter.session = session;
    if (challenge) filter.challenge = String(challenge).toUpperCase();
    if (since) filter.executedAt = { $gte: new Date(since) };
    const rows = await QueryAttempt.find(filter).sort({ executedAt: -1 }).limit(Math.min(Number(limit) || 100, 500)).populate('participant', 'username displayName').lean();
    return rows.map((r) => ({ ...queryAttemptView(r), participant: r.participant ? { id: String(r.participant._id), username: r.participant.username, displayName: r.participant.displayName } : null, sessionId: String(r.session), sqlHash: r.sqlHash, resultHash: r.resultHash || null, blockedReason: r.blockedReason || null }));
  },
};
