import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFinal, assertValidFinalConfig,
  SCORE_TX, buildTransaction, foldLedger, verifyLedger, normalizePolicy, computeDelta,
  SUSPECT_STATES, initialStates, applyTransitions, assertValidTransitions,
  EVENT_STATES, EVENT_ACTIONS, transition, canTransition,
  SESSION_STATUS, sessionRemainingMs, isSessionExpired, eventRemainingMs, computeExpiresAt,
  deriveProgression, FILE_STATUS, CHALLENGE_STATUS,
  rankEntries,
} from '../src/engine/index.js';

/* --------------------------------------------------------------- final */

const FINAL = {
  fields: {
    thief: { type: 'EQUALS', value: 'E101' },
    accomplice: { type: 'EQUALS', value: 'E103' },
    time: { type: 'REGEX', pattern: '^09:5[0-4]$' },
    method: { type: 'EQUALS', value: 'cctv' },
    location: { type: 'CONTAINS', value: 'loading dock' },
  },
  feedback: { thief: 'the thief', accomplice: 'the accomplice', time: 'the time (check the CCTV blackout window)', method: 'the method', location: 'the location (check the exit log remarks)' },
};

test('final validator — prototype answer key, per-field feedback, edges', () => {
  const good = validateFinal(FINAL, { thief: 'E101', accomplice: 'E103', time: '09:52', method: 'cctv', location: 'Loading Dock B' });
  assert.equal(good.correct, true);
  assert.deepEqual(good.issues, []);
  const bad = validateFinal(FINAL, { thief: 'E102', accomplice: 'E103', time: '09:55', method: 'cctv', location: 'the dock' });
  assert.equal(bad.correct, false);
  assert.deepEqual(bad.fields, { thief: false, accomplice: true, time: false, method: true, location: false });
  assert.deepEqual(bad.issues, ['the thief', 'the time (check the CCTV blackout window)', 'the location (check the exit log remarks)']);
  for (const t of ['09:50', '09:54']) assert.equal(validateFinal(FINAL, { time: t }).fields.time, true, t);
  for (const t of ['09:49', '09:55', '9:52', '09:52:00']) assert.equal(validateFinal(FINAL, { time: t }).fields.time, false, t);
  assert.equal(validateFinal(FINAL, { location: '  LOADING DOCK  ' }).fields.location, true);
  assert.equal(validateFinal(FINAL, {}).fields.thief, false);
  assert.equal(assertValidFinalConfig(FINAL), true);
  assert.throws(() => assertValidFinalConfig({ fields: { x: { type: 'REGEX', pattern: '[' } } }));
});

/* ------------------------------------------------------------- scoring */

test('scoring — prototype defaults, floor clamp, ledger folds exactly', () => {
  const p = normalizePolicy({});
  assert.equal(p.initialScore, 1000);
  assert.equal(p.hintPenaltyScope, 'file');
  assert.equal(computeDelta(p, SCORE_TX.WRONG_SUBMISSION), -25);
  assert.equal(computeDelta(p, SCORE_TX.HINT_USED), -50);
  assert.equal(computeDelta(p, SCORE_TX.FINAL_WRONG), -25);
  assert.equal(computeDelta(p, SCORE_TX.TIME_BONUS, { remainingMs: 600000 }), 0);

  const ledger = [];
  let score = 0;
  const push = (type, key, opts) => {
    const tx = buildTransaction(p, score, type, { key, ...opts });
    ledger.push(tx);
    score = tx.scoreAfter;
  };
  push(SCORE_TX.INITIAL, 'init');
  push(SCORE_TX.HINT_USED, 'h1');
  push(SCORE_TX.WRONG_SUBMISSION, 'w1');
  assert.equal(score, 925);
  assert.equal(foldLedger(ledger), 925);
  assert.equal(verifyLedger(ledger, 925), null);

  // floor: from 10, a −25 records an effective delta of −10
  const tx = buildTransaction(p, 10, SCORE_TX.WRONG_SUBMISSION, { key: 'w2' });
  assert.equal(tx.scoreAfter, 0);
  assert.equal(tx.delta, -10);
  assert.equal(tx.rawDelta, -25);

  // overrides and bonuses
  assert.equal(computeDelta(p, SCORE_TX.HINT_USED, { override: 10 }), -10);
  const bonus = normalizePolicy({ timeBonus: { enabled: true, perMinuteRemaining: 2, max: 30 } });
  assert.equal(computeDelta(bonus, SCORE_TX.TIME_BONUS, { remainingMs: 10 * 60000 }), 20);
  assert.equal(computeDelta(bonus, SCORE_TX.TIME_BONUS, { remainingMs: 60 * 60000 }), 30);
  assert.throws(() => buildTransaction(p, 0, SCORE_TX.WRONG_SUBMISSION, {}), /idempotency key/);
  assert.ok(verifyLedger([{ scoreBefore: 5, scoreAfter: 10, delta: 5 }], 10));
});

