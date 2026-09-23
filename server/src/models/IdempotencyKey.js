import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Stored responses for requests carrying an `Idempotency-Key` header
 * (spec §29). A retried request replays the stored response instead of
 * re-running the action. Entries expire after 24 hours.
 */
const idempotencySchema = new Schema(
  {
    key: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    route: { type: String, required: true },
    state: { type: String, enum: ['pending', 'done'], default: 'pending' },
    status: { type: Number },
    body: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
  },
  { minimize: false },
);

idempotencySchema.index({ user: 1, key: 1 }, { unique: true });

export const IdempotencyKey = mongoose.model('IdempotencyKey', idempotencySchema);
