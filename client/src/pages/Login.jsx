import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { KeyRound, ArrowLeft, UserRound, Eye, EyeOff } from 'lucide-react';
import { Logo } from '../components/Logo.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Field.jsx';
import { Badge, Stamp } from '../components/ui/Badge.jsx';
import { Burst, Typewriter } from '../components/ui/Misc.jsx';
import { EVENT_STATUS_META } from '../data/constants.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useEvent } from '../contexts/EventContext.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { errorMessage } from '../utils/errors.js';
import { stagger, pop, panelIn, BOUNCE, SNAP } from '../animations/variants.js';

/*
 * Login — page two of the issue.
 *
 * The cover's red field, white Ben-Day halftone and rotating speed lines run
 * straight through the break; what moves is the vanishing point, from under
 * the masthead to dead behind the sign-in panel, so every ink spoke on the
 * page points at the two fields. The panel wears the masthead's own frame
 * (border-5, shadow-comic-xl) — the white ink-framed rectangle simply crossed
 * the gutter as you turned the page — and the readout inside it is the
 * analyst's monitor, quoted: #06101b glass, mono type, his TONE palette.
 *
 * The panel is the one true rectangle on the page. Everything around it tilts
 * (caption -4deg, burst +8deg, stamp -6deg); a tilted baseline under a
 * password field is a bad joke.
 *
 * Sizing: every dimension is clamped against `vmin`, never `vw` — vw grows
 * type off the width alone, which is exactly when a short window has no room,
 * and the thing that would fall off the bottom here is the submit button. The
 * one `vmax` is the decorative spoke disc, which has to grow with the LARGER
 * axis or its rim shows. `overflow-hidden` sits on the red <main> alone and
 * never on the root: the cover can clip itself because nothing on it is
 * operable, this page cannot, so if the content ever exceeds the viewport the
 * page scrolls rather than hiding the button.
 *
 * Motion: springs for arrivals, one tween for the load sweep. Three transform
 * hazards are handled by nesting (Framer writes `transform` wholesale): the
 * spoke disc (layout div / CSS-rotating div), the CLEARED stamp (static
 * -translate-x-1/2 wrapper / motion scale+rotate / .stamp's own -6deg), and
 * the Denied! burst (motion wrapper / Burst's own rotate(tilt)). Nothing on
 * this page types, stores, autofills, reveals or hints at the access code.
 */

const SEQUENCE = ['Connecting…', 'Checking your ID and code…', 'Everything checks out.', 'Welcome in, investigator!'];
const IDLE_LINE = 'waiting for your ID and code — your hour has not started';

/* The cover's monitor palette, with two tones lifted for legibility: this
   readout is body text someone reads while typing, not background art.
   #8ea9bd is 7.7:1 on the glass and #ff7b74 is 7.5:1; q and ok clear easily. */
const TONE = { q: '#7fe3ff', dim: '#8ea9bd', ok: '#4ade80', hit: '#ff7b74' };

/*
 * A refusal is not one thing, and the page must not tell the player the same
 * story for all of them. Four kinds:
 *
 *   blank       you have not filled it in yet — nobody has refused you
 *   credential  the server looked you up and said no
 *   field       the server would not even read it: wrong shape, named field
 *   reach       nobody answered — dropped wifi, timeout, 500, rate limit
 *
 * Only `credential` may empty the access code. A dropped packet erasing a
 * correctly typed password, under a burst shouting DENIED and a colleague
 * saying the code is not on his list, is three lies at once.
 */
const VERDICT = {
  blank: { word: 'Fill it in!', tone: 'yellow', tilt: -7 },
  credential: { word: 'Denied!', tone: 'red', tilt: 8 },
  field: { word: 'Denied!', tone: 'red', tilt: 8 },
  revoked: { word: 'Revoked!', tone: 'red', tilt: 7 },
  refused: { word: 'Hold on!', tone: 'yellow', tilt: -6 },
  reach: { word: 'No answer!', tone: 'blue', tilt: -6 },
};

/* The codes the server sends when it has answered, clearly, and the answer is
   no. They are not credential faults — nothing the player types will change
   them — and they are emphatically not network faults. Everything here is
   reported at form level with the server's own words and no invitation to
   retype anything. */
const REFUSALS = new Set(['LOGIN_RATE_LIMITED', 'REGISTRATION_CLOSED', 'EVENT_ENDED', 'EVENT_FULL', 'ROLE_FORBIDDEN']);

