import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { ArrowRight, Clock3 } from 'lucide-react';
import { Logo, LogoMark } from '../components/Logo.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Burst, Bubble } from '../components/ui/Misc.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { EVENT_STATUS_META } from '../data/constants.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useEvent } from '../contexts/EventContext.jsx';
import { stagger, panelIn, pop } from '../animations/variants.js';

/*
 * The cover, and nothing else — one screen, one way in.
 *
 * The story so far, the six files, the rules and the walkthrough all used to
 * be spelled out down this page; the intro film (client/public/intro.mp4,
 * played on sign-in) tells all of it now. What is left is a comic cover:
 * the issue line, the masthead, the case name, the hook, and the door.
 *
 * Everything here is said once. The masthead is a LogoMark, not a Logo, so
 * the cover art is not also a dead link to the page you are already on; the
 * nav wordmark is `compact` because the issue line is two inches below it;
 * and there is a single call to action, because every link on this page goes
 * to the same place. The two things a first-time visitor actually needs to
 * know — that beginner SQL is enough, and that the credentials come from
 * their coordinator — sit under that button instead of in footer small print.
 *
 * Sizing: the composition is centred as one block (`justify-center` over two
 * `auto` columns) rather than spread to the edges, and every size is clamped
 * against `vmin` — not `vw`, or a wide-but-short window would push the button
 * off the bottom. Each clamp is tuned to land on its old value at 1440x900, so
 * the cover shrinks to fit a 768-high laptop and grows into a 1080-high one.
 * The rhythm is one step; the masthead frame is `block w-fit` rather than
 * `inline-block`, which as an inline box sat on a text baseline and carried
 * the font's descender under it.
 *
 * Motion: a load sweep, then the page keeps breathing. The speed lines turn
 * and the masthead tilts in 3D under the pointer. The burst is the exception —
 * it holds perfectly still and only reacts to a cursor actually over it. Note the nesting on the speed lines — Framer writes
 * `transform` wholesale, so the parallax has to sit on a wrapper or it wipes
 * the CSS rotation the moment you move the mouse. Transform and opacity only,
 * and every bit of it is skipped under prefers-reduced-motion.
 */

/*
 * The evidence feed: two rows that scroll past each other forever. The top row
 * is the investigation database exactly as a participant will meet it — the
 * six tables of BLACK_CIPHER_DATASET — and the bottom row is the shape of the
 * case, every figure taken from case.js: twelve people of interest, the
 * 09:45-09:58 window, six files, one hour.
 *
 * Each row is rendered twice and shifted by -50%, which is what makes the
 * loop seamless; the second copy is aria-hidden so it is not read out twice.
 */
/* What he says to you, on a loop. He is a colleague, not a mascot. */
const CHAT = [
  'Are you ready?',
  "I've pulled every log. The rest is yours.",
  'Twelve suspects. One hour. No pressure.',
  "Ask the database anything — it can't lie.",
  'Still here? The case will not solve itself.',
];

/*
 * The analyst panel. The artwork (public/cover/analyst.webp) is the supplied
 * illustration, untouched — his linework, face, hoodie, desk, monitor and the
 * cream halftone are exactly as drawn, and the framing is locked: no zoom, no
 * pan, no crop drift.
 *
 * What moves is light, never the drawing. A soft bloom breathes over the
 * monitor, a refresh sweep travels down the glass on the terminal's own line
 * angle, the panel flashes now and then as the interface
 * redraws, and a little of that light lands on his face. All of it is opacity
 * and transform over the top of a static image, all of it loops seamlessly,
 * and all of it is dropped under prefers-reduced-motion.
 *
 * Positions below are fractions of the 986x520 artwork, measured off it:
 * the screen sits at x 53.2-92.1%, y 24-69.2%; his face is around 41%, 34%.
 */
const INK = '#141414';

const SCREEN = { left: '53.45%', top: '20.19%', width: '37.12%', height: '50%' };

