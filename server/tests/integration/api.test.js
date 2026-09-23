/**
 * End-to-end flow against the real API + MongoDB (see harness.js).
 * Run:  MONGODB_URI_TEST=mongodb://127.0.0.1:27017/lost_at_sql_test npm test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootHarness, SQL, FINAL_OK } from './harness.js';

let h;
let skipReason = null;
let coord;
let p1;
let p2;

before(async () => {
  h = await bootHarness();
  skipReason = h.skip;
  if (skipReason) return;
  coord = await h.login('coordinator', 'TEST-COORD-CODE');
  p1 = await h.login('vignesh', 'cipher-7741');
  p2 = await h.login('ananya', 'cipher-0932');
});

after(async () => {
  if (h && !skipReason) await h.close();
});

const it = (name, fn) => test(name, async (t) => {
  if (skipReason) return t.skip(skipReason);
  return fn(t);
});

const HIDDEN = /"(validation|referenceSql|referenceAnswer|onSuccess|reveal|passiveTrigger|answerKey|expected)"\s*:/;
const assertNoLeak = (body, where) => assert.doesNotMatch(JSON.stringify(body), HIDDEN, `hidden solution data leaked in ${where}`);

/* --------------------------------------------------------- auth / authz */

it('auth: wrong code is rejected, participant cannot reach /admin, coordinator cannot start an investigation', async () => {
  const bad = await h.client().post('/auth/login', { investigatorId: 'vignesh', accessCode: 'nope-nope' });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.error.code, 'INVALID_CREDENTIALS');
  const forbidden = await p1.api.get('/admin/event');
  assert.equal(forbidden.status, 403);
  const notParticipant = await coord.api.post('/investigation/start');
  assert.equal(notParticipant.status, 403);
  const me = await p1.api.get('/auth/me');
  assert.equal(me.body.data.role, 'participant');
});

it('auth: refresh rotates the token and a replayed refresh token revokes the family', async () => {
  const fresh = await h.login('rohan', 'cipher-1156');
  const r1 = await h.client().post('/auth/refresh', { refreshToken: fresh.refreshToken });
  assert.equal(r1.status, 200);
  assert.ok(r1.body.data.token);
  const replay = await h.client().post('/auth/refresh', { refreshToken: fresh.refreshToken });
  assert.equal(replay.status, 401);
  const afterReplay = await h.client().post('/auth/refresh', { refreshToken: r1.body.data.refreshToken });
  assert.equal(afterReplay.status, 401, 'whole family revoked after reuse');
});

/* ------------------------------------------------------- event lifecycle */

it('event: participants cannot start while DRAFT; state machine refuses invalid transitions', async () => {
  const draft = await p1.api.post('/investigation/start');
  assert.equal(draft.status, 423);
  assert.equal(draft.body.error.code, 'EVENT_NOT_STARTED');
  const pause = await coord.api.post('/admin/event/pause');
  assert.equal(pause.status, 409);
  const ready = await coord.api.post('/admin/event/ready');
  assert.equal(ready.body.data.status, 'ready');
  const start = await coord.api.post('/admin/event/start');
  assert.equal(start.body.data.status, 'live');
  const again = await coord.api.post('/admin/event/start');
  assert.equal(again.body.error.code, 'EVENT_ALREADY_LIVE');
  const pub = await h.client().get('/event/state');
  assert.equal(pub.body.data.status, 'live');
  assertNoLeak(pub.body, 'public event state');
});

/* ---------------------------------------------------------------- session */

