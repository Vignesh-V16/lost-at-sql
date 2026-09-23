import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * SqlSandbox — a small pool of worker threads, each holding its own
 * read-only copy of the investigation database. Queries are dispatched to
 * the least-busy worker; a query that exceeds its timeout gets its worker
 * terminated and respawned, so one runaway CTE never stalls the pool.
 *
 * The dataset image is immutable for the life of the event; `rebuild()`
 * swaps the whole pool atomically and keeps the previous dataset if the new
 * one fails to compile.
 */
class SqlWorkerHandle {
  constructor(dataset, index) {
    this.index = index;
    this.dataset = dataset;
    this.pending = new Map();
    this.busy = 0;
    this.worker = null;
    this.ready = null;
  }

  spawn() {
    const worker = new Worker(new URL('./sqlWorker.js', import.meta.url), {
      workerData: { dataset: this.dataset },
      env: {}, // never inherit MONGODB_URI / JWT_SECRET into the sandbox
      resourceLimits: { maxOldGenerationSizeMb: 192 },
    });
    this.worker = worker;
    this.ready = new Promise((resolve, reject) => {
      const onMessage = (msg) => {
        if (msg?.type === 'ready') {
          worker.off('message', onMessage);
          resolve();
        } else if (msg?.type === 'fatal') {
          worker.off('message', onMessage);
          reject(new Error(msg.error));
        }
      };
      worker.on('message', onMessage);
      worker.once('error', reject);
    });
    worker.on('message', (msg) => {
      if (msg?.type !== 'result') return;
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      this.pending.delete(msg.id);
      this.busy -= 1;
      if (msg.ok) entry.resolve(msg);
      else entry.reject(Object.assign(new Error(msg.error), { code: 'SQL_ERROR' }));
    });
    worker.on('error', (err) => {
      logger.error(`SQL worker #${this.index} crashed`, err);
      this.failAll('SQL engine crashed and is restarting', 'SQL_ENGINE_RESTART');
      this.respawn();
    });
    worker.on('exit', () => {
      if (this.worker === worker) this.worker = null;
    });
    return this.ready;
  }

  respawn() {
    this.worker = null;
    this.spawn().catch((e) => logger.error(`SQL worker #${this.index} respawn failed`, e));
  }

  failAll(message, code) {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(Object.assign(new Error(message), { code }));
      this.pending.delete(id);
    }
    this.busy = 0;
  }

  async terminate(reason) {
    if (!this.worker) return;
    const w = this.worker;
    this.worker = null;
    this.failAll(`SQL engine restarted (${reason})`, 'SQL_ENGINE_RESTART');
    try {
      await w.terminate();
    } catch {
      /* ignore */
    }
  }

  execute(id, sql, maxRows, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.busy -= 1;
        reject(Object.assign(new Error(`Query exceeded the ${timeoutMs / 1000}s execution limit`), { code: 'SQL_TIMEOUT' }));
        logger.warn(`SQL worker #${this.index}: query #${id} timed out after ${timeoutMs}ms — respawning`);
        const w = this.worker;
        this.worker = null;
        this.failAll('SQL engine restarted after a timeout', 'SQL_ENGINE_RESTART');
        Promise.resolve(w?.terminate()).catch(() => {}).finally(() => this.respawn());
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.busy += 1;
      this.worker.postMessage({ type: 'execute', id, sql, maxRows });
    });
  }
}

class SqlService {
  constructor() {
    this.dataset = null;
    this.workers = [];
    this.seq = 0;
    this.poolSize = Math.max(1, Math.min(Number(env.SQL_POOL_SIZE) || 0, 16) || Math.min(4, os.cpus().length || 1));
    this.timeouts = 0;
    this.executed = 0;
  }

  get isReady() {
    return this.workers.length > 0 && this.workers.some((w) => w.worker);
  }

  get datasetChecksum() {
    return this.dataset ? this.dataset.checksum : null;
  }

  static checksum(dataset) {
    return createHash('sha256').update(JSON.stringify(dataset.tables)).digest('hex').slice(0, 16);
  }

