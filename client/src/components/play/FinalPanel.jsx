import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Play, Lock, CircleCheck, TriangleAlert, RotateCcw } from 'lucide-react';
import { SqlEditor } from '../investigation/SqlEditor.jsx';
import { RichText } from '../investigation/RichText.jsx';
import { LeaderboardTable } from '../LeaderboardTable.jsx';
import { DataGrid } from '../ui/DataGrid.jsx';
import { Button } from '../ui/Button.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Input, Select } from '../ui/Field.jsx';
import { SystemLoader, ErrorState, EmptyState } from '../ui/States.jsx';
import { Burst } from '../ui/Misc.jsx';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useEvent } from '../../contexts/EventContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { investigationApi } from '../../services/api.js';
import { errorTitle, errorMessage } from '../../utils/errors.js';
import { formatClock } from '../../utils/format.js';
import { cn } from '../../utils/cn.js';

function Reveal({ reveal, score, elapsedMs }) {
  const { data: board, refetch } = useAsync(() => investigationApi.leaderboard(10), []);
  const reduce = useReducedMotion();
  useEffect(() => {
    const id = setInterval(() => refetch().catch(() => {}), 15000);
    return () => clearInterval(id);
  }, [refetch]);
  /* The reveal is the case closed, and on this route the field is already
     the cover's — so the sheet is the ceremony. The badge and the title
     come off the red and onto the sheet's own printed tier (ink on paper-2,
     15:1): nothing on the working screen sets type on the ground. The
     one-pass sweep still crosses on arrival, in its own clipped layer so
     the sheet's 10px shadow is never cut; the wrapper keeps play-band so
     that layer runs from window edge to window edge (its padding-inline
     puts the sheet back on main's column) rather than stopping at the
     gutter. The sweep's wrapper is a stacking context, so its overlay
     blend never depended on a red backdrop of its own. No stage, no disc,
     no -mb-6: the sheet sits on the field like every other tab's sheet,
     with main's own 24px of red above the footer's seam. */
  return (
    <div className="play-band relative mt-3">
      {reduce ? null : (
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
          <div className="absolute inset-y-0 left-0 w-[36%] -skew-x-12">
            <motion.div initial={{ x: '-60%', opacity: 0 }} animate={{ x: '160%', opacity: [0, 0.55, 0] }} transition={{ duration: 1.5, delay: 0.35, ease: [0.16, 1, 0.3, 1] }} className="h-full w-full bg-gradient-to-r from-transparent via-white to-transparent mix-blend-overlay" />
          </div>
        </div>
      )}
      <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 mx-auto max-w-3xl">
        <div className="border-5 border-ink bg-white text-left shadow-comic-xl">
          <div className="paper-strip flex flex-col items-center border-b-3 border-ink px-6 pb-5 pt-7 text-center">
            <motion.div initial={reduce ? false : { scale: 0.3, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: -4, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.15 }} className="inline-block">
              <Burst size="md" tone="yellow" tilt={0}>
                {reveal.badge}
              </Burst>
            </motion.div>
            <h1 className="mt-5 font-display text-5xl uppercase leading-none tracking-comic text-ink sm:text-7xl">{reveal.title}</h1>
          </div>
          <div className="space-y-4 px-6 py-5 text-[1.02rem] font-bold leading-relaxed text-ink">
            {reveal.paragraphs.map((p, i) => (
              <RichText key={i} text={p} boldClassName="bg-yellow px-1 font-bold" />
            ))}
          </div>
          <div className="divide-y-2 divide-line border-t-3 border-ink">
            {reveal.facts.map((f) => (
              <div key={f.label} className="flex justify-between gap-4 px-4 py-2.5">
                <span className="label">{f.label}</span>
                <span className="text-right font-display text-xl uppercase tracking-comic text-ink">{f.value}</span>
              </div>
            ))}
          </div>
          <div className="paper-strip flex flex-wrap items-end justify-between gap-4 border-t-3 border-ink px-5 py-4">
            <div>
              <p className="label-strong">Final score</p>
              <p className="score-numeral font-display text-[clamp(2.75rem,8vmin,4.5rem)]">{score}</p>
            </div>
            <div className="text-right">
              <p className="label-strong">Time taken</p>
              <p className="score-numeral font-display text-[clamp(1.6rem,4vmin,2.4rem)]">{formatClock(elapsedMs || 0)}</p>
            </div>
          </div>
        </div>

        <div className="relative mt-10 border-3 border-ink bg-white p-4 text-left shadow-comic-lg">
          <span className="caption absolute -top-4 left-4 text-base">Leaderboard</span>
          <div className="mt-3" />
          {board?.rows?.length ? <LeaderboardTable rows={board.rows} /> : <EmptyState title="No standings yet" compact />}
          <div className="mt-3 text-right">
            <span className="text-sm font-bold text-ink-soft">Standings refresh every 15 seconds.</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/*
 * FinalPanel — the final deduction: an optional reconstruction query and
 * the accusation form. On success the server's reveal replaces it.
 */
/* What the final file remembers while you are on another tab: the
   accusation form, the query, its result and the last verdict. Keyed per
   session; lives for the page's life. */
const finalMemory = new Map();

export function FinalPanel() {
  useDocumentTitle('Final file — Recover Black Cipher');
  const reduce = useReducedMotion();
  const { session, refresh, applyServerState } = useSession();
  const { status: eventStatus } = useEvent();
  const { notify, impact } = useToast();
  const { data, error, loading, refetch, setData } = useAsync(() => investigationApi.finalStatus(), []);
  const remembered = (session && finalMemory.get(session.id)) || {};
  const [answers, setAnswers] = useState(() => remembered.answers || {});
  const [sql, setSql] = useState(() => remembered.sql || '');
  const [result, setResult] = useState(() => remembered.result ?? null);
  const [sqlError, setSqlError] = useState(() => remembered.sqlError ?? null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(() => remembered.feedback ?? null);
  const [reveal, setReveal] = useState(null);
  useEffect(() => {
    if (session) finalMemory.set(session.id, { answers, sql, result, sqlError, feedback });
  }, [session, answers, sql, result, sqlError, feedback]);

  useEffect(() => {
    if (data?.reveal) setReveal({ reveal: data.reveal, score: data.score, elapsedMs: data.elapsedMs });
  }, [data]);

  const canAct = session?.status === 'active' && eventStatus === 'live';
  // every question answered — the server refuses a blank accusation for free, and the button says so first
  const complete = Boolean(data?.challenge?.fields?.every((f) => String(answers[f.key] ?? '').trim()));

  const run = useCallback(async () => {
    if (!canAct || !sql.trim() || running) return; // the keyboard shortcut obeys the same gate as the button
    setRunning(true);
    try {
      const res = await investigationApi.finalQuery(sql);
      setResult(res);
      setSqlError(null);
      applyServerState(res);
    } catch (err) {
      if (err.code?.startsWith('SQL_')) {
        setResult(null);
        setSqlError(err.message);
      } else {
        notify({ tone: 'crimson', title: errorTitle(err), body: errorMessage(err) });
      }
    } finally {
      setRunning(false);
    }
  }, [canAct, sql, running, applyServerState, notify]);

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await investigationApi.finalSubmit(answers);
      applyServerState(res);
      if (res.correct) {
        impact({ tone: 'violet', title: 'CASE CLOSED', body: 'Black Cipher recovered.' });
        setReveal({ reveal: res.reveal, score: res.score, elapsedMs: res.elapsedMs });
        setFeedback(null);
        await Promise.all([refetch(), refresh()]);
      } else {
        setFeedback({ message: res.message, fields: res.fields, penalty: res.penalty, attemptsRemaining: res.attemptsRemaining });
        if (res.penalty) notify({ tone: 'crimson', title: 'NOT YET', body: `−${res.penalty} points` });
        // the header badges and the attempt cap read `data`: keep them current
        setData((d) => (d ? { ...d, attempts: typeof res.attemptNo === 'number' ? res.attemptNo : (d.attempts || 0) + 1, attemptsRemaining: res.attemptsRemaining ?? d.attemptsRemaining } : d));
        refresh();
      }
    } catch (err) {
      notify({ tone: 'crimson', title: errorTitle(err), body: errorMessage(err) });
      if (err.status === 423 || err.status === 409) {
        refresh();
        refetch();
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) return null;
  /* on a sheet: the loader's caption and the error's ink-soft copy would
     otherwise sit straight on the red field (1.9:1) */
  if (loading && !data) return <div className="mt-3 border-5 border-ink bg-white shadow-comic-xl"><SystemLoader label="Opening the final file" /></div>;
  if (error && !data) return <div className="mt-3 border-5 border-ink bg-white shadow-comic-xl"><ErrorState error={error} onRetry={refetch} /></div>;

  if (reveal) return <Reveal reveal={reveal.reveal} score={reveal.score} elapsedMs={reveal.elapsedMs} />;

  if (!data.unlocked) {
    return (
      <div className="mt-3 border-3 border-ink bg-white shadow-comic-lg">
        <EmptyState icon={Lock} title="The final file is sealed" body="Close all five case files first. Every clue you need is in them." />
      </div>
    );
  }

  const ch = data.challenge;
  const entityOptions = data.entities.map((e) => ({ value: e.id, label: e.name }));
  const fieldState = (key) => (feedback?.fields ? (feedback.fields[key] ? 'ok' : 'bad') : null);

  /* The same three-tier sheet as the case files: the brief and the optional
     terminal in the white tier, then the accusation as the sheet's act tier,
     built like the sign-in card's form — not a second boxed panel inside the
     first. */
  return (
    <section className="relative mt-3 border-5 border-ink bg-white shadow-comic-xl">
      <div className="paper-strip relative border-b-3 border-ink px-[clamp(1.05rem,2.6vmin,1.6rem)] pb-[clamp(0.55rem,1.3vmin,0.8rem)] pt-[clamp(1.1rem,2.6vmin,1.6rem)]">
        {/* white, not red-deep: this chip hangs over the sheet's top edge
            onto the field, and red-deep on red is a 1.6:1 box. "The
            accusation" below keeps caption-deep — it sits inside the sheet. */}
        <span className="caption-white absolute -top-4 left-5 text-base">{data.file.label}</span>
        <div className="flex flex-wrap items-start justify-between gap-3 pt-2">
          <h1 className="font-display text-4xl uppercase leading-none tracking-comic text-ink sm:text-5xl">{data.file.title}</h1>
          <div className="flex items-center gap-2">
            {data.attempts ? <Badge tone="dim">{data.attempts} attempt{data.attempts === 1 ? '' : 's'}</Badge> : null}
            {data.attemptsRemaining !== null ? <Badge tone={data.attemptsRemaining ? 'amber' : 'crimson'}>{data.attemptsRemaining} left</Badge> : null}
          </div>
        </div>
      </div>

      <div className="px-[clamp(1.05rem,2.6vmin,1.6rem)] pb-[clamp(1.5rem,3.2vmin,2.1rem)] pt-[clamp(0.7rem,1.7vmin,1.05rem)]">
        <div className="bubble max-w-[68ch]">
          <RichText text={ch.brief} className="text-[1.02rem] font-bold leading-relaxed text-ink" />
        </div>
        <p className="label mt-5">— The Chief</p>

        {/* one terminal, one treatment: the case files' plate and glass */}
        <div className="mt-4">
          <div className="paper-strip flex items-center justify-between gap-3 border-3 border-b-0 border-ink px-3 py-1.5">
            <span className="label-strong">{ch.editorLabel || 'Optional — reconstruct it all in one query'}</span>
          </div>
          <div className="term min-h-48 border-t-0 shadow-comic-sm">
            <SqlEditor value={sql} onChange={setSql} onRun={run} autoHeight={{ min: 192 }} />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button icon={Play} onClick={run} loading={running} disabled={!canAct}>
            Run query
          </Button>
          {result ? (
            <span className="text-sm font-bold text-ink-soft">
              {result.rowCount} row{result.rowCount === 1 ? '' : 's'}
              {result.truncated ? ' · truncated' : ''}
            </span>
          ) : null}
        </div>
        <div className="mt-4">
          <div className="paper-strip flex items-center justify-between gap-3 border-3 border-b-0 border-ink px-3 py-1.5">
            <span className="label-strong">Result</span>
          </div>
          {sqlError ? (
            <div className="border-3 border-t-0 border-ink bg-red-light px-4 py-3 font-mono text-sm text-ink" role="alert">
              <span className="font-display text-lg uppercase tracking-comic text-red-deep">SQL error: </span>
              {sqlError}
            </div>
          ) : result ? (
            <DataGrid columns={result.columns} rows={result.rows} maxHeight="max-h-72" dense className="scroll-green border-t-0 !bg-green-light" />
          ) : (
            <div className="border-3 border-t-0 border-ink bg-green-light px-4 py-5 text-center text-sm font-bold text-ink">Nothing to submit here — this terminal is for checking your theory. Name the culprits in the accusation below.</div>
          )}
        </div>
      </div>

      <div className="accuse-form tier-flush paper-strip relative border-t-3 border-ink px-[clamp(1.05rem,2.6vmin,1.6rem)] py-[clamp(1rem,2.4vmin,1.5rem)]">
        <span className="caption-deep absolute -top-4 left-5 text-base">The accusation</span>
        <form onSubmit={submit} className="mt-2 grid gap-4 sm:grid-cols-2" noValidate>
          {ch.fields.map((f) => {
            const state = fieldState(f.key);
            const common = {
              label: f.label,
              value: answers[f.key] ?? '',
              onChange: (e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value })),
              className: cn(f.wide && 'sm:col-span-2'),
              error: state === 'bad' ? 'Re-check this' : undefined,
              hint: state === 'ok' ? 'Confirmed' : undefined,
              disabled: !canAct,
            };
            if (f.type === 'entity') return <Select key={f.key} {...common} options={entityOptions} placeholder={f.placeholder || 'Select employee…'} />;
            if (f.type === 'select') return <Select key={f.key} {...common} options={f.options} placeholder={f.placeholder || 'Select…'} />;
            return <Input key={f.key} {...common} placeholder={f.placeholder} autoComplete="off" />;
          })}
          <div className="sm:col-span-2">
            <Button type="submit" size="xl" variant="danger" loading={submitting} disabled={!canAct || !complete || (data.attemptsRemaining !== null && data.attemptsRemaining === 0)}>
              {ch.submitLabel || 'Close the case'}
            </Button>
            {canAct && !complete ? <span className="caption-orange ml-3 text-base">Answer every question to close the case</span> : null}
            {!canAct ? <span className={cn('ml-3 text-base', session.status === 'time_expired' ? 'caption-deep' : 'caption-orange')}>{session.status === 'time_expired' ? 'Time is up' : eventStatus === 'paused' ? 'Paused' : 'Investigation not live'}</span> : null}
          </div>
        </form>

        <AnimatePresence>
          {feedback ? (
            <motion.div key={feedback.message + data.attempts} initial={reduce ? false : { opacity: 0, scale: 0.94 }} animate={reduce ? { opacity: 1, scale: 1 } : { opacity: 1, scale: 1, x: [0, -8, 8, -5, 5, 0] }} exit={{ opacity: 0 }} transition={reduce ? { duration: 0 } : { duration: 0.45 }} className="relative mt-6 border-3 border-ink bg-red-light px-4 py-3 text-base font-bold text-ink shadow-comic" role="status">
              <span className="pointer-events-none absolute -right-3 -top-7 sm:-right-5">
                <Burst size="sm" tone="red" tilt={-8}>
                  Not yet!
                </Burst>
              </span>
              <span className="inline-flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-deep" strokeWidth={2.6} aria-hidden />
                <span>{feedback.message}</span>
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
        {data.completed ? (
          <p className="mt-4 inline-flex items-center gap-2 border-3 border-ink bg-green-light px-3 py-1 font-display text-xl uppercase tracking-comic text-ink shadow-comic-sm">
            <CircleCheck className="h-5 w-5 text-green-deep" strokeWidth={2.6} aria-hidden /> Case closed
          </p>
        ) : null}
        {session.status !== 'active' && !data.completed ? (
          <p className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-ink-soft">
            <RotateCcw className="h-4 w-4" strokeWidth={2.5} aria-hidden /> The investigation window has closed — no further submissions.
          </p>
        ) : null}
      </div>
    </section>
  );
}
