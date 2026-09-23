/**
 * Participant-facing serializers — the leak boundary (spec §22).
 *
 * Nothing that reaches a participant is produced by a model's default
 * toJSON; every shape is assembled here by explicit allow-list. Tests scan
 * these outputs for hidden keys (validation, referenceSql, referenceAnswer,
 * onSuccess, hint text, reveal, passiveTrigger).
 */
import { deriveProgression, sessionRemainingMs, sessionElapsedMs, eventTimerState, SUSPECT_STATE_LABELS, normalizePolicy, FILE_STATUS } from '../engine/index.js';

import { proctorView } from '../engine/proctor.js';

export const HIDDEN_KEYS = Object.freeze(['validation', 'referenceSql', 'referenceAnswer', 'onSuccess', 'text', 'reveal', 'passiveTrigger', 'expected', 'expectedValues', 'answerKey']);

const id = (v) => (v ? String(v._id || v) : null);

export function eventView(event, now = Date.now()) {
  const timer = eventTimerState(event, now);
  return {
    id: id(event),
    slug: event.slug,
    name: event.name,
    caseNumber: event.caseNumber,
    description: event.description,
    status: event.status,
    durationMinutes: event.durationMinutes,
    startsAt: event.startsAt || null,
    registrationOpen: event.registrationOpen,
    exposeQueryHistory: event.exposeQueryHistory !== false,
    landing: { tag: event.landing?.tag || '', subtitle: event.landing?.subtitle || '' },
    scoring: (() => {
      const p = normalizePolicy(event.scoringPolicy);
      return { initialScore: p.initialScore, wrongAnswerPenalty: p.wrongAnswerPenalty, hintPenalty: p.hintPenalty, hintPenaltyScope: p.hintPenaltyScope, finalAttemptPenalty: p.finalAttemptPenalty };
    })(),
    timer,
    remainingMs: timer.remainingMs,
    serverTime: now,
  };
}

export function briefingView(event, user) {
  const name = (user?.team?.name || user?.displayName || user?.username || 'Investigator').toString().toUpperCase();
  return {
    stamp: event.briefing?.stamp || 'Classified',
    text: String(event.briefing?.text || '').replace(/\{\{\s*investigator\s*\}\}/g, name),
    beginLabel: event.briefing?.beginLabel || 'Begin Investigation',
    caseNumber: event.caseNumber,
  };
}

export function hintView(hint, used) {
  return { id: id(hint), code: hint.code, used: Boolean(used), penalty: hint.penalty ?? null };
}

/**
 * @param challenge   challenge definition (may include hidden fields — they are dropped here)
 * @param status      derived challenge status
 * @param progress    session challenge progress (attempts, hintsUsed) or null
 * @param opts        { solved: boolean }
 */
export function challengeView(challenge, status, progress, { fileCode } = {}) {
  const usedCodes = new Set((progress?.hintsUsed || []).map((h) => h.code));
  const solved = status === 'completed';
  const view = {
    id: id(challenge),
    code: challenge.code,
    fileCode,
    sequence: challenge.sequence,
    kind: challenge.kind,
    stageLabel: challenge.stageLabel || '',
    brief: status === 'locked' ? '' : challenge.brief, // a locked part's brief can name the answer to the open one
    editorLabel: challenge.editorLabel || '',
    starterSql: '', // never sent: the content's starter query is the answer, and the terminal starts empty
    submitLabel: challenge.submitLabel || 'Submit Findings',
    successLabel: challenge.successLabel || '',
    status,
    attempts: Number(progress?.attempts) || 0,
    wrongAttempts: Number(progress?.wrongAttempts) || 0,

    hints: (challenge.hints || []).map((h) => hintView(h, usedCodes.has(h.code))),
    maxAttempts: Number(challenge.attemptPolicy?.maxAttempts) || 0,
  };
  if (challenge.kind === 'RESULT_SET_THEN_BOOLEAN') {
    view.question = challenge.question || '';
    view.answerOptions = (challenge.answerOptions || []).map((o) => ({ value: o.value, label: o.label }));
  }
  if (challenge.kind === 'FINAL_DEDUCTION') {
    view.fields = (challenge.fields || []).map((f) => ({ key: f.key, label: f.label, type: f.type, placeholder: f.placeholder || '', options: (f.options || []).map((o) => ({ value: o.value, label: o.label })), wide: Boolean(f.wide) }));
  }
  if (solved) {
    view.successMessage = challenge.successMessage || '';
    view.completedAt = progress?.completedAt || null;
    view.completedSql = progress?.completedSql || '';
  }
  return view;
}

