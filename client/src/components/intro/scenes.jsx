import { useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { FX, CINEMA } from './fx.js';
import { boxPx, textStyle, plateStyle, textRuns, plainText, tokens, resolve, STAGGER, TYPE_CPS, sway, LEAKS, bokeh as bokehDiscs, burstRays, FONTS, STAGE_W, STAGE_H, PX, PW, PH } from './typeset.js';

/*
 * The intro's fifteen illustrated panels — the official story introduction
 * — served from client/public/intro/panel-NN.jpg. Each page shows the full
 * panel, inked and shadowed like a comic panel, on a blurred fill of
 * itself, with the animatic motion from fx.js on top: the page's lettering
 * typeset live in its comic voices (the art carries none) and arriving
 * with its entrance (slam, pop, typewriter, word by word, glitch…),
 * artwork materialising in sequence, speed-line bursts on the impacts,
 * ripples and HUD rings on the cores, vehicles crossing the sky, glows,
 * light sweeps, flickering feeds — under a handheld sway, a drifting light
 * leak, lens streaks on the bright sources, bokeh, motes and a scanline
 * veil, with glitch bands on the temporal shots.
 *
 * Everything is drawn as HTML layers on a 1600 × 900 stage scaled to fit,
 * and every motion is a CSS animation of transform or opacity — so the
 * browser composites the page on the GPU and nothing repaints frame by
 * frame. The film (client/public/intro.mp4) is rendered from the same spec
 * by tools/film/panels.template.html, which drives the same layers by time.
 *
 * To replace a panel, drop a new image at the same path (3:2, ≥1200 px
 * wide, without lettering — see tools/film/README.md).
 */

const PANELS = 15;
const key = (n) => `panel${String(n).padStart(2, '0')}`;
const px = (v) => `${Number(v).toFixed(2)}px`;
const sec = (v) => `${Number(v).toFixed(3)}s`;

/** Every sprite file the pages use (StoryIntro preloads them). */
export const SPRITES = [...new Set(Object.values(FX).flat().filter((f) => f.type === 'sprite').map((f) => f.src))];

/** The header entry (number, title, box) of a scene. */
export function headerOf(sceneKey) {
  return (FX[sceneKey] || []).find((f) => f.type === 'header') || null;
}

/* ── the motion, as CSS ─────────────────────────────────────────────── */
const swayFrames = (() => {
  // the handheld sway, sampled into a 24 s alternating loop
  const steps = 24;
  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    const s = sway(i, 3);
    out.push(`${((i / steps) * 100).toFixed(2)}% { transform: translate(${s.x.toFixed(2)}px, ${s.y.toFixed(2)}px) rotate(${s.r.toFixed(3)}deg) }`);
  }
  return out.join(' ');
})();