/* The form-level notice, coloured by what kind of no it was, and carrying a
   tail only where a retry is actually the right advice. "Nothing you typed was
   lost" is true when the wifi dropped; after a wrong code it is false, because
   that is the one case the page does clear, and after a fifteen-minute lockout
   "try again" is worse than useless. */
const FORM_ALERT = {
  credential: 'bg-red-light text-red-deep',
  revoked: 'bg-red-light text-red-deep',
  refused: 'bg-yellow-light text-ink',
  reach: 'bg-blue-light text-blue-deep',
};
const FORM_NOTE = { reach: ' — nothing you typed was lost. Try again.' };

/*
 * Steam off the mug, the cover's effect refitted to this drawing.
 *
 * The coordinates are not transferable — the cover's mug sits at (891, 376) in
 * a 986x520 artwork, this one at (1159, 454) in a 1240x615 one — so the rim was
 * found by scanning analyst-welcome.webp for the mug's red body: x 1124-1194,
 * top edge y 454. The three wisps are the cover's own curves, re-anchored to
 * that rim and spread across it.
 *
 * Each is drawn twice, a cream stroke under an ink one, because of what the
 * wisps cross: directly above this mug is the near-black monitor and desk, but
 * a few pixels right of it the background is cream. A single stroke of either
 * colour disappears over half its journey. Same reason the cover does it.
 *
 * The rise is a CSS keyframe, not Framer: Framer will not write `transform`
 * onto an SVG <g>, so y/scale there silently do nothing.
 */
const INK = '#141414';
const MUG = { x: 1159, y: 454 };
const STEAM = [
  { d: 'M1138 452 c -7 -12 6 -17 -1 -29 c -6 -11 4 -16 0 -24', delay: 0 },
  { d: 'M1159 450 c 8 -13 -5 -18 2 -31 c 6 -12 -3 -18 1 -27', delay: 0.95 },
  { d: 'M1180 453 c -7 -11 5 -16 -1 -27 c -5 -10 4 -15 0 -22', delay: 1.9 },
];

/* errorMessage() renders a 422's details as the validator wrote them —
   "investigatorId: String must contain at least 3 character(s)". True, and
   nobody in this book talks like that. The field is already marked red, so the
   line under it only has to name the problem; the readout still prints the
   server's own words in full, so nothing is hidden. */
const SHAPE_FAULT = {
  investigatorId: "That investigator ID doesn't look right.",
  accessCode: "That access code doesn't look right.",
};

/* Same reasoning for the two faults the player actually meets most: the
   server's own wording is "Identity verification failed. Check your
   investigator ID and access code." and "CONNECTION INTERRUPTED", which are
   accurate and unfriendly. The line beside the field says it plainly; the
   readout underneath still prints the server's words verbatim, so a
   coordinator debugging someone's sign-in loses nothing.
   Note the credential line never says WHICH of the two was wrong — telling a
   stranger that the ID exists is a free hint. */
const PLAIN_FAULT = {
  credential: 'Wrong ID or code. Check both and try again.',
  TIMEOUT: 'The server took too long to answer',
  NETWORK: "Couldn't reach the server",
};

/*
 * What he says to you, one line per state. Plain words on purpose: this is the
 * first screen of the game and some players are meeting SQL for the first time
 * today, so every line says what just happened and what to do next, and
 * nothing has to be decoded. No metaphors, no in-jokes, no jargon.
 *
 * No interval drives these — the line changes only when the form's state
 * changes, so nothing cycles underneath you while you are reading it.
 */
const CHATTER = {
  idle: 'Type your ID and code to begin.',
  busy: 'Checking your details…',
  blank: 'Please fill in both boxes.',
  credential: 'That ID or code is wrong. Try again.',
  field: "That doesn't look right. Check what you typed.",
  revoked: 'That credential is switched off. Ask your coordinator.',
  refused: 'The server said no. Read the note below.',
  reach: "Can't reach the server. Try again.",
  cleared: "You're in! Let's go.",
};

/** The cover's own slam, copied rather than hoisted so Landing.jsx is untouched. */
const slam = {
  hidden: { opacity: 0, scale: 1.24, rotate: 2.5, y: -18 },
  show: { opacity: 1, scale: 1, rotate: 0, y: 0, transition: { type: 'spring', stiffness: 520, damping: 17 } },
};

