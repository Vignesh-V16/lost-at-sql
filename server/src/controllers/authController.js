import { authService } from '../services/authService.js';
import { ok, asyncHandler } from '../utils/http.js';
import { env } from '../config/env.js';
import { requestMeta } from '../middleware/requestId.js';

const COOKIE = 'lostatsql.refresh';

function setRefreshCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE || env.isProduction,
    path: '/api/auth',
    maxAge: env.REFRESH_TTL_HOURS * 3600 * 1000,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(COOKIE, { path: '/api/auth' });
}

function readRefresh(req) {
  return req.cookies?.[COOKIE] || req.body?.refreshToken || null;
}

export const login = asyncHandler(async (req, res) => {
  const meta = requestMeta(req);
  const result = await authService.login({ username: req.body.investigatorId, accessCode: req.body.accessCode }, meta);
  setRefreshCookie(res, result.refreshToken);
  ok(res, { token: result.token, expiresIn: result.expiresIn, refreshToken: result.refreshToken, user: result.user });
});

export const refresh = asyncHandler(async (req, res) => {
  const meta = requestMeta(req);
  const result = await authService.refresh(readRefresh(req), meta);
  setRefreshCookie(res, result.refreshToken);
  ok(res, { token: result.token, expiresIn: result.expiresIn, refreshToken: result.refreshToken, user: result.user });
});

export const me = asyncHandler(async (req, res) => {
  ok(res, await authService.me(req.user));
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user, readRefresh(req), requestMeta(req));
  clearRefreshCookie(res);
  ok(res, { loggedOut: true });
});
