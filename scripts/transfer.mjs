#!/usr/bin/env node
/*
 * Move the whole event to another machine.
 *
 *   npm run export        on THIS laptop  — writes transfer/event-data.json
 *   npm run import        on the NEW one  — loads it into that machine's MongoDB
 *
 * What travels: the event and its settings, the six case files, the dataset
 * tables, the evidence catalogue, and every account with its access code
 * intact — the codes you already printed keep working, because what is
 * stored is the hash, and the hash is copied as-is.
 *
 * What does NOT travel by default: sessions, scores, query history and audit
 * logs. Tomorrow starts clean, which is what you want. Add --with-sessions
 * if you really need play-in-progress carried over.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

/* Resolve mongoose wherever npm put it — the root in this workspace, or
   inside server/ if the install layout differs on the new machine. */
const require_ = createRequire(import.meta.url);
const mongoose = require_('mongoose');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'transfer', 'event-data.json');
const mode = process.argv.includes('--import') ? 'import' : 'export';
const withSessions = process.argv.includes('--with-sessions');

/* The collections that define the event. Order matters on import: accounts
   and content first, anything referring to them after. */
const CORE = ['events', 'casefiles', 'databasetables', 'evidencedefinitions', 'questions', 'suspects', 'users', 'teams'];
const PLAY = ['investigationsessions', 'investigationprogresses', 'submissions', 'evidences', 'evidenceconnections', 'leaderboards', 'queryattempts'];
const collections = withSessions ? [...CORE, ...PLAY] : CORE;

const out = (s = '') => process.stdout.write(`${s}\n`);
const rule = () => out('─'.repeat(64));

const uri = (() => {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI; // lets this be tested against a scratch database
  const envFile = path.join(root, 'server', '.env');
  if (fs.existsSync(envFile)) {
    const m = /^MONGODB_URI=(.+)$/m.exec(fs.readFileSync(envFile, 'utf8'));
    if (m) return m[1].trim();
  }
  return 'mongodb://127.0.0.1:27017/lost_at_sql';
})();

out('');
rule();
out(`  LOST AT SQL — ${mode === 'export' ? 'export the event' : 'import the event'}`);
rule();
out(`  database: ${uri.replace(/\/\/[^@]*@/, '//…@')}`);
out('');

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 6000 });
} catch (err) {
  out(`  Could not reach MongoDB: ${err.message}`);
  out('');
  out('  Is MongoDB installed and running on this machine?');
  out('  Windows: open Services and check "MongoDB Server" is Running.');
  out('');
  process.exit(1);
}
const db = mongoose.connection.db;

if (mode === 'export') {
  const data = { exportedAt: new Date().toISOString(), withSessions, collections: {} };
  for (const name of collections) {
    const docs = await db.collection(name).find({}).toArray();
    data.collections[name] = docs;
    out(`  ${name.padEnd(24)} ${String(docs.length).padStart(4)} document(s)`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1));
  const kb = Math.round(fs.statSync(file).size / 1024);
  out('');
  out(`  Written to  ${file}   (${kb} KB)`);
  out('');
  out('  Copy the WHOLE project folder to the new laptop, including:');
  out('     transfer\\event-data.json   the data you just exported');
  out('     server\\.env                the settings and secret key');
  out('  You can leave out node_modules and client\\dist — they are rebuilt.');
  out('');
} else {
  if (!fs.existsSync(file)) {
    out(`  No export found at ${file}`);
    out('  Run  npm run export  on the old laptop first, and copy the file across.');
    out('');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  out(`  Export taken ${data.exportedAt}`);
  out('');
  for (const [name, docs] of Object.entries(data.collections)) {
    if (!docs.length) {
      out(`  ${name.padEnd(24)} empty, skipped`);
      continue;
    }
    /* Replace wholesale: this machine is becoming the event server, so its
       copy of these collections should match the old one exactly. */
    await db.collection(name).deleteMany({});
    await db.collection(name).insertMany(docs.map(reviveIds));
    out(`  ${name.padEnd(24)} ${String(docs.length).padStart(4)} document(s) loaded`);
  }
  out('');
  out('  Done. Every account keeps the access code you already handed out.');
  out('');
  out('  Next:  npm run lab');
  out('');
}

await mongoose.disconnect();

/* JSON turns ObjectIds and Dates into plain values; put them back so the
   app sees exactly what it stored. */
function reviveIds(doc) {
  const walk = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(walk);
    if (v.$oid) return new mongoose.Types.ObjectId(v.$oid);
    if (v.$date) return new Date(v.$date);
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = walk(val);
    return o;
  };
  return walk(doc);
}
