/**
 * Golden test — the Black Cipher content must be internally consistent:
 * every challenge's reference query, executed against the dataset, must be
 * accepted by that challenge's validator, and known-wrong queries (including
 * FILE 05's deliberately broad starter) must be rejected.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBlackCipherDataset } from '../src/content/blackCipher/dataset.js';
import { buildBlackCipherCase, ENTITIES, EVIDENCE_CATALOGUE } from '../src/content/blackCipher/case.js';
import { validate, validateFinal, assertValidSpec, assertValidFinalConfig, assertValidTransitions, ResultSet, initialStates, applyTransitions, missingConstructs } from '../src/engine/index.js';
import { runQueries } from './helpers/sqlite.js';

const dataset = buildBlackCipherDataset();
const caseDef = buildBlackCipherCase();
const challenges = caseDef.files.flatMap((f) => f.challenges.map((c) => ({ ...c, fileCode: f.code })));

test('dataset matches the prototype (6 tables, 50 rows, primary keys declared)', () => {
  assert.equal(dataset.tables.length, 6);
  assert.equal(dataset.tables.reduce((n, t) => n + t.rows.length, 0), 50);
  for (const t of dataset.tables) assert.ok(t.primaryKey.length, `${t.name} has a primary key`);
  const pm = dataset.tables.find((t) => t.name === 'project_members');
  assert.deepEqual(pm.primaryKey, ['emp_id', 'project_name']);
});

test('every validation spec, transition rule and evidence code is well-formed', () => {
  const codes = new Set(EVIDENCE_CATALOGUE.map((e) => e.code));
  for (const ch of challenges) {
    if (ch.kind === 'FINAL_DEDUCTION') assertValidFinalConfig(ch.validation.config);
    else assertValidSpec(ch.validation, ch.code);
    assertValidTransitions(ch.onSuccess?.transitions || []);
    for (const e of ch.onSuccess?.evidence || []) assert.ok(codes.has(e), `${ch.code}: evidence ${e} exists`);
    for (const e of ch.onSuccess?.transitions || []) if (e.entity) assert.ok(ENTITIES.some((x) => x.id === e.entity), `${ch.code}: entity ${e.entity}`);
  }
  assert.equal(ENTITIES.length, 12);
});

test('reference queries satisfy their validators; starters behave as in the prototype', async () => {
  const sqlChallenges = challenges.filter((c) => c.kind !== 'FINAL_DEDUCTION');
  const queries = [];
  for (const ch of sqlChallenges) queries.push(ch.referenceSql, ch.starterSql);
  const results = await runQueries(dataset, queries);
  for (let i = 0; i < sqlChallenges.length; i += 1) {
    const ch = sqlChallenges[i];
    const ref = results[i * 2];
    const starter = results[i * 2 + 1];
    assert.ok(!ref.error, `${ch.code} reference: ${ref.error}`);
    assert.ok(!starter.error, `${ch.code} starter: ${starter.error}`);
    const refVerdict = validate(ch.validation, { result: new ResultSet(ref), answer: ch.referenceAnswer, sql: ch.referenceSql });
    assert.equal(refVerdict.correct, true, `${ch.code} reference query must validate (${refVerdict.reason})`);
    const starterVerdict = validate(ch.validation, { result: new ResultSet(starter), answer: ch.referenceAnswer, sql: ch.starterSql });
    assert.equal(starterVerdict.correct, true, `${ch.code} starter validates (${starterVerdict.reason})`);
  }
});

test('beginner friendly: right rows are accepted however the query is written, and each file still names its construct', async () => {
  const plain = {
    FILE_01: "SELECT a.emp_id, e.name FROM access_logs a, employees e WHERE e.emp_id = a.emp_id AND a.door_name = 'Research Lab' AND a.access_type = 'entry' AND a.access_time BETWEEN '2045-09-17 09:45:00' AND '2045-09-17 09:58:00'",
    FILE_03: "SELECT emp_id FROM project_members WHERE project_name = 'Black Cipher'",
    FILE_04A: "SELECT emp_id FROM communications WHERE contact_type = 'external' AND message_type = 'encrypted'",
    FILE_05: "SELECT emp_id FROM transactions WHERE txn_date = '2045-09-16' AND source_account <> 'NovaTech Payroll'",
  };
  const codes = Object.keys(plain);
  const results = await runQueries(dataset, codes.map((c) => plain[c]));
  codes.forEach((code, i) => {
    const ch = challenges.find((c) => c.code === code);
    assert.ok(!results[i].error, `${code}: ${results[i].error}`);
    const v = validate(ch.validation, { result: new ResultSet(results[i]), sql: plain[code] });
    assert.equal(v.correct, true, `${code}: right rows pass whatever the syntax (${v.reason})`);
    assert.ok((ch.skills || []).length, `${code} advertises the construct it was built around`);
    assert.ok(missingConstructs(plain[code], ch.skills).length, `${code}: this plain query really does skip that construct`);
    assert.equal(missingConstructs(ch.referenceSql, ch.skills).length, 0, `${code}: the reference query uses it`);
  });
  /* nothing in the case demands a construct: no SQL_USES anywhere */
  const usesSql = (spec) => {
    if (!spec || typeof spec !== 'object') return false;
    if (String(spec.strategy || spec.type || '').toUpperCase() === 'SQL_USES') return true;
    return (spec.config?.validators || []).some(usesSql) || usesSql(spec.config?.requiresPriorResult);
  };
  for (const ch of challenges) assert.equal(usesSql(ch.validation), false, `${ch.code} accepts any correct query`);
});

