import { ApiError } from '../utils/ApiError.js';
import { sessionService } from './sessionService.js';
import { evidenceView, suspectBoard } from '../serializers/participantView.js';

/**
 * Participant evidence board: only what this session has discovered, plus
 * the suspect board and connections. The catalogue of undiscovered evidence
 * is exposed as counts only.
 */
export const evidenceService = {
  async board(user) {
    const { config, session } = await sessionService.context(user);
    if (!session) throw ApiError.notFound('No investigation session.', 'SESSION_NOT_FOUND');
    const found = session.evidence.map((e) => evidenceView(config.evidenceByCode.get(e.code) || { code: e.code, title: e.code, summary: '' }, e));
    return {
      evidence: found,
      total: config.evidence.length,
      discovered: found.length,
      connections: session.connections.map((c) => ({ source: c.source, target: c.target, type: c.type, label: c.label, timestamp: c.timestamp, discoveredAt: c.discoveredAt })),
      suspects: suspectBoard(session, config),
      timeline: session.timeline
        .filter((t) => ['SUSPECT_STATE', 'EVIDENCE_DISCOVERED', 'CONNECTION_FOUND', 'FILE_COMPLETED'].includes(t.type))
        .map((t) => ({ at: t.at, type: t.type, file: t.file, challenge: t.challenge, entity: t.entity, from: t.from, to: t.to, evidence: t.evidence })),
    };
  },

  async item(user, code) {
    const { config, session } = await sessionService.context(user);
    if (!session) throw ApiError.notFound('No investigation session.', 'SESSION_NOT_FOUND');
    const found = session.evidence.find((e) => e.code === String(code).toUpperCase());
    if (!found) throw ApiError.notFound('You have not discovered this evidence yet.', 'EVIDENCE_NOT_DISCOVERED');
    return evidenceView(config.evidenceByCode.get(found.code) || { code: found.code, title: found.code, summary: '' }, found);
  },
};
