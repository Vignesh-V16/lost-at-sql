import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * EvidenceDefinition — the catalogue of evidence a case can award (spec §27).
 * Discovery is declared by challenges (`onSuccess.evidence`); a definition
 * may also carry a passive trigger for future cases (off for Black Cipher).
 */
const evidenceSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 40 },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    summary: { type: String, required: true, trim: true, maxlength: 600 },
    source: { type: String, trim: true, default: '' },
    relatedEntities: { type: [String], default: [] },
    timestamp: { type: String, default: '' },
    order: { type: Number, default: 0 },
    /** Optional passive discovery: { table, column, value } — awarded when a focused result contains the cell. Hidden. */
    passiveTrigger: { type: new Schema({ table: String, column: String, value: String }, { _id: false }), default: null, select: false },
  },
  { timestamps: true },
);

export const EvidenceDefinition = mongoose.model('EvidenceDefinition', evidenceSchema);
