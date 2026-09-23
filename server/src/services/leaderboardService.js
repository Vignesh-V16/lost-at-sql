import { InvestigationSession, Leaderboard, SESSION_STATUS } from '../models/index.js';
import { rankEntries, normalizeLeaderboardPolicy, deriveProgression } from '../engine/index.js';
import { caseService } from './caseService.js';
import { eventService } from './eventService.js';
import { emitLeaderboard } from '../sockets/emitters.js';
import { logger } from '../utils/logger.js';

/**
 * Materialised, server-ranked leaderboard (spec §31). Rows are derived
 * from sessions only — never from anything a client sends. Upserts are
 * debounced so a burst of score changes triggers one re-rank.
 */
const pending = new Set();
let timer = null;

function rowFromSession(session, config) {
  const progression = deriveProgression(config, session);
  const hintsUsed = session.files.reduce((n, f) => n + f.challenges.reduce((m, c) => m + (c.hintsUsed?.length || 0), 0), 0);
  const participant = session.participant && session.participant._id ? session.participant : null;
  const team = session.team && session.team._id ? session.team : null;
  return {
    event: session.event,
    participant: participant ? participant._id : session.participant,
    session: session._id,
    team: team ? team._id : session.team || null,
    displayName: participant?.displayName || participant?.username || 'INVESTIGATOR',
    teamName: team?.name || '',
    teamColor: team?.color || '',
    score: session.score,
    completed: session.status === SESSION_STATUS.COMPLETED,
    status: session.status,
    elapsedMs: session.status === SESSION_STATUS.COMPLETED ? session.elapsedMs : null,
    filesCompleted: progression.completedCount,
    filesTotal: progression.totalCount,
    evidenceCount: session.evidence.length,
    hintsUsed,
    queries: session.stats?.queries || 0,
    lastActivityAt: session.lastActivityAt,
  };
}

export const leaderboardService = {
  /** Drop a session from the board — used when a coordinator disqualifies it. */
  async remove(sessionId) {
    await Leaderboard.deleteOne({ session: sessionId });
    await this.rerank();
  },

  scheduleUpsert(sessionId) {
    pending.add(String(sessionId));
    if (timer) return;
    timer = setTimeout(() => {
      const ids = Array.from(pending);
      pending.clear();
      timer = null;
      Promise.all(ids.map((id) => this.upsertFromSessionId(id, { rerank: false })))
        .then(() => this.rerank())
        .catch((err) => logger.warn('leaderboard upsert failed', err.message));
    }, 400);
    timer.unref?.();
  },

  async upsertFromSessionId(sessionId, { rerank = true } = {}) {
    const session = await InvestigationSession.findById(sessionId).populate('participant', 'username displayName').populate('team', 'name color');
    if (!session) return null;
    /* a disqualified session never sits on the board, however the upsert was triggered */
    if (session.status === SESSION_STATUS.DISQUALIFIED) {
      await Leaderboard.deleteOne({ session: session._id });
      if (rerank) await this.rerank();
      return null;
    }
    const config = await caseService.config();
    const row = rowFromSession(session, config);
    await Leaderboard.findOneAndUpdate({ event: row.event, participant: row.participant }, { $set: row }, { upsert: true, new: true });
    if (rerank) await this.rerank();
    return row;
  },

  async rerank() {
    const event = await eventService.current();
    const policy = normalizeLeaderboardPolicy(event.leaderboardPolicy);
    const rows = await Leaderboard.find({ event: event._id }).lean();
    const before = new Map(rows.map((r) => [String(r._id), r.rank || 0]));
    const ranked = rankEntries(rows, policy);
    const ops = ranked
      .filter((r) => r.rank !== before.get(String(r._id)))
      .map((r) => ({ updateOne: { filter: { _id: r._id }, update: { $set: { rank: r.rank, previousRank: before.get(String(r._id)) || 0 } } } }));
    if (ops.length) await Leaderboard.bulkWrite(ops, { ordered: false });
    emitLeaderboard(await this.board({ limit: policy.limit }));
  },

  async recomputeAll() {
    const event = await eventService.current({ fresh: true });
    const config = await caseService.config({ force: true });
    const sessions = await InvestigationSession.find({ event: event._id }).populate('participant', 'username displayName').populate('team', 'name color');
    await Leaderboard.deleteMany({ event: event._id });
    if (sessions.length) await Leaderboard.insertMany(sessions.map((s) => rowFromSession(s, config)));
    await this.rerank();
    return sessions.length;
  },

  async board({ limit, viewer } = {}) {
    const event = await eventService.current();
    const policy = normalizeLeaderboardPolicy(event.leaderboardPolicy);
    if (viewer && viewer.role === 'participant' && !policy.visibleToParticipants) return { visible: false, rows: [], groupBy: policy.groupBy };
    const max = Math.min(Number(limit) || policy.limit, 500);
    let rows = await Leaderboard.find({ event: event._id }).sort({ rank: 1 }).limit(policy.groupBy === 'team' ? 5000 : max).lean();
    if (policy.groupBy === 'team') {
      const byTeam = new Map();
      for (const r of rows) {
        const key = r.team ? String(r.team) : `solo:${r.participant}`;
        const t = byTeam.get(key) || { team: r.team, displayName: r.teamName || r.displayName, teamName: r.teamName, teamColor: r.teamColor, score: 0, completed: true, elapsedMs: 0, members: 0, filesCompleted: 0 };
        t.score += r.score;
        t.completed = t.completed && r.completed;
        t.elapsedMs = Math.max(t.elapsedMs, r.elapsedMs || 0);
        t.members += 1;
        t.filesCompleted += r.filesCompleted;
        byTeam.set(key, t);
      }
      rows = rankEntries(Array.from(byTeam.values()), policy).slice(0, max);
    }
    return {
      visible: true,
      groupBy: policy.groupBy,
      updatedAt: Date.now(),
      rows: rows.map((r) => ({
        rank: r.rank,
        previousRank: r.previousRank || 0,
        participantId: r.participant ? String(r.participant) : null,
        displayName: r.displayName,
        teamName: r.teamName || '',
        teamColor: r.teamColor || '',
        score: r.score,
        completed: Boolean(r.completed),
        status: r.status,
        elapsedMs: r.elapsedMs ?? null,
        filesCompleted: r.filesCompleted,
        filesTotal: r.filesTotal,
        evidenceCount: r.evidenceCount,
        hintsUsed: r.hintsUsed,
        members: r.members,
      })),
    };
  },
};
