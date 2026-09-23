/*
 * Typesetting and camera maths shared by the in-app pages (scenes.jsx) and
 * the film compositor (tools/film/panels.template.html, which inlines this
 * file). Everything here is plain data → plain values, so both renderers
 * lay a `text` entry from fx.js out identically.
 *
 * Stage units: the film and the pages both draw on a 1600 × 900 stage with
 * the 3:2 panel fitted in the middle (PX … PX + PW wide, PH tall).
 */
export const STAGE_W = 1600;
export const STAGE_H = 900;
export const PW = 1378;
export const PH = 900;
export const PX = (STAGE_W - PW) / 2;

export const INK = '#141414';
export const PAPER = '#f7f0dc';
export const YELLOW = '#ffd23b';

export const FONTS = {
  display: "'Oswald', 'Arial Narrow', 'Roboto Condensed', sans-serif",
  comic: "'Bangers', 'Oswald', 'Impact', sans-serif",
  script: "'Dancing Script', 'Brush Script MT', cursive",
  mono: "'JetBrains Mono', 'Cascadia Mono', 'Consolas', monospace",
};
/* the Google Fonts request both renderers make */
export const FONT_URL = 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Bangers&family=Dancing+Script:wght@600;700&family=JetBrains+Mono:wght@400;500;700&display=swap';

/*
 * The page's typographic voices. A `text` entry names one with `kind` and
 * may override any of its properties.
 *
 *   caption   the narrator: ink on the art's cream boxes — or on a `plate`
 *             of its own, a comic caption with an ink border, hard shadow
 *             and a halftone wash
 *   impact    the big words: comic display lettering with an ink outline
 *             and a hard shadow (Bangers)
 *   hud       the machines speak: glowing, letter-spaced condensed caps
 *   label     small titles on the art's dark bars
 *   terminal  monospaced, phosphor-lit
 *   script    a hand-written aside
 *   plain     condensed caps with a soft shadow (the default)
 */
export const STYLES = {
  plain: { font: 'display', weight: 600, color: '#ffffff', spacing: 0.04, hard: 0.035 },
  caption: { font: 'display', weight: 600, color: INK, spacing: 0.03, hard: 0 },
  impact: { font: 'comic', weight: 400, color: '#ffffff', spacing: 0.03, stroke: 0.05, strokeColor: INK, hard: 0.07, lineHeight: 0.98 },
  hud: { font: 'display', weight: 600, color: '#dff6ff', spacing: 0.08, glow: '#22d3ee', hard: 0.02 },
  label: { font: 'display', weight: 600, color: '#ffffff', spacing: 0.07, hard: 0.035, outline: 0.012 },
  terminal: { font: 'mono', weight: 500, color: '#9fe8ff', spacing: 0, glow: '#22d3ee', hard: 0 },
  script: { font: 'script', weight: 600, color: '#ffffff', spacing: 0, glow: '#7fe3ff', hard: 0.03, lineHeight: 1.02 },
};

/** A text entry with its `kind` preset folded in. */
export const resolve = (f) => ({ ...(STYLES[f.kind || 'plain'] || STYLES.plain), ...f });

/** A box in panel fractions → stage pixels. */
export const boxPx = ([x, y, w, h]) => ({ x: PX + x * PW, y: y * PH, w: w * PW, h: h * PH });

/**
 * The CSS of one `text` entry's box, as a camelCase style object — usable
 * as a React `style` prop and assignable to a DOM element's `style` as is.
 */
export function textStyle(entry) {
  const f = resolve(entry);
  const size = (f.size || 0.04) * PH;
  const px = (em) => `${(size * em).toFixed(2)}px`;
  const shadows = [];
  if (f.glow) shadows.push(`0 0 ${px(0.3)} ${f.glow}`, `0 0 ${px(0.8)} ${f.glow}`);
  if (f.hard) shadows.push(`${px(f.hard)} ${px(f.hard * 1.15)} 0 ${f.hardColor || 'rgba(0,0,0,0.85)'}`);
  if (f.shadow !== false && !f.glow && !f.hard) shadows.push(`0 0 ${px(0.18)} rgba(0,0,0,0.55)`);
  const align = f.align || 'left';
  const valign = f.valign || 'middle';
  return {
    display: 'flex',
    alignItems: valign === 'top' ? 'flex-start' : valign === 'bottom' ? 'flex-end' : 'center',
    justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
    textAlign: align,
    fontFamily: FONTS[f.font] || FONTS.display,
    fontSize: px(1),
    fontWeight: f.weight || 600,
    fontStyle: f.italic ? 'italic' : 'normal',
    lineHeight: String(f.lineHeight || (f.font === 'script' ? 1.05 : 1.12)),
    letterSpacing: `${f.spacing != null ? f.spacing : 0}em`,
    color: f.color || '#ffffff',
    textShadow: shadows.join(', ') || 'none',
    WebkitTextStroke: f.stroke ? `${px(f.stroke)} ${f.strokeColor || INK}` : f.outline ? `${px(f.outline)} rgba(0,0,0,0.55)` : '0',
    paintOrder: 'stroke fill',
    whiteSpace: 'pre',
    transform: f.rotate ? `rotate(${f.rotate}deg)` : 'none',
    transformOrigin: '50% 50%',
    overflow: 'visible',
    boxSizing: 'border-box',
    margin: '0',
    padding: '0',
    WebkitFontSmoothing: 'antialiased',
  };
}

