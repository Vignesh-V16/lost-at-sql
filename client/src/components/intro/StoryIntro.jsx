import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Play, Pause, ChevronLeft, ChevronRight, SkipForward, BookOpen, RotateCcw, X, Lock, LoaderCircle } from 'lucide-react';
import { Burst, Typewriter } from '../ui/Misc.jsx';
import { SCENES, SPRITES } from './scenes.jsx';
import { INTRO_SCRIPT } from './script.js';
import { boxPx } from './typeset.js';
import { cn } from '../../utils/cn.js';

const SEEN_KEY = (userId) => `lostatsql.intro.seen.${userId || 'anon'}`;
const LAST = INTRO_SCRIPT.length - 1;
const clamp = (i) => Math.max(0, Math.min(LAST, i));

/* Where each shot starts in the film, in seconds — the film runs to the same script. */
const FILM_STARTS = INTRO_SCRIPT.reduce((acc, p) => (acc.push(acc[acc.length - 1] + (p.duration || 8000) / 1000), acc), [0]).slice(0, INTRO_SCRIPT.length);
const shotAt = (t) => {
  let i = 0;
  while (i < LAST && t >= FILM_STARTS[i + 1]) i += 1;
  return i;
};

/*
 * The film: client/public/intro.mp4 (16:9, H.264, silent), rendered from
 * the panels by tools/film. When it exists it IS the intro: every
 * control seeks inside it, shot by shot, and the Begin button appears over
 * its final frame. The pages drawn in the browser (scenes.jsx) are the
 * fallback when there is no film. Replace the file with any produced video
 * cut to the same shot lengths; nothing else to configure.
 */
const FILM_SRC = '/intro.mp4';
const FILM_SUBS = '/intro.vtt'; // optional; the panels carry their own text

async function probe(url, type) {
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return r.ok && (r.headers.get('content-type') || '').startsWith(type);
  } catch {
    return false;
  }
}

export function introSeen(userId) {
  try {
    return sessionStorage.getItem(SEEN_KEY(userId)) === '1';
  } catch {
    return false;
  }
}
export function markIntroSeen(userId) {
  try {
    sessionStorage.setItem(SEEN_KEY(userId), '1');
  } catch {
    /* ignore */
  }
}

/* Film grain: a tiny SVG noise tile, jittered so it never sits still. */
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E")`;

/* How a page arrives on the stage (the pages fallback). */
const CUTS = {
  slam: {
    initial: { opacity: 0, scale: 0.9, rotate: -2.5, x: 40 },
    animate: { opacity: 1, scale: 1, rotate: 0, x: 0 },
    exit: { opacity: 0, x: -90, scale: 0.98, transition: { duration: 0.2 } },
    transition: { type: 'spring', stiffness: 260, damping: 22 },
  },
  flash: {
    initial: { opacity: 0, scale: 1.06 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, transition: { duration: 0.12 } },
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  },
  impact: {
    initial: { opacity: 0, scale: 1.25 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 1.02, transition: { duration: 0.12 } },
    transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
  },
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0, transition: { duration: 0.45 } },
    transition: { duration: 0.9, ease: 'easeInOut' },
  },
  cut: {
    initial: { opacity: 1, scale: 1.04 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, transition: { duration: 0.01 } },
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
  glitch: {
    initial: { opacity: 1, x: 16, filter: 'hue-rotate(40deg) saturate(1.6)' },
    animate: { opacity: 1, x: [16, -14, 10, -6, 0], filter: ['hue-rotate(40deg) saturate(1.6)', 'hue-rotate(-40deg) saturate(1.6)', 'hue-rotate(20deg) saturate(1.3)', 'hue-rotate(0deg) saturate(1)', 'hue-rotate(0deg) saturate(1)'] },
    exit: { opacity: 0, transition: { duration: 0.01 } },
    transition: { duration: 0.4, ease: 'linear' },
  },
  wipe: {
    initial: { clipPath: 'inset(0% 0% 0% 100%)', opacity: 1 },
    animate: { clipPath: 'inset(0% 0% 0% 0%)', opacity: 1 },
    exit: { opacity: 0, transition: { duration: 0.18 } },
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
  },
};

