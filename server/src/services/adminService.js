import crypto from 'node:crypto';
import { User, Participant, Team, CaseFile, EvidenceDefinition, InvestigationSession, QueryAttempt, Leaderboard, Event, CHALLENGE_HIDDEN_SELECT } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { guardSql } from '../utils/sqlGuard.js';
import { assertValidSpec, assertValidFinalConfig, assertValidTransitions, deriveProgression, SCORE_TX } from '../engine/index.js';
import { auditService } from './auditService.js';
import { leaderboardService } from './leaderboardService.js';
import { monitorService } from './monitorService.js';
import { eventService } from './eventService.js';
import { caseService } from './caseService.js';
import { sessionService } from './sessionService.js';
import { scoringService } from './scoringService.js';
import { authService } from './authService.js';
import { resetService, RESET_MODES } from './resetService.js';
import { emitToAll, emitToUser, disconnectUser, SOCKET_EVENTS } from '../sockets/emitters.js';

function generateAccessCode() {
  const raw = crypto.randomBytes(4).toString('hex');
  return `cipher-${raw.slice(0, 4)}-${raw.slice(4)}`;
}

async function resolveTeam(teamRef) {
  if (!teamRef) return null;
  if (typeof teamRef === 'string' && /^[a-f\d]{24}$/i.test(teamRef)) {
    const team = await Team.findById(teamRef);
    if (team) return team;
  }
  const byName = await Team.findOne({ $or: [{ name: String(teamRef).toUpperCase() }, { code: String(teamRef).toUpperCase() }] });
  if (byName) return byName;
  const name = String(teamRef).toUpperCase().trim();
  const code = name.replace(/[^A-Z0-9]/g, '').slice(0, 6) || crypto.randomBytes(3).toString('hex').toUpperCase();
  return Team.create({ name, code });
}

async function assertContentEditable(force) {
  const event = await eventService.current({ fresh: true });
  if (['live', 'paused'].includes(event.status) && !force) {
    throw ApiError.conflict('Case content is locked while the investigation is live. Pass force=true to override (audited).', 'CONTENT_LOCKED');
  }
  return event;
}

function validateChallengeInput(ch) {
  /* Reference and starter SQL are executed by the answer key with coordinator
     privileges, so they must clear the same read-only guard as a participant
     query — no PRAGMA, no DDL, no second statement. */
  for (const key of ['referenceSql', 'starterSql']) {
    if (!ch[key]) continue;
    const guard = guardSql(ch[key]);
    if (!guard.ok) throw ApiError.badRequest(`${key}: ${guard.message}`, guard.code);
  }
  if (ch.kind === 'FINAL_DEDUCTION') {
    if (ch.validation) assertValidFinalConfig(ch.validation.config || ch.validation);
  } else if (ch.validation) {
    assertValidSpec(ch.validation, ch.code || 'challenge');
  }
  if (ch.onSuccess?.transitions) assertValidTransitions(ch.onSuccess.transitions);
}

function contentChanged() {
  caseService.invalidate();
  emitToAll(SOCKET_EVENTS.CASES_UPDATED, { at: Date.now() });
}

