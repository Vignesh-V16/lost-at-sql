import { IdempotencyKey } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

/**
 * Idempotency-Key support for mutating participant endpoints (spec §29).
 *
 *   Idempotency-Key: <client-generated uuid per click>
 *
 * The first request claims the key (unique index on user+key), runs the
 * handler and stores the response; a retry with the same key replays that
 * response (`replayed: true`). A retry that arrives while the first is
 * still running gets 409 REQUEST_IN_PROGRESS rather than a second execution.
 *
 * Mounted after requireAuth. Requests without the header pass straight
 * through — natural keys inside the session document still make the
 * underlying actions idempotent.
 */
export function idempotency(req, res, next) {
  const key = req.get('idempotency-key');
  if (!key || !req.user) return next();
  if (!/^[\w.-]{8,128}$/.test(key)) return next(ApiError.badRequest('Idempotency-Key must be 8–128 URL-safe characters', 'BAD_IDEMPOTENCY_KEY'));
  const route = `${req.method} ${req.baseUrl}${req.path}`;

  (async () => {
    let claimed = false;
    try {
      await IdempotencyKey.create({ key, user: req.user._id, route, state: 'pending' });
      claimed = true;
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
    if (!claimed) {
      const existing = await IdempotencyKey.findOne({ key, user: req.user._id }).lean();
      if (!existing) return next();
      if (existing.route !== route) throw ApiError.conflict('This Idempotency-Key was used for a different request', 'IDEMPOTENCY_KEY_REUSED');
      if (existing.state === 'pending') throw ApiError.conflict('The same request is still being processed', 'REQUEST_IN_PROGRESS');
      res.setHeader('Idempotent-Replayed', 'true');
      const body = existing.body && typeof existing.body === 'object' ? { ...existing.body, replayed: true } : existing.body;
      return res.status(existing.status || 200).json(body);
    }

    // Capture the response the handler produces.
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const status = res.statusCode;
      const op = status >= 500 || status === 429 || status === 503
        ? IdempotencyKey.deleteOne({ key, user: req.user._id }) // transient failure: let the client retry for real
        : IdempotencyKey.updateOne({ key, user: req.user._id }, { $set: { state: 'done', status, body } });
      op.catch((e) => logger.warn('idempotency store failed', e.message));
      return originalJson(body);
    };
    res.on('close', () => {
      if (!res.writableEnded) IdempotencyKey.deleteOne({ key, user: req.user._id, state: 'pending' }).catch(() => {});
    });
    return next();
  })().catch(next);
  return undefined;
}
