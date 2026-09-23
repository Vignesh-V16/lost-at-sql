import mongoose from 'mongoose';

const { Schema } = mongoose;

export const QUERY_STATUS = ['success', 'error', 'rejected', 'timeout'];

/**
 * One row per SQL execution (spec §21). Result rows are not stored — the
 * dataset is immutable for the event, so a submission re-executes the SQL.
 * `sqlHash`/`resultHash` let coordinators spot copy-paste between sessions.
 */
const queryAttemptSchema = new Schema(
  {
    session: { type: Schema.Types.ObjectId, ref: 'InvestigationSession', required: true },
    participant: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    event: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    team: { type: Schema.Types.ObjectId, ref: 'Team' },
    caseFile: { type: String },
    challenge: { type: String },
    sql: { type: String, required: true, maxlength: 20000 },
    sqlHash: { type: String, required: true },
    status: { type: String, enum: QUERY_STATUS, required: true },
    errorType: { type: String },
    errorMessage: { type: String },
    blockedReason: { type: String },
    rowCount: { type: Number, default: 0 },
    columns: { type: [String], default: [] },
    truncated: { type: Boolean, default: false },
    durationMs: { type: Number, default: 0 },
    resultHash: { type: String },
    evidenceDiscovered: { type: [String], default: [] },
  },
  { timestamps: { createdAt: 'executedAt', updatedAt: false } },
);

queryAttemptSchema.index({ session: 1, executedAt: -1 });
queryAttemptSchema.index({ event: 1, executedAt: -1 });
queryAttemptSchema.index({ challenge: 1, status: 1 });
queryAttemptSchema.index({ sqlHash: 1 });

export const QueryAttempt = mongoose.model('QueryAttempt', queryAttemptSchema);