it('session: briefing, start is idempotent (create then resume), view exposes no answers', async () => {
  const brief = await p1.api.get('/investigation/briefing');
  assert.match(brief.body.data.text, /Investigator VIGNESH|Investigator BLACK OPS/);
  const s1 = await p1.api.post('/investigation/start', {}, h.idem());
  assert.equal(s1.status, 200);
  assert.equal(s1.body.data.resumed, false);
  assert.equal(s1.body.data.score, 1000);
  assert.equal(s1.body.data.currentFileCode, 'FILE_01');
  assert.ok(s1.body.data.remainingMs > 59 * 60000 && s1.body.data.remainingMs <= 60 * 60000);
  const s2 = await p1.api.post('/investigation/start');
  assert.equal(s2.body.data.resumed, true);
  assert.equal(s2.body.data.id, s1.body.data.id);
  const view = await p1.api.get('/investigation/session');
  assertNoLeak(view.body, 'session view');
  assert.equal(view.body.data.session.suspects.length, 12);
  assert.ok(view.body.data.session.suspects.every((s) => s.state === 'UNKNOWN'));
  assert.equal(view.body.data.session.files.length, 6);
  assert.equal(view.body.data.session.files[1].status, 'locked');
});

it('case file: FILE 02 is locked, FILE 01 is readable and hint text is not pre-loaded', async () => {
  const locked = await p1.api.get('/cases/FILE_02');
  assert.equal(locked.status, 403);
  assert.equal(locked.body.error.code, 'FILE_LOCKED');
  const f1 = await p1.api.get('/cases/FILE_01');
  assert.equal(f1.status, 200);
  assertNoLeak(f1.body, 'FILE_01 view');
  const ch = f1.body.data.challenges[0];
  assert.equal(ch.status, 'active');
  assert.equal(ch.hints.length, 1);
  assert.equal(ch.hints[0].text, undefined);
  assert.equal(ch.successMessage, undefined);
  const schema = await p1.api.get('/cases/FILE_01/schema');
  assert.deepEqual(schema.body.data.map((t) => t.name).sort(), ['access_logs', 'employees']);
});

/* --------------------------------------------------------------- queries */