/* A short handheld shake: keyframed jitter that settles, `at` ms into the page. */
function shakeKeyframes({ ms = 500, at = 0 }) {
  const steps = Math.max(4, Math.round(ms / 45));
  const xs = [0];
  const ys = [0];
  for (let i = 0; i < steps; i += 1) {
    const decay = 1 - i / steps;
    const amp = 14 * decay;
    xs.push((i % 2 ? -1 : 1) * amp * (0.6 + ((i * 7) % 5) / 10));
    ys.push((i % 3 === 0 ? 1 : -1) * amp * 0.6);
  }
  xs.push(0);
  ys.push(0);
  return { x: xs, y: ys, transition: { delay: at / 1000, duration: ms / 1000, ease: 'linear' } };
}

/* Where the closing controls go, in panel fractions → stage percentages. */
const stageBox = (box) => {
  const b = boxPx(box);
  return { left: `${(b.x / 16).toFixed(3)}%`, top: `${(b.y / 9).toFixed(3)}%`, width: `${(b.w / 16).toFixed(3)}%`, height: `${(b.h / 9).toFixed(3)}%` };
};
const CTA_BOX = stageBox([0.24, 0.86, 0.52, 0.13]); // the art's INVESTIGATION READY box
const NOTE_BOX = stageBox([0.6, 0.03, 0.38, 0.24]); // the dark sky, top right

/*
 * The big red comic button that fills the art's INVESTIGATION READY box
 * (styles: .intro-cta in index.css). Locked while the event is not live —
 * still legible, with a padlock — and spinning while the session starts.
 */
function BeginButton({ label, onClick, locked = false, loading = false, icon: Icon = Play }) {
  const Glyph = loading ? LoaderCircle : locked ? Lock : Icon;
  return (
    <button type="button" onClick={onClick} disabled={locked || loading} aria-busy={loading || undefined} className={cn('intro-cta', locked && 'intro-cta--locked')}>
      <span className="intro-cta__face">
        <Glyph className={cn('intro-cta__icon', loading && 'animate-spin')} strokeWidth={2.75} aria-hidden />
        <span className="intro-cta__label">{label}</span>
      </span>
    </button>
  );
}

/*
 * StoryIntro — the full-screen story introduction shown before the
 * investigation starts. The rendered film (client/public/intro.mp4) plays,
 * and ◀ ▶, the dots, Skip and Watch again all move inside it shot by shot;
 * when it ends, the Begin button appears over its final frame. Without a
 * film, the same pages are drawn in the browser. The intro is
 * silent.
 *
 *   investigator  name shown on the last page
 *   briefing      { text, beginLabel } from the server (the written version)
 *   canBegin      false while the event is not live
 *   onBegin       async — starts the session (omit when replaying mid-game)
 *   onClose       leave the intro without beginning
 *   autoplay      false to open paused
 *   startAt       shot to open on (the preview route uses it)
 */
