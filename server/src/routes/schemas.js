import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');
const code = z.string().trim().toUpperCase().min(2).max(24).regex(/^[A-Z0-9_]+$/, 'Codes are A–Z, 0–9 and _');
const idOrCode = z.string().trim().min(1).max(40);

/* --------------------------------------------------------------- auth */

export const loginSchema = {
  body: z.object({
    investigatorId: z.string().trim().min(3).max(40),
    accessCode: z.string().min(4).max(128),
  }),
};

export const refreshSchema = { body: z.object({ refreshToken: z.string().min(20).max(200).optional() }).default({}) };

/* -------------------------------------------------------- investigation */

export const caseParams = { params: z.object({ code: idOrCode }) };
export const hintParams = { params: z.object({ code: idOrCode, hintId: idOrCode }) };

export const querySchema = {
  params: z.object({ code: idOrCode }),
  body: z.object({ sql: z.string().min(1).max(20000) }),
};

export const finalQuerySchema = { body: z.object({ sql: z.string().min(1).max(20000) }) };

export const submitSchema = {
  params: z.object({ code: idOrCode }),
  body: z
    .object({
      queryAttemptId: objectId.optional(),
      sql: z.string().min(1).max(20000).optional(),
      answer: z.union([z.string(), z.number(), z.boolean()]).transform((v) => String(v).trim()).optional(),
      challengeCode: code.optional(),
    })
    .refine((b) => b.queryAttemptId || b.sql, { message: 'Run a query first, then submit its result (queryAttemptId or sql).' }),
};

export const finalSubmitSchema = {
  body: z.record(z.string().max(40), z.union([z.string(), z.number()]).transform((v) => String(v).trim().slice(0, 200))).refine((b) => Object.keys(b).length > 0, 'Provide your deduction'),
};

export const limitQuery = { query: z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) }) };
export const evidenceParams = { params: z.object({ code: code }) };
export const tableParams = {
  params: z.object({ name: z.string().regex(/^[a-z_][a-z0-9_]*$/) }),
  query: z.object({ limit: z.coerce.number().int().min(1).max(20).default(5) }),
};

/* --------------------------------------------------------------- admin */

const username = z.string().trim().toLowerCase().min(3).max(40).regex(/^[a-z0-9._-]+$/, 'Letters, numbers, dot, underscore and dash only');

export const participantCreateSchema = {
  body: z.object({
    username,
    displayName: z.string().trim().min(1).max(60).optional(),
    accessCode: z.string().min(6).max(128).optional(),
    team: z.string().trim().max(40).optional().nullable(),
  }),
};

export const participantBulkSchema = { body: z.object({ participants: z.array(participantCreateSchema.body).min(1).max(600) }) };

