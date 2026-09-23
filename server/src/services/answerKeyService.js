import { caseService } from './caseService.js';
import { sqlService } from './sqlService.js';
import { adminService } from './adminService.js';
import { guardSql } from '../utils/sqlGuard.js';

/*
 * answerKeyService — the coordinator's answer key.
 *
 * For every case file: the reference query, the rows it returns against the
 * dataset that is loaded right now, the answer the engine accepts, the skill
 * the file is designed around and its hints. Everything here is hidden
 * solution data; the admin router requires a coordinator session and no
 * participant route ever imports this module.
 *
 * Reference SQL is coordinator-authored, so it goes through the same
 * read-only guard as a participant query before it is executed — a stored
 * PRAGMA or DDL statement must never reach the shared sandbox.
 */

/** Visit every validator in a spec tree, however it was authored. */
const walk = (spec, fn) => {
  if (!spec || typeof spec !== 'object') return;
  fn(spec, String(spec.strategy || spec.type || '').toUpperCase());
  (spec.config?.validators || []).forEach((s) => walk(s, fn));
  if (spec.config?.requiresPriorResult) walk(spec.config.requiresPriorResult, fn);
};

const sqlUsesOf = (spec) => {
  const out = [];
  walk(spec, (s, name) => {
    if (name === 'SQL_USES') out.push(...(s.config?.requires || []).map((k) => String(k).toUpperCase()));
  });
  return [...new Set(out)];
};

function ruleText(rule) {
  if (!rule || typeof rule !== 'object') return null;
  switch (String(rule.type || '').toUpperCase()) {
    case 'EQUALS':
      return null;
    case 'ONE_OF':
      return `any of ${(rule.values || []).join(' / ')}`;
    case 'REGEX':
      return `matches ${rule.pattern}`;
    case 'CONTAINS':
      return `contains "${rule.value}"`;
    default:
      return null;
  }
}

/** One readable line per non-set validator, so no rule is silently hidden. */
function extraRules(spec) {
  const rules = [];
  walk(spec, (s, name) => {
    const c = s.config || {};
    if (name === 'REQUIRED_ROWS') {
      rules.push(`must include ${(c.rows || []).length} row(s) keyed by ${(c.keyColumns || []).join(', ')}${c.allowExtra === false ? ', and no others' : ''}: ${(c.rows || []).map((r) => Object.values(r).join(' ')).join(' · ')}`);
    } else if (name === 'TIME_WINDOW') {
      rules.push(`${c.allRowsWithin === false ? 'at least one' : 'every'} ${c.column} between ${c.from ?? '−∞'} and ${c.to ?? '∞'}`);
    } else if (name === 'AGGREGATE') {
      const target = [c.equals !== undefined ? `= ${c.equals}` : '', c.gte !== undefined ? `≥ ${c.gte}` : '', c.lte !== undefined ? `≤ ${c.lte}` : ''].filter(Boolean).join(' and ');
      rules.push(`${c.op}${c.column ? `(${c.column})` : '(rows)'} ${target}${c.tolerance ? ` ±${c.tolerance}` : ''}`);
    } else if (name === 'CUSTOM_EVIDENCE') {
      rules.push(`session must already hold evidence ${(c.evidenceCodes || []).join(', ')}`);
    } else if (name === 'SQL_USES') {
      rules.push(`the query must use ${(c.requires || []).join(', ')}`);
    }
  });
  return rules;
}

