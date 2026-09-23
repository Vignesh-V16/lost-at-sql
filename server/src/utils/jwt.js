import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function signToken(user) {
  return jwt.sign(
    { sub: String(user._id), role: user.role, tv: user.tokenVersion || 0 },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN, issuer: 'lost-at-sql' },
  );
}

export function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET, { issuer: 'lost-at-sql' });
}
