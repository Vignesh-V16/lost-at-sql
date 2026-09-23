import { ApiError } from '../utils/ApiError.js';
import { EngineError } from '../engine/errors.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`No route for ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
}

function translate(err) {
  if (err instanceof ApiError) return err;
  if (err instanceof EngineError) return new ApiError(422, err.code, err.message, err.details);

  // Body parser
  if (err.type === 'entity.parse.failed') return ApiError.badRequest('Malformed JSON body');
  if (err.type === 'entity.too.large') return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large');

  // Mongoose
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors || {}).map((e) => ({ path: e.path, message: e.message }));
    return ApiError.validation(details);
  }
  if (err.name === 'CastError') return ApiError.badRequest(`Invalid identifier: ${err.value}`);
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return ApiError.conflict(`A record with this ${field} already exists`, 'DUPLICATE');
  }
  if (err.name === 'VersionError') return ApiError.conflict('Another request changed this session at the same time. Please retry.', 'STALE_SESSION');
  if (err.name === 'MongoServerSelectionError' || err.name === 'MongoNetworkError' || err.name === 'MongooseServerSelectionError') {
    return new ApiError(503, 'DB_UNAVAILABLE', 'The application database is unreachable');
  }

  return ApiError.internal(env.isProduction ? 'Internal error' : err.message);
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const apiError = translate(err);
  if (apiError.status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} → ${apiError.status} [${req.id}]`, err);
  } else if (apiError.status !== 401 && apiError.status !== 404) {
    logger.debug(`${req.method} ${req.originalUrl} → ${apiError.status} ${apiError.code}`);
  }
  const body = {
    success: false,
    error: {
      code: apiError.code,
      message: apiError.message,
    },
    requestId: req.id,
  };
  if (apiError.details) body.error.details = apiError.details;
  if (res.headersSent) return;
  res.status(apiError.status).json(body);
}