/* ------------------------------------------------------- suspect state */

const EMPLOYEES = ['E101', 'E102', 'E103', 'E104', 'E105', 'E106', 'E107', 'E108', 'E109', 'E110', 'E111', 'E112'];
const six = ['E101', 'E102', 'E104', 'E105', 'E109', 'E112'];
const rsOf = (ids) => ({ columns: ['emp_id'], rows: ids.map((i) => [i]) });

test('suspect-state transitions reproduce the prototype board', () => {
  let states = initialStates(EMPLOYEES);
  // FILE 01
  let r = applyTransitions(states, [{ scope: 'resultSet', column: 'emp_id', inSet: 'SUSPECT', notInSet: 'CLEARED', from: ['UNKNOWN'] }], { resultSet: rsOf(six) });
  states = r.states;
  assert.equal(r.changes.length, 12);
  assert.equal(states.E101, SUSPECT_STATES.SUSPECT);
  assert.equal(states.E103, SUSPECT_STATES.CLEARED);
  // FILE 02
  r = applyTransitions(states, [{ entity: 'E103', to: 'PERSON_OF_INTEREST' }]);
  states = r.states;
  assert.deepEqual(r.changes, [{ entity: 'E103', from: 'CLEARED', to: 'PERSON_OF_INTEREST' }]);
  // FILE 03
  r = applyTransitions(states, [{ scope: 'resultSet', column: 'emp_id', notInSet: 'CLEARED', from: ['SUSPECT'] }], { resultSet: rsOf(['E101', 'E102', 'E105', 'E112']) });
  states = r.states;
  assert.deepEqual(r.changes.map((c) => c.entity).sort(), ['E104', 'E109']);
  assert.equal(states.E103, SUSPECT_STATES.PERSON_OF_INTEREST, 'flagged person is untouched by a SUSPECT-scoped rule');
  // FILE 04A / 04B
  states = applyTransitions(states, [{ entity: 'E101', to: 'PRIME_SUSPECT' }]).states;
  states = applyTransitions(states, [{ entity: 'E103', to: 'ACCOMPLICE' }]).states;
  assert.equal(states.E101, SUSPECT_STATES.PRIME_SUSPECT);
  assert.equal(states.E103, SUSPECT_STATES.ACCOMPLICE);
  assert.equal(states.E102, SUSPECT_STATES.SUSPECT, 'prototype never cleared the remaining suspects (D-1)');
  // optional D-1 rule, off by default
  r = applyTransitions(states, [{ scope: 'all', from: ['SUSPECT'], to: 'CLEARED', except: ['E101'] }]);
  assert.deepEqual(r.changes.map((c) => c.entity).sort(), ['E102', 'E105', 'E112']);
  // idempotent re-application produces no changes
  assert.equal(applyTransitions(states, [{ entity: 'E103', to: 'ACCOMPLICE' }]).changes.length, 0);
  assert.throws(() => applyTransitions(states, [{ entity: 'E1', to: 'GUILTY' }]));
  assert.throws(() => assertValidTransitions([{ scope: 'resultSet' }]));
});