const CSS = `
.ipg { position: absolute; inset: 0; overflow: hidden; background: #000; }
.ipg .stage { position: absolute; left: 0; top: 0; width: ${STAGE_W}px; height: ${STAGE_H}px; transform-origin: 0 0; }
.ipg .bgfill { position: absolute; inset: -4%; background-size: cover; background-position: center; }
.ipg .cam { position: absolute; inset: 0; will-change: transform; animation: ip-sway 24s linear infinite alternate; }
.ipg .panel { position: absolute; left: ${PX}px; top: 0; width: ${PW}px; height: ${PH}px; background-size: 100% 100%; box-shadow: 14px 14px 0 rgba(0,0,0,.85), 0 0 60px rgba(0,0,0,.7); }
.ipg .frame { position: absolute; left: ${PX + 3}px; top: 3px; width: ${PW - 6}px; height: ${PH - 6}px; box-sizing: border-box; border: 6px solid #141414; }
.ipg .fx { position: absolute; pointer-events: none; }
.ipg .copy { background-size: ${PW}px ${PH}px; }
.ipg .cover { background-size: ${PW}px ${PH}px; opacity: 1; animation: ip-out both;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%), linear-gradient(180deg, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%);
  -webkit-mask-composite: source-in; mask-image: linear-gradient(90deg, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%), linear-gradient(180deg, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%); mask-composite: intersect; }
.ipg .cover::after { content: ''; position: absolute; inset: 0; background: rgba(2,5,12,.72); }
.ipg .scanline { height: 22px; margin-top: -11px; mix-blend-mode: screen; opacity: 0; background: linear-gradient(180deg, rgba(160,235,255,0) 0%, rgba(200,245,255,.95) 50%, rgba(160,235,255,0) 100%); animation: ip-scanline linear both; }
.ipg .glow { mix-blend-mode: screen; animation: ip-pulse ease-in-out infinite; }
.ipg .pulse { mix-blend-mode: screen; filter: brightness(1.7) saturate(1.8); animation: ip-pulse ease-in-out infinite; }
.ipg .gate { opacity: 0; animation: ip-gate .5s ease-out both; }
.ipg .sweep { left: -50%; top: -20%; width: 200%; height: 140%; mix-blend-mode: screen; opacity: 0; background: linear-gradient(105deg, transparent 44%, rgba(255,255,255,.28) 50%, transparent 56%); transform: skewX(-15deg); animation: ip-sweep linear both; }
.ipg .shine { overflow: hidden; mix-blend-mode: screen; }
.ipg .shine > div { position: absolute; top: -20%; left: 0; width: 40%; height: 140%; opacity: .8; background: linear-gradient(100deg, transparent 20%, rgba(255,255,255,.55) 50%, transparent 80%); transform: translateX(-100%); animation: ip-shine linear both; }
.ipg .text { overflow: visible; }
.ipg .text .tw { width: 100%; height: 100%; transform-origin: 50% 50%; animation-fill-mode: both; animation-timing-function: ease-out; }
.ipg .text .tx { width: 100%; height: 100%; }
.ipg .tok { display: inline-block; animation: ip-word-pop .38s ease-out both; }
.ipg .chr { display: inline-block; max-width: 0; overflow: hidden; vertical-align: baseline; opacity: 0; animation: ip-tok-in .01s linear both; }
.ipg .chr.keep { display: inline; max-width: none; overflow: visible; }
.ipg .caret { opacity: 0; animation: ip-caret .7s steps(1, end) forwards; }
.ipg .spin, .ipg .ripple { mix-blend-mode: screen; overflow: visible; }
.ipg .spin circle { fill: none; stroke-linecap: round; }
.ipg .spin g { transform-origin: 0 0; animation: ip-spin linear infinite; }
.ipg .ripple circle { fill: none; stroke-width: 2px; opacity: 0; transform-origin: 0 0; animation: ip-ripple ease-out infinite; }
.ipg .burst { overflow: visible; opacity: 0; mix-blend-mode: screen; transform-origin: 50% 50%; animation: ip-burst ease-out both; }
.ipg .sprite { position: absolute; left: 0; top: 0; opacity: 0; filter: drop-shadow(0 2px 3px rgba(0,0,0,.45)); animation-timing-function: linear; animation-fill-mode: both; }
.ipg .streak { position: absolute; mix-blend-mode: screen; animation: ip-streak ease-in-out infinite; }
.ipg .streak .line { position: absolute; left: 0; right: 0; top: 50%; height: 3px; margin-top: -1.5px; background: linear-gradient(90deg, rgba(127,227,255,0) 0%, rgba(255,255,255,.9) 50%, rgba(127,227,255,0) 100%); }
.ipg .streak .wide { position: absolute; left: 0; right: 0; top: 50%; height: 10px; margin-top: -5px; opacity: .35; filter: blur(4px); background: linear-gradient(90deg, rgba(127,227,255,0) 0%, rgba(255,255,255,.9) 50%, rgba(127,227,255,0) 100%); }
.ipg .streak .dot { position: absolute; left: 50%; top: 50%; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: #fff; filter: blur(3px); opacity: .9; }
.ipg .hdr { position: absolute; display: flex; align-items: stretch; color: #fff; opacity: 0; filter: drop-shadow(6px 6px 0 #141414); transform-origin: 0 50%; animation: ip-hdr .5s ease-out .25s both; }
.ipg .hdr .badge { display: flex; align-items: center; justify-content: center; box-sizing: border-box; background: #ffd23b; color: #141414; border: 3px solid #141414; font-family: ${FONTS.comic}; font-weight: 400; letter-spacing: .02em; line-height: 1; }
.ipg .hdr .title { display: flex; align-items: center; flex: 1; min-width: 0; box-sizing: border-box; background: #0b0b0d; border: 3px solid #141414; border-left: 0; font-family: ${FONTS.display}; font-weight: 600; letter-spacing: .06em; white-space: nowrap; line-height: 1; }
.ipg .gband { position: absolute; left: ${PX}px; width: ${PW}px; background-size: ${PW}px ${PH}px; opacity: 0; animation: ip-gband linear infinite; }
.ipg .pflicker { position: absolute; inset: 0; background: #000; opacity: 0; animation: ip-pflicker .9s steps(1, end) both; }
.ipg .redpulse { position: absolute; inset: 0; mix-blend-mode: screen; background: radial-gradient(ellipse at center, rgba(255,42,42,.35) 0%, rgba(120,0,0,.22) 50%, rgba(120,0,0,0) 100%); animation: ip-red 1.05s ease-in-out infinite; }
.ipg .leak { position: absolute; left: 180px; top: 30px; width: 1240px; height: 840px; mix-blend-mode: screen; opacity: .35; animation: ip-leak 22s ease-in-out infinite; }
.ipg .disc { position: absolute; border-radius: 50%; mix-blend-mode: screen; animation: ip-drift ease-in-out infinite; }
.ipg .mote { position: absolute; border-radius: 50%; animation: ip-drift ease-in-out infinite; }
.ipg .scan { position: absolute; inset: 0; background: repeating-linear-gradient(0deg, rgba(0,0,0,.14) 0 2px, transparent 2px 4px); opacity: .5; }
.ipg.reduce * { animation-duration: .01s !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; animation-fill-mode: both !important; }
@keyframes ip-sway { ${swayFrames} }
@keyframes ip-in-slam { 0% { opacity: 0; transform: scale(2.1) rotate(-7deg) } 55% { opacity: 1; transform: scale(.94) rotate(1.5deg) } 80% { transform: scale(1.03) rotate(-.5deg) } 100% { opacity: 1; transform: none } }
@keyframes ip-in-pop { 0% { opacity: 0; transform: scale(.4) } 70% { opacity: 1; transform: scale(1.1) } 100% { opacity: 1; transform: none } }
@keyframes ip-in-glitch { 0% { opacity: 0; transform: translateX(0); filter: drop-shadow(3.5px 0 #ff2a6d) drop-shadow(-3.5px 0 #22d3ee) } 10% { opacity: 1; transform: translateX(-12px); filter: drop-shadow(3.2px 0 #ff2a6d) drop-shadow(-3.2px 0 #22d3ee) blur(1.2px) } 25% { transform: translateX(10px); filter: drop-shadow(2.6px 0 #ff2a6d) drop-shadow(-2.6px 0 #22d3ee) } 40% { transform: translateX(-7px); filter: drop-shadow(2px 0 #ff2a6d) drop-shadow(-2px 0 #22d3ee) blur(.8px) } 60% { transform: translateX(4px); filter: drop-shadow(1.2px 0 #ff2a6d) drop-shadow(-1.2px 0 #22d3ee) } 80% { transform: translateX(-2px); filter: drop-shadow(.5px 0 #ff2a6d) drop-shadow(-.5px 0 #22d3ee) } 100% { opacity: 1; transform: none; filter: none } }
@keyframes ip-in-wipe { from { clip-path: inset(0 100% 0 0) } to { clip-path: inset(0 0 0 0) } }
@keyframes ip-in-up { from { opacity: 0; transform: translateY(44px) } to { opacity: 1; transform: none } }
@keyframes ip-in-down { from { opacity: 0; transform: translateY(-44px) } to { opacity: 1; transform: none } }
@keyframes ip-in-left { from { opacity: 0; transform: translateX(-70px) } to { opacity: 1; transform: none } }
@keyframes ip-in-right { from { opacity: 0; transform: translateX(70px) } to { opacity: 1; transform: none } }
@keyframes ip-in-none { from { opacity: 0 } to { opacity: 1 } }
@keyframes ip-in-type { from { opacity: 1 } to { opacity: 1 } }
@keyframes ip-tok-in { from { opacity: 0; max-width: 0 } to { opacity: 1; max-width: 2em } }
@keyframes ip-word-pop { 0% { opacity: 0; transform: translateY(.3em) scale(.5) } 65% { opacity: 1; transform: translateY(-.05em) scale(1.12) } 100% { opacity: 1; transform: none } }
@keyframes ip-caret { 0% { opacity: 1 } 50% { opacity: 0 } 100% { opacity: 0 } }
@keyframes ip-blink { 0% { opacity: 1 } 50% { opacity: 0 } 100% { opacity: 0 } }
@keyframes ip-pulse { 0%, 100% { opacity: var(--lo) } 50% { opacity: var(--hi) } }
@keyframes ip-gate { from { opacity: 0 } to { opacity: 1 } }
@keyframes ip-out { from { opacity: 1 } to { opacity: 0 } }
@keyframes ip-scanline { 0% { opacity: 0; transform: translateY(0) } 10% { opacity: .9; transform: translateY(calc(var(--h) * .1)) } 70% { opacity: .6; transform: translateY(calc(var(--h) * .8)) } 100% { opacity: 0; transform: translateY(var(--h)) } }
@keyframes ip-spin { to { transform: rotate(var(--turn)) } }
@keyframes ip-ripple { 0% { transform: scale(.2); opacity: var(--op) } 100% { transform: scale(1); opacity: 0 } }
@keyframes ip-burst { 0% { opacity: 0; transform: scale(.72) } 12% { opacity: .6; transform: scale(1) } 55% { opacity: .42; transform: scale(1.1) } 100% { opacity: 0; transform: scale(1.2) } }
@keyframes ip-sweep { 0% { opacity: 0; transform: skewX(-15deg) translateX(-60%) } 20% { opacity: 1 } 80% { opacity: 1 } 100% { opacity: 0; transform: skewX(-15deg) translateX(60%) } }
@keyframes ip-shine { from { transform: translateX(-100%) } to { transform: translateX(250%) } }
@keyframes ip-hdr { 0% { opacity: 0; transform: translateX(-60px) scale(.9) } 70% { opacity: 1; transform: translateX(6px) scale(1.02) } 100% { opacity: 1; transform: none } }
@keyframes ip-pflicker { 0% { opacity: 0 } 11% { opacity: .75 } 22% { opacity: 0 } 33% { opacity: .5 } 44% { opacity: 0 } 55% { opacity: .8 } 66% { opacity: 0 } 77% { opacity: .3 } 100% { opacity: 0 } }
@keyframes ip-red { 0%, 100% { opacity: .3 } 50% { opacity: 1 } }
@keyframes ip-streak { 0%, 100% { opacity: .35 } 30% { opacity: .85 } 55% { opacity: .5 } 75% { opacity: .9 } }
@keyframes ip-drift { 0%, 100% { transform: translate(0, 0); opacity: var(--lo) } 50% { transform: translate(var(--dx), var(--dy)); opacity: var(--hi) } }
@keyframes ip-leak { 0% { transform: translate(-380px, -230px); opacity: .3 } 33% { transform: translate(480px, 220px); opacity: .55 } 66% { transform: translate(-280px, 380px); opacity: .35 } 100% { transform: translate(-380px, -230px); opacity: .3 } }
@keyframes ip-gband { 0% { opacity: 0; transform: translateX(0) } 5% { opacity: 1; transform: translateX(var(--a)) } 12% { transform: translateX(0) } 19% { transform: translateX(var(--b)) } 26% { opacity: 1; transform: translateX(0) } 27%, 100% { opacity: 0 } }
`;