it('sql: guard blocks writes/PRAGMA/system tables and records them; errors are surfaced; results come back', async () => {
  for (const sql of ['DROP TABLE employees', 'PRAGMA table_info(employees)', 'SELECT * FROM sqlite_master', "INSERT INTO employees VALUES ('x','y','z','w','v')"]) {
    // eslint-disable-next-line no-await-in-loop
    const r = await p1.api.post('/cases/FILE_01/query', { sql });
    assert.equal(r.status, 400, sql);
    assert.match(r.body.error.code, /^SQL_/);
  }
  const bad = await p1.api.post('/cases/FILE_01/query', { sql: 'SELECT nope FROM employees' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'SQL_ERROR');
  const good = await p1.api.post('/cases/FILE_01/query', { sql: SQL.FILE_01 });
  assert.equal(good.status, 200);
  assert.equal(good.body.data.rowCount, 6);
  assert.ok(good.body.data.queryAttemptId);
  const hist = await p1.api.get('/investigation/queries');
  assert.ok(hist.body.data.length >= 6);
  const blocked = await coord.api.get('/admin/query-attempts?status=rejected');
  assert.ok(blocked.body.data.length >= 4);
  // dataset unchanged after the attack attempts
  const count = await p1.api.post('/cases/FILE_01/query', { sql: 'SELECT COUNT(*) AS n FROM employees' });
  assert.equal(count.body.data.rows[0][0], 12);
});

/* ---------------------------------------------------------- progression */

it('FILE 01: missing emp_id is not penalised, a wrong set costs 25, the right set completes the file and updates the board', async () => {
  const noEmp = await p1.api.post('/cases/FILE_01/submit', { sql: SQL.FILE_01_NO_EMP }, h.idem());
  assert.equal(noEmp.body.data.correct, false);
  assert.equal(noEmp.body.data.penalty, 0);
  assert.match(noEmp.body.data.message, /emp_id/);
  const wrong = await p1.api.post('/cases/FILE_01/submit', { sql: SQL.FILE_01_WRONG }, h.idem());
  assert.equal(wrong.body.data.correct, false);
  assert.equal(wrong.body.data.penalty, 25);
  assert.equal(wrong.body.data.score, 975);
  const q = await p1.api.post('/cases/FILE_01/query', { sql: SQL.FILE_01 });
  const right = await p1.api.post('/cases/FILE_01/submit', { queryAttemptId: q.body.data.queryAttemptId }, h.idem());
  assert.equal(right.status, 200);
  assert.equal(right.body.data.correct, true);
  assert.equal(right.body.data.fileCompleted, true);
  assert.equal(right.body.data.unlockedFileCode, 'FILE_02');
  assert.deepEqual(right.body.data.evidenceAwarded.map((e) => e.code), ['LAB_ENTRY_WINDOW']);
  assert.match(right.body.data.message, /Six employees/);
  const suspects = Object.fromEntries(right.body.data.suspects.map((s) => [s.id, s.state]));
  assert.equal(suspects.E101, 'SUSPECT');
  assert.equal(suspects.E103, 'CLEARED');
  assert.equal(suspects.E106, 'CLEARED');
  const again = await p1.api.post('/cases/FILE_01/submit', { sql: SQL.FILE_01 }, h.idem());
  assert.equal(again.body.data.alreadyCompleted, true, 'completed challenge re-submit is idempotent');
  assert.equal(again.body.data.score, 975);
});

it('hints: charged once per file, second use free, text returned', async () => {
  const f2 = await p1.api.get('/cases/FILE_02');
  const hint = f2.body.data.challenges[0].hints[0];
  const use1 = await p1.api.post(`/cases/FILE_02/hints/${hint.id}/use`, {}, h.idem());
  assert.equal(use1.status, 200);
  assert.match(use1.body.data.text, /disabled/);
  assert.equal(use1.body.data.penaltyApplied, 50);
  assert.equal(use1.body.data.score, 925);
  const use2 = await p1.api.post(`/cases/FILE_02/hints/${hint.id}/use`, {}, h.idem());
  assert.equal(use2.body.data.alreadyUsed, true);
  assert.equal(use2.body.data.score, 925);
});

it('proctoring: flags are recorded and deduped, the limit puts a session on hold, the coordinator releases it', async () => {
  const before = (await p1.api.get('/investigation/session')).body.data.session;
  assert.equal(before.proctor.enabled, true, 'recording is on by default');
  assert.equal(before.proctor.requireFullscreen, true);
  assert.equal(before.proctor.violations, 0);

  const bad = await p1.api.post('/investigation/proctor', { type: 'NONSENSE' });
  assert.equal(bad.status, 422, 'only known flags are accepted');
  const asCoordinator = await coord.api.post('/investigation/proctor', { type: 'TAB_HIDDEN' });
  assert.equal(asCoordinator.status, 403, 'coordinators are not proctored');

  const first = await p1.api.post('/investigation/proctor', { type: 'TAB_HIDDEN', file: 'FILE_02' });
  assert.equal(first.status, 200, JSON.stringify(first.body).slice(0, 200));
  assert.equal(first.body.data.recorded, true);
  assert.equal(first.body.data.violations, 1);
  const dupe = await p1.api.post('/investigation/proctor', { type: 'TAB_HIDDEN', file: 'FILE_02' });
  assert.equal(dupe.body.data.recorded, false, 'the same flag within a second counts once');
  assert.equal(dupe.body.data.violations, 1);
  const back = await p1.api.post('/investigation/proctor', { type: 'TAB_RETURN', durationMs: 4000 });
  assert.equal(back.body.data.violations, 1, 'coming back is recorded but is not a second flag');
  assert.equal(back.body.data.awayMs, 4000);
  const paste = await p1.api.post('/investigation/proctor', { type: 'PASTE', file: 'FILE_02' });
  assert.equal(paste.body.data.violations, 2);

  const seen = (await p1.api.get('/investigation/session')).body.data.session;
  assert.equal(seen.proctor.violations, 2, 'the participant sees their own tally');
  assert.equal(seen.proctor.awayMs, 4000);
  const monitor = await coord.api.get('/admin/monitor');
  const row = monitor.body.data.find((m) => m.username === 'vignesh');
  assert.equal(row.violations, 2, 'and so does the coordinator');
  assert.equal(row.proctorLocked, false);

  /* opt in to acting on the limit, trip it, and confirm the investigation stops */
  const tighten = await coord.api.post('/admin/event', { proctoring: { maxViolations: 3, onLimit: 'lock' }, force: true });
  assert.equal(tighten.status, 200, JSON.stringify(tighten.body).slice(0, 200));
  const trip = await p1.api.post('/investigation/proctor', { type: 'DEVTOOLS_KEY' });
  assert.equal(trip.body.data.violations, 3);
  assert.equal(trip.body.data.locked, true);
  const blocked = await p1.api.post('/cases/FILE_02/query', { sql: SQL.FILE_02 });
  assert.equal(blocked.status, 423);
  assert.equal(blocked.body.error.code, 'PROCTOR_LOCKED');
  const stillReadable = await p1.api.get('/investigation/session');
  assert.equal(stillReadable.status, 200, 'a held session can still be read, so the sheet can explain itself');
  assert.equal(stillReadable.body.data.session.proctor.locked, true);

  const sessionId = stillReadable.body.data.session.id;
  const released = await coord.api.post(`/admin/sessions/${sessionId}/proctor/unlock`, { reset: true });
  assert.equal(released.status, 200, JSON.stringify(released.body).slice(0, 200));
  const resumed = await p1.api.post('/cases/FILE_02/query', { sql: SQL.FILE_02 });
  assert.equal(resumed.status, 200, 'released, and the query runs again');
  assert.equal((await p1.api.get('/investigation/session')).body.data.session.proctor.violations, 0, 'the count was reset');
  await coord.api.post('/admin/event', { proctoring: { maxViolations: 0, onLimit: 'notify' }, force: true });
});

it('disqualification: a coordinator ends an investigation with a reason, it leaves the leaderboard, and a reinstate undoes it', async () => {
  const sessionId = (await p1.api.get('/investigation/session')).body.data.session.id;
  const noReason = await coord.api.post(`/admin/sessions/${sessionId}/disqualify`, { reason: 'x' });
  assert.equal(noReason.status, 422, 'a reason is required');

  const before = await coord.api.get('/leaderboard');
  assert.ok(before.body.data.rows.some((r) => r.displayName === 'VIGNESH'), 'on the board before');

  const dq = await coord.api.post(`/admin/sessions/${sessionId}/disqualify`, { reason: 'left full screen repeatedly and would not explain' });
  assert.equal(dq.status, 200, JSON.stringify(dq.body).slice(0, 200));
  assert.equal(dq.body.data.disqualified, true);

  const blocked = await p1.api.post('/cases/FILE_02/query', { sql: SQL.FILE_02 });
  assert.equal(blocked.status, 423);
  assert.equal(blocked.body.error.code, 'SESSION_DISQUALIFIED');
  const told = await p1.api.get('/investigation/session');
  assert.equal(told.body.data.session.status, 'disqualified');
  assert.equal(told.body.data.session.proctor.disqualified, true);
  assert.match(told.body.data.session.proctor.disqualifiedReason, /full screen/);

  const board = await coord.api.get('/leaderboard');
  assert.equal(board.body.data.rows.some((r) => r.displayName === 'VIGNESH'), false, 'off the board while disqualified');
  const monitor = await coord.api.get('/admin/monitor');
  const row = monitor.body.data.find((m) => m.username === 'vignesh');
  assert.equal(row.status, 'disqualified');
  assert.equal(row.disqualified, true);
  const detail = await coord.api.get(`/admin/sessions/${sessionId}`);
  assert.equal(detail.body.data.disqualifiedReason, 'left full screen repeatedly and would not explain');
  assert.ok(detail.body.data.violations.length, 'the flag record is kept for the appeal');
  assert.ok(detail.body.data.progression.some((f) => f.status === 'completed'), 'and so is the work');

  const again = await coord.api.post(`/admin/sessions/${sessionId}/disqualify`, { reason: 'same again' });
  assert.equal(again.body.data.alreadyDisqualified, true, 'disqualifying twice is a no-op');

  const back = await coord.api.post(`/admin/sessions/${sessionId}/reinstate`);
  assert.equal(back.status, 200, JSON.stringify(back.body).slice(0, 200));
  const resumed = await p1.api.post('/cases/FILE_02/query', { sql: SQL.FILE_02 });
  assert.equal(resumed.status, 200, 'reinstated, and the investigation continues');
  const notDq = await coord.api.post(`/admin/sessions/${sessionId}/reinstate`);
  assert.equal(notDq.status, 409, 'reinstating an active session is refused');
});


it('FILE 02: wrong result set costs nothing, yes/no answer is validated', async () => {
  const gate = await p1.api.post('/cases/FILE_02/submit', { sql: SQL.FILE_02_WRONG, answer: 'no' }, h.idem());
  assert.equal(gate.body.data.correct, false);
  assert.equal(gate.body.data.penalty, 0);
  assert.equal(gate.body.data.gateOpen, false);
  const noAnswer = await p1.api.post('/cases/FILE_02/submit', { sql: SQL.FILE_02 }, h.idem());
  assert.equal(noAnswer.body.data.needsAnswer, true);
  assert.equal(noAnswer.body.data.gateOpen, true);
  assert.equal(noAnswer.body.data.penalty, 0);
  const yes = await p1.api.post('/cases/FILE_02/submit', { sql: SQL.FILE_02, answer: 'yes' }, h.idem());
  assert.equal(yes.body.data.correct, false);
  assert.equal(yes.body.data.penalty, 25);
  const no = await p1.api.post('/cases/FILE_02/submit', { sql: SQL.FILE_02, answer: 'no' }, h.idem());
  assert.equal(no.body.data.correct, true);
  assert.equal(no.body.data.score, 900);
  assert.equal(Object.fromEntries(no.body.data.suspects.map((s) => [s.id, s.state])).E103, 'PERSON_OF_INTEREST');
});

it('FILE 03 → FILE 04A → FILE 04B: two-part file, connection recorded, prototype board state', async () => {
  const f3 = await p1.api.post('/cases/FILE_03/submit', { sql: SQL.FILE_03 }, h.idem());
  assert.equal(f3.body.data.correct, true);
  const board3 = Object.fromEntries(f3.body.data.suspects.map((s) => [s.id, s.state]));
  assert.equal(board3.E104, 'CLEARED');
  assert.equal(board3.E102, 'SUSPECT');
  const f4 = await p1.api.get('/cases/FILE_04');
  assert.equal(f4.body.data.currentChallengeCode, 'FILE_04A');
  const b = await p1.api.post('/cases/FILE_04/submit', { sql: SQL.FILE_04A_NO_EMP }, h.idem());
  assert.equal(b.body.data.correct, false, 'a result without emp_id cannot be verified');
  assert.equal(b.body.data.penalty, 0, 'a missing column is free, not a wrong answer');
  assert.match(b.body.data.message, /emp_id/);
  const a = await p1.api.post('/cases/FILE_04/submit', { sql: SQL.FILE_04A }, h.idem());
  assert.equal(a.body.data.correct, true);
  assert.equal(a.body.data.fileCompleted, false);
  assert.equal(a.body.data.nextChallengeCode, 'FILE_04B');
  assert.equal(a.body.data.successLabel, 'Confirm — Move to Part B');
  const b2 = await p1.api.post('/cases/FILE_04/submit', { sql: SQL.FILE_04B }, h.idem());
  assert.equal(b2.body.data.correct, true);
  assert.equal(b2.body.data.fileCompleted, true);
  assert.deepEqual(b2.body.data.connections, [{ source: 'E101', target: 'E103', type: 'ENCRYPTED_INTERNAL_COMMUNICATION' }]);
  const board = Object.fromEntries(b2.body.data.suspects.map((s) => [s.id, s.state]));
  assert.equal(board.E101, 'PRIME_SUSPECT');
  assert.equal(board.E103, 'ACCOMPLICE');
  assert.equal(board.E102, 'SUSPECT', 'prototype: remaining suspects are not cleared (D-1)');
});

it('FILE 05: the starter query is rejected, the narrowed query unlocks the final file', async () => {
  const starter = await p1.api.post('/cases/FILE_05/submit', { sql: SQL.FILE_05_STARTER }, h.idem());
  assert.equal(starter.body.data.correct, false);
  assert.equal(starter.body.data.penalty, 25);
  const locked = await p1.api.post('/final/submit', FINAL_OK, h.idem());
  assert.equal(locked.status, 403);
  const ok = await p1.api.post('/cases/FILE_05/submit', { sql: SQL.FILE_05 }, h.idem());
  assert.equal(ok.body.data.correct, true, 'a plain WHERE that finds the right person is accepted');
  assert.equal(ok.body.data.finalUnlocked, true);
  const view = await p1.api.get('/investigation/session');
  assert.equal(view.body.data.session.completedCount, 5);
  assert.equal(view.body.data.session.finalUnlocked, true);
  assert.equal(view.body.data.session.evidence.length, 6);
});

it('final: per-field feedback without answers, penalty, then completion with reveal + leaderboard row', async () => {
  const status = await p1.api.get('/final');
  assert.equal(status.body.data.unlocked, true);
  assertNoLeak(status.body, 'final status');
  const blank = await p1.api.post('/final/submit', { ...FINAL_OK, time: '   ' }, h.idem());
  assert.equal(blank.status, 400, 'a blank answer is refused before any attempt is spent');
  assert.match(blank.body.error.message, /still blank/);
  const wrong = await p1.api.post('/final/submit', { ...FINAL_OK, accomplice: 'E108', time: '09:55' }, h.idem());
  assert.equal(wrong.body.data.correct, false);
  assert.deepEqual(wrong.body.data.fields, { thief: true, accomplice: false, time: false, method: true });
  assert.match(wrong.body.data.message, /the accomplice, the time/);
  assert.equal(wrong.body.data.penalty, 25);
  assert.equal(wrong.body.data.reveal, undefined);
  const right = await p1.api.post('/final/submit', FINAL_OK, h.idem());
  assert.equal(right.body.data.correct, true);
  assert.equal(right.body.data.reveal.title, 'Black Cipher Recovered');
  assert.ok(right.body.data.elapsedMs >= 0);
  assert.equal(right.body.data.score, 850);
  const after = await p1.api.post('/final/submit', FINAL_OK, h.idem());
  assert.equal(after.status, 409, 'completed session rejects further actions');
  const lb = await p1.api.get('/leaderboard');
  const row = lb.body.data.rows.find((r) => r.displayName === 'VIGNESH');
  assert.equal(row.rank, 1);
  assert.equal(row.completed, true);
  assert.equal(row.score, 850);
  const sessionId = (await p1.api.get('/investigation/session')).body.data.session.id;
  const detail = await coord.api.get(`/admin/sessions/${sessionId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.ledger.reduce((n, t) => n + t.delta, 0), 850, 'ledger folds to the score');
});

/* ------------------------------------------------------------ concurrency */

it('concurrency: ten simultaneous identical submits complete a challenge exactly once and charge nothing twice', async () => {
  await p2.api.post('/investigation/start');
  const results = await Promise.all(Array.from({ length: 10 }, () => p2.api.post('/cases/FILE_01/submit', { sql: SQL.FILE_01 })));
  const statuses = results.map((r) => r.status);
  assert.ok(statuses.every((s) => s === 200), JSON.stringify(statuses));
  const completedNow = results.filter((r) => r.body.data.correct && !r.body.data.alreadyCompleted).length;
  assert.equal(completedNow, 1);
  const view = await p2.api.get('/investigation/session');
  assert.equal(view.body.data.session.score, 1000);
  assert.equal(view.body.data.session.evidence.length, 1);
  const wrongs = await Promise.all(Array.from({ length: 5 }, () => p2.api.post('/cases/FILE_02/submit', { sql: SQL.FILE_02, answer: 'yes' })));
  assert.ok(wrongs.every((r) => r.status === 200), JSON.stringify(wrongs.map((r) => [r.status, r.body?.error?.code || r.body?.error?.message || null])));
  const v2 = await p2.api.get('/investigation/session');
  assert.equal(v2.body.data.session.score, 875, 'five distinct wrong answers → five penalties');
});

it('idempotency: the same Idempotency-Key replays the stored response instead of re-running', async () => {
  const key = h.idem();
  const first = await p2.api.post('/cases/FILE_02/submit', { sql: SQL.FILE_02, answer: 'yes' }, key);
  const second = await p2.api.post('/cases/FILE_02/submit', { sql: SQL.FILE_02, answer: 'yes' }, key);
  assert.equal(second.body.replayed, true);
  assert.equal(second.body.data.score, first.body.data.score);
  const v = await p2.api.get('/investigation/session');
  assert.equal(v.body.data.session.score, 850, 'only one penalty for the two identical requests');
});

/* ------------------------------------------------------ pause / end / reset */

it('pause freezes the session clock, resume shifts the deadline, end expires active sessions', async () => {
  const before = await p2.api.get('/investigation/session');
  await coord.api.post('/admin/event/pause');
  const paused = await p2.api.post('/cases/FILE_02/query', { sql: SQL.FILE_02 });
  assert.equal(paused.status, 423);
  assert.equal(paused.body.error.code, 'EVENT_PAUSED');
  /* a hint already paid for is served free in any state (paused event, completed session);
     a fresh hint on a closed part is refused rather than charged */
  const f2p1 = await p1.api.get('/cases/FILE_02');
  const usedHint = f2p1.body.data.challenges[0].hints[0];
  assert.equal(usedHint.used, true);
  const replay = await p1.api.post(`/cases/FILE_02/hints/${usedHint.id}/use`, {}, h.idem());
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.data.alreadyUsed, true);
  assert.equal(replay.body.data.penaltyApplied, 0);
  assert.match(replay.body.data.text, /disabled/);
  const f1p1 = await p1.api.get('/cases/FILE_01');
  const closedHint = f1p1.body.data.challenges[0].hints[0];
  const refused = await p1.api.post(`/cases/FILE_01/hints/${closedHint.id}/use`, {}, h.idem());
  assert.equal(refused.status, 409, JSON.stringify(refused.body));
  assert.equal(refused.body.error.code, 'CHALLENGE_CLOSED');
  await new Promise((r) => setTimeout(r, 1200));
  const during = await p2.api.get('/investigation/session');
  assert.ok(Math.abs(during.body.data.session.remainingMs - before.body.data.session.remainingMs) < 1000, 'clock frozen while paused');
  await coord.api.post('/admin/event/resume');
  const resumed = await p2.api.get('/investigation/session');
  assert.ok(new Date(resumed.body.data.session.expiresAt) > new Date(before.body.data.session.expiresAt), 'deadline shifted by the pause');
  await coord.api.post('/admin/event/end');
  const ended = await p2.api.post('/cases/FILE_02/query', { sql: SQL.FILE_02 });
  assert.equal(ended.status, 423);
  const v = await p2.api.get('/investigation/session');
  assert.equal(v.body.data.session.status, 'time_expired');
  const startAgain = await coord.api.post('/admin/event/start');
  assert.equal(startAgain.body.error.code, 'EVENT_ALREADY_ENDED');
});

it('reset: RESET_EVENT requires confirmation, wipes sessions and returns the event to DRAFT (audited)', async () => {
  const noConfirm = await coord.api.post('/admin/event/reset', { mode: 'RESET_EVENT', confirm: 'wrong' });
  assert.equal(noConfirm.status, 400);
  const reset = await coord.api.post('/admin/event/reset', { mode: 'RESET_EVENT', confirm: 'black-cipher' });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.data.event.status, 'draft');
  const v = await p1.api.get('/investigation/session');
  assert.equal(v.body.data.session, null);
  const audit = await coord.api.get('/admin/audit-logs?action=RESET_EVENT');
  assert.ok(audit.body.data.total >= 1);
  const lb = await coord.api.get('/admin/leaderboard');
  assert.equal(lb.body.data.rows.length, 0);
});

it('content lock: challenge edits are refused while live unless forced; admin list includes hidden fields', async () => {
  await coord.api.post('/admin/event/start');
  const cases = await coord.api.get('/admin/cases');
  const f1 = cases.body.data.find((f) => f.code === 'FILE_01');
  assert.ok(f1.challenges[0].validation, 'coordinator sees validation config');
  const locked = await coord.api.patch(`/admin/challenges/${f1.challenges[0].id}`, { failureMessage: 'x' });
  assert.equal(locked.status, 409);
  const forced = await coord.api.patch(`/admin/challenges/${f1.challenges[0].id}`, { failureMessage: 'x', force: true });
  assert.equal(forced.status, 200);
  const badSpec = await coord.api.patch(`/admin/challenges/${f1.challenges[0].id}`, { validation: { strategy: 'NOPE' }, force: true });
  assert.equal(badSpec.status, 422);
  await coord.api.post('/admin/event/end');
});

it('answer key: coordinators get every file\'s reference query, its rows and the accepted answer; participants cannot', async () => {
  const denied = await p2.api.get('/admin/answers');
  assert.equal(denied.status, 403);
  /* reference SQL is coordinator-authored and runs in the shared sandbox: it must clear the read-only guard */
  const f1id = (await coord.api.get('/admin/cases')).body.data.find((f) => f.code === 'FILE_01').challenges[0].id;
  const unsafe = await coord.api.patch(`/admin/challenges/${f1id}`, { referenceSql: 'PRAGMA query_only = 0', force: true });
  assert.equal(unsafe.status, 400, JSON.stringify(unsafe.body).slice(0, 200));
  assert.match(unsafe.body.error.message, /referenceSql/);
  const key = await coord.api.get('/admin/answers');
  assert.equal(key.status, 200, JSON.stringify(key.body).slice(0, 300));
  const files = key.body.data.files;
  assert.equal(files.length, 6);
  const f1 = files.find((f) => f.code === 'FILE_01');
  assert.match(f1.challenges[0].sql, /JOIN/i);
  assert.equal(f1.challenges[0].resultError, null);
  assert.equal(f1.challenges[0].result.rowCount, 6);
  assert.deepEqual(f1.challenges[0].answer.values.map((v) => v.id).sort(), ['E101', 'E102', 'E104', 'E105', 'E109', 'E112']);
  assert.equal(f1.challenges[0].answer.values.find((v) => v.id === 'E101').name, 'Aditya Rao');
  assert.deepEqual(f1.challenges[0].skills, ['JOIN']);
  assert.deepEqual(f1.challenges[0].requiredSkills, [], 'the construct is guidance, not a requirement');
  assert.equal(f1.difficulty, 'easy');
  assert.match(f1.challenges[0].hints[0].text, /JOIN/);
  const f2 = files.find((f) => f.code === 'FILE_02');
  assert.equal(f2.challenges[0].answer.kind, 'boolean');
  assert.deepEqual(f2.challenges[0].answer.expected, ['no']);
  const f5 = files.find((f) => f.code === 'FILE_05');
  assert.deepEqual(f5.challenges[0].skills, ['GROUP_BY', 'HAVING', 'AGGREGATE']);
  assert.equal(f5.difficulty, 'medium');
  assert.equal(f5.challenges[0].result.rowCount, 1);
  const fin = files.find((f) => f.isFinal);
  assert.equal(fin.challenges[0].answer.kind, 'final');
  assert.equal(fin.challenges[0].answer.fields.find((x) => x.key === 'thief').value, 'E101');
  assert.equal(fin.challenges[0].answer.fields.find((x) => x.key === 'time').accepts, 'matches ^09:5[0-4]$');
  assert.equal(fin.challenges[0].sqlKind, 'starter');
});
