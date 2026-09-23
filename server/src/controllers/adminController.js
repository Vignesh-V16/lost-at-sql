import { adminService } from '../services/adminService.js';
import { answerKeyService } from '../services/answerKeyService.js';
import { proctorService } from '../services/proctorService.js';
import { eventService } from '../services/eventService.js';
import { datasetService } from '../services/datasetService.js';
import { monitorService } from '../services/monitorService.js';
import { auditService } from '../services/auditService.js';
import { challengeService } from '../services/challengeService.js';
import { leaderboardService } from '../services/leaderboardService.js';
import { resetService } from '../services/resetService.js';
import { ok, created, asyncHandler } from '../utils/http.js';
import { ApiError } from '../utils/ApiError.js';
import { emitToAll, SOCKET_EVENTS } from '../sockets/emitters.js';
import { requestMeta } from '../middleware/requestId.js';
import { eventView } from '../serializers/participantView.js';

/** Coordinator view of the event: everything the participant view has plus policies and hidden narrative. */
function coordinatorEvent(event) {
  const e = event.toObject ? event.toObject() : event;
  return {
    ...eventView(event),
    maxParticipants: e.maxParticipants,
    dataset: e.dataset,
    queryScope: e.queryScope,
    queryPolicy: e.queryPolicy,
    scoringPolicy: e.scoringPolicy,
    leaderboardPolicy: e.leaderboardPolicy,
    finalAttemptPolicy: e.finalAttemptPolicy,
    proctoring: e.proctoring,
    entities: e.entities,
    briefing: e.briefing,
    reveal: e.reveal,
    contentVersion: e.contentVersion,
    startedAt: e.startedAt,
    pausedAt: e.pausedAt,
    endedAt: e.endedAt,
    pausedTotalMs: e.pausedTotalMs,
    extendedMs: e.extendedMs,
  };
}

/* ------------------------------------------------------------ dashboard */

export const stats = asyncHandler(async (_req, res) => {
  const [summary, timeline, distribution] = await Promise.all([monitorService.stats(), monitorService.queryTimeline(60), monitorService.fileDistribution()]);
  ok(res, { summary, timeline, distribution });
});

export const monitor = asyncHandler(async (_req, res) => ok(res, await monitorService.participantRows()));

/* ---------------------------------------------------------- participants */

export const listParticipants = asyncHandler(async (req, res) => ok(res, await adminService.listParticipants(req.query)));
export const createParticipant = asyncHandler(async (req, res) => created(res, await adminService.createParticipant(req.body, req.user)));
export const bulkCreateParticipants = asyncHandler(async (req, res) => created(res, await adminService.bulkCreateParticipants(req.body.participants, req.user)));
export const getParticipant = asyncHandler(async (req, res) => ok(res, await adminService.participantDetail(req.params.id)));
export const updateParticipant = asyncHandler(async (req, res) => {
  const user = await adminService.updateParticipant(req.params.id, req.body, req.user);
  ok(res, { id: String(user._id), username: user.username, displayName: user.displayName, isActive: user.isActive, team: user.team });
});
export const resetCredentials = asyncHandler(async (req, res) => ok(res, await adminService.resetCredentials(req.params.id, req.body.accessCode, req.user)));
export const resetProgress = asyncHandler(async (req, res) => ok(res, await adminService.resetProgress(req.params.id, req.user, requestMeta(req))));
export const removeParticipant = asyncHandler(async (req, res) => {
  await adminService.removeParticipant(req.params.id, req.user, requestMeta(req));
  ok(res, { removed: true });
});

/* -------------------------------------------------------------- sessions */

export const listSessions = asyncHandler(async (req, res) => ok(res, await adminService.listSessions(req.query)));
export const getSession = asyncHandler(async (req, res) => {
  const detail = await monitorService.sessionDetail(req.params.id);
  if (!detail) throw ApiError.notFound('Session not found', 'SESSION_NOT_FOUND');
  ok(res, detail);
});
export const adjustScore = asyncHandler(async (req, res) => ok(res, await adminService.adjustScore(req.params.id, req.body.amount, req.body.reason, req.user, requestMeta(req))));
export const verifyLedgers = asyncHandler(async (_req, res) => ok(res, await adminService.verifyLedgers()));

/* ----------------------------------------------------------------- teams */

export const listTeams = asyncHandler(async (_req, res) => ok(res, await adminService.listTeams()));
export const createTeam = asyncHandler(async (req, res) => created(res, await adminService.createTeam(req.body, req.user)));
export const updateTeam = asyncHandler(async (req, res) => ok(res, await adminService.updateTeam(req.params.id, req.body, req.user)));
export const deleteTeam = asyncHandler(async (req, res) => {
  await adminService.deleteTeam(req.params.id, req.user);
  ok(res, { deleted: true });
});

/* ------------------------------------------------------------ case files */

