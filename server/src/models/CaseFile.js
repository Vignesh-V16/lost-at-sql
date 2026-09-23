import mongoose from 'mongoose';

const { Schema } = mongoose;

export const CHALLENGE_KINDS = ['RESULT_SET', 'RESULT_SET_THEN_BOOLEAN', 'FINAL_DEDUCTION'];
export const DIFFICULTIES = ['', 'easy', 'medium', 'hard'];

/** Hint text is `select: false` — it only leaves the database through the "use hint" path. */
const hintSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, maxlength: 20 },
    text: { type: String, required: true, trim: true, maxlength: 1000, select: false },
    /** null → event scoring policy default */
    penalty: { type: Number, default: null, min: 0 },
  },
  { _id: true },
);

const optionSchema = new Schema({ value: { type: String, required: true }, label: { type: String, required: true } }, { _id: false });

const fieldSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, match: /^[a-zA-Z_][a-zA-Z0-9_]*$/ },
    label: { type: String, required: true },
    type: { type: String, enum: ['entity', 'text', 'select'], default: 'text' },
    placeholder: { type: String, default: '' },
    options: { type: [optionSchema], default: [] },
    wide: { type: Boolean, default: false },
  },
  { _id: false },
);

const connectionRuleSchema = new Schema(
  {
    source: { type: String, required: true, uppercase: true },
    target: { type: String, required: true, uppercase: true },
    type: { type: String, required: true },
    label: { type: String, default: '' },
    timestamp: { type: String, default: '' },
  },
  { _id: false },
);

/**
 * A challenge is one validated step inside a file (FILE 04 has two). All
 * fields flagged `select: false` are hidden solution data — they are loaded
 * explicitly by the engine (`+validation`) and never by participant reads.
 */
const challengeSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 24 },
    sequence: { type: Number, required: true, min: 1 },
    kind: { type: String, enum: CHALLENGE_KINDS, default: 'RESULT_SET' },
    stageLabel: { type: String, default: '', maxlength: 40 },
    brief: { type: String, required: true, maxlength: 3000 },
    editorLabel: { type: String, default: '' },
    starterSql: { type: String, default: '', maxlength: 4000 },
    submitLabel: { type: String, default: 'Submit Findings' },
    successLabel: { type: String, default: '' },
    /** RESULT_SET_THEN_BOOLEAN: the follow-up question + options shown once the result gate passes. */
    question: { type: String, default: '' },
    answerOptions: { type: [optionSchema], default: [] },
    /** FINAL_DEDUCTION: the form. */
    fields: { type: [fieldSchema], default: [] },
    /**
     * The SQL constructs this step was designed around (JOIN, SUBQUERY,
     * GROUP_BY, …). Guidance only: shown to participants as chips and named
     * in a note after a correct answer. Any query that returns the right
     * result is accepted. To *require* a construct, add a SQL_USES validator.
     */
    skills: { type: [String], default: [] },
    hints: { type: [hintSchema], default: [] },

    validation: { type: Schema.Types.Mixed, required: true, select: false },
    referenceSql: { type: String, default: '', select: false },
    referenceAnswer: { type: Schema.Types.Mixed, default: null, select: false },
    successMessage: { type: String, default: '', select: false },
    onSuccess: {
      type: new Schema(
        {
          evidence: { type: [String], default: [] },
          transitions: { type: [Schema.Types.Mixed], default: [] },
          connections: { type: [connectionRuleSchema], default: [] },
        },
        { _id: false },
      ),
      default: () => ({}),
      select: false,
    },
    failureMessage: { type: String, default: '' },
    attemptPolicy: {
      maxAttempts: { type: Number, default: 0, min: 0 },
      wrongPenaltyOverride: { type: Number, default: null, min: 0 },
    },
  },
  { _id: true, minimize: false },
);

const caseFileSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 20 },
    sequence: { type: Number, required: true, index: true },
    label: { type: String, required: true, trim: true, maxlength: 30 },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    /** Shown to participants as a chip in the file header; '' shows nothing. A label only — scoring ignores it. */
    difficulty: { type: String, enum: DIFFICULTIES, default: '' },
    tables: { type: [String], default: [] },
    isFinal: { type: Boolean, default: false },
    /** Coordinator override: available regardless of progression (for rehearsals). */
    forceUnlocked: { type: Boolean, default: false },
    challenges: { type: [challengeSchema], default: [] },
  },
  { timestamps: true, minimize: false },
);

/** Hidden fields, listed once so serializers and tests agree. */
export const CHALLENGE_HIDDEN_FIELDS = Object.freeze(['validation', 'referenceSql', 'referenceAnswer', 'successMessage', 'onSuccess']);
export const CHALLENGE_HIDDEN_SELECT = CHALLENGE_HIDDEN_FIELDS.map((f) => `+challenges.${f}`).concat('+challenges.hints.text').join(' ');

export const CaseFile = mongoose.model('CaseFile', caseFileSchema);
