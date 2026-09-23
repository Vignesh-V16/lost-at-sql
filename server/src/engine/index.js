/**
 * SQL Investigation Game Engine — public surface.
 *
 * Everything exported here is pure (no I/O, no Mongo, no HTTP). The service
 * layer persists what these functions compute.
 */
export { EngineError, assertEngine } from './errors.js';
export { ResultSet, normalizeCell, setsEqual } from './resultSet.js';
export { validate, registerValidator, hasValidator, listValidators, assertValidSpec, SQL_CONSTRUCTS, CONSTRUCT_LABELS, bareSql, missingConstructs } from './validators/index.js';
export { validateFinal, checkField, assertValidFinalConfig } from './finalValidator.js';
export {
  SCORE_TX, HINT_SCOPES, DEFAULT_SCORING_POLICY, normalizePolicy, computeDelta, applyDelta, buildTransaction, foldLedger, verifyLedger,
} from './scoring.js';
export { SUSPECT_STATES, SUSPECT_STATE_LIST, SUSPECT_STATE_LABELS, initialStates, applyTransitions, assertValidTransitions } from './suspectState.js';
export {
  EVENT_STATES, EVENT_STATE_LIST, EVENT_ACTIONS, transition, canTransition, INVESTIGATION_OPEN_STATES, INVESTIGATION_VISIBLE_STATES,
} from './eventStateMachine.js';
export {
  SESSION_STATUS, eventTotalMs, eventElapsedMs, eventRemainingMs, eventTimerState, sessionEffectiveNow, sessionRemainingMs, isSessionExpired, sessionElapsedMs, computeExpiresAt, formatClock,
} from './clock.js';
export { FILE_STATUS, CHALLENGE_STATUS, deriveProgression, fileStatusOf, challengeStatusOf } from './progression.js';
export { DEFAULT_LEADERBOARD_POLICY, normalizeLeaderboardPolicy, compareEntries, compareByPolicy, rankEntries } from './leaderboard.js';
