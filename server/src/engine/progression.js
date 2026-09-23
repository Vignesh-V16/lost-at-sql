/**
 * Progression engine (spec §9).
 *
 * Derives the LOCKED / AVAILABLE / ACTIVE / COMPLETED status of every file
 * and challenge from two inputs:
 *
 *   caseConfig   ordered files, each with ordered challenges (static content)
 *   session      { files: [{ code, openedAt, challenges: [{ code, completedAt }] }] }
 *
 * The derivation is the single source of truth — the persisted statuses are
 * a cache for monitoring. A file is COMPLETED when every challenge in it is
 * completed; the next file becomes AVAILABLE; the FINAL file becomes
 * AVAILABLE when all non-final files are COMPLETED. Completed files stay
 * readable (prototype: earlier tabs remain clickable).
 */
export const FILE_STATUS = Object.freeze({
  LOCKED: 'locked',
  AVAILABLE: 'available',
  ACTIVE: 'active',
  COMPLETED: 'completed',
});

export const CHALLENGE_STATUS = Object.freeze({
  LOCKED: 'locked',
  ACTIVE: 'active',
  COMPLETED: 'completed',
});

function byCode(list = []) {
  const m = new Map();
  for (const item of list) if (item && item.code) m.set(item.code, item);
  return m;
}

/**
 * @param {{ files: Array<{code:string, isFinal?:boolean, challenges: Array<{code:string}>}> }} caseConfig
 * @param {{ files?: Array<{code:string, openedAt?:any, challenges?: Array<{code:string, completedAt?:any}>}> }} session
 */
export function deriveProgression(caseConfig, session = {}) {
  const sessionFiles = byCode(session.files || []);
  const ordered = [...(caseConfig.files || [])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const regular = ordered.filter((f) => !f.isFinal);
  const finals = ordered.filter((f) => f.isFinal);

  const out = [];
  let previousCompleted = true;
  let allRegularComplete = true;

  const deriveFile = (file, unlocked) => {
    const sf = sessionFiles.get(file.code) || {};
    const sChallenges = byCode(sf.challenges || []);
    let prevChallengeDone = true;
    const challenges = (file.challenges || []).map((ch) => {
      const sc = sChallenges.get(ch.code) || {};
      const completed = Boolean(sc.completedAt);
      let status;
      if (completed) status = CHALLENGE_STATUS.COMPLETED;
      else if (unlocked && prevChallengeDone) status = CHALLENGE_STATUS.ACTIVE;
      else status = CHALLENGE_STATUS.LOCKED;
      prevChallengeDone = prevChallengeDone && completed;
      return { code: ch.code, status, attempts: Number(sc.attempts) || 0, completedAt: sc.completedAt || null };
    });
    const completed = challenges.length > 0 && challenges.every((c) => c.status === CHALLENGE_STATUS.COMPLETED);
    let status;
    if (completed) status = FILE_STATUS.COMPLETED;
    else if (!unlocked) status = FILE_STATUS.LOCKED;
    else if (sf.openedAt || challenges.some((c) => c.status === CHALLENGE_STATUS.COMPLETED)) status = FILE_STATUS.ACTIVE;
    else status = FILE_STATUS.AVAILABLE;
    const currentChallenge = challenges.find((c) => c.status === CHALLENGE_STATUS.ACTIVE) || null;
    return { code: file.code, isFinal: Boolean(file.isFinal), status, challenges, currentChallengeCode: currentChallenge ? currentChallenge.code : null, completed };
  };

  for (const file of regular) {
    const derived = deriveFile(file, previousCompleted);
    out.push(derived);
    previousCompleted = derived.completed;
    allRegularComplete = allRegularComplete && derived.completed;
  }
  for (const file of finals) {
    out.push(deriveFile(file, allRegularComplete));
  }

  const current = out.find((f) => f.status !== FILE_STATUS.COMPLETED && f.status !== FILE_STATUS.LOCKED) || null;
  const completedCount = out.filter((f) => f.completed).length;
  return {
    files: out,
    currentFileCode: current ? current.code : null,
    currentChallengeCode: current ? current.currentChallengeCode : null,
    completedCount,
    totalCount: out.length,
    finalUnlocked: allRegularComplete && finals.length > 0,
    allComplete: out.length > 0 && out.every((f) => f.completed),
  };
}

export function fileStatusOf(progression, code) {
  return progression.files.find((f) => f.code === code) || null;
}

export function challengeStatusOf(progression, fileCode, challengeCode) {
  const f = fileStatusOf(progression, fileCode);
  return f ? f.challenges.find((c) => c.code === challengeCode) || null : null;
}
