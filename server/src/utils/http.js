/**
 * Consistent response envelope + async route wrapper.
 *
 *   success: { success: true, data, meta? }
 *   failure: { success: false, error: { code, message, details? } }
 */

export function ok(res, data, meta, status = 200) {
  const body = { success: true, data, requestId: res.locals?.requestId };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export function created(res, data, meta) {
  return ok(res, data, meta, 201);
}

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
