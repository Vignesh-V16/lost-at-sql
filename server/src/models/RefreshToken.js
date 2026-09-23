import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Rotating refresh tokens (spec §37). Only a SHA-256 hash is stored. Every
 * refresh issues a new token in the same `family` and marks the old one as
 * replaced; presenting an already-replaced token is treated as theft and
 * revokes the whole family.
 */
const refreshTokenSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    replacedBy: { type: String, default: null },
    revokedAt: { type: Date, default: null },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true },
);

export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
