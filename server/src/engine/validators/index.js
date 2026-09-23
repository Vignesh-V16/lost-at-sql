/**
 * Result-validation engine.
 *
 * A challenge declares `{ strategy, config }`. The engine executes the
 * participant's SQL (elsewhere), wraps the rows in a ResultSet and hands it
 * to the registered validator. Validators are pure functions:
 *
 *   validator(config, ctx) → Verdict
 *
 *   ctx = {
 *     result:   ResultSet | null      the participant's query result
 *     answer:   any                   structured answer (BOOLEAN stage, …)
 *     sql:      string                the participant's SQL text (SQL_USES)
 *     evidence: Set<string>           evidence codes the session already holds
 *   }
 *
 *   Verdict = {
 *     correct:  boolean
 *     reason:   string                stable machine code (OK, SET_MISMATCH, …)
 *     penalize: boolean               whether a wrong verdict costs points
 *     message?: string                participant-facing feedback override
 *     details?: object                never sent to participants
 *   }
 *
 * Nothing in here knows about HTTP, Mongo or the specific case. Route
 * handlers never contain validation rules.
 */
import { ResultSet, normalizeCell, setsEqual } from '../resultSet.js';
import { EngineError } from '../errors.js';

const registry = new Map();

export function registerValidator(name, fn) {
  if (typeof name !== 'string' || !name) throw new EngineError('VALIDATOR_NAME', 'Validator name required');
  if (typeof fn !== 'function') throw new EngineError('VALIDATOR_FN', `Validator ${name} must be a function`);
  registry.set(name.toUpperCase(), fn);
}

export function hasValidator(name) {
  return registry.has(String(name || '').toUpperCase());
}

export function listValidators() {
  return Array.from(registry.keys()).sort();
}

export const ok = (details) => ({ correct: true, reason: 'OK', penalize: false, details });
export const fail = (reason, { penalize = true, message, details } = {}) => ({ correct: false, reason, penalize, message, details });

function norm(v, cfg) {
  return normalizeCell(v, { caseInsensitive: cfg.caseInsensitive !== false });
}

/* ------------------------------------------------------------ validators */

/** All listed columns must be present in the result (no penalty by default — the prototype just refused to show Submit). */
registerValidator('REQUIRED_COLUMN', (cfg, ctx) => {
  const rs = ResultSet.from(ctx.result);
  const columns = Array.isArray(cfg.columns) ? cfg.columns : [cfg.column];
  if (!ctx.result) return fail('NO_RESULT', { penalize: false, message: cfg.message });
  const missing = rs.missingColumns(columns);
  if (missing.length) return fail('MISSING_COLUMN', { penalize: cfg.penalize === true, message: cfg.message, details: { missing } });
  return ok();
});

/** Distinct normalised values of `column` must equal `expected` exactly (Set semantics: order and duplicates ignored). */
registerValidator('EXACT_SET', (cfg, ctx) => {
  if (!ctx.result) return fail('NO_RESULT', { penalize: cfg.penalizeNoResult !== false });
  const rs = ResultSet.from(ctx.result);
  if (!rs.hasColumn(cfg.column)) return fail('MISSING_COLUMN', { penalize: cfg.penalizeMissingColumn === true, details: { missing: [cfg.column] } });
  const actual = rs.valueSet(cfg.column, { caseInsensitive: cfg.caseInsensitive !== false });
  const expected = new Set((cfg.expected || []).map((v) => norm(v, cfg)));
  if (setsEqual(actual, expected)) return ok({ matched: expected.size });
  return fail('SET_MISMATCH', { details: { expectedSize: expected.size, actualSize: actual.size } });
});

/** Every required row (keyed by keyColumns) must appear; extra rows allowed unless allowExtra:false. */
registerValidator('REQUIRED_ROWS', (cfg, ctx) => {
  if (!ctx.result) return fail('NO_RESULT');
  const rs = ResultSet.from(ctx.result);
  const keys = cfg.keyColumns || [];
  const missingCols = rs.missingColumns(keys);
  if (missingCols.length) return fail('MISSING_COLUMN', { penalize: cfg.penalizeMissingColumn === true, details: { missing: missingCols } });
  const idxs = keys.map((k) => rs.columnIndex(k));
  const actual = new Set(rs.rows.map((row) => idxs.map((i) => norm(Array.isArray(row) ? row[i] : row?.[rs.columns[i]], cfg)).join('')));
  const lookup = (obj, k) => {
    if (k in obj) return obj[k];
    const found = Object.keys(obj).find((o) => o.toLowerCase() === k.toLowerCase());
    return found === undefined ? undefined : obj[found];
  };
  const required = (cfg.rows || []).map((obj) => keys.map((k) => norm(lookup(obj, k), cfg)).join(''));
  const missing = required.filter((s) => !actual.has(s));
  if (missing.length) return fail('ROWS_MISSING', { details: { missing: missing.length } });
  if (cfg.allowExtra === false && actual.size !== new Set(required).size) return fail('EXTRA_ROWS', { details: { extra: actual.size - new Set(required).size } });
  return ok();
});

