/*
 * Set (or clear) a case file's difficulty label on the seeded CaseFile
 * document. Touches nothing else: sessions, participants and scores stay.
 *
 *   node src/scripts/setFileDifficulty.mjs FILE_02 medium   (from server/)
 *   node src/scripts/setFileDifficulty.mjs FILE_02 ""       (clear it)
 */
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { CaseFile, DIFFICULTIES } from '../models/index.js';

const [code, difficulty = ''] = process.argv.slice(2);
if (!code || !DIFFICULTIES.includes(difficulty)) {
  console.error(`usage: node src/scripts/setFileDifficulty.mjs <FILE_CODE> <${DIFFICULTIES.filter(Boolean).join('|')}|"">`);
  process.exit(1);
}

await connectDatabase();
const res = await CaseFile.updateOne({ code: code.toUpperCase() }, { $set: { difficulty } });
const files = await CaseFile.find().sort({ sequence: 1 }).select('code difficulty').lean();
console.log(JSON.stringify({ matched: res.matchedCount, modified: res.modifiedCount, files: files.map((f) => `${f.code}=${f.difficulty || ''}`) }));
await disconnectDatabase();
