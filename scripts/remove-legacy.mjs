/**
 * Removes files that belonged to the pre-engine version of the app and are
 * no longer referenced. Safe to run any number of times.
 *
 *   node scripts/remove-legacy.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY = [
  'server/src/data/dataset.js',
  'server/src/data/caseFiles.js',
  'server/src/data/evidence.js',
  'server/src/data/suspects.js',
  'server/src/data/event.js',
  'server/src/models/Question.js',
  'server/src/models/Submission.js',
  'server/src/models/Suspect.js',
  'server/src/models/InvestigationProgress.js',
  'server/src/services/progressService.js',
  'server/src/services/queryService.js',
  'server/src/services/submissionService.js',
  'server/src/middleware/eventGate.js',
  'server/src/utils/answers.js',
  'server/src/utils/scoring.js',
  'server/src/utils/timer.js',
  'server/tests/answers.test.js',
  'server/tests/scoring.test.js',
  'client/public/favicon.svg',
  'client/src/contexts/ProgressContext.jsx',
  'client/src/pages/investigation/SuspectDetail.jsx',
  'client/src/components/investigation/CaseMap.jsx',
  'client/src/components/investigation/EvidenceWall.jsx',
  'client/src/components/investigation/QuestionCard.jsx',
  /* folded into the Command Center dashboard */
  'client/src/pages/command/EventControl.jsx',
  'client/src/components/command/Charts.jsx',
  /* replaced by the comic-book cover (pages/Landing.jsx) */
  'client/src/components/landing/EvidenceReveal.jsx',
  'client/src/components/landing/FacilitySchematic.jsx',
  'client/src/components/landing/Footer.jsx',
  'client/src/components/landing/Hero.jsx',
  'client/src/components/landing/HowItWorks.jsx',
  'client/src/components/landing/IntroSequence.jsx',
  'client/src/components/landing/MissionSection.jsx',
  'client/src/components/landing/SiteNav.jsx',
  'client/src/components/landing/StoryScroll.jsx',
  /* participant side collapsed into one Play screen (pages/play/Investigate.jsx) */
  'client/src/layouts/InvestigationLayout.jsx',
  'client/src/pages/investigation/CaseBoard.jsx',
  'client/src/pages/investigation/CaseFiles.jsx',
  'client/src/pages/investigation/CaseFileDetail.jsx',
  'client/src/pages/investigation/DatabaseExplorer.jsx',
  'client/src/pages/investigation/EvidenceBoard.jsx',
  'client/src/pages/investigation/FinalFile.jsx',
  'client/src/pages/investigation/Leaderboard.jsx',
  'client/src/pages/investigation/SqlTerminal.jsx',
  'client/src/pages/investigation/Suspects.jsx',
  'client/src/components/investigation/SchemaGraph.jsx',
  'client/src/components/investigation/SchemaExplorer.jsx',
  'client/src/components/investigation/FileDossier.jsx',
  'client/src/components/investigation/StatTile.jsx',
  /* coordinator trimmed to Command · Participants · Settings */
  'client/src/pages/command/LiveMonitor.jsx',
  'client/src/pages/command/CaseEditor.jsx',
  'client/src/pages/command/DatabaseManager.jsx',
  'client/src/pages/command/AuditLog.jsx',
  'client/src/components/command/ParticipantDrawer.jsx',
  /* participant screen reorganised into tabs — the side rail became the Evidence record tab */
  'client/src/components/play/EvidenceRail.jsx',
  /* the film is now rendered from the illustrated panels; the SVG compositor is gone */
  'tools/film/film.jsx',
  'tools/film/film.html',
  'tools/film/motion-time.js',
  'tools/film/panels.html',
  'client/public/intro.vtt',
];

let removed = 0;
for (const rel of LEGACY) {
  const file = path.join(root, rel);
  if (fs.existsSync(file)) {
    fs.rmSync(file);
    removed += 1;
    console.log(`removed ${rel}`);
  }
}
for (const dir of ['server/src/data', 'client/src/components/landing', 'client/src/pages/investigation']) {
  const p = path.join(root, dir);
  if (fs.existsSync(p) && fs.readdirSync(p).length === 0) fs.rmdirSync(p);
}
console.log(removed ? `${removed} legacy file(s) removed.` : 'Nothing to remove — already clean.');
