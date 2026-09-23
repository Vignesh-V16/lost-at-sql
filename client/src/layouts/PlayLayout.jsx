import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { CirclePause, Radio, Flag, Hourglass, LogOut } from 'lucide-react';
import { Logo } from '../components/Logo.jsx';
import { Timer } from '../components/Timer.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { ConnectionStatus } from '../components/ConnectionStatus.jsx';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';
import { ProctorShield } from '../components/play/ProctorShield.jsx';
import { useProctor } from '../hooks/useProctor.js';
import { investigationApi } from '../services/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useEvent } from '../contexts/EventContext.jsx';
import { useSession } from '../contexts/SessionContext.jsx';
import { EVENT_STATUS_META } from '../data/constants.js';
import { cn } from '../utils/cn.js';

/*
 * PlayLayout — the participant's chrome: ONE paper masthead. Identity on
 * the left, the clock and the door on the right; while the coordinator has
 * stopped the clock (or the event is over) an ink stamp — FROZEN / CLOSED —
 * is pressed over the clock's corner, and the word itself is a burst pinned
 * in the section rail below (Investigate.jsx), not a slab across the page.
 * Investigate hangs its own two rows off this one: the
 * section rail, stuck to it and welded 5px over its rule (`.play-chrome`
 * in index.css), and the case-file folder tabs hanging off that seam into
 * the red. No sidebar; the investigation is a single page.
 *
 * `--masthead` is this header's live border-box height (69px at h-16,
 * 85px on a window taller than 960px), written to <html> by a
 * ResizeObserver so the rail below always sticks exactly under it; the two
 * numbers also live as fallbacks in index.css for a browser without it.
 */