export const participantUpdateSchema = {
  params: z.object({ id: objectId }),
  body: z
    .object({
      username: username.optional(),
      displayName: z.string().trim().min(1).max(60).optional(),
      isActive: z.boolean().optional(),
      team: z.string().trim().max(40).nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, 'Nothing to update'),
};

export const participantListSchema = {
  query: z.object({
    search: z.string().trim().max(60).default(''),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(50),
    team: objectId.optional(),
  }),
};

export const resetCredentialsSchema = {
  params: z.object({ id: objectId }),
  body: z.object({ accessCode: z.string().min(6).max(128).optional() }).default({}),
};

export const idParams = { params: z.object({ id: objectId }) };

export const adjustScoreSchema = {
  params: z.object({ id: objectId }),
  body: z.object({ amount: z.number().int().min(-10000).max(10000).refine((n) => n !== 0, 'amount must be non-zero'), reason: z.string().trim().max(200).default('') }),
};

export const sessionListSchema = {
  query: z.object({
    status: z.enum(['active', 'completed', 'time_expired']).optional(),
    team: objectId.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  }),
};

export const teamSchema = {
  body: z.object({
    name: z.string().trim().min(2).max(40),
    code: z.string().trim().max(6).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  }),
};

export const teamUpdateSchema = { params: z.object({ id: objectId }), body: teamSchema.body.partial() };

/* content */

const hintInput = z.object({ code: code.optional(), text: z.string().trim().min(1).max(1000), penalty: z.number().int().min(0).max(1000).nullable().optional() });
const option = z.object({ value: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(200) });
const field = z.object({
  key: z.string().trim().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  label: z.string().trim().min(1).max(120),
  type: z.enum(['entity', 'text', 'select']).default('text'),
  placeholder: z.string().max(80).default(''),
  options: z.array(option).default([]),
  wide: z.boolean().default(false),
});

export const challengeInput = z.object({
  code: code,
  sequence: z.number().int().min(1).optional(),
  kind: z.enum(['RESULT_SET', 'RESULT_SET_THEN_BOOLEAN', 'FINAL_DEDUCTION']).default('RESULT_SET'),
  stageLabel: z.string().max(40).default(''),
  brief: z.string().trim().min(1).max(3000),
  editorLabel: z.string().max(120).default(''),
  starterSql: z.string().max(4000).default(''),
  submitLabel: z.string().max(60).default('Submit Findings'),
  successLabel: z.string().max(60).default(''),
  question: z.string().max(300).default(''),
  answerOptions: z.array(option).default([]),
  fields: z.array(field).default([]),
  skills: z.array(z.enum(['WHERE', 'JOIN', 'SUBQUERY', 'GROUP_BY', 'HAVING', 'AGGREGATE', 'DISTINCT', 'ORDER_BY'])).default([]),
  hints: z.array(hintInput).default([]),
  validation: z.object({ strategy: z.string(), config: z.record(z.any()).default({}) }),
  referenceSql: z.string().max(4000).default(''),
  referenceAnswer: z.any().optional(),
  successMessage: z.string().max(2000).default(''),
  failureMessage: z.string().max(1000).default(''),
  onSuccess: z
    .object({
      evidence: z.array(code).default([]),
      transitions: z.array(z.record(z.any())).default([]),
      connections: z.array(z.object({ source: code, target: code, type: z.string().max(60), label: z.string().max(120).default(''), timestamp: z.string().max(60).default('') })).default([]),
    })
    .default({}),
  attemptPolicy: z.object({ maxAttempts: z.number().int().min(0).default(0), wrongPenaltyOverride: z.number().int().min(0).nullable().default(null) }).default({}),
  force: z.boolean().optional(),
});

export const disqualifySchema = {
  params: z.object({ id: objectId }),
  body: z.object({ reason: z.string().trim().min(3).max(300) }),
};

export const proctorSchema = {
  body: z.object({
    type: z.enum(['TAB_HIDDEN', 'WINDOW_BLUR', 'FULLSCREEN_EXIT', 'TAB_RETURN', 'COPY', 'CUT', 'PASTE', 'CONTEXT_MENU', 'DEVTOOLS_KEY', 'PRINT', 'MULTI_SESSION']),
    durationMs: z.number().int().min(0).max(21600000).default(0),
    file: z.string().max(24).default(''),
    meta: z.record(z.union([z.string().max(120), z.number(), z.boolean()])).default({}),
  }),
};

export const caseFileSchema = {
  body: z.object({
    code: code,
    sequence: z.number().int().min(1).optional(),
    label: z.string().trim().min(1).max(30),
    title: z.string().trim().min(1).max(80),
    difficulty: z.enum(['', 'easy', 'medium', 'hard']).default(''),
    tables: z.array(z.string().regex(/^[a-z_][a-z0-9_]*$/)).default([]),
    isFinal: z.boolean().default(false),
    forceUnlocked: z.boolean().default(false),
    challenges: z.array(challengeInput).default([]),
    force: z.boolean().optional(),
  }),
};

export const caseFileUpdateSchema = {
  params: z.object({ id: objectId }),
  body: caseFileSchema.body.partial().refine((b) => Object.keys(b).length > 0, 'Nothing to update'),
};

export const reorderSchema = { body: z.object({ orderedIds: z.array(objectId).min(1) }) };

export const challengeCreateSchema = { params: z.object({ id: objectId }), body: challengeInput };
export const challengeUpdateSchema = { params: z.object({ challengeId: objectId }), body: challengeInput.partial().refine((b) => Object.keys(b).length > 0, 'Nothing to update') };
export const challengeParams = { params: z.object({ challengeId: objectId }) };
export const hintCreateSchema = { params: z.object({ challengeId: objectId }), body: hintInput.extend({ force: z.boolean().optional() }) };
export const hintUpdateSchema = { params: z.object({ hintId: objectId }), body: hintInput.partial().extend({ force: z.boolean().optional() }) };
export const hintIdParams = { params: z.object({ hintId: objectId }) };

export const evidenceUpsertSchema = {
  body: z.object({
    code: code,
    title: z.string().trim().min(1).max(120),
    summary: z.string().trim().min(1).max(600),
    source: z.string().max(60).default(''),
    relatedEntities: z.array(code).default([]),
    timestamp: z.string().max(60).default(''),
    order: z.number().int().min(0).default(0),
    passiveTrigger: z.object({ table: z.string(), column: z.string(), value: z.string() }).nullable().optional(),
    force: z.boolean().optional(),
  }),
};
export const evidenceCodeParams = { params: z.object({ code: code }) };

/* dataset */

const columnSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  type: z.enum(['TEXT', 'INTEGER', 'REAL', 'DATE', 'DATETIME', 'BOOLEAN']).default('TEXT'),
  isPrimary: z.boolean().default(false),
  references: z.object({ table: z.string(), column: z.string() }).nullable().optional(),
  description: z.string().max(300).default(''),
});

export const tableImportSchema = {
  body: z.object({
    replace: z.boolean().default(false),
    tables: z
      .array(
        z.object({
          name: z.string().regex(/^[a-z_][a-z0-9_]*$/),
          description: z.string().max(500).default(''),
          order: z.number().int().min(0).optional(),
          columns: z.array(columnSchema).min(1).max(60),
          primaryKey: z.array(z.string()).optional(),
          indexes: z.array(z.union([z.string(), z.array(z.string())])).optional(),
          rows: z.array(z.record(z.any())).max(20000),
        }),
      )
      .min(1)
      .max(30),
  }),
};

