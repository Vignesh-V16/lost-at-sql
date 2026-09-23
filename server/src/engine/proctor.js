/**
 * Exam-integrity vocabulary — pure data and pure functions, so both the
 * serializer and the service can use it without importing each other.
 *
 * Weight 1 counts toward the coordinator's limit; weight 0 is recorded for
 * the review but never held against the participant on its own.
 */
export const VIOLATION_WEIGHTS = Object.freeze({
  TAB_HIDDEN: 1, // switched tab, minimised, or locked the screen
  WINDOW_BLUR: 1, // focus moved to another window or app
  FULLSCREEN_EXIT: 1, // left full screen while it was required
  TAB_RETURN: 0, // came back — carries how long they were away
  COPY: 0,
  CUT: 0,
  PASTE: 1, // pasting an answer in is the one that matters
  CONTEXT_MENU: 0,
  DEVTOOLS_KEY: 1,
  PRINT: 1,
  MULTI_SESSION: 1, // the same credentials opened the investigation elsewhere
});

export const VIOLATION_TYPES = Object.freeze(Object.keys(VIOLATION_WEIGHTS));

/** Coordinator settings, with the shipped defaults filled in. */
export function proctorPolicy(event) {
  const p = event?.proctoring || {};
  return {
    enabled: p.enabled !== false,
    requireFullscreen: p.requireFullscreen !== false,
    blockCopyPaste: p.blockCopyPaste !== false,
    blockContextMenu: p.blockContextMenu !== false,
    warnLimit: Number.isFinite(p.warnLimit) ? p.warnLimit : 3,
    maxViolations: Number(p.maxViolations) || 0,
    onLimit: p.onLimit || 'notify',
  };
}

/** What a participant is told about their own record — the policy plus their tally. */
export function proctorView(session, event) {
  return {
    ...proctorPolicy(event),
    violations: session?.violationCount || 0,
    awayMs: session?.awayMs || 0,
    locked: Boolean(session?.proctorLocked),
    disqualified: session?.status === 'disqualified',
    /* the coordinator's own words, so the participant is never left guessing */
    disqualifiedReason: session?.status === 'disqualified' ? session?.disqualifiedReason || '' : '',
  };
}
