import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, TriangleAlert, CircleCheck, Info, Radio } from 'lucide-react';
import { cn } from '../utils/cn.js';

/**
 * Two channels of feedback:
 *   notify()  — compact system messages, stacked top-right ("QUERY EXECUTED")
 *   impact()  — a single comic-style banner, centred ("NEW EVIDENCE DISCOVERED")
 */
const ToastContext = createContext(null);

let counter = 0;

const TONE = {
  cyan: { bg: 'bg-cyan', text: 'text-ink', Icon: CircleCheck, flash: 'flash-blue' },
  green: { bg: 'bg-green', text: 'text-white', Icon: CircleCheck, flash: 'flash-green' },
  crimson: { bg: 'bg-red', text: 'text-white', Icon: TriangleAlert, flash: 'flash-red' },
  violet: { bg: 'bg-purple', text: 'text-white', Icon: Radio, flash: 'flash-purple' },
  amber: { bg: 'bg-yellow', text: 'text-ink', Icon: Info, flash: 'flash-yellow' },
  neutral: { bg: 'bg-white', text: 'text-ink', Icon: Info, flash: '' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [impacts, setImpacts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const notify = useCallback(
    ({ tone = 'neutral', title, body, ttl = 4200 }) => {
      const id = ++counter;
      setToasts((t) => [...t.slice(-4), { id, tone, title, body }]);
      const timer = setTimeout(() => dismiss(id), ttl);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  const impact = useCallback(({ tone = 'cyan', title, body, ttl = 2600 }) => {
    const id = ++counter;
    setImpacts((list) => [...list, { id, tone, title, body }]);
    setTimeout(() => setImpacts((list) => list.filter((x) => x.id !== id)), ttl);
    return id;
  }, []);

  const value = useMemo(() => ({ notify, impact, dismiss }), [notify, impact, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
      <ImpactViewport impacts={impacts} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

function ToastViewport({ toasts, onDismiss }) {
  const reduce = useReducedMotion();
  return (
    <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed right-3 top-3 z-[90] flex w-[min(92vw,380px)] flex-col gap-3 sm:right-5 sm:top-5">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const tone = TONE[t.tone] || TONE.neutral;
          return (
            <motion.div
              key={t.id}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, x: 40, rotate: 3, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, rotate: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.9, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
              role="status"
              className="pointer-events-auto relative border-3 border-ink bg-white pl-3 pr-10 py-3 shadow-comic"
            >
              <div className="flex items-start gap-3">
                <span className={cn('mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center border-2 border-ink', tone.bg, tone.text)}>
                  <tone.Icon className="h-4 w-4" strokeWidth={2.6} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-lg uppercase leading-none tracking-comic text-ink">{t.title}</p>
                  {t.body ? <p className="mt-1 text-sm leading-snug text-ink-soft">{t.body}</p> : null}
                </div>
              </div>
              <button type="button" onClick={() => onDismiss(t.id)} aria-label="Dismiss notification" className="absolute right-2 top-2 border-2 border-ink bg-white p-0.5 text-ink shadow-comic-sm hover:bg-yellow">
                <X className="h-3.5 w-3.5" strokeWidth={3} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function ImpactViewport({ impacts }) {
  const reduce = useReducedMotion();
  const current = impacts[impacts.length - 1];
  const coloured = current ? current.tone === 'crimson' || current.tone === 'violet' || current.tone === 'cyan' : false;
  return (
    <div aria-live="assertive" className="pointer-events-none fixed inset-x-0 top-[16vh] z-[95] flex justify-center px-4">
      <AnimatePresence mode="wait">
        {current ? (
          <motion.div
            key={current.id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4, rotate: -14 }}
            animate={{ opacity: 1, scale: 1, rotate: -3 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.15, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 480, damping: 18 }}
            className="burst-wrap max-w-[min(92vw,640px)]"
          >
            <div className={cn('burst flex-col px-12 py-8 text-center', current.tone === 'crimson' ? 'burst-red' : current.tone === 'violet' || current.tone === 'cyan' ? 'burst-blue' : '')}>
              <p className="font-display text-4xl uppercase leading-none tracking-comic sm:text-5xl">{current.title}</p>
              {current.body ? <p className={cn('mt-2 font-body text-sm font-bold', coloured ? 'text-white/90' : 'text-ink/80')}>{current.body}</p> : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
