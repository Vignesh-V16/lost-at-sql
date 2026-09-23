import { useEffect, useRef } from 'react';

/**
 * useKeyboardShortcut('mod+enter', handler) — `mod` is ⌘ on macOS, Ctrl elsewhere.
 */
export function useKeyboardShortcut(combo, handler, { enabled = true } = {}) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return undefined;
    const parts = combo.toLowerCase().split('+');
    const key = parts[parts.length - 1];
    const needMod = parts.includes('mod');
    const needShift = parts.includes('shift');
    const needAlt = parts.includes('alt');
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const onKey = (e) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (needMod !== mod) return;
      if (needShift !== e.shiftKey) return;
      if (needAlt !== e.altKey) return;
      if (e.key.toLowerCase() !== key) return;
      e.preventDefault();
      ref.current?.(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo, enabled]);
}
