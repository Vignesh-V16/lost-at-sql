import mongoose from 'mongoose';

const { Schema } = mongoose;

const teamSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 40 },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 6 },
    color: { type: String, default: '#19c8f0', match: /^#[0-9a-fA-F]{6}$/ },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

teamSchema.virtual('members', {
  ref: 'User',
  localField: '_id',
  foreignField: 'team',
});

export const Team = mongoose.model('Team', teamSchema);
