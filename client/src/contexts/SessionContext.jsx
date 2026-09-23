import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { investigationApi } from '../services/api.js';
import { onSocketCreated, SOCKET_EVENTS } from '../services/socket.js';
import { useAuth } from './AuthContext.jsx';
import { useEvent } from './EventContext.jsx';
import { useToast } from './ToastContext.jsx';
import { TIMER_MILESTONES } from '../data/constants.js';

/**
 * The participant's investigation session — a snapshot of the server's
 * authoritative view (`GET /investigation/session`). Pages never derive
 * score, progress or time themselves: they read this snapshot and call
 * `refresh()` (or apply the server's response) after their own actions.
 *
 *   useSession()       — session view, start(), refresh(), applyServerState()
 *   useSessionClock()  — the ticking session clock (interpolated from remainingMs + receivedAt)
 */
const SessionContext = createContext(null);

export function computeSessionRemaining(snapshot, eventStatus, now = Date.now()) {
  const s = snapshot?.session;
  if (!s) return 0;
  if (s.status !== 'active') return 0;
  if (eventStatus === 'paused') return snapshot.session.remainingMs;
  return Math.max(0, s.remainingMs - (now - snapshot.receivedAt));
}

export function SessionProvider({ children }) {
  const { isParticipant, isAuthenticated } = useAuth();
  const { status: eventStatus } = useEvent();
  const { notify, impact } = useToast();
  const [snapshot, setSnapshot] = useState(null); // { session, receivedAt } — session may be null (not started)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const inflight = useRef(null);

  const apply = useCallback((session) => {
    setSnapshot({ session: session || null, receivedAt: Date.now() });
  }, []);

  const refresh = useCallback(async () => {
    if (!isParticipant) return null;
    if (inflight.current) return inflight.current;
    inflight.current = investigationApi
      .session()
      .then((data) => {
        apply(data.session);
        setError(null);
        return data.session;
      })
      .catch((err) => {
        setError(err);
        return null;
      })
      .finally(() => {
        inflight.current = null;
        setLoading(false);
      });
    return inflight.current;
  }, [isParticipant, apply]);

  const start = useCallback(async () => {
    const view = await investigationApi.start();
    apply(view);
    return view;
  }, [apply]);

  /** Merge a partial server response (score, remainingMs …) into the snapshot without a round trip. */
  const applyServerState = useCallback((partial) => {
    if (!partial) return;
    setSnapshot((prev) => {
      if (!prev?.session) return prev;
      const next = { ...prev.session };
      if (typeof partial.score === 'number') next.score = partial.score;
      if (typeof partial.remainingMs === 'number') next.remainingMs = partial.remainingMs;
      if (Array.isArray(partial.suspects)) next.suspects = partial.suspects;
      return { session: next, receivedAt: typeof partial.remainingMs === 'number' ? Date.now() : prev.receivedAt };
    });
  }, []);

  useEffect(() => {
    if (isAuthenticated && isParticipant) refresh();
    else {
      setSnapshot(null);
      setLoading(false);
    }
  }, [isAuthenticated, isParticipant, refresh]);

  // Re-sync the clock whenever the event pauses / resumes / extends / ends.
  useEffect(() => {
    if (isParticipant && snapshot?.session) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventStatus]);

  useEffect(() => {
    if (!isParticipant) return undefined;
    let detach = null;
    let timer = null;
    const scheduleRefresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        refresh();
      }, 250);
    };
    const unsubscribe = onSocketCreated((socket) => {
      const handlers = {
        [SOCKET_EVENTS.SESSION_UPDATE]: scheduleRefresh,
        [SOCKET_EVENTS.CASES_UPDATED]: scheduleRefresh,
        [SOCKET_EVENTS.TIMER_EXPIRED]: () => {
          scheduleRefresh();
          impact({ tone: 'crimson', title: 'TIME IS UP', body: 'Your investigation window has closed.' });
        },
        [SOCKET_EVENTS.SESSION_RESET]: () => {
          apply(null);
          notify({ tone: 'amber', title: 'INVESTIGATION RESET', body: 'The coordinator reset your investigation. Open the case file to begin again.' });
        },
        [SOCKET_EVENTS.DATABASE_RESET]: () => notify({ tone: 'violet', title: 'DATABASE REBUILT', body: 'The investigation database was reloaded by the coordinator.' }),
        connect: scheduleRefresh, // reconnect → resync
      };
      for (const [event, fn] of Object.entries(handlers)) socket.on(event, fn);
      detach = () => {
        for (const [event, fn] of Object.entries(handlers)) socket.off(event, fn);
      };
    });
    return () => {
      unsubscribe();
      if (detach) detach();
      if (timer) clearTimeout(timer);
    };
  }, [isParticipant, refresh, apply, notify, impact]);

  // Fallback poll (sockets can be blocked on venue networks).
  useEffect(() => {
    if (!isParticipant || !snapshot?.session || snapshot.session.status !== 'active') return undefined;
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [isParticipant, snapshot, refresh]);

  const value = useMemo(
    () => ({
      session: snapshot?.session || null,
      snapshot,
      hasSession: Boolean(snapshot?.session),
      loading,
      error,
      refresh,
      start,
      apply,
      applyServerState,
    }),
    [snapshot, loading, error, refresh, start, apply, applyServerState],
  );

  return (
    <SessionContext.Provider value={value}>
      <MilestoneWatcher impact={impact} />
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

/** Ticking session clock — only components that display the time should use this. */
export function useSessionClock(intervalMs = 250) {
  const { snapshot } = useSession();
  const { status: eventStatus } = useEvent();
  const active = snapshot?.session?.status === 'active' && eventStatus === 'live';
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return useMemo(() => {
    const s = snapshot?.session;
    const remainingMs = computeSessionRemaining(snapshot, eventStatus, active ? now : Date.now());
    const totalMs = s ? new Date(s.expiresAt).getTime() - new Date(s.startedAt).getTime() : 0;
    return { remainingMs, totalMs, status: s?.status || 'none', eventStatus, elapsedMs: s ? (s.status === 'completed' ? s.elapsedMs : Math.max(0, totalMs - remainingMs)) : 0 };
  }, [snapshot, eventStatus, active, now]);
}

/** Fires the milestone banners (45:00, 30:00 …) against the participant's own clock. */
function MilestoneWatcher({ impact }) {
  const { remainingMs, status, eventStatus } = useSessionClock(1000);
  const announced = useRef(new Set());
  useEffect(() => {
    if (status !== 'active' || eventStatus !== 'live') return;
    const secs = Math.floor(remainingMs / 1000);
    for (const m of TIMER_MILESTONES) {
      if (secs <= m.at && secs > m.at - 3 && !announced.current.has(m.at)) {
        announced.current.add(m.at);
        impact({ tone: m.tone, title: m.title, body: m.body, ttl: 3600 });
      }
    }
  }, [remainingMs, status, eventStatus, impact]);
  return null;
}