/**
 * FIELD_MATCH — a column must contain a value:
 *   anyRowEquals:  at least one row has the value
 *   allRowsEqual:  every row has the value (and at least one row)
 *   requireColumns: other columns that must be present (prototype: emp_id)
 */
registerValidator('FIELD_MATCH', (cfg, ctx) => {
  if (!ctx.result) return fail('NO_RESULT');
  const rs = ResultSet.from(ctx.result);
  const required = [...(cfg.requireColumns || [])];
  const missing = rs.missingColumns(required);
  if (missing.length) return fail('MISSING_COLUMN', { penalize: cfg.penalizeMissingColumn === true, message: cfg.missingColumnMessage, details: { missing } });
  if (!rs.hasColumn(cfg.column)) return fail('MISSING_COLUMN', { penalize: cfg.penalizeMissingColumn === true, details: { missing: [cfg.column] } });
  const values = rs.values(cfg.column, { caseInsensitive: cfg.caseInsensitive !== false });
  if (cfg.anyRowEquals !== undefined) {
    const target = norm(cfg.anyRowEquals, cfg);
    return values.includes(target) ? ok() : fail('VALUE_NOT_FOUND');
  }
  if (cfg.allRowsEqual !== undefined) {
    const target = norm(cfg.allRowsEqual, cfg);
    return values.length && values.every((v) => v === target) ? ok() : fail('VALUE_MISMATCH');
  }
  if (Array.isArray(cfg.anyRowIn)) {
    const targets = new Set(cfg.anyRowIn.map((v) => norm(v, cfg)));
    return values.some((v) => targets.has(v)) ? ok() : fail('VALUE_NOT_FOUND');
  }
  throw new EngineError('VALIDATOR_CONFIG', 'FIELD_MATCH needs anyRowEquals, allRowsEqual or anyRowIn');
});

/**
 * BOOLEAN — a structured yes/no (or any enumerated) answer, optionally
 * gated on a prior result-set check (prototype FILE 02: the question only
 * appears once the result set equals {E103}; a wrong result set costs nothing).
 */
registerValidator('BOOLEAN', (cfg, ctx) => {
  if (cfg.requiresPriorResult) {
    const prior = validate(cfg.requiresPriorResult, ctx);
    if (!prior.correct) {
      // a sub-check that carries its own wording (missing column, skill nudge) speaks first
      return fail('PRIOR_RESULT_REQUIRED', { penalize: cfg.penalizePriorResult === true, message: prior.message || cfg.priorMessage, details: prior });
    }
  }
  if (ctx.answer === undefined || ctx.answer === null || ctx.answer === '') {
    return fail('ANSWER_REQUIRED', { penalize: false, message: cfg.answerRequiredMessage });
  }
  const answer = norm(ctx.answer, cfg);
  const accepted = (Array.isArray(cfg.expected) ? cfg.expected : [cfg.expected]).map((v) => norm(v, cfg));
  return accepted.includes(answer) ? ok() : fail('ANSWER_MISMATCH');
});

/** All (or any) rows' `column` must fall inside [from, to] (lexical compare — timestamps are ISO-like TEXT). */
registerValidator('TIME_WINDOW', (cfg, ctx) => {
  if (!ctx.result) return fail('NO_RESULT');
  const rs = ResultSet.from(ctx.result);
  if (!rs.hasColumn(cfg.column)) return fail('MISSING_COLUMN', { penalize: cfg.penalizeMissingColumn === true, details: { missing: [cfg.column] } });
  const values = rs.column(cfg.column).map((v) => (v === null || v === undefined ? '' : String(v).trim()));
  if (!values.length) return fail('NO_ROWS');
  const inside = (v) => (!cfg.from || v >= cfg.from) && (!cfg.to || v <= cfg.to);
  const allWithin = cfg.allRowsWithin !== false;
  const pass = allWithin ? values.every(inside) : values.some(inside);
  return pass ? ok() : fail('OUTSIDE_WINDOW');
});

