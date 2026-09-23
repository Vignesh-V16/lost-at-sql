import { Router } from 'express';
import * as c from '../controllers/investigationController.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireParticipant } from '../middleware/auth.js';
import { idempotency } from '../middleware/idempotency.js';
import { queryLimiter, answerLimiter, proctorLimiter } from '../middleware/rateLimit.js';
import * as s from './schemas.js';

/**
 * Participant-facing API (architecture §5). Every mutating action is
 * decided by the backend: session state, event state and the session clock
 * are re-checked inside the service on every call.
 */
const router = Router();

// Scoped so that sibling routers (/auth, /admin) mounted on the same parent are unaffected.
router.use(['/investigation', '/cases', '/final', '/evidence', '/database'], requireAuth, requireParticipant);

/* session */
router.get('/investigation/briefing', c.briefing);
router.post('/investigation/start', idempotency, c.start);
router.get('/investigation/session', c.session);
router.get('/investigation/current-file', c.currentFile);
router.get('/investigation/progress', c.progress);
router.get('/investigation/queries', validate(s.limitQuery), c.queryHistory);
router.post('/investigation/proctor', validate(s.proctorSchema), proctorLimiter, c.proctorFlag);

/* case files */
router.get('/cases/:code', validate(s.caseParams), c.getCase);
router.get('/cases/:code/schema', validate(s.caseParams), c.caseSchema);
router.post('/cases/:code/query', validate(s.querySchema), queryLimiter, c.caseQuery);
router.post('/cases/:code/hints/:hintId/use', validate(s.hintParams), idempotency, c.useHint);
router.post('/cases/:code/submit', validate(s.submitSchema), answerLimiter, idempotency, c.submit);

/* final deduction */
router.get('/final', c.finalStatus);
router.post('/final/query', validate(s.finalQuerySchema), queryLimiter, c.finalQuery);
router.post('/final/submit', validate(s.finalSubmitSchema), answerLimiter, idempotency, c.finalSubmit);

/* evidence board + database explorer (read-only) */
router.get('/evidence', c.evidenceBoard);
router.get('/evidence/:code', validate(s.evidenceParams), c.evidenceItem);
router.get('/database/schema', c.schema);
router.get('/database/tables/:name/sample', validate(s.tableParams), c.tableSample);

/* leaderboard is readable by both roles */
router.get('/leaderboard', requireAuth, validate(s.limitQuery), c.leaderboard);

export default router;
