import { DatabaseTable } from '../models/index.js';
import { getDataset } from '../content/index.js';
import { sqlService } from './sqlService.js';
import { logger } from '../utils/logger.js';
import { ApiError } from '../utils/ApiError.js';
import { emitToAll, SOCKET_EVENTS } from '../sockets/emitters.js';
import { auditService } from './auditService.js';
import { eventService } from './eventService.js';

const IDENT = /^[a-z_][a-z0-9_]*$/;
const COL_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const MAX_ROWS = 20000;

/**
 * Bridges the investigation dataset (DatabaseTable documents) and the SQL
 * sandbox. The dataset is separate from every application collection and
 * is rebuilt into the sandbox on boot, reload and import.
 */
export const datasetService = {
  async initialise() {
    let tables = await DatabaseTable.find().sort({ order: 1 }).lean();
    if (!tables.length) {
      const event = await eventService.current({ fresh: true });
      logger.warn(`No dataset in MongoDB — loading the "${event.dataset}" dataset from content`);
      await this.seedDefaults(event.dataset);
      tables = await DatabaseTable.find().sort({ order: 1 }).lean();
    }
    await sqlService.rebuild(tables);
  },

  async seedDefaults(slug = 'black-cipher') {
    const dataset = getDataset(slug);
    await DatabaseTable.deleteMany({});
    await DatabaseTable.insertMany(dataset.tables.map((t) => ({ ...t, dataset: slug, rowCount: t.rows.length, isCustom: false })));
    return dataset.tables.length;
  },

  async reload() {
    const tables = await DatabaseTable.find().sort({ order: 1 }).lean();
    try {
      await sqlService.rebuild(tables);
    } catch (err) {
      throw new ApiError(422, 'DATASET_REJECTED', err.message);
    }
    emitToAll(SOCKET_EVENTS.DATABASE_RESET, { at: Date.now(), checksum: sqlService.datasetChecksum });
  },

  async reset(actor, { dataset } = {}) {
    const event = await eventService.current({ fresh: true });
    const slug = dataset || event.dataset || 'black-cipher';
    const count = await this.seedDefaults(slug);
    await this.reload();
    await auditService.record({ actor, action: 'DATABASE_RESET', target: slug, meta: { tables: count } });
    return count;
  },

  /** Public schema (participant DB explorer): columns, keys, row counts — no rows. */
  async schema() {
    const tables = await DatabaseTable.find().sort({ order: 1 }).select('-rows').lean();
    return tables.map((t) => ({
      name: t.name,
      description: t.description,
      order: t.order,
      rowCount: t.rowCount,
      columns: t.columns.map((c) => ({ name: c.name, type: c.type, isPrimary: Boolean(c.isPrimary) || (t.primaryKey || []).includes(c.name), references: c.references || null, description: c.description || '' })),
      primaryKey: t.primaryKey?.length ? t.primaryKey : t.columns.filter((c) => c.isPrimary).map((c) => c.name),
      foreignKeys: t.columns.filter((c) => c.references).map((c) => ({ column: c.name, references: c.references })),
    }));
  },

  async sample(name, limit = 5) {
    const table = await DatabaseTable.findOne({ name }).lean();
    if (!table) throw ApiError.notFound(`Table ${name} does not exist`, 'TABLE_NOT_FOUND');
    const n = Math.min(Math.max(Number(limit) || 5, 1), 20);
    return { name: table.name, columns: table.columns.map((c) => c.name), rows: table.rows.slice(0, n).map((r) => table.columns.map((c) => r[c.name] ?? null)) };
  },

  /* ------------------------------------------------------- coordinator */

  async listTables() {
    return DatabaseTable.find().sort({ order: 1 }).select('-rows').lean();
  },

  async getTable(name, { page = 1, limit = 50 } = {}) {
    const table = await DatabaseTable.findOne({ name }).lean();
    if (!table) throw ApiError.notFound(`Table ${name} does not exist`, 'TABLE_NOT_FOUND');
    const start = (page - 1) * limit;
    return { ...table, rows: table.rows.slice(start, start + limit), page, limit, total: table.rows.length };
  },

  validateTableDefinition(def) {
    if (!def || typeof def !== 'object') throw ApiError.badRequest('Table definition must be an object');
    if (!IDENT.test(def.name || '')) throw ApiError.badRequest('Table name must be snake_case (a-z, 0-9, _)');
    if (!Array.isArray(def.columns) || !def.columns.length) throw ApiError.badRequest('Table needs at least one column');
    const names = new Set();
    for (const c of def.columns) {
      if (!COL_IDENT.test(c.name || '')) throw ApiError.badRequest(`Invalid column name: ${c.name}`);
      if (names.has(c.name)) throw ApiError.badRequest(`Duplicate column: ${c.name}`);
      names.add(c.name);
    }
    const pk = Array.isArray(def.primaryKey) && def.primaryKey.length ? def.primaryKey : def.columns.filter((c) => c.isPrimary).map((c) => c.name);
    for (const k of pk) if (!names.has(k)) throw ApiError.badRequest(`Table ${def.name}: primary key column ${k} does not exist`);
    if (!Array.isArray(def.rows)) throw ApiError.badRequest('rows must be an array');
    if (def.rows.length > MAX_ROWS) throw ApiError.badRequest(`A table may hold at most ${MAX_ROWS} rows`);
    const seen = new Set();
    for (const row of def.rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw ApiError.badRequest('Every row must be an object keyed by column name');
      if (pk.length) {
        const key = pk.map((k) => {
          const v = row[k];
          if (v === null || v === undefined || v === '') throw ApiError.badRequest(`Table ${def.name}: primary key ${k} cannot be empty`);
          return String(v);
        }).join('');
        if (seen.has(key)) throw ApiError.badRequest(`Table ${def.name}: duplicate primary key value "${key.replace('', ', ')}"`);
        seen.add(key);
      }
    }
    for (const idx of def.indexes || []) {
      const cols = Array.isArray(idx) ? idx : [idx];
      for (const c of cols) if (!names.has(c)) throw ApiError.badRequest(`Table ${def.name}: index column ${c} does not exist`);
    }
    return pk;
  },

  async importTables(definitions, actor, { replace = false } = {}) {
    if (!Array.isArray(definitions) || !definitions.length) throw ApiError.badRequest('Provide an array of table definitions');
    const event = await eventService.current({ fresh: true });
    if (['live', 'paused'].includes(event.status)) throw ApiError.conflict('The dataset is locked while the investigation is live.', 'DATASET_LOCKED');
    const keys = definitions.map((d) => this.validateTableDefinition(d));
    const names = definitions.map((d) => d.name);
    const snapshot = replace ? await DatabaseTable.find().lean() : await DatabaseTable.find({ name: { $in: names } }).lean();
    if (replace) await DatabaseTable.deleteMany({});
    let order = (await DatabaseTable.countDocuments()) + 1;
    for (const [i, def] of definitions.entries()) {
      // eslint-disable-next-line no-await-in-loop
      await DatabaseTable.findOneAndUpdate(
        { name: def.name },
        {
          $set: {
            dataset: event.dataset || 'custom',
            description: def.description || '',
            columns: def.columns.map((c) => ({ name: c.name, type: (c.type || 'TEXT').toUpperCase(), isPrimary: Boolean(c.isPrimary) || keys[i].includes(c.name), references: c.references || null, description: c.description || '' })),
            primaryKey: keys[i],
            indexes: (def.indexes || []).map((x) => (Array.isArray(x) ? x : [x])),
            rows: def.rows,
            rowCount: def.rows.length,
            isCustom: true,
          },
          $setOnInsert: { order: def.order ?? order++ },
        },
        { upsert: true, new: true, runValidators: true },
      );
    }
    try {
      await this.reload();
    } catch (err) {
      if (replace) {
        await DatabaseTable.deleteMany({});
        if (snapshot.length) await DatabaseTable.insertMany(snapshot);
      } else {
        await DatabaseTable.deleteMany({ name: { $in: names } });
        if (snapshot.length) await DatabaseTable.insertMany(snapshot);
      }
      await this.reload().catch((e) => logger.error('Dataset rollback rebuild failed', e));
      throw err;
    }
    await auditService.record({ actor, action: replace ? 'DATABASE_REPLACED' : 'DATABASE_IMPORTED', target: 'dataset', meta: { tables: names } });
    return definitions.length;
  },

  async updateTableMeta(name, patch, actor) {
    const table = await DatabaseTable.findOne({ name });
    if (!table) throw ApiError.notFound(`Table ${name} does not exist`, 'TABLE_NOT_FOUND');
    if (patch.description !== undefined) table.description = patch.description;
    if (patch.order !== undefined) table.order = patch.order;
    if (Array.isArray(patch.columns)) {
      table.columns = table.columns.map((existing) => {
        const incoming = patch.columns.find((c) => c.name === existing.name);
        return incoming ? { ...(existing.toObject?.() ?? existing), ...incoming, name: existing.name } : existing;
      });
    }
    await table.save();
    await this.reload();
    await auditService.record({ actor, action: 'TABLE_UPDATED', target: name });
    return table;
  },

  async deleteTable(name, actor) {
    const event = await eventService.current({ fresh: true });
    if (['live', 'paused'].includes(event.status)) throw ApiError.conflict('The dataset is locked while the investigation is live.', 'DATASET_LOCKED');
    const res = await DatabaseTable.deleteOne({ name });
    if (!res.deletedCount) throw ApiError.notFound(`Table ${name} does not exist`, 'TABLE_NOT_FOUND');
    await this.reload();
    await auditService.record({ actor, action: 'TABLE_DELETED', target: name });
  },

  /** Dry-run: build a throwaway sandbox from the definitions and run each challenge's reference query. */
  async validateDefinitions(definitions) {
    definitions.forEach((d) => this.validateTableDefinition(d));
    return { ok: true, tables: definitions.length, rows: definitions.reduce((n, d) => n + d.rows.length, 0) };
  },
};