export function fileView(file, derivedFile, sessionFile) {
  const progressByCode = new Map((sessionFile?.challenges || []).map((c) => [c.code, c]));
  return {
    id: id(file),
    code: file.code,
    sequence: file.sequence,
    label: file.label,
    title: file.title,
    difficulty: file.difficulty || '',
    tables: [...(file.tables || [])],
    isFinal: Boolean(file.isFinal),
    status: derivedFile?.status || FILE_STATUS.LOCKED,
    openedAt: sessionFile?.openedAt || null,
    completedAt: sessionFile?.completedAt || null,
    hintCharged: Boolean(sessionFile?.hintCharged),
    currentChallengeCode: derivedFile?.currentChallengeCode || null,
    challenges: (file.challenges || []).map((ch) => {
      const d = derivedFile?.challenges.find((c) => c.code === ch.code);
      return challengeView(ch, d?.status || 'locked', progressByCode.get(ch.code) || null, { fileCode: file.code });
    }),
  };
}

export function fileSummary(file, derivedFile) {
  return {
    code: file.code,
    sequence: file.sequence,
    label: file.label,
    title: file.title,
    difficulty: file.difficulty || '',
    isFinal: Boolean(file.isFinal),
    status: derivedFile?.status || FILE_STATUS.LOCKED,
    currentChallengeCode: derivedFile?.currentChallengeCode || null,
    challenges: (derivedFile?.challenges || []).map((c) => ({ code: c.code, status: c.status, attempts: c.attempts })),
  };
}

export function evidenceView(definition, found) {
  return {
    code: definition.code,
    title: definition.title,
    summary: definition.summary,
    source: definition.source || '',
    relatedEntities: [...(definition.relatedEntities || [])],
    timestamp: definition.timestamp || '',
    discoveredAt: found?.discoveredAt || null,
    via: found?.via?.ref || '',
  };
}

export function suspectBoard(session, config) {
  const states = session?.suspectStates instanceof Map ? Object.fromEntries(session.suspectStates) : session?.suspectStates || {};
  return config.entities.map((e) => {
    const state = states[e.id] || 'UNKNOWN';
    return { id: e.id, name: e.name, department: e.department, role: e.role, state, label: SUSPECT_STATE_LABELS[state] || '' };
  });
}

export function sessionView(session, event, config, now = Date.now()) {
  const progression = deriveProgression(config, session);
  const foundByCode = new Map(session.evidence.map((e) => [e.code, e]));
  const hintsUsed = session.files.reduce((n, f) => n + f.challenges.reduce((m, c) => m + (c.hintsUsed?.length || 0), 0), 0);
  return {
    id: id(session),
    status: session.status,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    completedAt: session.completedAt || null,
    remainingMs: sessionRemainingMs(session, event, now),
    elapsedMs: session.status === 'completed' ? session.elapsedMs : sessionElapsedMs(session, now),
    serverTime: now,
    score: session.score,
    currentFileCode: progression.currentFileCode,
    currentChallengeCode: progression.currentChallengeCode,
    completedCount: progression.completedCount,
    totalCount: progression.totalCount,
    finalUnlocked: progression.finalUnlocked,
    allComplete: progression.allComplete,
    finalAttempts: session.finalAttempts || 0,
    finalCorrect: Boolean(session.finalCorrect),
    proctor: proctorView(session, event),
    files: config.files.map((f) => fileSummary(f, progression.files.find((d) => d.code === f.code))),
    evidence: session.evidence.map((e) => evidenceView(config.evidenceByCode.get(e.code) || { code: e.code, title: e.code, summary: '' }, e)).filter(Boolean),
    connections: session.connections.map((c) => ({ source: c.source, target: c.target, type: c.type, label: c.label, timestamp: c.timestamp, discoveredAt: c.discoveredAt })),
    suspects: suspectBoard(session, config),
    timeline: session.timeline.slice(-60).map((t) => ({ at: t.at, type: t.type, file: t.file, challenge: t.challenge, entity: t.entity, from: t.from, to: t.to, evidence: t.evidence, delta: t.delta })),
    hintsUsed,
    stats: { queries: session.stats?.queries || 0, successful: session.stats?.successful || 0, failed: session.stats?.failed || 0 },
    ledger: session.ledger.map((t) => ({ type: t.type, delta: t.delta, scoreAfter: t.scoreAfter, at: t.at, ref: { challenge: t.ref?.challenge, hint: t.ref?.hint } })),
  };
}

export function revealView(event) {
  return {
    badge: event.reveal?.badge || 'Case Closed',
    title: event.reveal?.title || '',
    paragraphs: [...(event.reveal?.paragraphs || [])],
    facts: (event.reveal?.facts || []).map((f) => ({ label: f.label, value: f.value })),
  };
}

export function queryAttemptView(a) {
  return {
    id: id(a),
    caseFile: a.caseFile || null,
    challenge: a.challenge || null,
    sql: a.sql,
    status: a.status,
    errorMessage: a.errorMessage || null,
    rowCount: a.rowCount,
    columns: a.columns || [],
    truncated: Boolean(a.truncated),
    durationMs: a.durationMs,
    executedAt: a.executedAt,
  };
}
