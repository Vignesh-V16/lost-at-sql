/*
 * Animatic motion and lettering for the fifteen illustrated panels — what
 * moves inside each slide, and every word that is typeset on it. Shared by
 * the in-app player (scenes.jsx + StoryIntro.jsx) and the film compositor
 * (tools/film/panels.template.html); the erase tool (tools/film/erase.py)
 * and the sprite cutter (tools/film/sprites.py) read it too.
 *
 * The panels in client/public/intro/ carry NO lettering: the artwork's own
 * captions were inpainted away (the lettered originals live in
 * tools/film/originals/) and every line is typeset again here, in the
 * page's own words, larger and in one consistent comic hand. Change a word
 * here, and both the pages and the film change.
 *
 * Boxes are fractions of the panel: [x, y, w, h] from the top-left. Times in
 * seconds from the start of the shot.
 *
 *   header   the page's number and title — drawn in screen space (it does
 *            not sway with the camera); its box is also erased from the art
 *   erase    a region of baked-in lettering that erase.py inpaints away
 *            (`fill: true` fills from the colours around it instead; `patch`
 *            lays the texture of another box of the art over the fill;
 *            `key: 'cyan' | 'white' | 'red' | [...]` erases only the letters'
 *            own colours, `guard` lines of the art crossing the box survive)
 *   text     a line (or lines, '\n') typeset in the box in one of the comic
 *            voices of typeset.js — `kind`: caption · impact · hud · label ·
 *            terminal · script · plain — with size (fraction of the panel
 *            height), color, align, spacing, glow, a `plate` (a comic
 *            caption box of its own), `accent` colour for **marked** words,
 *            rotate (deg), blink (s); it arrives at `at` — `from`: slam ·
 *            pop · type (typewriter, `cps`, `caret`) · words (one by one,
 *            `stagger`) · glitch · wipe · up · down · left · right · none
 *   reveal   the artwork in the box materialises: dimmed and blurred until
 *            `at`, then swept in by a scan line from `from` over `dur`
 *   glow     a soft pulsing light over a box — `color`, `period` (s), `opacity`
 *   pulse    the art in the box lights up and dims, in its own shape (a
 *            display, a sign) — `period`, `opacity`
 *   burst    a flash of thin comic speed lines around the box at `at`,
 *            screened over the art — `color`, `scale`, `rays`
 *   ripple   rings expanding from the box's centre, over and over
 *   spin     concentric HUD rings turning about the box's centre — `rings`,
 *            `period` (s for one turn), `color`, `opacity`, `reverse`
 *   sweep    a light band crossing the whole slide at `at`, lasting `dur`
 *   flicker  the box flickers and jitters like a failing feed, every `every` s
 *   shine    a glint sliding across a box (logos, titles) at `at`
 *   sprite   a cut-out (client/public/intro/sprites/`src`) crossing the
 *            panel from `from` to `to` (centres, fractions) over `dur` from
 *            `at`, `w` wide (fraction of the panel width); `cut` is the box
 *            it was cut from on the original (erased from the art)
 */
import { INK } from './typeset.js';

const seq = (boxes, at, gap, dur = 0.5, from = 'up') => boxes.map((box, i) => ({ type: 'reveal', box, at: at + i * gap, dur, from }));
const erase = (...boxes) => boxes.map((box) => ({ type: 'erase', box })); // lettering over art: inpainted
const fill = (...boxes) => boxes.map((box) => ({ type: 'erase', box, fill: true })); // lettering in a flat box: filled from the colours around it
const fillTex = (patch, ...boxes) => boxes.map((box) => ({ type: 'erase', box, fill: true, patch })); // …with the texture of a clean box of the same surface
const header = (n, text, box) => ({ type: 'header', n, text, box });
const text = (box, str, at, opts = {}) => ({ type: 'text', box, text: str, at, dur: 0.5, from: 'up', ...opts });
const burst = (box, at, opts = {}) => ({ type: 'burst', box, at, dur: 0.45, ...opts }); // place it BEFORE the line it punctuates, so the words stay on top
/* the page's colours (INK comes from typeset.js) */
const WHITE = '#ffffff';
const CYAN = '#7fe3ff';
const GREEN = '#4ade80';
const RED = '#ff3b3b';
const ICE = '#dff6ff';
const status = { kind: 'impact', color: GREEN, stroke: 0.035, strokeColor: '#052e16', glow: '#22c55e', hard: 0.05 };
const alarm = { kind: 'impact', color: RED, stroke: 0.04, strokeColor: '#3b0000', glow: '#ff1a1a', hard: 0.05 };

