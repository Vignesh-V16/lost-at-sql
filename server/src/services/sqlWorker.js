/**
 * SQL sandbox worker.
 *
 * Runs inside a worker_thread so that a pathological query can be killed by
 * the parent with a hard timeout without affecting the API process. Holds an
 * in-memory SQLite database (sql.js, WebAssembly — no native build, no file
 * system, no network) compiled from the dataset it receives at start-up and
 * opened in query_only mode. It never sees application-database credentials
 * (the parent passes an empty env).
 */
import { parentPort, workerData } from 'node:worker_threads';
import initSqlJs from 'sql.js';
import { buildSchemaSql } from './sqlSchema.js';

const MAX_CELL_CHARS = 2000;

function buildDatabase(SQL, dataset) {
  const db = new SQL.Database();
  const { statements, inserts } = buildSchemaSql(dataset);
  for (const s of statements) db.run(s);
  let currentSql = null;
  let stmt = null;
  for (const ins of inserts) {
    if (ins.sql !== currentSql) {
      if (stmt) stmt.free();
      stmt = db.prepare(ins.sql);
      currentSql = ins.sql;
    }
    stmt.run(ins.params);
  }
  if (stmt) stmt.free();
  db.run('PRAGMA query_only = 1');
  return db;
}

function serialise(value) {
  if (value instanceof Uint8Array) return `<blob ${value.length} bytes>`;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.length > MAX_CELL_CHARS) return `${value.slice(0, MAX_CELL_CHARS)}…`;
  return value;
}

function execute(db, sql, maxRows) {
  /* Last line of defence, whoever the caller is: `PRAGMA query_only = 1` can
     be switched off by a later statement on the same connection, so nothing
     but a single SELECT/WITH may reach the database. */
  const bare = String(sql || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .trim();
  if (!/^(SELECT|WITH)\b/i.test(bare)) {
    throw Object.assign(new Error('Only SELECT statements may run on the investigation database.'), { code: 'SQL_READ_ONLY' });
  }
  const started = process.hrtime.bigint();
  const stmt = db.prepare(sql);
  let columns = [];
  const rows = [];
  let truncated = false;
  try {
    columns = stmt.getColumnNames();
    while (stmt.step()) {
      if (rows.length >= maxRows) {
        truncated = true;
        break;
      }
      rows.push(stmt.get().map(serialise));
    }
  } finally {
    stmt.free();
  }
  const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
  return { columns, rows, rowCount: rows.length, truncated, durationMs: Math.round(durationMs * 1000) / 1000 };
}

(async () => {
  try {
    const SQL = await initSqlJs();
    const db = buildDatabase(SQL, workerData.dataset || { tables: [] });
    parentPort.postMessage({ type: 'ready' });
    parentPort.on('message', (msg) => {
      if (!msg || msg.type !== 'execute') return;
      try {
        const result = execute(db, msg.sql, msg.maxRows || 500);
        parentPort.postMessage({ type: 'result', id: msg.id, ok: true, ...result });
      } catch (err) {
        parentPort.postMessage({ type: 'result', id: msg.id, ok: false, error: err.message || String(err) });
      }
    });
  } catch (err) {
    parentPort.postMessage({ type: 'fatal', error: err.message || String(err) });
  }
})();
