/*
 * Pictures for checking the spec against the art.
 *
 *   node boxes.mjs            every box from fx.js drawn over the lettered
 *                             original: erase (red), header (yellow), sprite
 *                             cut (green), text (cyan) → .cache/boxes-NN.jpg
 *   node boxes.mjs final      the end of every shot as the film shows it,
 *                             from panels.html (run build-panels.mjs first)
 *                             → .cache/final-NN.jpg
 *   node boxes.mjs still 12.5 out.jpg
 *                             one frame of the film at 12.5 s
 */
import { launchBrowser } from './launch.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cache = path.join(here, '.cache');
fs.mkdirSync(cache, { recursive: true });
const [, , mode = 'boxes', a1, a2] = process.argv;
const browser = await launchBrowser();

if (mode === 'boxes') {
  const { FX } = await import(pathToFileURL(path.resolve(here, '../../client/src/components/intro/fx.js')).href);
  const page = await browser.newPage({ viewport: { width: 1600, height: 1047 } });
  for (let n = 1; n <= Object.keys(FX).length; n += 1) {
    const key = `panel${String(n).padStart(2, '0')}`;
    const file = pathToFileURL(path.join(here, 'originals', `panel-${String(n).padStart(2, '0')}.jpg`)).href;
    const colours = { erase: '#ff3b3b', header: '#ffd23b', sprite: '#4ade80', text: '#22d3ee' };
    const divs = (FX[key] || []).flatMap((f, i) => {
      const box = f.type === 'sprite' ? f.cut : f.box;
      if (!box || !colours[f.type]) return [];
      const [x, y, w, h] = box;
      const c = colours[f.type];
      const label = f.type === 'text' ? `${i} ${String(f.text).split('\n')[0].slice(0, 22)}` : `${i} ${f.type}`;
      return [`<div style="position:absolute;left:${x * 100}%;top:${y * 100}%;width:${w * 100}%;height:${h * 100}%;border:2px ${f.type === 'text' ? 'dashed' : 'solid'} ${c};box-sizing:border-box"><span style="position:absolute;left:0;top:-14px;font:11px/12px monospace;color:#000;background:${c};padding:0 2px;white-space:nowrap">${label}</span></div>`];
    });
    const html = path.join(cache, 'boxes.html');
    fs.writeFileSync(html, `<!doctype html><body style="margin:0;background:#000"><div style="position:relative;width:1600px;height:1047px;background:url(${file}) 0 0 / 100% 100%">${divs.join('')}</div></body>`);
    await page.goto(pathToFileURL(html).href);
    await page.screenshot({ path: path.join(cache, `boxes-${String(n).padStart(2, '0')}.jpg`), type: 'jpeg', quality: 85 });
    console.log(`boxes-${String(n).padStart(2, '0')}.jpg`);
  }
} else {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
  await page.goto(pathToFileURL(path.join(here, process.env.FILM_PAGE || 'panels.html')).href);
  await page.waitForFunction(() => typeof window.renderFrame === 'function');
  await page.evaluate(() => document.fonts.ready);
  const info = await page.evaluate(() => window.__film);
  if (mode === 'final') {
    for (let i = 0; i < info.pages.length; i += 1) {
      const p = info.pages[i];
      await page.evaluate((t) => window.renderFrame(t), p.start + p.dur - 0.12);
      await page.screenshot({ path: path.join(cache, `final-${String(i + 1).padStart(2, '0')}.jpg`), type: 'jpeg', quality: 88 });
      console.log(`final-${String(i + 1).padStart(2, '0')}.jpg  (t = ${(p.start + p.dur - 0.12).toFixed(2)} s)`);
    }
  } else if (mode === 'still') {
    const t = Number(a1);
    await page.evaluate((tt) => window.renderFrame(tt), t);
    const out = a2 || path.join(cache, `still-${t}.jpg`);
    await page.screenshot({ path: out, type: 'jpeg', quality: 90 });
    console.log(out);
  }
}
await browser.close();
