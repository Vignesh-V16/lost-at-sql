/*
 * One-off: drop the "Where was Black Cipher hidden / taken?" field from the
 * seeded FINAL case file — the form field, its validation rule, its feedback
 * line and the reference answer — so the accusation has four questions, the
 * same four the content file now carries. Touches only the CaseFile
 * document; sessions, participants and scores are untouched.
 *
 *   node src/scripts/dropFinalLocation.mjs   (from server/)
 */
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { CaseFile } from '../models/index.js';

await connectDatabase();
const res = await CaseFile.updateOne(
  { code: 'FINAL' },
  {
    $pull: { 'challenges.$[c].fields': { key: 'location' } },
    $unset: {
      'challenges.$[c].validation.config.fields.location': 1,
      'challenges.$[c].validation.config.feedback.location': 1,
      'challenges.$[c].referenceAnswer.location': 1,
    },
  },
  { arrayFilters: [{ 'c.code': 'FINAL' }] },
);
const doc = await CaseFile.findOne({ code: 'FINAL' }).lean();
const ch = doc?.challenges?.find((c) => c.code === 'FINAL');
console.log(JSON.stringify({ matched: res.matchedCount, modified: res.modifiedCount, fields: ch?.fields?.map((f) => f.key), ruleKeys: Object.keys(ch?.validation?.config?.fields || {}), feedbackKeys: Object.keys(ch?.validation?.config?.feedback || {}), referenceKeys: Object.keys(ch?.referenceAnswer || {}) }));
await disconnectDatabase();
