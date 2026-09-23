import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Portrait } from '../ui/Portrait.jsx';
import { Stamp } from '../ui/Badge.jsx';
import { SUSPECT_STATE_META } from '../../data/constants.js';
import { cn } from '../../utils/cn.js';

/*
 * The evidence board: the prototype's twelve persons of interest with the
 * server-decided state of each (suspect / cleared / flagged / prime /
 * accomplice). A row is a tiny portrait, the name and role, and a stamp.
 */
export function SuspectRow({ suspect, dense = false, linkTo }) {
  const meta = SUSPECT_STATE_META[suspect.state] || SUSPECT_STATE_META.UNKNOWN;
  const cleared = suspect.state === 'CLEARED';
  const body = (
    <>
      <Portrait seed={suspect.id} size={dense ? 30 : 38} tone={meta.portrait} flagged={suspect.state === 'PRIME_SUSPECT'} className="border-2" />
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate font-display text-lg uppercase leading-none tracking-comic text-ink', cleared && 'line-through decoration-red decoration-[3px]')}>{suspect.name}</span>
        <span className="block truncate text-xs font-bold text-ink-soft">{suspect.role}</span>
      </span>
      {meta.stamp ? (
        <Stamp tone={meta.stamp} className="shrink-0 text-[0.7rem]">
          {meta.label}
        </Stamp>
      ) : null}
    </>
  );
  const cls = cn('flex items-center gap-2.5 border-2 border-transparent transition-colors', dense ? 'px-1.5 py-1' : 'px-2 py-1.5', meta.card, suspect.state === 'PRIME_SUSPECT' && 'border-red', suspect.state === 'ACCOMPLICE' && 'border-blue');
  if (linkTo) {
    return (
      <Link to={linkTo} className={cn(cls, 'hover:border-ink')}>
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}

export function SuspectBoard({ suspects = [], score, completedCount = 0, totalCount = 6, className, title = 'Evidence board', showScore = true, animateKey }) {
  return (
    <aside className={cn('panel relative mt-3 p-4', className)} aria-label="Evidence board">
      <span className="caption absolute -top-4 left-4 text-[0.95rem]">{title}</span>
      <p className="mt-3 text-sm font-bold text-ink-soft">
        {suspects.length} persons of interest · {completedCount}/{totalCount} files closed
      </p>
      {showScore ? (
        <div className="my-3 flex items-center justify-between border-y-3 border-ink py-2">
          <span className="label">Score</span>
          <motion.b key={`${animateKey}-${score}`} initial={{ scale: 1.3, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 16 }} className="font-display text-3xl leading-none text-ink">
            {score ?? '—'}
          </motion.b>
        </div>
      ) : null}
      <div className="space-y-1">
        {suspects.map((s) => (
          <SuspectRow key={s.id} suspect={s} />
        ))}
      </div>
    </aside>
  );
}