export const tableNameSchema = {
  params: z.object({ name: z.string().regex(/^[a-z_][a-z0-9_]*$/) }),
  query: z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(500).default(50) }),
};

export const tableUpdateSchema = {
  params: z.object({ name: z.string().regex(/^[a-z_][a-z0-9_]*$/) }),
  body: z.object({ description: z.string().max(500).optional(), order: z.number().int().min(0).optional(), columns: z.array(columnSchema.partial().extend({ name: z.string() })).optional() }),
};

/* event */

export const eventUpdateSchema = {
  body: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    caseNumber: z.string().trim().max(40).optional(),
    startsAt: z.coerce.date().nullable().optional(),
    durationMinutes: z.number().int().min(5).max(600).optional(),
    registrationOpen: z.boolean().optional(),
    maxParticipants: z.number().int().min(1).max(5000).optional(),
    exposeQueryHistory: z.boolean().optional(),
    proctoring: z
      .object({
        enabled: z.boolean().optional(),
        requireFullscreen: z.boolean().optional(),
        blockCopyPaste: z.boolean().optional(),
        blockContextMenu: z.boolean().optional(),
        warnLimit: z.number().int().min(0).max(100).optional(),
        maxViolations: z.number().int().min(0).max(100).optional(),
        onLimit: z.enum(['notify', 'lock']).optional(),
      })
      .optional(),
    dataset: z.string().trim().max(40).optional(),
    queryScope: z.enum(['dataset', 'allowedTables']).optional(),
    queryPolicy: z.object({ timeoutMs: z.number().int().min(250).max(30000).optional(), maxRows: z.number().int().min(1).max(5000).optional(), maxLength: z.number().int().min(100).max(20000).optional(), perMinute: z.number().int().min(1).max(1000).optional() }).optional(),
    scoringPolicy: z
      .object({
        initialScore: z.number().int().min(0).max(100000).optional(),
        wrongAnswerPenalty: z.number().int().min(0).max(10000).optional(),
        hintPenalty: z.number().int().min(0).max(10000).optional(),
        hintPenaltyScope: z.enum(['file', 'hint']).optional(),
        finalAttemptPenalty: z.number().int().min(0).max(10000).optional(),
        timeBonus: z.object({ enabled: z.boolean().optional(), perMinuteRemaining: z.number().min(0).optional(), max: z.number().min(0).optional() }).optional(),
        completionBonus: z.number().int().min(0).max(100000).optional(),
        minimumScore: z.number().int().min(-100000).max(100000).optional(),
      })
      .optional(),
    leaderboardPolicy: z.object({ order: z.array(z.string()).optional(), groupBy: z.enum(['participant', 'team']).optional(), visibleToParticipants: z.boolean().optional(), limit: z.number().int().min(1).max(500).optional() }).optional(),
    finalAttemptPolicy: z.object({ maxAttempts: z.number().int().min(0).max(100) }).optional(),
    entities: z.array(z.object({ id: code, name: z.string().trim().min(1).max(80), department: z.string().max(80).default(''), role: z.string().max(80).default('') })).optional(),
    briefing: z.object({ stamp: z.string().max(40).optional(), text: z.string().max(5000).optional(), beginLabel: z.string().max(80).optional() }).optional(),
    landing: z.object({ tag: z.string().max(120).optional(), subtitle: z.string().max(1000).optional() }).optional(),
    reveal: z.object({ badge: z.string().max(60).optional(), title: z.string().max(120).optional(), paragraphs: z.array(z.string().max(2000)).optional(), facts: z.array(z.object({ label: z.string().max(60), value: z.string().max(200) })).optional() }).optional(),
    force: z.boolean().optional(),
  }),
};

export const extendSchema = { body: z.object({ minutes: z.number().int().min(1).max(180) }) };
export const scheduleSchema = { body: z.object({ startsAt: z.coerce.date() }) };
export const resetSchema = { body: z.object({ mode: z.enum(['RESET_EVENT', 'RESET_PARTICIPANT', 'RESET_TEAM', 'RESET_LEADERBOARD', 'RESET_INVESTIGATION_DATA']), target: objectId.optional(), confirm: z.string().min(1).max(60) }) };
export const announceSchema = { body: z.object({ title: z.string().trim().min(1).max(80), body: z.string().trim().max(300).default(''), tone: z.enum(['cyan', 'crimson', 'amber']).default('cyan') }) };
export const auditQuery = { query: z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50), action: z.string().max(60).optional(), actor: objectId.optional(), since: z.coerce.date().optional() }) };
export const recentQueriesSchema = { query: z.object({ limit: z.coerce.number().int().min(1).max(500).default(100), status: z.enum(['success', 'error', 'rejected', 'timeout']).optional(), session: objectId.optional(), challenge: z.string().max(24).optional(), since: z.coerce.date().optional() }) };
