import rateLimit from 'express-rate-limit';
import { ApiError } from '../utils/ApiError.js';

const handler = (message, code = 'RATE_LIMITED') => (_req, _res, next) => next(new ApiError(429, code, message));

/* Only mounted behind requireAuth, so req.user is always present. */
const keyByUser = (req) => `u:${req.user?._id || req.ip}`;

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: handler('Too many requests. Slow down.'),
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: handler('Too many authentication attempts. Terminal locked for 15 minutes.', 'LOGIN_RATE_LIMITED'),
});

export const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: handler('Too many token refreshes.'),
});

export const queryLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: keyByUser,
  handler: handler('Query rate exceeded (60/min). Slow down, investigator.', 'QUERY_RATE_LIMITED'),
});

/* Integrity flags are fire-and-forget from the browser: generous, but a
   looping client cannot fill the session document. */
export const proctorLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: keyByUser,
  handler: handler('Too many integrity reports.', 'PROCTOR_RATE_LIMITED'),
});

export const answerLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: keyByUser,
  handler: handler('Too many submissions. Think, then submit.', 'SUBMIT_RATE_LIMITED'),
});
