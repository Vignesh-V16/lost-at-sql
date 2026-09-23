import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/http.js';
import { verifyToken } from '../utils/jwt.js';
import { User } from '../models/index.js';

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/**
 * Verifies the JWT, loads the user and attaches it to req.user.
 * Token version is checked so that "reset credentials" invalidates
 * every existing session for that user.
 */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required', 'NO_TOKEN');

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw ApiError.unauthorized('Access token expired', 'TOKEN_EXPIRED');
    throw ApiError.unauthorized('Invalid session', 'INVALID_TOKEN');
  }

  const user = await User.findById(payload.sub).populate('team', 'name code color');
  if (!user || !user.isActive) throw ApiError.unauthorized('Identity not recognised', 'INVALID_IDENTITY');
  if ((user.tokenVersion || 0) !== (payload.tv || 0)) throw ApiError.unauthorized('Session revoked', 'SESSION_REVOKED');

  req.user = user;
  req.auth = payload;
  next();
});

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(ApiError.forbidden('Your clearance does not permit this operation', 'ROLE_FORBIDDEN'));
  }
  return next();
};

export const requireParticipant = requireRole('participant');
export const requireCoordinator = requireRole('coordinator');
