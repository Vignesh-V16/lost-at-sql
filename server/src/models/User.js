import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const { Schema } = mongoose;

/**
 * Base identity. Participants and Coordinators are discriminators so that
 * they share authentication while carrying different profile fields.
 */
const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, minlength: 3, maxlength: 40 },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, required: true, trim: true, maxlength: 60 },
    /** Team lives on the base schema so populate() works from any query path; coordinators leave it empty. */
    team: { type: Schema.Types.ObjectId, ref: 'Team', index: true },
    isActive: { type: Boolean, default: true, index: true },
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: { type: Date },
    lastSeenAt: { type: Date },
  },
  {
    timestamps: true,
    discriminatorKey: 'role',
    toJSON: { virtuals: true, transform: (_doc, ret) => { delete ret.passwordHash; delete ret.__v; return ret; } },
  },
);

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
};

export const User = mongoose.model('User', userSchema);

export const Participant = User.discriminator(
  'participant',
  new Schema({
    investigatorTag: { type: String, trim: true, maxlength: 12 },
  }),
);

export const Coordinator = User.discriminator(
  'coordinator',
  new Schema({
    title: { type: String, trim: true, maxlength: 60, default: 'Event Coordinator' },
  }),
);

export const ROLES = Object.freeze({ PARTICIPANT: 'participant', COORDINATOR: 'coordinator' });
