import { User, InvestigationSession, QueryAttempt, Team, SESSION_STATUS } from '../models/index.js';
import { deriveProgression, sessionRemainingMs } from '../engine/index.js';
import { isOnline, emitMonitor, emitStats, connectionCount } from '../sockets/emitters.js';
import { caseService } from './caseService.js';
import { eventService } from './eventService.js';
import { sqlService } from './sqlService.js';
import { logger } from '../utils/logger.js';

let monitorTimer = null;
let statsTimer = null;

/**
 * Coordinator-facing live views (spec §32, §46). Everything is derived
 * from persisted sessions, debounced and pushed over sockets. Payloads
 * never include hidden solution data.
 */
export const monitorService = {
  async participantRows() {
    const [users, sessions, config, event] = await Promise.all([
      User.find({ role: 'participant' }).populate('team', 'name code color').sort({ displayName: 1 }).lean(),
      InvestigationSession.find().lean(),
      caseService.config(),
      eventService.current(),
    ]);
    const byUser = new Map(sessions.map((s) => [String(s.participant), s]));
    const filesTotal = config.files.length;
    return users.map((u) => {
      const s = byUser.get(String(u._id));
      const progression = s ? deriveProgression(config, s) : null;
      const current = progression?.currentFileCode ? config.byFile.get(progression.currentFileCode) : null;
      const hintsUsed = s ? s.files.reduce((n, f) => n + f.challenges.reduce((m, c) => m + (c.hintsUsed?.length || 0), 0), 0) : 0;
      let status = 'not_started';
      if (s?.status === SESSION_STATUS.DISQUALIFIED) status = 'disqualified';
      else if (s?.status === SESSION_STATUS.COMPLETED) status = 'completed';
      else if (s?.status === SESSION_STATUS.TIME_EXPIRED) status = 'expired';
      else if (s && isOnline(u._id)) status = 'online';
      else if (s) status = 'offline';
      if (!u.isActive) status = 'disabled';
      return {
        id: String(u._id),
        sessionId: s ? String(s._id) : null,
        username: u.username,
        displayName: u.displayName,
        team: u.team ? { id: String(u.team._id), name: u.team.name, code: u.team.code, color: u.team.color } : null,
        status,
        online: isOnline(u._id),
        score: s?.score ?? null,
        currentFile: current ? { code: current.code, label: current.label, title: current.title, challenge: progression.currentChallengeCode } : null,
        filesCompleted: progression?.completedCount || 0,
        filesTotal,
        progressPct: progression ? Math.round((progression.completedCount / Math.max(1, filesTotal)) * 100) : 0,
        evidence: s?.evidence?.length || 0,
        evidenceTotal: config.evidence.length,
        hintsUsed,
        violations: s?.violationCount || 0,
        awayMs: s?.awayMs || 0,
        proctorLocked: Boolean(s?.proctorLocked),
        disqualified: s?.status === SESSION_STATUS.DISQUALIFIED,
        disqualifiedReason: s?.disqualifiedReason || '',
        lastFlag: s?.violations?.length ? { type: s.violations[s.violations.length - 1].type, at: s.violations[s.violations.length - 1].at } : null,
        queries: s?.stats?.queries || 0,
        successfulQueries: s?.stats?.successful || 0,
        blockedQueries: s?.stats?.blocked || 0,
        finalAttempts: s?.finalAttempts || 0,
        remainingMs: s ? sessionRemainingMs(s, event) : null,
        startedAt: s?.startedAt || null,
        completedAt: s?.completedAt || null,
        elapsedMs: s?.status === SESSION_STATUS.COMPLETED ? s.elapsedMs : null,
        lastActivityAt: s?.lastActivityAt || null,
        lastSeenAt: u.lastSeenAt || null,
      };
    });
  },

  async stats() {
    const [participants, teams, sessions, queries, sqlFailures, config, avg] = await Promise.all([
      User.countDocuments({ role: 'participant', isActive: true }),
      Team.countDocuments(),
      InvestigationSession.find().select('status files evidence stats finalAttempts score').lean(),
      QueryAttempt.countDocuments(),
      QueryAttempt.countDocuments({ status: { $in: ['error', 'timeout', 'rejected'] } }),
      caseService.config(),
      QueryAttempt.aggregate([{ $match: { status: 'success', executedAt: { $gte: new Date(Date.now() - 10 * 60000) } } }, { $group: { _id: null, avg: { $avg: '$durationMs' } } }]),
    ]);
    let filesCompleted = 0;
    let evidenceDiscovered = 0;
    let successful = 0;
    let hints = 0;
    let finalSubmissions = 0;
    let completed = 0;
    let expired = 0;
    let active = 0;
    let scoreSum = 0;
    for (const s of sessions) {
      const p = deriveProgression(config, s);
      filesCompleted += p.completedCount;
      evidenceDiscovered += s.evidence.length;
      successful += s.stats?.successful || 0;
      hints += s.files.reduce((n, f) => n + f.challenges.reduce((m, c) => m + (c.hintsUsed?.length || 0), 0), 0);
      finalSubmissions += s.finalAttempts || 0;
      scoreSum += s.score || 0;
      if (s.status === SESSION_STATUS.COMPLETED) completed += 1;
      else if (s.status === SESSION_STATUS.TIME_EXPIRED) expired += 1;
      else active += 1;
    }
    const lastMinute = await QueryAttempt.countDocuments({ executedAt: { $gte: new Date(Date.now() - 60000) } });
    return {
      registeredParticipants: participants,
      activeTeams: teams,
      sessions: sessions.length,
      activeSessions: active,
      completedSessions: completed,
      expiredSessions: expired,
      onlineParticipants: sessions.filter((s) => isOnline(s.participant)).length,
      socketConnections: connectionCount(),
      filesCompleted,
      filesTotal: config.files.length,
      completionRate: sessions.length ? Math.round((filesCompleted / (sessions.length * Math.max(1, config.files.length))) * 100) : 0,
      queriesExecuted: queries,
      queriesPerMinute: lastMinute,
      successfulQueries: successful,
      sqlFailures,
      sqlFailureRate: queries ? Math.round((sqlFailures / queries) * 100) : 0,
      avgQueryMs: avg[0]?.avg ? Math.round(avg[0].avg * 100) / 100 : 0,
      evidenceDiscovered,
      evidenceTotal: config.evidence.length * Math.max(1, sessions.length),
      hintsUsed: hints,
      finalSubmissions,
      averageScore: sessions.length ? Math.round(scoreSum / sessions.length) : 0,
      sqlEngine: sqlService.stats(),
      at: Date.now(),
    };
  },

  /** Queries per minute for the last `minutes`, for the dashboard chart. */
  async queryTimeline(minutes = 60) {
    const since = new Date(Date.now() - minutes * 60 * 1000);
    const attempts = await QueryAttempt.find({ executedAt: { $gte: since } }).select('executedAt status').lean();
    const buckets = new Map();
    const startMinute = Math.floor(since.getTime() / 60000);
    const nowMinute = Math.floor(Date.now() / 60000);
    for (let m = startMinute; m <= nowMinute; m += 1) buckets.set(m, { minute: new Date(m * 60000), total: 0, success: 0, failed: 0 });
    for (const a of attempts) {
      const b = buckets.get(Math.floor(new Date(a.executedAt).getTime() / 60000));
      if (!b) continue;
      b.total += 1;
      if (a.status === 'success') b.success += 1;
      else b.failed += 1;
    }
    return Array.from(buckets.values());
  },

  /** Per-file funnel: how many sessions are locked / available / active / completed on each file. */
  async fileDistribution() {
    const [config, sessions] = await Promise.all([caseService.config(), InvestigationSession.find().select('files').lean()]);
    const rows = config.files.map((f) => ({ code: f.code, label: f.label, title: f.title, locked: 0, available: 0, active: 0, completed: 0 }));
    for (const s of sessions) {
      const p = deriveProgression(config, s);
      for (const f of p.files) {
        const row = rows.find((r) => r.code === f.code);
        if (row) row[f.status] = (row[f.status] || 0) + 1;
      }
    }
    return rows;
  },

  /** Full detail of one session for the coordinator drawer (ledger, timeline, attempts). */
  async sessionDetail(sessionId) {
    const session = await InvestigationSession.findById(sessionId).populate('participant', 'username displayName isActive').populate('team', 'name code color').lean();
    if (!session) return null;
    const [config, event, attempts] = await Promise.all([caseService.config(), eventService.current(), QueryAttempt.find({ session: session._id }).sort({ executedAt: -1 }).limit(100).lean()]);
    const progression = deriveProgression(config, session);
    return {
      id: String(session._id),
      participant: session.participant ? { id: String(session.participant._id), username: session.participant.username, displayName: session.participant.displayName } : null,
      team: session.team ? { id: String(session.team._id), name: session.team.name, color: session.team.color } : null,
      status: session.status,
      score: session.score,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      completedAt: session.completedAt || null,
      elapsedMs: session.elapsedMs ?? null,
      remainingMs: sessionRemainingMs(session, event),
      progression: progression.files,
      evidence: session.evidence,
      connections: session.connections,
      suspectStates: session.suspectStates || {},
      ledger: session.ledger,
      timeline: session.timeline,
      /* the integrity record, newest first, for the review dialog */
      violations: [...(session.violations || [])].reverse(),
      violationCount: session.violationCount || 0,
      awayMs: session.awayMs || 0,
      proctorLocked: Boolean(session.proctorLocked),
      disqualifiedAt: session.disqualifiedAt || null,
      disqualifiedReason: session.disqualifiedReason || '',
      finalSubmissions: session.finalSubmissions,
      stats: session.stats,
      attempts: attempts.map((a) => ({ id: String(a._id), caseFile: a.caseFile, challenge: a.challenge, sql: a.sql, status: a.status, rowCount: a.rowCount, durationMs: a.durationMs, errorMessage: a.errorMessage, blockedReason: a.blockedReason, executedAt: a.executedAt, sqlHash: a.sqlHash, resultHash: a.resultHash })),
    };
  },

  schedulePush() {
    if (!monitorTimer) {
      monitorTimer = setTimeout(async () => {
        monitorTimer = null;
        try {
          emitMonitor(await this.participantRows());
        } catch (err) {
          logger.warn('Monitor push failed', err.message);
        }
      }, 500);
      monitorTimer.unref?.();
    }
    if (!statsTimer) {
      statsTimer = setTimeout(async () => {
        statsTimer = null;
        try {
          emitStats(await this.stats());
        } catch (err) {
          logger.warn('Stats push failed', err.message);
        }
      }, 1500);
      statsTimer.unref?.();
    }
  },
};
