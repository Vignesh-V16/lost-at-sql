import mongoose from 'mongoose';
import { SESSION_STATUS } from '../engine/clock.js';
import { SUSPECT_STATE_LIST } from '../engine/suspectState.js';
import { SCORE_TX } from '../engine/scoring.js';

const { Schema } = mongoose;

export { SESSION_STATUS };

/**
 * ScoreTransaction — embedded in the session so that a score change and the
 * state change that caused it are one atomic document write (a standalone
 * mongod has no multi-document transactions). `key` is the idempotency key:
 * the same logical event always produces the same key and is applied once.
 */
const scoreTransactionSchema = new Schema(
  {
    key: { type: String, required: true },
    type: { type: String, enum: Object.values(SCORE_TX), required: true },
    delta: { type: Number, required: true },
    rawDelta: { type: Number, required: true },
    scoreBefore: { type: Number, required: true },
    scoreAfter: { type: Number, required: true },
    ref: { type: Schema.Types.Mixed, default: {} },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const hintUsedSchema = new Schema(
  {
    hint: { type: Schema.Types.ObjectId, required: true },
    code: { type: String, required: true },
    usedAt: { type: Date, default: Date.now },
    charged: { type: Number, default: 0 },
  },
  { _id: false },
);

const challengeProgressSchema = new Schema(
  {
    code: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    wrongAttempts: { type: Number, default: 0 },
    firstOpenedAt: { type: Date },
    completedAt: { type: Date },
    completedVia: { type: Schema.Types.ObjectId, ref: 'QueryAttempt' },
    completedSql: { type: String, default: '' },
    hintsUsed: { type: [hintUsedSchema], default: [] },
  },
  { _id: false },
);

const fileProgressSchema = new Schema(
  {
    code: { type: String, required: true },
    openedAt: { type: Date },
    completedAt: { type: Date },
    /** Prototype: one hint charge per file (scoring policy `hintPenaltyScope: file`). */
    hintCharged: { type: Boolean, default: false },
    challenges: { type: [challengeProgressSchema], default: [] },
  },
  { _id: false },
);

const evidenceFoundSchema = new Schema(
  {
    code: { type: String, required: true },
    discoveredAt: { type: Date, default: Date.now },
    via: { type: { type: String, default: 'challenge' }, ref: { type: String, default: '' } },
  },
  { _id: false },
);

const connectionSchema = new Schema(
  {
    source: { type: String, required: true },
    target: { type: String, required: true },
    type: { type: String, required: true },
    label: { type: String, default: '' },
    timestamp: { type: String, default: '' },
    discoveredAt: { type: Date, default: Date.now },
    via: { type: String, default: '' },
  },
  { _id: false },
);

const timelineSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    type: { type: String, required: true },
    file: { type: String },
    challenge: { type: String },
    entity: { type: String },
    from: { type: String },
    to: { type: String },
    evidence: { type: String },
    delta: { type: Number },
    note: { type: String },
  },
  { _id: false },
);

/** One exam-integrity flag reported by the participant's browser. */
const violationSchema = new Schema(
  {
    type: { type: String, required: true },
    at: { type: Date, default: Date.now },
    file: { type: String, default: '' },
    /** for TAB_RETURN: how long the page was hidden */
    durationMs: { type: Number, default: 0 },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const finalSubmissionSchema = new Schema(
  {
    attemptNo: { type: Number, required: true },
    answers: { type: Schema.Types.Mixed, default: {} },
    fields: { type: Schema.Types.Mixed, default: {} },
    correct: { type: Boolean, default: false },
    submittedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/**
 * InvestigationSession — the single authoritative record of one
 * participant's investigation. Optimistic concurrency (`__v`) turns every
 * save into a compare-and-swap; the service layer retries on VersionError.
 */
const sessionSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    participant: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    team: { type: Schema.Types.ObjectId, ref: 'Team' },
    status: { type: String, enum: Object.values(SESSION_STATUS), default: SESSION_STATUS.ACTIVE, index: true },

    startedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    pausedTotalMs: { type: Number, default: 0 },
    completedAt: { type: Date },
    expiredAt: { type: Date },
    elapsedMs: { type: Number },
    lastActivityAt: { type: Date, default: Date.now },

    score: { type: Number, default: 0 },
    ledger: { type: [scoreTransactionSchema], default: [] },

    /* exam integrity — see services/proctorService.js */
    violations: { type: [violationSchema], default: [] },
    violationCount: { type: Number, default: 0 },
    awayMs: { type: Number, default: 0 },
    proctorLocked: { type: Boolean, default: false },
    proctorLockedAt: { type: Date },
    disqualifiedAt: { type: Date },
    disqualifiedReason: { type: String, default: '', maxlength: 300 },
    disqualifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    currentFileCode: { type: String },
    currentChallengeCode: { type: String },
    files: { type: [fileProgressSchema], default: [] },
    evidence: { type: [evidenceFoundSchema], default: [] },
    connections: { type: [connectionSchema], default: [] },
    suspectStates: { type: Map, of: { type: String, enum: SUSPECT_STATE_LIST }, default: () => new Map() },
    timeline: { type: [timelineSchema], default: [] },

    finalSubmissions: { type: [finalSubmissionSchema], default: [] },
    finalAttempts: { type: Number, default: 0 },
    finalCorrect: { type: Boolean, default: false },

    stats: {
      queries: { type: Number, default: 0 },
      successful: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      blocked: { type: Number, default: 0 },
      lastQueryAt: { type: Date },
    },
  },
  { timestamps: true, optimisticConcurrency: true, minimize: false },
);

sessionSchema.index({ event: 1, participant: 1 }, { unique: true });
sessionSchema.index({ event: 1, status: 1, expiresAt: 1 });
sessionSchema.index({ lastActivityAt: -1 });
sessionSchema.index({ team: 1 });

sessionSchema.methods.fileProgress = function fileProgress(code, { create = false } = {}) {
  let f = this.files.find((x) => x.code === code);
  if (!f && create) {
    this.files.push({ code, challenges: [] });
    f = this.files[this.files.length - 1];
  }
  return f || null;
};

sessionSchema.methods.challengeProgress = function challengeProgress(fileCode, code, { create = false } = {}) {
  const f = this.fileProgress(fileCode, { create });
  if (!f) return null;
  let c = f.challenges.find((x) => x.code === code);
  if (!c && create) {
    f.challenges.push({ code });
    c = f.challenges[f.challenges.length - 1];
  }
  return c || null;
};

sessionSchema.methods.hasEvidence = function hasEvidence(code) {
  return this.evidence.some((e) => e.code === code);
};

sessionSchema.methods.hasLedgerKey = function hasLedgerKey(key) {
  return this.ledger.some((t) => t.key === key);
};

export const InvestigationSession = mongoose.model('InvestigationSession', sessionSchema);