export const FX = {
  panel01: [
    header(1, 'A NEW ERA', [0, 0, 0.37, 0.1]),
    { type: 'erase', box: [0, 0.21, 0.465, 0.235], patch: [0, 0.1, 0.465, 0.11], tone: 0.85 }, // the art's black date box: sky again, clouds from above it
    ...erase([0.05, 0.505, 0.275, 0.085], [0.385, 0.945, 0.445, 0.05]),
    { type: 'sprite', src: 'panel-01-a.png', cut: [0.78, 0.01, 0.135, 0.15], w: 0.12, from: [0.6, 0.19], to: [0.99, 0.03], at: 0, dur: 9 },
    { type: 'sprite', src: 'panel-01-b.png', cut: [0.84, 0.225, 0.1, 0.1], w: 0.1, from: [1.06, 0.31], to: [0.7, 0.24], at: 0, dur: 9 },
    { type: 'sprite', src: 'panel-01-c.png', cut: [0.105, 0.68, 0.09, 0.06], w: 0.085, from: [-0.06, 0.75], to: [0.34, 0.68], at: 0, dur: 9 },
    text([0.03, 0.245, 0.41, 0.09], '17 SEPTEMBER 2045', 1.2, { kind: 'label', size: 0.066, weight: 700, outline: 0.03, hard: 0.05, from: 'slam', dur: 0.6 }),
    text([0.03, 0.34, 0.41, 0.09], '09:58 AM', 1.9, { kind: 'label', size: 0.066, weight: 700, outline: 0.03, hard: 0.05, from: 'slam', dur: 0.6 }),
    text([0.04, 0.49, 0.36, 0.12], 'A BRIGHTER TOMORROW\nBUILT BY INTELLIGENCE.', 3.0, { kind: 'caption', plate: true, size: 0.032, weight: 700, from: 'pop', dur: 0.5 }),
    { type: 'glow', box: [0.55, 0.7, 0.38, 0.18], color: '#7fd8ff', period: 3.2, opacity: 0.35 },
    { type: 'sweep', at: 3.0, dur: 2.2 },
    text([0.3, 0.935, 0.66, 0.06], 'WHERE IDEAS SHAPE A SMARTER WORLD.', 4.6, { kind: 'label', size: 0.036, spacing: 0.1, align: 'center', from: 'words' }),
  ],
  panel02: [
    header(2, 'BLACK CIPHER', [0, 0, 0.385, 0.1]),
    ...fill([0.09, 0.805, 0.4, 0.14], [0.66, 0.565, 0.31, 0.15], [0.71, 0.735, 0.275, 0.235]),
    { type: 'spin', box: [0.22, 0.03, 0.56, 0.66], rings: 3, period: 16, color: '#9fe8ff', opacity: 0.55 },
    { type: 'ripple', box: [0.24, 0.06, 0.52, 0.6], period: 3.5, rings: 3, color: '#bfefff', opacity: 0.45 },
    { type: 'glow', box: [0.24, 0.06, 0.52, 0.6], color: '#9fe8ff', period: 2.4, opacity: 0.3 },
    { type: 'shine', box: [0.24, 0.06, 0.52, 0.6], at: 0.6, dur: 1.6 },
    { type: 'reveal', box: [0.63, 0.54, 0.37, 0.46], at: 1.0, dur: 0.7, from: 'right' },
    text([0.665, 0.565, 0.3, 0.05], 'SYSTEM STATUS', 1.5, { kind: 'hud', size: 0.036, from: 'wipe', dur: 0.5 }),
    text([0.665, 0.615, 0.3, 0.11], 'ONLINE', 1.9, { ...status, size: 0.1, from: 'slam', dur: 0.5 }),
    text([0.715, 0.74, 0.27, 0.05], 'CORE STABLE', 2.4, { size: 0.034, from: 'words' }),
    text([0.715, 0.82, 0.27, 0.05], 'SECURITY NORMAL', 2.7, { size: 0.034, from: 'words' }),
    text([0.715, 0.9, 0.275, 0.05], 'ALL SYSTEMS OPERATIONAL', 3.0, { size: 0.031, from: 'words' }),
    { type: 'reveal', box: [0.0, 0.78, 0.64, 0.22], at: 2.6, dur: 0.6, from: 'up' },
    text([0.05, 0.8, 0.46, 0.11], 'BLACK CIPHER', 3.0, { kind: 'impact', size: 0.1, align: 'center', from: 'slam', dur: 0.6 }),
    text([0.05, 0.9, 0.46, 0.06], "THE WORLD'S MOST ADVANCED AI", 3.5, { kind: 'hud', color: '#cfe9ff', size: 0.037, spacing: 0.12, align: 'center', from: 'words', stagger: 0.09 }),
  ],
  panel03: [
    header(3, '09:58 AM', [0, 0, 0.3, 0.1]),
    ...fill([0.225, 0.825, 0.45, 0.145]),
    { type: 'pulse', box: [0.06, 0.37, 0.43, 0.29], period: 0.8, opacity: 0.6, at: 2.0 },
    burst([0.06, 0.37, 0.43, 0.29], 2.0, { color: '#ff9a9a', scale: 1.1 }),
    { type: 'reveal', box: [0.19, 0.78, 0.55, 0.2], at: 3.2, dur: 0.6, from: 'up' },
    text([0.22, 0.825, 0.49, 0.07], 'IN A SPLIT SECOND...', 3.5, { kind: 'caption', size: 0.054, align: 'center', from: 'type', cps: 30 }),
    text([0.22, 0.895, 0.49, 0.07], 'EVERYTHING CHANGED.', 4.4, { kind: 'caption', weight: 700, size: 0.054, align: 'center', from: 'slam', dur: 0.5 }),
  ],
  panel04: [
    header(4, 'THE DISAPPEARANCE', [0, 0, 0.49, 0.1]),
    ...fill([0.645, 0.365, 0.3, 0.29], [0.19, 0.815, 0.64, 0.14]),
    { type: 'spin', box: [0.14, 0.12, 0.56, 0.62], rings: 4, period: 7, color: '#e9a3ff', opacity: 0.45, reverse: true },
    { type: 'glow', box: [0.1, 0.1, 0.62, 0.66], color: '#c084fc', period: 0.9, opacity: 0.35 },
    { type: 'reveal', box: [0.62, 0.34, 0.37, 0.37], at: 0.6, dur: 0.5, from: 'none' },
    { type: 'pulse', box: [0.62, 0.34, 0.37, 0.37], period: 0.7, opacity: 0.5, at: 0.6 },
    text([0.65, 0.37, 0.3, 0.08], 'BLACK CIPHER', 1.0, { kind: 'hud', color: RED, glow: '#ff1a1a', size: 0.06, from: 'glitch', dur: 0.5 }),
    text([0.65, 0.46, 0.3, 0.06], 'STATUS:', 1.5, { kind: 'hud', color: '#ff7a7a', glow: '#ff1a1a', size: 0.046, from: 'wipe', dur: 0.4 }),
    burst([0.65, 0.5, 0.3, 0.2], 1.9, { color: '#ff9a9a', scale: 1.15 }),
    text([0.65, 0.53, 0.3, 0.12], 'MISSING', 1.9, { ...alarm, size: 0.115, align: 'center', from: 'slam', dur: 0.6 }),
    { type: 'reveal', box: [0.15, 0.78, 0.72, 0.2], at: 2.6, dur: 0.6, from: 'up' },
    text([0.2, 0.822, 0.62, 0.065], 'THE AI CORE **VANISHED.**', 3.0, { size: 0.05, accent: CYAN, from: 'type', cps: 30 }),
    text([0.2, 0.892, 0.62, 0.065], 'NOT DESTROYED. NOT STOLEN. JUST GONE.', 3.8, { size: 0.046, from: 'type', cps: 36 }),
  ],
  panel05: [
    header(5, 'THE IMPOSSIBLE SCENE', [0, 0, 0.55, 0.1]),
    ...fill([0.03, 0.525, 0.3, 0.075], [0.36, 0.525, 0.3, 0.075], [0.7, 0.525, 0.27, 0.075], [0.04, 0.705, 0.26, 0.07], [0.31, 0.705, 0.33, 0.07], [0.645, 0.705, 0.32, 0.07], [0.11, 0.845, 0.78, 0.08]),
    ...seq([[0.0, 0.07, 0.33, 0.56], [0.34, 0.07, 0.32, 0.56], [0.67, 0.07, 0.33, 0.56]], 0.8, 1.3, 0.6, 'up'),
    text([0.03, 0.52, 0.3, 0.085], 'INTACT DOOR', 1.5, { kind: 'label', size: 0.048, align: 'center', from: 'pop', dur: 0.45 }),
    text([0.36, 0.52, 0.3, 0.085], 'INTACT WINDOWS', 2.8, { kind: 'label', size: 0.048, align: 'center', from: 'pop', dur: 0.45 }),
    text([0.69, 0.52, 0.29, 0.085], 'NO ALARM', 4.1, { kind: 'label', size: 0.048, align: 'center', from: 'pop', dur: 0.45 }),
    { type: 'glow', box: [0.8, 0.13, 0.18, 0.24], color: '#ff2a2a', period: 1.2, opacity: 0.5 },
    ...seq([[0.02, 0.67, 0.29, 0.13], [0.31, 0.67, 0.33, 0.13], [0.64, 0.67, 0.34, 0.13]], 5.0, 0.6, 0.4, 'none'),
    text([0.03, 0.695, 0.28, 0.085], 'NO FORCED ENTRY.', 5.3, { kind: 'label', size: 0.04, align: 'center', from: 'pop', dur: 0.4 }),
    text([0.31, 0.695, 0.33, 0.085], 'NO BROKEN WINDOWS.', 5.9, { kind: 'label', size: 0.04, align: 'center', from: 'pop', dur: 0.4 }),
    text([0.645, 0.695, 0.33, 0.085], 'NO SECURITY ALARM.', 6.5, { kind: 'label', size: 0.04, align: 'center', from: 'pop', dur: 0.4 }),
    { type: 'reveal', box: [0.04, 0.82, 0.92, 0.14], at: 7.2, dur: 0.5, from: 'none' },
    burst([0.3, 0.84, 0.4, 0.1], 7.3, { color: '#ff9a9a', scale: 1.3, rays: 24 }),
    text([0.05, 0.835, 0.9, 0.1], 'SOMEONE INSIDE THE FACILITY DID IT.', 7.3, { ...alarm, size: 0.078, align: 'center', from: 'slam', dur: 0.6 }),
    { type: 'glow', box: [0.04, 0.78, 0.92, 0.22], color: '#ff3b3b', period: 1.4, opacity: 0.35, at: 7.4 },
  ],
  panel06: [
    header(6, 'EVIDENCE AVAILABLE', [0, 0, 0.52, 0.1]),
    ...fill([0.045, 0.425, 0.175, 0.06], [0.305, 0.425, 0.15, 0.06], [0.52, 0.425, 0.21, 0.06], [0.77, 0.425, 0.2, 0.06], [0.02, 0.77, 0.24, 0.06], [0.29, 0.77, 0.2, 0.06], [0.545, 0.77, 0.17, 0.06], [0.775, 0.77, 0.185, 0.06], [0.14, 0.905, 0.72, 0.07]),
    ...seq([[0.01, 0.1, 0.24, 0.41], [0.26, 0.1, 0.24, 0.41], [0.51, 0.1, 0.24, 0.41], [0.75, 0.1, 0.24, 0.41], [0.01, 0.52, 0.24, 0.35], [0.26, 0.52, 0.24, 0.35], [0.51, 0.52, 0.24, 0.35], [0.75, 0.52, 0.24, 0.35]], 0.6, 0.45, 0.45, 'up'),
    ...[
      [[0.03, 0.42, 0.21, 0.07], 'ACCESS LOGS'],
      [[0.28, 0.42, 0.2, 0.07], 'CCTV LOGS'],
      [[0.51, 0.42, 0.23, 0.07], 'COMMUNICATIONS'],
      [[0.76, 0.42, 0.22, 0.07], 'PROJECT DATA'],
      [[0.01, 0.765, 0.26, 0.07], 'FINANCIAL TRANSACTIONS'],
      [[0.28, 0.765, 0.22, 0.07], 'EMPLOYEE RECORDS'],
      [[0.53, 0.765, 0.2, 0.07], 'LOCATION DATA'],
      [[0.765, 0.765, 0.21, 0.07], 'DEVICE RECORDS'],
    ].map(([box, str], i) => text(box, str, 0.9 + i * 0.45, { kind: 'label', size: 0.033, align: 'center', from: 'pop', dur: 0.4 })),
    { type: 'sweep', at: 4.4, dur: 1.6 },
    text([0.08, 0.895, 0.84, 0.085], 'MULTIPLE SOURCES. **ONE TRUTH.** HIDDEN WITHIN.', 4.9, { kind: 'hud', color: CYAN, accent: WHITE, size: 0.05, spacing: 0.1, align: 'center', from: 'words' }),
  ],
  panel07: [
    header(7, 'THE DATABASE', [0, 0, 0.385, 0.1]),
    ...erase([0.13, 0.105, 0.4, 0.115]),
    ...fill([0.13, 0.245, 0.21, 0.05], [0.17, 0.33, 0.24, 0.585], [0.56, 0.275, 0.33, 0.145], [0.56, 0.49, 0.33, 0.06], [0.56, 0.61, 0.34, 0.15]),
    text([0.135, 0.115, 0.46, 0.09], 'Black_Cipher_Investigation', 0.5, { kind: 'terminal', size: 0.04, rotate: -2, from: 'type', cps: 30 }),
    text([0.135, 0.245, 0.3, 0.055], 'DATABASE TABLES', 1.0, { kind: 'hud', color: ICE, size: 0.036, spacing: 0.1, from: 'wipe', dur: 0.5 }),
    ...['employees', 'access_logs', 'cctv_logs', 'communications', 'project_members', 'transactions', 'locations', 'devices', 'security_events'].map((name, i) => text([0.18, 0.34 + i * 0.065, 0.3, 0.06], name, 1.3 + i * 0.22, { kind: 'terminal', color: WHITE, glow: '#22d3ee', size: 0.038, from: 'type', cps: 40 })),
    { type: 'reveal', box: [0.52, 0.24, 0.46, 0.66], at: 3.6, dur: 0.7, from: 'right' },
    { type: 'glow', box: [0.52, 0.24, 0.46, 0.66], color: '#34d399', period: 2.2, opacity: 0.18, at: 4.4 },
    text([0.565, 0.28, 0.33, 0.05], 'DATABASE', 4.0, { kind: 'hud', color: GREEN, glow: '#22c55e', size: 0.04, spacing: 0.1, from: 'wipe', dur: 0.4 }),
    text([0.565, 0.33, 0.33, 0.1], 'CONNECTED', 4.3, { ...status, size: 0.09, from: 'slam', dur: 0.5 }),
    text([0.565, 0.49, 0.33, 0.06], 'ACCESS: AUTHORIZED', 4.8, { kind: 'hud', color: GREEN, glow: '#22c55e', size: 0.045, from: 'pop', dur: 0.4 }),
    text([0.565, 0.615, 0.34, 0.05], 'INVESTIGATION DATABASE:', 5.2, { kind: 'hud', color: GREEN, glow: '#22c55e', size: 0.038, from: 'pop', dur: 0.4 }),
    text([0.565, 0.67, 0.34, 0.1], 'READY', 5.5, { ...status, size: 0.09, from: 'slam', dur: 0.5 }),
  ],
  panel08: [
    header(8, 'SQL IS YOUR WEAPON', [0, 0, 0.53, 0.1]),
    ...erase([0, 0.095, 0.53, 0.03], [0.58, 0.17, 0.37, 0.2]),
    // the monitor: only the screen below its top border is inpainted — the
    // border, the bezel above it and the face beside it are kept as art
    // (`protectAbove` follows the border's own curve), the window controls are
    // cut out, the two dividers and the bottom bezel are drawn back from clean
    // samples of themselves, and the words are typeset again at the screen's tilt
    {
      type: 'erase',
      box: [0.432, 0.43, 0.5, 0.51],
      shade: true, // the fill takes its light and colour back from the screen itself
      protect: [[0.84, 0.435, 0.095, 0.06]], // the window's — and X
      protectAbove: { from: [0.42, 0.548], to: [0.92, 0.452], fitRange: [0.47, 0.55], margin: -26 }, // the bezel and the face above the screen
      guard: [ // the window's two dividers, kept exactly as drawn (they drift, so waypoints)
        [[0.432, 0.6178], [0.44, 0.6157], [0.58, 0.579], [0.72, 0.543], [0.86, 0.5095], [0.935, 0.4902]],
        [[0.432, 0.7596], [0.44, 0.7582], [0.58, 0.733], [0.68, 0.715], [0.79, 0.6947], [0.935, 0.668]],
      ],
      guardWidth: 22,
      redraw: [
        { from: [0.42, 0.548], to: [0.92, 0.452], sampleX: 0.83, fitRange: [0.47, 0.55], range: [0.432, 0.933] }, // the screen's top border
        { from: [0.44, 0.961], to: [1.0, 0.943], sampleX: 0.965, fitRange: [0.44, 0.99], range: [0.83, 0.955], half: 11 }, // the bottom bezel, across the box's edge
      ],
    },
    { type: 'reveal', box: [0.4, 0.35, 0.6, 0.65], at: 0.5, dur: 0.7, from: 'up' },
    text([0.44, 0.5, 0.39, 0.1], 'CHRONOS DATABASE TERMINAL', 1.0, { kind: 'terminal', weight: 700, color: CYAN, size: 0.036, rotate: -7.5, from: 'type', cps: 30 }),
    text([0.44, 0.585, 0.41, 0.09], 'Database: Black_Cipher_Investigation', 1.6, { kind: 'terminal', size: 0.028, rotate: -7.5, from: 'type', cps: 40 }),
    text([0.44, 0.68, 0.2, 0.07], 'Status: Connected', 2.3, { kind: 'terminal', size: 0.028, rotate: -7.5, from: 'type', cps: 40 }),
    burst([0.6, 0.18, 0.35, 0.2], 2.2, { color: WHITE, scale: 1.2, rays: 22 }),
    text([0.57, 0.16, 0.41, 0.24], 'SQL IS\nYOUR WEAPON.', 2.2, { kind: 'impact', size: 0.098, from: 'slam', dur: 0.6 }),
    { type: 'shine', box: [0.57, 0.16, 0.41, 0.24], at: 2.9, dur: 1.2 },
    text([0.44, 0.765, 0.28, 0.085], '**SQL>** SELECT', 3.0, { kind: 'terminal', weight: 700, color: WHITE, accent: CYAN, size: 0.048, rotate: -7.5, from: 'type', cps: 12, caret: true, caretChar: '_' }),
  ],
  panel09: [
    header(9, 'CHRONOS HANDOFF', [0, 0, 0.5, 0.1]),
    ...erase([0.1, 0.395, 0.26, 0.125]),
    ...fill([0.44, 0.205, 0.46, 0.06], [0.44, 0.3, 0.47, 0.34], [0.42, 0.765, 0.5, 0.125]),
    { type: 'glow', box: [0.08, 0.06, 0.26, 0.46], color: '#7fb4ff', period: 2.6, opacity: 0.35 },
    { type: 'shine', box: [0.08, 0.06, 0.26, 0.46], at: 0.8, dur: 1.4 },
    text([0.085, 0.385, 0.29, 0.1], 'CHRONOS', 0.8, { kind: 'hud', color: CYAN, size: 0.085, spacing: 0.1, align: 'center', from: 'glitch', dur: 0.5 }),
    text([0.085, 0.485, 0.29, 0.04], 'GLOBAL INVESTIGATION UNIT', 1.3, { kind: 'hud', color: '#a8e6ff', size: 0.026, spacing: 0.2, align: 'center', from: 'wipe', dur: 0.6 }),
    text([0.44, 0.195, 0.48, 0.075], 'CHRONOS INVESTIGATION PROTOCOL', 0.6, { kind: 'hud', color: CYAN, size: 0.042, spacing: 0.06, from: 'type', cps: 36 }),
    ...['CASE : **BLACK CIPHER**', 'STATUS : **UNRESOLVED**', 'DATABASE : **ONLINE**', 'EVIDENCE : **AVAILABLE**', 'INVESTIGATION : **AUTHORIZED**'].map((str, i) => text([0.445, 0.295 + i * 0.068, 0.46, 0.065], str, 1.2 + i * 0.5, { kind: 'hud', color: '#bfefff', accent: WHITE, size: 0.042, spacing: 0.05, from: 'type', cps: 40 })),
    { type: 'reveal', box: [0.39, 0.69, 0.54, 0.22], at: 4.6, dur: 0.6, from: 'up' },
    text([0.42, 0.76, 0.5, 0.14], '"THE DATABASE CONTAINS THE TRUTH.\nYOUR SQL QUERIES WILL REVEAL IT."', 4.9, { kind: 'caption', weight: 700, size: 0.045, lineHeight: 1.25, align: 'center', from: 'type', cps: 44 }),
  ],
  panel10: [
    header(10, 'YOUR MISSION', [0, 0.035, 0.41, 0.115]),
    ...erase([0.49, 0.18, 0.47, 0.475], [0.55, 0.735, 0.395, 0.2]),
    ...['INVESTIGATE THE DATABASE.', 'UNCOVER THE TRUTH.', 'RECONSTRUCT WHAT HAPPENED.', 'IDENTIFY WHO WAS RESPONSIBLE.', 'RECOVER BLACK CIPHER.'].map((str, i) => text([0.495, [0.18, 0.275, 0.373, 0.477, 0.58][i], 0.49, 0.065], str, 1.0 + i, { size: 0.05, from: 'words', stagger: 0.09 })),
    text([0.5, 0.71, 0.48, 0.26], 'The truth\nis in your queries.', 6.2, { kind: 'script', size: 0.085, rotate: -7, align: 'center', from: 'pop', dur: 0.7 }),
  ],
  panel11: [
    header(11, 'THE CASE FILES', [0, 0.04, 0.41, 0.11]),
    ...fillTex([0.035, 0.27, 0.14, 0.09], [0.045, 0.38, 0.1, 0.065], [0.028, 0.62, 0.135, 0.055]),
    ...fillTex([0.207, 0.27, 0.13, 0.09], [0.23, 0.38, 0.085, 0.065], [0.207, 0.583, 0.13, 0.095]),
    ...fillTex([0.375, 0.27, 0.13, 0.09], [0.39, 0.38, 0.085, 0.065], [0.38, 0.585, 0.105, 0.05]),
    ...fillTex([0.535, 0.66, 0.13, 0.08], [0.57, 0.325, 0.06, 0.075], [0.54, 0.575, 0.125, 0.085]),
    ...fillTex([0.705, 0.66, 0.13, 0.08], [0.73, 0.325, 0.06, 0.075], [0.71, 0.575, 0.115, 0.085]),
    ...fillTex([0.855, 0.66, 0.13, 0.08], [0.885, 0.325, 0.07, 0.075], [0.855, 0.575, 0.13, 0.085]),
    ...fill([0.19, 0.875, 0.62, 0.065]),
    ...seq([[0.0, 0.18, 0.2, 0.66], [0.2, 0.18, 0.16, 0.66], [0.36, 0.18, 0.15, 0.66], [0.51, 0.18, 0.16, 0.66], [0.67, 0.18, 0.16, 0.66], [0.83, 0.18, 0.17, 0.66]], 0.7, 0.5, 0.45, 'up'),
    { type: 'glow', box: [0.0, 0.2, 0.2, 0.62], color: '#ffb347', period: 1.8, opacity: 0.35, at: 1.2 },
    ...[
      [[0.025, 0.355, 0.17, 0.1], 'FILE 01', [0.02, 0.6, 0.175, 0.09], 'THE SUSPECTS'],
      [[0.2, 0.355, 0.155, 0.1], 'FILE 02', [0.195, 0.57, 0.165, 0.12], 'THE SECURITY\nBREACH'],
      [[0.365, 0.355, 0.15, 0.1], 'FILE 03', [0.36, 0.57, 0.16, 0.12], 'INSIDE JOB'],
      [[0.53, 0.31, 0.145, 0.1], 'FILE 04', [0.525, 0.56, 0.155, 0.12], 'THE HIDDEN\nCONNECTION'],
      [[0.69, 0.31, 0.145, 0.1], 'FILE 05', [0.685, 0.56, 0.155, 0.12], 'FOLLOW\nTHE MONEY'],
      [[0.845, 0.31, 0.15, 0.1], 'FINAL FILE', [0.84, 0.56, 0.16, 0.12], 'RECOVER\nBLACK CIPHER'],
    ].flatMap(([tbox, title, nbox, name], i) => [
      text(tbox, title, 0.9 + i * 0.5, i < 3 ? { kind: 'impact', color: INK, stroke: 0, hard: 0, size: 0.068, align: 'center', from: 'pop', dur: 0.4 } : { kind: 'impact', size: 0.054, align: 'center', from: 'pop', dur: 0.4 }),
      text(nbox, name, 1.1 + i * 0.5, i < 3 ? { kind: 'caption', weight: 700, size: 0.035, spacing: 0.02, lineHeight: 1.15, align: 'center', from: 'pop', dur: 0.4 } : { color: ICE, size: 0.033, spacing: 0.03, lineHeight: 1.15, align: 'center', from: 'pop', dur: 0.4 }),
    ]),
    text([0.08, 0.865, 0.84, 0.085], 'SOLVE EACH FILE. UNLOCK THE TRUTH.', 4.4, { kind: 'hud', color: CYAN, size: 0.055, spacing: 0.12, align: 'center', from: 'words' }),
  ],
  panel12: [
    header(12, 'THE CLOCK', [0, 0.04, 0.34, 0.11]),
    ...erase([0.285, 0.505, 0.44, 0.075]),
    ...fill([0.21, 0.73, 0.15, 0.13], [0.505, 0.73, 0.1, 0.13], [0.77, 0.73, 0.11, 0.13]),
    { type: 'pulse', box: [0.14, 0.12, 0.72, 0.3], period: 1.0, opacity: 0.5 },
    burst([0.3, 0.48, 0.4, 0.12], 1.8, { color: WHITE, scale: 1.25, rays: 24 }),
    text([0.15, 0.49, 0.7, 0.1], 'YOU HAVE ONE HOUR.', 1.8, { kind: 'impact', size: 0.08, align: 'center', from: 'slam', dur: 0.6 }),
    { type: 'reveal', box: [0.06, 0.65, 0.88, 0.28], at: 3.2, dur: 0.6, from: 'up' },
    text([0.215, 0.72, 0.17, 0.15], 'ONE\nDATABASE', 3.5, { kind: 'label', size: 0.05, lineHeight: 1.15, from: 'pop', dur: 0.45 }),
    text([0.505, 0.72, 0.14, 0.15], 'ONE\nHOUR', 4.2, { kind: 'label', size: 0.05, lineHeight: 1.15, from: 'pop', dur: 0.45 }),
    text([0.77, 0.72, 0.14, 0.15], 'ONE\nTRUTH', 4.9, { kind: 'label', size: 0.05, lineHeight: 1.15, from: 'pop', dur: 0.45 }),
  ],
  panel13: [
    header(13, 'YOUR VIEW', [0, 0, 0.345, 0.1]),
    ...fill([0.565, 0.055, 0.36, 0.06], [0.565, 0.16, 0.36, 0.22], [0.62, 0.39, 0.24, 0.31], [0.545, 0.83, 0.375, 0.08]),
    text([0.56, 0.045, 0.37, 0.075], 'INVESTIGATION READY', 0.5, { kind: 'hud', color: CYAN, size: 0.05, spacing: 0.08, align: 'center', from: 'slam', dur: 0.5 }),
    text([0.57, 0.155, 0.36, 0.065], 'CASE : **BLACK CIPHER**', 1.0, { kind: 'hud', color: '#bfefff', accent: WHITE, size: 0.042, spacing: 0.05, from: 'type', cps: 36 }),
    text([0.57, 0.22, 0.36, 0.065], 'TIME : **01:00:00**', 1.5, { kind: 'hud', color: '#bfefff', accent: '#ff4d4d', size: 0.042, spacing: 0.05, from: 'type', cps: 36 }),
    text([0.57, 0.315, 0.36, 0.06], 'AVAILABLE:', 1.9, { kind: 'hud', color: CYAN, size: 0.04, from: 'wipe', dur: 0.4 }),
    ...['DATABASE', 'CASE FILES', 'EVIDENCE', 'SQL TERMINAL'].map((str, i) => text([0.625, 0.39 + i * 0.08, 0.3, 0.065], str, 2.2 + i * 0.4, { size: 0.044, from: 'pop', dur: 0.4 })),
    { type: 'glow', box: [0.55, 0.03, 0.44, 0.7], color: '#7fd8ff', period: 2.8, opacity: 0.16 },
    { type: 'reveal', box: [0.51, 0.77, 0.47, 0.14], at: 4.6, dur: 0.5, from: 'up' },
    text([0.53, 0.82, 0.42, 0.1], 'File 01 is now available.', 5.0, { kind: 'caption', weight: 500, size: 0.05, align: 'center', from: 'type', cps: 30 }),
  ],
  panel14: [
    header(14, 'BEGIN THE INVESTIGATION', [0, 0, 0.58, 0.09]),
    ...erase([0.615, 0.445, 0.35, 0.21], [0.5, 0.71, 0.47, 0.2]),
    { type: 'shine', box: [0.28, 0.26, 0.16, 0.14], at: 0.9, dur: 0.8 },
    ...['SAME DATA.', 'DIFFERENT QUESTIONS.', 'A DIFFERENT TRUTH.'].map((str, i) => text([0.61, 0.43 + i * 0.075, 0.38, 0.075], str, 1.4 + i * 0.7, { size: 0.054, weight: i === 2 ? 700 : 600, outline: 0.012, from: 'slam', dur: 0.45 })),
    text([0.49, 0.68, 0.5, 0.26], 'Are you ready?', 3.9, { kind: 'script', size: 0.12, rotate: -8, align: 'center', from: 'pop', dur: 0.8 }),
  ],
  panel15: [
    header(15, 'LOST AT SQL', [0, 0, 0.345, 0.1]),
    ...fill([0.185, 0.615, 0.575, 0.08], [0.29, 0.895, 0.42, 0.075]),
    ...erase([0.09, 0.75, 0.82, 0.06]),
    { type: 'reveal', box: [0.02, 0.3, 0.96, 0.34], at: 0.6, dur: 0.6, from: 'none' },
    { type: 'glow', box: [0.12, 0.34, 0.2, 0.2], color: '#ff3b3b', period: 1.6, opacity: 0.4 },
    { type: 'shine', box: [0.02, 0.3, 0.96, 0.34], at: 1.4, dur: 1.6 },
    text([0.13, 0.61, 0.7, 0.09], 'OPERATION: BLACK CIPHER', 2.2, { size: 0.062, spacing: 0.08, align: 'center', from: 'words' }),
    text([0.03, 0.74, 0.94, 0.08], 'YOU **•** 1 DATABASE **•** 1 HOUR **•** 1 TRUTH', 3.2, { kind: 'label', weight: 500, size: 0.05, spacing: 0.14, accent: RED, align: 'center', from: 'words', stagger: 0.1 }),
    { type: 'reveal', box: [0.22, 0.85, 0.56, 0.15], at: 4.4, dur: 0.5, from: 'up' },
    burst([0.3, 0.86, 0.4, 0.13], 4.8, { color: '#ff9a9a', scale: 1.25, rays: 24 }),
    text([0.25, 0.88, 0.5, 0.1], 'INVESTIGATION READY', 4.8, { kind: 'impact', size: 0.066, glow: '#ff2a2a', align: 'center', from: 'slam', dur: 0.5, role: 'cta' }),
    { type: 'pulse', box: [0.24, 0.86, 0.52, 0.13], period: 1.3, opacity: 0.4, at: 5.0 },
  ],
};