/* ---------------------------------------------------------------- event */

test('event state machine', () => {
  assert.equal(transition(EVENT_STATES.DRAFT, EVENT_ACTIONS.READY), EVENT_STATES.READY);
  assert.equal(transition(EVENT_STATES.READY, EVENT_ACTIONS.START), EVENT_STATES.LIVE);
  assert.equal(transition(EVENT_STATES.LIVE, EVENT_ACTIONS.PAUSE), EVENT_STATES.PAUSED);
  assert.equal(transition(EVENT_STATES.PAUSED, EVENT_ACTIONS.START), EVENT_STATES.LIVE);
  assert.equal(transition(EVENT_STATES.PAUSED, EVENT_ACTIONS.END), EVENT_STATES.ENDED);
  assert.equal(transition(EVENT_STATES.ENDED, EVENT_ACTIONS.ARCHIVE), EVENT_STATES.ARCHIVED);
  assert.equal(transition(EVENT_STATES.ENDED, EVENT_ACTIONS.RESET), EVENT_STATES.DRAFT);
  assert.throws(() => transition(EVENT_STATES.ENDED, EVENT_ACTIONS.START), (e) => e.code === 'EVENT_ALREADY_ENDED');
  assert.throws(() => transition(EVENT_STATES.LIVE, EVENT_ACTIONS.START), (e) => e.code === 'EVENT_ALREADY_LIVE');
  assert.throws(() => transition(EVENT_STATES.DRAFT, EVENT_ACTIONS.PAUSE), (e) => e.code === 'EVENT_NOT_LIVE');
  assert.equal(canTransition(EVENT_STATES.ARCHIVED, EVENT_ACTIONS.START), false);
});

/* ---------------------------------------------------------------- clock */

test('session clock — expiry, event deadline, pause freeze', () => {
  const t0 = Date.parse('2045-09-17T09:00:00Z');
  const event = { status: EVENT_STATES.LIVE, startedAt: new Date(t0), durationMinutes: 60, pausedTotalMs: 0, extendedMs: 0 };
  const session = { status: SESSION_STATUS.ACTIVE, startedAt: new Date(t0 + 5 * 60000), expiresAt: computeExpiresAt(new Date(t0 + 5 * 60000), 60) };
  assert.equal(sessionRemainingMs(session, event, t0 + 5 * 60000), 60 * 60000 - 5 * 60000, 'bounded by the event deadline');
  assert.equal(sessionRemainingMs(session, event, t0 + 30 * 60000), 30 * 60000);
  assert.equal(isSessionExpired(session, event, t0 + 61 * 60000), true);
  const short = { ...session, expiresAt: new Date(t0 + 20 * 60000) };
  assert.equal(sessionRemainingMs(short, event, t0 + 10 * 60000), 10 * 60000);
  assert.equal(isSessionExpired(short, event, t0 + 20 * 60000), true);
  const paused = { ...event, status: EVENT_STATES.PAUSED, pausedAt: new Date(t0 + 10 * 60000) };
  assert.equal(sessionRemainingMs(short, paused, t0 + 15 * 60000), 10 * 60000, 'frozen at the pause');
  assert.equal(eventRemainingMs(paused, t0 + 15 * 60000), 50 * 60000);
  assert.equal(isSessionExpired(session, { ...event, status: EVENT_STATES.ENDED, endedAt: new Date(t0 + 30 * 60000) }, t0 + 31 * 60000), true);
  assert.equal(isSessionExpired({ ...session, status: SESSION_STATUS.COMPLETED }, event, t0 + 99 * 60000), false);
});

/* ---------------------------------------------------------- progression */