/* per-page keyframes that depend on the spec (sprite paths, feed flickers) */
function pageCss(k, spec) {
  const out = [];
  spec.forEach((f, i) => {
    if (f.type === 'sprite') {
      const w = (f.w || 0.1) * PW;
      const at = (p) => `translate(calc(${(PX + (f.from[0] + (f.to[0] - f.from[0]) * p) * PW).toFixed(2)}px - 50%), calc(${((f.from[1] + (f.to[1] - f.from[1]) * p) * PH - w * 0.06 * Math.sin(p * Math.PI)).toFixed(2)}px - 50%))`;
      out.push(`@keyframes ip-sp-${k}-${i} { 0% { transform: ${at(0)}; opacity: 0 } 8% { transform: ${at(0.08)}; opacity: 1 } 50% { transform: ${at(0.5)}; opacity: 1 } 92% { transform: ${at(0.92)}; opacity: 1 } 100% { transform: ${at(1)}; opacity: 0 } }`);
    }
    if (f.type === 'flicker') {
      const every = f.every || 1.5;
      const frames = [];
      for (let j = 0; j <= 7; j += 1) {
        const t = j * 0.04;
        const on = j % 2 ? 0.95 : 0.4;
        frames.push(`${((t / every) * 100).toFixed(3)}% { opacity: ${on}; transform: translate(${j % 2 ? -6 : 6}px, ${j % 3 === 0 ? 3 : -3}px); filter: brightness(${j % 2 ? 1.7 : 0.6}) contrast(1.3) }`);
      }
      frames.push(`${((0.28 / every) * 100).toFixed(3)}%, 100% { opacity: 0 }`);
      out.push(`@keyframes ip-fl-${k}-${i} { ${frames.join(' ')} }`);
    }
  });
  return out.join('\n');
}

