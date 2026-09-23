/**
 * Test helper: execute SQL against a dataset definition.
 *
 * Uses sql.js (the production engine) when it is installed; falls back to
 * the system python3 + sqlite3 module so the golden tests can run in an
 * environment without node_modules. Both paths build the schema exactly as
 * the production worker does (CREATE TABLE per column type, INSERT rows).
 */
import { spawnSync } from 'node:child_process';
import { buildSchemaSql } from '../../src/services/sqlSchema.js';

async function withSqlJs(dataset, queries) {
  let initSqlJs;
  try {
    ({ default: initSqlJs } = await import('sql.js'));
  } catch {
    return null;
  }
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const { statements, inserts } = buildSchemaSql(dataset);
  for (const s of statements) db.run(s);
  for (const { sql, params } of inserts) db.run(sql, params);
  return queries.map((q) => {
    try {
      const res = db.exec(q);
      if (!res.length) return { columns: [], rows: [] };
      return { columns: res[0].columns, rows: res[0].values };
    } catch (err) {
      return { error: err.message };
    }
  });
}

function withPython(dataset, queries) {
  const { statements, inserts } = buildSchemaSql(dataset);
  const script = `
import json, sqlite3, sys
payload = json.load(sys.stdin)
db = sqlite3.connect(':memory:')
for s in payload['statements']:
    db.execute(s)
for ins in payload['inserts']:
    db.execute(ins['sql'], ins['params'])
out = []
for q in payload['queries']:
    try:
        cur = db.execute(q)
        cols = [d[0] for d in cur.description] if cur.description else []
        out.append({'columns': cols, 'rows': [list(r) for r in cur.fetchall()]})
    except Exception as e:
        out.append({'error': str(e)})
print(json.dumps(out))
`;
  const res = spawnSync('python3', ['-c', script], { input: JSON.stringify({ statements, inserts, queries }), encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`python sqlite fallback failed: ${res.stderr}`);
  return JSON.parse(res.stdout);
}

export async function runQueries(dataset, queries) {
  const viaSqlJs = await withSqlJs(dataset, queries);
  if (viaSqlJs) return viaSqlJs;
  return withPython(dataset, queries);
}