export function StoryIntro({ investigator = 'Investigator', briefing, canBegin = true, waitingMessage, onBegin, onClose, autoplay = true, startAt = 0 }) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(() => clamp(startAt)); // the page, when there is no film
  const [playing, setPlaying] = useState(autoplay);
  const [showText, setShowText] = useState(false);
  const [starting, setStarting] = useState(false);
  const [burstOn, setBurstOn] = useState(false);
  const [flash, setFlash] = useState(null); // 'white' | 'invert' | null
  const [film, setFilm] = useState({ available: null, subtitles: false, ended: false }); // available: null until the probe answers
  const [filmPage, setFilmPage] = useState(clamp(startAt)); // the shot the film is on
  const timers = useRef([]);
  const turnTimer = useRef(null);
  const videoRef = useRef(null);
  const showingFilm = film.available === true;
  const probing = film.available === null;
  const holding = showingFilm || probing; // the pages are not drawn
  const shown = showingFilm ? filmPage : index; // the shot the controls point at
  const atEnd = showingFilm ? film.ended : index === LAST; // the Begin controls show

  const page = INTRO_SCRIPT[index];
  const Scene = SCENES[page.scene];
  const cut = CUTS[page.cut] || CUTS.slam;

  // Every page's art, warmed up while the film plays, so the fallback pages
  // (and the film's own start) never wait on the network.
  useEffect(() => {
    const keep = [];
    const load = (src) => {
      const im = new Image();
      im.decoding = 'async';
      im.src = src;
      keep.push(im);
    };
    for (let n = 1; n <= INTRO_SCRIPT.length; n += 1) {
      const nn = String(n).padStart(2, '0');
      load(`/intro/panel-${nn}.jpg`);
      load(`/intro/panel-${nn}-bg.jpg`);
    }
    for (const src of SPRITES) load(`/intro/sprites/${src}`);
    return () => keep.splice(0);
  }, []);

  // Is there a produced film?
  useEffect(() => {
    let alive = true;
    Promise.all([probe(FILM_SRC, 'video/'), probe(FILM_SUBS, 'text/vtt')]).then(([available, subtitles]) => {
      if (alive) setFilm((f) => ({ ...f, available, subtitles }));
    });
    return () => {
      alive = false;
    };
  }, []);

  /* ── moving through the film ─────────────────────────────────────── */
  const seekShot = useCallback((i, play = true) => {
    const v = videoRef.current;
    if (!v) return;
    const target = clamp(i);
    v.currentTime = FILM_STARTS[target] + 0.01;
    setFilmPage(target);
    setFilm((f) => (f.ended ? { ...f, ended: false } : f));
    if (play) v.play().catch(() => {});
    else v.pause();
  }, []);
  const endFilm = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      v.pause();
      if (Number.isFinite(v.duration)) v.currentTime = v.duration;
    }
    setFilmPage(LAST);
    setFilm((f) => ({ ...f, ended: true }));
    setPlaying(false);
  }, []);

  /* ── moving through the pages (no film) ──────────────────────────── */
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const go = useCallback((next) => setIndex(clamp(next)), []);

  /* ── the controls, whichever is showing ──────────────────────────── */
  const prev = useCallback(() => {
    if (!showingFilm) return go(index - 1);
    const t = videoRef.current?.currentTime ?? 0;
    // well into a shot: back to its start; otherwise the shot before
    return seekShot(t - FILM_STARTS[filmPage] > 2 ? filmPage : filmPage - 1);
  }, [showingFilm, index, filmPage, go, seekShot]);
  const next = useCallback(() => {
    if (!showingFilm) return go(index + 1);
    return filmPage >= LAST ? endFilm() : seekShot(filmPage + 1);
  }, [showingFilm, index, filmPage, go, seekShot, endFilm]);
  const jump = useCallback((i) => (showingFilm ? seekShot(i) : go(i)), [showingFilm, seekShot, go]);
  const skip = useCallback(() => (showingFilm ? endFilm() : go(LAST)), [showingFilm, endFilm, go]);
  const again = useCallback(() => (showingFilm ? seekShot(0) : go(0)), [showingFilm, seekShot, go]);
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (showingFilm && v) {
      if (film.ended) seekShot(0);
      else if (v.paused) v.play().catch(() => {});
      else v.pause();
      return;
    }
    setPlaying((p) => !p);
  }, [showingFilm, film.ended, seekShot]);

  // Per page, once: the cut's flash frame and the burst (pages only).
  useEffect(() => {
    clearTimers();
    setBurstOn(false);
    setFlash(null);
    if (!holding && !reduce) {
      if (page.cut === 'flash') {
        setFlash('white');
        timers.current.push(setTimeout(() => setFlash(null), 140));
      } else if (page.cut === 'impact') {
        setFlash('invert');
        timers.current.push(setTimeout(() => setFlash('white'), 90));
        timers.current.push(setTimeout(() => setFlash(null), 170));
      }
    }
    if (page.burst && !holding) timers.current.push(setTimeout(() => setBurstOn(true), page.burst.at));
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, holding]);

  // The page turn, on its own timer (pages only).
  useEffect(() => {
    clearTimeout(turnTimer.current);
    if (playing && page.duration && index !== LAST && !holding) turnTimer.current = setTimeout(() => go(index + 1), page.duration);
    return () => clearTimeout(turnTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, playing, holding]);

  // Keyboard: arrows, space, escape — unless a control has focus (buttons keep
  // Space and Enter) or the written briefing is open (Escape closes it).
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t instanceof HTMLElement) {
        if (t.closest('input, textarea, select, video, [contenteditable]')) return;
        if ((e.key === ' ' || e.key === 'Enter') && t.closest('button, a')) return; // the focused control keeps its own activation
      }
      if (showText) {
        if (e.key === 'Escape') setShowText(false);
        return;
      }
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, togglePlay, onClose, showText]);

  const fill = (t) => (t || '').replace('{{name}}', investigator);
  const caption = useMemo(() => fill(page.caption), [page.caption, investigator]); // eslint-disable-line react-hooks/exhaustive-deps
  const shake = !reduce && page.shake ? shakeKeyframes(page.shake) : null;

  const begin = async () => {
    if (starting || !onBegin) return;
    setStarting(true);
    try {
      await onBegin();
    } finally {
      setStarting(false);
    }
  };

  /* The closing controls: the Begin button in the art's INVESTIGATION READY
     box, the small print in the dark sky at the top right, clear of the title. */
  const closing = (
    <>
      <motion.div className="absolute" style={CTA_BOX} initial={{ opacity: 0, scale: 0.6, rotate: -3 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ delay: 0.6, type: 'spring', stiffness: 300, damping: 16 }}>
        {onBegin ? <BeginButton label={briefing?.beginLabel || 'Begin Investigation'} onClick={begin} locked={!canBegin} loading={starting} /> : <BeginButton label="Back to the case" onClick={onClose} icon={RotateCcw} />}
      </motion.div>
      <motion.div className="absolute flex flex-col items-end gap-2 text-right" style={NOTE_BOX} initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0, duration: 0.4 }}>
        {onBegin ? (
          !canBegin ? (
            <p className="border-3 border-ink bg-white px-3 py-2 text-xs font-bold text-ink shadow-comic-sm sm:text-sm">{waitingMessage || 'Waiting for the coordinator to start the event…'}</p>
          ) : (
            <p className="border-2 border-ink bg-white px-2.5 py-1 text-[11px] font-bold text-ink-soft shadow-comic-sm sm:text-xs">Your 60-minute clock starts when you press begin.</p>
          )
        ) : null}
        {briefing?.text ? (
          <button type="button" onClick={() => setShowText(true)} className="inline-flex items-center gap-2 border-2 border-ink bg-white px-2.5 py-1 font-display text-sm uppercase tracking-comic text-ink shadow-comic-sm hover:bg-yellow sm:text-base">
            <BookOpen className="h-4 w-4" strokeWidth={2.5} /> Read the written briefing
          </button>
        ) : null}
      </motion.div>
    </>
  );

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-ink text-white" role="dialog" aria-modal="true" aria-label="Story intro">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.10),transparent_60%)]" aria-hidden />

      {/* top strip */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3 sm:px-6">
        {/* the title, lettered like a comic caption: a yellow tag and the name in display type */}
        <p className="flex items-center gap-2.5 sm:gap-3" aria-label="Operation: Black Cipher">
          <span className="border-2 border-ink bg-yellow px-2 py-0.5 font-display text-sm uppercase leading-none tracking-comic text-ink shadow-comic-sm sm:text-base">Operation</span>
          <span className="font-display text-2xl uppercase leading-none tracking-comic sm:text-3xl" style={{ WebkitTextStroke: '1px #141414', paintOrder: 'stroke fill', textShadow: '3px 3px 0 #141414' }}>
            <span className="text-white">Black </span>
            <span className="text-red">Cipher</span>
          </span>
        </p>
        <div className="flex items-center gap-2">
          {onClose ? (
            <button type="button" onClick={onClose} className="inline-flex items-center gap-2 border-2 border-white/60 px-2.5 py-1 font-display text-base uppercase tracking-comic text-white hover:border-yellow hover:text-yellow" aria-label="Close story">
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
          ) : null}
        </div>
      </div>

      {/* stage */}
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-3 sm:px-8">
        <div className="relative aspect-video w-full max-w-[min(1180px,calc((100dvh-10rem)*16/9))] [container-type:size]">
          <div className="absolute -inset-1 rounded-sm bg-cyan/20 blur-md" aria-hidden />
          <div className="absolute inset-0 overflow-hidden border border-cyan/50 bg-black">
            {showingFilm ? (
              <div className="absolute inset-0 bg-ink">
                <video
                  ref={videoRef}
                  className="h-full w-full object-contain"
                  src={FILM_SRC}
                  autoPlay={autoplay}
                  playsInline
                  muted
                  preload="auto"
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    if (startAt >= LAST && !autoplay) endFilm();
                    else if (startAt > 0) {
                      v.currentTime = FILM_STARTS[clamp(startAt)] + 0.01;
                      if (!autoplay) v.pause();
                    }
                  }}
                  onPlay={() => {
                    setPlaying(true);
                    setFilm((f) => (f.ended ? { ...f, ended: false } : f));
                  }}
                  onPause={() => setPlaying(false)}
                  onEnded={endFilm}
                  onTimeUpdate={(e) => {
                    const i = shotAt(e.currentTarget.currentTime);
                    if (i !== filmPage) setFilmPage(i);
                  }}
                  onError={() => setFilm((f) => ({ ...f, available: false }))}
                >
                  {film.subtitles ? <track kind="subtitles" src={FILM_SUBS} srcLang="en" label="English" default /> : null}
                </video>
                {film.ended ? closing : null}
              </div>
            ) : null}

            <AnimatePresence mode="sync" initial>
              {holding ? null : (
                <motion.div key={index} className="absolute inset-0" initial={reduce ? { opacity: 0 } : cut.initial} animate={reduce ? { opacity: 1 } : cut.animate} exit={reduce ? { opacity: 0 } : cut.exit} transition={reduce ? { duration: 0.2 } : cut.transition}>
                  {/* camera: still, with a handheld knock on impact pages (the sway lives in the scene) */}
                  <motion.div className="absolute inset-0 will-change-transform" initial={{ x: 0, y: 0 }} animate={shake || { x: 0, y: 0 }}>
                    <Scene name={investigator} talking={Boolean(page.dialogue) && !reduce} omit={index === LAST ? 'cta' : undefined} />
                  </motion.div>

                  {/* burst */}
                  <AnimatePresence>
                    {page.burst && burstOn ? (
                      <motion.div key="burst" className="pointer-events-none absolute" style={{ left: `${page.burst.x}%`, top: `${page.burst.y}%` }} initial={{ scale: 0.2, rotate: -25, opacity: 0 }} animate={{ scale: 1, rotate: -6, opacity: 1 }} exit={{ scale: 1.2, opacity: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 14 }}>
                        <Burst tone={page.burst.tone} size="lg" tilt={0}>
                          {page.burst.text}
                        </Burst>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  {/* caption (only some shots carry a narrator line) */}
                  {caption ? (
                    <motion.div className="absolute left-4 right-4 top-[9%] sm:left-6 sm:right-auto sm:max-w-[62%]" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.35 }}>
                      <div className="border-l-4 border-cyan bg-ink/80 px-4 py-2.5 text-cyan sm:px-5 sm:py-3">
                        <p className="font-mono text-sm uppercase tracking-widest sm:text-base">
                          <Typewriter key={`${index}-${caption}`} text={caption} speed={reduce ? 0 : 22} delay={350} cursor={false} />
                        </p>
                      </div>
                    </motion.div>
                  ) : null}

                  {/* spoken line, as an anime subtitle */}
                  {page.dialogue ? (
                    <motion.div className="pointer-events-none absolute inset-x-0 bottom-[10%] flex justify-center px-6" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, duration: 0.3 }}>
                      <p className="max-w-[80%] text-center font-display text-2xl leading-tight tracking-comic text-white sm:text-4xl" style={{ textShadow: '3px 3px 0 #141414, -2px -2px 0 #141414, 2px -2px 0 #141414, -2px 2px 0 #141414' }}>
                        <span className="text-yellow">{page.dialogue.who}: </span>
                        {fill(page.dialogue.text)}
                      </p>
                    </motion.div>
                  ) : null}

                  {/* the last page holds the closing controls (its own lettering is left out) */}
                  {index === LAST ? closing : null}
                </motion.div>
              )}
            </AnimatePresence>

            {/* cinema layer for the pages: vignette, grain, flash frames */}
            {!holding ? (
              <>
                <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(20,20,20,0.55) 100%)' }} aria-hidden />
                {!reduce ? <div className="pointer-events-none absolute -inset-[10%] opacity-[0.09] mix-blend-multiply animate-grain" style={{ backgroundImage: GRAIN, backgroundSize: '200px 200px' }} aria-hidden /> : null}
                <AnimatePresence>
                  {flash === 'white' ? <motion.div key="white" className="pointer-events-none absolute inset-0 bg-white" initial={{ opacity: 1 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} aria-hidden /> : null}
                  {flash === 'invert' ? <div key="invert" className="pointer-events-none absolute inset-0 bg-white mix-blend-difference" aria-hidden /> : null}
                </AnimatePresence>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* controls */}
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 px-4 py-3 sm:gap-3 sm:px-6 sm:py-4">
        <button type="button" onClick={prev} disabled={!showingFilm && index === 0} className="inline-flex h-10 w-10 items-center justify-center border-2 border-white text-white hover:bg-white hover:text-ink disabled:opacity-30" aria-label="Previous shot">
          <ChevronLeft className="h-5 w-5" strokeWidth={2.6} />
        </button>
        <button type="button" onClick={togglePlay} className="inline-flex h-10 items-center gap-2 border-2 border-white px-3 font-display text-lg uppercase tracking-comic text-white hover:bg-white hover:text-ink" aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause className="h-4 w-4" strokeWidth={2.6} /> : <Play className="h-4 w-4" strokeWidth={2.6} />}
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" onClick={next} disabled={atEnd} className="inline-flex h-10 w-10 items-center justify-center border-2 border-white text-white hover:bg-white hover:text-ink disabled:opacity-30" aria-label="Next shot">
          <ChevronRight className="h-5 w-5" strokeWidth={2.6} />
        </button>
        <div className="mx-2 flex items-center gap-1.5" aria-hidden>
          {INTRO_SCRIPT.map((_, i) => (
            <button key={i} type="button" onClick={() => jump(i)} className={cn('h-2.5 w-2.5 border border-white transition-colors', i === shown ? 'bg-yellow' : i < shown ? 'bg-white' : 'bg-transparent')} aria-label={`Go to shot ${i + 1}`} />
          ))}
        </div>
        {!atEnd ? (
          <button type="button" onClick={skip} className="inline-flex h-10 items-center gap-2 border-2 border-yellow px-3 font-display text-lg uppercase tracking-comic text-yellow hover:bg-yellow hover:text-ink">
            <SkipForward className="h-4 w-4" strokeWidth={2.6} /> Skip story
          </button>
        ) : (
          <button type="button" onClick={again} className="inline-flex h-10 items-center gap-2 border-2 border-white px-3 font-display text-lg uppercase tracking-comic text-white hover:bg-white hover:text-ink">
            <RotateCcw className="h-4 w-4" strokeWidth={2.6} /> Watch again
          </button>
        )}
      </div>

      {/* written briefing */}
      <AnimatePresence>
        {showText ? (
          <motion.div key="text" className="absolute inset-0 z-20 flex items-center justify-center bg-ink/80 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowText(false)}>
            <motion.div className="panel-raised relative mt-4 max-h-[85vh] w-full max-w-2xl overflow-y-auto bg-paper p-6 text-ink sm:p-8" initial={{ scale: 0.9, rotate: -1.5 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0.95 }} onClick={(e) => e.stopPropagation()}>
              <span className="caption-red absolute -top-4 left-6 text-base">Classified briefing</span>
              <button type="button" onClick={() => setShowText(false)} className="absolute right-3 top-3 border-2 border-ink bg-white p-1 shadow-comic-sm hover:bg-yellow" aria-label="Close briefing">
                <X className="h-4 w-4" strokeWidth={3} />
              </button>
              <pre className="mt-3 whitespace-pre-wrap font-body text-[1.02rem] font-bold leading-[1.75]">{(briefing?.text || '').replace('{{investigator}}', investigator)}</pre>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
