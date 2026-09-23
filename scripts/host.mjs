#!/usr/bin/env node
/*
 * Event mode: one machine serves everything to the room.
 *
 *   npm run host              build the client, then serve it and the API on one port
 *   npm run host -- --no-build   skip the build (nothing changed since last time)
 *   PORT=8080 npm run host    a different port
 *
 * Why one port: the participants' browsers then talk to a single origin, so
 * there is no proxy, no CORS and exactly one firewall rule to open. The Vite
 * dev server is not involved — the built files are served by the API process.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { lanUrls } from '../server/src/utils/lan.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 5000;
const skipBuild = process.argv.includes('--no-build');

const run = (command, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
  });

const line = (s = '') => process.stdout.write(`${s}\n`);

if (!skipBuild) {
  line('Building the client…');
  await run('npm', ['run', 'build', '--prefix', 'client'], { cwd: root });
}

const dist = path.join(root, 'client', 'dist', 'index.html');
if (!fs.existsSync(dist)) {
  line('');
  line('No built client found. Run it without --no-build once:  npm run host');
  process.exit(1);
}

const urls = lanUrls(port);
line('');
line('─'.repeat(64));
line('  LOST AT SQL — event server');
line('─'.repeat(64));
if (urls.length) {
  line('  On every other machine, open:');
  for (const u of urls) {
    const note = u.selfAssigned ? '  ← no address from the network yet' : u.wired ? '  ← wired' : '';
    line(`     ${u.url}${note}`);
  }
} else {
  line('  This machine has no network address yet.');
  line('  Plug in the Ethernet cable (or join the Wi-Fi) and start again.');
}
line('');
line(`  On this machine:  http://localhost:${port}`);
line('  Stop with Ctrl+C.');
line('─'.repeat(64));
line('');

await run('node', ['src/index.js'], {
  cwd: path.join(root, 'server'),
  env: { ...process.env, SERVE_CLIENT: '1', PORT: String(port) },
});
