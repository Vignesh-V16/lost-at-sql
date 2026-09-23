import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { isAllowedOrigin } from './utils/origins.js';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { cookies } from './middleware/cookies.js';
import { logger } from './utils/logger.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(cookies);

  app.use(
    helmet({
      contentSecurityPolicy: false, // API only — the SPA sets its own headers at the CDN/host layer.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'Idempotent-Replayed', 'RateLimit', 'RateLimit-Policy'],
    }),
  );

  app.use('/api/admin/database', express.json({ limit: '25mb' }));
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false }));

  if (!env.isProduction) {
    app.use((req, res, next) => {
      const started = Date.now();
      res.on('finish', () => {
        if (req.originalUrl.startsWith('/api/health')) return;
        logger.debug(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms user=${req.user?._id || '-'} req=${req.id}`);
      });
      next();
    });
  }

  app.use('/api', generalLimiter, routes);

  // Optional: serve the built SPA from the same process (SERVE_CLIENT=1).
  if (env.SERVE_CLIENT) {
    const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
    if (fs.existsSync(path.join(dist, 'index.html'))) {
      app.use(express.static(dist, { maxAge: '1h', index: false }));
      app.get(/^(?!\/api\/|\/socket\.io\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
      logger.info(`Serving client from ${dist}`);
    } else {
      logger.warn('SERVE_CLIENT=1 but client/dist was not found — run `npm run build` first');
    }
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