export const listCaseFiles = asyncHandler(async (_req, res) => ok(res, await adminService.listCaseFiles()));
export const answerKey = asyncHandler(async (req, res) => ok(res, await answerKeyService.build()));
export const proctorUnlock = asyncHandler(async (req, res) => ok(res, await proctorService.unlock(req.params.id, { reset: req.body?.reset === true }, req.user)));
export const disqualify = asyncHandler(async (req, res) => ok(res, await proctorService.disqualify(req.params.id, req.body.reason, req.user, requestMeta(req))));
export const reinstate = asyncHandler(async (req, res) => ok(res, await proctorService.reinstate(req.params.id, req.user, requestMeta(req))));
export const createCaseFile = asyncHandler(async (req, res) => created(res, await adminService.createCaseFile(req.body, req.user)));
export const updateCaseFile = asyncHandler(async (req, res) => ok(res, await adminService.updateCaseFile(req.params.id, req.body, req.user)));
export const reorderCaseFiles = asyncHandler(async (req, res) => ok(res, await adminService.reorderCaseFiles(req.body.orderedIds, req.user)));
export const deleteCaseFile = asyncHandler(async (req, res) => {
  await adminService.deleteCaseFile(req.params.id, req.user);
  ok(res, { deleted: true });
});
export const createChallenge = asyncHandler(async (req, res) => created(res, await adminService.upsertChallenge(req.params.id, req.body, req.user)));
export const updateChallenge = asyncHandler(async (req, res) => ok(res, await adminService.updateChallenge(req.params.challengeId, req.body, req.user)));
export const deleteChallenge = asyncHandler(async (req, res) => {
  await adminService.deleteChallenge(req.params.challengeId, req.user);
  ok(res, { deleted: true });
});
export const createHint = asyncHandler(async (req, res) => created(res, await adminService.addHint(req.params.challengeId, req.body, req.user)));
export const updateHint = asyncHandler(async (req, res) => ok(res, await adminService.updateHint(req.params.hintId, req.body, req.user)));
export const deleteHint = asyncHandler(async (req, res) => {
  await adminService.deleteHint(req.params.hintId, req.user);
  ok(res, { deleted: true });
});

/* -------------------------------------------------------------- evidence */

export const listEvidence = asyncHandler(async (_req, res) => ok(res, await adminService.listEvidence()));
export const upsertEvidence = asyncHandler(async (req, res) => ok(res, await adminService.upsertEvidence(req.body, req.user)));
export const deleteEvidence = asyncHandler(async (req, res) => {
  await adminService.deleteEvidence(req.params.code, req.user);
  ok(res, { deleted: true });
});

/* -------------------------------------------------------------- database */

export const listTables = asyncHandler(async (_req, res) => ok(res, await datasetService.listTables()));
export const getTable = asyncHandler(async (req, res) => ok(res, await datasetService.getTable(req.params.name, req.query)));
export const importTables = asyncHandler(async (req, res) => ok(res, { imported: await datasetService.importTables(req.body.tables, req.user, { replace: req.body.replace }) }));
export const validateTables = asyncHandler(async (req, res) => ok(res, await datasetService.validateDefinitions(req.body.tables)));
export const updateTable = asyncHandler(async (req, res) => ok(res, await datasetService.updateTableMeta(req.params.name, req.body, req.user)));
export const deleteTable = asyncHandler(async (req, res) => {
  await datasetService.deleteTable(req.params.name, req.user);
  ok(res, { deleted: true });
});
export const resetDatabase = asyncHandler(async (req, res) => ok(res, { reset: true, tables: await datasetService.reset(req.user) }));
export const reloadDatabase = asyncHandler(async (_req, res) => {
  await datasetService.reload();
  ok(res, { reloaded: true });
});

/* ----------------------------------------------------------------- event */

export const getEvent = asyncHandler(async (_req, res) => ok(res, coordinatorEvent(await eventService.getEvent())));
export const updateEvent = asyncHandler(async (req, res) => ok(res, coordinatorEvent(await eventService.updateSettings(req.body, req.user))));
export const readyEvent = asyncHandler(async (req, res) => ok(res, coordinatorEvent(await eventService.ready(req.user))));
export const scheduleEvent = asyncHandler(async (req, res) => ok(res, coordinatorEvent(await eventService.schedule(req.body.startsAt, req.user))));
export const startEvent = asyncHandler(async (req, res) => ok(res, coordinatorEvent(await eventService.start(req.user))));
export const pauseEvent = asyncHandler(async (req, res) => ok(res, coordinatorEvent(await eventService.pause(req.user))));
export const resumeEvent = asyncHandler(async (req, res) => ok(res, coordinatorEvent(await eventService.resume(req.user))));
export const extendEvent = asyncHandler(async (req, res) => ok(res, coordinatorEvent(await eventService.extend(req.body.minutes, req.user))));
export const endEvent = asyncHandler(async (req, res) => ok(res, coordinatorEvent(await eventService.end(req.user))));
export const archiveEvent = asyncHandler(async (req, res) => ok(res, coordinatorEvent(await eventService.archive(req.user))));
export const resetEvent = asyncHandler(async (req, res) => {
  const result = await resetService.run(req.body, req.user, requestMeta(req));
  monitorService.schedulePush();
  ok(res, { ...result, event: coordinatorEvent(await eventService.getEvent()) });
});
export const announce = asyncHandler(async (req, res) => {
  emitToAll(SOCKET_EVENTS.ANNOUNCEMENT, { tone: req.body.tone || 'cyan', title: req.body.title, body: req.body.body });
  await auditService.record({ actor: req.user, action: 'ANNOUNCEMENT', meta: { title: req.body.title }, ...requestMeta(req) });
  ok(res, { sent: true });
});

/* ------------------------------------------------------------ misc views */

export const auditLog = asyncHandler(async (req, res) => ok(res, await auditService.list(req.query)));
export const recentQueries = asyncHandler(async (req, res) => ok(res, await challengeService.recent(req.query)));
export const leaderboard = asyncHandler(async (req, res) => ok(res, await leaderboardService.board({ limit: req.query.limit, viewer: req.user })));
export const recomputeLeaderboard = asyncHandler(async (_req, res) => {
  await leaderboardService.recomputeAll();
  ok(res, await leaderboardService.board());
});