test('prototype edge cases: FILE 02 gate without penalty, FILE 04B needs emp_id, wrong answers penalised', async () => {
  const WRONG_CCTV = "SELECT c.emp_id, e.name FROM cctv_admin_logs c JOIN employees e ON e.emp_id = c.emp_id WHERE c.action = 'enabled'";
  const RIGHT_CCTV = "SELECT c.emp_id, e.name FROM cctv_admin_logs c JOIN employees e ON e.emp_id = c.emp_id WHERE c.action = 'disabled'";
  const [wrongCctv, rightCctv, partBNoEmp, allComms] = await runQueries(dataset, [
    WRONG_CCTV,
    RIGHT_CCTV,
    "SELECT contact_person FROM communications WHERE emp_id = 'E101'",
    'SELECT emp_id, contact_person FROM communications',
  ]);
  const f02 = challenges.find((c) => c.code === 'FILE_02');
  const gate = validate(f02.validation, { result: new ResultSet(wrongCctv), answer: 'no', sql: WRONG_CCTV });
  assert.equal(gate.correct, false);
  assert.equal(gate.penalize, false);
  assert.match(gate.message, /disabled/);
  const noJoin = validate(f02.validation, { result: new ResultSet(rightCctv), answer: 'no', sql: "SELECT emp_id, name FROM cctv_admin_logs WHERE action = 'disabled'" });
  assert.equal(noJoin.correct, true, 'the gate opens on the right rows, JOIN or no JOIN');
  const f04b = challenges.find((c) => c.code === 'FILE_04B');
  const noEmp = validate(f04b.validation, { result: new ResultSet(partBNoEmp) });
  assert.equal(noEmp.reason, 'MISSING_COLUMN');
  assert.equal(noEmp.penalize, false);
  assert.equal(validate(f04b.validation, { result: new ResultSet(allComms) }).correct, true, 'any row naming E103 as contact_person passes (prototype semantics)');
  const f04a = challenges.find((c) => c.code === 'FILE_04A');
  const wrongA = validate(f04a.validation, { result: new ResultSet(allComms), sql: 'SELECT emp_id, COUNT(*) FROM communications GROUP BY emp_id HAVING COUNT(*) >= 1' });
  assert.equal(wrongA.correct, false);
  assert.equal(wrongA.penalize, true, 'a wrong set written with the construct still costs points');
});

test('final deduction reference answer and the suspect board after a full run', async () => {
  const final = challenges.find((c) => c.code === 'FINAL');
  const good = validateFinal(final.validation.config, final.referenceAnswer);
  assert.equal(good.correct, true);
  const bad = validateFinal(final.validation.config, { ...final.referenceAnswer, accomplice: 'E108' });
  assert.deepEqual(bad.issues, ['the accomplice']);

  // Replay every transition with the reference result sets → prototype's final board.
  const sqlChallenges = challenges.filter((c) => c.kind !== 'FINAL_DEDUCTION');
  const results = await runQueries(dataset, sqlChallenges.map((c) => c.referenceSql));
  let states = initialStates(ENTITIES.map((e) => e.id));
  sqlChallenges.forEach((ch, i) => {
    states = applyTransitions(states, ch.onSuccess.transitions, { resultSet: results[i], entities: ENTITIES.map((e) => e.id) }).states;
  });
  assert.equal(states.E101, 'PRIME_SUSPECT');
  assert.equal(states.E103, 'ACCOMPLICE');
  for (const id of ['E102', 'E105', 'E112']) assert.equal(states[id], 'SUSPECT', `${id} stays a suspect (prototype behaviour, D-1)`);
  for (const id of ['E104', 'E109']) assert.equal(states[id], 'CLEARED', `${id} cleared by FILE 03`);
  for (const id of ['E106', 'E107', 'E108', 'E110', 'E111']) assert.equal(states[id], 'CLEARED');
});
