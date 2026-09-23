/**
 * Suspect-state engine.
 *
 * States mirror the prototype (unknown → suspect | cleared | flagged | prime
 * | accomplice) with the spec's names. Transitions are declared as data on
 * the challenge (`onSuccess.transitions`) and applied here; every applied
 * change is returned so the caller can append it to the session timeline —
 * nothing is overwritten silently.
 *
 * Rule shapes:
 *   { entity: 'E103', to: 'PERSON_OF_INTEREST', from?: [...] }
 *   { scope: 'resultSet', column: 'emp_id', inSet?: 'SUSPECT', notInSet?: 'CLEARED', from?: [...] }
 *   { scope: 'all', to: 'CLEARED', from?: ['SUSPECT'], except?: ['E101'] }
 *   { scope: 'list', entities: ['E101','E102'], to: 'SUSPECT', from?: [...] }
 */
import { ResultSet } from './resultSet.js';
import { EngineError } from './errors.js';

export const SUSPECT_STATES = Object.freeze({
  UNKNOWN: 'UNKNOWN',
  SUSPECT: 'SUSPECT',
  CLEARED: 'CLEARED',
  PERSON_OF_INTEREST: 'PERSON_OF_INTEREST',
  PRIME_SUSPECT: 'PRIME_SUSPECT',
  ACCOMPLICE: 'ACCOMPLICE',
});

export const SUSPECT_STATE_LIST = Object.freeze(Object.values(SUSPECT_STATES));

/** Display labels used by the prototype's evidence board. */
export const SUSPECT_STATE_LABELS = Object.freeze({
  UNKNOWN: '',
  SUSPECT: 'SUSPECT',
  CLEARED: 'CLEARED',
  PERSON_OF_INTEREST: 'FLAGGED',
  PRIME_SUSPECT: 'PRIME SUSPECT',
  ACCOMPLICE: 'ACCOMPLICE',
});

export function initialStates(entityIds = []) {
  const states = {};
  for (const id of entityIds) states[String(id).toUpperCase()] = SUSPECT_STATES.UNKNOWN;
  return states;
}

function assertState(s, path) {
  const up = String(s || '').toUpperCase();
  if (!SUSPECT_STATE_LIST.includes(up)) throw new EngineError('SUSPECT_STATE', `${path}: unknown suspect state ${s}`);
  return up;
}

function allowedFrom(rule, current) {
  if (!Array.isArray(rule.from) || !rule.from.length) return true;
  return rule.from.map((s) => String(s).toUpperCase()).includes(current);
}

/**
 * @param {Record<string,string>} states   current entity → state (not mutated)
 * @param {Array<object>} rules
 * @param {{ resultSet?: any, entities?: string[] }} ctx
 * @returns {{ states: Record<string,string>, changes: Array<{entity:string, from:string, to:string}> }}
 */
export function applyTransitions(states, rules = [], ctx = {}) {
  const next = { ...states };
  const changes = [];
  const entityIds = (ctx.entities && ctx.entities.length ? ctx.entities : Object.keys(next)).map((e) => String(e).toUpperCase());
  const set = (entity, to, rule) => {
    const id = String(entity).toUpperCase();
    const from = next[id] || SUSPECT_STATES.UNKNOWN;
    if (!allowedFrom(rule, from)) return;
    if (from === to) return;
    next[id] = to;
    changes.push({ entity: id, from, to });
  };

  rules.forEach((rule, i) => {
    const path = `transitions[${i}]`;
    if (rule.entity) {
      set(rule.entity, assertState(rule.to, path), rule);
      return;
    }
    switch (rule.scope) {
      case 'resultSet': {
        const rs = ResultSet.from(ctx.resultSet);
        const present = rs.valueSet(rule.column || 'emp_id');
        const inSet = rule.inSet ? assertState(rule.inSet, path) : null;
        const notInSet = rule.notInSet ? assertState(rule.notInSet, path) : null;
        for (const id of entityIds) {
          if (present.has(id)) {
            if (inSet) set(id, inSet, rule);
          } else if (notInSet) set(id, notInSet, rule);
        }
        return;
      }
      case 'all': {
        const to = assertState(rule.to, path);
        const except = new Set((rule.except || []).map((e) => String(e).toUpperCase()));
        for (const id of entityIds) if (!except.has(id)) set(id, to, rule);
        return;
      }
      case 'list': {
        const to = assertState(rule.to, path);
        for (const id of rule.entities || []) set(id, to, rule);
        return;
      }
      default:
        throw new EngineError('SUSPECT_RULE', `${path}: rule needs entity or scope (resultSet|all|list)`);
    }
  });

  return { states: next, changes };
}

export function assertValidTransitions(rules = []) {
  rules.forEach((rule, i) => {
    const path = `transitions[${i}]`;
    if (rule.entity) {
      assertState(rule.to, path);
      return;
    }
    if (!['resultSet', 'all', 'list'].includes(rule.scope)) throw new EngineError('SUSPECT_RULE', `${path}: unknown scope ${rule.scope}`);
    if (rule.scope === 'resultSet' && !rule.inSet && !rule.notInSet) throw new EngineError('SUSPECT_RULE', `${path}: resultSet rule needs inSet or notInSet`);
    if (rule.scope !== 'resultSet') assertState(rule.to, path);
    if (rule.inSet) assertState(rule.inSet, path);
    if (rule.notInSet) assertState(rule.notInSet, path);
  });
  return true;
}
