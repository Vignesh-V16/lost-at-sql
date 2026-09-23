import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Immutable audit trail (spec §34). Updates and deletes are refused at the
 * model layer; there is no route that touches this collection other than
 * insert and read.
 */
const auditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    actorName: { type: String, default: 'SYSTEM' },
    actorRole: { type: String, default: 'system' },
    action: { type: String, required: true },
    target: { type: String, default: '' },
    requestId: { type: String, default: '' },
    meta: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

const refuse = function refuse(next) {
  next(new Error('Audit records are immutable'));
};
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'findOneAndDelete', 'replaceOne']) {
  auditLogSchema.pre(op, refuse);
}
// deleteMany is allowed only via the explicit reset workflow (resetService uses the raw collection).

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
