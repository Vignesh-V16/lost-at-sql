/*
 * Copy a file's participant-facing and validation content from the content
 * definition (src/content/blackCipher/case.js) onto its seeded CaseFile
 * document: the file's tables and, per challenge, brief, starterSql, hint
 * text, validation, referenceSql, failureMessage and successMessage.
 * Sessions, participants and scores are untouched — this is the targeted
 * alternative to a full seed (which deletes them).
 *
 *   node src/scripts/syncChallengeContent.mjs FILE_01 FILE_02 …   (from server/)
 */
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { CaseFile, CHALLENGE_HIDDEN_SELECT } from '../models/index.js';
import { FILES } from '../content/blackCipher/case.js';
import { assertValidSpec } from '../engine/index.js';

const codes = process.argv.slice(2).map((c) => c.toUpperCase());
if (!codes.length) {
  console.error('usage: node src/scripts/syncChallengeContent.mjs <FILE_CODE> …');
  process.exit(1);
}

const COPY = ['brief', 'starterSql', 'validation', 'referenceSql', 'failureMessage', 'successMessage', 'skills', 'question'];

await connectDatabase();
for (const code of codes) {
  const def = FILES.find((f) => f.code === code);
  if (!def) { console.error(`no content definition for ${code}`); continue; }
  const doc = await CaseFile.findOne({ code }).select(CHALLENGE_HIDDEN_SELECT);
  if (!doc) { console.error(`no CaseFile document for ${code}`); continue; }
  doc.tables = [...def.tables];
  doc.difficulty = def.difficulty || '';
  for (const ch of def.challenges) {
    if (ch.kind !== 'FINAL_DEDUCTION') assertValidSpec(ch.validation, `${ch.code}.validation`);
    const target = doc.challenges.find((c) => c.code === ch.code);
    if (!target) { console.error(`${code}: challenge ${ch.code} is missing in the database`); continue; }
    for (const k of COPY) if (ch[k] !== undefined) target[k] = ch[k];
    target.markModified('validation');
    for (const h of ch.hints || []) {
      const th = target.hints.find((x) => x.code === h.code);
      if (th) th.text = h.text;
      else target.hints.push({ code: h.code, text: h.text, penalty: h.penalty ?? null });
    }
  }
  await doc.save();
  console.log(`${code}: tables=${doc.tables.join(',')} challenges=${def.challenges.map((c) => c.code).join(',')}`);
}

/* read back what the engine will now see */
const skills = (spec) => {
  const out = [];
  const walk = (s) => {
    if (!s || typeof s !== 'object') return;
    if (s.strategy === 'SQL_USES') out.push(...(s.config?.requires || []));
    (s.config?.validators || []).forEach(walk);
    walk(s.config?.requiresPriorResult);
  };
  walk(spec);
  return out;
};
const back = await CaseFile.find({ code: { $in: codes } }).sort({ sequence: 1 }).select(CHALLENGE_HIDDEN_SELECT).lean();
for (const f of back) {
  for (const c of f.challenges) console.log(`  ${c.code}: strategy=${c.validation?.strategy} skills=[${skills(c.validation).join(',')}] tables=[${f.tables.join(',')}] hint="${(c.hints?.[0]?.text || '').slice(0, 60)}…"`);
}
await disconnectDatabase();
