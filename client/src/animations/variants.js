/**
 * Shared Framer Motion variants for the comic-book UI. Panels slam onto
 * the page, bursts pop, rows slide in like caption boxes. Few and reused,
 * so the whole book feels drawn by one hand.
 */

export const EASE = [0.16, 1, 0.3, 1];
export const BOUNCE = { type: 'spring', stiffness: 380, damping: 22 };
export const SNAP = { type: 'spring', stiffness: 520, damping: 30 };

/** A panel landing on the page: slight scale and tilt settling to flat. */
export const panelIn = {
  hidden: { opacity: 0, scale: 0.94, rotate: -1.2, y: 14 },
  show: { opacity: 1, scale: 1, rotate: 0, y: 0, transition: BOUNCE },
};

export const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

export const fade = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.35, ease: EASE } },
};

export const rise = panelIn;

export const stagger = (delay = 0.07, delayChildren = 0.04) => ({
  hidden: {},
  show: { transition: { staggerChildren: delay, delayChildren } },
});

/** A burst / stamp slamming in. */
export const pop = {
  hidden: { opacity: 0, scale: 0.4, rotate: -14 },
  show: { opacity: 1, scale: 1, rotate: -4, transition: { type: 'spring', stiffness: 460, damping: 18 } },
};

/** List rows arriving like caption boxes. */
export const listItem = {
  hidden: { opacity: 0, x: -18, height: 0 },
  show: { opacity: 1, x: 0, height: 'auto', transition: { duration: 0.35, ease: EASE } },
  exit: { opacity: 0, x: 14, height: 0, transition: { duration: 0.22, ease: EASE } },
};

/** Page turn: the next page slides in from the right, the old one drops away. */
export const pageTransition = {
  initial: { opacity: 0, x: 26, rotate: 0.4 },
  animate: { opacity: 1, x: 0, rotate: 0, transition: { duration: 0.38, ease: EASE } },
  exit: { opacity: 0, y: 10, transition: { duration: 0.18, ease: EASE } },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1, transition: BOUNCE },
};

export const slideFromRight = {
  hidden: { x: '100%' },
  show: { x: 0, transition: { type: 'spring', stiffness: 380, damping: 38 } },
  exit: { x: '100%', transition: { duration: 0.25, ease: EASE } },
};

export const panelReveal = {
  hidden: { opacity: 0, clipPath: 'inset(0 100% 0 0)' },
  show: { opacity: 1, clipPath: 'inset(0 0% 0 0)', transition: { duration: 0.6, ease: EASE } },
};
