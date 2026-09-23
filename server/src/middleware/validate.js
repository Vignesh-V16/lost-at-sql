import { ApiError } from '../utils/ApiError.js';

/**
 * validate({ body, params, query }) — zod schemas per request part.
 * Parsed (and therefore sanitised/coerced) values replace the originals.
 */
export const validate = (schemas) => (req, _res, next) => {
  const details = [];
  for (const part of ['params', 'query', 'body']) {
    const schema = schemas[part];
    if (!schema) continue;
    const result = schema.safeParse(req[part] ?? {});
    if (!result.success) {
      for (const issue of result.error.issues) {
        details.push({ in: part, path: issue.path.join('.'), message: issue.message });
      }
    } else {
      req[part] = result.data;
    }
  }
  if (details.length) return next(ApiError.validation(details));
  return next();
};
