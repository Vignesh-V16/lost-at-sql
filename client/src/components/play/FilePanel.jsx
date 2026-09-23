import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Play, Lightbulb, ArrowRight, CircleCheck, TriangleAlert, Table2, Gauge } from 'lucide-react';
import { SqlEditor } from '../investigation/SqlEditor.jsx';
import { RichText } from '../investigation/RichText.jsx';
import { DataGrid } from '../ui/DataGrid.jsx';
import { Button } from '../ui/Button.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Burst } from '../ui/Misc.jsx';
import { SystemLoader, ErrorState } from '../ui/States.jsx';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useEvent } from '../../contexts/EventContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { investigationApi } from '../../services/api.js';
import { errorTitle, errorMessage } from '../../utils/errors.js';
import { formatMs } from '../../utils/format.js';
import { cn } from '../../utils/cn.js';

const draftKey = (sessionId, code) => `lostatsql.editor.${sessionId}.${code}`;
const loadDraft = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const saveDraft = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* per-viewer convenience only */
  }
};

function Feedback({ tone, children, className, shout }) {
  const ok = tone === 'ok';
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, scale: 0.94, x: 0 }}
      animate={ok || reduce ? { opacity: 1, scale: 1 } : { opacity: 1, scale: 1, x: [0, -8, 8, -5, 5, 0] }}
      transition={reduce ? { duration: 0 } : ok ? { type: 'spring', stiffness: 380, damping: 22 } : { duration: 0.45 }}
      className={cn('relative mt-5 border-3 border-ink px-4 py-3 text-base font-bold leading-relaxed shadow-comic', ok ? 'bg-green-light text-ink' : 'bg-red-light text-ink', className)}
      role="status"
    >
      {shout ? (
        <span className="pointer-events-none absolute -right-3 -top-7 sm:-right-5">
          <Burst size="sm" tone={ok ? 'yellow' : 'red'} tilt={ok ? 8 : -8}>
            {shout}
          </Burst>
        </span>
      ) : null}
      {children}
    </motion.div>
  );
}

