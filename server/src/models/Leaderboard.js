import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Materialised leaderboard row — recomputed from the session whenever score
 * or completion changes, and rebuildable from scratch at any time.
 */
const leaderboardSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    participant: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    session: { type: Schema.Types.ObjectId, ref: 'InvestigationSession' },
    team: { type: Schema.Types.ObjectId, ref: 'Team' },
    displayName: { type: String, required: true },
    teamName: { type: String, default: '' },
    teamColor: { type: String, default: '' },
    score: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
    status: { type: String, default: 'active' },
    elapsedMs: { type: Number, default: null },
    filesCompleted: { type: Number, default: 0 },
    filesTotal: { type: Number, default: 0 },
    evidenceCount: { type: Number, default: 0 },
    hintsUsed: { type: Number, default: 0 },
    queries: { type: Number, default: 0 },
    rank: { type: Number, default: 0 },
    previousRank: { type: Number, default: 0 },
    lastActivityAt: { type: Date },
  },
  { timestamps: true },
);

leaderboardSchema.index({ event: 1, participant: 1 }, { unique: true });
leaderboardSchema.index({ event: 1, score: -1, completed: -1, elapsedMs: 1 });
leaderboardSchema.index({ event: 1, rank: 1 });

export const Leaderboard = mongoose.model('Leaderboard', leaderboardSchema);
