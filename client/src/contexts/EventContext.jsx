import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { publicApi } from '../services/api.js';
import { onSocketCreated, SOCKET_EVENTS } from '../services/socket.js';
import { useAuth } from './AuthContext.jsx';
import { useToast } from './ToastContext.jsx';

/**
 * Event state + event clock on the client.
 *
 * The server sends { status, timer: { remainingMs, serverTime, totalMs } }.
 * We record when the snapshot arrived and interpolate locally, so the
 * browser clock never has to agree with the server's.
 *
 *   useEvent()       — status, event, connection … changes rarely
 *   useEventClock()  — the ticking remainingMs, for timer displays only
 *
 * Participants' own investigation clock lives in SessionContext.
 */
const EventContext = createContext(null);

export const RUNNING = new Set(['live']);
export const PRE_START = new Set(['draft', 'ready', 'scheduled', 'unknown']);
export const OVER = new Set(['ended', 'archived']);

export function computeRemaining(snapshot, now = Date.now()) {
  const event = snapshot?.event;
  const timer = event?.timer;
  if (!event || !timer) return { remainingMs: 0, totalMs: 0, elapsedMs: 0 };
  let remainingMs = timer.remainingMs;
  if (event.status === 'live') remainingMs = Math.max(0, timer.remainingMs - (now - snapshot.receivedAt));
  else if (PRE_START.has(event.status)) remainingMs = timer.totalMs;
  return { remainingMs, totalMs: timer.totalMs, elapsedMs: Math.max(0, timer.totalMs - remainingMs) };
}

export function EventProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const { notify, impact } = useToast();
  const [snapshot, setSnapshot] = useState(null); // { event, receivedAt }
  const [connection, setConnection] = useState('idle'); // idle | online | reconnecting | offline

  const applyEvent = useCallback((event) => {
    if (!event) return;
    setSnapshot({ event, receivedAt: Date.now() });
  }, []);

  // Poll the public state (every 30 s; the socket delivers changes in between).
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      publicApi
        .eventState()
        .then((e) => !cancelled && applyEvent(e))
        .catch(() => {});
    load();
    const id = setInterval(load, isAuthenticated ? 30000 : 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isAuthenticated, applyEvent]);

  // Socket subscriptions.
  useEffect(
    () =>
      onSocketCreated((socket) => {
        setConnection(socket.connected ? 'online' : 'reconnecting');
        socket.on('connect', () => setConnection('online'));
        socket.on('disconnect', () => setConnection('reconnecting'));
        socket.io.on('reconnect_failed', () => setConnection('offline'));
        socket.on('connect_error', (err) => {
          if (socket.active === false) setConnection('offline');
          const code = err?.message;
          if (['SESSION_REVOKED', 'INVALID_IDENTITY', 'INVALID_TOKEN'].includes(code)) {
            window.dispatchEvent(new CustomEvent('lostatsql:session-rejected', { detail: code }));
          }
        });
        socket.on(SOCKET_EVENTS.EVENT_STATE, applyEvent);
        socket.on(SOCKET_EVENTS.ANNOUNCEMENT, (a) => {
          if (!a?.title) return;
          impact({ tone: a.tone || 'cyan', title: a.title, body: a.body, ttl: 3200 });
        });
      }),
    [applyEvent, impact],
  );

  const refresh = useCallback(async () => {
    try {
      applyEvent(await publicApi.eventState());
    } catch {
      notify({ tone: 'crimson', title: 'CONNECTION INTERRUPTED', body: 'Could not refresh the event state.' });
    }
  }, [applyEvent, notify]);

  const value = useMemo(() => {
    const event = snapshot?.event || null;
    const status = event?.status || 'unknown';
    return {
      event,
      status,
      totalMs: event?.timer?.totalMs || 0,
      isLive: status === 'live',
      isOver: OVER.has(status),
      isPreStart: PRE_START.has(status),
      connection,
      snapshot,
      refresh,
      applyEvent,
    };
  }, [snapshot, connection, refresh, applyEvent]);

  return <EventContext.Provider value={value}>{children}</EventContext.Provider>;
}

export function useEvent() {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error('useEvent must be used inside <EventProvider>');
  return ctx;
}

/** Ticking event clock. Only components that display the event-wide time should use this. */
export function useEventClock(intervalMs = 250) {
  const { snapshot, status } = useEvent();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== 'live') return undefined;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [status, intervalMs]);
  const clock = useMemo(() => computeRemaining(snapshot, status === 'live' ? now : Date.now()), [snapshot, status, now]);
  return { ...clock, status };
}
