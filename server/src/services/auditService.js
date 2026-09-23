import { AuditLog } from '../models/index.js';
import { logger } from '../utils/logger.js';

/**
 * Append-only audit trail (spec §34). Never throws — an audit failure must
 * not break the action it describes. Never records passwords or tokens.
 */
const SENSITIVE = /(password|accesscode|token|secret|authorization)/i;

function scrub(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(meta)) out[k] = SENSITIVE.test(k) ? '[redacted]' : v;
  return out;
}

export const auditService = {
  async record({ actor, action, target = '', meta = {}, ip, requestId } = {}) {
    try {
      await AuditLog.create({
        actor: actor?._id,
        actorName: actor?.displayName || actor?.username || 'SYSTEM',
        actorRole: actor?.role || 'system',
        action,
        target,
        requestId: requestId || '',
        meta: scrub(meta),
        ip,
      });
    } catch (err) {
      logger.warn(`Audit write failed for ${action}`, err.message);
    }
  },

  async list({ page = 1, limit = 50, action, actor, since } = {}) {
    const filter = {};
    if (action) filter.action = action;
    if (actor) filter.actor = actor;
    if (since) filter.createdAt = { $gte: new Date(since) };
    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  },
};
