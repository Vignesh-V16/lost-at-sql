/**
 * Integration harness: boots the real Express app against a throwaway
 * MongoDB database (MONGODB_URI_TEST, default mongodb://127.0.0.1:27017/lost_at_sql_test),
 * seeds the Black Cipher content and exposes a tiny JSON client.
 *
 * Skips cleanly when dependencies are not installed or MongoDB is unreachable,
 * so `npm test` still passes in a bare checkout.
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/lost_at_sql_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret-integration-test-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.LOG_LEVEL = 'error';
process.env.SQL_POOL_SIZE = '1';
process.env.SEED_COORDINATOR_ID = 'coordinator';
process.env.SEED_COORDINATOR_CODE = 'TEST-COORD-CODE';

export async function bootHarness() {
  let mongoose;
  try {
    ({ default: mongoose } = await import('mongoose'));
    await import('express');
    await import('sql.js');
  } catch (err) {
    return { skip: `dependencies not installed (${err.message})` };
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 2500 });
  } catch (err) {
    return { skip: `MongoDB unreachable at ${process.env.MONGODB_URI} (${err.message})` };
  }
  await mongoose.connection.dropDatabase();

  const [{ createApp }, seed, { datasetService }, { eventService }, { sqlService }, models] = await Promise.all([
    import('../../src/app.js'),
    import('../../src/scripts/seed.js'),
    import('../../src/services/datasetService.js'),
    import('../../src/services/eventService.js'),
    import('../../src/services/sqlService.js'),
    import('../../src/models/index.js'),
  ]);
  await seed.ensureBaseline();
  await seed.seedDemoParticipants({ force: true });
  await datasetService.initialise();

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const client = (token) => {
    const call = async (method, path, body, headers = {}) => {
      const res = await fetch(base + path, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: res.status, ok: res.ok, body: json, headers: res.headers };
    };
    return {
      get: (p, h) => call('GET', p, undefined, h),
      post: (p, b, h) => call('POST', p, b ?? {}, h),
      patch: (p, b, h) => call('PATCH', p, b ?? {}, h),
      put: (p, b, h) => call('PUT', p, b ?? {}, h),
      delete: (p, h) => call('DELETE', p, undefined, h),
    };
  };

  const login = async (id, code) => {
    const res = await client().post('/auth/login', { investigatorId: id, accessCode: code });
    if (!res.ok) throw new Error(`login failed for ${id}: ${JSON.stringify(res.body)}`);
    return { token: res.body.data.token, refreshToken: res.body.data.refreshToken, user: res.body.data.user, api: client(res.body.data.token) };
  };

  const close = async () => {
    eventService.stopWatchdog();
    await new Promise((resolve) => server.close(resolve));
    await sqlService.terminate('test-end');
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  };

  return { skip: null, base, client, login, close, models, mongoose, eventService, datasetService, seed, idem: () => ({ 'idempotency-key': randomUUID() }) };
}

/** Prototype-exact queries used across the flow tests. */
export const SQL = {
  /* each SQL file also demands its skill (JOIN / subquery / GROUP BY + HAVING + aggregate) — see SQL_USES */
  FILE_01: "SELECT e.emp_id, e.name FROM employees e JOIN access_logs a ON a.emp_id = e.emp_id WHERE a.door_name = 'Research Lab' AND a.access_type = 'entry' AND a.access_time BETWEEN '2045-09-17 09:45:00' AND '2045-09-17 09:58:00'",
  FILE_01_WRONG: "SELECT e.emp_id, e.name FROM employees e JOIN access_logs a ON a.emp_id = e.emp_id WHERE a.door_name = 'Research Lab'",
  FILE_01_NO_EMP: "SELECT name FROM employees",
  FILE_01_NO_JOIN: "SELECT emp_id, 'x' AS name FROM access_logs WHERE door_name = 'Research Lab' AND access_type = 'entry' AND access_time BETWEEN '2045-09-17 09:45:00' AND '2045-09-17 09:58:00'",
  FILE_02: "SELECT c.emp_id, e.name, c.action FROM cctv_admin_logs c JOIN employees e ON e.emp_id = c.emp_id WHERE c.action = 'disabled'",
  FILE_02_WRONG: "SELECT c.emp_id, e.name FROM cctv_admin_logs c JOIN employees e ON e.emp_id = c.emp_id WHERE c.action = 'enabled'",
  FILE_03: "SELECT emp_id FROM project_members WHERE project_name = 'Black Cipher' AND emp_id IN (SELECT emp_id FROM access_logs WHERE door_name = 'Research Lab' AND access_type = 'entry' AND access_time BETWEEN '2045-09-17 09:45:00' AND '2045-09-17 09:58:00')",
  FILE_04A: "SELECT emp_id, COUNT(*) AS encrypted_messages FROM communications WHERE message_type = 'encrypted' GROUP BY emp_id HAVING COUNT(*) > 1",
  FILE_04B: "SELECT emp_id, contact_person FROM communications WHERE emp_id = 'E101' AND contact_type = 'internal' AND message_type = 'encrypted'",
  /* grouped but not narrowed: every 16-Sept payee comes back, so it is a wrong set and costs points */
  FILE_05_STARTER: "SELECT emp_id, SUM(amount) AS total FROM transactions WHERE txn_date = '2045-09-16' GROUP BY emp_id HAVING SUM(amount) > 50000",
  /* deliberately the beginner's route: a plain WHERE, no GROUP BY — it must be accepted */
  FILE_05: "SELECT emp_id FROM transactions WHERE txn_date = '2045-09-16' AND amount > 1000000",
  FILE_04A_NO_EMP: 'SELECT contact_person FROM communications',
};

export const FINAL_OK = { thief: 'E101', accomplice: 'E103', time: '09:52', method: 'cctv' };