/**
 * The CSS of the plate behind an entry's words (`plate: true` or an object
 * — bg, ink, border (em), shadow (em), pad ([em, em]), halftone, skew).
 * Applied to the inline span that hugs the text.
 */
export function plateStyle(entry) {
  const f = resolve(entry);
  if (!f.plate) return null;
  const p = typeof f.plate === 'object' ? f.plate : {};
  const size = (f.size || 0.04) * PH;
  const px = (em) => `${(size * em).toFixed(2)}px`;
  const [pv, ph] = p.pad || [0.22, 0.5];
  const ink = p.ink || INK;
  const style = {
    display: 'inline-block',
    background: p.bg || PAPER,
    border: `${px(p.border == null ? 0.07 : p.border)} solid ${ink}`,
    boxShadow: `${px(p.shadow == null ? 0.16 : p.shadow)} ${px(p.shadow == null ? 0.16 : p.shadow)} 0 ${ink}`,
    padding: `${px(pv)} ${px(ph)}`,
    borderRadius: px(p.radius || 0.04),
    transform: p.skew ? `skewX(${p.skew}deg)` : 'none',
    backgroundImage: p.halftone === false ? 'none' : `radial-gradient(circle at 1px 1px, rgba(20,20,20,0.10) 0.9px, transparent 1.1px)`,
    backgroundSize: p.halftone === false ? 'auto' : `${px(0.18)} ${px(0.18)}`,
  };
  return style;
}

/**
 * The text of an entry as lines of runs: `**word**` marks a run in the
 * entry's `accent` colour. Returns [[{ t, accent }, …], …].
 */
export function textRuns(f) {
  const raw = Array.isArray(f.text) ? f.text.join('\n') : String(f.text ?? '');
  return raw.split('\n').map((line) => {
    const runs = [];
    const re = /\*\*(.+?)\*\*/g;
    let last = 0;
    let m;
    while ((m = re.exec(line))) {
      if (m.index > last) runs.push({ t: line.slice(last, m.index), accent: false });
      runs.push({ t: m[1], accent: true });
      last = m.index + m[0].length;
    }
    if (last < line.length || runs.length === 0) runs.push({ t: line.slice(last), accent: false });
    return runs;
  });
}

/** Plain wording of an entry (accent marks stripped) — for checks and alt text. */
export const plainText = (f) => textRuns(f).map((runs) => runs.map((r) => r.t).join('')).join('\n');

/**
 * The entry's text as tokens for the animated entrances: one per word
 * (`words`) or per character (`type`); `lineBreak` tokens separate lines.
 * Each token: { t, accent, i } with i its order among the animated ones.
 */
export function tokens(f, by = 'words') {
  const out = [];
  let i = 0;
  textRuns(f).forEach((runs, li) => {
    if (li > 0) out.push({ t: '\n', lineBreak: true });
    for (const r of runs) {
      const parts = by === 'type' ? Array.from(r.t) : r.t.split(/(\s+)/).filter((s) => s.length);
      for (const p of parts) {
        if (by !== 'type' && /^\s+$/.test(p)) out.push({ t: p, space: true });
        else out.push({ t: p, accent: r.accent, i: i++ });
      }
    }
  });
  return out;
}

/* ── entrances ──────────────────────────────────────────────────────── */
export const FROM = { up: [0, 44], down: [0, -44], left: [-70, 0], right: [70, 0], none: [0, 0], wipe: [0, 0], slam: [0, 0], pop: [0, 0], type: [0, 0], words: [0, 0], glitch: [0, 0] };
export const STAGGER = 0.11; // s between words
export const TYPE_CPS = 28; // characters per second

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const easeOutCubic = (p) => 1 - (1 - p) ** 3;
export const backOut = (p) => { const c = 1.70158; return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2; };

