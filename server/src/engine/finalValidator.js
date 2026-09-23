/**
 * FinalCaseValidator — validates the final deduction field by field.
 *
 * Config (server-only, never serialised to participants):
 *   {
 *     fields: {
 *       thief:      { type: 'EQUALS',   value: 'E101' },
 *       accomplice: { type: 'EQUALS',   value: 'E103' },
 *       time:       { type: 'REGEX',    pattern: '^09:5[0-4]$' },
 *       method:     { type: 'EQUALS',   value: 'cctv' },
 *       location:   { type: 'CONTAINS', value: 'loading dock' },
 *     },
 *     feedback: { thief: 'the thief', time: 'the time (check the CCTV blackout window)', … }
 *   }
 *
 * Field types: EQUALS, ONE_OF, REGEX, CONTAINS. All comparisons are
 * case-insensitive and trimmed unless `caseSensitive: true`.
 *
 * Returns { correct, fields: {thief: bool, …}, issues: ['the thief', …] }.
 * The correct values never leave this function.
 */
import { EngineError } from './errors.js';

function prep(value, rule) {
  const s = value === null || value === undefined ? '' : String(value).trim();
  return rule.caseSensitive ? s : s.toLowerCase();
}

export function checkField(rule, value) {
  if (!rule || typeof rule !== 'object') throw new EngineError('FINAL_CONFIG', 'Field rule missing');
  const v = prep(value, rule);
  switch (String(rule.type || '').toUpperCase()) {
    case 'EQUALS':
      return v !== '' && v === prep(rule.value, rule);
    case 'ONE_OF':
      return v !== '' && (rule.values || []).some((x) => prep(x, rule) === v);
    case 'REGEX': {
      const re = new RegExp(rule.pattern, rule.caseSensitive ? '' : 'i');
      return v !== '' && re.test(String(value).trim());
    }
    case 'CONTAINS':
      return v !== '' && v.includes(prep(rule.value, rule));
    default:
      throw new EngineError('FINAL_CONFIG', `Unknown final field type ${rule.type}`);
  }
}

export function validateFinal(config, answers = {}) {
  if (!config || typeof config.fields !== 'object') throw new EngineError('FINAL_CONFIG', 'Final validation config missing fields');
  const fields = {};
  const issues = [];
  for (const [key, rule] of Object.entries(config.fields)) {
    const okField = checkField(rule, answers[key]);
    fields[key] = okField;
    if (!okField) issues.push(config.feedback?.[key] || `the ${key}`);
  }
  return { correct: issues.length === 0, fields, issues };
}

export function assertValidFinalConfig(config) {
  if (!config || typeof config.fields !== 'object' || !Object.keys(config.fields).length) {
    throw new EngineError('FINAL_CONFIG', 'Final validation needs at least one field rule');
  }
  for (const [key, rule] of Object.entries(config.fields)) {
    const type = String(rule?.type || '').toUpperCase();
    if (!['EQUALS', 'ONE_OF', 'REGEX', 'CONTAINS'].includes(type)) throw new EngineError('FINAL_CONFIG', `Field ${key}: unknown type ${rule?.type}`);
    if (type === 'REGEX') {
      try {
        // eslint-disable-next-line no-new
        new RegExp(rule.pattern);
      } catch {
        throw new EngineError('FINAL_CONFIG', `Field ${key}: invalid pattern`);
      }
    }
    if (type === 'ONE_OF' && !Array.isArray(rule.values)) throw new EngineError('FINAL_CONFIG', `Field ${key}: ONE_OF needs values[]`);
    if ((type === 'EQUALS' || type === 'CONTAINS') && (rule.value === undefined || rule.value === '')) throw new EngineError('FINAL_CONFIG', `Field ${key}: value required`);
  }
  return true;
}
