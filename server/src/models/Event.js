import mongoose from 'mongoose';
import { EVENT_STATES, EVENT_STATE_LIST } from '../engine/eventStateMachine.js';
import { DEFAULT_SCORING_POLICY, HINT_SCOPES } from '../engine/scoring.js';
import { DEFAULT_LEADERBOARD_POLICY } from '../engine/leaderboard.js';

const { Schema } = mongoose;

export { EVENT_STATES };
/** Kept for callers that used the old name. */
export const EVENT_STATUS = EVENT_STATES;

const scoringPolicySchema = new Schema(
  {
    initialScore: { type: Number, default: DEFAULT_SCORING_POLICY.initialScore, min: 0 },
    wrongAnswerPenalty: { type: Number, default: DEFAULT_SCORING_POLICY.wrongAnswerPenalty, min: 0 },
    hintPenalty: { type: Number, default: DEFAULT_SCORING_POLICY.hintPenalty, min: 0 },
    hintPenaltyScope: { type: String, enum: Object.values(HINT_SCOPES), default: HINT_SCOPES.FILE },
    finalAttemptPenalty: { type: Number, default: DEFAULT_SCORING_POLICY.finalAttemptPenalty, min: 0 },
    timeBonus: {
      enabled: { type: Boolean, default: false },
      perMinuteRemaining: { type: Number, default: 0, min: 0 },
      max: { type: Number, default: 0, min: 0 },
    },
    completionBonus: { type: Number, default: 0, min: 0 },
    minimumScore: { type: Number, default: 0 },
  },
  { _id: false },
);

const leaderboardPolicySchema = new Schema(
  {
    order: { type: [String], default: () => [...DEFAULT_LEADERBOARD_POLICY.order] },
    groupBy: { type: String, enum: ['participant', 'team'], default: 'participant' },
    visibleToParticipants: { type: Boolean, default: true },
    limit: { type: Number, default: 100, min: 1, max: 500 },
  },
  { _id: false },
);

const queryPolicySchema = new Schema(
  {
    timeoutMs: { type: Number, default: 4000, min: 250, max: 30000 },
    maxRows: { type: Number, default: 500, min: 1, max: 5000 },
    maxLength: { type: Number, default: 4000, min: 100, max: 20000 },
    perMinute: { type: Number, default: 60, min: 1, max: 1000 },
  },
  { _id: false },
);

const entitySchema = new Schema(
  {
    id: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    department: { type: String, default: '' },
    role: { type: String, default: '' },
  },
  { _id: false },
);

const factSchema = new Schema({ label: String, value: String }, { _id: false });

/**
 * One Event per deployment by default (`singleton` key) — the model supports
 * more, but every participant-facing call resolves the current event through
 * `Event.getSingleton()`.
 */
const eventSchema = new Schema(
  {
    singleton: { type: String, default: 'EVENT', unique: true, immutable: true },
    slug: { type: String, default: 'black-cipher', trim: true, lowercase: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    caseNumber: { type: String, default: '', trim: true, maxlength: 40 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    status: { type: String, enum: EVENT_STATE_LIST, default: EVENT_STATES.DRAFT, index: true },

    /* clock */
    durationMinutes: { type: Number, default: 60, min: 5, max: 600 },
    startsAt: { type: Date },
    startedAt: { type: Date },
    pausedAt: { type: Date },
    pausedTotalMs: { type: Number, default: 0 },
    extendedMs: { type: Number, default: 0 },
    endedAt: { type: Date },
    archivedAt: { type: Date },

    /* participation */
    registrationOpen: { type: Boolean, default: true },
    maxParticipants: { type: Number, default: 500, min: 1 },
    exposeQueryHistory: { type: Boolean, default: true },
    /**
     * Exam integrity. The browser can detect that a participant left the
     * page or tried to paste; it cannot police a second device, so this
     * records and warns by default and only acts when a coordinator opts in.
     */
    proctoring: {
      enabled: { type: Boolean, default: true },
      requireFullscreen: { type: Boolean, default: true },
      blockCopyPaste: { type: Boolean, default: true },
      blockContextMenu: { type: Boolean, default: true },
      /** show the participant a warning from this many flags (0 = never) */
      warnLimit: { type: Number, default: 3, min: 0 },
      /** act at this many flags (0 = never act) */
      maxViolations: { type: Number, default: 0, min: 0 },
      onLimit: { type: String, enum: ['notify', 'lock'], default: 'notify' },
    },

    /* engine policies */
    dataset: { type: String, default: 'black-cipher' },
    queryScope: { type: String, enum: ['dataset', 'allowedTables'], default: 'dataset' },
    queryPolicy: { type: queryPolicySchema, default: () => ({}) },
    scoringPolicy: { type: scoringPolicySchema, default: () => ({}) },
    leaderboardPolicy: { type: leaderboardPolicySchema, default: () => ({}) },
    finalAttemptPolicy: { maxAttempts: { type: Number, default: 0, min: 0 } },

    /* narrative content */
    entities: { type: [entitySchema], default: [] },
    briefing: { stamp: { type: String, default: 'Classified' }, text: { type: String, default: '' }, beginLabel: { type: String, default: 'Begin Investigation' } },
    landing: { tag: { type: String, default: '' }, subtitle: { type: String, default: '' } },
    /** Shown only after a validated final deduction. Never serialised to participants before that. */
    reveal: {
      badge: { type: String, default: 'Case Closed' },
      title: { type: String, default: '' },
      paragraphs: { type: [String], default: [] },
      facts: { type: [factSchema], default: [] },
    },
    contentVersion: { type: Number, default: 1 },
  },
  { timestamps: true, minimize: false },
);

eventSchema.statics.getSingleton = async function getSingleton() {
  let event = await this.findOne({ singleton: 'EVENT' });
  if (!event) event = await this.create({ name: 'LOST AT SQL — Operation: Black Cipher' });
  return event;
};

export const Event = mongoose.model('Event', eventSchema);