/**
 * AGGREGATE — compare an aggregate of a column (or the row count) with a target.
 *   { op: 'count'|'sum'|'min'|'max'|'avg', column?, equals?|gte?|lte?, tolerance? }
 */
registerValidator('AGGREGATE', (cfg, ctx) => {
  if (!ctx.result) return fail('NO_RESULT');
  const rs = ResultSet.from(ctx.result);
  let value;
  if (cfg.op === 'count') {
    value = rs.rowCount;
  } else {
    if (!rs.hasColumn(cfg.column)) return fail('MISSING_COLUMN', { penalize: cfg.penalizeMissingColumn === true, details: { missing: [cfg.column] } });
    const nums = rs.column(cfg.column).map(Number).filter((n) => Number.isFinite(n));
    if (!nums.length) return fail('NO_NUMERIC_VALUES');
    switch (cfg.op) {
      case 'sum': value = nums.reduce((a, b) => a + b, 0); break;
      case 'min': value = Math.min(...nums); break;
      case 'max': value = Math.max(...nums); break;
      case 'avg': value = nums.reduce((a, b) => a + b, 0) / nums.length; break;
      default: throw new EngineError('VALIDATOR_CONFIG', `AGGREGATE op ${cfg.op} unknown`);
    }
  }
  const tol = Number(cfg.tolerance || 0);
  if (cfg.equals !== undefined && Math.abs(value - Number(cfg.equals)) > tol) return fail('AGGREGATE_MISMATCH', { details: { value } });
  if (cfg.gte !== undefined && value < Number(cfg.gte)) return fail('AGGREGATE_MISMATCH', { details: { value } });
  if (cfg.lte !== undefined && value > Number(cfg.lte)) return fail('AGGREGATE_MISMATCH', { details: { value } });
  return ok({ value });
});

/** Composition: every sub-validator must pass; the first failure is returned verbatim (keeping its penalize flag). */
registerValidator('ALL_OF', (cfg, ctx) => {
  for (const sub of cfg.validators || []) {
    const v = validate(sub, ctx);
    if (!v.correct) return v;
  }
  return ok();
});

/** Composition: any sub-validator passing is enough; otherwise the last failure is returned. */
registerValidator('ANY_OF', (cfg, ctx) => {
  let last = fail('NO_VALIDATORS');
  for (const sub of cfg.validators || []) {
    last = validate(sub, ctx);
    if (last.correct) return last;
  }
  return last;
});

/** The session must already hold every listed evidence code (gate on discovery rather than on a query). */
registerValidator('CUSTOM_EVIDENCE', (cfg, ctx) => {
  const have = ctx.evidence instanceof Set ? ctx.evidence : new Set(ctx.evidence || []);
  const missing = (cfg.evidenceCodes || []).filter((c) => !have.has(c));
  return missing.length ? fail('EVIDENCE_MISSING', { penalize: cfg.penalize === true, details: { missing } }) : ok();
});

/**
 * SQL_USES — the participant's SQL itself must use the listed constructs.
 * This is how a file tests a *skill* (JOIN, subqueries, GROUP BY, HAVING,
 * aggregate functions) rather than an answer that a plain WHERE could reach.
 *   { requires: ['JOIN'|'SUBQUERY'|'GROUP_BY'|'HAVING'|'AGGREGATE'|'DISTINCT'|'ORDER_BY'|'WHERE'], message?, penalize? }
 * Comments and string literals are blanked first, so "-- JOIN" in a comment
 * or 'GROUP BY' inside quotes does not count. No penalty by default: it is
 * a nudge to rewrite, not a wrong answer.
 */
