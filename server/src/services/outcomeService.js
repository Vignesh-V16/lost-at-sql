import { applyTransitions, deriveProgression } from '../engine/index.js';

/**
 * Applies a challenge's `onSuccess` block to a session document in memory:
 * evidence (once), suspect-state transitions (each change appended to the
 * timeline), evidence connections (deduplicated), file/challenge completion
 * and cached progression. The caller persists the document atomically.
 */
export const outcomeService = {
  awardEvidence(doc, codes = [], via, now = new Date()) {
    const awarded = [];
    for (const code of codes) {
      if (doc.evidence.some((e) => e.code === code)) continue;
      doc.evidence.push({ code, discoveredAt: now, via: { type: via?.type || 'challenge', ref: via?.ref || '' } });
      doc.timeline.push({ at: now, type: 'EVIDENCE_DISCOVERED', evidence: code, challenge: via?.ref, file: via?.file });
      awarded.push(code);
    }
    return awarded;
  },

  applySuspectTransitions(doc, rules = [], { resultSet, entities, challenge, file } = {}, now = new Date()) {
    if (!rules.length) return [];
    const current = doc.suspectStates instanceof Map ? Object.fromEntries(doc.suspectStates) : { ...(doc.suspectStates || {}) };
    const { states, changes } = applyTransitions(current, rules, { resultSet, entities });
    for (const change of changes) {
      doc.suspectStates.set(change.entity, change.to);
      doc.timeline.push({ at: now, type: 'SUSPECT_STATE', entity: change.entity, from: change.from, to: change.to, challenge, file });
    }
    // Map assignment above marks the path modified; make sure entities that only exist in `states` are present.
    for (const [id, state] of Object.entries(states)) if (!doc.suspectStates.has(id)) doc.suspectStates.set(id, state);
    return changes;
  },

  addConnections(doc, rules = [], via, now = new Date()) {
    const added = [];
    for (const c of rules) {
      const exists = doc.connections.some((x) => x.source === c.source && x.target === c.target && x.type === c.type);
      if (exists) continue;
      doc.connections.push({ source: c.source, target: c.target, type: c.type, label: c.label || '', timestamp: c.timestamp || '', discoveredAt: now, via: via || '' });
      doc.timeline.push({ at: now, type: 'CONNECTION_FOUND', entity: c.source, to: c.target, challenge: via });
      added.push({ source: c.source, target: c.target, type: c.type });
    }
    return added;
  },

  /**
   * Marks a challenge completed and applies its onSuccess block.
   * @returns {{ evidenceAwarded: string[], transitions: object[], connections: object[], fileCompleted: boolean, progression }}
   */
  completeChallenge(doc, config, file, challenge, { resultSet, queryAttemptId, sql, now = new Date() } = {}) {
    const fp = doc.fileProgress(file.code, { create: true });
    if (!fp.openedAt) fp.openedAt = now;
    const cp = doc.challengeProgress(file.code, challenge.code, { create: true });
    cp.attempts = (cp.attempts || 0) + 1;
    cp.completedAt = now;
    if (queryAttemptId) cp.completedVia = queryAttemptId;
    if (sql) cp.completedSql = String(sql).slice(0, 4000);
    doc.timeline.push({ at: now, type: 'CHALLENGE_COMPLETED', file: file.code, challenge: challenge.code });

    const onSuccess = challenge.onSuccess || {};
    const evidenceAwarded = this.awardEvidence(doc, onSuccess.evidence || [], { type: 'challenge', ref: challenge.code, file: file.code }, now);
    const transitions = this.applySuspectTransitions(doc, onSuccess.transitions || [], { resultSet, entities: config.entityIds, challenge: challenge.code, file: file.code }, now);
    const connections = this.addConnections(doc, onSuccess.connections || [], challenge.code, now);

    const progression = deriveProgression(config, doc);
    const derivedFile = progression.files.find((f) => f.code === file.code);
    const fileCompleted = Boolean(derivedFile?.completed);
    if (fileCompleted && !fp.completedAt) {
      fp.completedAt = now;
      doc.timeline.push({ at: now, type: 'FILE_COMPLETED', file: file.code });
    }
    doc.currentFileCode = progression.currentFileCode;
    doc.currentChallengeCode = progression.currentChallengeCode;
    return { evidenceAwarded, transitions, connections, fileCompleted, progression };
  },

  recordWrongAttempt(doc, file, challenge, now = new Date()) {
    const fp = doc.fileProgress(file.code, { create: true });
    if (!fp.openedAt) fp.openedAt = now;
    const cp = doc.challengeProgress(file.code, challenge.code, { create: true });
    cp.attempts = (cp.attempts || 0) + 1;
    cp.wrongAttempts = (cp.wrongAttempts || 0) + 1;
    doc.timeline.push({ at: now, type: 'WRONG_SUBMISSION', file: file.code, challenge: challenge.code });
    return cp;
  },
};
