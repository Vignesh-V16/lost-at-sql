import { useMemo, useState } from 'react';
import { cn } from '../../utils/cn.js';

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const BACKDROPS = ['#ffd12e', '#2bbfe6', '#ff8a1f', '#7a3be6', '#2eaf5c', '#2364e8', '#e5322d', '#ff5da2'];

/*
 * Portrait — a comic-book head-and-shoulders. The twelve persons of
 * interest have DRAWN portraits, cut from the studio's character sheet into
 * public/suspects/<id>.webp; every other seed (participants, unknown ids —
 * and a suspect whose file is missing, via the img's onError) gets the ink
 * sketch generated below: deterministic per seed, so head shape, hair,
 * collar and backdrop colour vary and every character is recognisable at a
 * glance. `tone` marks the state: crimson (prime suspect) and cyan (flagged
 * / accomplice) ring the drawn portrait and recolour the sketch's backdrop;
 * dim (cleared) greys either.
 */
export function Portrait({ seed = 'unknown', size = 96, tone, className, flagged = false, label }) {
  const p = useMemo(() => {
    const h = hash(seed);
    const pick = (n, mod) => ((h >>> (n * 4)) & 0xff) % mod;
    return {
      headW: 30 + pick(0, 10),
      headH: 36 + pick(1, 8),
      jaw: pick(2, 6),
      shoulders: 62 + pick(3, 14),
      hair: pick(4, 4),
      collar: pick(5, 3),
      glasses: pick(6, 5) === 0,
      backdrop: BACKDROPS[pick(7, BACKDROPS.length)],
    };
  }, [seed]);

  const backdrop = tone === 'crimson' ? '#e5322d' : tone === 'cyan' ? '#2bbfe6' : tone === 'violet' ? '#7a3be6' : tone === 'dim' ? '#d8cfb6' : p.backdrop;
  const id = `pt-${hash(seed).toString(16)}`;
  const top = 52 - p.headH / 2;
  const bottom = 52 + p.headH / 2;

  /* A caller's own frame width (any border-N class) must win, and
     `cn` is plain clsx, so the default border-3 is only added when none was
     given. The image is decorative unless a `label` names it — the name is
     printed beside every portrait already, so twelve identical "Portrait"
     announcements would only pad the reading. */
  const frame = /\bborder-\d\b/.test(className || '') ? '' : 'border-3';
  const a11y = label ? { role: 'img', 'aria-label': `Portrait of ${label}` } : { 'aria-hidden': true };

  /* the drawn portrait, when there is one: only the E-numbered persons of
     interest are on the sheet, so nobody else pays for a failed request.
     The "!" badge is sized from `size` like the sketch's (a fifth of the
     frame), so it stays a corner mark on a 30px row portrait too. */
  const drawn = /^E\d{3}$/.test(seed);
  const [failed, setFailed] = useState(null); // the seed whose file 404ed, so a later seed is judged afresh
  const art = drawn && failed !== seed;
  if (art) {
    const ring = tone === 'crimson' ? '#e5322d' : tone === 'cyan' ? '#2bbfe6' : tone === 'violet' ? '#7a3be6' : null;
    return (
      <span className={cn('relative inline-block shrink-0 overflow-hidden border-ink bg-white align-top', frame, tone === 'dim' && 'grayscale', className)} style={{ width: size, height: size }} {...a11y}>
        <img src={`/suspects/${seed}.webp`} alt="" width={size} height={size} draggable={false} className="block h-full w-full object-cover" onError={() => setFailed(seed)} />
        {ring ? <span className="pointer-events-none absolute inset-0" style={{ boxShadow: `inset 0 0 0 ${size > 60 ? 4 : 2}px ${ring}` }} aria-hidden /> : null}
        {flagged ? (
          <span className="absolute flex items-center justify-center border-solid border-ink bg-red font-display leading-none text-white" style={{ top: size * 0.04, right: size * 0.04, width: size * 0.2, height: size * 0.2, borderWidth: size > 60 ? 2 : 1, fontSize: size * 0.12 }}>
            !
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={cn('shrink-0 border-ink bg-white', frame, className)} {...a11y}>
      <defs>
        <pattern id={`${id}-dots`} width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.1" fill="rgba(20,20,20,0.22)" />
        </pattern>
        <clipPath id={`${id}-clip`}>
          <rect x="0" y="0" width="100" height="100" />
        </clipPath>
      </defs>
      <rect width="100" height="100" fill={backdrop} />
      <rect width="100" height="100" fill={`url(#${id}-dots)`} />
      <g clipPath={`url(#${id}-clip)`} stroke="#141414" strokeWidth="3" strokeLinejoin="round">
        {/* shoulders */}
        <path d={`M${50 - p.shoulders / 2} 104 C ${50 - p.shoulders / 2} 80, ${50 - p.headW / 2 - 6} 74, 50 72 C ${50 + p.headW / 2 + 6} 74, ${50 + p.shoulders / 2} 80, ${50 + p.shoulders / 2} 104 Z`} fill="#ffffff" />
        {/* collar */}
        {p.collar > 0 ? <path d={`M42 74 L50 ${82 + p.collar * 2} L58 74`} fill="none" strokeWidth="2.5" /> : null}
        {/* neck */}
        <path d={`M44 ${bottom - 6} L44 74 L56 74 L56 ${bottom - 6}`} fill="#ffffff" />
        {/* head */}
        <path d={`M${50 - p.headW / 2} ${top + 8} C ${50 - p.headW / 2} ${top - 4}, ${50 + p.headW / 2} ${top - 4}, ${50 + p.headW / 2} ${top + 8} L ${50 + p.headW / 2 - p.jaw} ${bottom - 4} C ${56} ${bottom + 4}, ${44} ${bottom + 4}, ${50 - p.headW / 2 + p.jaw} ${bottom - 4} Z`} fill="#ffffff" />
        {/* hair */}
        {p.hair > 0 ? <path d={`M${50 - p.headW / 2 - 1} ${top + 12} q ${p.headW / 2 + 1} ${-14 - p.hair * 3} ${p.headW + 2} 0 L ${50 + p.headW / 2} ${top + 6} q ${-p.headW / 2} ${-4} ${-p.headW} 0 Z`} fill="#141414" /> : null}
        {/* eyes */}
        <circle cx={50 - p.headW / 5} cy={52 - 2} r="2.2" fill="#141414" stroke="none" />
        <circle cx={50 + p.headW / 5} cy={52 - 2} r="2.2" fill="#141414" stroke="none" />
        {p.glasses ? (
          <g fill="none" strokeWidth="2.2">
            <circle cx={50 - p.headW / 5} cy={52 - 2} r="6" />
            <circle cx={50 + p.headW / 5} cy={52 - 2} r="6" />
            <line x1={50 - p.headW / 5 + 6} y1={52 - 2} x2={50 + p.headW / 5 - 6} y2={52 - 2} />
          </g>
        ) : null}
        {/* mouth */}
        <path d={`M45 ${bottom - 12} q 5 4 10 0`} fill="none" strokeWidth="2.2" />
      </g>
      {flagged ? (
        <g>
          <circle cx="86" cy="14" r="8" fill="#e5322d" stroke="#141414" strokeWidth="3" />
          <text x="86" y="18.5" textAnchor="middle" fontFamily="Bangers, sans-serif" fontSize="12" fill="#fff">
            !
          </text>
        </g>
      ) : null}
    </svg>
  );
}
