import { Router } from 'express';
import * as auth from '../controllers/authController.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { loginLimiter, refreshLimiter } from '../middleware/rateLimit.js';
import { loginSchema, refreshSchema } from './schemas.js';

const router = Router();

router.post('/login', loginLimiter, validate(loginSchema), auth.login);
router.post('/refresh', refreshLimiter, validate(refreshSchema), auth.refresh);
router.get('/me', requireAuth, auth.me);
router.post('/logout', requireAuth, auth.logout);

export default router;
