export const EVENT_STATUS_META = {
  draft: { label: 'STANDBY', tone: 'dim' },
  ready: { label: 'READY', tone: 'dim' },
  scheduled: { label: 'SCHEDULED', tone: 'violet' },
  live: { label: 'LIVE', tone: 'green' },
  paused: { label: 'PAUSED', tone: 'amber' },
  ended: { label: 'ENDED', tone: 'crimson' },
  archived: { label: 'ARCHIVED', tone: 'dim' },
  unknown: { label: 'SYNCING', tone: 'dim' },
};

/**
 * Suspect-state → board styling. Prototype semantics kept exactly:
 * suspect (amber), flagged (cyan), prime (red), accomplice (cyan-filled),
 * cleared (struck through / faded). `stamp` is the rubber-stamp tone.
 */
export const SUSPECT_STATE_META = {
  UNKNOWN: { label: '', tone: 'dim', stamp: null, card: 'bg-white', portrait: undefined },
  SUSPECT: { label: 'SUSPECT', tone: 'amber', stamp: 'amber', card: 'bg-yellow-light', portrait: undefined },
  CLEARED: { label: 'CLEARED', tone: 'dim', stamp: 'dim', card: 'bg-paper', portrait: 'dim' },
  PERSON_OF_INTEREST: { label: 'FLAGGED', tone: 'cyan', stamp: 'cyan', card: 'bg-cyan-light', portrait: 'cyan' },
  PRIME_SUSPECT: { label: 'PRIME SUSPECT', tone: 'crimson', stamp: 'crimson', card: 'bg-red-light', portrait: 'crimson' },
  ACCOMPLICE: { label: 'ACCOMPLICE', tone: 'cyan', stamp: 'cyan', card: 'bg-cyan-light', portrait: 'cyan' },
};

/** Timer milestones — remaining seconds → announcement. */
export const TIMER_MILESTONES = [
  { at: 45 * 60, title: 'FORTY-FIVE MINUTES', body: 'Forty-five minutes remain on your clock.', tone: 'violet' },
  { at: 30 * 60, title: 'HALFWAY', body: 'Thirty minutes remain. Focus your queries.', tone: 'violet' },
  { at: 15 * 60, title: 'FIFTEEN MINUTES', body: 'Begin assembling your deduction.', tone: 'crimson' },
  { at: 5 * 60, title: 'FIVE MINUTES', body: 'Close the case before the clock runs out.', tone: 'crimson' },
  { at: 60, title: 'FINAL MINUTE', body: 'Sixty seconds remain.', tone: 'crimson' },
];

/**
 * Coordinator navigation: three screens — run the event, manage the
 * roster, configure the event.
 */
export const COORDINATOR_NAV = [
  { to: '/command', label: 'COMMAND', icon: 'Radar', end: true },
  { to: '/command/participants', label: 'PARTICIPANTS', icon: 'Users' },
  { to: '/command/settings', label: 'SETTINGS', icon: 'Settings2' },
  { to: '/command/answers', label: 'ANSWERS', icon: 'KeyRound' },
];
