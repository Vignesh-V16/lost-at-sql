import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Square, Plus, RotateCcw, Megaphone, Download, Users, Trophy, Hourglass, CircleCheck, ShieldAlert } from 'lucide-react';
import { Timer } from '../../components/Timer.jsx';
import { Panel } from '../../components/ui/Panel.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Input } from '../../components/ui/Field.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { SectionHeading, ProgressBar } from '../../components/ui/Misc.jsx';
import { SystemLoader, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { CountUp } from '../../components/ui/CountUp.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { IntegrityFeed, IntegrityReview } from '../../components/command/IntegrityReview.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useSocketEvent } from '../../hooks/useSocketEvent.js';
import { useEvent, useEventClock } from '../../contexts/EventContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { adminApi } from '../../services/api.js';
import { errorTitle, errorMessage } from '../../utils/errors.js';
import { formatClock, formatTime, relativeTime } from '../../utils/format.js';
import { stagger, panelIn } from '../../animations/variants.js';
import { EVENT_STATUS_META } from '../../data/constants.js';
import { cn } from '../../utils/cn.js';

const LOW_TIME_MS = 5 * 60000;
const STATUS = {
  online: { label: 'Investigating', tone: 'green' },
  offline: { label: 'Offline', tone: 'dim' },
  completed: { label: 'Case closed', tone: 'violet' },
  expired: { label: 'Time up', tone: 'crimson' },
  not_started: { label: 'Not started', tone: 'dim' },
  disabled: { label: 'Disabled', tone: 'crimson' },
  disqualified: { label: 'Disqualified', tone: 'crimson' },
};

/** Re-render on an interval so "time left" and "3m ago" stay honest. */
function useNow(intervalMs = 10000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/*
 * CommandCenter — the coordinator's page: run the event (start, pause,
 * extend, end, reset), tell everyone something, and watch the results
 * come in. Rows update over the socket the moment a participant acts.
 */
export default function CommandCenter() {
  useDocumentTitle('Command center');
  const { status, event } = useEvent();
  const now = useNow();
  const rows = useAsync(() => adminApi.monitor(), []);
  const [review, setReview] = useState(null); // the participant whose integrity record is open
  const [snapshotAt, setSnapshotAt] = useState(() => Date.now());
  useSocketEvent('monitor:update', (data) => {
    rows.setData(data);
    setSnapshotAt(Date.now());
  });

  const list = useMemo(() => (rows.data || []).filter((r) => r.status !== 'disabled'), [rows.data]);
  const counts = useMemo(
    () => ({
      registered: list.length,
      waiting: list.filter((r) => r.status === 'not_started' && r.online).length,
      investigating: list.filter((r) => r.status === 'online' || r.status === 'offline').length,
      closed: list.filter((r) => r.status === 'completed').length,
      timeUp: list.filter((r) => r.status === 'expired').length,
    }),
    [list],
  );
  const ranked = useMemo(() => [...list].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.filesCompleted || 0) - (a.filesCompleted || 0) || a.displayName.localeCompare(b.displayName)), [list]);
  const drift = status === 'live' ? now - snapshotAt : 0;

  if (rows.loading && !rows.data) return <SystemLoader label="Opening the command center" />;
  if (rows.error && !rows.data) return <ErrorState error={rows.error} onRetry={() => rows.refetch().catch(() => {})} />;
  const meta = EVENT_STATUS_META[status] || EVENT_STATUS_META.draft;

  return (
    <motion.div variants={stagger(0.09, 0.05)} initial="hidden" animate="show" className="space-y-7">
      <motion.div variants={panelIn}>
        <SectionHeading
          label="Meanwhile, in the command center…"
          title={event?.name || 'Lost at SQL'}
          tone="crimson"
          description={statusLine(status, counts)}
          actions={
            <Badge tone={meta.tone} pulse={status === 'live'} className="px-3 py-1.5 text-base">
              Event · {meta.label}
            </Badge>
          }
        />
      </motion.div>

      <motion.div variants={panelIn} className="grid gap-6 xl:grid-cols-[minmax(320px,400px)_1fr]">
        <EventPanel status={status} event={event} waiting={counts.waiting} />
        <div className="space-y-6">
          <Summary counts={counts} status={status} />
          <Announce />
        </div>
      </motion.div>

      {/* exam integrity: flags as they happen, and the decision that follows */}
      <motion.div variants={panelIn}>
        <IntegrityFeed rows={list} onReview={setReview} />
      </motion.div>

      <motion.div variants={panelIn}>
        <Results rows={ranked} status={status} drift={drift} filesTotal={list[0]?.filesTotal || 6} onReview={setReview} />
      </motion.div>

      <IntegrityReview row={review} open={Boolean(review)} onClose={() => setReview(null)} onChanged={() => rows.refetch().catch(() => {})} />
    </motion.div>
  );
}

