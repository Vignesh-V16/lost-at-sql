/*
 * Checks that every typeset line fits its box — with the real fonts, in the
 * compositor itself (panels.html; run build-panels.mjs first). Lists every
 * overflow and exits 1, or prints `all text fits`.
 *
 *   node check-text.mjs
 */
import { launchBrowser } from './launch.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
await page.goto(pathToFileURL(path.join(here, process.env.FILM_PAGE || 'panels.html')).href);
await page.waitForFunction(() => typeof window.renderFrame === 'function');
await page.evaluate(() => document.fonts.ready);
const fonts = await page.evaluate(() => ['600 20px Oswald', '600 20px "Dancing Script"', '500 20px "JetBrains Mono"'].map((f) => [f, document.fonts.check(f)]));
for (const [f, ok] of fonts) if (!ok) console.warn(`font not loaded: ${f} — the measurements below use a fallback face`);

const problems = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('.fx.text')) {
    const tx = el.querySelector('.tx');
    const span = tx.firstElementChild;
    const saved = tx.style.transform;
    tx.style.transform = 'none';
    const box = tx.getBoundingClientRect();
    const r = span.getBoundingClientRect();
    tx.style.transform = saved;
    const dw = r.width - box.width;
    const dh = r.height - box.height;
    if (dw > 1 || dh > 1) out.push({ panel: el.dataset.panel, i: Number(el.dataset.i), text: span.textContent.replace(/\n/g, ' / '), dw: Math.round(dw), dh: Math.round(dh), size: tx.style.fontSize });
  }
  return out;
});
await browser.close();
if (problems.length) {
  for (const p of problems) console.log(`${p.panel} fx#${p.i} "${p.text}" overflows by ${Math.max(0, p.dw)}×${Math.max(0, p.dh)} px (font ${p.size})`);
  console.log(`${problems.length} line(s) do not fit`);
  process.exit(1);
}
console.log('all text fits');
