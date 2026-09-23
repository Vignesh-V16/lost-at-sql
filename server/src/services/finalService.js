import { InvestigationSession, SESSION_STATUS } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { validateFinal, deriveProgression, SCORE_TX, sessionRemainingMs, sessionElapsedMs } from '../engine/index.js';
import { sessionService } from './sessionService.js';
import { scoringService } from './scoringService.js';
import { outcomeService } from './outcomeService.js';
import { leaderboardService } from './leaderboardService.js';
import { auditService } from './auditService.js';
import { challengeService } from './challengeService.js';
import { challengeView, revealView, evidenceView } from '../serializers/participantView.js';
import { emitFeed, emitToUser, SOCKET_EVENTS } from '../sockets/emitters.js';

function finalOrThrow(config) {
  if (!config.finalFile || !config.finalChallenge) throw ApiError.notFound('This event has no final file configured.', 'FINAL_NOT_CONFIGURED');
  return { file: config.finalFile, challenge: config.finalChallenge };
}

/**
 * Final deduction (spec §16–17). Field-level feedback, no answers revealed,
 * −25 per wrong attempt, completion closes the session and freezes elapsed time.
 */
export const finalService = {
  async status(user) {
    const { config, event, session } = await sessionService.context(user);
    if (!session) throw ApiError.notFound('No investigation session.', 'SESSION_NOT_FOUND');
    const { file, challenge } = finalOrThrow(config);
    const progression = deriveProgression(config, session);
    const derived = progression.files.find((f) => f.code === file.code);
    const unlocked = progression.finalUnlocked || Boolean(file.forceUnlocked);
    const cp = session.challengeProgress(file.code, challenge.code);
    const maxAttempts = Number(event.finalAttemptPolicy?.maxAttempts) || 0;
    const view = {
      unlocked,
      file: { code: file.code, label: file.label, title: file.title, tables: [...(file.tables || [])], status: derived?.status || 'locked' },
      challenge: unlocked ? challengeView(challenge, derived?.challenges.find((c) => c.code === challenge.code)?.status || 'locked', cp, { fileCode: file.code }) : null,
      entities: config.entities,
      attempts: session.finalAttempts || 0,
      attemptsRemaining: maxAttempts ? Math.max(0, maxAttempts - (session.finalAttempts || 0)) : null,
      lastFields: session.finalSubmissions.length ? session.finalSubmissions[session.finalSubmissions.length - 1].fields : null,
      completed: session.status === SESSION_STATUS.COMPLETED,
      completedAt: session.completedAt || null,
      elapsedMs: session.status === SESSION_STATUS.COMPLETED ? session.elapsedMs : null,
      score: session.score,
      remainingMs: sessionRemainingMs(session, event),
      serverTime: Date.now(),
    };
    if (session.status === SESSION_STATUS.COMPLETED) view.reveal = revealView(event);
    return view;
  },

  /** Optional free query on the final file — same sandbox, no validation. */
  async query(user, sql, meta) {
    const { config } = await sessionService.context(user);
    const { file } = finalOrThrow(config);
    return challengeService.query(user, file.code, sql, meta);
  },

  async submit(user, answers = {}, { ip, requestId } = {}) {
    const { config, event, session } = await sessionService.requireActive(user);
    const { file, challenge } = finalOrThrow(config);
    const progression = deriveProgression(config, session);
    if (!progression.finalUnlocked && !file.forceUnlocked) throw ApiError.forbidden('Close all five case files before the final deduction.', 'FINAL_LOCKED');
    const maxAttempts = Number(event.finalAttemptPolicy?.maxAttempts) || 0;
    if (maxAttempts && (session.finalAttempts || 0) >= maxAttempts) throw ApiError.conflict('No final attempts remain.', 'ATTEMPTS_EXHAUSTED');

    const clean = {};
    for (const f of challenge.fields || []) clean[f.key] = answers[f.key] === undefined || answers[f.key] === null ? '' : String(answers[f.key]).slice(0, 200);
    /* an incomplete accusation is refused for free — it must not burn an attempt or points */
    const blank = (challenge.fields || []).filter((f) => !clean[f.key].trim());
    if (blank.length) throw ApiError.badRequest(`Answer every question before closing the case — still blank: ${blank.map((f) => f.label).join('; ')}`, { missing: blank.map((f) => f.key) });
    const verdict = validateFinal(challenge.validation.config, clean);
    const policy = scoringService.policyOf(event);

    const outcome = await sessionService.mutate(session._id, (doc, { now }) => {
      if (doc.finalCorrect || doc.status === SESSION_STATUS.COMPLETED) return { skipSave: true, already: true };
      if (maxAttempts && (doc.finalAttempts || 0) >= maxAttempts) throw ApiError.conflict('No final attempts remain.', 'ATTEMPTS_EXHAUSTED');
      doc.finalAttempts = (doc.finalAttempts || 0) + 1;
      const attemptNo = doc.finalAttempts;
      doc.finalSubmissions.push({ attemptNo, answers: clean, fields: verdict.fields, correct: verdict.correct, submittedAt: now });
      if (verdict.correct) {
        const applied = outcomeService.completeChallenge(doc, config, file, challenge, { now });
        const remainingMs = sessionRemainingMs(doc, event, now.getTime());
        scoringService.charge(doc, policy, SCORE_TX.TIME_BONUS, { key: 'final:time-bonus', remainingMs, ref: { file: file.code }, at: now });
        scoringService.charge(doc, policy, SCORE_TX.COMPLETION_BONUS, { key: 'final:completion-bonus', ref: { file: file.code }, at: now });
        doc.finalCorrect = true;
        doc.status = SESSION_STATUS.COMPLETED;
        doc.completedAt = now;
        doc.elapsedMs = sessionElapsedMs(doc, now.getTime());
        doc.timeline.push({ at: now, type: 'CASE_CLOSED', file: file.code });
        return { correct: true, attemptNo, evidenceAwarded: applied.evidenceAwarded, score: doc.score, elapsedMs: doc.elapsedMs };
      }
      const { tx, applied } = scoringService.charge(doc, policy, SCORE_TX.FINAL_WRONG, { key: `final:wrong:${attemptNo}`, ref: { file: file.code, attempt: attemptNo }, at: now });
      doc.timeline.push({ at: now, type: 'FINAL_WRONG', file: file.code });
      return { correct: false, attemptNo, penalty: applied ? -tx.delta : 0, score: doc.score };
    });

    if (outcome.already) {
      const fresh = await InvestigationSession.findById(session._id);
      return { correct: true, alreadyCompleted: true, fields: Object.fromEntries((challenge.fields || []).map((f) => [f.key, true])), issues: [], score: fresh.score, elapsedMs: fresh.elapsedMs, reveal: revealView(event), serverTime: Date.now() };
    }

    const base = { correct: outcome.correct, fields: verdict.fields, attemptNo: outcome.attemptNo, attemptsRemaining: maxAttempts ? Math.max(0, maxAttempts - outcome.attemptNo) : null, score: outcome.score, serverTime: Date.now() };
    if (outcome.correct) {
      await auditService.record({ actor: user, action: 'FINAL_SUBMITTED', target: file.code, meta: { correct: true, attemptNo: outcome.attemptNo }, ip, requestId });
      await auditService.record({ actor: user, action: 'CASE_CLOSED', target: String(session._id), meta: { score: outcome.score, elapsedMs: outcome.elapsedMs }, ip, requestId });
      emitFeed(SOCKET_EVENTS.FINAL_SUBMITTED, { sessionId: String(session._id), participantId: String(user._id), correct: true, attemptNo: outcome.attemptNo });
      emitFeed(SOCKET_EVENTS.PARTICIPANT_COMPLETED, { sessionId: String(session._id), participantId: String(user._id), score: outcome.score, elapsedMs: outcome.elapsedMs });
      for (const c of outcome.evidenceAwarded) emitFeed(SOCKET_EVENTS.EVIDENCE_DISCOVERED, { sessionId: String(session._id), participantId: String(user._id), evidence: c, via: challenge.code });
      await leaderboardService.upsertFromSessionId(session._id);
      emitToUser(user._id, SOCKET_EVENTS.SESSION_UPDATE, { score: outcome.score, reason: 'CASE_CLOSED', at: Date.now() });
      return {
        ...base,
        issues: [],
        message: challenge.successMessage || '',
        elapsedMs: outcome.elapsedMs,
        evidenceAwarded: outcome.evidenceAwarded.map((c) => evidenceView(config.evidenceByCode.get(c) || { code: c, title: c, summary: '' }, { discoveredAt: new Date() })),
        reveal: revealView(event),
      };
    }
    await auditService.record({ actor: user, action: 'FINAL_SUBMITTED', target: file.code, meta: { correct: false, attemptNo: outcome.attemptNo, wrongFields: Object.entries(verdict.fields).filter(([, v]) => !v).map(([k]) => k) }, ip, requestId });
    emitFeed(SOCKET_EVENTS.FINAL_SUBMITTED, { sessionId: String(session._id), participantId: String(user._id), correct: false, attemptNo: outcome.attemptNo });
    if (outcome.penalty) {
      emitFeed(SOCKET_EVENTS.SCORE_CHANGED, { sessionId: String(session._id), participantId: String(user._id), score: outcome.score, delta: -outcome.penalty, reason: 'FINAL_WRONG' });
      leaderboardService.scheduleUpsert(session._id);
    }
    emitToUser(user._id, SOCKET_EVENTS.SESSION_UPDATE, { score: outcome.score, reason: 'FINAL_WRONG', at: Date.now() });
    return {
      ...base,
      issues: verdict.issues,
      message: (challenge.failureMessage || '✗ Close, but re-check: {issues}.').replace('{issues}', verdict.issues.join(', ')),
      penalty: outcome.penalty,
    };
  },
};
