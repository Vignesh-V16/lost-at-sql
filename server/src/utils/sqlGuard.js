/**
 * SQL guard — decides whether a participant statement may run.
 *
 * The investigation database is an in-memory SQLite instance rebuilt from
 * the dataset, opened in query_only mode and executed in a worker thread
 * with a hard timeout. This guard is the first line: it rejects anything
 * that is not a single read-only SELECT/WITH statement before the engine
 * ever sees it.
 */

const FORBIDDEN = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'INTO', 'UPSERT',
  'ATTACH', 'DETACH', 'PRAGMA', 'VACUUM', 'REINDEX', 'ANALYZE', 'BEGIN', 'COMMIT',
  'ROLLBACK', 'SAVEPOINT', 'RELEASE', 'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'TRIGGER',
];

const FORBIDDEN_FUNCTIONS = ['LOAD_EXTENSION', 'READFILE', 'WRITEFILE', 'FTS3_TOKENIZER', 'EDIT', 'RANDOMBLOB', 'ZEROBLOB'];
const SYSTEM_TABLES = ['SQLITE_MASTER', 'SQLITE_SCHEMA', 'SQLITE_TEMP_MASTER', 'SQLITE_SEQUENCE', 'SQLITE_STAT'];

export const MAX_SQL_LENGTH = 4000;

/** Remove -- line comments and block comments, and string literal contents. */
export function stripForAnalysis(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === quote && sql[i + 1] === quote) { i += 2; continue; }
        if (sql[i] === quote) break;
        i += 1;
      }
      i += 1;
      out += ' STR ';
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

export function stripComments(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < sql.length) {
        out += sql[i];
        if (sql[i] === quote && sql[i + 1] === quote) { out += sql[i + 1]; i += 2; continue; }
        if (sql[i] === quote) break;
        i += 1;
      }
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * @returns {{ ok: true, sql: string } | { ok: false, code: string, message: string }}
 */
export function guardSql(input, { maxLength = MAX_SQL_LENGTH } = {}) {
  if (typeof input !== 'string') {
    return { ok: false, code: 'SQL_EMPTY', message: 'No statement provided.' };
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, code: 'SQL_EMPTY', message: 'No statement provided.' };
  }
  if (trimmed.length > maxLength) {
    return { ok: false, code: 'SQL_TOO_LONG', message: `Statement exceeds ${maxLength} characters.` };
  }

  const analysed = stripForAnalysis(trimmed).trim();
  // Single statement only: strip one trailing semicolon, then reject any other.
  const withoutTrailing = analysed.replace(/;\s*$/, '');
  if (withoutTrailing.includes(';')) {
    return { ok: false, code: 'SQL_MULTIPLE_STATEMENTS', message: 'Only one statement may be executed at a time.' };
  }

  const upper = withoutTrailing.toUpperCase();
  if (!/^\s*(SELECT|WITH)\b/.test(upper)) {
    return { ok: false, code: 'SQL_READ_ONLY', message: 'Only SELECT statements are permitted on the investigation database.' };
  }

  const words = upper.match(/[A-Z_][A-Z0-9_]*/g) || [];
  const forbidden = words.find((w) => FORBIDDEN.includes(w));
  if (forbidden) {
    return { ok: false, code: 'SQL_FORBIDDEN_KEYWORD', message: `Keyword ${forbidden} is not permitted. The database is read-only.` };
  }
  const fn = words.find((w) => FORBIDDEN_FUNCTIONS.includes(w));
  if (fn) {
    return { ok: false, code: 'SQL_FORBIDDEN_FUNCTION', message: `Function ${fn} is not available.` };
  }
  const sys = words.find((w) => SYSTEM_TABLES.some((t) => w.startsWith(t)));
  if (sys) {
    return { ok: false, code: 'SQL_SYSTEM_TABLE', message: 'System tables are not accessible. Use the DATABASE explorer for schema.' };
  }

  const cleaned = stripComments(trimmed).trim().replace(/;\s*$/, '');
  return { ok: true, sql: cleaned };
}
