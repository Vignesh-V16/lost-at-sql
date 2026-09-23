/**
 * ApiError — every failure that reaches the client goes through this.
 *
 * `code` is a stable machine-readable identifier the frontend maps to
 * in-world system messages (e.g. EVENT_NOT_STARTED → "INVESTIGATION NOT STARTED").
 */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = true;
  }

  static badRequest(message = 'Invalid request', details) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static validation(details) {
    return new ApiError(422, 'VALIDATION_FAILED', 'Request validation failed', details);
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new ApiError(401, code, message);
  }

  static forbidden(message = 'Insufficient clearance', code = 'FORBIDDEN') {
    return new ApiError(403, code, message);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new ApiError(404, code, message);
  }

  static conflict(message, code = 'CONFLICT') {
    return new ApiError(409, code, message);
  }

  static locked(message, code = 'LOCKED') {
    return new ApiError(423, code, message);
  }

  static tooMany(message = 'Too many requests') {
    return new ApiError(429, 'RATE_LIMITED', message);
  }

  static internal(message = 'Internal error') {
    return new ApiError(500, 'INTERNAL_ERROR', message);
  }
}
