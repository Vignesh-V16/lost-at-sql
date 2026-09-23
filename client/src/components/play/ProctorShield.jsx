import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Maximize, ShieldAlert, Eye, Lock, Gavel } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { cn } from '../../utils/cn.js';

/*
 * ProctorShield — what the participant sees of the integrity checks.
 *
 *   • a blocking sheet while full screen is required but not on,
 *   • a blocking sheet when the coordinator has put the session on hold,
 *   • a corner strike counter once flags start accruing,
 *   • a brief banner naming the last flag, so nothing is recorded silently.
 *
 * Everything is stated plainly: the participant is told what was recorded
 * and what the coordinator can see. Nothing here enforces anything on its
 * own — the server holds the record.
 */

const FLAG_TEXT = {
  TAB_HIDDEN: 'You left this page. That is recorded.',
  WINDOW_BLUR: 'Another window took focus. That is recorded.',
  FULLSCREEN_EXIT: 'You left full screen. That is recorded.',
  PASTE: 'Pasting is disabled during the investigation.',
  COPY: 'Copying is disabled during the investigation.',
  CUT: 'Copying is disabled during the investigation.',
  CONTEXT_MENU: 'The right-click menu is disabled.',
  DEVTOOLS_KEY: 'Developer tools are not available here. That is recorded.',
  PRINT: 'Printing and saving the page are disabled.',
};

/** The full-screen gate and the on-hold sheet both use this frame. */
function Sheet({ icon: Icon, title, children, actions }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/92 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="proctor-title"
    >
      <motion.div
        initial={reduce ? false : { scale: 0.94, rotate: -1 }}
        animate={{ scale: 1, rotate: 0 }}
        className="relative w-full max-w-lg border-5 border-ink bg-paper p-6 shadow-comic-xl sm:p-8"
      >
        <span className="caption-red absolute -top-4 left-4 text-base">Exam integrity</span>
        <div className="flex items-start gap-4">
          <Icon className="mt-1 h-10 w-10 shrink-0 text-red-deep" strokeWidth={2.4} aria-hidden />
          <div className="min-w-0">
            <h2 id="proctor-title" className="font-display text-3xl uppercase leading-none tracking-comic text-ink sm:text-4xl">
              {title}
            </h2>
            <div className="mt-3 space-y-2 text-base font-bold leading-relaxed text-ink-soft">{children}</div>
          </div>
        </div>
        {actions ? <div className="mt-6 flex flex-wrap gap-3">{actions}</div> : null}
      </motion.div>
    </motion.div>
  );
}

export function ProctorShield({ policy, needsFullscreen, locked, disqualified, disqualifiedReason, violations = 0, lastFlag, onEnterFullscreen, onDismissFlag }) {
  const reduce = useReducedMotion();
  if (!policy?.enabled) return null;
  const warn = policy.warnLimit > 0 && violations >= policy.warnLimit;
  const remaining = policy.maxViolations > 0 ? Math.max(0, policy.maxViolations - violations) : null;

  return (
    <>
      <AnimatePresence>
        {disqualified ? (
          <Sheet key="disqualified" icon={Gavel} title="Investigation ended">
            <p>The coordinator has ended your investigation after an integrity review.</p>
            {disqualifiedReason ? <p className="border-3 border-ink bg-red-light p-3 text-sm">Reason given: {disqualifiedReason}</p> : null}
            <p className="text-sm">Everything you solved is kept on record. Speak to your coordinator if you think this is wrong.</p>
          </Sheet>
        ) : locked ? (
          <Sheet key="locked" icon={Lock} title="Session on hold">
            <p>Your investigation is paused for an exam-integrity review. Nothing you have solved is lost.</p>
            <p>Raise your hand — the coordinator can release it from the command centre.</p>
          </Sheet>
        ) : needsFullscreen ? (
          <Sheet
            key="fullscreen"
            icon={Maximize}
            title="Full screen required"
            actions={
              <Button size="lg" variant="danger" icon={Maximize} onClick={onEnterFullscreen}>
                Return to full screen
              </Button>
            }
          >
            <p>This investigation runs in full screen. The case files are hidden until you go back.</p>
            <p className="text-sm">Leaving full screen, switching tabs and pasting are recorded and shown to your coordinator.</p>
          </Sheet>
        ) : null}
      </AnimatePresence>

      {/* the tally, once anything has been recorded */}
      {violations > 0 ? (
        <div className="pointer-events-none fixed bottom-3 left-3 z-[70] sm:bottom-4 sm:left-4">
          <span
            className={cn(
              'inline-flex items-center gap-2 border-3 px-3 py-1.5 font-display text-sm uppercase tracking-comic shadow-comic-sm',
              warn ? 'border-ink bg-red text-white' : 'border-ink bg-yellow text-ink',
            )}
          >
            <Eye className="h-4 w-4" strokeWidth={2.6} aria-hidden />
            {violations} flag{violations === 1 ? '' : 's'} recorded
            {remaining !== null ? ` · ${remaining} left` : ''}
          </span>
        </div>
      ) : null}

      {/* what was just recorded — brief, dismissible, never blocking */}
      <AnimatePresence>
        {lastFlag && FLAG_TEXT[lastFlag.type] ? (
          <motion.button
            key={`${lastFlag.type}-${lastFlag.at}`}
            type="button"
            onClick={onDismissFlag}
            initial={reduce ? false : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
            className="fixed left-1/2 top-3 z-[75] max-w-[min(92vw,30rem)] -translate-x-1/2 border-3 border-ink bg-red text-left text-white shadow-comic-lg"
          >
            <span className="flex items-start gap-2 px-4 py-2.5 text-sm font-bold">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2.6} aria-hidden />
              <span>
                {FLAG_TEXT[lastFlag.type]}
                <span className="mt-0.5 block text-xs font-bold text-white/80">Tap to dismiss</span>
              </span>
            </span>
          </motion.button>
        ) : null}
      </AnimatePresence>

      {/* announced to assistive tech without stealing focus */}
      <span className="sr-only" role="status" aria-live="polite">
        {lastFlag && FLAG_TEXT[lastFlag.type] ? FLAG_TEXT[lastFlag.type] : ''}
      </span>
    </>
  );
}
