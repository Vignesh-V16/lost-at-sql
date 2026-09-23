import { cn } from '../../utils/cn.js';

/*
 * Badge — a small ink-bordered chip, lettered in the display face.
 * Tone names are the app's shared vocabulary:
 *   cyan = good / live, crimson = danger, violet = special, amber = warning,
 *   dim = inactive, neutral = plain.
 */
const TONES = {
  cyan: 'border-ink bg-cyan text-ink',
  blue: 'border-ink bg-blue text-white',
  green: 'border-ink bg-green text-white',
  crimson: 'border-ink bg-red text-white',
  violet: 'border-ink bg-purple text-white',
  amber: 'border-ink bg-yellow text-ink',
  dim: 'border-ink-faint bg-paper text-ink-soft',
  neutral: 'border-ink bg-white text-ink',
};

export function Badge({ tone = 'neutral', pulse = false, className, children }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 border-2 px-2 py-0.5 font-display text-[0.9rem] uppercase leading-none tracking-comic shadow-comic-sm', TONES[tone], className)}>
      {pulse ? (
        <span className="relative inline-flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-pulseRing rounded-full bg-current opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
        </span>
      ) : null}
      {children}
    </span>
  );
}

/** Stamp — a tilted rubber stamp: CLOSED, PRIME SUSPECT, TIME UP … */
export function Stamp({ tone = 'crimson', className, children }) {
  const colours = { crimson: 'border-red text-red', cyan: 'border-blue text-blue', violet: 'border-purple text-purple', amber: 'border-orange text-orange', green: 'border-green text-green', dim: 'border-ink-faint text-ink-faint', ink: 'border-ink text-ink' };
  return <span className={cn('stamp', colours[tone], className)}>{children}</span>;
}
