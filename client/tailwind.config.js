/** @type {import('tailwindcss').Config} */

/*
 * LOST AT SQL — classic comic-book design system.
 *
 * Paper, ink and four-colour process. Panels are white with a thick ink
 * border and a hard offset shadow; captions are yellow boxes; speech
 * bubbles carry dialogue; bursts shout. Colours are named after what a
 * colourist would call them. The old palette names (cyan / crimson /
 * violet / amber / text / ink-*) are kept as aliases so no component
 * has to change its vocabulary.
 */
const ink = '#141414';
const paper = '#fbf6e9';
const paper2 = '#f1e8d2';

const red = { DEFAULT: '#e5322d', light: '#ffd9d6', deep: '#b0201c' };
const yellow = { DEFAULT: '#ffd12e', light: '#fff2b8', deep: '#e0ae00' };
const blue = { DEFAULT: '#2364e8', light: '#d9e4ff', deep: '#1747ad' };
const cyan = { DEFAULT: '#2bbfe6', light: '#d4f1fa', deep: '#1a8fb0' };
const green = { DEFAULT: '#2eaf5c', light: '#d8f3e1', deep: '#196a36' };
const purple = { DEFAULT: '#7a3be6', light: '#e7dbff', deep: '#5527a8' };
const orange = { DEFAULT: '#ff8a1f', light: '#ffe4c9', deep: '#c96300' };

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: ink, soft: '#524d45', faint: '#9d9484', 950: ink, 900: '#1c1b19', 850: '#242220', 800: '#2b2926', 700: '#3a3733', 600: '#4a463f', 500: '#6b655b', 400: '#8a8375' },
        paper: { DEFAULT: paper, 2: paper2, 3: '#e6dcc2' },
        line: { DEFAULT: '#d8cfb6', strong: ink, faint: '#e9e1cc' },
        text: { DEFAULT: ink, muted: '#524d45', dim: '#9d9484' },
        red,
        yellow,
        blue,
        cyan,
        green,
        purple,
        orange,
        /* aliases for the previous vocabulary */
        crimson: { DEFAULT: red.DEFAULT, bright: red.DEFAULT, deep: red.deep, glow: 'rgba(229,50,45,0.35)' },
        violet: { DEFAULT: purple.DEFAULT, bright: purple.DEFAULT, deep: purple.deep, glow: 'rgba(122,59,230,0.3)' },
        amber: { DEFAULT: orange.DEFAULT, light: orange.light, deep: orange.deep },
      },
      fontFamily: {
        display: ['Bangers', '"Comic Neue"', 'Impact', 'sans-serif'],
        sans: ['"Comic Neue"', '"Comic Sans MS"', 'Nunito', 'system-ui', 'sans-serif'],
        body: ['"Comic Neue"', '"Comic Sans MS"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.72rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
        display: ['clamp(3.5rem, 11vw, 9rem)', { lineHeight: '0.9', letterSpacing: '0.02em' }],
      },
      letterSpacing: {
        widest2: '0.08em',
        comic: '0.04em',
      },
      borderWidth: {
        3: '3px',
        5: '5px',
      },
      boxShadow: {
        comic: `4px 4px 0 0 ${ink}`,
        'comic-sm': `2px 2px 0 0 ${ink}`,
        'comic-lg': `7px 7px 0 0 ${ink}`,
        'comic-xl': `10px 10px 0 0 ${ink}`,
        'comic-red': `4px 4px 0 0 ${red.DEFAULT}`,
        'comic-blue': `4px 4px 0 0 ${blue.DEFAULT}`,
        'comic-yellow': `4px 4px 0 0 ${yellow.DEFAULT}`,
        panel: `4px 4px 0 0 ${ink}`,
        'glow-cyan': '0 0 0 4px rgba(43,191,230,0.35)',
        'glow-crimson': '0 0 0 4px rgba(229,50,45,0.3)',
        'glow-violet': '0 0 0 4px rgba(122,59,230,0.3)',
        'glow-yellow': '0 0 0 4px rgba(255,209,46,0.55)',
      },
      backgroundImage: {
        halftone: 'radial-gradient(circle, rgba(20,20,20,0.16) 1.2px, transparent 1.4px)',
        'halftone-strong': 'radial-gradient(circle, rgba(20,20,20,0.28) 1.6px, transparent 1.8px)',
        'halftone-white': 'radial-gradient(circle, rgba(255,255,255,0.35) 1.4px, transparent 1.6px)',
        'action-lines': 'repeating-conic-gradient(from 0deg at 50% 50%, rgba(20,20,20,0.9) 0deg 2deg, transparent 2deg 7deg)',
        stripes: `repeating-linear-gradient(135deg, ${ink} 0 6px, transparent 6px 14px)`,
        'stripes-yellow': `repeating-linear-gradient(135deg, ${yellow.DEFAULT} 0 10px, ${ink} 10px 20px)`,
      },
      backgroundSize: {
        dots: '7px 7px',
        'dots-lg': '11px 11px',
      },
      keyframes: {
        blink: { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0 } },
        pulseRing: { '0%': { transform: 'scale(0.9)', opacity: 0.8 }, '100%': { transform: 'scale(1.6)', opacity: 0 } },
        wobble: {
          '0%, 100%': { transform: 'rotate(-1.5deg)' },
          '50%': { transform: 'rotate(1.5deg)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-6px)' },
          '40%': { transform: 'translateX(6px)' },
          '60%': { transform: 'translateX(-4px)' },
          '80%': { transform: 'translateX(4px)' },
        },
        pop: {
          '0%': { transform: 'scale(0.6)', opacity: 0 },
          '70%': { transform: 'scale(1.08)', opacity: 1 },
          '100%': { transform: 'scale(1)', opacity: 1 },
        },
        floaty: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        spinSlow: { to: { transform: 'rotate(360deg)' } },
        dash: { to: { strokeDashoffset: '-24' } },
        grain: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '10%': { transform: 'translate(-3%, -2%)' },
          '30%': { transform: 'translate(2%, 3%)' },
          '50%': { transform: 'translate(-1%, 4%)' },
          '70%': { transform: 'translate(3%, -3%)' },
          '90%': { transform: 'translate(-4%, 1%)' },
        },
      },
      animation: {
        blink: 'blink 1s steps(2) infinite',
        pulseRing: 'pulseRing 1.6s ease-out infinite',
        wobble: 'wobble 2.4s ease-in-out infinite',
        shake: 'shake 0.45s ease-in-out 1',
        pop: 'pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) 1',
        floaty: 'floaty 3.2s ease-in-out infinite',
        shimmer: 'shimmer 2.4s linear infinite',
        marquee: 'marquee 22s linear infinite',
        spinSlow: 'spinSlow 24s linear infinite',
        dash: 'dash 1.2s linear infinite',
        grain: 'grain 0.8s steps(4) infinite',
      },
      transitionTimingFunction: {
        cinematic: 'cubic-bezier(0.16, 1, 0.3, 1)',
        bouncy: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
};
