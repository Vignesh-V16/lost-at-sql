/**
 * Event lifecycle state machine (spec §4).
 *
 *   DRAFT → READY → SCHEDULED → LIVE ⇄ PAUSED → ENDED → ARCHIVED
 *
 * States are stored lower-case. `transition(current, action)` returns the
 * next state or throws an EngineError with a stable code — the service layer
 * performs the actual compare-and-swap write so two coordinators cannot
 * both start the event.
 */
import { EngineError } from './errors.js';

export const EVENT_STATES = Object.freeze({
  DRAFT: 'draft',
  READY: 'ready',
  SCHEDULED: 'scheduled',
  LIVE: 'live',
  PAUSED: 'paused',
  ENDED: 'ended',
  ARCHIVED: 'archived',
});

export const EVENT_STATE_LIST = Object.freeze(Object.values(EVENT_STATES));

export const EVENT_ACTIONS = Object.freeze({
  READY: 'ready',
  UNREADY: 'unready',
  SCHEDULE: 'schedule',
  UNSCHEDULE: 'unschedule',
  START: 'start',
  PAUSE: 'pause',
  RESUME: 'resume',
  END: 'end',
  ARCHIVE: 'archive',
  RESET: 'reset',
});

const S = EVENT_STATES;

const TABLE = {
  [EVENT_ACTIONS.READY]: { [S.DRAFT]: S.READY },
  [EVENT_ACTIONS.UNREADY]: { [S.READY]: S.DRAFT, [S.SCHEDULED]: S.DRAFT },
  [EVENT_ACTIONS.SCHEDULE]: { [S.READY]: S.SCHEDULED, [S.DRAFT]: S.SCHEDULED, [S.SCHEDULED]: S.SCHEDULED },
  [EVENT_ACTIONS.UNSCHEDULE]: { [S.SCHEDULED]: S.READY },
  [EVENT_ACTIONS.START]: { [S.READY]: S.LIVE, [S.SCHEDULED]: S.LIVE, [S.DRAFT]: S.LIVE, [S.PAUSED]: S.LIVE },
  [EVENT_ACTIONS.PAUSE]: { [S.LIVE]: S.PAUSED },
  [EVENT_ACTIONS.RESUME]: { [S.PAUSED]: S.LIVE },
  [EVENT_ACTIONS.END]: { [S.LIVE]: S.ENDED, [S.PAUSED]: S.ENDED },
  [EVENT_ACTIONS.ARCHIVE]: { [S.ENDED]: S.ARCHIVED },
  [EVENT_ACTIONS.RESET]: Object.fromEntries(EVENT_STATE_LIST.map((s) => [s, S.DRAFT])),
};

const ERROR_CODES = {
  [EVENT_ACTIONS.START]: {
    [S.LIVE]: ['EVENT_ALREADY_LIVE', 'The investigation is already live'],
    [S.ENDED]: ['EVENT_ALREADY_ENDED', 'The investigation has ended. Reset it (or create a new event) to run again.'],
    [S.ARCHIVED]: ['EVENT_ARCHIVED', 'An archived event cannot be started'],
  },
  [EVENT_ACTIONS.PAUSE]: { '*': ['EVENT_NOT_LIVE', 'Only a live investigation can be paused'] },
  [EVENT_ACTIONS.RESUME]: { '*': ['EVENT_NOT_PAUSED', 'The investigation is not paused'] },
  [EVENT_ACTIONS.END]: { [S.ENDED]: ['EVENT_ALREADY_ENDED', 'The investigation has already ended'], '*': ['EVENT_NOT_LIVE', 'Only a running investigation can be ended'] },
  [EVENT_ACTIONS.ARCHIVE]: { '*': ['EVENT_NOT_ENDED', 'Only an ended event can be archived'] },
};

export function canTransition(current, action) {
  return Boolean(TABLE[action]?.[current]);
}

export function transition(current, action) {
  const next = TABLE[action]?.[current];
  if (next) return next;
  if (!TABLE[action]) throw new EngineError('EVENT_ACTION_UNKNOWN', `Unknown event action ${action}`);
  const [code, message] = ERROR_CODES[action]?.[current] || ERROR_CODES[action]?.['*'] || ['EVENT_TRANSITION_INVALID', `Cannot ${action} an event that is ${current}`];
  throw new EngineError(code, message, { current, action });
}

/** States in which a participant may perform investigation actions. */
export const INVESTIGATION_OPEN_STATES = Object.freeze([S.LIVE]);
/** States in which read-only investigation views still work. */
export const INVESTIGATION_VISIBLE_STATES = Object.freeze([S.LIVE, S.PAUSED, S.ENDED, S.ARCHIVED]);
