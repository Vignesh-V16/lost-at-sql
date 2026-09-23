// Inlines the shared spec (fx.js: lettering + motion; typeset.js: layout
// and camera maths) into the compositor template → panels.html.
//   node build-panels.mjs ../../client/src/components/intro/fx.js .cache/ panels.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [, , fxPath = '../../client/src/components/intro/fx.js', panelDir = '.cache/', out = 'panels.html'] = process.argv;
// both files share one classic <script>: drop `export` and the import between them
const strip = (src) => src.replace(/^export\s+/gm, '').replace(/^import\s[^\n]*;\s*$/gm, '');
const fx = strip(fs.readFileSync(path.resolve(here, fxPath), 'utf8'));
const typeset = strip(fs.readFileSync(path.resolve(path.dirname(path.resolve(here, fxPath)), 'typeset.js'), 'utf8'));
const fontUrl = /FONT_URL = '([^']+)'/.exec(typeset)?.[1] || '';
const spriteDir = path.relative(here, path.resolve(here, '../../client/public/intro/sprites')).replace(/\\/g, '/') + '/';
// (function replacements: the sources contain `$`, which a string replacement would interpret)
const html = fs.readFileSync(path.resolve(here, 'panels.template.html'), 'utf8')
  .replace('/*FX_SPEC*/', () => fx)
  .replace('/*TYPESET*/', () => typeset)
  .replace('/*PANEL_DIR*/', () => panelDir)
  .replace('/*SPRITE_DIR*/', () => spriteDir)
  .replace('/*FONT_URL*/', () => fontUrl);
fs.writeFileSync(path.resolve(here, out), html);
console.log('built', out);
