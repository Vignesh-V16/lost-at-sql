/**
 * ResultSet — the one shape every validator consumes.
 *
 * Wraps the { columns, rows } produced by the SQL sandbox. Column lookup is
 * case-insensitive (the prototype compared `c.toLowerCase() === 'emp_id'`),
 * and cell values are normalised the same way the prototype did:
 * `String(value).trim().toUpperCase()`. NULL becomes the literal string
 * "NULL" so that it can never accidentally equal an empty expected value.
 */
export function normalizeCell(value, { caseInsensitive = true } = {}) {
  if (value === null || value === undefined) return 'NULL';
  const s = typeof value === 'number' ? String(value) : String(value).trim();
  return caseInsensitive ? s.toUpperCase() : s;
}

export class ResultSet {
  /**
   * @param {{columns?: string[], rows?: any[][]}} raw
   */
  constructor(raw = {}) {
    this.columns = Array.isArray(raw.columns) ? raw.columns.map(String) : [];
    this.rows = Array.isArray(raw.rows) ? raw.rows : [];
    this.truncated = Boolean(raw.truncated);
    this._lower = this.columns.map((c) => c.toLowerCase());
  }

  static from(raw) {
    if (raw instanceof ResultSet) return raw;
    return new ResultSet(raw || {});
  }

  get rowCount() {
    return this.rows.length;
  }

  get isEmpty() {
    return this.rows.length === 0;
  }

  columnIndex(name) {
    if (typeof name !== 'string') return -1;
    return this._lower.indexOf(name.toLowerCase());
  }

  hasColumn(name) {
    return this.columnIndex(name) !== -1;
  }

  missingColumns(names = []) {
    return names.filter((n) => !this.hasColumn(n));
  }

  /** Raw cell values of one column, in row order. */
  column(name) {
    const idx = this.columnIndex(name);
    if (idx === -1) return [];
    return this.rows.map((r) => (Array.isArray(r) ? r[idx] : r?.[this.columns[idx]]));
  }

  /** Normalised values of one column. */
  values(name, opts) {
    return this.column(name).map((v) => normalizeCell(v, opts));
  }

  /** Normalised, de-duplicated values of one column. */
  valueSet(name, opts) {
    return new Set(this.values(name, opts));
  }

  /** Rows as objects keyed by (original) column name. */
  objects() {
    return this.rows.map((r) => {
      if (!Array.isArray(r)) return { ...r };
      const o = {};
      this.columns.forEach((c, i) => {
        o[c] = r[i];
      });
      return o;
    });
  }
}

export function setsEqual(a, b) {
  if (!a || !b || a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
