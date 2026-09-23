import { motion, useReducedMotion } from 'framer-motion';
import { OctagonAlert, Inbox, RefreshCw, WifiOff, Lock } from 'lucide-react';
import { Button } from './Button.jsx';
import { cn } from '../../utils/cn.js';
import { errorTitle, errorMessage } from '../../utils/errors.js';

/** SystemLoader — three ink dots bouncing under a caption. */
export function SystemLoader({ label = 'Loading', className, compact = false }) {
  const reduce = useReducedMotion();
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col items-center justify-center gap-4 text-center', compact ? 'py-6' : 'py-16', className)}>
      <div className="flex items-end gap-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="block h-4 w-4 border-2 border-ink bg-yellow" animate={reduce ? undefined : { y: [0, -12, 0] }} transition={{ repeat: Infinity, duration: 0.7, delay: i * 0.12, ease: 'easeInOut' }} />
        ))}
      </div>
      <p className="caption">{label}…</p>
    </div>
  );
}

export function Spinner({ className }) {
  return <RefreshCw className={cn('h-4 w-4 animate-spin text-ink', className)} strokeWidth={2.5} aria-hidden />;
}

export function EmptyState({ icon: Icon = Inbox, title = 'Nothing here', body, action, className, compact = false }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-16', className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center border-3 border-dashed border-ink-soft text-ink-soft">
        <Icon className="h-6 w-6" strokeWidth={2.2} aria-hidden />
      </div>
      <p className="font-display text-2xl uppercase tracking-comic text-ink-soft">{title}</p>
      {body ? <p className="mt-1.5 max-w-sm text-base text-ink-soft">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry, title, body, className, compact = false }) {
  const network = error?.isNetwork;
  const locked = error?.status === 423;
  const Icon = network ? WifiOff : locked ? Lock : OctagonAlert;
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-16', className)}>
      <div className={cn('mb-4 flex h-14 w-14 items-center justify-center border-3 border-ink shadow-comic-sm', locked ? 'bg-yellow text-ink' : 'bg-red text-white')}>
        <Icon className="h-6 w-6" strokeWidth={2.5} aria-hidden />
      </div>
      <p className={cn('font-display text-2xl uppercase tracking-comic', locked ? 'text-ink' : 'text-red-deep')}>{title || errorTitle(error)}</p>
      <p className="mt-1.5 max-w-md text-base text-ink-soft">{body || errorMessage(error)}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" icon={RefreshCw} className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className, lines = 1 }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-3.5 animate-shimmer border-2 border-line bg-[linear-gradient(90deg,#f1e8d2_0%,#ffffff_50%,#f1e8d2_100%)] bg-[length:200%_100%]" style={{ width: `${100 - (i % 3) * 18}%` }} />
      ))}
    </div>
  );
}
