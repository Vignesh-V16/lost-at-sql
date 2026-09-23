#!/usr/bin/env node
/*
 * Lab mode — one command to serve the whole room from this machine.
 *
 *   npm run lab            check everything, print the URL, start both servers
 *   npm run lab -- --check  checks and URL only, start nothing
 *
 * The other machines install nothing. They open the URL this prints.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { lanAddresses } from '../server/src/utils/lan.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const portArg = process.argv.indexOf('--port');
/* 80 means the room types http://<name> with nothing after it. It needs an
   inbound firewall rule for port 80, the same way 5173 already has one. */
const CLIENT_PORT = portArg > -1 ? Number(process.argv[portArg + 1]) : Number(process.env.LAB_PORT) || 5173;
const API_PORT = Number(process.env.PORT) || 5000;

const out = (s = '') => process.stdout.write(`${s}\n`);
const rule = (ch = '─') => out(ch.repeat(68));
const ok = (s) => out(`  [ok]   ${s}`);
const warn = (s) => out(`  [note] ${s}`);
const bad = (s) => out(`  [STOP] ${s}`);

/** Does this URL answer with a success code? Used to tell "our server is
    already running" apart from "something else has grabbed the port". */
const httpOk = (url) =>
  new Promise((resolve) => {
    const req = http.get(url, { timeout: 2500 }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });

/** Is something already listening here? */
const portBusy = (port) =>
  new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port, timeout: 800 });
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });

const problems = [];

rule('═');
out('  LOST AT SQL — lab server');
rule('═');

/* ── 1. where the room should point ───────────────────────────────── */
const host = os.hostname();
const addresses = lanAddresses().filter((a) => !a.selfAssigned);
out('');
out('  WRITE THIS ON THE BOARD');
out('');
const suffix = CLIENT_PORT === 80 ? '' : `:${CLIENT_PORT}`;
if (addresses.length) {
  for (const a of addresses) out(`     http://${a.address}${suffix}`);
  out(`     http://${host.toLowerCase()}${suffix}   (the machine name also works)`);
} else {
  problems.push('This machine has no network address. Plug in the cable or join the Wi-Fi.');
  out('     (no network address yet)');
}
out('');
rule();
out('  Checks');

/* ── 2. network ───────────────────────────────────────────────────── */
if (addresses.length) ok(`reachable on ${addresses.map((a) => `${a.address} (${a.name})`).join(', ')}`);
for (const a of lanAddresses().filter((x) => x.selfAssigned)) warn(`${a.name} has no address from the network (${a.address}) — ignore it, or plug that cable in`);

/* ── 3. ports ─────────────────────────────────────────────────────── */
const [apiBusy, clientBusy] = await Promise.all([portBusy(API_PORT), portBusy(CLIENT_PORT)]);
/* Busy ports are usually THIS app already running in another window, which
   is fine — the lab can connect right now. Only a port held by something
   else is a problem. */
let alreadyServing = false;
if (apiBusy && clientBusy) {
  const [apiHealthy, clientHealthy] = await Promise.all([httpOk(`http://127.0.0.1:${API_PORT}/api/health`), httpOk(`http://127.0.0.1:${CLIENT_PORT}/`)]);
  alreadyServing = apiHealthy && clientHealthy;
}
if (alreadyServing) {
  ok('already running in another window — the lab can connect right now');
} else if (apiBusy || clientBusy) {
  const held = [apiBusy ? API_PORT : null, clientBusy ? CLIENT_PORT : null].filter(Boolean).join(' and ');
  problems.push(`Port ${held} is held by something that is not this app. Close that program, or restart the machine, then run this again.`);
} else if (checkOnly) {
  warn(`nothing running yet on ${API_PORT} or ${CLIENT_PORT} — run  npm run lab  to start it`);
}

/* ── 4. the event itself, straight from the database ──────────────── */
try {
  const { connectDatabase, disconnectDatabase } = await import('../server/src/config/db.js');
  const models = await import('../server/src/models/index.js');
  await connectDatabase();
  const [event, files, participants, coordinators] = await Promise.all([
    models.Event.findOne().lean(),
    models.CaseFile.countDocuments(),
    models.User.countDocuments({ role: 'participant', isActive: true }),
    models.User.countDocuments({ role: 'coordinator', isActive: true }),
  ]);
  ok(`database connected · ${files} case files · ${participants} investigators · ${coordinators} coordinators`);
  if (!files) problems.push('No case files in the database. Seed them before the event.');
  if (!participants) problems.push('No investigator accounts. Create them under Participants in the command centre.');
  if (!coordinators) problems.push('No coordinator account — nobody can run the event.');
  if (event) {
    const status = String(event.status || 'draft').toUpperCase();
    if (status === 'LIVE') ok(`event is ${status} — participants can play now`);
    else warn(`event is ${status} — start it from the command centre when the room is ready`);
    const p = event.proctoring || {};
    ok(`integrity: ${p.enabled === false ? 'off' : 'recording'}${p.requireFullscreen === false ? '' : ', full screen required'}${Number(p.maxViolations) > 0 ? `, acts at ${p.maxViolations} flags` : ', never acts on its own'}`);
  } else {
    problems.push('No event document found. Seed the event first.');
  }
  await disconnectDatabase();
} catch (err) {
  problems.push(`Database unreachable: ${err.message.split(String.fromCharCode(10))[0]}  —  run  npm run check:db  for the reason.`);
}

/* ── 5. verdict ───────────────────────────────────────────────────── */
out('');
if (problems.length) {
  rule();
  for (const p of problems) bad(p);
  rule();
  if (!checkOnly) {
    out('');
    out('  Fix the above and run  npm run lab  again.');
    process.exit(1);
  }
} else {
  ok('ready');
}
rule();

if (checkOnly) {
  out('');
  process.exit(0);
}

if (alreadyServing) {
  out('');
  out('  The server is already up in another window, so there is nothing to start.');
  out('  Leave that window open and send the lab to the address above.');
  out('');
  process.exit(0);
}

out('');
out('  Starting the server. Leave this window open for the whole event.');
out('  Stop with Ctrl+C.');
out('');

const child = spawn('npm', ['run', 'dev'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, LAB_PORT: String(CLIENT_PORT) },
});
child.on('exit', (code) => process.exit(code ?? 0));
