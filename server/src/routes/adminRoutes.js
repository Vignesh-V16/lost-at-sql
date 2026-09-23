import { Router } from 'express';
import * as a from '../controllers/adminController.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireCoordinator } from '../middleware/auth.js';
import * as s from './schemas.js';

/**
 * Coordinator API. Every route requires a coordinator session — the role is
 * enforced here on the server; frontend route protection is cosmetic.
 */
const router = Router();

router.use(requireAuth, requireCoordinator);

/* dashboard / monitoring */
router.get('/stats', a.stats);
router.get('/monitor', a.monitor);
router.get('/sessions', validate(s.sessionListSchema), a.listSessions);
router.get('/sessions/:id', validate(s.idParams), a.getSession);
router.post('/sessions/:id/adjust-score', validate(s.adjustScoreSchema), a.adjustScore);
router.post('/sessions/:id/proctor/unlock', validate(s.idParams), a.proctorUnlock);
router.post('/sessions/:id/disqualify', validate(s.disqualifySchema), a.disqualify);
router.post('/sessions/:id/reinstate', validate(s.idParams), a.reinstate);
router.get('/sessions-ledger-check', a.verifyLedgers);
router.get('/query-attempts', validate(s.recentQueriesSchema), a.recentQueries);
router.get('/queries', validate(s.recentQueriesSchema), a.recentQueries); // alias used by the command center
router.get('/leaderboard', validate(s.limitQuery), a.leaderboard);
router.post('/leaderboard/recompute', a.recomputeLeaderboard);
router.get('/audit-logs', validate(s.auditQuery), a.auditLog);
router.get('/audit', validate(s.auditQuery), a.auditLog); // alias

/* participants */
router.get('/participants', validate(s.participantListSchema), a.listParticipants);
router.post('/participants', validate(s.participantCreateSchema), a.createParticipant);
router.post('/participants/bulk', validate(s.participantBulkSchema), a.bulkCreateParticipants);
router.post('/participants/import', validate(s.participantBulkSchema), a.bulkCreateParticipants);
router.get('/participants/:id', validate(s.idParams), a.getParticipant);
router.patch('/participants/:id', validate(s.participantUpdateSchema), a.updateParticipant);
router.post('/participants/:id/reset-credentials', validate(s.resetCredentialsSchema), a.resetCredentials);
router.post('/participants/:id/reset-progress', validate(s.idParams), a.resetProgress);
router.delete('/participants/:id', validate(s.idParams), a.removeParticipant);

/* teams */
router.get('/teams', a.listTeams);
router.post('/teams', validate(s.teamSchema), a.createTeam);
router.patch('/teams/:id', validate(s.teamUpdateSchema), a.updateTeam);
router.delete('/teams/:id', validate(s.idParams), a.deleteTeam);

/* case files, challenges, hints, evidence */
router.get('/cases', a.listCaseFiles);
router.get('/answers', a.answerKey); // the answer key: reference SQL, its rows and accepted answers (coordinator only, like every route here)
router.post('/cases', validate(s.caseFileSchema), a.createCaseFile);
router.post('/cases/reorder', validate(s.reorderSchema), a.reorderCaseFiles);
router.patch('/cases/:id', validate(s.caseFileUpdateSchema), a.updateCaseFile);
router.delete('/cases/:id', validate(s.idParams), a.deleteCaseFile);
router.post('/cases/:id/challenges', validate(s.challengeCreateSchema), a.createChallenge);
router.patch('/challenges/:challengeId', validate(s.challengeUpdateSchema), a.updateChallenge);
router.delete('/challenges/:challengeId', validate(s.challengeParams), a.deleteChallenge);
router.post('/challenges/:challengeId/hints', validate(s.hintCreateSchema), a.createHint);
router.post('/hints', validate({ body: s.hintCreateSchema.body.extend({ challengeId: s.objectId }) }), (req, res, next) => {
  req.params.challengeId = req.body.challengeId;
  return a.createHint(req, res, next);
});
router.patch('/hints/:hintId', validate(s.hintUpdateSchema), a.updateHint);
router.delete('/hints/:hintId', validate(s.hintIdParams), a.deleteHint);
router.get('/evidence', a.listEvidence);
router.put('/evidence', validate(s.evidenceUpsertSchema), a.upsertEvidence);
router.delete('/evidence/:code', validate(s.evidenceCodeParams), a.deleteEvidence);

/* dataset */
router.get('/database/tables', a.listTables);
router.get('/database/tables/:name', validate(s.tableNameSchema), a.getTable);
router.post('/database/import', validate(s.tableImportSchema), a.importTables);
router.post('/database/validate', validate(s.tableImportSchema), a.validateTables);
router.patch('/database/tables/:name', validate(s.tableUpdateSchema), a.updateTable);
router.delete('/database/tables/:name', validate({ params: s.tableUpdateSchema.params }), a.deleteTable);
router.post('/database/reset', a.resetDatabase);
router.post('/database/reload', a.reloadDatabase);
router.get('/dataset', a.listTables);
router.post('/dataset/validate', validate(s.tableImportSchema), a.validateTables);
router.post('/dataset/reload', a.reloadDatabase);

/* event lifecycle */
router.get('/event', a.getEvent);
router.patch('/event', validate(s.eventUpdateSchema), a.updateEvent);
router.post('/event', validate(s.eventUpdateSchema), a.updateEvent);
router.post('/event/ready', a.readyEvent);
router.post('/event/schedule', validate(s.scheduleSchema), a.scheduleEvent);
router.post('/event/start', a.startEvent);
router.post('/event/pause', a.pauseEvent);
router.post('/event/resume', a.resumeEvent);
router.post('/event/extend', validate(s.extendSchema), a.extendEvent);
router.post('/event/end', a.endEvent);
router.post('/event/archive', a.archiveEvent);
router.post('/event/reset', validate(s.resetSchema), a.resetEvent);
router.post('/event/announce', validate(s.announceSchema), a.announce);

export default router;