export const adminService = {
  /* ----------------------------------------------------- participants */

  async listParticipants({ search = '', page = 1, limit = 50, team } = {}) {
    const filter = { role: 'participant' };
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ username: rx }, { displayName: rx }];
    }
    if (team) filter.team = team;
    const [items, total, config] = await Promise.all([
      User.find(filter).populate('team', 'name code color').sort({ displayName: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(filter),
      caseService.config(),
    ]);
    const sessions = await InvestigationSession.find({ participant: { $in: items.map((i) => i._id) } }).select('participant status files evidence stats score finalAttempts completedAt').lean();
    const byUser = new Map(sessions.map((s) => [String(s.participant), s]));
    return {
      items: items.map((u) => {
        const s = byUser.get(String(u._id));
        const p = s ? deriveProgression(config, s) : null;
        return {
          id: String(u._id),
          username: u.username,
          displayName: u.displayName,
          isActive: u.isActive,
          team: u.team ? { id: String(u.team._id), name: u.team.name, code: u.team.code, color: u.team.color } : null,
          lastLoginAt: u.lastLoginAt || null,
          lastSeenAt: u.lastSeenAt || null,
          createdAt: u.createdAt,
          progress: s ? { sessionId: String(s._id), status: s.status, score: s.score, filesCompleted: p.completedCount, filesTotal: p.totalCount, evidence: s.evidence.length, queries: s.stats?.queries || 0, completed: s.status === 'completed' } : null,
        };
      }),
      total,
      page,
      limit,
    };
  },

  async createParticipant({ username, displayName, accessCode, team }, actor) {
    const event = await Event.getSingleton();
    const count = await User.countDocuments({ role: 'participant' });
    if (count >= event.maxParticipants) throw ApiError.conflict(`Participant limit of ${event.maxParticipants} reached`, 'PARTICIPANT_LIMIT');
    const exists = await User.findOne({ username: username.toLowerCase() });
    if (exists) throw ApiError.conflict('An investigator with this ID already exists', 'DUPLICATE');
    const teamDoc = await resolveTeam(team);
    const code = accessCode || generateAccessCode();
    const user = await Participant.create({ username, displayName: displayName || username.toUpperCase(), passwordHash: await User.hashPassword(code), team: teamDoc?._id || null });
    await auditService.record({ actor, action: 'PARTICIPANT_CREATED', target: user.username, meta: { team: teamDoc?.name } });
    monitorService.schedulePush();
    return { id: String(user._id), username: user.username, displayName: user.displayName, team: teamDoc ? { id: String(teamDoc._id), name: teamDoc.name } : null, accessCode: code };
  },

  async bulkCreateParticipants(rows, actor) {
    const created = [];
    const failed = [];
    for (const row of rows) {
      try {
        // eslint-disable-next-line no-await-in-loop
        created.push(await this.createParticipant(row, actor));
      } catch (err) {
        failed.push({ username: row.username, reason: err.message });
      }
    }
    return { created, failed };
  },

  async updateParticipant(id, patch, actor) {
    const user = await User.findOne({ _id: id, role: 'participant' });
    if (!user) throw ApiError.notFound('Participant not found', 'PARTICIPANT_NOT_FOUND');
    if (patch.displayName !== undefined) user.displayName = patch.displayName;
    if (patch.username !== undefined && patch.username !== user.username) {
      const exists = await User.findOne({ username: patch.username.toLowerCase() });
      if (exists) throw ApiError.conflict('Investigator ID already in use', 'DUPLICATE');
      user.username = patch.username;
    }
    if (patch.isActive !== undefined) {
      user.isActive = patch.isActive;
      if (!patch.isActive) {
        await authService.revokeAll(user._id);
        emitToUser(user._id, SOCKET_EVENTS.SESSION_REVOKED, { reason: 'ACCOUNT_DISABLED' });
        disconnectUser(user._id);
      }
    }
    if (patch.team !== undefined) {
      const teamDoc = await resolveTeam(patch.team);
      user.team = teamDoc?._id || null;
      await InvestigationSession.updateMany({ participant: user._id }, { $set: { team: user.team } });
      await QueryAttempt.updateMany({ participant: user._id }, { $set: { team: user.team } });
    }
    await user.save();
    const session = await InvestigationSession.findOne({ participant: user._id }).select('_id').lean();
    if (session) await leaderboardService.upsertFromSessionId(session._id);
    monitorService.schedulePush();
    await auditService.record({ actor, action: 'PARTICIPANT_UPDATED', target: user.username, meta: { keys: Object.keys(patch) } });
    return user;
  },

  async resetCredentials(id, accessCode, actor) {
    const user = await User.findOne({ _id: id, role: 'participant' }).select('+passwordHash');
    if (!user) throw ApiError.notFound('Participant not found', 'PARTICIPANT_NOT_FOUND');
    const code = accessCode || generateAccessCode();
    user.passwordHash = await User.hashPassword(code);
    await user.save();
    await authService.revokeAll(user._id);
    emitToUser(user._id, SOCKET_EVENTS.SESSION_REVOKED, { reason: 'CREDENTIALS_RESET' });
    disconnectUser(user._id);
    await auditService.record({ actor, action: 'CREDENTIALS_RESET', target: user.username });
    return { id: String(user._id), username: user.username, accessCode: code };
  },

  async resetProgress(id, actor, meta) {
    const event = await eventService.current({ fresh: true });
    const res = await resetService.run({ mode: RESET_MODES.RESET_PARTICIPANT, target: id, confirm: event.slug }, actor, meta);
    monitorService.schedulePush();
    return res;
  },

  async removeParticipant(id, actor, meta) {
    const user = await User.findOne({ _id: id, role: 'participant' });
    if (!user) throw ApiError.notFound('Participant not found', 'PARTICIPANT_NOT_FOUND');
    emitToUser(user._id, SOCKET_EVENTS.SESSION_REVOKED, { reason: 'ACCOUNT_REMOVED' });
    disconnectUser(user._id);
    const event = await eventService.current({ fresh: true });
    await resetService.run({ mode: RESET_MODES.RESET_PARTICIPANT, target: id, confirm: event.slug }, actor, meta);
    await Promise.all([Leaderboard.deleteMany({ participant: user._id }), User.deleteOne({ _id: user._id })]);
    await leaderboardService.rerank();
    monitorService.schedulePush();
    await auditService.record({ actor, action: 'PARTICIPANT_REMOVED', target: user.username });
  },

  async participantDetail(id) {
    const user = await User.findOne({ _id: id, role: 'participant' }).populate('team', 'name code color').lean();
    if (!user) throw ApiError.notFound('Participant not found', 'PARTICIPANT_NOT_FOUND');
    const session = await InvestigationSession.findOne({ participant: user._id }).select('_id').lean();
    const detail = session ? await monitorService.sessionDetail(session._id) : null;
    return {
      user: { id: String(user._id), username: user.username, displayName: user.displayName, isActive: user.isActive, team: user.team || null, lastLoginAt: user.lastLoginAt, lastSeenAt: user.lastSeenAt },
      session: detail,
    };
  },

  /** Audited manual score adjustment (e.g. a coordinator awards back a penalty). */
  async adjustScore(sessionId, amount, reason, actor, meta) {
    if (!Number.isFinite(Number(amount)) || !amount) throw ApiError.badRequest('amount must be a non-zero number');
    const result = await sessionService.mutate(sessionId, (doc, { event, now }) => {
      const key = `coordinator:${now.getTime()}:${crypto.randomBytes(3).toString('hex')}`;
      const { tx } = scoringService.charge(doc, scoringService.policyOf(event), SCORE_TX.COORDINATOR_ADJUST, { key, amount: Number(amount), ref: { reason: String(reason || '').slice(0, 200), by: String(actor?._id) }, at: now });
      return { score: doc.score, delta: tx.delta, participant: doc.participant };
    }, { requireActive: false });
    await auditService.record({ actor, action: 'SCORE_ADJUSTED', target: String(sessionId), meta: { amount, reason }, ...meta });
    await leaderboardService.upsertFromSessionId(sessionId);
    emitToUser(result.participant, SOCKET_EVENTS.SESSION_UPDATE, { score: result.score, reason: 'COORDINATOR_ADJUST', at: Date.now() });
    return result;
  },

  /* ------------------------------------------------------------ teams */

  async listTeams() {
    const teams = await Team.find().sort({ name: 1 }).lean();
    const counts = await User.aggregate([{ $match: { role: 'participant' } }, { $group: { _id: '$team', n: { $sum: 1 } } }]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.n]));
    return teams.map((t) => ({ id: String(t._id), name: t.name, code: t.code, color: t.color, members: countMap.get(String(t._id)) || 0 }));
  },

  async createTeam({ name, code, color }, actor) {
    const team = await Team.create({ name, code: code || name.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase(), color });
    await auditService.record({ actor, action: 'TEAM_CREATED', target: team.name });
    return team;
  },

  async updateTeam(id, patch, actor) {
    const team = await Team.findById(id);
    if (!team) throw ApiError.notFound('Team not found', 'TEAM_NOT_FOUND');
    Object.assign(team, patch);
    await team.save();
    await auditService.record({ actor, action: 'TEAM_UPDATED', target: team.name });
    await leaderboardService.recomputeAll();
    return team;
  },

  async deleteTeam(id, actor) {
    const team = await Team.findById(id);
    if (!team) throw ApiError.notFound('Team not found', 'TEAM_NOT_FOUND');
    await User.updateMany({ team: team._id }, { $set: { team: null } });
    await InvestigationSession.updateMany({ team: team._id }, { $set: { team: null } });
    await team.deleteOne();
    await auditService.record({ actor, action: 'TEAM_DELETED', target: team.name });
    await leaderboardService.recomputeAll();
  },

  /* ------------------------------------------ case files / challenges */

  async listCaseFiles() {
    const files = await CaseFile.find().sort({ sequence: 1 }).select(CHALLENGE_HIDDEN_SELECT).lean();
    return files.map((f) => ({ ...f, id: String(f._id), challenges: (f.challenges || []).map((c) => ({ ...c, id: String(c._id), hints: (c.hints || []).map((h) => ({ ...h, id: String(h._id) })) })) }));
  },

  async createCaseFile(data, actor) {
    await assertContentEditable(data.force);
    for (const ch of data.challenges || []) validateChallengeInput(ch);
    const max = await CaseFile.findOne().sort({ sequence: -1 }).select('sequence').lean();
    const file = await CaseFile.create({ ...data, sequence: data.sequence ?? (max?.sequence || 0) + 1 });
    await auditService.record({ actor, action: 'CASE_FILE_CREATED', target: file.code });
    contentChanged();
    return (await this.listCaseFiles()).find((f) => f.id === String(file._id));
  },

  async updateCaseFile(id, patch, actor) {
    await assertContentEditable(patch.force);
    const file = await CaseFile.findById(id).select(CHALLENGE_HIDDEN_SELECT);
    if (!file) throw ApiError.notFound('Case file not found', 'FILE_NOT_FOUND');
    const { force, challenges, ...rest } = patch;
    Object.assign(file, rest);
    if (Array.isArray(challenges)) {
      challenges.forEach(validateChallengeInput);
      file.challenges = challenges;
    }
    await file.save();
    await auditService.record({ actor, action: 'CASE_FILE_UPDATED', target: file.code, meta: { keys: Object.keys(patch), forced: Boolean(force) } });
    contentChanged();
    return (await this.listCaseFiles()).find((f) => f.id === String(file._id));
  },

  async reorderCaseFiles(orderedIds, actor) {
    await assertContentEditable(false);
    const ops = orderedIds.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { sequence: i + 1 } } } }));
    if (ops.length) await CaseFile.bulkWrite(ops);
    await auditService.record({ actor, action: 'CASE_FILES_REORDERED' });
    contentChanged();
    return this.listCaseFiles();
  },

  async deleteCaseFile(id, actor) {
    await assertContentEditable(false);
    const file = await CaseFile.findById(id);
    if (!file) throw ApiError.notFound('Case file not found', 'FILE_NOT_FOUND');
    await file.deleteOne();
    await auditService.record({ actor, action: 'CASE_FILE_DELETED', target: file.code });
    contentChanged();
  },

  async upsertChallenge(fileId, data, actor) {
    await assertContentEditable(data.force);
    const file = await CaseFile.findById(fileId).select(CHALLENGE_HIDDEN_SELECT);
    if (!file) throw ApiError.notFound('Case file not found', 'FILE_NOT_FOUND');
    const { force, ...challenge } = data;
    validateChallengeInput(challenge);
    const existing = challenge.code ? file.challenges.find((c) => c.code === String(challenge.code).toUpperCase()) : null;
    if (existing) Object.assign(existing, challenge);
    else file.challenges.push({ ...challenge, sequence: challenge.sequence ?? file.challenges.length + 1 });
    await file.save();
    await auditService.record({ actor, action: existing ? 'CHALLENGE_UPDATED' : 'CHALLENGE_CREATED', target: `${file.code}/${challenge.code}`, meta: { forced: Boolean(force) } });
    contentChanged();
    return (await this.listCaseFiles()).find((f) => f.id === String(file._id));
  },

  async updateChallenge(challengeId, patch, actor) {
    await assertContentEditable(patch.force);
    const file = await CaseFile.findOne({ 'challenges._id': challengeId }).select(CHALLENGE_HIDDEN_SELECT);
    if (!file) throw ApiError.notFound('Challenge not found', 'CHALLENGE_NOT_FOUND');
    const ch = file.challenges.id(challengeId);
    const { force, ...rest } = patch;
    validateChallengeInput({ ...ch.toObject(), ...rest });
    Object.assign(ch, rest);
    await file.save();
    await auditService.record({ actor, action: 'CHALLENGE_UPDATED', target: `${file.code}/${ch.code}`, meta: { keys: Object.keys(rest), forced: Boolean(force) } });
    contentChanged();
    return (await this.listCaseFiles()).find((f) => f.id === String(file._id));
  },

  async deleteChallenge(challengeId, actor) {
    await assertContentEditable(false);
    const file = await CaseFile.findOne({ 'challenges._id': challengeId }).select(CHALLENGE_HIDDEN_SELECT);
    if (!file) throw ApiError.notFound('Challenge not found', 'CHALLENGE_NOT_FOUND');
    const ch = file.challenges.id(challengeId);
    ch.deleteOne();
    await file.save();
    await auditService.record({ actor, action: 'CHALLENGE_DELETED', target: `${file.code}/${ch.code}` });
    contentChanged();
  },

  async addHint(challengeId, data, actor) {
    await assertContentEditable(data.force);
    const file = await CaseFile.findOne({ 'challenges._id': challengeId }).select(CHALLENGE_HIDDEN_SELECT);
    if (!file) throw ApiError.notFound('Challenge not found', 'CHALLENGE_NOT_FOUND');
    const ch = file.challenges.id(challengeId);
    ch.hints.push({ code: data.code || `H${ch.hints.length + 1}`, text: data.text, penalty: data.penalty ?? null });
    await file.save();
    await auditService.record({ actor, action: 'HINT_CREATED', target: `${file.code}/${ch.code}` });
    contentChanged();
    return (await this.listCaseFiles()).find((f) => f.id === String(file._id));
  },

  async updateHint(hintId, patch, actor) {
    await assertContentEditable(patch.force);
    const file = await CaseFile.findOne({ 'challenges.hints._id': hintId }).select(CHALLENGE_HIDDEN_SELECT);
    if (!file) throw ApiError.notFound('Hint not found', 'HINT_NOT_FOUND');
    for (const ch of file.challenges) {
      const h = ch.hints.id(hintId);
      if (!h) continue;
      if (patch.text !== undefined) h.text = patch.text;
      if (patch.penalty !== undefined) h.penalty = patch.penalty;
      if (patch.code !== undefined) h.code = patch.code;
      await file.save();
      await auditService.record({ actor, action: 'HINT_UPDATED', target: `${file.code}/${ch.code}/${h.code}` });
      contentChanged();
      return (await this.listCaseFiles()).find((f) => f.id === String(file._id));
    }
    throw ApiError.notFound('Hint not found', 'HINT_NOT_FOUND');
  },

  async deleteHint(hintId, actor) {
    await assertContentEditable(false);
    const file = await CaseFile.findOne({ 'challenges.hints._id': hintId }).select(CHALLENGE_HIDDEN_SELECT);
    if (!file) throw ApiError.notFound('Hint not found', 'HINT_NOT_FOUND');
    for (const ch of file.challenges) {
      const h = ch.hints.id(hintId);
      if (!h) continue;
      h.deleteOne();
      await file.save();
      await auditService.record({ actor, action: 'HINT_DELETED', target: `${file.code}/${ch.code}` });
      contentChanged();
      return;
    }
  },

  /* --------------------------------------------------------- evidence */

  async listEvidence() {
    return EvidenceDefinition.find().sort({ order: 1 }).select('+passiveTrigger').lean();
  },

  async upsertEvidence(data, actor) {
    await assertContentEditable(data.force);
    const { force, ...def } = data;
    const doc = await EvidenceDefinition.findOneAndUpdate({ code: String(def.code).toUpperCase() }, { $set: def }, { upsert: true, new: true, runValidators: true });
    await auditService.record({ actor, action: 'EVIDENCE_UPSERTED', target: doc.code });
    contentChanged();
    return doc;
  },

  async deleteEvidence(code, actor) {
    await assertContentEditable(false);
    const res = await EvidenceDefinition.deleteOne({ code: String(code).toUpperCase() });
    if (!res.deletedCount) throw ApiError.notFound('Evidence not found', 'EVIDENCE_NOT_FOUND');
    await auditService.record({ actor, action: 'EVIDENCE_DELETED', target: code });
    contentChanged();
  },

  /* --------------------------------------------------------- sessions */

  async listSessions({ status, team, page = 1, limit = 100 } = {}) {
    const filter = {};
    if (status) filter.status = status;
    if (team) filter.team = team;
    const [rows, total, config, event] = await Promise.all([
      InvestigationSession.find(filter).sort({ lastActivityAt: -1 }).skip((page - 1) * limit).limit(limit).populate('participant', 'username displayName').populate('team', 'name color').lean(),
      InvestigationSession.countDocuments(filter),
      caseService.config(),
      eventService.current(),
    ]);
    return {
      items: rows.map((s) => {
        const p = deriveProgression(config, s);
        return {
          id: String(s._id),
          participant: s.participant ? { id: String(s.participant._id), username: s.participant.username, displayName: s.participant.displayName } : null,
          team: s.team ? { id: String(s.team._id), name: s.team.name, color: s.team.color } : null,
          status: s.status,
          score: s.score,
          currentFileCode: p.currentFileCode,
          currentChallengeCode: p.currentChallengeCode,
          filesCompleted: p.completedCount,
          filesTotal: p.totalCount,
          startedAt: s.startedAt,
          expiresAt: s.expiresAt,
          completedAt: s.completedAt || null,
          elapsedMs: s.elapsedMs ?? null,
          lastActivityAt: s.lastActivityAt,
          queries: s.stats?.queries || 0,
          finalAttempts: s.finalAttempts || 0,
          ledgerOk: !scoringService.verify(s),
        };
      }),
      total,
      page,
      limit,
      event: { status: event.status },
    };
  },

  async verifyLedgers() {
    const sessions = await InvestigationSession.find().select('score ledger participant').lean();
    const drift = sessions.map((s) => ({ id: String(s._id), participant: String(s.participant), problem: scoringService.verify(s) })).filter((x) => x.problem);
    return { checked: sessions.length, drift };
  },
};
