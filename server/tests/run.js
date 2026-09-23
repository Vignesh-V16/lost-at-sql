/**
 * Test runner — collects every *.test.js under tests/ (unit + integration)
 * and runs them with node:test. Integration tests skip themselves when
 * MongoDB or the dependencies are unavailable.
 */
import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.test.js')) files.push(p);
  }
})(here);

// Test files from the pre-engine version (removed by `node scripts/remove-legacy.mjs`).
const LEGACY = new Set(['answers.test.js', 'scoring.test.js']);
const only = process.argv.slice(2);
const selected = (only.length ? files.filter((f) => only.some((o) => f.includes(o))) : files).filter((f) => !LEGACY.has(path.basename(f)));
let failed = 0;
run({ files: selected.sort(), concurrency: 1 })
  .on('test:fail', () => {
    failed += 1;
  })
  .compose(spec)
  .pipe(process.stdout);
process.on('exit', () => {
  if (failed) process.exitCode = 1;
});
