import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * useProctor — exam integrity for the investigation screen.
 *
 * What a browser can actually do, and what it cannot:
 *   • It can notice that the page was hidden, that the window lost focus,
 *     that full screen was left, and that a copy/paste/context-menu/devtools
 *     shortcut was attempted — and it can block those last ones.
 *   • It CANNOT see another device, another person in the room, or a second
 *     computer, and a determined participant can disable this from devtools.
 * So every check reports to the server, where the coordinator sees it live.
 * The deterrent is that it is recorded and visible, not that it is airtight.
 *
 * Full screen is unavailable on iPhone Safari (no Element.requestFullscreen),
 * so `supported` is false there and the requirement is skipped rather than
 * locking phone participants out. Everything else still applies.
 */

export const fullscreenSupported = () => typeof document !== 'undefined' && Boolean(document.documentElement?.requestFullscreen || document.documentElement?.webkitRequestFullscreen);

export const isFullscreen = () => typeof document !== 'undefined' && Boolean(document.fullscreenElement || document.webkitFullscreenElement);

/** Ask for full screen. Must be called from a user gesture; resolves to the new state. */
export async function enterFullscreen() {
  if (!fullscreenSupported()) return false;
  try {
    const el = document.documentElement;
    await (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.());
    return isFullscreen();
  } catch {
    return false; // the browser refused (no gesture, or the user said no)
  }
}

const BLOCKED_KEYS = [
  // devtools
  { key: 'F12' },
  { key: 'I', ctrl: true, shift: true },
  { key: 'J', ctrl: true, shift: true },
  { key: 'C', ctrl: true, shift: true },
  { key: 'U', ctrl: true }, // view source
  // save / print the page away
  { key: 'S', ctrl: true },
  { key: 'P', ctrl: true },
];

const matches = (e, spec) => {
  const key = (e.key || '').length === 1 ? e.key.toUpperCase() : e.key;
  if (key !== spec.key) return false;
  const mod = e.ctrlKey || e.metaKey;
  if (spec.ctrl && !mod) return false;
  if (!spec.ctrl && mod) return false;
  if (spec.shift && !e.shiftKey) return false;
  return true;
};

/**
 * @param {object} opts
 * @param {boolean} opts.active      run at all (a live session on a play route)
 * @param {object}  opts.policy      server policy: requireFullscreen, blockCopyPaste, blockContextMenu, warnLimit, maxViolations
 * @param {(flag: {type: string, durationMs?: number, meta?: object}) => void} opts.report
 * @param {string}  opts.file        the case file on screen, for the record
 */
export function useProctor({ active, policy, report, file = '' }) {
  const [fullscreen, setFullscreen] = useState(isFullscreen);
  const [lastFlag, setLastFlag] = useState(null); // { type, at } — drives the on-screen warning
  const hiddenAt = useRef(0);
  const blurAt = useRef(null);
  const throttle = useRef(new Map());
  const reportRef = useRef(report);
  reportRef.current = report;
  const fileRef = useRef(file);
  fileRef.current = file;
  const supported = fullscreenSupported();

  /* One flag per type per second: a key held down, or a wheel of blur/focus
     events while a dialog opens, must not become fifty records. */
  const flag = useCallback((type, extra = {}) => {
    const now = Date.now();
    const last = throttle.current.get(type) || 0;
    if (now - last < 1000) return;
    throttle.current.set(type, now);
    setLastFlag({ type, at: now });
    reportRef.current?.({ type, file: fileRef.current, ...extra });
  }, []);

  /* full screen: track it, and report every exit while it is required */
  useEffect(() => {
    if (!active) return undefined;
    const onChange = () => {
      const now = isFullscreen();
      setFullscreen(now);
      if (!now && policy?.requireFullscreen && supported) flag('FULLSCREEN_EXIT');
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    setFullscreen(isFullscreen());
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, [active, policy?.requireFullscreen, supported, flag]);

  /* leaving the page: a tab switch, a minimise, or the screen locking */
  useEffect(() => {
    if (!active) return undefined;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now();
        flag('TAB_HIDDEN');
      } else if (hiddenAt.current) {
        const away = Date.now() - hiddenAt.current;
        hiddenAt.current = 0;
        // recorded for the duration only; it does not count as a second flag
        if (away >= 1000) reportRef.current?.({ type: 'TAB_RETURN', durationMs: away, file: fileRef.current });
      }
    };
    /* A blur with the document still visible means another window took focus
       — alt-tab, a second browser, a messaging app. Wait a moment so that
       merely clicking the address bar or a permission prompt is not a flag. */
    const onBlur = () => {
      if (document.hidden) return;
      blurAt.current = window.setTimeout(() => {
        blurAt.current = null;
        if (!document.hasFocus() && !document.hidden) flag('WINDOW_BLUR');
      }, 700);
    };
    const onFocus = () => {
      if (blurAt.current) {
        window.clearTimeout(blurAt.current);
        blurAt.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      if (blurAt.current) window.clearTimeout(blurAt.current);
    };
  }, [active, flag]);

  /* copy / cut / paste and the context menu */
  useEffect(() => {
    if (!active) return undefined;
    const handlers = [];
    const stop = (type) => (e) => {
      e.preventDefault();
      flag(type);
    };
    if (policy?.blockCopyPaste) {
      for (const [evt, type] of [['copy', 'COPY'], ['cut', 'CUT'], ['paste', 'PASTE']]) {
        const h = stop(type);
        document.addEventListener(evt, h, true); // capture: before Monaco sees it
        handlers.push([evt, h, true]);
      }
      const onDrop = (e) => {
        e.preventDefault();
        flag('PASTE');
      };
      document.addEventListener('drop', onDrop, true);
      handlers.push(['drop', onDrop, true]);
    }
    if (policy?.blockContextMenu) {
      const h = stop('CONTEXT_MENU');
      document.addEventListener('contextmenu', h, true);
      handlers.push(['contextmenu', h, true]);
    }
    const onKey = (e) => {
      const spec = BLOCKED_KEYS.find((s) => matches(e, s));
      if (!spec) return;
      e.preventDefault();
      e.stopPropagation();
      flag(spec.key === 'P' ? 'PRINT' : 'DEVTOOLS_KEY', { meta: { key: spec.key } });
    };
    document.addEventListener('keydown', onKey, true);
    handlers.push(['keydown', onKey, true]);
    const onBeforePrint = () => flag('PRINT');
    window.addEventListener('beforeprint', onBeforePrint);
    return () => {
      for (const [evt, h, capture] of handlers) document.removeEventListener(evt, h, capture);
      window.removeEventListener('beforeprint', onBeforePrint);
    };
  }, [active, policy?.blockCopyPaste, policy?.blockContextMenu, flag]);

  const needsFullscreen = Boolean(active && policy?.requireFullscreen && supported && !fullscreen);

  return { fullscreen, supported, needsFullscreen, lastFlag, enterFullscreen, dismissFlag: () => setLastFlag(null) };
}
