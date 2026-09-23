import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authApi, tokenStore, refreshStore, onUnauthorized } from '../services/api.js';
import { connectSocket, disconnectSocket, onSocketCreated, SOCKET_EVENTS } from '../services/socket.js';
import { useToast } from './ToastContext.jsx';

/**
 * Session state machine:
 *   booting → anonymous | authenticated
 *
 * Access tokens are short-lived; the API client refreshes them silently.
 * Only a terminal 401 (revoked, invalid, refresh failed) tears the session down.
 */
const AuthContext = createContext(null);

const TERMINAL_TITLES = {
  TOKEN_EXPIRED: 'SESSION EXPIRED',
  SESSION_EXPIRED: 'SESSION EXPIRED',
  SESSION_REVOKED: 'SESSION REVOKED',
  INVALID_TOKEN: 'SESSION TERMINATED',
  INVALID_IDENTITY: 'SESSION TERMINATED',
};

export function AuthProvider({ children }) {
  const [status, setStatus] = useState(tokenStore.get() ? 'booting' : 'anonymous');
  const [user, setUser] = useState(null);
  const [lastReason, setLastReason] = useState(null);
  const { notify } = useToast();
  const loggingOut = useRef(false);

  const clearSession = useCallback((reason) => {
    if (loggingOut.current) return;
    loggingOut.current = true;
    tokenStore.set(null);
    refreshStore.set(null);
    disconnectSocket();
    setUser(null);
    setStatus('anonymous');
    if (reason) setLastReason(reason);
    setTimeout(() => {
      loggingOut.current = false;
    }, 0);
  }, []);

  // A terminal 401 anywhere tears the session down.
  useEffect(() => {
    onUnauthorized((code) => {
      if (code === 'NO_TOKEN') return;
      clearSession(code);
      notify({ tone: 'crimson', title: TERMINAL_TITLES[code] || 'SESSION TERMINATED', body: 'Sign in again to continue.' });
    });
  }, [clearSession, notify]);

  // Bootstrap from a stored token.
  useEffect(() => {
    if (status !== 'booting') return undefined;
    let cancelled = false;
    authApi
      .me()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        setStatus('authenticated');
        connectSocket();
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.isNetwork) {
          setStatus('anonymous');
          setLastReason('NETWORK');
        } else {
          clearSession(err.code);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [status, clearSession]);

  // Socket handshake rejected with an auth code → same teardown as a 401.
  useEffect(() => {
    const onRejected = (e) => {
      clearSession(e.detail);
      notify({ tone: 'crimson', title: TERMINAL_TITLES[e.detail] || 'SESSION TERMINATED', body: 'Sign in again to continue.' });
    };
    window.addEventListener('lostatsql:session-rejected', onRejected);
    return () => window.removeEventListener('lostatsql:session-rejected', onRejected);
  }, [clearSession, notify]);

  // Server-initiated revocation.
  useEffect(
    () =>
      onSocketCreated((socket) => {
        socket.on(SOCKET_EVENTS.SESSION_REVOKED, ({ reason }) => {
          clearSession(reason || 'SESSION_REVOKED');
          notify({ tone: 'crimson', title: 'SESSION REVOKED', body: reason === 'CREDENTIALS_RESET' ? 'Your access code was reset by the coordinator.' : 'Your credential is no longer valid.' });
        });
      }),
    [clearSession, notify],
  );

  const login = useCallback(async (investigatorId, accessCode) => {
    const { token, refreshToken, user: u } = await authApi.login(investigatorId, accessCode);
    tokenStore.set(token);
    refreshStore.set(refreshToken || null);
    setUser(u);
    setLastReason(null);
    setStatus('authenticated');
    connectSocket();
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* best effort */
    }
    clearSession(null);
  }, [clearSession]);

  const value = useMemo(
    () => ({
      status,
      user,
      isAuthenticated: status === 'authenticated',
      isParticipant: user?.role === 'participant',
      isCoordinator: user?.role === 'coordinator',
      lastReason,
      login,
      logout,
    }),
    [status, user, lastReason, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
