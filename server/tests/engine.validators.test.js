import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, assertValidSpec, listValidators, ResultSet, missingConstructs } from '../src/engine/index.js';

const rs = (columns, rows) => new ResultSet({ columns, rows });
const six = ['E101', 'E102', 'E104', 'E105', 'E109', 'E112'];
const exact = (expected, column = 'emp_id') => ({ strategy: 'EXACT_SET', config: { column, expected } });

test('registry exposes every strategy from the architecture', () => {
  const names = listValidators();
  for (const n of ['EXACT_SET', 'REQUIRED_ROWS', 'REQUIRED_COLUMN', 'BOOLEAN', 'FIELD_MATCH', 'TIME_WINDOW', 'AGGREGATE', 'SQL_USES', 'CUSTOM_EVIDENCE', 'ALL_OF', 'ANY_OF']) {
    assert.ok(names.includes(n), `${n} registered`);
  }
});

test('EXACT_SET: exact match ignores order, duplicates, case and extra columns', () => {
  const result = rs(['name', 'EMP_ID'], [['b', 'e112'], ['a', 'E101'], ['c', 'E102'], ['d', 'E104'], ['e', 'E105'], ['f', 'E109'], ['g', 'E101']]);
  const v = validate(exact(six), { result });
  assert.equal(v.correct, true);
  assert.equal(v.penalize, false);
});

test('EXACT_SET: subset, superset and empty are wrong and penalised', () => {
  assert.equal(validate(exact(six), { result: rs(['emp_id'], six.slice(0, 5).map((e) => [e])) }).correct, false);
  assert.equal(validate(exact(six), { result: rs(['emp_id'], [...six, 'E106'].map((e) => [e])) }).correct, false);
  const empty = validate(exact(six), { result: rs(['emp_id'], []) });
  assert.equal(empty.correct, false);
  assert.equal(empty.penalize, true);
});

test('EXACT_SET: missing column is not penalised by default (prototype refused to show Submit)', () => {
  const v = validate(exact(six), { result: rs(['name'], [['x']]) });
  assert.equal(v.correct, false);
  assert.equal(v.reason, 'MISSING_COLUMN');
  assert.equal(v.penalize, false);
});

test('REQUIRED_COLUMN gates without penalty and carries a message', () => {
  const v = validate({ strategy: 'REQUIRED_COLUMN', config: { columns: ['emp_id'], message: 'needs emp_id' } }, { result: rs(['name'], []) });
  assert.deepEqual([v.correct, v.penalize, v.message], [false, false, 'needs emp_id']);
  assert.equal(validate({ strategy: 'REQUIRED_COLUMN', config: { columns: ['emp_id'] } }, { result: rs(['Emp_Id'], []) }).correct, true);
});

test('ALL_OF short-circuits on the first failure and keeps its penalize flag', () => {
  const spec = { strategy: 'ALL_OF', config: { validators: [{ strategy: 'REQUIRED_COLUMN', config: { columns: ['emp_id'] } }, exact(six)] } };
  const missing = validate(spec, { result: rs(['name'], [['x']]) });
  assert.equal(missing.reason, 'MISSING_COLUMN');
  assert.equal(missing.penalize, false);
  const wrong = validate(spec, { result: rs(['emp_id'], [['E101']]) });
  assert.equal(wrong.reason, 'SET_MISMATCH');
  assert.equal(wrong.penalize, true);
  assert.equal(validate(spec, { result: rs(['emp_id'], six.map((e) => [e])) }).correct, true);
});

test('FIELD_MATCH anyRowEquals — FILE 04 Part B semantics', () => {
  const spec = { strategy: 'FIELD_MATCH', config: { column: 'contact_person', anyRowEquals: 'E103', requireColumns: ['emp_id'] } };
  assert.equal(validate(spec, { result: rs(['emp_id', 'contact_person'], [['E101', 'X_Buyer_07'], ['E101', 'e103']]) }).correct, true);
  const wrong = validate(spec, { result: rs(['emp_id', 'contact_person'], [['E101', 'X_Buyer_07']]) });
  assert.equal(wrong.correct, false);
  assert.equal(wrong.penalize, true);
  const noCol = validate(spec, { result: rs(['contact_person'], [['E103']]) });
  assert.equal(noCol.reason, 'MISSING_COLUMN');
  assert.equal(noCol.penalize, false);
});

test('BOOLEAN with prior result gate — FILE 02 semantics', () => {
  const spec = {
    strategy: 'BOOLEAN',
    config: { expected: 'no', requiresPriorResult: exact(['E103']), priorMessage: 'find the admin first' },
  };
  const gated = validate(spec, { result: rs(['emp_id'], [['E108']]), answer: 'no' });
  assert.equal(gated.correct, false);
  assert.equal(gated.reason, 'PRIOR_RESULT_REQUIRED');
  assert.equal(gated.penalize, false);
  assert.equal(gated.message, 'find the admin first');

  const noAnswer = validate(spec, { result: rs(['emp_id'], [['E103']]) });
  assert.equal(noAnswer.reason, 'ANSWER_REQUIRED');
  assert.equal(noAnswer.penalize, false);

  const wrong = validate(spec, { result: rs(['emp_id'], [['E103']]), answer: 'yes' });
  assert.equal(wrong.correct, false);
  assert.equal(wrong.penalize, true);

  assert.equal(validate(spec, { result: rs(['emp_id'], [['E103']]), answer: 'NO ' }).correct, true);
});