/* ── one line of lettering ──────────────────────────────────────────── */
function TextFx({ f: entry }) {
  const f = resolve(entry);
  const b = boxPx(f.box);
  const at = f.at || 0;
  const dur = f.dur || 0.5;
  const from = f.from || 'up';
  const style = textStyle(f);
  const plate = plateStyle(f);
  const accent = f.accent || '#7fe3ff';
  let content;
  if (from === 'type') {
    const cps = f.cps || TYPE_CPS;
    const toks = tokens(f, 'type');
    const n = toks.filter((t) => !t.lineBreak).length;
    const cycles = Math.max(1, Math.ceil(n / cps / 0.7));
    content = (
      <>
        {toks.map((tk, k) => (tk.lineBreak ? '\n' : <span key={k} className={f.align === 'center' ? 'chr keep' : 'chr'} style={{ animationDelay: sec(at + tk.i / cps), color: tk.accent ? accent : undefined }}>{tk.t}</span>))}
        <span className="caret" style={{ animationDelay: sec(at), animationIterationCount: f.caret ? 'infinite' : cycles }}>{f.caretChar || '▌'}</span>
      </>
    );
  } else if (from === 'words') {
    const st = f.stagger || STAGGER;
    content = tokens(f, 'words').map((tk, k) => (tk.lineBreak ? '\n' : tk.space ? tk.t : <span key={k} className="tok" style={{ animationDelay: sec(at + tk.i * st), color: tk.accent ? accent : undefined }}>{tk.t}</span>));
  } else {
    content = textRuns(f).map((runs, li) => (
      <span key={li}>
        {li > 0 ? '\n' : null}
        {runs.map((r, ri) => (r.accent ? <span key={ri} style={{ color: accent }}>{r.t}</span> : r.t))}
      </span>
    ));
  }
  const entrance = f.blink
    ? { animationName: 'ip-blink', animationDuration: sec(f.blink), animationDelay: sec(at), animationIterationCount: 'infinite', animationTimingFunction: 'steps(1, end)' }
    : { animationName: `ip-in-${from === 'words' ? 'type' : from}`, animationDuration: sec(from === 'type' || from === 'words' ? 0.01 : dur), animationDelay: sec(at), animationTimingFunction: from === 'wipe' || from === 'glitch' ? 'linear' : 'ease-out' };
  return (
    <div className="fx text" style={{ left: px(b.x), top: px(b.y), width: px(b.w), height: px(b.h) }} aria-label={plainText(f)}>
      <div className="tw" style={entrance}>
        <div className="tx" style={style}>
          <span style={plate || undefined}>{content}</span>
        </div>
      </div>
    </div>
  );
}

