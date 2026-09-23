import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUp, ArrowDown, Minus, Trophy, CircleCheck } from 'lucide-react';
import { formatDuration } from '../utils/format.js';
import { cn } from '../utils/cn.js';

/*
 * LeaderboardTable — the ranking, shared by participants and the command
 * center. Rows use layout animation so rank changes slide; the top three
 * get medal-coloured rank boxes.
 */
const MEDAL = { 1: 'bg-yellow', 2: 'bg-paper-3', 3: 'bg-orange' };

export function LeaderboardTable({ rows = [], highlightId }) {
  const reduce = useReducedMotion();
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b-3 border-ink bg-yellow text-left">
            {['Rank', 'Investigator / Team', 'Files', 'Evidence', 'Hints', 'Time', 'Score'].map((h, i) => (
              <th key={h} className={cn('px-3 py-2 font-display text-base font-normal uppercase tracking-comic text-ink', i >= 2 && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const delta = r.previousRank && r.rank ? r.previousRank - r.rank : 0;
            const me = highlightId && (highlightId === r.participantId || highlightId === r.id);
            const rowKey = r.participantId || r.id || r.displayName;
            const top = r.rank <= 3;
            return (
              <motion.tr key={rowKey} layout={!reduce} transition={{ type: 'spring', stiffness: 320, damping: 30 }} className={cn('border-b-2 border-line', me ? 'bg-cyan-light' : 'hover:bg-yellow-light')}>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={cn('inline-flex h-8 w-8 items-center justify-center border-2 border-ink font-display text-lg tabular', top ? cn(MEDAL[r.rank], 'shadow-comic-sm') : 'bg-white')}>{r.rank}</span>
                    {r.rank === 1 ? <Trophy className="h-4 w-4 text-orange" strokeWidth={2.5} aria-hidden /> : null}
                    <span className={cn('inline-flex items-center font-display text-sm', delta > 0 ? 'text-green' : delta < 0 ? 'text-red' : 'text-ink-faint')} aria-label={delta ? `${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)}` : 'no change'}>
                      {delta > 0 ? <ArrowUp className="h-3.5 w-3.5" strokeWidth={3} /> : delta < 0 ? <ArrowDown className="h-3.5 w-3.5" strokeWidth={3} /> : <Minus className="h-3.5 w-3.5" strokeWidth={3} />}
                      {delta ? Math.abs(delta) : null}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    {r.teamColor ? <span className="h-3 w-3 shrink-0 border-2 border-ink" style={{ background: r.teamColor }} aria-hidden /> : null}
                    <div className="min-w-0">
                      <p className={cn('truncate font-display text-xl uppercase leading-none tracking-comic', me ? 'text-blue' : 'text-ink')}>
                        {r.displayName} {me ? <span className="font-body text-xs font-bold text-ink-faint">(you)</span> : null}
                      </p>
                      <p className="truncate text-xs font-bold text-ink-faint">{r.teamName || 'No team'}</p>
                    </div>
                    {r.completed ? <CircleCheck className="ml-1 h-4 w-4 shrink-0 text-green" strokeWidth={2.6} aria-label="Case closed" /> : null}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-sm tabular">{r.filesCompleted ?? 0}</td>
                <td className="px-3 py-2.5 text-right font-mono text-sm tabular">{r.evidenceCount ?? 0}</td>
                <td className="px-3 py-2.5 text-right font-mono text-sm tabular">{r.hintsUsed ?? 0}</td>
                <td className="px-3 py-2.5 text-right font-mono text-sm tabular text-ink-soft">{r.elapsedMs ? formatDuration(r.elapsedMs) : '—'}</td>
                <td className={cn('px-3 py-2.5 text-right font-display text-2xl tabular', top ? 'text-ink' : 'text-ink-soft')}>{r.score}</td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