function statusLine(status, c) {
  if (status === 'live') return `${c.investigating} investigating · ${c.closed} closed the case · ${Math.max(0, c.registered - c.investigating - c.closed - c.timeUp)} not started yet.`;
  if (status === 'paused') return 'Every clock is frozen. Participants can read their files but cannot query, answer or take hints until you resume.';
  if (status === 'ended' || status === 'archived') return `Investigation over. ${c.closed} of ${c.registered} closed the case${c.timeUp ? `, ${c.timeUp} ran out of time` : ''}. Export the results or reset to run again.`;
  return `${c.registered} investigator${c.registered === 1 ? '' : 's'} registered · ${c.waiting} signed in and waiting. Press Start when the room is ready.`;
}

/* ─────────────────────────── Event clock + controls ─────────────────────────── */

function EventPanel({ status, event, waiting = 0 }) {
  const { applyEvent } = useEvent();
  const { remainingMs } = useEventClock(1000);
  const { notify } = useToast();
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null); // 'end' | 'reset'

  const run = async (name, fn, title, body) => {
    setBusy(name);
    try {
      const state = await fn();
      applyEvent(state);
      notify({ tone: 'cyan', title, body });
      setConfirm(null);
    } catch (err) {
      notify({ tone: 'crimson', title: errorTitle(err), body: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const before = status === 'draft' || status === 'ready' || status === 'scheduled';
  const running = status === 'live' || status === 'paused';
  const over = status === 'ended' || status === 'archived';
  const extendedMin = event?.timer?.totalMs && event?.durationMinutes ? Math.round((event.timer.totalMs - event.durationMinutes * 60000) / 60000) : 0;
  const aura = status === 'live' ? 'bg-green-light' : status === 'paused' ? 'bg-orange-light' : over ? 'bg-red-light' : 'bg-white';

  return (
    <Panel tone={status === 'live' ? 'cyan' : over ? 'crimson' : 'neutral'} className={cn('transition-colors duration-700', aura)} label="Event clock" title={before ? 'Not started' : status === 'paused' ? 'Paused' : over ? 'Finished' : 'Running'} bodyClassName="p-5">
      <Timer source="event" size="lg" />
      <p className="mt-3 text-sm font-bold text-ink-soft">
        {event?.durationMinutes ?? 60} min per investigator{extendedMin > 0 ? ` · +${extendedMin} extended` : ''}
        {event?.timer?.startedAt ? ` · started ${formatTime(event.timer.startedAt)}` : ''}
        {event?.timer?.endedAt ? ` · ended ${formatTime(event.timer.endedAt)}` : ''}
      </p>

      <div className="mt-5 space-y-3">
        {before ? (
          <>
            <Button className={cn('w-full', waiting > 0 && busy !== 'start' && 'animate-wobble')} size="lg" variant="danger" icon={Play} loading={busy === 'start'} onClick={() => run('start', adminApi.startEvent, 'INVESTIGATION STARTED', 'Participants can open the case file now. Each one’s clock starts when they press Begin.')}>
              Start the investigation
            </Button>
            <p className="text-sm font-bold text-ink-soft">Goes live for everyone at once. An investigator’s own {event?.durationMinutes ?? 60}-minute clock only starts when they press Begin.</p>
          </>
        ) : null}
        {status === 'live' ? (
          <Button className="w-full" variant="outline" icon={Pause} loading={busy === 'pause'} onClick={() => run('pause', adminApi.pauseEvent, 'INVESTIGATION PAUSED', 'Every clock is frozen.')}>
            Pause everyone
          </Button>
        ) : null}
        {status === 'paused' ? (
          <Button className="w-full" icon={Play} loading={busy === 'resume'} onClick={() => run('resume', adminApi.resumeEvent, 'INVESTIGATION RESUMED', 'Nobody lost time — every deadline moved by the length of the pause.')}>
            Resume
          </Button>
        ) : null}
        {running ? (
          <div>
            <p className="label mb-1.5">Give everyone more time</p>
            <div className="grid grid-cols-3 gap-2">
              {[5, 10, 15].map((m) => (
                <Button key={m} size="sm" variant="outline" icon={Plus} loading={busy === `extend${m}`} onClick={() => run(`extend${m}`, () => adminApi.extendEvent(m), 'TIME EXTENDED', `+${m} minutes for every active investigator.`)}>
                  {m} min
                </Button>
              ))}
            </div>
            {status === 'live' && remainingMs < LOW_TIME_MS ? <p className="mt-2 font-display text-lg uppercase tracking-comic text-red">Under five minutes on the event clock!</p> : null}
          </div>
        ) : null}
        {running ? (
          <Button className="w-full" variant="danger" icon={Square} onClick={() => setConfirm('end')}>
            End the investigation
          </Button>
        ) : null}
        {over ? (
          <Button className="w-full" size="lg" icon={RotateCcw} onClick={() => setConfirm('reset')}>
            Reset to run again
          </Button>
        ) : null}
        {!over && !running ? (
          <Button className="w-full" variant="ghost" size="sm" icon={RotateCcw} onClick={() => setConfirm('reset')}>
            Reset event
          </Button>
        ) : null}
      </div>

      <ConfirmDialog open={confirm === 'end'} onClose={() => setConfirm(null)} title="End the investigation?" description="Every active session expires immediately and scores freeze. Participants can still read their results. A finished event cannot be restarted — only reset." confirmLabel="End event" loading={busy === 'end'} onConfirm={() => run('end', adminApi.endEvent, 'INVESTIGATION ENDED')} />
      <ConfirmDialog open={confirm === 'reset'} onClose={() => setConfirm(null)} title="Reset the whole event?" description="Every session, query, final submission and the results are erased for every participant and the event returns to standby. Credentials, case files and the dataset are kept. This cannot be undone." confirmLabel="Reset everything" confirmWord="RESET" loading={busy === 'reset'} onConfirm={() => run('reset', async () => (await adminApi.resetEvent('RESET_EVENT', 'RESET')).event, 'EVENT RESET', 'Back to standby. Participants can sign in again.')} />
    </Panel>
  );
}

/* ─────────────────────────── Room summary ─────────────────────────── */

function Summary({ counts, status }) {
  const before = status === 'draft' || status === 'ready' || status === 'scheduled';
  const tiles = before
    ? [
        ['Registered', counts.registered, 'bg-white text-ink', Users],
        ['Signed in', counts.waiting, 'bg-cyan text-ink', CircleCheck],
        ['Not signed in', counts.registered - counts.waiting, 'bg-paper text-ink-soft', Hourglass],
      ]
    : [
        ['Investigating', counts.investigating, 'bg-cyan text-ink', Users],
        ['Case closed', counts.closed, 'bg-purple text-white', Trophy],
        ['Time up', counts.timeUp, counts.timeUp ? 'bg-red text-white' : 'bg-paper text-ink-soft', Hourglass],
      ];
  return (
    <div className="grid grid-cols-3 gap-4">
      {tiles.map(([label, value, tone, Icon]) => (
        <div key={label} className={cn('border-3 border-ink px-4 py-3 shadow-comic', tone)}>
          <p className="label flex items-center gap-2 text-current opacity-80">
            <Icon className="h-4 w-4" strokeWidth={2.5} aria-hidden /> {label}
          </p>
          <p className="mt-1.5 font-display text-5xl uppercase leading-none tabular tracking-comic">
            <CountUp value={value} />
          </p>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── Broadcast ─────────────────────────── */

function Announce() {
  const { notify } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await adminApi.announce({ title: title.trim(), body: body.trim(), tone: 'cyan' });
      notify({ tone: 'cyan', title: 'ANNOUNCEMENT SENT', body: 'Every connected participant saw it.' });
      setTitle('');
      setBody('');
    } catch (err) {
      notify({ tone: 'crimson', title: errorTitle(err), body: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel label="Broadcast" title="Tell everyone" bodyClassName="p-5">
      <form onSubmit={send} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Input label="Message" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="e.g. Ten minutes left — file your final deduction" required />
        <Input label="Detail (optional)" value={body} onChange={(e) => setBody(e.target.value)} maxLength={240} placeholder="One short line" />
        <Button type="submit" icon={Megaphone} loading={busy} disabled={!title.trim()}>
          Send
        </Button>
      </form>
      <p className="mt-2 text-sm font-bold text-ink-soft">Appears as a banner on every signed-in participant’s screen.</p>
    </Panel>
  );
}

/* ─────────────────────────── Results ─────────────────────────── */

function toCsv(rows) {
  const head = ['rank', 'investigator', 'username', 'team', 'status', 'score', 'files_closed', 'files_total', 'current_file', 'hints_used', 'queries', 'integrity_flags', 'seconds_away', 'on_hold', 'time_taken', 'last_activity'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r, i) => [i + 1, r.displayName, r.username, r.team?.name || '', STATUS[r.status]?.label || r.status, r.score ?? '', r.filesCompleted, r.filesTotal, r.currentFile?.label || '', r.hintsUsed, r.queries, r.violations || 0, Math.round((r.awayMs || 0) / 1000), r.proctorLocked ? 'yes' : 'no', r.elapsedMs != null ? formatClock(r.elapsedMs) : '', r.lastActivityAt || ''].map(esc).join(','));
  return [head.join(','), ...lines].join('\n');
}

function Results({ rows, status, drift, filesTotal, onReview }) {
  const download = () => {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lost-at-sql-results-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Panel
      label="Results"
      title={`${rows.length} investigator${rows.length === 1 ? '' : 's'}`}
      bodyClassName="p-0"
      actions={
        <>
          <Badge tone={status === 'live' ? 'green' : 'dim'} pulse={status === 'live'}>
            {status === 'live' ? 'Live' : 'Snapshot'}
          </Badge>
          <Button size="sm" variant="outline" icon={Download} onClick={download} disabled={!rows.length}>
            CSV
          </Button>
        </>
      }
    >
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse">
            <thead>
              <tr className="border-b-3 border-ink bg-yellow text-left">
                {['#', 'Investigator', 'Team', 'Status', 'Score', 'Files', 'On file', 'Time left', 'Hints', 'Flags', 'Last seen'].map((h) => (
                  <th key={h} className="px-3 py-2 font-display text-base font-normal uppercase tracking-comic text-ink">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const s = STATUS[r.status] || STATUS.not_started;
                const remaining = r.remainingMs == null ? null : Math.max(0, r.remainingMs - drift);
                const active = r.status === 'online' || r.status === 'offline';
                return (
                  <tr key={r.id} className="row-hover border-b-2 border-line">
                    <td className="px-3 py-2.5 font-display text-xl tabular text-ink-soft">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-display text-xl uppercase leading-none tracking-comic text-ink">{r.displayName}</p>
                      <p className="font-mono text-xs text-ink-faint">{r.username}</p>
                    </td>
                    <td className="px-3 py-2.5 text-sm font-bold">
                      {r.team ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="h-3 w-3 border-2 border-ink" style={{ background: r.team.color }} aria-hidden /> {r.team.name}
                        </span>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={s.tone} pulse={r.status === 'online'}>
                        {s.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 font-display text-2xl tabular text-ink">{r.score ?? '—'}</td>
                    <td className="w-40 px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={r.filesCompleted} max={filesTotal} tone={r.filesCompleted >= filesTotal ? 'green' : 'amber'} label={`${r.displayName} files`} className="flex-1" />
                        <span className="font-mono text-xs tabular text-ink-soft">
                          {r.filesCompleted}/{filesTotal}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-sm font-bold">{r.status === 'completed' ? <span className="text-purple">Done</span> : r.currentFile ? r.currentFile.label : <span className="text-ink-faint">—</span>}</td>
                    <td className={cn('px-3 py-2.5 font-mono text-sm tabular', active && remaining !== null && remaining < LOW_TIME_MS && 'text-red')}>{active && remaining !== null ? formatClock(remaining) : r.status === 'completed' && r.elapsedMs != null ? <span className="text-ink-faint">{formatClock(r.elapsedMs)} taken</span> : <span className="text-ink-faint">—</span>}</td>
                    <td className="px-3 py-2.5 font-mono text-sm tabular">{r.hintsUsed}</td>
                    {/* exam-integrity flags: tab switches, full-screen exits, paste attempts */}
                    <td className="px-3 py-2.5">
                      {r.sessionId && (r.violations || r.proctorLocked || r.disqualified) ? (
                        <button
                          type="button"
                          onClick={() => onReview?.(r)}
                          className="inline-flex items-center gap-1.5 border-2 border-ink bg-white px-2 py-1 text-left shadow-comic-sm hover:bg-yellow-light"
                          title={r.lastFlag ? `last: ${r.lastFlag.type} — click to review` : 'click to review'}
                        >
                          <ShieldAlert className="h-4 w-4 shrink-0 text-red-deep" strokeWidth={2.6} aria-hidden />
                          <span className="font-mono text-sm tabular text-ink">{r.disqualified ? 'DQ' : r.proctorLocked ? 'hold' : r.violations}</span>
                          {r.awayMs > 1000 ? <span className="font-mono text-xs text-ink-faint">{Math.round(r.awayMs / 1000)}s</span> : null}
                        </button>
                      ) : (
                        <span className="font-mono text-sm text-ink-faint">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-sm font-bold text-ink-soft">{r.lastActivityAt ? relativeTime(r.lastActivityAt) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState compact icon={Users} title="No participants yet" body="Create investigator accounts under Participants." />
      )}
    </Panel>
  );
}
