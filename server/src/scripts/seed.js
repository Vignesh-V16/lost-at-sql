/**
 * Seed script.
 *
 *   npm run seed            → full seed: replaces game content, wipes sessions/leaderboard/audit, recreates demo accounts
 *   npm run seed -- --keep  → only creates what is missing (same as server start-up)
 *
 * `ensureBaseline()` runs on every server start so a fresh database is
 * always playable: event, coordinator, case files, evidence, dataset.
 */
import { pathToFileURL } from 'node:url';
import { env } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import {
  User, Participant, Coordinator, Team, Event, CaseFile, EvidenceDefinition, DatabaseTable, InvestigationSession, QueryAttempt, Leaderboard, IdempotencyKey, RefreshToken,
} from '../models/index.js';
import { getCase, getDataset, DEFAULT_CASE_SLUG } from '../content/index.js';
import { resetService } from '../services/resetService.js';
import { logger } from '../utils/logger.js';

/** Demo accounts — access codes are printed once by the seed CLI and stored hashed. */
export const demoTeams = [
  { name: 'BLACK OPS', code: 'BLK', color: '#e5233a' },
  { name: 'NIGHT WATCH', code: 'NWT', color: '#19c8f0' },
  { name: 'CIPHER SIX', code: 'CS6', color: '#7c4dff' },
  { name: 'GHOST PROTOCOL', code: 'GST', color: '#f4b942' },
];

export const demoParticipants = [
  { username: 'vignesh', displayName: 'VIGNESH', team: 'BLACK OPS', accessCode: 'cipher-7741' },
  { username: 'ananya', displayName: 'ANANYA', team: 'BLACK OPS', accessCode: 'cipher-0932' },
  { username: 'rohan', displayName: 'ROHAN', team: 'NIGHT WATCH', accessCode: 'cipher-1156' },
  { username: 'meera', displayName: 'MEERA', team: 'NIGHT WATCH', accessCode: 'cipher-1401' },
  { username: 'arjun', displayName: 'ARJUN', team: 'CIPHER SIX', accessCode: 'cipher-0958' },
  { username: 'divya', displayName: 'DIVYA', team: 'CIPHER SIX', accessCode: 'cipher-0947' },
  { username: 'karthik', displayName: 'KARTHIK', team: 'GHOST PROTOCOL', accessCode: 'cipher-2045' },
  { username: 'sneha', displayName: 'SNEHA', team: 'GHOST PROTOCOL', accessCode: 'cipher-0939' },
];

function eventFromCase(caseDef) {
  return {
    slug: caseDef.slug,
    name: caseDef.name,
    caseNumber: caseDef.caseNumber,
    description: caseDef.description,
    durationMinutes: caseDef.durationMinutes,
    dataset: caseDef.dataset,
    scoringPolicy: caseDef.scoringPolicy,
    leaderboardPolicy: caseDef.leaderboardPolicy,
    queryScope: caseDef.queryScope,
    finalAttemptPolicy: caseDef.finalAttemptPolicy,
    entities: caseDef.entities,
    briefing: caseDef.briefing,
    landing: caseDef.landing,
    reveal: caseDef.reveal,
  };
}

export async function seedEvent({ force = false, slug = DEFAULT_CASE_SLUG } = {}) {
  const caseDef = getCase(slug);
  const existing = await Event.findOne({ singleton: 'EVENT' });
  if (existing && !force) return existing;
  if (existing) await existing.deleteOne();
  return Event.create({ ...eventFromCase(caseDef), status: 'draft' });
}

export async function seedCoordinator() {
  const username = env.SEED_COORDINATOR_ID.toLowerCase();
  const existing = await User.findOne({ username });
  if (existing) return { created: false, username };
  await Coordinator.create({ username, displayName: 'EVENT COORDINATOR', passwordHash: await User.hashPassword(env.SEED_COORDINATOR_CODE), title: 'Event Coordinator' });
  return { created: true, username, accessCode: env.SEED_COORDINATOR_CODE };
}

export async function seedCaseFiles({ force = false, slug = DEFAULT_CASE_SLUG } = {}) {
  const count = await CaseFile.countDocuments();
  if (count && !force) return count;
  const caseDef = getCase(slug);
  await CaseFile.deleteMany({});
  await CaseFile.insertMany(caseDef.files.map((f) => ({ ...f, challenges: f.challenges.map((c) => ({ ...c, hints: (c.hints || []).map((h) => ({ ...h })) })) })));
  return caseDef.files.length;
}

