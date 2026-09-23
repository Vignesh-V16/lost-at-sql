import { randomUUID } from 'node:crypto';

/**
 * Every request gets an id (echoed from `X-Request-Id` when the client sends
 * one, otherwise generated). It is returned in the response header and the
 * envelope, attached to audit records and structured logs.
 */
export function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && /^[\w.-]{6,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  res.locals.requestId = req.id;
  next();
}

/** Metadata bundle passed to services for audit records. */
export function requestMeta(req) {
  return { ip: req.ip || req.socket?.remoteAddress || 'unknown', requestId: req.id, userAgent: req.get('user-agent') };
}
