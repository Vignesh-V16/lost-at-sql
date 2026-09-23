/*
 * One-off: the final accusation's time field used to hint "e.g. 09:52", which
 * is the answer. Set the placeholder to the neutral format hint the content
 * file now carries. Touches only the FINAL CaseFile document.
 *
 *   node src/scripts/setTimePlaceholder.mjs   (from server/)
 */
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { CaseFile } from '../models/index.js';

await connectDatabase();
const res = await CaseFile.updateOne(
  { code: 'FINAL' },
  { $set: { 'challenges.$[c].fields.$[f].placeholder': 'eg: hh:mm' } },
  { arrayFilters: [{ 'c.code': 'FINAL' }, { 'f.key': 'time' }] },
);
const doc = await CaseFile.findOne({ code: 'FINAL' }).lean();
const ch = doc?.challenges?.find((c) => c.code === 'FINAL');
console.log(JSON.stringify({ matched: res.matchedCount, modified: res.modifiedCount, fields: ch?.fields?.map((f) => `${f.key}=${f.placeholder ?? ''}`) }));
await disconnectDatabase();