/*
 * The cinema layer per page — a light leak drifting over the frame (`leak`:
 * warm · cyan · magenta · red · blue), anamorphic lens streaks pinned to the
 * bright sources ([x, y, length] fractions), and how much bokeh drifts by.
 */
export const CINEMA = {
  panel01: { leak: 'warm', streaks: [[0.74, 0.79, 0.5]], bokeh: 1 },
  panel02: { leak: 'cyan', streaks: [[0.5, 0.4, 0.6]], bokeh: 1 },
  panel03: { leak: 'blue', streaks: [[0.28, 0.53, 0.45]], bokeh: 0.6 },
  panel04: { leak: 'magenta', streaks: [[0.4, 0.5, 0.55]], bokeh: 1 },
  panel05: { leak: 'blue', streaks: [[0.885, 0.285, 0.25]], bokeh: 0.4 },
  panel06: { leak: 'cyan', streaks: [], bokeh: 0.7 },
  panel07: { leak: 'cyan', streaks: [], bokeh: 0.5 },
  panel08: { leak: 'warm', streaks: [[0.12, 0.3, 0.35]], bokeh: 0.8 },
  panel09: { leak: 'cyan', streaks: [[0.22, 0.25, 0.3]], bokeh: 0.7 },
  panel10: { leak: 'warm', streaks: [[0.1, 0.36, 0.3]], bokeh: 0.8 },
  panel11: { leak: 'warm', streaks: [[0.1, 0.5, 0.35]], bokeh: 0.6 },
  panel12: { leak: 'red', streaks: [[0.5, 0.33, 0.6]], bokeh: 0.6 },
  panel13: { leak: 'cyan', streaks: [], bokeh: 0.6 },
  panel14: { leak: 'warm', streaks: [[0.86, 0.3, 0.35]], bokeh: 1 },
  panel15: { leak: 'red', streaks: [[0.21, 0.49, 0.4]], bokeh: 0.8 },
};
