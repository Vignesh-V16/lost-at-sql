#!/usr/bin/env node
/*
 * Is the database reachable from THIS machine, on THIS network?
 *
 *   npm run check:db
 *
 * Run it on the new laptop after plugging into the lab network. It tells
 * you in plain words whether the event will work, and if not, which of the
 * usual three things is wrong.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import dns from 'node:dns/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const mongoose = require_('mongoose');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = (s = '') => process.stdout.write(`${s}\n`);
const rule = () => out('─'.repeat(64));
const ok = (s) => out(`  [ok]   ${s}`);
const bad = (s) => out(`  [FAIL] ${s}`);
const note = (s) => out(`  [note] ${s}`);

const uri = (() => {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const envFile = path.join(root, 'server', '.env');
  if (fs.existsSync(envFile)) {
    const m = /^MONGODB_URI=(.+)$/m.exec(fs.readFileSync(envFile, 'utf8'));
    if (m) return m[1].trim();
  }
  return null;
})();

out('');
rule();
out('  Database check');
rule();

if (!uri) {
  bad('No MONGODB_URI found.');
  out('');
  out('  Create server/.env (copy server/.env.example) and put your');
  out('  connection string in it. See SETUP-NEW-LAPTOP.md.');
  out('');
  process.exit(1);
}

const isAtlas = uri.startsWith('mongodb+srv://') || uri.includes('mongodb.net');
out(`  Using: ${isAtlas ? 'MongoDB Atlas (cloud)' : 'a local MongoDB'}`);
out(`         ${uri.replace(/\/\/[^:]+:[^@]+@/, '//…:…@')}`);
out('');

/* For Atlas, check the two things that fail on a locked-down campus
   network before blaming the password. */
if (isAtlas) {
  const host = /@([^/?]+)/.exec(uri)?.[1];
  if (host) {
    try {
      const srv = await dns.resolveSrv(`_mongodb._tcp.${host}`);
      ok(`name lookup works — cluster has ${srv.length} server(s)`);
      const target = srv[0];
      const reachable = await new Promise((resolve) => {
        const s = net.connect({ host: target.name, port: target.port, timeout: 8000 });
        s.on('connect', () => { s.destroy(); resolve(true); });
        s.on('error', () => resolve(false));
        s.on('timeout', () => { s.destroy(); resolve(false); });
      });
      if (reachable) ok(`this network allows the database port (${target.port})`);
      else {
        bad(`this network BLOCKS port ${target.port} — Atlas cannot be reached from here`);
        note('Ask the lab admin to allow outbound 27017, or use a local MongoDB instead.');
      }
    } catch (err) {
      bad(`name lookup failed: ${err.message}`);
      note('Either there is no internet on this network, or the cluster address is wrong.');
    }
  }
}

out('');
out('  Connecting...');
const started = Date.now();
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  ok(`connected in ${Date.now() - started} ms`);
  const db = mongoose.connection.db;
  const counts = {};
  for (const name of ['events', 'casefiles', 'users', 'databasetables']) {
    counts[name] = await db.collection(name).countDocuments().catch(() => 0);
  }
  const event = await db.collection('events').findOne({});
  const participants = await db.collection('users').countDocuments({ role: 'participant' });
  const coordinators = await db.collection('users').countDocuments({ role: 'coordinator' });
  out('');
  ok(`${counts.casefiles} case files · ${counts.databasetables} dataset tables · ${participants} investigators · ${coordinators} coordinators`);
  if (event) ok(`event "${event.name}" is ${String(event.status || 'draft').toUpperCase()}`);
  out('');
  if (!counts.casefiles || !participants) {
    rule();
    bad('The database is reachable but EMPTY.');
    out('  Run  npm run import  on the laptop that has the data.');
    rule();
    await mongoose.disconnect();
    process.exit(1);
  }
  rule();
  ok('Ready. Run  npm run lab  to serve the room.');
  rule();
  out('');
  await mongoose.disconnect();
} catch (err) {
  out('');
  bad(err.message.split('\n')[0]);
  out('');
  const m = err.message.toLowerCase();
  if (m.includes('authentication') || m.includes('bad auth')) {
    note('The username or password in the connection string is wrong.');
    note('Check Database Access in Atlas, and that any special characters');
    note('in the password are percent-encoded (@ becomes %40, # becomes %23).');
  } else if (m.includes('timed out') || m.includes('econnrefused') || m.includes('serverselection')) {
    if (isAtlas) {
      note('Atlas did not answer. The usual causes, in order:');
      note('  1. Network Access in Atlas does not allow this address —');
      note('     set it to allow from anywhere (0.0.0.0/0).');
      note('  2. This network blocks outbound port 27017.');
      note('  3. No internet on this network at all.');
    } else {
      note('No local MongoDB is running. Open Services and start "MongoDB Server",');
      note('or point MONGODB_URI at your Atlas cluster instead.');
    }
  } else {
    note('Check the connection string in server/.env against SETUP-NEW-LAPTOP.md.');
  }
  out('');
  process.exit(1);
}
