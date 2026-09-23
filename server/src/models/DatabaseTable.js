import mongoose from 'mongoose';

const { Schema } = mongoose;

export const COLUMN_TYPES = ['TEXT', 'INTEGER', 'REAL', 'DATE', 'DATETIME', 'BOOLEAN'];

const columnSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, match: /^[a-zA-Z_][a-zA-Z0-9_]*$/ },
    type: { type: String, enum: COLUMN_TYPES, default: 'TEXT' },
    isPrimary: { type: Boolean, default: false },
    references: {
      type: new Schema({ table: { type: String, required: true }, column: { type: String, required: true } }, { _id: false }),
      default: null,
    },
    description: { type: String, default: '', maxlength: 300 },
  },
  { _id: false },
);

/**
 * One document per investigation table (the investigation dataset lives in
 * its own collection family, never mixed with application data). `rows` is
 * the full data — tables are small and this keeps import/reset trivial.
 */
const databaseTableSchema = new Schema(
  {
    dataset: { type: String, default: 'black-cipher', index: true },
    name: { type: String, required: true, unique: true, trim: true, lowercase: true, match: /^[a-z_][a-z0-9_]*$/ },
    order: { type: Number, default: 0, index: true },
    description: { type: String, default: '', maxlength: 500 },
    columns: { type: [columnSchema], required: true },
    /** Composite keys supported (project_members: emp_id + project_name). */
    primaryKey: { type: [String], default: [] },
    indexes: { type: [[String]], default: [] },
    rows: { type: [Schema.Types.Mixed], default: [] },
    rowCount: { type: Number, default: 0 },
    isCustom: { type: Boolean, default: false },
  },
  { timestamps: true, minimize: false },
);

databaseTableSchema.pre('save', function syncDerived(next) {
  this.rowCount = Array.isArray(this.rows) ? this.rows.length : 0;
  if (!this.primaryKey?.length) this.primaryKey = this.columns.filter((c) => c.isPrimary).map((c) => c.name);
  next();
});

export const DatabaseTable = mongoose.model('DatabaseTable', databaseTableSchema);
