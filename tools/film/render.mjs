/*
 * Renders the film frame by frame with Playwright and pipes JPEGs into ffmpeg.
 *   node render.mjs out.mp4 [fromSec] [toSec] [fps] [scale]
 * ffmpeg: $FFMPEG, else the ffmpeg-static package, else `ffmpeg` on PATH.
 */
import { launchBrowser } from './launch.mjs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
export function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { return require('ffmpeg-static'); } catch { return 'ffmpeg'; }
}

const [, , out = 'video.mp4', fromArg, toArg, fpsArg = '30', scaleArg = '1.2'] = process.argv;
const FPS = Number(fpsArg);
const SCALE = Number(scaleArg);

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: SCALE });
page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.error('CONSOLE', m.text());
});
await page.goto('file://' + process.cwd().replace(/\\/g, '/') + '/' + (process.env.FILM_PAGE || 'panels.html'));
await page.waitForFunction(() => typeof window.renderFrame === 'function');
await page.evaluate(() => document.fonts.ready);
const fontsOk = await page.evaluate(() => document.fonts.check('600 20px Oswald') && document.fonts.check('600 20px "Dancing Script"'));
if (!fontsOk) console.warn('WARNING: the display fonts did not load — check the network; rendering with fallbacks');
const info = await page.evaluate(() => window.__film);
fs.writeFileSync('film-info.json', JSON.stringify(info, null, 2));
const from = fromArg ? Number(fromArg) : 0;
const to = toArg ? Number(toArg) : info.TOTAL;
const frames = Math.round((to - from) * FPS);
console.log(`total ${info.TOTAL.toFixed(2)}s · rendering ${from}s → ${to}s = ${frames} frames @ ${FPS}fps`);

const ff = spawn(ffmpegPath(), ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', 'pipe:0', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'fast', '-threads', '1', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });

const t0 = Date.now();
for (let i = 0; i < frames; i += 1) {
  const t = from + i / FPS;
  await page.evaluate((tt) => window.renderFrame(tt), t);
  const jpg = await page.screenshot({ type: 'jpeg', quality: 95 });
  if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 150 === 0) {
    const el = (Date.now() - t0) / 1000;
    console.log(`frame ${i}/${frames} · ${el.toFixed(0)}s elapsed · ${((el / Math.max(1, i)) * (frames - i)).toFixed(0)}s left`);
  }
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${out}`);
