import { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

const DEFAULT_FORMAT = (n) => Math.round(n).toLocaleString();

/**
 * CountUp — a number that rolls to its new value instead of snapping.
 * Renders plain text (tabular digits are the caller's job) and writes
 * straight to the DOM node so nothing re-renders per frame.
 */
export function CountUp({ value = 0, duration = 0.8, className, format = DEFAULT_FORMAT }) {
  const ref = useRef(null);
  const shown = useRef(0);
  const fmt = useRef(format);
  fmt.current = format;
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const target = Number(value) || 0;
    if (reduce || shown.current === target) {
      node.textContent = fmt.current(target);
      shown.current = target;
      return undefined;
    }
    const controls = animate(shown.current, target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        shown.current = v;
        node.textContent = fmt.current(v);
      },
      onComplete: () => {
        shown.current = target;
      },
    });
    return () => controls.stop();
  }, [value, duration, reduce]);

  return (
    <span ref={ref} className={className}>
      {format(Number(value) || 0)}
    </span>
  );
}