/*
 * Comic flick marks — the little inked slivers you draw beside a hand to say
 * it is moving fast. His fingers cannot move (the artwork is a flat image), so
 * the typing is told the way a comic tells it: two clusters above his hands,
 * flashing out of phase at tap speed.
 *
 * Coordinates are artwork pixels: the overlay carries viewBox "0 0 986 520"
 * and the panel's aspect ratio is the artwork's, so they land exactly. His
 * hands sit at roughly (524, 389) and (604, 395) — measured off the drawing.
 */
const flick = (cx, cy, deg, len, w) => {
  const a = (deg * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const px = (-uy * w) / 2;
  const py = (ux * w) / 2;
  return `M${cx + px} ${cy + py} L${cx + ux * len} ${cy + uy * len} L${cx - px} ${cy - py} Z`;
};

/*
 * The monitor runs a live SQL investigation terminal: lines arrive at the
 * bottom, the stack scrolls up one row, and a cursor blinks on the newest
 * line — endlessly.
 *
 * Fitting it to the screen. The screen is a keystone, not a rectangle: its
 * corners (found by scanning the artwork for the bezel-to-screen colour
 * transition, not traced by eye) are (527,160) (893,105) (893,365) (527,345),
 * so the top edge runs -8.55deg while the bottom runs +3.2deg. No single skew
 * can sit on both, which is why the text used to splay away from the bezel.
 * Instead the block is mapped onto the screen's actual plane by the homography
 * that carries a 366x205 rectangle onto those four corners — so lines near the
 * top take the top edge's angle, lines near the bottom take the bottom's, and
 * the type grows toward the viewer exactly as the monitor does. SCALE tracks
 * the panel so the whole thing stays put at any viewport.
 */
const SCREEN_QUAD = 'polygon(53.45% 30.77%, 90.57% 20.19%, 90.57% 70.19%, 53.45% 66.35%)';

/** The homography that lays a 366x205 page onto the glass. */
const SRC = { w: 366, h: 205 };
const PLANE = { a11: 0.296185, a12: -0.233029, a13: -0.000788, a21: 0, a22: 0.902439, a23: 0, a31: 527, a32: 160 };
const planeMatrix = (k) => `matrix3d(${k * PLANE.a11}, ${k * PLANE.a12}, 0, ${PLANE.a13}, ${k * PLANE.a21}, ${k * PLANE.a22}, 0, ${PLANE.a23}, 0, 0, 1, 0, ${k * PLANE.a31}, ${k * PLANE.a32}, 0, 1)`;
const ROWS = 12;

const SCRIPT = [
  ['q', 'SELECT * FROM investigation_logs;'],
  ['dim', 'Query executing...'],
  ['val', '{n} records retrieved'],
  ['q', 'SELECT user_id FROM access_logs;'],
  ['dim', 'Searching records...'],
  ['hit', 'MATCH FOUND'],
  ['q', 'SELECT * FROM system_events;'],
  ['dim', 'Processing...'],
  ['val', '{e} events detected'],
  ['dim', 'Analyzing relationships...'],
  ['ok', 'Query completed successfully'],
  ['ts', '[{t}] scan cycle complete'],
  ['q', 'SELECT door_name FROM access_logs;'],
  ['dim', 'Joining 3 tables...'],
  ['val', '{r} rows matched'],
  ['dim', 'Searching next record...'],
];

const TONE = { q: '#7fe3ff', dim: '#6f8ba0', val: '#e8eefc', hit: '#ff5f57', ok: '#4ade80', ts: '#8a7fb8' };

/** Deterministic, so the stream never repeats too obviously. */
const makeRow = (i) => {
  const [tone, tpl] = SCRIPT[i % SCRIPT.length];
  const secs = (i * 7) % 60;
  const mins = 45 + Math.floor(((i * 7) % 780) / 60);
  const text = tpl
    .replace('{n}', (1284 + ((i * 137) % 900)).toLocaleString('en-US'))
    .replace('{e}', String(11 + ((i * 13) % 80)))
    .replace('{r}', String(3 + ((i * 29) % 140)))
    .replace('{t}', `09:${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
  return { id: i, tone, text };
};

/*
 * Steam off the mug. The rim sits at artwork y=376 spanning x 852-930; above it
 * the background is cream on the right and the monitor's dark bezel on the
 * left, so each wisp is drawn twice — a cream stroke under an ink one — and
 * reads on either. The three curl up on staggered loops so the column never
 * pulses in unison.
 */
const STEAM = [
  { d: 'M870 374 c -7 -12 6 -17 -1 -29 c -6 -11 4 -16 0 -24', delay: 0 },
  { d: 'M891 372 c 8 -13 -5 -18 2 -31 c 6 -12 -3 -18 1 -27', delay: 0.95 },
  { d: 'M912 375 c -7 -11 5 -16 -1 -27 c -5 -10 4 -15 0 -22', delay: 1.9 },
];

/*
 * One hand up while the other is down, for ever. The left hand rises less than
 * the right — an even pair of lifts reads as a mechanism, an uneven one reads
 * as a person. The easing is a sine curve rather than the default ease-in-out,
 * so the turn at the top and bottom of each stroke has no corner in it.
 */
const HAND_CYCLE = 0.8;
const HAND_EASE = [0.37, 0, 0.63, 1];
const HANDS = [
  { mask: 'radial-gradient(ellipse 5.5% 6% at 51.7% 73.7%, #000 40%, transparent 100%)', lift: [0, -2.3, 0] },
  { mask: 'radial-gradient(ellipse 5.5% 6.5% at 61.4% 75%, #000 40%, transparent 100%)', lift: [-3.4, 0, -3.4] },
];

const TAPS = [
  { at: [488, 360], marks: [[-158, 20, 6], [-131, 26, 7], [-104, 17, 5]] },
  { at: [663, 389], marks: [[-42, 18, 5], [-19, 25, 7], [3, 16, 5]] },
];

function Analyst() {
  const reduce = useReducedMotion();
  const [line, setLine] = useState(0);

  useEffect(() => {
    if (reduce) return undefined;
    const t = setInterval(() => setLine((n) => (n + 1) % CHAT.length), 3600);
    return () => clearInterval(t);
  }, [reduce]);

  const panelRef = useRef(null);
  const [scale, setScale] = useState(0.54);

  useEffect(() => {
    const el = panelRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / 986)); // that box IS 986 artwork px wide
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [rows, setRows] = useState(() => Array.from({ length: ROWS }, (unused, i) => makeRow(i)));

  useEffect(() => {
    if (reduce) return undefined;
    const t = setInterval(() => setRows((prev) => [...prev.slice(1), makeRow(prev[prev.length - 1].id + 1)]), 620);
    return () => clearInterval(t);
  }, [reduce]);

  const loop = (keyframes, duration, delay = 0) => (reduce
    ? undefined
    : { ...keyframes, transition: { duration, delay, repeat: Infinity, ease: 'easeInOut' } });

  return (
    <div className="relative"
      style={{ width: 'clamp(17rem, min(max(70vmin, 42vw), min(100vw, 100rem) - 40rem - 6vmin), 52rem)' }}>
      {/* he speaks to you, and the line changes on its own */}
      <motion.div
        key={line}
        initial={reduce ? false : { opacity: 0, scale: 0.7, y: -10, rotate: 3 }}
        animate={{ opacity: 1, scale: 1, y: 0, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 520, damping: 22 }}
        style={{ right: '53%', bottom: 'calc(100% - 16px)' }}   // tail drops onto his hair; the body clears the frame
        className="bubble bubble-left absolute z-30 max-w-[min(21rem,48%)] px-4 py-2.5"
        aria-live="polite"
      >
        <p className="text-[clamp(1.05rem,2.35vmin,1.7rem)] font-bold leading-snug">{CHAT[line]}</p>
      </motion.div>

      {/* The artwork carries its own comic frame — 11px left, 29px right, 14px
          top, 43px bottom (the heavier right and bottom are its drawn drop
          shadow). Left in, it doubled against this panel's own ink border and
          the edges read as a mess. So the panel takes the illustration's own
          aspect and the art sits in an inner box pushed out past all four
          edges, where overflow-hidden trims the frame off. Every overlay lives
          in that box too, so all the artwork-pixel coordinates still hold. */}
      <div className="relative isolate aspect-[946/463] overflow-hidden border-3 border-ink shadow-comic-lg">
        <div
          ref={panelRef}
          className="absolute"
          style={{ left: '-1.1628%', top: '-3.0238%', width: '104.228%', height: '112.311%' }}
        >
        <img
          src="/cover/analyst.webp"
          alt="The analyst at his workstation, working the case"
          draggable={false}
          className="absolute inset-0 h-full w-full select-none object-cover"
        />

        {/* the monitor breathes */}
        <motion.div
          aria-hidden
          style={{ ...SCREEN, background: 'radial-gradient(closest-side, rgba(43,191,230,0.85), rgba(43,191,230,0) 70%)' }}
          className="pointer-events-none absolute z-10 blur-xl mix-blend-screen"
          initial={{ opacity: 0.18 }}
          animate={loop({ opacity: [0.14, 0.34, 0.14] }, 3.4)}
        />

        {/* …and now and then it redraws */}
        <motion.div
          aria-hidden
          style={{ ...SCREEN, background: 'radial-gradient(closest-side, rgba(229,50,45,0.7), rgba(229,50,45,0) 72%)' }}
          className="pointer-events-none absolute z-10 blur-2xl mix-blend-screen"
          initial={{ opacity: 0 }}
          animate={loop({ opacity: [0, 0, 0.32, 0, 0] }, 7.2)}
        />

        {/* a little of that light reaches his face */}
        <motion.div
          aria-hidden
          style={{ left: '41%', top: '34%', width: '26%', height: '34%', transform: 'translate(-50%, -50%)', background: 'radial-gradient(closest-side, rgba(180,235,255,0.6), rgba(180,235,255,0) 70%)' }}
          className="pointer-events-none absolute z-10 blur-2xl mix-blend-screen"
          initial={{ opacity: 0.08 }}
          animate={loop({ opacity: [0.06, 0.2, 0.06] }, 3.4, 0.25)}
        />

        {/* the terminal, lying on the screen's own plane */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-[14]" style={{ clipPath: SCREEN_QUAD }}>
          <div className="absolute inset-0" style={{ background: '#06101b', opacity: 0.985 }} />
          <div
            className="absolute left-0 top-0 overflow-hidden"
            style={{ width: SRC.w, height: SRC.h, transformOrigin: '0 0', transform: planeMatrix(scale) }}
          >
            <div className="absolute inset-x-0 bottom-[9px] px-[11px]">
              <motion.div
                key={rows[rows.length - 1].id}
                initial={reduce ? false : { y: `${100 / ROWS}%` }}
                animate={{ y: '0%' }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                {rows.map((row, i) => (
                  <p
                    key={row.id}
                    className="whitespace-pre font-mono leading-[1.42] tracking-tight"
                    style={{ color: TONE[row.tone], fontSize: '11px', opacity: i === 0 ? 0.3 : 1 }}
                  >
                    {row.tone === 'q' ? '> ' : '  '}
                    {row.text}
                    {i === rows.length - 1 ? (
                      <motion.span
                        className="ml-[3px] inline-block align-middle"
                        style={{ width: 7, height: 9, background: '#7fe3ff' }}
                        animate={reduce ? { opacity: 0.9 } : { opacity: [1, 1, 0, 0] }}
                        transition={reduce ? undefined : { duration: 0.9, repeat: Infinity, ease: 'linear' }}
                      />
                    ) : null}
                  </p>
                ))}
              </motion.div>
            </div>

            {/* the refresh sweep rides the same plane, over the text */}
            <motion.div
              className="absolute inset-x-0 h-[18px] bg-gradient-to-b from-transparent via-cyan/40 to-transparent mix-blend-screen"
              initial={{ top: -24 }}
              animate={reduce ? undefined : { top: [-24, SRC.h] }}
              transition={reduce ? undefined : { duration: 4.6, repeat: Infinity, ease: 'linear' }}
            />
          </div>
        </div>

        {/* The hands alternate: one lifts while the other strikes, and back.
            Each is a copy of the drawing masked to that hand alone — centres
            (510,383) and (605,390) in artwork pixels, the pair divided at
            x=558 — feathered so the move never shows a seam. They share the
            0.72s cycle the flick marks run on, half a beat apart. */}
        {HANDS.map((hand) => (
          <motion.div
            key={hand.mask}
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[12] bg-cover bg-center"
            style={{ backgroundImage: 'url(/cover/analyst.webp)', WebkitMaskImage: hand.mask, maskImage: hand.mask }}
            animate={reduce ? undefined : { y: hand.lift }}
            transition={reduce ? undefined : { duration: HAND_CYCLE, times: [0, 0.5, 1], repeat: Infinity, ease: HAND_EASE }}
          />
        ))}

        {/* he is typing: the flicks tap out of phase, endlessly */}
        <svg viewBox="0 0 986 520" aria-hidden className="pointer-events-none absolute inset-0 z-20 h-full w-full">
          {STEAM.map((wisp) => (
            <g
              key={wisp.delay}
              style={{
                transformOrigin: '891px 376px',
                opacity: reduce ? 0.5 : 0,
                animation: reduce ? undefined : `steamRise 2.9s ease-out ${wisp.delay}s infinite`,
              }}
            >
              <path d={wisp.d} fill="none" stroke="#fbf6e9" strokeWidth="5.5" strokeLinecap="round" />
              <path d={wisp.d} fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
            </g>
          ))}

          {TAPS.map((cluster, c) => (
            <motion.g
              key={cluster.at.join()}
              initial={{ opacity: 0 }}
              animate={reduce ? { opacity: 0.85 } : { opacity: [0, 1, 0.9, 0], scale: [0.65, 1, 1, 0.8] }}
              transition={reduce ? undefined : { duration: 0.3, repeat: Infinity, repeatDelay: HAND_CYCLE - 0.3, delay: c * (HAND_CYCLE / 2), ease: 'easeOut' }}
              style={{ transformOrigin: `${cluster.at[0]}px ${cluster.at[1]}px` }}
            >
              {cluster.marks.map(([deg, len, w]) => {
                const d = flick(cluster.at[0], cluster.at[1], deg, len, w);
                return (
                  <g key={deg}>
                    <path d={d} fill="#fbf6e9" stroke="#fbf6e9" strokeWidth="5" strokeLinejoin="round" />
                    <path d={d} fill={INK} stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
                  </g>
                );
              })}
            </motion.g>
          ))}
        </svg>
        </div>
      </div>
    </div>
  );
}

/** The case name lands harder than the line above it. */
const slam = {
  hidden: { opacity: 0, scale: 1.24, rotate: 2.5, y: -18 },
  show: { opacity: 1, scale: 1, rotate: 0, y: 0, transition: { type: 'spring', stiffness: 520, damping: 17 } },
};

export default function Landing() {
  useDocumentTitle('');
  const reduce = useReducedMotion();
  const { status, isLive, isOver, isPreStart } = useEvent();
  const live = isLive;

  // the masthead carries the one thing the cover cannot: whether it is running now
  const meta = EVENT_STATUS_META[status] || EVENT_STATUS_META.unknown;
  const statusLabel = isLive ? 'Live now' : isOver ? 'Closed' : isPreStart ? 'Not started' : meta.label;
  const statusTone = isLive ? 'green' : isOver ? 'crimson' : 'neutral';

  // pointer position, -0.5 … 0.5, sprung so everything drifts instead of snapping
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 50, damping: 18, mass: 0.7 });
  const sy = useSpring(my, { stiffness: 50, damping: 18, mass: 0.7 });
  const tiltY = useTransform(sx, (v) => v * 14);        // masthead, turning to follow you
  const tiltX = useTransform(sy, (v) => v * -11);
  const linesX = useTransform(sx, (v) => v * 34);       // the speed lines lag furthest behind
  const linesY = useTransform(sy, (v) => v * 24);

  const track = reduce
    ? undefined
    : (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      mx.set((e.clientX - r.left) / r.width - 0.5);
      my.set((e.clientY - r.top) / r.height - 0.5);
    };
  const release = reduce ? undefined : () => { mx.set(0); my.set(0); };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <header className="relative shrink-0">
        {/* The masthead. It only gets taller on a TALL viewport — at 900px high the
            cover has 12px of headroom to give, at 1080 it has 160. */}
        <nav className="relative z-20 mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-8 [@media(min-height:960px)]:h-20">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <Logo compact size="masthead" />
            <span className="hidden h-11 w-[3px] shrink-0 bg-ink sm:block [@media(min-height:960px)]:h-12" aria-hidden />
            <div className="hidden sm:block">
              <p className="label leading-none">The investigation</p>
              <Badge tone={statusTone} pulse={isLive} className="mt-1.5">
                {statusLabel}
              </Badge>
            </div>
          </div>
          <Button to="/login" size="md" variant="outline" className="[@media(min-height:960px)]:h-12 [@media(min-height:960px)]:px-5 [@media(min-height:960px)]:text-xl">
            Sign in
          </Button>
        </nav>
      </header>

      <section
        onMouseMove={track}
        onMouseLeave={release}
        className="relative isolate flex flex-1 items-center overflow-hidden border-t-5 border-ink bg-red"
      >
        <div className="dots-white absolute inset-0 opacity-70" aria-hidden />

        {/* one pass of light across the page as it lands */}
        {reduce ? null : (
          /* Two levels, and it has to be: with the skew and the travel on one
             element, Framer's `x` replaces `transform` wholesale and the rake
             never renders — the sweep came across as a straight-edged bar. The
             wrapper holds the skew, the child does the travelling. */
          <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-[36%] -skew-x-12" aria-hidden>
            <motion.div
              initial={{ x: '-60%', opacity: 0 }}
              animate={{ x: '160%', opacity: [0, 0.55, 0] }}
              transition={{ duration: 1.5, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="h-full w-full bg-gradient-to-r from-transparent via-white to-transparent mix-blend-overlay"
            />
          </div>
        )}

        <div className="cover-block relative z-10 mx-auto grid w-full max-w-[100rem] justify-end gap-x-[clamp(2rem,6vmin,5.5rem)] gap-y-8 px-4 py-[clamp(1rem,3.2vmin,3rem)] sm:px-8 lg:grid-cols-[auto_auto] lg:items-end">
          <motion.div variants={stagger(0.12, 0.1)} initial="hidden" animate="show" className="space-y-[clamp(0.85rem,2vmin,1.6rem)]" style={{ perspective: 1000 }}>
            <motion.div variants={pop} className="relative z-10 inline-flex origin-left items-center gap-3">
              <span className="caption-white text-[clamp(1.05rem,2.2vmin,1.65rem)]">Issue #1</span>
              <span className="caption text-[clamp(1.05rem,2.2vmin,1.65rem)]">Sept 2045</span>
            </motion.div>

            <motion.div variants={panelIn} className="relative block w-fit">
              {/* the speed lines radiate from behind the masthead, so the
                  vanishing point sits under the logo instead of off in the
                  corner. Three levels on purpose: the outer div centres it,
                  the middle one takes the parallax, the inner one spins —
                  Framer writes `transform` wholesale and would wipe either.

                  The disc itself is the sign-in page's: `.speed-field`, which
                  is 48s rather than the old 24s, and radially masked to nothing
                  at its rim. Both changes earn their place here.

                  135vmin measured against the SMALLER axis, so on a wide window
                  it stopped well short: at 1920x980 the disc was 1323px wide
                  with its right edge at x=1194, leaving 726px of hero with no
                  spokes at all (457px bare at 1440x900, 516px at 1280x720).
                  118vmax tracks the LARGER axis instead and covers the hero at
                  every size measured, and the mask means that where it does
                  end, it ends in nothing rather than an edge.

                  Halving the speed matters more here than on the sign-in page,
                  because this disc is wider than the screen and a 24s
                  revolution drags a lot of ink past the eye. */}
              <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2" aria-hidden>
                <motion.div style={{ x: linesX, y: linesY }}>
                  <div className="speed-field h-[118vmax] w-[118vmax] bg-action-lines opacity-[0.22]" />
                </motion.div>
              </div>
              <motion.div
                style={{ rotateX: tiltX, rotateY: tiltY, transformPerspective: 1000 }}
                className="lift block w-fit border-5 border-ink bg-white p-4 shadow-comic-xl sm:p-5"
              >
                <LogoMark className="cover-masthead max-w-[clamp(240px,45vmin,560px)]" />
              </motion.div>
            </motion.div>

            <motion.h1 variants={stagger(0.14, 0)} className="relative z-10 font-display text-[clamp(2.5rem,8vmin,6.5rem)] uppercase leading-[0.9] tracking-comic text-white text-shadow-comic">
              <motion.span variants={panelIn} className="block">Operation:</motion.span>
              <motion.span variants={slam} className="block origin-left">Black Cipher</motion.span>
            </motion.h1>

            <motion.div variants={panelIn} className="relative z-10">
              <Bubble className="max-w-xl">
                <p className="text-[clamp(0.95rem,2vmin,1.45rem)] font-bold leading-snug">The world&apos;s most advanced AI prototype has vanished from NovaTech Research Institute. No forced entry. No broken glass. Just a database, and thirteen minutes to account for.</p>
              </Bubble>
            </motion.div>

            <motion.div variants={panelIn} className="relative z-10 space-y-2">
              <Button to="/login" size="lg" iconRight={ArrowRight}>
                {live ? 'Join the investigation' : 'Open the case'}
              </Button>
              <p className="max-w-md text-[clamp(0.9rem,1.8vmin,1.25rem)] font-bold leading-snug text-white">
                Beginner SQL is enough. Sign in with the investigator ID your coordinator issued.
              </p>
              <p className="flex max-w-md items-start gap-2 text-[clamp(0.85rem,1.7vmin,1.15rem)] font-bold leading-snug text-yellow">
                <Clock3 className="mt-[0.15em] h-[1em] w-[1em] shrink-0" strokeWidth={2.75} aria-hidden />
                <span>Your hour starts when you open the case — not a second before.</span>
              </p>
            </motion.div>
          </motion.div>

          <div className="relative z-10 flex flex-col items-center gap-[clamp(1.5rem,4vmin,3rem)] lg:items-end lg:self-stretch lg:justify-between lg:gap-0">
            <motion.div
              initial={reduce ? false : { opacity: 0, scale: 0.5, rotate: 20 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.5 }}
              whileHover={reduce ? undefined : { scale: 1.07, rotate: -4 }}
              className="group relative mt-0 lg:mt-[clamp(1.25rem,7vmin,4.5rem)]"
            >
              <Burst size="lg" tone="yellow" tilt={-8} className="cover-burst">
                <span className="flex flex-col items-center leading-none">
                  <span className="block text-[clamp(3.25rem,15vmin,12rem)] leading-none">SQL!</span>
                  <span className="mt-1 block font-body text-[clamp(0.85rem,2.1vmin,1.5rem)] font-bold normal-case tracking-normal">is your only lead</span>
                </span>
              </Burst>
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1, type: 'spring', stiffness: 400, damping: 14 }} className="caption-blue absolute -bottom-4 -left-5 rotate-[-8deg] text-[clamp(1.05rem,2.5vmin,1.9rem)] sm:-bottom-7 sm:-left-8">
                One hour!
              </motion.span>
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.15, type: 'spring', stiffness: 400, damping: 14 }} className="caption-white absolute -right-6 -top-7 rotate-[6deg] text-[clamp(1.05rem,2.5vmin,1.9rem)]">
                One truth!
              </motion.span>
            </motion.div>

            {/* he works away at his desk, and talks to you while he does */}
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 20, rotate: -1.5 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22, delay: 1.2 }}
              className="hidden w-fit lg:block"
            >
              <Analyst />
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
}