function TopBar() {
  const reduce = useReducedMotion();
  const { user, logout } = useAuth();
  const { status } = useEvent();
  const { session } = useSession();
  const headRef = useRef(null);
  useEffect(() => {
    const el = headRef.current;
    if (!el) return undefined;
    const root = document.documentElement;
    const write = () => root.style.setProperty('--masthead', `${el.offsetHeight}px`);
    write();
    if (typeof ResizeObserver === 'undefined') return () => root.style.removeProperty('--masthead');
    const ro = new ResizeObserver(write);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--masthead');
    };
  }, []);
  const meta = EVENT_STATUS_META[status] || EVENT_STATUS_META.unknown;
  const caseStatus = session?.status === 'completed' ? 'Case closed' : session?.status === 'time_expired' ? 'Time up' : status === 'live' ? (session ? 'Investigating' : 'Live') : meta.label;
  const tone = session?.status === 'completed' ? 'violet' : session?.status === 'time_expired' ? 'crimson' : meta.tone;
  /* The clock visibly freezes. While the coordinator holds the event
     (FROZEN — the same test the Timer uses for its own `paused`) the chip
     frosts over — cyan-light ice under a cyan Ben-Day field (.clock-paused)
     — and once it is over (CLOSED) it goes paper-3, a dead instrument
     (.clock-closed); in both the pause glyph stops blinking and, from lg,
     the chip widens with its digits at the left end so a red-deep rubber
     stamp lands on the flat field at its top right, clear of the digits and
     the gauge (.clock-frozen). The word itself is the burst in the rail
     below (Investigate.jsx); this is the instrument showing the same
     fact. */
  const stamp = (!session || session.status === 'active') && status === 'paused' ? 'Frozen' : status === 'ended' || status === 'archived' ? 'Closed' : null;
  return (
    <header ref={headRef} className="paper-strip sticky top-0 z-30 border-b-5 border-ink">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-4 px-3 sm:px-6 [@media(min-height:960px)]:h-20">
        {/* the wordmark rocks the way the sign-in title does — on its own
            static span, never on the Link (whose image owns the hover
            rotate), and only without reduced motion */}
        <span className={cn('inline-flex', !reduce && 'ink-sway')}>
          <Logo compact size="masthead" />
        </span>
        <div className="hidden items-center gap-5 md:flex">
          <div>
            <p className="label">Investigator</p>
            <p className="max-w-[12rem] truncate font-display text-xl uppercase leading-none tracking-comic">{user?.displayName}</p>
          </div>
          <div>
            <p className="label">Status</p>
            <Badge tone={tone} pulse={status === 'live' && session?.status === 'active'} className="mt-0.5">
              {caseStatus}
            </Badge>
          </div>
          {session ? (
            <>
              <div>
                <p className="label">Score</p>
                <p className="font-display text-2xl leading-none tabular">{session.score}</p>
              </div>
              <div>
                <p className="label">Files</p>
                <p className="font-display text-2xl leading-none tabular">
                  {session.completedCount} <span className="text-ink-faint">/ {session.totalCount}</span>
                </p>
              </div>
            </>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {session ? <span className="font-display text-xl md:hidden">{session.score}</span> : null}
          <span className="relative inline-flex">
            {/* the event's clock until a session exists — the same choice the
                waiting room makes, so the two never disagree */}
            <Timer source={session ? 'session' : 'event'} size="sm" showLabel={false} className={cn('bar-clock', stamp && 'clock-frozen', stamp === 'Frozen' && 'clock-paused', stamp === 'Closed' && 'clock-closed')} />
            {stamp ? (
              /* Three levels, the sign-in page's CLEARED construction: this
                 span owns the position, the motion span owns the press-in
                 (JS-gated), and the stamp its own tilt — `-rotate-3`, a
                 utility, replaces .stamp's -6deg so the raised corner stays
                 off the chip's ink border. aria-hidden: the Timer's label
                 already says "Paused at 57:35". right-1 / top-1.5 put the
                 ~73x26 stamp in the flat field .clock-frozen opens to the
                 right of the digits on the 50px chip: its raised corner lands
                 at y 4 (on the fill, just under the 3px border) and its
                 lowest at y 34, three clear of the gauge at 37. Red-deep is
                 5.8:1 on the frost and 7.2:1 on paper-3; .stamp-light thins
                 the rubber grain so 16px lettering stays whole. Hidden below
                 lg, where the chip keeps its 122px and has no flat field. */
              <span className="pointer-events-none absolute right-1 top-1.5 z-10 hidden lg:block" aria-hidden>
                <motion.span
                  initial={reduce ? false : { opacity: 0, scale: 1.7, rotate: 12 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 700, damping: 26 }}
                  className="block leading-none"
                >
                  <span className="stamp stamp-light -rotate-3 whitespace-nowrap border-red-deep text-base leading-none text-red-deep">{stamp}</span>
                </motion.span>
              </span>
            ) : null}
          </span>
          <button type="button" onClick={logout} title="Sign out" className="inline-flex items-center gap-1.5 border-2 border-ink bg-paper-2 px-2 py-1 font-display text-base uppercase tracking-comic text-ink shadow-comic-sm hover:bg-red hover:text-white">
            <LogOut className="h-4 w-4" strokeWidth={2.5} /> <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}

/*
 * EventGate — what participants see when the event is not live. Once a
 * session exists the page stays readable (results, evidence); mutating
 * actions are refused server-side and surfaced by the page itself.
 */
function EventGate({ children }) {
  const reduce = useReducedMotion();
  const { status } = useEvent();
  const { session } = useSession();
  const location = useLocation();
  const wantsStory = new URLSearchParams(location.search).get('story') === '1';
  if (status === 'live' || status === 'unknown' || wantsStory) return children;
  /* Paused or over with a session in hand: the page stays readable, and
     the notice is two objects in the chrome now — the FROZEN / CLOSED stamp
     on the clock (TopBar) and the rocking caption chip in Investigate's
     sticky section rail — not a band stacked between the masthead and the
     case folder. Investigate is this layout's only child (App.jsx). */
  if (session && (status === 'ended' || status === 'archived' || status === 'paused')) return children;
  const meta =
    {
      draft: { Icon: Hourglass, flip: true, title: 'Waiting for the coordinator', body: 'The investigation has not been opened yet. Stay on this page — it begins on its own.' },
      ready: { Icon: Hourglass, flip: true, title: 'Waiting for the coordinator', body: 'Everything is ready. The investigation begins when the coordinator presses start.' },
      scheduled: { Icon: Hourglass, flip: true, title: 'Scheduled', body: 'The investigation starts automatically at the scheduled time.' },
      paused: { Icon: CirclePause, title: 'Investigation paused', body: 'The coordinator has paused the investigation. Your progress and clock are safe.' },
      ended: { Icon: Flag, title: 'Investigation closed', body: 'This event has ended.' },
      archived: { Icon: Flag, title: 'Investigation archived', body: 'This event has been archived.' },
    }[status] || { Icon: Hourglass, flip: true, title: 'Standby', body: '' };
  const waiting = status === 'draft' || status === 'ready' || status === 'scheduled';
  /*
   * The waiting room is page three of the issue, and it is dressed like the
   * other two: the cover's red field with its white halftone, the same masked
   * speed disc turning behind the panel so every spoke points at the clock, the
   * same one-pass light sweep on arrival, and the panel in the masthead's own
   * frame — border-5 and a 10px hard shadow.
   *
   * The disc is nested exactly as it is on the other two pages: the outer div
   * centres it with a Tailwind translate, the inner one carries the CSS
   * rotation. Framer writes `transform` wholesale, so anything animated on one
   * node would wipe the other.
   */
  return (
    <main className="relative isolate flex flex-1 items-center justify-center overflow-hidden bg-red px-4 py-[clamp(1.5rem,4vmin,3.5rem)] sm:px-8">
      <div className="dots-white absolute inset-0 opacity-70" aria-hidden />

      {reduce ? null : (
        <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-[36%] -skew-x-12" aria-hidden>
          <motion.div
            initial={{ x: '-60%', opacity: 0 }}
            animate={{ x: '160%', opacity: [0, 0.55, 0] }}
            transition={{ duration: 1.5, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="h-full w-full bg-gradient-to-r from-transparent via-white to-transparent mix-blend-overlay"
          />
        </div>
      )}

      <div className="relative z-10 w-full max-w-lg">
        <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2" aria-hidden>
          <div className="speed-field h-[118vmax] w-[118vmax] bg-action-lines opacity-[0.22]" />
        </div>

        {/* Three tiers, and they are the page's own chrome repeated at panel
            scale: printed paper, then the white space where the thing you
            actually watch lives, then printed paper again. The two outer tiers
            carry `paper-strip`, the same cream and Ben-Day grid as the header
            and footer above and below them, so the eye reads one material all
            the way down the page. No overflow-hidden — the caption tab hangs
            over the top edge and would be cut off. */}
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.9, rotate: -2 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          className="relative border-5 border-ink text-center shadow-comic-xl"
        >
          <div className="paper-strip border-b-3 border-ink px-[clamp(1.1rem,3vmin,1.9rem)] pb-[clamp(0.9rem,2.4vmin,1.4rem)] pt-[clamp(1.5rem,3.6vmin,2.2rem)]">
            {/* the glass sits slightly off-square, the way a stamp does */}
            <div className="mx-auto flex h-16 w-16 -rotate-3 items-center justify-center border-3 border-ink bg-yellow shadow-comic">
              <meta.Icon className={`h-8 w-8 text-ink ${meta.flip ? 'sand-flip' : 'animate-floaty'}`} strokeWidth={2.4} aria-hidden />
            </div>
            <h2 className="mt-4 font-display text-[clamp(1.9rem,5vmin,2.75rem)] uppercase leading-none tracking-comic">{meta.title}</h2>
            {meta.body ? <p className="mx-auto mt-2.5 max-w-sm text-base text-ink-soft">{meta.body}</p> : null}
          </div>

          {/* The clock tier is the same paper as the rest of the panel, so the
              time cannot be a box sitting on a box — it becomes the lettering
              itself. `.gate-clock` strips the Timer's frame and redraws the
              digits as comic numerals: yellow fill, a thick ink stroke through
              `paint-order: stroke fill`, and a hard offset shadow, with the
              progress bar left underneath as an ink rule. */}
          <div className={`paper-strip flex justify-center px-[clamp(1.1rem,3vmin,1.9rem)] py-[clamp(1.1rem,3vmin,2rem)] ${waiting ? 'border-b-3 border-ink' : ''}`}>
            <Timer source={session ? 'session' : 'event'} size="lg" className="gate-clock" />
          </div>

          {waiting ? (
            <div className="paper-strip space-y-3 border-t-3 border-ink px-[clamp(1.1rem,3vmin,1.9rem)] py-[clamp(1rem,2.6vmin,1.5rem)]">
              <div>
                {/* the only thing on this screen you can actually do. It sits
                    on the tier's own paper rather than the yellow primary —
                    `subtle` already supplies the frame and shadow, and the two
                    important overrides pin it to the exact panel cream and keep
                    a hover it would otherwise lose to them. */}
                <Button to="/play?story=1" size="sm" variant="subtle" className="!bg-paper-2 hover:!bg-white">
                  Watch the story while you wait
                </Button>
              </div>
              {/* the quiet reassurance goes last: it is a running state, not an
                  action, so it sits under the one thing there is to press */}
              <p className="inline-flex items-center gap-2 font-display text-base uppercase tracking-comic text-ink-soft">
                <Radio className="h-4 w-4 animate-pulse text-blue" strokeWidth={2.5} aria-hidden /> Listening for the coordinator
              </p>
            </div>
          ) : null}
        </motion.div>
      </div>
    </main>
  );
}

/**
 * Exam integrity for every play route: full screen, tab switches, copy and
 * paste, devtools shortcuts. The policy comes from the event, so a
 * coordinator can turn any of it off for a rehearsal. See useProctor for
 * what a browser can and cannot actually see.
 */
function Proctor() {
  const { session, refresh } = useSession();
  const { status: eventStatus } = useEvent();
  /* useParams is empty in a layout: the :code segment belongs to the child route */
  const code = (useLocation().pathname.match(/^\/play\/([^/]+)/)?.[1] || '').toUpperCase();
  const policy = session?.proctor;
  const [tally, setTally] = useState(null); // the server's count, ahead of the next session refresh
  const active = Boolean(policy?.enabled && session && session.status === 'active' && eventStatus !== 'ended');

  const report = useCallback(
    (flag) => {
      investigationApi
        .proctor(flag)
        .then((res) => {
          if (res?.recorded) setTally({ violations: res.violations, locked: res.locked });
          if (res?.locked) refresh();
        })
        .catch(() => {
          /* the record is best-effort: never interrupt the investigation for it */
        });
    },
    [refresh],
  );

  const { needsFullscreen, lastFlag, enterFullscreen: goFullscreen, dismissFlag } = useProctor({ active, policy, report, file: code });
  if (!policy?.enabled) return null;
  return (
    <ProctorShield
      policy={policy}
      needsFullscreen={needsFullscreen}
      locked={Boolean(tally?.locked ?? policy.locked)}
      disqualified={Boolean(policy.disqualified)}
      disqualifiedReason={policy.disqualifiedReason || ''}
      violations={tally?.violations ?? policy.violations ?? 0}
      lastFlag={lastFlag}
      onEnterFullscreen={goFullscreen}
      onDismissFlag={dismissFlag}
    />
  );
}

export default function PlayLayout() {
  const location = useLocation();
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <Proctor />
      {/* <main> lives inside the gate, not around it. The standby screen is a
          full-bleed red field like the cover, and it cannot be that from inside
          a max-w-[1500px] box with its own padding — so the gate returns its
          own <main> and the investigation returns the constrained one. */}
      <EventGate>
        <main className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col px-3 py-6 sm:px-6">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </EventGate>
      <footer className="paper-strip border-t-5 border-ink">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-3 py-2 sm:px-6">
          <p className="font-display text-sm uppercase tracking-comic text-ink-faint">LOST AT SQL · Operation: Black Cipher</p>
          <ConnectionStatus />
        </div>
      </footer>
    </div>
  );
}
