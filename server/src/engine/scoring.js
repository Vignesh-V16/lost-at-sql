/**
 * Scoring engine — pure arithmetic over a ScoringPolicy.
 *
 * Defaults reproduce the prototype exactly: start at 1000, −25 per wrong
 * finding, −50 per hint (charged once per FILE — the prototype keyed
 * `hintsUsed` by round id, so FILE 04's two hints share one charge), −25 per
 * wrong final submission, floor at 0, no bonuses.
 *
 * Every change is expressed as a ScoreTransaction { type, delta, scoreBefore,
 * scoreAfter, ref, key }. `delta` is the *effective* delta after the floor,
 * so folding the ledger always reproduces the score exactly.
 */
import { EngineError } from './errors.js';

export const SCORE_TX = Object.freeze({
  INITIAL: 'INITIAL',
  WRONG_SUBMISSION: 'WRONG_SUBMISSION',
  HINT_USED: 'HINT_USED',
  FINAL_WRONG: 'FINAL_WRONG',
  TIME_BONUS: 'TIME_BONUS',
  COMPLETION_BONUS: 'COMPLETION_BONUS',
  COORDINATOR_ADJUST: 'COORDINATOR_ADJUST',
});

export const HINT_SCOPES = Object.freeze({ FILE: 'file', HINT: 'hint' });

export const DEFAULT_SCORING_POLICY = Object.freeze({
  initialScore: 1000,
  wrongAnswerPenalty: 25,
  hintPenalty: 50,
  hintPenaltyScope: HINT_SCOPES.FILE,
  finalAttemptPenalty: 25,
  timeBonus: Object.freeze({ enabled: false, perMinuteRemaining: 0, max: 0 }),
  completionBonus: 0,
  minimumScore: 0,
});

const nonNeg = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function normalizePolicy(policy = {}) {
  const p = policy && typeof policy.toObject === 'function' ? policy.toObject() : policy || {};
  const tb = p.timeBonus || {};
  return {
    initialScore: nonNeg(p.initialScore, DEFAULT_SCORING_POLICY.initialScore),
    wrongAnswerPenalty: nonNeg(p.wrongAnswerPenalty, DEFAULT_SCORING_POLICY.wrongAnswerPenalty),
    hintPenalty: nonNeg(p.hintPenalty, DEFAULT_SCORING_POLICY.hintPenalty),
    hintPenaltyScope: p.hintPenaltyScope === HINT_SCOPES.HINT ? HINT_SCOPES.HINT : HINT_SCOPES.FILE,
    finalAttemptPenalty: nonNeg(p.finalAttemptPenalty, DEFAULT_SCORING_POLICY.finalAttemptPenalty),
    timeBonus: {
      enabled: Boolean(tb.enabled),
      perMinuteRemaining: nonNeg(tb.perMinuteRemaining, 0),
      max: nonNeg(tb.max, 0),
    },
    completionBonus: nonNeg(p.completionBonus, 0),
    minimumScore: Number.isFinite(Number(p.minimumScore)) ? Number(p.minimumScore) : 0,
  };
}

/**
 * Raw (pre-floor) delta for a transaction type.
 * `override` lets a challenge/hint carry its own penalty; `remainingMs` feeds the time bonus.
 */
export function computeDelta(policy, type, { override, remainingMs = 0, amount } = {}) {
  const p = normalizePolicy(policy);
  const has = (v) => v !== undefined && v !== null && Number.isFinite(Number(v));
  switch (type) {
    case SCORE_TX.INITIAL:
      return p.initialScore;
    case SCORE_TX.WRONG_SUBMISSION:
      return -(has(override) ? Number(override) : p.wrongAnswerPenalty);
    case SCORE_TX.HINT_USED:
      return -(has(override) ? Number(override) : p.hintPenalty);
    case SCORE_TX.FINAL_WRONG:
      return -(has(override) ? Number(override) : p.finalAttemptPenalty);
    case SCORE_TX.TIME_BONUS: {
      if (!p.timeBonus.enabled) return 0;
      const minutes = Math.floor(Math.max(0, remainingMs) / 60000);
      const raw = minutes * p.timeBonus.perMinuteRemaining;
      return p.timeBonus.max ? Math.min(raw, p.timeBonus.max) : raw;
    }
    case SCORE_TX.COMPLETION_BONUS:
      return p.completionBonus;
    case SCORE_TX.COORDINATOR_ADJUST:
      if (!has(amount)) throw new EngineError('SCORE_AMOUNT', 'Coordinator adjustment needs an amount');
      return Number(amount);
    default:
      throw new EngineError('SCORE_TYPE', `Unknown score transaction type ${type}`);
  }
}

/** Applies the floor. Returns the effective delta so the ledger folds exactly. */
export function applyDelta(scoreBefore, rawDelta, policy) {
  const p = normalizePolicy(policy);
  const before = Number(scoreBefore) || 0;
  const scoreAfter = Math.max(p.minimumScore, before + rawDelta);
  return { scoreBefore: before, scoreAfter, delta: scoreAfter - before, rawDelta };
}

/**
 * Builds a transaction (without persisting it).
 * `key` is the idempotency key — the same logical event must always produce the same key.
 */
export function buildTransaction(policy, scoreBefore, type, { override, remainingMs, amount, ref = {}, key, at = new Date() } = {}) {
  if (!key) throw new EngineError('SCORE_KEY', 'Score transaction needs an idempotency key');
  const rawDelta = computeDelta(policy, type, { override, remainingMs, amount });
  const applied = applyDelta(scoreBefore, rawDelta, policy);
  return { type, key, ref, at, ...applied };
}

/** Σ delta of a ledger — must equal the cached score at all times. */
export function foldLedger(transactions = []) {
  return transactions.reduce((acc, t) => acc + (Number(t.delta) || 0), 0);
}

/** Returns null when consistent, otherwise { expected, actual } (also verifies before/after chaining). */
export function verifyLedger(transactions = [], cachedScore) {
  let running = 0;
  for (const t of transactions) {
    if (Number(t.scoreBefore) !== running) return { reason: 'CHAIN_BROKEN', at: t.key, expected: running, actual: Number(t.scoreBefore) };
    running = Number(t.scoreAfter);
    if (Number(t.scoreBefore) + Number(t.delta) !== running) return { reason: 'DELTA_MISMATCH', at: t.key };
  }
  if (cachedScore !== undefined && Number(cachedScore) !== running) return { reason: 'SCORE_DRIFT', expected: running, actual: Number(cachedScore) };
  return null;
}