  /** Normalise DatabaseTable documents (or content definitions) into the sandbox dataset shape. */
  static normalise(tables) {
    return {
      tables: tables.map((t) => ({
        name: t.name,
        columns: (t.columns || []).map((c) => ({ name: c.name, type: c.type || 'TEXT', isPrimary: Boolean(c.isPrimary), references: c.references || null })),
        primaryKey: Array.isArray(t.primaryKey) && t.primaryKey.length ? t.primaryKey : (t.columns || []).filter((c) => c.isPrimary).map((c) => c.name),
        indexes: Array.isArray(t.indexes) ? t.indexes : [],
        rows: t.rows || [],
      })),
    };
  }

  async rebuild(tables) {
    const next = SqlService.normalise(tables);
    next.checksum = SqlService.checksum(next);
    const previous = this.dataset;
    const previousWorkers = this.workers;
    const handles = Array.from({ length: this.poolSize }, (_, i) => new SqlWorkerHandle(next, i));
    try {
      await Promise.all(handles.map((h) => h.spawn()));
    } catch (err) {
      await Promise.all(handles.map((h) => h.terminate('rebuild-failed')));
      logger.error('SQL engine rebuild failed — keeping the previous dataset', err);
      throw Object.assign(new Error(`Dataset rejected by SQL engine: ${err.message}`), { code: 'SQL_BUILD_FAILED' });
    }
    this.dataset = next;
    this.workers = handles;
    await Promise.all(previousWorkers.map((h) => h.terminate('rebuild')));
    const rows = next.tables.reduce((n, t) => n + t.rows.length, 0);
    logger.info(`SQL engine ready — ${next.tables.length} tables, ${rows} rows, ${handles.length} worker(s), checksum ${next.checksum}${previous ? ' (replaced)' : ''}`);
  }

  async terminate(reason) {
    const ws = this.workers;
    this.workers = [];
    await Promise.all(ws.map((h) => h.terminate(reason)));
  }

  pick() {
    const live = this.workers.filter((w) => w.worker);
    if (!live.length) return null;
    return live.reduce((best, w) => (w.busy < best.busy ? w : best), live[0]);
  }

  /**
   * @returns {Promise<{columns:string[], rows:any[][], rowCount:number, truncated:boolean, durationMs:number}>}
   */
  async execute(sql, { maxRows = env.QUERY_MAX_ROWS, timeoutMs = env.QUERY_TIMEOUT_MS } = {}) {
    if (!this.dataset) throw Object.assign(new Error('SQL engine not initialised'), { code: 'SQL_ENGINE_OFFLINE' });
    let handle = this.pick();
    if (!handle) {
      // Every worker is mid-respawn: wait for one.
      await Promise.race(this.workers.map((w) => w.ready || Promise.resolve()));
      handle = this.pick();
      if (!handle) throw Object.assign(new Error('SQL engine is restarting'), { code: 'SQL_ENGINE_RESTART' });
    }
    await handle.ready;
    this.executed += 1;
    const id = ++this.seq;
    try {
      return await handle.execute(id, sql, maxRows, timeoutMs);
    } catch (err) {
      if (err.code === 'SQL_TIMEOUT') this.timeouts += 1;
      throw err;
    }
  }

  schemaSummary() {
    if (!this.dataset) return [];
    return this.dataset.tables.map((t) => ({ name: t.name, columns: t.columns.map((c) => c.name), rowCount: t.rows.length }));
  }

  stats() {
    return { poolSize: this.poolSize, live: this.workers.filter((w) => w.worker).length, busy: this.workers.reduce((n, w) => n + w.busy, 0), executed: this.executed, timeouts: this.timeouts, checksum: this.datasetChecksum };
  }
}

export const sqlService = new SqlService();

export function hashSql(sql) {
  return createHash('sha256').update(String(sql).replace(/\s+/g, ' ').trim().toLowerCase()).digest('hex').slice(0, 24);
}

export function hashResult(result) {
  const canon = { c: (result.columns || []).map((c) => String(c).toLowerCase()), r: (result.rows || []).map((r) => r.map((v) => (v === null || v === undefined ? null : String(v)))).sort() };
  return createHash('sha256').update(JSON.stringify(canon)).digest('hex').slice(0, 24);
}