/** Schema chips: tap a table for its size, key and column names — never its rows. */
function SchemaChips({ code, tables }) {
  const [open, setOpen] = useState(null);
  const reduce = useReducedMotion();
  const { data, refetch } = useAsync(() => investigationApi.caseSchema(code), [code], { immediate: false });
  const toggle = async (name) => {
    if (open === name) return setOpen(null);
    setOpen(name);
    if (!data) await refetch().catch(() => {});
    return undefined;
  };
  const table = data?.find((t) => t.name === open);
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {tables.map((t) => (
          <button key={t} type="button" onClick={() => toggle(t)} className={cn('inline-flex items-center gap-1.5 border-2 border-ink px-2.5 py-1 font-mono text-xs font-semibold transition-all', open === t ? 'bg-blue text-white shadow-comic-sm' : 'bg-white text-blue hover:bg-blue-light')}>
            <Table2 className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> {t}
          </button>
        ))}
      </div>
      <AnimatePresence>
        {open && table ? (
          <motion.div initial={reduce ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-3">
              <p className="mb-1.5 text-sm font-bold text-ink-soft">
                {table.name} · {table.rowCount} rows · key: {table.primaryKey.join(', ') || '—'}
              </p>
              {/* the header band only: the brief names the columns, the terminal
                  is where the rows are read */}
              <div className="overflow-auto border-3 border-ink bg-white">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="w-10 text-right text-ink-soft">#</th>
                      {table.sample.columns.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                </table>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/*
 * FilePanel — one investigation file: the Chief's brief, the tables it
 * uses, the SQL editor, the result grid and the finding / yes-no
 * submission. All game rules are enforced by the server; this only
 * shows verdicts.
 */

/* What a file remembers while you are elsewhere — on the evidence tab, in
   the story, or in another file: the last result, its verdict, the hint and
   the yes/no gate. Keyed per session and part; lives for the page's life
   (the SQL itself is a localStorage draft already). Switching tabs unmounts
   the panel, and a fresh mount would otherwise start from nothing. */
const panelMemory = new Map();

/* chip tone per difficulty: green easy, yellow medium, red hard */
const DIFFICULTY_TONE = { easy: 'green', medium: 'amber', hard: 'crimson' };



export function FilePanel({ code }) {
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const { session, refresh, applyServerState } = useSession();
  const { status: eventStatus } = useEvent();
  const { notify, impact } = useToast();
  const { data: file, error, loading, refetch, setData } = useAsync(() => investigationApi.caseFile(code), [code]);
  useDocumentTitle(file ? `${file.label} — ${file.title}` : 'Case file');

  const challenge = useMemo(() => {
    if (!file) return null;
    /* a part closed but not yet confirmed stays on screen across a section
       round-trip: the remount refetches, and the server already points at
       the next part */
    const pending = session ? panelMemory.get(`${session.id}:${file.code}:pending`) : null;
    const held = pending ? file.challenges.find((c) => c.code === pending && c.status === 'completed' && c.code !== file.currentChallengeCode) : null;
    return held || file.challenges.find((c) => c.code === file.currentChallengeCode) || file.challenges[file.challenges.length - 1] || null;
  }, [file, session]);

  const [sql, setSql] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null); // { queryAttemptId, columns, rows, rowCount, truncated, durationMs }
  const [sqlError, setSqlError] = useState(null);
  const [hint, setHint] = useState(null); // { text, penaltyApplied }
  const [hintBusy, setHintBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null); // { tone, message, successLabel?, next? }
  const [gate, setGate] = useState(null); // RESULT_SET_THEN_BOOLEAN: { open, message }
  const editorRef = useRef(null);
  const canAct = session?.status === 'active' && eventStatus === 'live';
  const memoryKey = session && challenge ? `${session.id}:${challenge.code}` : null;
  const autoHint = useRef(null); // the used hint id this mount already asked the server for

  // Load the editor draft and whatever this part remembers whenever the
  // challenge changes. The content's starter SQL is never seeded: it is the
  // answer, and the terminal starts empty.
  useEffect(() => {
    if (!challenge || !session) return;
    const draft = loadDraft(draftKey(session.id, challenge.code));
    setSql(draft ?? '');
    const remembered = panelMemory.get(`${session.id}:${challenge.code}`) || {};
    setResult(remembered.result ?? null);
    setSqlError(remembered.sqlError ?? null);
    setHint(remembered.hint ?? null);
    if (remembered.hint) autoHint.current = remembered.hint.hintId ?? null; // no second fetch for a box we already hold
    setFeedback(remembered.feedback ?? null);
    setGate(remembered.gate ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge?.code, session?.id]);

  // …and remember it as it changes (declared after the restore, so the first
  // commit reads the memory before this writes the mount's blank state).
  useEffect(() => {
    if (memoryKey) panelMemory.set(memoryKey, { result, sqlError, hint, feedback, gate });
  }, [memoryKey, result, sqlError, hint, feedback, gate]);

  const onChange = useCallback(
    (v) => {
      setSql(v);
      if (session && challenge) saveDraft(draftKey(session.id, challenge.code), v);
    },
    [session, challenge],
  );

  const run = useCallback(async () => {
    /* the same gate as the Run button: Ctrl/Cmd+Enter must not query while
       the event is paused or over, and a refused or failed request must
       leave the last printout and verdict readable */
    if (!canAct || !sql.trim() || running || !file) return;
    setRunning(true);
    try {
      const res = await investigationApi.query(file.code, sql);
      setResult(res);
      setSqlError(null);
      setFeedback(null);
      setGate(null);
      applyServerState(res);
      if (res.newEvidence?.length) impact({ tone: 'cyan', title: 'NEW EVIDENCE DISCOVERED', body: res.newEvidence.map((e) => e.title).join(' · ') });
      // Yes/No files: ask the server (free) whether the result opens the question.
      if (challenge?.kind === 'RESULT_SET_THEN_BOOLEAN' && challenge.status === 'active') {
        try {
          const probe = await investigationApi.submit(file.code, { queryAttemptId: res.queryAttemptId, challengeCode: challenge.code });
          if (probe.alreadyCompleted) {
            await refetch();
          } else {
            setGate({ open: Boolean(probe.gateOpen), message: probe.gateOpen ? null : probe.message });
          }
        } catch (err) {
          setGate({ open: false, message: errorMessage(err) });
        }
      }
    } catch (err) {
      if (err.code?.startsWith('SQL_')) {
        setResult(null);
        setSqlError(err.message);
        setFeedback(null);
        setGate(null);
      } else {
        notify({ tone: 'crimson', title: errorTitle(err), body: errorMessage(err) });
      }
    } finally {
      setRunning(false);
    }
  }, [canAct, sql, running, file, challenge, applyServerState, impact, notify, refetch]);


  const revealHint = async (h, { quiet = false } = {}) => {
    if (hintBusy || !file) return;
    setHintBusy(true);
    try {
      const res = await investigationApi.useHint(file.code, h.id);
      setHint(res);
      applyServerState(res);
      if (res.penaltyApplied) notify({ tone: 'neutral', title: 'HINT REVEALED', body: `−${res.penaltyApplied} points` });
      setData((f) => ({ ...f, challenges: f.challenges.map((c) => (c.code === res.challenge ? { ...c, hints: c.hints.map((x) => (x.id === res.hintId ? { ...x, used: true } : x)) } : c)) }));
    } catch (err) {
      if (quiet) autoHint.current = null; // let the next mount ask again
      else notify({ tone: 'crimson', title: errorTitle(err), body: errorMessage(err) });
    } finally {
      setHintBusy(false);
    }
  };

  /* A hint that was already revealed comes back on its own after a refresh:
     the server returns its text free once it has been charged, so the box
     reappears and the button stays blocked. The ref keeps StrictMode's
     double effect (and re-renders) from asking twice for the same hint. */
  const usedHintId = challenge?.hints?.find((h) => h.used)?.id;
  useEffect(() => {
    if (!usedHintId || !file || hint || autoHint.current === usedHintId) return;
    autoHint.current = usedHintId;
    revealHint({ id: usedHintId }, { quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usedHintId, file?.code]);

  const submit = async (answer) => {
    if (submitting || !file || !challenge) return;
    if (!result?.queryAttemptId) {
      notify({ tone: 'crimson', title: 'RUN A QUERY FIRST', body: 'Submit the result of a query as your finding.' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await investigationApi.submit(file.code, { queryAttemptId: result.queryAttemptId, challengeCode: challenge.code, ...(answer !== undefined ? { answer } : {}) });
      applyServerState(res);
      if (res.correct) {
        setFeedback({ tone: 'ok', message: res.message, successLabel: res.successLabel, fileCompleted: res.fileCompleted, nextFileCode: res.nextFileCode, finalUnlocked: res.finalUnlocked, alreadyCompleted: res.alreadyCompleted });
        if (res.evidenceAwarded?.length) impact({ tone: 'cyan', title: 'EVIDENCE RECORDED', body: res.evidenceAwarded.map((e) => e.title).join(' · ') });
        if (res.fileCompleted) setTimeout(() => impact({ tone: 'violet', title: 'FILE CLOSED', body: `${file.label} — ${file.title}` }), 500);
        if (res.fileCompleted) {
          await Promise.all([refetch(), refresh()]);
        } else {
          /* A closed PART must stay on screen with its verdict: refetching now
             would hand back the file with the next part already active, the
             challenge would change, and the reset effect above would wipe the
             result, the editor and this feedback before anyone read it. Mark
             the part closed locally; the successLabel button's refetch() is
             what moves the file on. */
          setData((f) => (f ? { ...f, challenges: f.challenges.map((c) => (c.code === challenge.code ? { ...c, status: 'completed', attempts: typeof res.attempts === 'number' ? res.attempts : (c.attempts || 0) + 1 } : c)) } : f));
          if (session) panelMemory.set(`${session.id}:${file.code}:pending`, challenge.code);
          refresh();
        }
      } else {
        setFeedback({ tone: 'bad', message: res.message, penalty: res.penalty, needsAnswer: res.needsAnswer });
        // the server counts the attempt; the badge follows it without a refetch
        if (typeof res.attempts === 'number') setData((f) => (f ? { ...f, challenges: f.challenges.map((c) => (c.code === challenge.code ? { ...c, attempts: res.attempts } : c)) } : f));
        if (res.penalty) notify({ tone: 'crimson', title: 'INCORRECT', body: `−${res.penalty} points` });
        if (challenge.kind === 'RESULT_SET_THEN_BOOLEAN') setGate({ open: Boolean(res.gateOpen), message: res.gateOpen ? null : res.message });
        refresh();
      }
    } catch (err) {
      notify({ tone: 'crimson', title: errorTitle(err), body: errorMessage(err) });
      if (err.status === 423 || err.status === 409) refresh();
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) return null;
  /* on a sheet, always: the loader's caption and the error's red-deep title
     and ink-soft copy would otherwise sit straight on the red field */
  if (loading && !file) return <div className="mt-3 border-5 border-ink bg-white shadow-comic-xl"><SystemLoader label="Opening the case file" /></div>;
  if (error && !file) return <div className="mt-3 border-5 border-ink bg-white shadow-comic-xl"><ErrorState error={error} onRetry={refetch} /></div>;
  if (!file || !challenge) return <div className="mt-3 border-5 border-ink bg-white shadow-comic-xl"><ErrorState error={{ code: 'CASE_FILE_NOT_FOUND', message: 'This case file is not available.' }} /></div>;

  const solved = challenge.status === 'completed';
  const fileDone = file.status === 'completed';


  const nextFile = session.files.find((f) => f.status === 'available' && f.code !== file.code) || session.files.find((f) => f.code === session.currentFileCode);
  const continueTo = fileDone ? (nextFile ? (nextFile.isFinal ? '/play/final' : `/play/${nextFile.code}`) : '/play/final') : null;
  const continueLabel = fileDone ? (nextFile && !nextFile.isFinal ? `Continue to ${nextFile.label}` : 'Proceed to Final Deduction →') : null;

  const stuck = !canAct ? (session.status === 'completed' ? 'Case closed' : session.status === 'time_expired' ? 'Time is up' : eventStatus === 'paused' ? 'Paused' : 'Investigation not live') : null;

  // The sheet's footer tier holds the submit region and the verdict, and
  // renders only when one of them has something to say — otherwise every
  // freshly opened file would end in a bare cream strip.
  const submitRegion =
    !solved && result && !sqlError ? (
      challenge.kind === 'RESULT_SET_THEN_BOOLEAN' ? (
        gate?.open ? (
          <>
            {/* explicit white ground: the thought bubble's tail circles are
                hard-coded white and would show as dots on the paper tier */}
            <div className="bubble bubble-thought max-w-2xl bg-white">
              <RichText text={challenge.question} className="text-lg font-bold text-ink" />
            </div>
            <div className="mt-7 flex gap-3">
              {challenge.answerOptions.map((o) => (
                <Button key={o.value} variant="outline" size="lg" onClick={() => submit(o.value)} loading={submitting} disabled={!canAct}>
                  {o.label}
                </Button>
              ))}
            </div>
          </>
        ) : gate ? (
          <Feedback tone="bad">
            <RichText text={gate.message || ''} as="span" boldClassName="font-semibold" />
          </Feedback>
        ) : null
      ) : (
        <Button variant="blue" size="lg" onClick={() => submit()} loading={submitting} disabled={!canAct}>
          {challenge.submitLabel || 'Submit findings'}
        </Button>
      )
    ) : null;
  const hasFooter = Boolean(submitRegion) || Boolean(feedback) || solved || fileDone;

  const header = (
    <>
      <span className="caption absolute -top-4 left-5 text-base">
        {file.label}
        {challenge.stageLabel ? ` — ${challenge.stageLabel}` : ''}
      </span>
      <div className="flex flex-wrap items-start justify-between gap-3 pt-2">
        <h1 id="file-title" className="font-display text-3xl uppercase leading-none tracking-comic text-ink sm:text-4xl">
          {file.title}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          {/* the file's difficulty, when the content sets one: a lettered chip
              in the app's traffic-light tones. A label only. */}
          {file.difficulty ? (
            <Badge tone={DIFFICULTY_TONE[file.difficulty] || 'neutral'} className="px-3 py-1 text-base">
              <Gauge className="h-4 w-4" aria-hidden />
              Difficulty: {file.difficulty}
            </Badge>
          ) : null}
          {challenge.attempts ? <Badge tone="dim">{challenge.attempts} attempt{challenge.attempts === 1 ? '' : 's'}</Badge> : null}
          {/* the file's status as a rubber stamp pressed across the header's
              rule — the sign-in page's CLEARED construction, at three times
              the old badge: red-deep while the file is open, green-deep once
              a part or the whole file is closed. -mb-3 lets it hang over the
              seam instead of growing the tier. */}
          <span className={cn('stamp stamp-light -mb-3 whitespace-nowrap px-5 py-2 text-4xl', fileDone || solved ? 'border-green-deep text-green-deep' : 'border-red-deep text-red-deep')}>
            {fileDone ? 'File closed' : solved ? 'Part closed' : 'Open'}
          </span>
        </div>
      </div>
    </>
  );


  const hints = (
    <div className="flex flex-wrap items-center gap-2">
      {challenge.hints.map((h) => (
        <Button key={h.id} variant="outline" size="md" icon={Lightbulb} onClick={() => revealHint(h)} loading={hintBusy && !h.used} disabled={!canAct || h.used || solved}>
          {h.used ? 'Hint revealed' : `Reveal hint (−${h.penalty ?? 50} pts)`}
        </Button>
      ))}
    </div>
  );

  const hintText = hint ? (
    <motion.div initial={reduce ? false : { opacity: 0, y: 8, rotate: -1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} className="relative mt-4 border-3 border-ink bg-red-light px-4 py-3 text-base font-bold leading-relaxed text-ink shadow-comic">
      <Lightbulb className="mr-2 inline h-[1em] w-[1em]" strokeWidth={2.6} aria-hidden />
      {hint.text}
    </motion.div>
  ) : null;

  const verdict = (
    <>
      <AnimatePresence>
        {feedback ? (
          <Feedback tone={feedback.tone} key={`${feedback.tone}-${feedback.message}`} shout={feedback.tone === 'ok' ? (fileDone ? 'Case file closed!' : 'Correct!') : 'Nope!'}>
            {feedback.tone === 'ok' ? (
              <span className="inline-flex items-start gap-2">
                <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-deep" strokeWidth={2.6} aria-hidden />
                <span>{fileDone ? `File closed. ${feedback.message || ''}` : feedback.message || 'Confirmed.'}</span>
              </span>
            ) : (
              <span className="inline-flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-deep" strokeWidth={2.6} aria-hidden />
                <RichText text={feedback.message} as="span" boldClassName="bg-white px-1 font-bold" />
              </span>
            )}
          </Feedback>
        ) : null}
      </AnimatePresence>
      {solved && !fileDone && feedback?.successLabel ? (
        <div className="mt-4">
          <Button
            icon={ArrowRight}
            onClick={() => {
              if (session) panelMemory.delete(`${session.id}:${file.code}:pending`);
              refetch();
            }}
          >
            {feedback.successLabel}
          </Button>
        </div>
      ) : null}
      {fileDone ? (
        <div className="mt-4 space-y-3">
          {!feedback ? (
            <Feedback tone="ok" className="mt-0" shout="Closed!">
              <span className="inline-flex items-start gap-2">
                <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-deep" strokeWidth={2.6} aria-hidden />
                <span>File closed. {challenge.successMessage || ''}</span>
              </span>
            </Feedback>
          ) : null}
          {session.status === 'active' ? (
            <Button icon={ArrowRight} size="lg" variant="danger" onClick={() => navigate(continueTo)}>
              {continueLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );

  /* ── the case file: read the brief, query, look, submit ──
     One sheet, built like the sign-in card: a printed header tier, the
     white tier you work in, a printed footer tier. The brief folds away
     once a result is in; the editor is the analyst's glass under a printed
     plate; the result is a printout, so it stays paper. */
  return (
    <section className="relative mt-3 border-5 border-ink bg-white shadow-comic-xl" aria-labelledby="file-title">
      <div className="paper-strip relative border-b-3 border-ink px-[clamp(1.05rem,2.6vmin,1.6rem)] pb-[clamp(0.55rem,1.3vmin,0.8rem)] pt-[clamp(1.1rem,2.6vmin,1.6rem)]">
        {header}
      </div>

      <div className="tier-flush px-[clamp(1.05rem,2.6vmin,1.6rem)] py-[clamp(0.7rem,1.7vmin,1.05rem)]">
        <details className="paper-strip group border-3 border-ink shadow-comic-sm" open={!result}>
          <summary className="label-strong flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-lg">
            <span>The Chief’s brief</span>
            <span className="text-sm text-ink-soft group-open:hidden">show</span>
            <span className="hidden text-sm text-ink-soft group-open:inline">hide</span>
          </summary>
          <div className="border-t-2 border-line bg-white px-4 py-3">
            <RichText text={challenge.brief} className="max-w-[68ch] text-base font-bold leading-relaxed text-ink" />
            <div className="mt-3">
              <SchemaChips code={file.code} tables={file.tables} />
            </div>
          </div>
        </details>

        {hintText}

        {/* the instrument: a printed plate welded to the glass */}
        <div className="mt-4">
          <div className="paper-strip flex items-center justify-between gap-3 border-3 border-b-0 border-ink px-3 py-1.5">
            <span className="label-strong">{challenge.editorLabel || 'SQL query editor'}</span>
          </div>
          {/* the glass grows with the query (min-h holds the space while Monaco
              loads), so nothing has to be scrolled inside it on a phone */}
          <div className="term min-h-48 border-t-0 shadow-comic-sm">
            <SqlEditor value={sql} onChange={onChange} onRun={run} editorRef={editorRef} autoHeight={{ min: 192 }} />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button icon={Play} onClick={run} loading={running} disabled={!canAct}>
            Run query
          </Button>
          {hints}
          {running ? <span className="text-sm font-bold text-ink-soft">Running…</span> : result ? <span className="text-sm font-bold text-ink-soft">Query ran in {formatMs(result.durationMs)}</span> : null}
          {stuck ? <span className={cn('text-base', stuck === 'Time is up' || stuck === 'Case closed' ? 'caption-deep' : 'caption-orange')}>{stuck}</span> : null}
        </div>

        {/* the printout */}
        <div className="mt-4">
          <div className="paper-strip flex items-center justify-between gap-3 border-3 border-b-0 border-ink px-3 py-1.5">
            <span className="label-strong">Result</span>
            {result ? (
              <span className="text-sm font-bold text-ink-soft">
                {result.rowCount} row{result.rowCount === 1 ? '' : 's'}{result.truncated ? ' · truncated' : ''}
              </span>
            ) : null}
          </div>
          {sqlError ? (
            <div className="border-3 border-t-0 border-ink bg-red-light px-4 py-3 font-mono text-sm text-ink" role="alert">
              <span className="font-display text-lg uppercase tracking-comic text-red-deep">SQL error: </span>
              {sqlError}
            </div>
          ) : result ? (
            <DataGrid columns={result.columns} rows={result.rows} maxHeight="max-h-72" className="scroll-green border-t-0 !bg-green-light" />
          ) : (
            <div className="border-3 border-t-0 border-ink bg-green-light px-4 py-5 text-center text-sm font-bold text-ink">Run a query to see rows here. The rows you submit are your finding.</div>
          )}
        </div>
      </div>

      {hasFooter ? (
        <div className="tier-flush paper-strip border-t-3 border-ink px-[clamp(1.05rem,2.6vmin,1.6rem)] py-[clamp(0.75rem,1.9vmin,1.2rem)]">
          {submitRegion}
          {verdict}
        </div>
      ) : null}
    </section>
  );
}
