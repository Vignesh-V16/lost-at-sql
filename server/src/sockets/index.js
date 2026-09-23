import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { verifyToken } from '../utils/jwt.js';
import { isAllowedOrigin } from '../utils/origins.js';
import { User } from '../models/index.js';
import { logger } from '../utils/logger.js';
import { setIo, trackPresence, untrackPresence, emitPresence, emitFeed, isOnline, SOCKET_EVENTS } from './emitters.js';
import { eventService } from '../services/eventService.js';
import { leaderboardService } from '../services/leaderboardService.js';
import { monitorService } from '../services/monitorService.js';
import { authService } from '../services/authService.js';

/**
 * Socket.IO server — notification-only (architecture §5). The handshake
 * carries the access JWT in `auth.token`; the same verification as the REST
 * layer applies, and sockets join role/user rooms so services can target
 * broadcasts. Clients never send game actions over the socket.
 */
export function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: (origin, cb) => cb(null, isAllowedOrigin(origin)), credentials: true },
    pingInterval: 20000,
    pingTimeout: 15000,
    maxHttpBufferSize: 16 * 1024,
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('NO_TOKEN'));
      const payload = verifyToken(token);
      const user = await User.findById(payload.sub).select('role displayName isActive tokenVersion team').lean();
      if (!user || !user.isActive) return next(new Error('INVALID_IDENTITY'));
      if ((user.tokenVersion || 0) !== (payload.tv || 0)) return next(new Error('SESSION_REVOKED'));
      socket.data.user = { id: String(user._id), role: user.role, displayName: user.displayName, team: user.team ? String(user.team) : null };
      return next();
    } catch (err) {
      return next(new Error(err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'));
    }
  });

  io.on('connection', async (socket) => {
    const { id, role } = socket.data.user;
    const wasOnline = isOnline(id);
    socket.join(`role:${role}`);
    socket.join(`user:${id}`);
    trackPresence(id, socket.id);
    logger.debug(`socket connected ${role}:${id}`);

    try {
      socket.emit(SOCKET_EVENTS.EVENT_STATE, await eventService.getState());
      socket.emit(SOCKET_EVENTS.LEADERBOARD, await leaderboardService.board({ viewer: { role } }));
      if (role === 'coordinator') {
        socket.emit(SOCKET_EVENTS.MONITOR, await monitorService.participantRows());
        socket.emit(SOCKET_EVENTS.STATS, await monitorService.stats());
      }
      await authService.touch(id);
    } catch (err) {
      logger.warn('socket bootstrap failed', err.message);
    }
    if (role === 'participant') {
      emitPresence();
      if (!wasOnline) emitFeed(SOCKET_EVENTS.CONNECTION_RESTORED, { participantId: id });
      monitorService.schedulePush();
    }

    socket.on('time:sync', (ack) => {
      if (typeof ack === 'function') ack({ serverTime: Date.now() });
    });

    socket.on('heartbeat', () => {
      authService.touch(id).catch(() => {});
    });

    socket.on('disconnect', () => {
      untrackPresence(id, socket.id);
      if (role === 'participant') {
        emitPresence();
        if (!isOnline(id)) emitFeed(SOCKET_EVENTS.CONNECTION_LOST, { participantId: id });
        monitorService.schedulePush();
      }
      logger.debug(`socket disconnected ${role}:${id}`);
    });
  });

  setIo(io);
  return io;
}
