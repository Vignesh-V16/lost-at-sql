import { sessionService } from '../services/sessionService.js';
import { challengeService } from '../services/challengeService.js';
import { finalService } from '../services/finalService.js';
import { evidenceService } from '../services/evidenceService.js';
import { datasetService } from '../services/datasetService.js';
import { leaderboardService } from '../services/leaderboardService.js';
import { eventService } from '../services/eventService.js';
import { proctorService } from '../services/proctorService.js';
import { ok, asyncHandler } from '../utils/http.js';
import { ApiError } from '../utils/ApiError.js';
import { requestMeta } from '../middleware/requestId.js';
import { sessionView } from '../serializers/participantView.js';

/* ---------------------------------------------------------------- event */

export const eventState = asyncHandler(async (_req, res) => {
  ok(res, await eventService.getState());
});

/* ------------------------------------------------------------- session */

export const briefing = asyncHandler(async (req, res) => {
  ok(res, await sessionService.briefing(req.user));
});

export const start = asyncHandler(async (req, res) => {
  const { view, resumed } = await sessionService.start(req.user, requestMeta(req));
  ok(res, { ...view, resumed });
});

export const session = asyncHandler(async (req, res) => {
  const { config, event, session: doc } = await sessionService.context(req.user);
  if (!doc) return ok(res, { session: null, event: eventService.publicState(event) });
  const fresh = await sessionService.expireIfNeeded(doc, event);
  return ok(res, { session: sessionView(fresh, event, config), event: eventService.publicState(event) });
});

export const currentFile = asyncHandler(async (req, res) => {
  const { config, event, session: doc } = await sessionService.context(req.user);
  if (!doc) throw ApiError.notFound('No investigation session. Open the case file to begin.', 'SESSION_NOT_FOUND');
  const view = sessionView(doc, event, config);
  if (!view.currentFileCode) return ok(res, { file: null, session: view });
  return ok(res, { file: await challengeService.openFile(req.user, view.currentFileCode), session: view });
});

export const progress = asyncHandler(async (req, res) => {
  const { config, event, session: doc } = await sessionService.context(req.user);
  if (!doc) return ok(res, null);
  const v = sessionView(doc, event, config);
  ok(res, { status: v.status, score: v.score, remainingMs: v.remainingMs, serverTime: v.serverTime, currentFileCode: v.currentFileCode, currentChallengeCode: v.currentChallengeCode, files: v.files, completedCount: v.completedCount, totalCount: v.totalCount, finalUnlocked: v.finalUnlocked });
});

/* --------------------------------------------------------------- cases */

export const getCase = asyncHandler(async (req, res) => {
  ok(res, await challengeService.openFile(req.user, req.params.code));
});

export const caseSchema = asyncHandler(async (req, res) => {
  ok(res, await challengeService.schema(req.user, req.params.code));
});

export const caseQuery = asyncHandler(async (req, res) => {
  ok(res, await challengeService.query(req.user, req.params.code, req.body.sql, requestMeta(req)));
});

export const useHint = asyncHandler(async (req, res) => {
  ok(res, await challengeService.useHint(req.user, req.params.code, req.params.hintId, requestMeta(req)));
});

export const submit = asyncHandler(async (req, res) => {
  ok(res, await challengeService.submit(req.user, req.params.code, req.body, requestMeta(req)));
});

/* ---------------------------------------------------------------- final */

export const finalStatus = asyncHandler(async (req, res) => {
  ok(res, await finalService.status(req.user));
});

export const finalQuery = asyncHandler(async (req, res) => {
  ok(res, await finalService.query(req.user, req.body.sql, requestMeta(req)));
});

export const finalSubmit = asyncHandler(async (req, res) => {
  ok(res, await finalService.submit(req.user, req.body, requestMeta(req)));
});

/* ------------------------------------------------------------- evidence */

export const evidenceBoard = asyncHandler(async (req, res) => {
  ok(res, await evidenceService.board(req.user));
});

export const evidenceItem = asyncHandler(async (req, res) => {
  ok(res, await evidenceService.item(req.user, req.params.code));
});

/* ------------------------------------------------------------- database */

export const schema = asyncHandler(async (_req, res) => {
  ok(res, await datasetService.schema());
});

export const tableSample = asyncHandler(async (req, res) => {
  ok(res, await datasetService.sample(req.params.name, req.query.limit));
});

export const queryHistory = asyncHandler(async (req, res) => {
  ok(res, await challengeService.history(req.user, { limit: req.query.limit }));
});

/** The browser reporting an exam-integrity flag (tab switch, paste, …). */
export const proctorFlag = asyncHandler(async (req, res) => {
  ok(res, await proctorService.record(req.user, req.body, requestMeta(req)));
});

/* ---------------------------------------------------------- leaderboard */

export const leaderboard = asyncHandler(async (req, res) => {
  ok(res, await leaderboardService.board({ limit: req.query.limit, viewer: req.user }));
});
