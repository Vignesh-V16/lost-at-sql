import { Event, CaseFile, EvidenceDefinition, CHALLENGE_HIDDEN_SELECT } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Loads the case configuration (event + files + challenges incl. hidden
 * solution fields + evidence catalogue) and caches it briefly. Content is
 * locked while the event is LIVE, so a short TTL is safe; admin writes call
 * `invalidate()` explicitly.
 */
const TTL_MS = 5000;

class CaseService {
  constructor() {
    this.cache = null;
    this.loadedAt = 0;
    this.loading = null;
  }

  invalidate() {
    this.cache = null;
    this.loadedAt = 0;
  }

  async config({ force = false } = {}) {
    if (!force && this.cache && Date.now() - this.loadedAt < TTL_MS) return this.cache;
    if (this.loading) return this.loading;
    this.loading = this.load().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  async load() {
    const [event, files, evidence] = await Promise.all([
      Event.getSingleton(),
      CaseFile.find().sort({ sequence: 1 }).select(CHALLENGE_HIDDEN_SELECT).lean(),
      EvidenceDefinition.find().sort({ order: 1 }).select('+passiveTrigger').lean(),
    ]);
    const byFile = new Map();
    const byChallenge = new Map();
    for (const file of files) {
      file.challenges = [...(file.challenges || [])].sort((a, b) => a.sequence - b.sequence);
      byFile.set(file.code, file);
      for (const ch of file.challenges) byChallenge.set(ch.code, { file, challenge: ch });
    }
    const finalFile = files.find((f) => f.isFinal) || null;
    const config = {
      event,
      eventId: event._id,
      files,
      byFile,
      byChallenge,
      finalFile,
      finalChallenge: finalFile ? finalFile.challenges.find((c) => c.kind === 'FINAL_DEDUCTION') || finalFile.challenges[0] || null : null,
      evidence,
      evidenceByCode: new Map(evidence.map((e) => [e.code, e])),
      entities: (event.entities || []).map((e) => ({ id: e.id, name: e.name, department: e.department, role: e.role })),
      entityIds: (event.entities || []).map((e) => e.id),
      loadedAt: Date.now(),
    };
    this.cache = config;
    this.loadedAt = Date.now();
    return config;
  }

  fileOrThrow(config, code) {
    const file = config.byFile.get(String(code || '').toUpperCase());
    if (!file) throw ApiError.notFound('Case file not found', 'CASE_FILE_NOT_FOUND');
    return file;
  }

  /** Static content the seed uses — also lets tests build a config without Mongo. */
  static fromDefinition(caseDef, eventDoc = {}) {
    const files = caseDef.files.map((f) => ({ ...f, challenges: [...f.challenges].sort((a, b) => a.sequence - b.sequence) }));
    const byFile = new Map(files.map((f) => [f.code, f]));
    const byChallenge = new Map();
    for (const f of files) for (const c of f.challenges) byChallenge.set(c.code, { file: f, challenge: c });
    const finalFile = files.find((f) => f.isFinal) || null;
    return {
      event: { ...eventDoc, scoringPolicy: caseDef.scoringPolicy, leaderboardPolicy: caseDef.leaderboardPolicy, entities: caseDef.entities, reveal: caseDef.reveal, finalAttemptPolicy: caseDef.finalAttemptPolicy },
      files,
      byFile,
      byChallenge,
      finalFile,
      finalChallenge: finalFile ? finalFile.challenges[0] : null,
      evidence: caseDef.evidenceCatalogue,
      evidenceByCode: new Map(caseDef.evidenceCatalogue.map((e) => [e.code, e])),
      entities: caseDef.entities,
      entityIds: caseDef.entities.map((e) => e.id),
    };
  }
}

export const caseService = new CaseService();
