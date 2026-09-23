#!/usr/bin/env node
/*
 * Point this machine at a MongoDB Atlas cluster.
 *
 *   npm run use:atlas "mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/..."
 *
 * Paste the string exactly as Atlas gives it under Connect → Drivers. This
 * fixes it up (adds the database name, encodes a password with awkward
 * characters), writes it into server/.env, and then actually connects to
 * prove it works before you rely on it.
 *
 * Nothing is printed with the password visible, and server/.env is not
 * tracked by git.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const mongoose = require_('mongoose');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, 'server', '.env');
const DB_NAME = 'lost_at_sql';

const out = (s = '') => process.stdout.write(`${s}\n`);
const rule = () => out('─'.repeat(64));
const ok = (s) => out(`  [ok]   ${s}`);
const bad = (s) => out(`  [FAIL] ${s}`);
const note = (s) => out(`  [note] ${s}`);
const hide = (u) => u.replace(/\/\/([^:]+):([^@]+)@/, (_, user) => `//${user}:••••••@`);

const raw = process.argv.slice(2).find((a) => a.startsWith('mongodb'));

out('');
rule();
out('  Point this machine at MongoDB Atlas');
rule();

if (!raw) {
  bad('No connection string given.');
  out('');
  out('  In Atlas: Connect → Drivers → copy the string, then run');
  out('');
  out('     npm run use:atlas "mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority"');
  out('');
  out('  Keep the quotes around it.');
  out('');
  process.exit(1);
}

/* Normalise: make sure the database name is in the path, and percent-encode
   a password containing characters that break a URL. */
let uri = raw.trim().replace(/^["']|["']$/g, '');
const shape = /^(mongodb(?:\+srv)?:\/\/)([^:]+):([^@]+)@([^/?]+)(\/[^?]*)?(\?.*)?$/.exec(uri);
if (!shape) {
  bad('That does not look like a connection string.');
  note('It should start with mongodb+srv:// and contain a username, password and host.');
  out('');
  process.exit(1);
}
const [, scheme, user, pass, host, , query] = shape;
const safePass = /[%@:/?#[\]]/.test(pass) ? encodeURIComponent(pass) : pass;
if (safePass !== pass) note('password contained characters that need encoding — handled');
uri = `${scheme}${user}:${safePass}@${host}/${DB_NAME}${query || '?retryWrites=true&w=majority'}`;

out(`  Cluster : ${host}`);
out(`  User    : ${user}`);
out(`  Database: ${DB_NAME}`);
out('');
out('  Connecting before writing anything...');

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  ok('connected to Atlas');
  const counts = await mongoose.connection.db.collection('casefiles').countDocuments().catch(() => 0);
  ok(counts ? `${counts} case files already there` : 'the database is empty — you will load it next');
  await mongoose.disconnect();
} catch (err) {
  out('');
  bad(err.message.split('\n')[0]);
  out('');
  const m = err.message.toLowerCase();
  if (m.includes('auth')) {
    note('The username or password is wrong. Copy them again from Atlas,');
    note('under Database Access.');
  } else if (m.includes('timed out') || m.includes('serverselection')) {
    note('Atlas did not answer. Check Network Access in Atlas allows');
    note('0.0.0.0/0, and that this network is online.');
  } else {
    note('Check the string you pasted matches the one in Atlas exactly.');
  }
  out('');
  out('  Nothing was written. server/.env is unchanged.');
  out('');
  process.exit(1);
}

/* Only now touch the config, and keep a copy of what was there. */
if (!fs.existsSync(envFile)) {
  const example = path.join(root, 'server', '.env.example');
  if (!fs.existsSync(example)) {
    bad('server/.env is missing and there is no .env.example to copy.');
    process.exit(1);
  }
  fs.copyFileSync(example, envFile);
  note('created server/.env from the example — check JWT_SECRET before the event');
}
fs.copyFileSync(envFile, `${envFile}.backup`);
let text = fs.readFileSync(envFile, 'utf8');
text = /^MONGODB_URI=.*$/m.test(text) ? text.replace(/^MONGODB_URI=.*$/m, `MONGODB_URI=${uri}`) : `${text.trimEnd()}\nMONGODB_URI=${uri}\n`;
fs.writeFileSync(envFile, text);

out('');
ok(`written to server/.env    ${hide(uri)}`);
ok('previous settings kept as server/.env.backup');
out('');
rule();
out('  Next:');
out('     npm run import      load the event into Atlas (from the laptop that has it)');
out('     npm run check:db    confirm it is all there');
out('     npm run lab         serve the room');
rule();
out('');
