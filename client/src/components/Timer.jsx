import { motion, useReducedMotion } from 'framer-motion';
import { Pause } from 'lucide-react';
import { useEventClock } from '../contexts/EventContext.jsx';
import { useSessionClock } from '../contexts/SessionContext.jsx';
import { formatClock } from '../utils/format.js';
import { cn } from '../utils/cn.js';

/*
 * Timer — the investigation clock, lettered like a comic caption. Urgency
 * is colour: yellow while calm, orange under fifteen minutes, red under
 * five (and the digits pulse once a second in the final minute).
 *
 * `source="session"` (participants) shows their own server-authoritative
 * session clock; `source="event"` shows the event-wide clock (coordinator).
 */
export function urgencyOf(remainingMs, running) {
  if (!running) return 'idle';
  const s = remainingMs / 1000;
  if (s <= 60) return 'final';
  if (s <= 5 * 60) return 'critical';
  if (s <= 15 * 60) return 'warning';
  if (s <= 30 * 60) return 'elevated';
  return 'calm';
}

const BOX = {
  idle: 'bg-white text-ink-soft',
  calm: 'bg-yellow text-ink',
  elevated: 'bg-yellow text-ink',
  warning: 'bg-orange text-ink',
  critical: 'bg-red text-white',
  final: 'bg-red text-white',
};
const BAR = { idle: 'bg-ink-faint', calm: 'bg-ink', elevated: 'bg-ink', warning: 'bg-ink', critical: 'bg-white', final: 'bg-white' };

const EVENT_LABEL = { draft: 'Standby', ready: 'Ready', scheduled: 'Scheduled', live: 'Time left', paused: 'Paused', ended: 'Case closed', archived: 'Archived', unknown: 'Syncing' };
const SESSION_LABEL = { none: 'Not started', active: 'Time left', completed: 'Case closed', time_expired: 'Time is up' };

function EventTimer(props) {
  const { remainingMs, totalMs, status } = useEventClock();
  return <TimerView {...props} remainingMs={remainingMs} totalMs={totalMs} running={status === 'live'} paused={status === 'paused'} label={EVENT_LABEL[status] || EVENT_LABEL.unknown} zero={status === 'ended' || status === 'archived'} />;
}

function SessionTimer(props) {
  const { remainingMs, totalMs, status, eventStatus } = useSessionClock();
  const running = status === 'active' && eventStatus === 'live';
  const label = status === 'active' && eventStatus === 'paused' ? 'Paused' : status === 'active' && eventStatus !== 'live' ? EVENT_LABEL[eventStatus] || 'Standby' : SESSION_LABEL[status] || 'Standby';
  return <TimerView {...props} remainingMs={remainingMs} totalMs={totalMs} running={running} paused={status === 'active' && eventStatus === 'paused'} label={label} zero={status === 'time_expired'} full={status === 'none'} />;
}

function TimerView({ size = 'md', className, showLabel = true, remainingMs, totalMs, running, paused, label, zero, full }) {
  const urgency = urgencyOf(remainingMs, running);
  const reduce = useReducedMotion();
  const pct = full ? 100 : totalMs ? (remainingMs / totalMs) * 100 : 0;
  const clock = zero ? '00:00' : full ? '60:00' : formatClock(remainingMs);
  const digitClass = size === 'lg' ? 'text-6xl sm:text-7xl' : size === 'sm' ? 'text-2xl' : 'text-4xl';
  const pad = size === 'lg' ? 'px-5 py-3' : size === 'sm' ? 'px-2.5 py-1' : 'px-3 py-1.5';
  return (
    <div className={cn('inline-flex flex-col', className)} aria-live="off">
      {showLabel ? <p className={cn('label mb-1', (urgency === 'critical' || urgency === 'final') && 'text-red', paused && 'text-orange')}>{label}</p> : null}
      <div className={cn('border-3 border-ink shadow-comic transition-colors duration-500', pad, BOX[paused ? 'idle' : urgency], paused && 'bg-orange text-ink')}>
        <motion.span
          key={urgency === 'final' ? Math.floor(remainingMs / 1000) : 'stable'}
          initial={reduce ? false : urgency === 'critical' || urgency === 'final' ? { scale: 1.06 } : false}
          animate={{ scale: 1 }}
          transition={{ duration: 0.35 }}
          className={cn('flex items-center gap-2 font-display leading-none tabular tracking-comic', digitClass)}
          role="timer"
          aria-label={paused ? `Paused at ${clock}` : `Time remaining ${clock}`}
        >
          {paused ? <Pause className="h-[0.6em] w-[0.6em] animate-pulse" strokeWidth={3} aria-hidden /> : null}
          {clock}
        </motion.span>
        <div className={cn('mt-1.5 w-full overflow-hidden border-2 border-ink bg-white/60', size === 'lg' ? 'h-2.5' : 'h-1.5')}>
          <motion.div className={cn('h-full', BAR[urgency])} initial={false} animate={{ width: `${pct}%` }} transition={reduce ? { duration: 0 } : { duration: 0.5, ease: 'linear' }} />
        </div>
      </div>
    </div>
  );
}

export function Timer({ source = 'event', ...props }) {
  return source === 'session' ? <SessionTimer {...props} /> : <EventTimer {...props} />;
}
