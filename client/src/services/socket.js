import { io } from 'socket.io-client';
import { tokenStore } from './api.js';

/**
 * Single Socket.IO connection shared by the app. Created lazily after
 * authentication and torn down on logout.
 */
let socket = null;
const listeners = new Set();

export const SOCKET_EVENTS = Object.freeze({
  EVENT_STATE: 'event:state',
  LEADERBOARD: 'leaderboard:update',
  ANNOUNCEMENT: 'event:announcement',
  DATABASE_RESET: 'database:reset',
  CASES_UPDATED: 'cases:updated',
  SESSION_UPDATE: 'session:update',
  SESSION_RESET: 'session:reset',
  SESSION_REVOKED: 'session:revoked',
  TIMER_EXPIRED: 'timer:expired',
  MONITOR: 'monitor:update',
  STATS: 'stats:update',
  PRESENCE: 'presence:update',
  PROCTOR_FLAG: 'proctor:flag',
  /* coordinator feed */
  PARTICIPANT_STARTED: 'PARTICIPANT_STARTED',
  FILE_STARTED: 'FILE_STARTED',
  QUERY_EXECUTED: 'QUERY_EXECUTED',
  EVIDENCE_DISCOVERED: 'EVIDENCE_DISCOVERED',
  FILE_COMPLETED: 'FILE_COMPLETED',
  HINT_USED: 'HINT_USED',
  SCORE_CHANGED: 'SCORE_CHANGED',
  FINAL_SUBMITTED: 'FINAL_SUBMITTED',
  PARTICIPANT_COMPLETED: 'PARTICIPANT_COMPLETED',
  TIME_EXPIRED: 'TIME_EXPIRED',
  CONNECTION_LOST: 'CONNECTION_LOST',
  CONNECTION_RESTORED: 'CONNECTION_RESTORED',
  SQL_BLOCKED: 'SQL_BLOCKED',
});

export const FEED_EVENTS = ['PARTICIPANT_STARTED', 'FILE_STARTED', 'QUERY_EXECUTED', 'EVIDENCE_DISCOVERED', 'FILE_COMPLETED', 'HINT_USED', 'SCORE_CHANGED', 'FINAL_SUBMITTED', 'PARTICIPANT_COMPLETED', 'TIME_EXPIRED', 'CONNECTION_LOST', 'CONNECTION_RESTORED', 'SQL_BLOCKED'];

export function connectSocket() {
  const token = tokenStore.get();
  if (!token) return null;
  if (socket) {
    if (socket.auth?.token !== token) {
      socket.auth = { token };
      socket.disconnect().connect();
    } else if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }
  socket = io(import.meta.env.VITE_SOCKET_URL || '/', {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 6000,
    timeout: 8000,
  });
  for (const fn of listeners) fn(socket);
  return socket;
}

export function disconnectSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

export function getSocket() {
  return socket;
}

/** Register a callback that receives the socket whenever one is created. */
export function onSocketCreated(fn) {
  listeners.add(fn);
  if (socket) fn(socket);
  return () => listeners.delete(fn);
}