test('REQUIRED_ROWS', () => {
  const spec = { strategy: 'REQUIRED_ROWS', config: { keyColumns: ['emp_id', 'door_name'], rows: [{ emp_id: 'E101', door_name: 'Loading Dock B' }] } };
  assert.equal(validate(spec, { result: rs(['EMP_ID', 'door_name', 'x'], [['e101', 'loading dock b', 1], ['E102', 'Lab', 2]]) }).correct, true);
  assert.equal(validate(spec, { result: rs(['emp_id', 'door_name'], [['E102', 'Lab']]) }).correct, false);
  const strict = { strategy: 'REQUIRED_ROWS', config: { ...spec.config, allowExtra: false } };
  assert.equal(validate(strict, { result: rs(['emp_id', 'door_name'], [['E101', 'Loading Dock B'], ['E102', 'Lab']]) }).reason, 'EXTRA_ROWS');
});

test('TIME_WINDOW and AGGREGATE', () => {
  const tw = { strategy: 'TIME_WINDOW', config: { column: 'access_time', from: '2045-09-17 09:45:00', to: '2045-09-17 09:58:00' } };
  assert.equal(validate(tw, { result: rs(['access_time'], [['2045-09-17 09:46:10'], ['2045-09-17 09:55:20']]) }).correct, true);
  assert.equal(validate(tw, { result: rs(['access_time'], [['2045-09-17 09:20:00']]) }).correct, false);
  const agg = { strategy: 'AGGREGATE', config: { op: 'max', column: 'amount', equals: 5200000 } };
  assert.equal(validate(agg, { result: rs(['amount'], [[85000], [5200000]]) }).correct, true);
  assert.equal(validate({ strategy: 'AGGREGATE', config: { op: 'count', equals: 1 } }, { result: rs(['a'], [[1], [2]]) }).correct, false);
});

test('SQL_USES: constructs must appear outside comments and strings; free by default', () => {
  const spec = { strategy: 'SQL_USES', config: { requires: ['JOIN', 'GROUP_BY', 'HAVING', 'AGGREGATE', 'SUBQUERY'], message: 'use the skill' } };
  const good = 'SELECT e.emp_id, count(*) FROM employees e inner join access_logs a ON a.emp_id = e.emp_id WHERE e.emp_id IN (select emp_id FROM project_members) group  by e.emp_id having COUNT(*) > 1';
  assert.equal(validate(spec, { sql: good }).correct, true);
  const faked = "SELECT emp_id FROM employees -- JOIN GROUP BY HAVING COUNT( (SELECT\nWHERE name = 'JOIN GROUP BY HAVING SUM( (SELECT' /* JOIN */";
  const v = validate(spec, { sql: faked });
  assert.equal(v.correct, false);
  assert.equal(v.reason, 'SQL_CONSTRUCT_MISSING');
  assert.equal(v.penalize, false);
  assert.equal(v.message, 'use the skill');
  assert.deepEqual(v.details.missing, ['JOIN', 'GROUP_BY', 'HAVING', 'AGGREGATE', 'SUBQUERY']);
  assert.equal(validate(spec, {}).reason, 'NO_SQL');
  assert.equal(validate({ strategy: 'SQL_USES', config: { requires: ['JOIN'], penalize: true } }, { sql: 'SELECT 1' }).penalize, true);
  assert.throws(() => assertValidSpec({ strategy: 'SQL_USES', config: { requires: ['WINDOW'] } }));
  assert.throws(() => assertValidSpec({ strategy: 'SQL_USES', config: {} }));
});

test('missingConstructs names what a query did not use, ignoring comments and strings', () => {
  const want = ['JOIN', 'GROUP_BY', 'HAVING', 'AGGREGATE'];
  assert.deepEqual(missingConstructs('SELECT e.emp_id, COUNT(*) FROM employees e JOIN a ON 1=1 GROUP BY e.emp_id HAVING COUNT(*) > 1', want), []);
  assert.deepEqual(missingConstructs("SELECT emp_id FROM employees WHERE name = 'JOIN GROUP BY HAVING COUNT(' -- JOIN GROUP BY HAVING COUNT(", want), want);
  assert.deepEqual(missingConstructs('SELECT emp_id FROM a JOIN b ON 1=1', want), ['GROUP_BY', 'HAVING', 'AGGREGATE']);
  assert.deepEqual(missingConstructs('SELECT 1', []), []);
  assert.deepEqual(missingConstructs('', ['JOIN']), ['JOIN']);
  assert.deepEqual(missingConstructs('SELECT 1', ['NOPE']), [], 'an unknown construct is ignored, never reported as missing');
});

test('CUSTOM_EVIDENCE gates on discovered evidence', () => {
  const spec = { strategy: 'CUSTOM_EVIDENCE', config: { evidenceCodes: ['FINANCIAL_MOTIVE'] } };
  assert.equal(validate(spec, { evidence: new Set(['FINANCIAL_MOTIVE']) }).correct, true);
  const v = validate(spec, { evidence: [] });
  assert.equal(v.correct, false);
  assert.equal(v.penalize, false);
});

test('unknown strategy and malformed specs are rejected at save time', () => {
  assert.throws(() => validate({ strategy: 'NOPE' }, {}), /No validator registered/);
  assert.throws(() => assertValidSpec({ strategy: 'ALL_OF', config: {} }), /needs validators/);
  assert.throws(() => assertValidSpec({ strategy: 'EXACT_SET', config: { column: 'x' } }), /expected/);
  assert.equal(assertValidSpec({ strategy: 'BOOLEAN', config: { expected: 'no', requiresPriorResult: exact(['E103']) } }), true);
});