export async function seedEvidence({ force = false, slug = DEFAULT_CASE_SLUG } = {}) {
  const count = await EvidenceDefinition.countDocuments();
  if (count && !force) return count;
  const caseDef = getCase(slug);
  await EvidenceDefinition.deleteMany({});
  await EvidenceDefinition.insertMany(caseDef.evidenceCatalogue.map((e, i) => ({ ...e, order: i + 1 })));
  return caseDef.evidenceCatalogue.length;
}

export async function seedDataset({ force = false, slug } = {}) {
  const count = await DatabaseTable.countDocuments();
  if (count && !force) return count;
  const event = await Event.findOne({ singleton: 'EVENT' });
  const dataset = getDataset(slug || event?.dataset || 'black-cipher');
  await DatabaseTable.deleteMany({});
  await DatabaseTable.insertMany(dataset.tables.map((t) => ({ ...t, dataset: dataset.slug, rowCount: t.rows.length, isCustom: false })));
  return dataset.tables.length;
}

export async function seedDemoParticipants({ force = false } = {}) {
  const count = await User.countDocuments({ role: 'participant' });
  if (count && !force) return [];
  if (force) {
    await Promise.all([
      User.deleteMany({ role: 'participant' }),
      Team.deleteMany({}),
      InvestigationSession.deleteMany({}),
      QueryAttempt.deleteMany({}),
      Leaderboard.deleteMany({}),
      IdempotencyKey.deleteMany({}),
      RefreshToken.deleteMany({}),
    ]);
  }
  const teams = [];
  for (const t of demoTeams) {
    // eslint-disable-next-line no-await-in-loop
    teams.push(await Team.findOneAndUpdate({ name: t.name }, { $setOnInsert: t }, { upsert: true, new: true }));
  }
  const teamByName = new Map(teams.map((t) => [t.name, t]));
  const created = [];
  for (const p of demoParticipants) {
    // eslint-disable-next-line no-await-in-loop
    const hash = await User.hashPassword(p.accessCode);
    // eslint-disable-next-line no-await-in-loop
    await Participant.create({ username: p.username, displayName: p.displayName, passwordHash: hash, team: teamByName.get(p.team)?._id });
    created.push({ ...p });
  }
  return created;
}

/** Called on server boot. Creates only what is missing. */
export async function ensureBaseline() {
  await seedEvent();
  const coordinator = await seedCoordinator();
  const files = await seedCaseFiles();
  const ev = await seedEvidence();
  await seedDataset();
  if (coordinator.created) logger.warn(`Coordinator account created → ID: ${coordinator.username}  ACCESS CODE: ${coordinator.accessCode}`);
  logger.info(`Baseline ready — ${files} case files, ${ev} evidence definitions`);
}

async function runCli() {
  const keep = process.argv.includes('--keep');
  const force = !keep;
  await connectDatabase();
  logger.info(force ? 'Full seed (existing game content will be replaced)' : 'Seeding missing content only');

  await seedEvent({ force });
  const coordinator = await seedCoordinator();
  if (force) await resetService.clearAuditLog();
  const files = await seedCaseFiles({ force });
  const ev = await seedEvidence({ force });
  const tables = await seedDataset({ force });
  const participants = await seedDemoParticipants({ force });

  const lines = [
    '',
    '════════════════════════════════════════════════════════════',
    '  LOST AT SQL — seed complete',
    '════════════════════════════════════════════════════════════',
    `  case files: ${files}   evidence: ${ev}   tables: ${tables}`,
    '',
    '  COORDINATOR',
    `    ID:          ${coordinator.username}`,
    `    ACCESS CODE: ${coordinator.created ? coordinator.accessCode : '(unchanged — see SEED_COORDINATOR_CODE in .env)'}`,
    '',
  ];
  if (participants.length) {
    lines.push('  DEMO PARTICIPANTS');
    for (const p of participants) lines.push(`    ${p.username.padEnd(10)} ${p.accessCode.padEnd(16)} ${p.team}`);
  } else {
    lines.push('  Participants already exist — left untouched (run without --keep to recreate demo accounts).');
  }
  lines.push('', '  Log in as the coordinator and press START in the command center.', '');
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
  await disconnectDatabase();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((err) => {
    logger.error('Seed failed', err);
    process.exit(1);
  });
}
