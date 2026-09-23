import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Lock, Folder } from 'lucide-react';
import { cn } from '../../utils/cn.js';

/*
 * The case folder's index tabs, CASE FOLDER · 01 … 05 · FIN, cut as a
 * folder's tabs and hanging off the masthead's seam into the red: each a
 * trapezoid (`.ftab` in index.css — three clip-path layers: ink outline,
 * paper face, and for the open tab an ink shadow), inked on its three free
 * edges with the seam for its top rule, nested 7px into the tab before it
 * so the run reads as one folder's edge with a red notch between tabs.
 * Manila (paper-2) for the closed files; yellow, 4px further out and
 * hard-shadowed for the open one; paper-3 under a faint hatch, a padlock,
 * and inert (a span, not a Link) for the locked ones; a green tick for the
 * completed ones; a red-deep spine label first — from 2xl only, the one
 * width where six 16px titles plus a spine fit the column — decorative and
 * aria-hidden. Which tabs are clickable is decided by the server's status.
 * Every title is text-base and visible at every width.
 *
 * One row that scrolls sideways, never a wrap, so the chrome never grows a
 * second line: `play-band` on the scroll box itself bleeds it to both window
 * edges while its content still starts on main's column (and the end padding
 * is inside the scroll). The open tab is brought into view by setting the
 * box's own scrollLeft — never scrollIntoView, which under the page's
 * `scroll-behavior: smooth` could also nudge the page vertically. pb-1
 * keeps the open tab's 4px shadow inside the scroll box's clip.
 *
 * Stacking: the open tab's wrapper is `relative z-[1]` so its overlap sits
 * on top of both neighbours; the others stack in DOM order, each over the
 * one before it. Motion: one pass on the page's first arrival (`animate`,
 * JS-gated) — the tabs are dealt out left to right, each swinging down out
 * from under the seam (origin-top, a small rotate) a beat after the last;
 * the rail above is positioned, so it paints over them and they read as
 * pulled down out of the masthead. The Framer transform sits on the
 * wrapper; the tab keeps its own 2px hover pull, a CSS transform on another
 * node.
 */
/* The deal-out plays once per page life. PlayLayout keys its ErrorBoundary
   on the pathname, so every file change remounts the page and these tabs;
   without this flag they would re-deal on each of them, ~6 times an hour.
   The flag lives here, not in Investigate, because Investigate also mounts
   for the loader and the Begin stage — before any tab exists — and would
   spend it there. Set in an effect, not the initializer, so StrictMode's
   double render cannot flip it before the first mount reads it. */
let dealt = false;

export function FileTabs({ files = [], currentCode, className }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const [animate] = useState(() => !dealt);
  useEffect(() => {
    dealt = true;
  }, []);
  useEffect(() => {
    const box = ref.current;
    const tab = box?.querySelector('[aria-selected="true"]');
    if (!box || !tab || box.scrollWidth <= box.clientWidth) return;
    const b = box.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    if (t.left < b.left) box.scrollLeft += t.left - b.left - 12;
    else if (t.right > b.right) box.scrollLeft += t.right - b.right + 12;
  }, [currentCode]);
  return (
    <div ref={ref} className={cn('play-band flex items-start overflow-x-auto no-scrollbar pb-1', className)} role="tablist" aria-label="Case files">
      {/* The folder's spine label, first off the seam. Not a tab and not for
          the reader — the tablist is already named "Case files". Its
          responsive display lives on this wrapper: `.ftab`'s own display
          (plain CSS after the utilities) would outrank `hidden`. h-5 on its
          body matches the number chip that sets the tabs' height. */}
      <span className="hidden shrink-0 2xl:inline-flex" aria-hidden>
        <motion.span
          initial={animate && !reduce ? { opacity: 0, y: -18, rotate: -6, scale: 0.92 } : false}
          animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 460, damping: 24, delay: 0.1 }}
          className="inline-flex origin-top"
        >
          <span className="ftab ftab-spine font-display text-base uppercase leading-none tracking-comic text-white">
            <span className="ftab-face" />
            <span className="ftab-body h-5">
              <Folder className="h-4 w-4" strokeWidth={2.6} aria-hidden />
              Case folder
            </span>
          </span>
        </motion.span>
      </span>
      {files.map((f, i) => {
        const locked = f.status === 'locked';
        const done = f.status === 'completed';
        const active = f.code === currentCode;
        const to = f.isFinal ? '/play/final' : `/play/${f.code}`;
        const inner = (
          <>
            <span className="ftab-face" aria-hidden />
            <span className="ftab-body">
              <span className={cn('inline-flex h-5 min-w-5 items-center justify-center border-2 border-ink px-1 font-display text-xs leading-none', done ? 'bg-green-deep text-white' : active ? 'bg-ink text-yellow' : locked ? 'bg-paper-3 text-ink-soft' : f.isFinal ? 'bg-red-deep text-white' : 'bg-white text-ink')}>{done ? <Check className="h-3 w-3" strokeWidth={3.5} aria-hidden /> : f.isFinal ? 'FIN' : String(i + 1).padStart(2, '0')}</span>
              {f.title}
              {locked ? <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden /> : null}
            </span>
          </>
        );
        const cls = cn(
          'ftab font-display text-base uppercase leading-none tracking-comic',
          active ? 'ftab-open text-ink' : locked ? 'ftab-locked cursor-not-allowed text-ink-soft' : done ? 'ftab-done text-ink' : 'ftab-idle text-ink-soft',
        );
        const tab = locked ? (
          <span role="tab" aria-selected={active} aria-disabled className={cls}>
            {inner}
          </span>
        ) : (
          <Link to={to} role="tab" aria-selected={active} className={cls}>
            {inner}
          </Link>
        );
        /* -ml-[7px] nests each tab's top corner into the one before it (the
           first tab only from 2xl, when the spine is there to nest into);
           the open tab's wrapper is z-[1] so its overlap wins both ways. The
           deal-out is a spring on this wrapper, origin-top, so each tab
           swings down out of the seam like a dealt card. */
        return (
          <motion.span
            key={f.code}
            initial={animate && !reduce ? { opacity: 0, y: -18, rotate: -6, scale: 0.92 } : false}
            animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 460, damping: 24, delay: 0.1 + 0.07 * (i + 1) }}
            className={cn('relative inline-flex shrink-0 origin-top', i ? '-ml-[7px]' : '2xl:-ml-[7px]', active && 'z-[1]')}
          >
            {tab}
          </motion.span>
        );
      })}
    </div>
  );
}