export const SQL_CONSTRUCTS = Object.freeze({
  WHERE: /\bWHERE\b/i,
  JOIN: /\bJOIN\b/i,
  SUBQUERY: /\(\s*SELECT\b/i,
  GROUP_BY: /\bGROUP\s+BY\b/i,
  HAVING: /\bHAVING\b/i,
  AGGREGATE: /\b(?:COUNT|SUM|AVG|MIN|MAX|TOTAL|GROUP_CONCAT)\s*\(/i,
  DISTINCT: /\bDISTINCT\b/i,
  ORDER_BY: /\bORDER\s+BY\b/i,
});

/** SQL with comments and string literals blanked out. */
export function bareSql(sql) {
  return String(sql || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""');
}

/** Human wording for a construct, for the "you could also have used…" note. */
export const CONSTRUCT_LABELS = Object.freeze({
  WHERE: 'WHERE',
  JOIN: 'a JOIN',
  SUBQUERY: 'a subquery',
  GROUP_BY: 'GROUP BY',
  HAVING: 'HAVING',
  AGGREGATE: 'an aggregate function',
  DISTINCT: 'DISTINCT',
  ORDER_BY: 'ORDER BY',
});

/** Which of `requires` the SQL does NOT use. Comments and string literals do not count. */
export function missingConstructs(sql, requires = []) {
  const bare = bareSql(sql);
  return requires
    .map((k) => String(k).toUpperCase())
    .filter((k) => SQL_CONSTRUCTS[k] && !SQL_CONSTRUCTS[k].test(bare));
}

registerValidator('SQL_USES', (cfg, ctx) => {
  const requires = (cfg.requires || []).map((k) => String(k).toUpperCase());
  for (const k of requires) if (!SQL_CONSTRUCTS[k]) throw new EngineError('VALIDATOR_CONFIG', `SQL_USES construct ${k} unknown`);
  if (typeof ctx.sql !== 'string' || !ctx.sql.trim()) return fail('NO_SQL', { penalize: false, message: cfg.message });
  const bare = bareSql(ctx.sql);
  const missing = requires.filter((k) => !SQL_CONSTRUCTS[k].test(bare));
  if (missing.length) return fail('SQL_CONSTRUCT_MISSING', { penalize: cfg.penalize === true, message: cfg.message, details: { missing } });
  return ok();
});

/* ------------------------------------------------------------- dispatch */

/**
 * @param {{strategy: string, config?: object}} spec
 * @param {{result?: any, answer?: any, evidence?: Iterable<string>}} ctx
 */
export function validate(spec, ctx = {}) {
  if (!spec || typeof spec !== 'object') throw new EngineError('VALIDATOR_CONFIG', 'Validation spec missing');
  const name = String(spec.strategy || spec.type || '').toUpperCase();
  const fn = registry.get(name);
  if (!fn) throw new EngineError('VALIDATOR_UNKNOWN', `No validator registered for ${name || '(empty)'}`);
  const verdict = fn(spec.config || {}, ctx);
  return { correct: Boolean(verdict.correct), reason: verdict.reason || (verdict.correct ? 'OK' : 'FAILED'), penalize: verdict.correct ? false : verdict.penalize !== false, message: verdict.message, details: verdict.details };
}

/** Structural check used when a coordinator saves a challenge: every strategy in the tree must exist. */
export function assertValidSpec(spec, path = 'validation') {
  if (!spec || typeof spec !== 'object') throw new EngineError('VALIDATOR_CONFIG', `${path}: spec missing`);
  const name = String(spec.strategy || spec.type || '').toUpperCase();
  if (!registry.has(name)) throw new EngineError('VALIDATOR_UNKNOWN', `${path}: unknown strategy ${name || '(empty)'}`);
  const cfg = spec.config || {};
  if (name === 'ALL_OF' || name === 'ANY_OF') {
    if (!Array.isArray(cfg.validators) || !cfg.validators.length) throw new EngineError('VALIDATOR_CONFIG', `${path}: ${name} needs validators[]`);
    cfg.validators.forEach((s, i) => assertValidSpec(s, `${path}.validators[${i}]`));
  }
  if (name === 'BOOLEAN' && cfg.requiresPriorResult) assertValidSpec(cfg.requiresPriorResult, `${path}.requiresPriorResult`);
  if (name === 'EXACT_SET' && (!cfg.column || !Array.isArray(cfg.expected))) throw new EngineError('VALIDATOR_CONFIG', `${path}: EXACT_SET needs column and expected[]`);
  if (name === 'SQL_USES') {
    if (!Array.isArray(cfg.requires) || !cfg.requires.length) throw new EngineError('VALIDATOR_CONFIG', `${path}: SQL_USES needs requires[]`);
    for (const k of cfg.requires) if (!SQL_CONSTRUCTS[String(k).toUpperCase()]) throw new EngineError('VALIDATOR_CONFIG', `${path}: SQL_USES construct ${k} unknown`);
  }
  return true;
}