/** What the engine accepts for one challenge, in a shape the page can print. */
function answerOf(challenge, entityName) {
  const named = (id) => ({ id, name: entityName(id) });
  if (challenge.kind === 'FINAL_DEDUCTION') {
    const rules = challenge.validation?.config?.fields || {};
    const ref = challenge.referenceAnswer || {};
    const keys = [...new Set([...(challenge.fields || []).map((f) => f.key), ...Object.keys(rules)])];
    return {
      kind: 'final',
      fields: keys.map((key) => {
        const f = (challenge.fields || []).find((x) => x.key === key) || { key, label: key, type: 'text', options: [] };
        const rule = rules[key];
        const value = rule?.value ?? ref[key] ?? null;
        let display = value;
        if (f.type === 'entity' && value) display = entityName(value) ? `${entityName(value)} (${value})` : value;
        if (f.type === 'select' && value) display = (f.options || []).find((o) => o.value === value)?.label || value;
        return {
          key,
          label: f.label || key,
          value,
          display,
          accepts: ruleText(rule),
          unchecked: !rule, // a form field with no rule: anything passes
          noField: !(challenge.fields || []).some((x) => x.key === key), // a rule with no form field: unanswerable
        };
      }),
    };
  }
  let set = null;
  let field = null;
  let boolean = null;
  walk(challenge.validation, (s, name) => {
    const c = s.config || {};
    if (name === 'EXACT_SET' && !set) set = { column: c.column, values: [...(c.expected || [])] };
    if (name === 'FIELD_MATCH' && !field) {
      const values = c.anyRowEquals !== undefined ? [c.anyRowEquals] : c.allRowsEqual !== undefined ? [c.allRowsEqual] : [...(c.anyRowIn || [])];
      field = { column: c.column, values, every: c.allRowsEqual !== undefined };
    }
    if (name === 'BOOLEAN' && !boolean) boolean = c;
  });
  const rules = extraRules(challenge.validation);
  if (boolean) {
    const accepted = Array.isArray(boolean.expected) ? boolean.expected : [boolean.expected];
    let prior = null;
    if (boolean.requiresPriorResult) {
      let pset = null;
      let pfield = null;
      walk(boolean.requiresPriorResult, (s, name) => {
        const c = s.config || {};
        if (name === 'EXACT_SET' && !pset) pset = { column: c.column, values: [...(c.expected || [])] };
        if (name === 'FIELD_MATCH' && !pfield) pfield = { column: c.column, values: [c.anyRowEquals ?? c.allRowsEqual, ...(c.anyRowIn || [])].filter((v) => v !== undefined) };
      });
      const p = pset || pfield;
      if (p) prior = { column: p.column, values: p.values.map(named), exact: Boolean(pset) };
      else prior = { column: '', values: [], exact: false, rules: extraRules(boolean.requiresPriorResult) };
    }
    return { kind: 'boolean', question: challenge.question || '', expected: accepted.filter((v) => v !== undefined && v !== null), expectedLabels: accepted.filter((v) => v !== undefined && v !== null).map((v) => (challenge.answerOptions || []).find((o) => o.value === v)?.label || v), prior, rules };
  }
  if (set) return { kind: 'set', column: set.column, values: set.values.map(named), rules };
  if (field) return { kind: 'field', column: field.column, values: field.values.map((v) => named(String(v))), every: field.every, rules };
  if (rules.length) return { kind: 'rules', rules };
  return { kind: 'unknown', rules };
}

export const answerKeyService = {
  async build() {
    const config = await caseService.config();
    const files = await adminService.listCaseFiles();
    const entityName = (id) => config.entities.find((e) => e.id === id)?.name || null;
    const hintDefault = config.event?.scoringPolicy?.hintPenalty ?? null;
    const out = [];
    for (const f of files) {
      const challenges = [];
      const ordered = [...(f.challenges || [])].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      for (const ch of ordered) {
        const sql = ch.referenceSql || ch.starterSql || '';
        let result = null;
        let resultError = null;
        if (sql) {
          const guard = guardSql(sql);
          if (!guard.ok) {
            resultError = `Refused: ${guard.message}`;
          } else {
            try {
              const r = await sqlService.execute(guard.sql, { maxRows: 200, timeoutMs: 5000 });
              result = { columns: r.columns, rows: r.rows, rowCount: r.rowCount, truncated: Boolean(r.truncated) };
            } catch (err) {
              resultError = err.message || String(err);
            }
          }
        }
        challenges.push({
          id: ch.id,
          code: ch.code,
          sequence: ch.sequence,
          kind: ch.kind,
          stageLabel: ch.stageLabel || '',
          brief: ch.brief || '',
          question: ch.question || '',
          sql,
          sqlKind: ch.referenceSql ? 'reference' : ch.starterSql ? 'starter' : 'none',
          result,
          resultError,
          answer: answerOf(ch, entityName),
          /* the constructs the file is designed around (guidance), plus any
             a SQL_USES validator actually requires */
          skills: [...new Set([...(ch.skills || []).map((s) => String(s).toUpperCase()), ...sqlUsesOf(ch.validation)])],
          requiredSkills: sqlUsesOf(ch.validation),
          hints: (ch.hints || []).map((h) => ({ code: h.code, text: h.text || '', penalty: h.penalty ?? hintDefault })),
          successMessage: ch.successMessage || '',
        });
      }
      out.push({ id: f.id, code: f.code, sequence: f.sequence, label: f.label, title: f.title, difficulty: f.difficulty || '', isFinal: Boolean(f.isFinal), tables: [...(f.tables || [])], challenges });
    }
    return { generatedAt: new Date().toISOString(), datasetChecksum: sqlService.datasetChecksum, files: out };
  },
};