/** Progress 0 → 1 of an entrance that starts at `at` and lasts `dur`, eased out. */
export function entrance(tl, at, dur) {
  return easeOutCubic(clamp01((tl - at) / Math.max(0.01, dur)));
}

/** How long a text entry takes to arrive, given its entrance. */
export function arrival(entry) {
  const f = resolve(entry);
  const from = f.from || 'up';
  if (from === 'type') return plainText(f).length / (f.cps || TYPE_CPS);
  if (from === 'words') return (tokens(f, 'words').filter((t) => !t.space && !t.lineBreak).length - 1) * (f.stagger || STAGGER) + 0.35;
  return f.dur || 0.5;
}

/* ── the camera ─────────────────────────────────────────────────────── */
/**
 * Handheld sway: a small, slow, never-repeating drift of the whole panel —
 * pixels in stage units and degrees. `seed` varies it per page.
 */
export function sway(t, seed = 0) {
  const s = seed * 1.7;
  return {
    x: 3.2 * Math.sin(t * 0.37 + s) + 1.6 * Math.sin(t * 0.91 + 2.1 + s) + 0.8 * Math.sin(t * 1.7 + s * 0.5),
    y: 2.4 * Math.sin(t * 0.29 + 1.3 + s) + 1.2 * Math.sin(t * 0.77 + s) + 0.6 * Math.sin(t * 1.9 + 0.4),
    r: 0.14 * Math.sin(t * 0.23 + s) + 0.06 * Math.sin(t * 0.61 + 1.1 + s),
  };
}

/** A short handheld shake at `at` lasting `dur`: amplitude in stage pixels. */
export function shake(tl, at, dur = 0.5, amp = 14) {
  const d = tl - at;
  if (d < 0 || d > dur) return { x: 0, y: 0 };
  const decay = 1 - d / dur;
  const k = Math.floor(d / 0.045);
  return { x: (k % 2 ? -1 : 1) * amp * decay * (0.6 + ((k * 7) % 5) / 10), y: (k % 3 === 0 ? 1 : -1) * amp * 0.6 * decay };
}

/* ── comic devices ──────────────────────────────────────────────────── */
/**
 * Speed lines for a `burst`: `n` thin tapered rays in a ring around a
 * centre, as { a (rad), r0, r1, w } in units of the burst radius. They start
 * well away from the middle, so the burst reads as a flash of motion and
 * never closes into a solid shape over the art. Fixed by seed.
 */
export function burstRays(n = 22, seed = 1) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const j = ((i * 7919 + seed * 104729) % 1000) / 1000;
    const k = ((i * 6007 + seed * 15485) % 1000) / 1000;
    out.push({
      a: (i / n) * Math.PI * 2 + (j - 0.5) * 0.09,
      r0: 0.64 + 0.16 * k, // the rays begin far out, so they never fuse into a disc
      r1: 0.98 + 0.3 * j,
      w: 0.004 + 0.011 * k,
    });
  }
  return out;
}

/* ── the cinema layer ───────────────────────────────────────────────── */
export const LEAKS = {
  warm: ['rgba(255,170,90,0.55)', 'rgba(255,90,40,0.18)'],
  cyan: ['rgba(120,230,255,0.5)', 'rgba(40,140,255,0.16)'],
  magenta: ['rgba(255,120,220,0.45)', 'rgba(150,60,255,0.16)'],
  red: ['rgba(255,70,70,0.5)', 'rgba(160,0,30,0.18)'],
  blue: ['rgba(120,170,255,0.4)', 'rgba(40,80,220,0.14)'],
};

/** Where the light leak sits at time t (stage units) and how bright it is. */
export function leakPos(t, seed = 0) {
  return {
    x: 800 + 620 * Math.sin(t * 0.11 + seed),
    y: 450 + 360 * Math.sin(t * 0.08 + 2 + seed * 0.7),
    o: 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(t * 0.5 + seed)),
  };
}

/** The bokeh discs of a page: fixed by seed, drifting slowly with t. */
export function bokeh(t, seed = 0, amount = 1) {
  const n = Math.round(10 * amount);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const r = 10 + ((i * 11 + seed * 3) % 22);
    out.push({
      x: (((i * 431 + seed * 97) % 1500) + 50 + 40 * Math.sin(t * 0.13 + i)) % 1600,
      y: (((i * 277 + seed * 53) % 820) + 40 + 30 * Math.sin(t * 0.17 + i * 1.3)) % 900,
      r,
      o: 0.05 + 0.07 * (0.5 + 0.5 * Math.sin(t * 0.4 + i * 2.1)),
      warm: i % 3 === 0,
    });
  }
  return out;
}
