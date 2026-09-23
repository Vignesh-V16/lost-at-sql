/**
 * Builds the SQLite DDL + parameterised inserts for a dataset definition.
 * Shared by the sandbox worker and the test helper so both build the exact
 * same schema. Pure — no I/O.
 *
 * Dataset table shape:
 *   { name, columns: [{ name, type, isPrimary?, references? }], primaryKey?: string[], indexes?: string[][], rows: object[] }
 */
const TYPE_MAP = { TEXT: 'TEXT', INTEGER: 'INTEGER', REAL: 'REAL', DATE: 'TEXT', DATETIME: 'TEXT', BOOLEAN: 'INTEGER' };
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

export function coerceCell(value, type) {
  if (value === null || value === undefined) return null;
  const t = String(type || 'TEXT').toUpperCase();
  if (t === 'BOOLEAN') return value ? 1 : 0;
  if (t === 'INTEGER' || t === 'REAL') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function assertIdentifier(name, what = 'identifier') {
  if (!IDENT.test(String(name || ''))) throw new Error(`Invalid ${what}: ${name}`);
  return name;
}

/**
 * @returns {{ statements: string[], inserts: Array<{sql: string, params: any[]}> }}
 */
export function buildSchemaSql(dataset) {
  const tables = Array.isArray(dataset) ? dataset : dataset?.tables || [];
  const statements = [];
  const inserts = [];
  for (const table of tables) {
    assertIdentifier(table.name, 'table name');
    const columns = table.columns || [];
    columns.forEach((c) => assertIdentifier(c.name, `column name in ${table.name}`));
    const pk = Array.isArray(table.primaryKey) && table.primaryKey.length ? table.primaryKey : columns.filter((c) => c.isPrimary).map((c) => c.name);
    const defs = columns.map((c) => {
      const sqlType = TYPE_MAP[String(c.type || 'TEXT').toUpperCase()] || 'TEXT';
      const single = pk.length === 1 && pk[0] === c.name;
      return `${quoteIdent(c.name)} ${sqlType}${single ? ' PRIMARY KEY' : ''}`;
    });
    if (pk.length > 1) defs.push(`PRIMARY KEY (${pk.map(quoteIdent).join(', ')})`);
    statements.push(`CREATE TABLE ${quoteIdent(table.name)} (${defs.join(', ')})`);

    const names = columns.map((c) => c.name);
    const placeholders = names.map(() => '?').join(', ');
    const insertSql = `INSERT INTO ${quoteIdent(table.name)} (${names.map(quoteIdent).join(', ')}) VALUES (${placeholders})`;
    for (const row of table.rows || []) {
      inserts.push({ sql: insertSql, params: names.map((n, i) => coerceCell(row[n], columns[i].type)) });
    }

    const indexes = Array.isArray(table.indexes) ? table.indexes : [];
    // Declared indexes first, then a helpful default on foreign-key columns.
    const seen = new Set();
    const addIndex = (cols) => {
      const key = cols.join(',');
      if (seen.has(key) || !cols.every((c) => names.includes(c))) return;
      seen.add(key);
      statements.push(`CREATE INDEX IF NOT EXISTS ${quoteIdent(`idx_${table.name}_${cols.join('_')}`)} ON ${quoteIdent(table.name)} (${cols.map(quoteIdent).join(', ')})`);
    };
    for (const idx of indexes) addIndex(Array.isArray(idx) ? idx : [idx]);
    for (const c of columns) if (c.references) addIndex([c.name]);
  }
  return { statements, inserts };
}