/* ── one animatic effect ────────────────────────────────────────────── */
function Effect({ k, href, bgHref, f, i }) {
  const b = f.box ? boxPx(f.box) : null;
  const at = f.at || 0;
  const pos = b ? { left: px(b.x), top: px(b.y), width: px(b.w), height: px(b.h) } : {};
  const artAt = (image) => ({ backgroundImage: `url(${image})`, backgroundPosition: `${px(-(b.x - PX))} ${px(-b.y)}` });
  if (f.type === 'text') return <TextFx f={f} />;
  if (f.type === 'reveal') {
    const dur = f.dur || 0.6;
    return (
      <>
        <div className="fx cover" style={{ ...pos, ...artAt(bgHref), animationDuration: sec(dur * 0.3 + 0.25), animationDelay: sec(at + dur * 0.7) }} />
        <div className="fx copy" style={{ ...pos, ...artAt(href), animationName: `ip-in-${f.from || 'up'}`, animationDuration: sec(dur), animationDelay: sec(at), animationTimingFunction: 'ease-out', animationFillMode: 'both' }} />
        <div className="fx scanline" style={{ left: px(b.x), top: px(b.y), width: px(b.w), '--h': px(b.h), animationDuration: sec(dur + 0.25), animationDelay: sec(at) }} />
      </>
    );
  }
  if (f.type === 'glow' || f.type === 'pulse') {
    const op = f.opacity || 0.3;
    const tilt = f.rotate ? { transform: `rotate(${f.rotate}deg)`, transformOrigin: '50% 50%' } : {};
    const inner = f.type === 'glow'
      ? <div className="fx glow" style={{ ...pos, ...tilt, background: `radial-gradient(ellipse at center, ${f.color} 0%, transparent 70%)`, '--lo': op * 0.35, '--hi': op, animationDuration: sec(f.period || 2) }} />
      : <div className="fx pulse copy" style={{ ...pos, ...tilt, ...artAt(href), '--lo': op * 0.35, '--hi': op, animationDuration: sec(f.period || 2) }} />;
    return <div className="fx gate" style={{ inset: 0, animationDelay: sec(at) }}>{inner}</div>;
  }
  if (f.type === 'sweep') return <div className="fx sweep" style={{ animationDuration: sec(f.dur || 2), animationDelay: sec(at) }} />;
  if (f.type === 'shine') {
    return (
      <div className="fx shine" style={pos}>
        <div style={{ animationDuration: sec(f.dur || 1.2), animationDelay: sec(at) }} />
      </div>
    );
  }
  if (f.type === 'flicker') {
    return <div className="fx copy" style={{ ...pos, ...artAt(href), opacity: 0, animation: `ip-fl-${k}-${i} ${sec(f.every || 1.5)} steps(1, end) ${sec(at + 0.2)} infinite` }} />;
  }
  if (f.type === 'spin') {
    const R = Math.min(b.w, b.h) / 2;
    const n = f.rings || 3;
    const dir = f.reverse ? -1 : 1;
    const color = f.color || '#9fe8ff';
    return (
      <svg className="fx spin" viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`} style={{ left: px(b.x + b.w / 2 - R), top: px(b.y + b.h / 2 - R), width: px(2 * R), height: px(2 * R), opacity: f.opacity || 0.5 }}>
        {Array.from({ length: n }).map((_, r) => {
          const rad = R * (0.5 + (0.5 * r) / Math.max(1, n - 1));
          const dash = r % 2 ? `${rad * 0.9} ${rad * 0.5} ${rad * 0.2} ${rad * 0.35}` : `${rad * 0.25} ${rad * 0.45} ${rad * 1.4} ${rad * 0.6}`;
          return (
            <g key={r} style={{ '--turn': `${dir * (r % 2 ? -360 : 360)}deg`, animationDuration: sec((f.period || 12) * (1 + r * 0.35)) }}>
              <circle r={rad} stroke={color} strokeWidth={r === 0 ? 3 : 2} strokeDasharray={dash} />
              <circle r={rad} stroke={color} strokeWidth="0.8" opacity="0.5" />
              <circle cx={rad} cy="0" r="4" fill={color} stroke="none" />
            </g>
          );
        })}
      </svg>
    );
  }
  if (f.type === 'ripple') {
    const R = Math.min(b.w, b.h) / 2;
    const n = f.rings || 3;
    const period = f.period || 3;
    return (
      <svg className="fx ripple" viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`} style={{ left: px(b.x + b.w / 2 - R), top: px(b.y + b.h / 2 - R), width: px(2 * R), height: px(2 * R) }}>
        {Array.from({ length: n }).map((_, r) => (
          <circle key={r} r={R} stroke={f.color || '#9fe8ff'} style={{ '--op': f.opacity || 0.5, animationDuration: sec(period), animationDelay: sec(at - (r * period) / n) }} />
        ))}
      </svg>
    );
  }
  if (f.type === 'burst') {
    const R = (Math.max(b.w, b.h) / 2) * (f.scale || 1.4);
    return (
      <svg className="fx burst" viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`} style={{ left: px(b.x + b.w / 2 - R), top: px(b.y + b.h / 2 - R), width: px(2 * R), height: px(2 * R), animationDuration: sec(f.dur || 0.45), animationDelay: sec(at) }}>
        {burstRays(f.rays || 28, i + 1).map((r, j) => {
          const x0 = Math.cos(r.a) * r.r0 * R;
          const y0 = Math.sin(r.a) * r.r0 * R;
          const x1 = Math.cos(r.a) * r.r1 * R;
          const y1 = Math.sin(r.a) * r.r1 * R;
          const nx = -Math.sin(r.a) * r.w * R;
          const ny = Math.cos(r.a) * r.w * R;
          return <polygon key={j} points={`${x0 + nx},${y0 + ny} ${x0 - nx},${y0 - ny} ${x1},${y1}`} fill={f.color || '#ffffff'} />;
        })}
      </svg>
    );
  }
  if (f.type === 'sprite') {
    return <img className="sprite" src={`/intro/sprites/${f.src}`} alt="" style={{ width: px((f.w || 0.1) * PW), animationName: `ip-sp-${k}-${i}`, animationDuration: sec(f.dur || 8), animationDelay: sec(at) }} />;
  }
  return null; // header (drawn by Page) · erase (a tool's business)
}

/* ── the stage, scaled to its box ───────────────────────────────────── */
function useStageScale() {
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => setScale(el.clientWidth / STAGE_W);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, scale];
}

/* One page: the panel, its lettering and motion, on its blurred fill. */
function Page({ n, glitch = false, red = false, flicker = false, omit }) {
  const reduce = useReducedMotion();
  const [ref, scale] = useStageScale();
  const k = key(n);
  const href = `/intro/panel-${String(n).padStart(2, '0')}.jpg`;
  const bgHref = `/intro/panel-${String(n).padStart(2, '0')}-bg.jpg`;
  const cinema = CINEMA[k] || {};
  const spec = (FX[k] || []).filter((f) => !omit || f.role !== omit);
  const header = spec.find((f) => f.type === 'header');
  const hb = header ? boxPx(header.box) : null;
  const discs = bokehDiscs(0, n, cinema.bokeh ?? 0.7);
  return (
    <div ref={ref} className={`ipg${reduce ? ' reduce' : ''}`} role="img" aria-label={`Intro panel ${n}`}>
      <style>{CSS + pageCss(k, spec)}</style>
      <div className="stage" style={{ transform: `scale(${scale})` }}>
        <div className="bgfill" style={{ backgroundImage: `url(${bgHref})` }} />
        <div className="cam" style={{ animationDelay: sec(-n * 3.1) }}>
          <div className="panel" style={{ backgroundImage: `url(${href})` }} />
          {spec.map((f, i) => (
            <Effect key={i} k={k} href={href} bgHref={bgHref} f={f} i={i} />
          ))}
          {(cinema.streaks || []).map(([x, y, len], i) => {
            const w = len * PW;
            return (
              <div key={i} className="streak" style={{ left: px(PX + x * PW - w / 2), top: px(y * PH - 10), width: px(w), height: '20px', animationDuration: sec(5 + i), animationDelay: sec(-i * 1.3) }}>
                <div className="wide" />
                <div className="line" />
                <div className="dot" />
              </div>
            );
          })}
          <div className="frame" />
        </div>
        {glitch
          ? [[130, 26], [330, 16], [470, 40], [640, 18], [760, 30]].map(([y, h], i) => (
              <div key={i} className="gband" style={{ top: px(y), height: px(h), backgroundImage: `url(${href})`, backgroundPosition: `0 ${px(-y)}`, filter: i % 2 ? 'hue-rotate(150deg) saturate(2)' : 'hue-rotate(-120deg) saturate(2)', '--a': px((i % 2 ? -1 : 1) * (28 + i * 10)), '--b': px((i % 2 ? 1 : -1) * (16 + i * 6)), animationDuration: sec(n === 4 ? 1.4 : 1.6), animationDelay: sec(0.3 + i * 0.04) }} />
            ))
          : null}
        {flicker ? <div className="pflicker" style={{ animationDelay: '2s' }} /> : null}
        {red ? <div className="redpulse" /> : null}
        {header ? (
          <div className="hdr" style={{ left: px(hb.x), top: px(hb.y), width: px(hb.w), height: px(hb.h) }}>
            <div className="badge" style={{ width: px(hb.h * 1.05), fontSize: px(hb.h * 0.74) }}>{header.n}</div>
            <div className="title" style={{ paddingLeft: px(hb.h * 0.5), fontSize: px(hb.h * 0.5) }}>{header.text}</div>
          </div>
        ) : null}
        <div className="leak" style={{ background: `radial-gradient(ellipse at center, ${(LEAKS[cinema.leak] || LEAKS.cyan)[0]} 0%, ${(LEAKS[cinema.leak] || LEAKS.cyan)[1]} 45%, rgba(0,0,0,0) 70%)`, animationDelay: sec(-n * 2.7) }} />
        {discs.map((d, i) => (
          <div key={i} className="disc" style={{ left: px(d.x - d.r), top: px(d.y - d.r), width: px(d.r * 2), height: px(d.r * 2), background: `radial-gradient(circle, ${d.warm ? 'rgba(255,217,168,.9)' : 'rgba(191,239,255,.9)'} 0%, ${d.warm ? 'rgba(255,217,168,.4)' : 'rgba(191,239,255,.4)'} 60%, transparent 100%)`, '--lo': d.o, '--hi': d.o * 2.2, '--dx': px(40 * (i % 2 ? 1 : -1)), '--dy': px(-30 - (i % 3) * 8), animationDuration: sec(9 + (i % 4) * 2), animationDelay: sec(-(i % 5) * 0.7) }} />
        ))}
        {Array.from({ length: 12 }).map((_, i) => {
          const x = ((i * 397 + n * 131) % 1500) + 50;
          const y = ((i * 251 + n * 77) % 820) + 40;
          const r = 1.4 + ((i * 7) % 3);
          return <div key={`m${i}`} className="mote" style={{ left: px(x - r), top: px(y - r), width: px(r * 2), height: px(r * 2), background: i % 4 ? '#7fd8ff' : '#ffffff', '--lo': 0.15, '--hi': 0.8, '--dx': px((i % 2 ? 1 : -1) * 16), '--dy': px(-50 - (i % 4) * 14), animationDuration: sec(6 + (i % 5)), animationDelay: sec(-(i % 7) * 0.5) }} />;
        })}
        <div className="scan" />
      </div>
    </div>
  );
}

export const SCENES = {};
for (let n = 1; n <= PANELS; n += 1) {
  SCENES[key(n)] = function Scene({ omit }) {
    return <Page n={n} glitch={n === 4} red={n === 12} flicker={n === 3} omit={omit} />;
  };
}
