import { Router } from 'express';
import authRoutes from './authRoutes.js';
import investigationRoutes from './investigationRoutes.js';
import adminRoutes from './adminRoutes.js';
import { eventState } from '../controllers/investigationController.js';
import { databaseState } from '../config/db.js';
import { sqlService } from '../services/sqlService.js';
import { ok } from '../utils/http.js';

const router = Router();

router.get('/health', (_req, res) => {
  const db = databaseState();
  ok(res, {
    service: 'lost-at-sql',
    status: db === 'connected' && sqlService.isReady ? 'online' : 'degraded',
    database: db,
    sqlEngine: sqlService.isReady ? 'ready' : 'offline',
    uptime: Math.round(process.uptime()),
    time: Date.now(),
  });
});

// Public, unauthenticated event state — used by the landing page and the login screen.
router.get('/event/state', eventState);
router.get('/events/current', eventState);

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/', investigationRoutes);

export default router;