/** panelIn, with the interior tiers hung off it. */
const panelSlam = {
  hidden: { opacity: 0, scale: 0.94, rotate: -1.2, y: 14 },
  show: { opacity: 1, scale: 1, rotate: 0, y: 0, transition: { ...BOUNCE, staggerChildren: 0.07, delayChildren: 0.06 } },
};

/** One tier of the panel arriving. */
const beat = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: SNAP },
};

/* The Input component hard-codes `label` on its <label>, which is small and
   grey. Restyling it per-instance through the wrapper's className keeps the
   shared primitive untouched: full ink for contrast, a size step up, and a
   flex row so each label can carry its own icon. */
const LABEL = 'field-wrap [&>label]:flex [&>label]:items-center [&>label]:gap-1.5 [&>label]:text-ink [&>label]:text-[clamp(0.85rem,1.7vmin,1.05rem)]';

const lineTone = (l, i) => (l.startsWith('Denied') ? TONE.hit : i === 2 ? TONE.ok : i === 3 ? TONE.q : TONE.dim);
const linePrefix = (l, i) => (l.startsWith('Denied') ? '! ' : i === 0 || i === 3 ? '> ' : '  ');

export default function Login() {
  useDocumentTitle('Sign in');
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  const { login, isAuthenticated, user, lastReason } = useAuth();
  const { status, event, isLive, isOver, isPreStart } = useEvent();
  const [investigatorId, setInvestigatorId] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [lines, setLines] = useState([]);
  const [fault, setFault] = useState(null);
  const [faultField, setFaultField] = useState('code');   // 'id' | 'code' | 'form'
  const [faultKind, setFaultKind] = useState('credential');
  const [busy, setBusy] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const idRef = useRef(null);
  const codeRef = useRef(null);
  const submitRef = useRef(null);
  /* Where the caret belongs once the round-trip ends. Submitting puts focus on
     the button, `disabled={busy}` then drops it to <body>, and the rejection
     path has just emptied the access code — so without this the player is left
     with no caret in front of the one field they must retype. Set in catch,
     spent by the effect below once `busy` has actually re-enabled the input. */
  const refocus = useRef(null);
  /* The sequence spends 2.2s in setTimeout before it navigates. If the player
     leaves in the middle of that — "Back to home", the browser's back
     button — the timers keep running and the tail of the sequence would push a
     route onto a page that is gone. */
  const alive = useRef(true);
  useEffect(() => {
    // Set on the way IN as well as the way out. Under StrictMode React mounts,
    // runs this effect, runs its cleanup, then runs the effect again — so a
    // cleanup-only version latches `false` on the first mount and never
    // recovers, and the guard below silently swallows every sign-in.
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  /* The shake lives on its own node, driven imperatively. It replaces the old
     key={shake}, which remounted the whole card on every fault — replaying the
     entrance, regenerating Field's useId, and throwing away focus and caret
     immediately after setAccessCode('') had cleared the field the user now has
     to retype. That node carries a Framer transform and nothing else: no
     .tilt-l, no .lift, no Tailwind translate. */
  const shakeCtl = useAnimationControls();
  const bump = () => {
    if (reduce) return;
    shakeCtl.start({ x: [0, -9, 9, -6, 6, -3, 0] }, { duration: 0.42, ease: 'easeInOut' });
  };

  useEffect(() => {
    if (isAuthenticated && !busy) {
      navigate(user.role === 'coordinator' ? '/command' : '/play', { replace: true });
    }
  }, [isAuthenticated, user, navigate, busy]);

  useEffect(() => {
    idRef.current?.focus();
  }, []);

  useEffect(() => {
    if (busy || !refocus.current) return;
    refocus.current.focus();
    refocus.current = null;
  }, [busy]);

  const wait = (ms) => new Promise((r) => setTimeout(r, reduce ? 40 : ms));

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setFault(null);
    const noId = !investigatorId.trim();
    const noCode = !accessCode;
    if (noId || noCode) {
      setFault(noId && noCode ? 'Both fields are required.' : noId ? 'Enter your investigator ID.' : 'Enter your access code.');
      setFaultField(noId ? 'id' : 'code');
      setFaultKind('blank');
      bump();
      (noId ? idRef : codeRef).current?.focus();
      return;
    }
    setBusy(true);
    setLines([SEQUENCE[0]]);
    await wait(450);
    setLines([SEQUENCE[0], SEQUENCE[1]]);
    try {
      const [u] = await Promise.all([login(investigatorId.trim(), accessCode), wait(600)]);
      setLines([SEQUENCE[0], SEQUENCE[1], SEQUENCE[2]]);
      await wait(500);
      setLines(SEQUENCE);
      await wait(650);
      if (!alive.current) return;
      const from = location.state?.from;
      const fallback = u.role === 'coordinator' ? '/command' : '/play';
      navigate(from && from.startsWith(fallback) ? from : fallback, { replace: true });
    } catch (err) {
      if (!alive.current) return;
      /* Which kind this is decides everything downstream: the word in the
         burst, what he says, which control is marked invalid, whether we
         invite a retry at all, and — the one that costs the player real work —
         whether the access code they typed is thrown away.
         The order matters. `revoked` has to be tested before `credential`
         because the server only reaches it AFTER the password compared equal:
         the code was right, so calling it wrong and deleting it is two lies.
         `refused` has to be tested before `reach` because the server answered;
         telling someone locked out for fifteen minutes that the network is
         down, and to try again, is wrong twice over. */
      const named = err?.details?.find((d) => d.path === 'investigatorId' || d.path === 'accessCode');
      const kind = err?.code === 'ACCOUNT_DISABLED' ? 'revoked'
        : err?.code === 'INVALID_CREDENTIALS' ? 'credential'
          : named ? 'field'
            : REFUSALS.has(err?.code) ? 'refused'
              : 'reach';
      setLines((l) => [...l, `Denied: ${errorMessage(err)}`]);
      setFault(
        kind === 'field' ? SHAPE_FAULT[named.path]
          : kind === 'credential' ? PLAIN_FAULT.credential
            : PLAIN_FAULT[err?.code] || errorMessage(err),
      );
      setFaultKind(kind);
      setShowCode(false);   // never leave a rejected code on screen
      /* Only a fault the player can fix by editing one box marks that box.
         `credential` does not: the server will not say which of the two was
         wrong, so asserting aria-invalid on the code field claims something
         nobody knows. It goes to the form, like the refusals do. */
      setFaultField(kind === 'field' ? (named.path === 'investigatorId' ? 'id' : 'code') : 'form');
      bump();
      if (kind === 'credential') {
        // the one secret worth retyping, and the only kind that may erase it
        setAccessCode('');
        refocus.current = codeRef.current;
      } else if (kind === 'field') {
        refocus.current = named.path === 'investigatorId' ? idRef.current : codeRef.current;
      } else {
        // nothing to correct — put the caret back on the thing to press again
        refocus.current = submitRef.current;
      }
    } finally {
      setBusy(false);
    }
  };

  /* One status table for the whole book. The cover derives its own from
     EVENT_STATUS_META + isLive/isOver/isPreStart; this page used to hand-roll
     a second one that said "On hold"/"Standby" where the cover said
     "Not started"/"SYNCING". Unified — with the amber `paused` branch kept,
     because "the event is paused" is exactly the thing a player standing at
     the door needs distinguished from "standby". */
  const meta = EVENT_STATUS_META[status] || EVENT_STATUS_META.unknown;
  const paused = status === 'paused';
  const statusLabel = isLive ? 'Live now' : isOver ? 'Closed' : paused ? 'On hold' : isPreStart ? 'Not started' : meta.label;
  const statusTone = isLive ? 'green' : isOver ? 'crimson' : paused ? 'amber' : 'neutral';

  const granted = lines.length === SEQUENCE.length && !fault;
  const mood = fault ? faultKind : granted ? 'cleared' : busy ? 'busy' : 'idle';
  const verdict = fault ? VERDICT[faultKind] : null;
  const showBanner = Boolean(lastReason) && lastReason !== 'NETWORK' && !lines.length;

  return (
    <div className="relative flex min-h-dvh flex-col">
      {/* ---------------------------------------------------- the running head */}
      <header className="relative z-20 shrink-0">
        <nav className="relative mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-8 [@media(min-height:960px)]:h-20">
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
          <Button
            to="/"
            size="md"
            variant="outline"
            icon={ArrowLeft}
            className="[@media(min-height:960px)]:h-12 [@media(min-height:960px)]:px-5 [@media(min-height:960px)]:text-xl"
          >
            <span className="hidden sm:inline">Back to home</span>
            <span className="sm:hidden">Home</span>
          </Button>
        </nav>
      </header>

      {/* ------------------------------------------------------- the red field */}
      <main className="relative isolate flex flex-1 items-center justify-center overflow-hidden border-t-5 border-ink bg-red px-4 py-[clamp(1rem,3.2vmin,3rem)] sm:px-8">
        <div className="dots-white absolute inset-0 opacity-70" aria-hidden />

        {/* one pass of light as the page lands — a sibling of the card, never a
            child, so it can never replay on a failed password */}
        {reduce ? null : (
          /* Two levels, and it has to be: the cover writes the skew and the
             sweep onto one element, where Framer's `x` replaces `transform`
             wholesale and the skew silently never renders. The wrapper holds
             the skew, the child does the travelling. */
          <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-[36%] -skew-x-12" aria-hidden>
            <motion.div
              initial={{ x: '-60%', opacity: 0 }}
              animate={{ x: '160%', opacity: [0, 0.55, 0] }}
              transition={{ duration: 1.5, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="h-full w-full bg-gradient-to-r from-transparent via-white to-transparent mix-blend-overlay"
            />
          </div>
        )}

        <div className="relative z-10 mx-auto grid w-full max-w-[86rem] justify-center gap-x-[clamp(2rem,6vmin,5rem)] gap-y-[clamp(1.25rem,3vmin,2.25rem)] lg:grid-cols-[auto_auto] lg:items-center">
          {/* ------------------------------------------------- left: the scene

              The column is `auto` in the grid, so without a width of its own it
              collapses to its widest child — the headline — and the artwork
              below it shrinks to the width of the word IDENTITY. The lg clamp
              sizes the column for the drawing instead, which is the thing that
              has to stay legible: his face, and the hand he is holding out. */}
          <motion.div
            variants={stagger(0.1, 0.06)}
            initial={reduce ? 'show' : 'hidden'}
            animate="show"
            className="w-full max-w-[34rem] space-y-[clamp(0.75rem,2vmin,1.5rem)] lg:w-[clamp(20rem,52vmin,38rem)] lg:max-w-none"
          >
            {/* The lettering never sits quite still. Each word rocks on its own
                slow cycle, half a phase apart, so the title reads as inked by
                hand rather than set in type.

                Two levels per word, and it has to be: the Framer entrance
                (panelIn, then the slam) writes `transform` onto the outer span
                and would wipe the sway the moment it landed. Outer span
                arrives, inner span breathes. */}
            <motion.h1
              variants={stagger(0.14, 0)}
              className="font-display text-[clamp(2.25rem,6vmin,4.75rem)] uppercase leading-[0.9] tracking-comic text-white text-shadow-comic"
            >
              <motion.span variants={panelIn} className="block">
                <span className="ink-sway block">Identity</span>
              </motion.span>
              <motion.span variants={slam} className="block origin-left">
                <span className="ink-sway ink-sway-late block">Check</span>
              </motion.span>
            </motion.h1>

            {/* He has turned round from the desk and put a hand out — on the
                cover he is working the case with his back to you, here he is
                the one holding the door. The gesture is why the artwork faces
                front: it answers the bubble above it.

                The file (public/cover/analyst-welcome.webp, 1240x615) is
                already cropped to the drawing's cream page — the supplied art
                carried its own inked frame and a red bleed, which would have
                doubled against this panel's border and read as a mess. So the
                frame here is the page's own border-5 and shadow-comic-xl, and
                the panel takes the artwork's exact ratio, which means
                object-cover never adds a second crop of its own. */}
            <motion.div variants={panelIn} className="hidden lg:block">
              <div className="w-full">
                {/* He keeps talking to you, and the bubble keeps bobbing while
                    he waits. The float is on `.bubble` itself so the inked tail
                    travels with the body — put it on an inner node and the body
                    drifts off its own tail. The Framer pop that swaps one line
                    for the next therefore has to sit on a wrapper above it. */}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={mood}
                    initial={reduce ? false : { opacity: 0, scale: 0.7, y: -10, rotate: 3 }}
                    animate={{ opacity: 1, scale: 1, y: 0, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 22 }}
                    className="mb-4 max-w-[26rem]"
                    aria-hidden
                  >
                    <div className="bubble bubble-float px-3 py-2">
                      <p className="text-[clamp(0.9rem,1.85vmin,1.3rem)] font-bold leading-snug">{CHATTER[mood]}</p>
                    </div>
                  </motion.div>
                </AnimatePresence>
                <div className="lift relative isolate aspect-[1240/615] overflow-hidden border-5 border-ink bg-paper shadow-comic-xl">
                  <img
                    src="/cover/analyst-welcome.webp"
                    alt="The analyst turning from his workstation, holding a hand out to you"
                    draggable={false}
                    className="absolute inset-0 h-full w-full select-none object-cover"
                  />

                  {/* his tea is still hot */}
                  <svg viewBox="0 0 1240 615" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full">
                    {STEAM.map((wisp) => (
                      <g
                        key={wisp.delay}
                        style={{
                          transformOrigin: `${MUG.x}px ${MUG.y}px`,
                          opacity: reduce ? 0.5 : 0,
                          animation: reduce ? undefined : `steamRise 2.9s ease-out ${wisp.delay}s infinite`,
                        }}
                      >
                        <path d={wisp.d} fill="none" stroke="#fbf6e9" strokeWidth="5.5" strokeLinecap="round" />
                        <path d={wisp.d} fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
                      </g>
                    ))}
                  </svg>
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* ------------------------------------------------- right: the door */}
          <div className="relative w-full max-w-[27rem] justify-self-center">
            {/* The vanishing point. Two levels, not the cover's three, because
                there is no parallax to nest — but the split is still mandatory:
                one Framer transform on the inner node would wipe the rotation. */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2" aria-hidden>
              <div className="speed-field h-[118vmax] w-[118vmax] bg-action-lines opacity-[0.22]" />
            </div>

            <motion.div animate={shakeCtl} initial={false} className="relative">
              <motion.div variants={stagger(0.09, 0.12)} initial={reduce ? 'show' : 'hidden'} animate="show" className="relative">
                {/* the narrator, swinging up off the panel's top-left corner */}
                <motion.span
                  variants={pop}
                  className="absolute -top-[clamp(0.85rem,2.1vmin,1.4rem)] left-[clamp(0.9rem,2.2vmin,1.5rem)] z-20 max-w-[calc(100%-2rem)] origin-bottom-left"
                >
                  <span className="caption caption-sway text-[clamp(0.95rem,2vmin,1.35rem)]">First, a quick check…</span>
                </motion.span>

                <motion.div variants={panelSlam} className="relative border-5 border-ink bg-white shadow-comic-xl">
                  {/* ------- tier 1: who you are signing in to

                      Cream, not white, with the book's halftone over it. The
                      panel then reads as three things instead of one long
                      column — printed header, white space you write in, printed
                      footer — and the eye lands on the fields without being
                      told to. */}
                  <motion.div
                    variants={beat}
                    className="relative isolate overflow-hidden border-b-3 border-ink bg-paper px-[clamp(1.05rem,2.6vmin,1.6rem)] pb-[clamp(0.7rem,1.7vmin,1.05rem)] pt-[clamp(1.25rem,3vmin,1.85rem)]"
                  >
                    <div className="dots dots-drift pointer-events-none absolute inset-0 -z-10 opacity-40" aria-hidden />
                    {/* Plain ink, not a second yellow chip: the narrator caption
                        overlapping the top edge is already yellow, and two of
                        them 40px apart read as clutter rather than emphasis. */}
                    <p className="label-strong text-[clamp(0.72rem,1.45vmin,0.9rem)] leading-none text-ink-soft">You&apos;re signing in to</p>
                    <p className="mt-1.5 truncate font-display text-[clamp(1.1rem,2.3vmin,1.6rem)] uppercase leading-none tracking-comic text-ink">
                      {event?.name || 'Operation: Black Cipher'}
                    </p>
                    <p className="mt-1.5 text-[clamp(0.76rem,1.5vmin,0.95rem)] font-bold leading-snug text-ink-soft">
                      Use the ID and code your coordinator gave you.
                    </p>
                  </motion.div>

                  {/* ------- tier 2: what you do */}
                  <form
                    onSubmit={submit}
                    noValidate
                    autoComplete="off"
                    className="space-y-[clamp(0.65rem,1.7vmin,1.1rem)] px-[clamp(1.05rem,2.6vmin,1.6rem)] py-[clamp(0.9rem,2.2vmin,1.4rem)]"
                  >
                    {showBanner ? (
                      <motion.p
                        variants={beat}
                        className="border-3 border-ink bg-yellow px-3 py-2 font-display text-[clamp(0.85rem,1.7vmin,1.05rem)] uppercase leading-tight tracking-comic shadow-comic-sm"
                      >
                        {lastReason === 'SESSION_EXPIRED' ? 'Your last session timed out. Sign in again.' : 'Your last session ended. Sign in again.'}
                      </motion.p>
                    ) : null}

                    {/* Both fields start empty and stay empty until somebody
                        types. They already did in React — `useState('')` — but
                        Chrome was filling them from a saved login, which on a
                        machine several players share in turn means arriving at
                        the door wearing the last person's name.

                        `autoComplete="off"` alone is not enough: Chrome ignores
                        it on anything it recognises as a sign-in form, so the
                        access code is marked `new-password`, which it will not
                        prefill. The trade-off, stated rather than buried: a
                        player using a password manager now types both fields by
                        hand. For an event where a coordinator reads the
                        credentials out once, that is the right way round. */}
                    <motion.div variants={beat}>
                      <Input
                        ref={idRef}
                        label={<><UserRound className="h-[1.05em] w-[1.05em]" strokeWidth={2.6} aria-hidden /> Investigator ID</>}
                        value={investigatorId}
                        onChange={(e) => setInvestigatorId(e.target.value)}
                        placeholder="e.g. vignesh"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        disabled={busy}
                        error={fault && faultField === 'id' ? fault : undefined}
                        className={LABEL}
                        inputClassName="font-mono"
                      />
                    </motion.div>

                    <motion.div variants={beat}>
                      <Input
                        ref={codeRef}
                        label={<><KeyRound className="h-[1.05em] w-[1.05em]" strokeWidth={2.6} aria-hidden /> Access code</>}
                        type={showCode ? 'text' : 'password'}
                        value={accessCode}
                        onChange={(e) => setAccessCode(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        disabled={busy}
                        error={fault && faultField === 'code' ? fault : undefined}
                        className={LABEL}
                        inputClassName="font-mono tracking-widest"
                        /* Purely local: it flips this input's own `type` and
                           nothing else. The code is never stored, echoed or
                           sent anywhere by it, and it starts hidden every time
                           — including after a rejection, since somebody may be
                           reading over your shoulder at an event.
                           Colour changes only on press: the button centres
                           itself with -translate-y-1/2, and any `active:`
                           translate would overwrite that transform and make it
                           jump out of the field. */
                        trailing={(
                          <button
                            type="button"
                            onClick={() => setShowCode((v) => !v)}
                            disabled={busy}
                            aria-label={showCode ? 'Hide access code' : 'Show access code'}
                            aria-pressed={showCode}
                            title={showCode ? 'Hide access code' : 'Show access code'}
                            className="absolute right-[7px] top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center border-2 border-ink bg-white text-ink shadow-comic-sm transition-colors duration-150 hover:bg-yellow-light disabled:opacity-40"
                          >
                            {showCode
                              ? <EyeOff className="h-4 w-4" strokeWidth={2.6} aria-hidden />
                              : <Eye className="h-4 w-4" strokeWidth={2.6} aria-hidden />}
                          </button>
                        )}
                      />
                    </motion.div>

                    {/* A fault nobody's credentials caused belongs to the form,
                        not to a field: marking an input invalid because the
                        wifi dropped tells the player to edit something that was
                        already right. */}
                    {fault && faultField === 'form' ? (
                      <p
                        role="alert"
                        className={`border-3 border-ink px-3 py-2 font-display text-[clamp(0.85rem,1.7vmin,1.05rem)] uppercase leading-tight tracking-comic shadow-comic-sm ${FORM_ALERT[faultKind] || FORM_ALERT.reach}`}
                      >
                        {fault}{FORM_NOTE[faultKind] || ''}
                      </p>
                    ) : null}

                    <motion.div variants={beat}>
                      <Button
                        ref={submitRef}
                        type="submit"
                        size="lg"
                        loading={busy}
                        icon={busy ? undefined : KeyRound}
                        className="slab-shine key-turn w-full"
                      >
                        {busy ? 'Checking…' : 'Let me in!'}
                      </Button>
                    </motion.div>

                    {/* ------- the secure terminal: his monitor, on your side */}
                    <motion.div variants={beat}>
                      <div className="term min-h-[clamp(4.25rem,9.5vmin,5.75rem)] px-3 py-2.5" aria-live="polite" role="status">
                        {reduce || !lines.length ? null : <span className="term-scan" aria-hidden />}
                        <AnimatePresence initial={false}>
                          {lines.length === 0 ? (
                            <motion.p
                              key="idle"
                              initial={reduce ? false : { opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="relative z-[1] whitespace-pre-wrap"
                              style={{ color: TONE.dim }}
                            >
                              <span aria-hidden>{'> '}</span>
                              {IDLE_LINE}
                              <span className="term-cursor animate-blink" aria-hidden />
                            </motion.p>
                          ) : (
                            lines.map((l, i) => (
                              <motion.p
                                key={l + i}
                                initial={reduce ? false : { opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.18, ease: 'easeOut' }}
                                className="relative z-[1] whitespace-pre-wrap"
                                style={{ color: lineTone(l, i) }}
                              >
                                <span aria-hidden>{linePrefix(l, i)}</span>
                                {/* The typed copy is aria-hidden and the whole
                                    string sits in an sr-only twin: a Typewriter
                                    inside an aria-live region would otherwise
                                    announce a partial string on every tick. */}
                                <span aria-hidden>
                                  <Typewriter text={l} speed={l.startsWith('Denied') ? 9 : 14} cursor={false} />
                                </span>
                                <span className="sr-only">{l}</span>
                                {i === lines.length - 1 ? <span className="term-cursor animate-blink" aria-hidden /> : null}
                              </motion.p>
                            ))
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  </form>

                  {/* ------- tier 3: what happens next */}
                  <motion.div
                    variants={beat}
                    className="flex items-center gap-3 border-t-3 border-ink bg-paper px-[clamp(1.05rem,2.6vmin,1.6rem)] py-[clamp(0.5rem,1.3vmin,0.8rem)] text-ink-soft"
                  >
                    <UserRound className="h-5 w-5 shrink-0" strokeWidth={2.4} aria-hidden />
                    <p className="text-[clamp(0.76rem,1.5vmin,0.95rem)] font-bold leading-snug">
                      Players and coordinators both sign in here. We&apos;ll take you to the right place.
                    </p>
                  </motion.div>

                  {/* The verdict. A stamp is thin, tilted ink with a turbulence
                      mask eating a tenth of it, so it can only be read against
                      one flat tone — and at the moment it lands the panel is
                      white paper, a yellow button and black glass all at once.
                      So the panel goes quiet first: a pale green wash floods it
                      — the comic's flash on the decisive beat, in the colour of
                      the verdict — and the stamp presses onto that one flat
                      tone. Opacity only on the wash, so it writes no transform.

                      Three levels under it: the outer div owns -translate-*
                      (Tailwind), the motion div owns scale+rotate, and .stamp
                      keeps its own -6deg. Collapse any two and Framer, which
                      writes `transform` wholesale, wipes the tilt. */}
                  <AnimatePresence>
                    {granted ? (
                      <motion.div
                        key="cleared"
                        initial={reduce ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                        className="pointer-events-none absolute inset-0 z-30 bg-green-light/[0.94]"
                      >
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                          <motion.div
                            initial={reduce ? false : { opacity: 0, scale: 1.7, rotate: 14 }}
                            animate={{ opacity: 1, scale: 1, rotate: 0 }}
                            transition={{ type: 'spring', stiffness: 700, damping: 26, delay: reduce ? 0 : 0.08 }}
                          >
                            <Stamp
                              tone="green"
                              className="whitespace-nowrap !border-[5px] !border-green-deep px-[0.5em] py-[0.12em] text-[clamp(2.1rem,5.4vmin,3.6rem)] !text-green-deep"
                            >
                              Cleared
                            </Stamp>
                          </motion.div>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </motion.div>

                {/* the refusal, shouting off the panel's top-right corner onto
                    the red. Framer's rotate sits on this wrapper; Burst writes
                    rotate(tilt) onto .burst-wrap itself. */}
                <AnimatePresence>
                  {verdict ? (
                    <motion.div
                      key={verdict.word}
                      initial={reduce ? false : { opacity: 0, scale: 0.3, rotate: 20 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{ type: 'spring', stiffness: 480, damping: 16 }}
                      className="pointer-events-none absolute -right-2 -top-[clamp(1.1rem,2.6vmin,2rem)] z-30 sm:-right-5"
                    >
                      <Burst size="sm" tone={verdict.tone} tilt={verdict.tilt}>
                        {verdict.word}
                      </Burst>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
