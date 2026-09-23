/**
 * EngineError — thrown by pure engine modules. Carries a stable `code` so the
 * HTTP layer can map it to an ApiError without the engine knowing about HTTP.
 */
export class EngineError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
    this.details = details;
  }
}

export function assertEngine(condition, code, message, details) {
  if (!condition) throw new EngineError(code, message, details);
}
