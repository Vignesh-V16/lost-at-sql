/**
 * Socket emitters. The io instance is injected once at boot so that
 * services can broadcast without importing the socket server directly.
 * Sockets are notification-only: clients never send game actions over them.
 *
 * Rooms:
 *   role:participant   every connected participant
 *   role:coordinator   every connected coordinator
 *   user:<id>          all sockets of one user (every tab / device)
 */
let io = null;
const presence = new Map(); // userId → Set<socketId>

export const SOCKET_EVENTS = Object.freeze({
  /* broadcast */
  EVENT_STATE: 'event:state',
  LEADERBOARD: 'leaderboard:update',
  ANNOUNCEMENT: 'event:announcement',
  DATABASE_RESET: 'database:reset',
  CASES_UPDATED: 'cases:updated',
  /* participant */
  SESSION_UPDATE: 'session:update',
  SESSION_RESET: 'session:reset',
  SESSION_REVOKED: 'session:revoked',
  TIMER_EXPIRED: 'timer:expired',
  /* coordinator feed (spec §32) */
  MONITOR: 'monitor:update',
  STATS: 'stats:update',
  PRESENCE: 'presence:update',
  PROCTOR_FLAG: 'proctor:flag',
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

export function setIo(instance) {
  io = instance;
}

export function getIo() {
  return io;
}

export function trackPresence(userId, socketId) {
  const key = String(userId);
  if (!presence.has(key)) presence.set(key, new Set());
  presence.get(key).add(socketId);
}

export function untrackPresence(userId, socketId) {
  const key = String(userId);
  const set = presence.get(key);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) presence.delete(key);
}

export function onlineUserIds() {
  return Array.from(presence.keys());
}

export function isOnline(userId) {
  return presence.has(String(userId));
}

export function connectionCount() {
  let n = 0;
  for (const s of presence.values()) n += s.size;
  return n;
}

export function emitToRole(role, event, payload) {
  if (!io) return;
  io.to(`role:${role}`).emit(event, payload);
}

export function emitToUser(userId, event, payload) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

export function emitToAll(event, payload) {
  if (!io) return;
  io.emit(event, payload);
}

export function emitEventState(state) {
  emitToAll(SOCKET_EVENTS.EVENT_STATE, state);
}

export function emitLeaderboard(rows) {
  emitToAll(SOCKET_EVENTS.LEADERBOARD, rows);
}

export function emitMonitor(rows) {
  emitToRole('coordinator', SOCKET_EVENTS.MONITOR, rows);
}

export function emitStats(stats) {
  emitToRole('coordinator', SOCKET_EVENTS.STATS, stats);
}

export function emitPresence() {
  emitToRole('coordinator', SOCKET_EVENTS.PRESENCE, { online: onlineUserIds(), at: Date.now() });
}

/** Coordinator feed event — payloads carry ids/codes/counts only, never SQL results, hints or answers. */
export function emitFeed(type, payload) {
  emitToRole('coordinator', type, { type, at: Date.now(), ...payload });
}

export function disconnectUser(userId) {
  if (!io) return;
  io.in(`user:${userId}`).disconnectSockets(true);
}
