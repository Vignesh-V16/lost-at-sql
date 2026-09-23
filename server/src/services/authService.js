import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { User, Event, RefreshToken } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { signToken } from '../utils/jwt.js';
import { env } from '../config/env.js';
import { auditService } from './auditService.js';
import { logger } from '../utils/logger.js';

const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');

export function publicUser(user) {
  return {
    id: String(user._id),
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    team: user.team && user.team._id ? { id: String(user.team._id), name: user.team.name, code: user.team.code, color: user.team.color } : null,
    title: user.title || null,
    lastLoginAt: user.lastLoginAt || null,
  };
}

async function issueRefresh(user, { family, ip, userAgent } = {}) {
  const raw = randomBytes(48).toString('base64url');
  await RefreshToken.create({
    tokenHash: sha256(raw),
    user: user._id,
    family: family || randomUUID(),
    expiresAt: new Date(Date.now() + env.REFRESH_TTL_HOURS * 3600 * 1000),
    ip,
    userAgent: userAgent ? String(userAgent).slice(0, 200) : undefined,
  });
  return raw;
}

/**
 * Authentication (spec §37): bcrypt credentials, short-lived access JWT,
 * rotating refresh tokens with reuse detection, `tokenVersion` revocation.
 */
export const authService = {
  publicUser,

  async login({ username, accessCode }, { ip, userAgent } = {}) {
    const user = await User.findOne({ username: username.toLowerCase().trim() }).select('+passwordHash').populate('team', 'name code color');
    const invalid = () => ApiError.unauthorized('Identity verification failed. Check your investigator ID and access code.', 'INVALID_CREDENTIALS');
    if (!user) throw invalid();
    const okPassword = await user.comparePassword(accessCode);
    if (!okPassword) {
      await auditService.record({ actor: user, action: 'LOGIN_FAILED', target: user.username, ip });
      throw invalid();
    }
    if (!user.isActive) throw ApiError.forbidden('This investigator credential has been revoked.', 'ACCOUNT_DISABLED');

    if (user.role === 'participant') {
      const event = await Event.getSingleton();
      if (!event.registrationOpen && !user.lastLoginAt) throw ApiError.forbidden('Registration is closed for this investigation.', 'REGISTRATION_CLOSED');
    }

    user.lastLoginAt = new Date();
    user.lastSeenAt = new Date();
    await user.save();
    await auditService.record({ actor: user, action: 'LOGIN', target: user.username, ip });
    const refreshToken = await issueRefresh(user, { ip, userAgent });
    return { token: signToken(user), refreshToken, expiresIn: env.JWT_EXPIRES_IN, user: publicUser(user) };
  },

  /** Rotation: the presented token is consumed; a replayed (already-rotated) token revokes its whole family. */
  async refresh(rawToken, { ip, userAgent } = {}) {
    if (!rawToken) throw ApiError.unauthorized('Refresh token required', 'NO_REFRESH_TOKEN');
    const record = await RefreshToken.findOne({ tokenHash: sha256(rawToken) });
    if (!record) throw ApiError.unauthorized('Refresh token not recognised', 'INVALID_REFRESH_TOKEN');
    if (record.revokedAt || record.replacedBy) {
      await RefreshToken.updateMany({ family: record.family, revokedAt: null }, { $set: { revokedAt: new Date() } });
      await auditService.record({ action: 'REFRESH_TOKEN_REUSE', target: String(record.user), meta: { family: record.family }, ip });
      logger.warn(`Refresh token reuse detected for user ${record.user} — family revoked`);
      throw ApiError.unauthorized('Session revoked', 'SESSION_REVOKED');
    }
    if (record.expiresAt.getTime() <= Date.now()) throw ApiError.unauthorized('Session expired', 'SESSION_EXPIRED');
    const user = await User.findById(record.user).populate('team', 'name code color');
    if (!user || !user.isActive) throw ApiError.unauthorized('Identity not recognised', 'INVALID_IDENTITY');
    const next = await issueRefresh(user, { family: record.family, ip, userAgent });
    record.replacedBy = sha256(next);
    await record.save();
    user.lastSeenAt = new Date();
    await user.save();
    return { token: signToken(user), refreshToken: next, expiresIn: env.JWT_EXPIRES_IN, user: publicUser(user) };
  },

  async logout(user, rawToken, { ip } = {}) {
    if (rawToken) {
      const record = await RefreshToken.findOne({ tokenHash: sha256(rawToken) });
      if (record) await RefreshToken.updateMany({ family: record.family, revokedAt: null }, { $set: { revokedAt: new Date() } });
    }
    await auditService.record({ actor: user, action: 'LOGOUT', target: user.username, ip });
  },

  /** Revokes every access + refresh token for a user (credential reset, deactivation). */
  async revokeAll(userId) {
    await Promise.all([
      User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } }),
      RefreshToken.updateMany({ user: userId, revokedAt: null }, { $set: { revokedAt: new Date() } }),
    ]);
  },

  async me(user) {
    return publicUser(user);
  },

  async touch(userId) {
    await User.updateOne({ _id: userId }, { $set: { lastSeenAt: new Date() } });
  },
};
