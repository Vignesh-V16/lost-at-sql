import { buildTransaction, normalizePolicy, verifyLedger, SCORE_TX } from '../engine/index.js';

/**
 * Scoring service — applies a ScoreTransaction to a session document in
 * memory (the caller persists the document atomically). The ledger key
 * makes every logical charge idempotent: re-applying the same key is a
 * no-op that returns the existing transaction.
 */
export const scoringService = {
  SCORE_TX,

  policyOf(event) {
    return normalizePolicy(event?.scoringPolicy);
  },

  /**
   * @param session   InvestigationSession document (mutated)
   * @param policy    scoring policy (event.scoringPolicy)
   * @param type      SCORE_TX.*
   * @param opts      { key, override, ref, remainingMs, amount, at }
   * @returns {{ tx: object, applied: boolean }}
   */
  charge(session, policy, type, { key, override, ref = {}, remainingMs, amount, at = new Date() }) {
    const existing = session.ledger.find((t) => t.key === key);
    if (existing) return { tx: existing, applied: false };
    const tx = buildTransaction(policy, session.score, type, { key, override, ref, remainingMs, amount, at });
    if (tx.delta === 0 && type !== SCORE_TX.INITIAL) {
      // Nothing to record (e.g. bonus disabled or already at the floor with a zero-effect penalty still counts — keep those).
      if (tx.rawDelta === 0) return { tx, applied: false };
    }
    session.ledger.push({ key: tx.key, type: tx.type, delta: tx.delta, rawDelta: tx.rawDelta, scoreBefore: tx.scoreBefore, scoreAfter: tx.scoreAfter, ref: tx.ref, at: tx.at });
    session.score = tx.scoreAfter;
    session.timeline.push({ at, type: 'SCORE_CHANGED', delta: tx.delta, challenge: ref.challenge, file: ref.file, note: type });
    return { tx, applied: true };
  },

  verify(session) {
    return verifyLedger(session.ledger, session.score);
  },
};
