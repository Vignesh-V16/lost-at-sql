/**
 * Leaderboard ranking (spec §31). Rules are configurable per event:
 *
 *   policy.order = ['score:desc', 'completed:desc', 'elapsedMs:asc']   (default)
 *
 * Supported keys: score, completed, elapsedMs, filesCompleted, lastActivityAt.
 * Ties on every key share the same rank (dense ranking is *not* used — a
 * tie shows the same rank, the next distinct entry gets position + 1, which
 * is what participants expect on a competition board).
 */
export const DEFAULT_LEADERBOARD_POLICY = Object.freeze({
  order: Object.freeze(['score:desc', 'completed:desc', 'elapsedMs:asc']),
  groupBy: 'participant',
  visibleToParticipants: true,
  limit: 100,
});

const KEYS = new Set(['score', 'completed', 'elapsedMs', 'filesCompleted', 'lastActivityAt']);

export function normalizeLeaderboardPolicy(policy = {}) {
  const p = policy && typeof policy.toObject === 'function' ? policy.toObject() : policy || {};
  const order = Array.isArray(p.order) && p.order.length ? p.order : DEFAULT_LEADERBOARD_POLICY.order;
  const parsed = order
    .map((entry) => {
      const [key, dir] = String(entry).split(':');
      if (!KEYS.has(key)) return null;
      return { key, dir: dir === 'asc' ? 1 : -1 };
    })
    .filter(Boolean);
  return {
    order: parsed.length ? parsed : normalizeLeaderboardPolicy(DEFAULT_LEADERBOARD_POLICY).order,
    groupBy: p.groupBy === 'team' ? 'team' : 'participant',
    visibleToParticipants: p.visibleToParticipants !== false,
    limit: Math.max(1, Math.min(500, Number(p.limit) || DEFAULT_LEADERBOARD_POLICY.limit)),
  };
}

function valueOf(entry, key) {
  const v = entry[key];
  if (key === 'completed') return v ? 1 : 0;
  if (key === 'lastActivityAt') return v ? new Date(v).getTime() : 0;
  if (key === 'elapsedMs') return Number.isFinite(Number(v)) && v !== null ? Number(v) : Number.MAX_SAFE_INTEGER;
  return Number(v) || 0;
}

/** Policy-keys-only comparison: 0 means the two entries tie on every ranking key. */
export function compareByPolicy(policy) {
  const p = normalizeLeaderboardPolicy(policy);
  return (a, b) => {
    for (const { key, dir } of p.order) {
      const av = valueOf(a, key);
      const bv = valueOf(b, key);
      if (av !== bv) return av < bv ? -dir : dir;
    }
    return 0;
  };
}

/** Full ordering: policy keys, then display name for a stable board. */
export function compareEntries(policy) {
  const byPolicy = compareByPolicy(policy);
  return (a, b) => byPolicy(a, b) || String(a.displayName || '').localeCompare(String(b.displayName || ''));
}

/** Sorts a copy and assigns `rank` (entries tied on every ranking key share a rank). */
export function rankEntries(entries = [], policy) {
  const p = normalizeLeaderboardPolicy(policy);
  const tie = compareByPolicy(p);
  const sorted = [...entries].sort(compareEntries(p));
  let rank = 0;
  sorted.forEach((e, i) => {
    if (i === 0 || tie(sorted[i - 1], e) !== 0) rank = i + 1;
    e.rank = rank;
  });
  return sorted;
}
