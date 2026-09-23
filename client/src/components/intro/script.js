/*
 * The intro, shot by shot — fifteen illustrated panels, the official story
 * introduction shown before the investigation begins. The lettering and the
 * motion inside each panel live in fx.js; this file gives each one its time
 * on screen, how it cuts in, its sound, the mood of the music bed and the
 * moment the camera is knocked.
 *
 *   scene     which panel (see scenes.jsx)
 *   sfx       sound events: [{ name, at (ms) }]
 *   mood      calm · mystery · shock · confusion · uncertainty · investigation · urgency
 *   cut       fade · cut · flash · glitch
 *   shake     { at (ms), ms } — a short handheld knock on an impact
 *   duration  ms on screen before the next shot; null = waits (the last one)
 *
 * The camera itself is still: no zoom, no drift — only the handheld sway
 * that scenes.jsx applies to every page.
 */
const shot = (n, dur, cut, mood, sfx, extra = {}) => ({ scene: `panel${String(n).padStart(2, '0')}`, duration: dur, cut, mood, sfx: sfx.map(([name, at]) => ({ name, at })), ...extra });

export const INTRO_SCRIPT = [
  shot(1, 8000, 'fade', 'calm', [['ambience', 0], ['blip', 1000], ['swell', 2500]]),
  shot(2, 7000, 'fade', 'calm', [['hum', 300], ['blip', 1500], ['blip', 2100]]),
  shot(3, 6000, 'cut', 'mystery', [['tick', 600], ['tick', 1100], ['tick', 1600], ['boom', 2000], ['glitch', 2100], ['critical', 3000]], { shake: { at: 2000, ms: 500 } }),
  shot(4, 7000, 'glitch', 'shock', [['glitch', 200], ['riser', 500], ['collapse', 2800], ['silence', 3200], ['blip', 4500]], { shake: { at: 2800, ms: 700 } }),
  shot(5, 9000, 'fade', 'mystery', [['blip', 1500], ['blip', 3000], ['blip', 4500], ['thud', 6000], ['thud', 6600], ['thud', 7200], ['boom', 8000]], { shake: { at: 7300, ms: 450 } }),
  shot(6, 7000, 'fade', 'uncertainty', [['swell', 200], ['blip', 1000], ['blip', 1400], ['blip', 1800], ['blip', 2200], ['blip', 2600], ['blip', 3000]]),
  shot(7, 7000, 'fade', 'investigation', [['hum', 200], ['blip', 900], ['blip', 1300], ['blip', 1700], ['blip', 2100], ['blip', 2500], ['blip', 2900], ['confirm', 3800], ['confirm', 4600]]),
  shot(8, 7000, 'fade', 'investigation', [['whoosh', 0], ['type', 3000], ['type', 3120], ['type', 3240], ['type', 3360], ['type', 3480], ['boom', 4500]], { shake: { at: 2200, ms: 400 } }),
  shot(9, 7000, 'fade', 'investigation', [['whoosh', 0], ['blip', 900], ['blip', 1400], ['blip', 1900], ['blip', 2400], ['confirm', 3000], ['boom', 5000]], { shake: { at: 5000, ms: 400 } }),
  shot(10, 8000, 'cut', 'investigation', [['cut', 0], ['type', 1000], ['type', 2000], ['type', 3000], ['type', 4000], ['type', 5000]]),
  shot(11, 8000, 'fade', 'investigation', [['whoosh', 0], ['blip', 800], ['lock', 1400], ['lock', 1900], ['lock', 2400], ['lock', 2900], ['lock', 3400]]),
  shot(12, 6000, 'flash', 'urgency', [['cut', 0], ['tick', 1500], ['tick', 2500], ['thud', 3500], ['thud', 4200], ['thud', 4900]], { shake: { at: 1800, ms: 400 } }),
  shot(13, 7000, 'fade', 'urgency', [['blip', 1000], ['blip', 1400], ['type', 2200], ['type', 2600], ['type', 3000], ['type', 3400], ['confirm', 4400]]),
  shot(14, 6000, 'flash', 'urgency', [['boom', 300], ['swell', 1500], ['blip', 3500]], { shake: { at: 300, ms: 500 } }),
  shot(15, null, 'fade', 'urgency', [['silence', 0], ['boom', 1000], ['swell', 1200], ['confirm', 4000]], { shake: { at: 1000, ms: 600 } }),
];
