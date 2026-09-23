import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { LayoutGrid, FolderLock, Database, Terminal, Fingerprint, Users, Trophy, FileLock2, Radar, Activity, Power, Settings2, ScrollText, Circle, BookOpen, KeyRound } from 'lucide-react';
import { cn } from '../../utils/cn.js';
import { fadeUp } from '../../animations/variants.js';

const ICONS = { LayoutGrid, FolderLock, Database, Terminal, Fingerprint, Users, Trophy, FileLock2, Radar, Activity, Power, Settings2, ScrollText, BookOpen, KeyRound };

/** Resolve a nav icon by name (explicit map keeps the bundle tree-shakeable). */
export function Icon({ name, className, ...rest }) {
  const Cmp = ICONS[name] || Circle;
  return <Cmp className={className} strokeWidth={2.4} aria-hidden {...rest} />;
}

export function Kbd({ children }) {
  return <kbd className="inline-block border-2 border-ink bg-white px-1.5 py-0.5 font-mono text-[0.7rem] text-ink shadow-comic-sm">{children}</kbd>;
}

/*
 * SectionHeading — a yellow caption (the narrator) above a big display
 * title, with an optional one-line description and actions on the right.
 */
export function SectionHeading({ label, title, description, actions, className, tone = 'neutral' }) {
  const captions = { neutral: 'caption', cyan: 'caption-blue', crimson: 'caption-red', violet: 'caption-blue', amber: 'caption' };
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {label ? <p className={cn(captions[tone] || 'caption', 'mb-2 tilt-l')}>{label}</p> : null}
        <h1 className="h-section text-shadow-comic-sm text-ink">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-base text-ink-soft">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** ProgressBar — an ink-bordered track with a flat fill. */
export function ProgressBar({ value = 0, max = 100, tone = 'cyan', className, label, thick = false }) {
  const pct = max ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const tones = { cyan: 'bg-cyan', blue: 'bg-blue', crimson: 'bg-red', violet: 'bg-purple', amber: 'bg-yellow', green: 'bg-green', ink: 'bg-ink' };
  const reduce = useReducedMotion();
  return (
    <div className={cn('w-full overflow-hidden border-2 border-ink bg-white', thick ? 'h-4' : 'h-2.5', className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <motion.div className={cn('h-full', tones[tone])} initial={false} animate={{ width: `${pct}%` }} transition={reduce ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
    </div>
  );
}

/** Reveal — fades content up when it scrolls into view. */
export function Reveal({ children, className, delay = 0, once = true, amount = 0.3, as = 'div' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once, amount });
  const reduce = useReducedMotion();
  const Tag = motion[as] || motion.div;
  return (
    <Tag ref={ref} className={className} variants={fadeUp} initial={reduce ? 'show' : 'hidden'} animate={inView ? 'show' : 'hidden'} transition={{ delay }}>
      {children}
    </Tag>
  );
}

/** Typewriter — text typed character by character. */
export function Typewriter({ text, speed = 28, delay = 0, className, onDone, cursor = true }) {
  const [shown, setShown] = useState('');
  const reduce = useReducedMotion();
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    if (reduce) {
      setShown(text);
      doneRef.current?.();
      return undefined;
    }
    setShown('');
    let i = 0;
    let interval = null;
    const start = setTimeout(() => {
      interval = setInterval(() => {
        i += 1;
        setShown(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(interval);
          doneRef.current?.();
        }
      }, speed);
    }, delay);
    return () => {
      clearTimeout(start);
      if (interval) clearInterval(interval);
    };
  }, [text, speed, delay, reduce]);
  return (
    <span className={className}>
      {shown}
      {cursor && shown.length < text.length ? <span className="animate-blink">▍</span> : null}
    </span>
  );
}

/** Tabs — a row of caption-style tabs; the active one is yellow. */
export function Tabs({ tabs, value, onChange, className, size = 'md' }) {
  return (
    <div role="tablist" className={cn('flex gap-2 overflow-x-auto no-scrollbar', className)}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              'relative shrink-0 whitespace-nowrap border-3 border-ink font-display uppercase leading-none tracking-comic transition-all duration-150',
              size === 'sm' ? 'px-3 py-1.5 text-base' : 'px-4 py-2 text-lg',
              active ? 'bg-yellow text-ink shadow-comic-sm' : 'bg-white text-ink-soft hover:bg-yellow-light',
            )}
          >
            {t.label}
            {t.count !== undefined ? <span className="ml-1.5 text-ink-faint">{t.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function KeyValue({ items, className, dense = false }) {
  return (
    <dl className={cn('grid grid-cols-[auto_1fr] gap-x-4', dense ? 'gap-y-1' : 'gap-y-2', className)}>
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="label pt-0.5">{k}</dt>
          <dd className="min-w-0 break-words text-base text-ink">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CornerLabel({ children, className }) {
  return <span className={cn('pointer-events-none absolute right-2 top-2 font-display text-sm uppercase tracking-comic text-ink-faint', className)}>{children}</span>;
}

/** Burst — a starburst that shouts a word or two. */
export function Burst({ children, tone = 'yellow', size = 'md', className, tilt = -6 }) {
  const tones = { yellow: '', red: 'burst-red', blue: 'burst-blue' };
  const sizes = { sm: 'text-xl px-6 py-4', md: 'text-3xl', lg: 'text-5xl px-12 py-8' };
  return (
    <span className={cn('burst-wrap', className)} style={{ transform: `rotate(${tilt}deg)` }}>
      <span className={cn('burst', tones[tone], sizes[size])}>{children}</span>
    </span>
  );
}

/** Bubble — a speech (or thought) bubble; `from` decides where the tail points. */
export function Bubble({ children, className, from = 'left', thought = false, speaker }) {
  return (
    <div className={cn('mb-5', className)}>
      <div className={cn('bubble', from === 'right' && 'bubble-left', thought && 'bubble-thought')}>{children}</div>
      {speaker ? <p className={cn('mt-6 label', from === 'right' ? 'text-right' : 'text-left')}>— {speaker}</p> : null}
    </div>
  );
}