const CASE = {
  files: [
    { code: 'FILE_01', sequence: 1, challenges: [{ code: 'FILE_01' }] },
    { code: 'FILE_02', sequence: 2, challenges: [{ code: 'FILE_02' }] },
    { code: 'FILE_04', sequence: 4, challenges: [{ code: 'FILE_04A' }, { code: 'FILE_04B' }] },
    { code: 'FILE_03', sequence: 3, challenges: [{ code: 'FILE_03' }] },
    { code: 'FINAL', sequence: 99, isFinal: true, challenges: [{ code: 'FINAL' }] },
  ],
};

test('progression — sequential unlock, two-part file, final gate', () => {
  let p = deriveProgression(CASE, { files: [] });
  assert.equal(p.files[0].status, FILE_STATUS.AVAILABLE);
  assert.equal(p.files[1].status, FILE_STATUS.LOCKED);
  assert.equal(p.currentFileCode, 'FILE_01');
  assert.equal(p.currentChallengeCode, 'FILE_01');
  assert.equal(p.files.map((f) => f.code).join(','), 'FILE_01,FILE_02,FILE_03,FILE_04,FINAL', 'sorted by sequence, final last');

  const done = (code) => ({ code, completedAt: new Date() });
  p = deriveProgression(CASE, {
    files: [
      { code: 'FILE_01', challenges: [done('FILE_01')] },
      { code: 'FILE_02', challenges: [done('FILE_02')] },
      { code: 'FILE_03', challenges: [done('FILE_03')] },
      { code: 'FILE_04', openedAt: new Date(), challenges: [done('FILE_04A')] },
    ],
  });
  const f4 = p.files.find((f) => f.code === 'FILE_04');
  assert.equal(f4.status, FILE_STATUS.ACTIVE);
  assert.deepEqual(f4.challenges.map((c) => c.status), [CHALLENGE_STATUS.COMPLETED, CHALLENGE_STATUS.ACTIVE]);
  assert.equal(p.currentChallengeCode, 'FILE_04B');
  assert.equal(p.finalUnlocked, false);
  assert.equal(p.files.find((f) => f.code === 'FINAL').status, FILE_STATUS.LOCKED);

  p = deriveProgression(CASE, {
    files: ['FILE_01', 'FILE_02', 'FILE_03'].map((c) => ({ code: c, challenges: [done(c)] })).concat([{ code: 'FILE_04', challenges: [done('FILE_04A'), done('FILE_04B')] }]),
  });
  assert.equal(p.finalUnlocked, true);
  assert.equal(p.files.find((f) => f.code === 'FINAL').status, FILE_STATUS.AVAILABLE);
  assert.equal(p.completedCount, 4);
  assert.equal(p.allComplete, false);
  p = deriveProgression(CASE, { files: [...p.files.map((f) => ({ code: f.code, challenges: f.challenges.map((c) => done(c.code)) }))] });
  assert.equal(p.allComplete, true);
  assert.equal(p.currentFileCode, null);
});

/* ---------------------------------------------------------- leaderboard */

test('leaderboard ranking — score desc, completed, elapsed asc, ties share rank', () => {
  const rows = rankEntries([
    { displayName: 'a', score: 900, completed: true, elapsedMs: 3000 },
    { displayName: 'b', score: 950, completed: false, elapsedMs: null },
    { displayName: 'c', score: 900, completed: true, elapsedMs: 2000 },
    { displayName: 'd', score: 900, completed: true, elapsedMs: 2000 },
  ]);
  assert.deepEqual(rows.map((r) => `${r.displayName}${r.rank}`), ['b1', 'c2', 'd2', 'a4']);
  const byTime = rankEntries([{ displayName: 'x', score: 1, elapsedMs: 5 }, { displayName: 'y', score: 1, elapsedMs: 4 }], { order: ['elapsedMs:asc'] });
  assert.equal(byTime[0].displayName, 'y');
});
