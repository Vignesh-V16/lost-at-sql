import { useEffect, useState } from 'react';
import { ShieldAlert, Gavel, Unlock, RotateCcw, Eye } from 'lucide-react';
import { Modal, ConfirmDialog } from '../ui/Modal.jsx';
import { Panel } from '../ui/Panel.jsx';
import { Button } from '../ui/Button.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Input } from '../ui/Field.jsx';
import { EmptyState } from '../ui/States.jsx';
import { onSocketCreated, SOCKET_EVENTS } from '../../services/socket.js';
import { adminApi } from '../../services/api.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { errorTitle, errorMessage } from '../../utils/errors.js';
import { relativeTime } from '../../utils/format.js';

/*
 * Integrity, coordinator side.
 *
 *   IntegrityFeed   — flags arriving live over the socket, newest first.
 *   IntegrityReview — one participant's record, with the three decisions:
 *                     release a hold, disqualify, or reinstate.
 *
 * Disqualifying keeps every solved file and the whole flag record; it closes
 * the session to further action and drops it off the leaderboard. It is
 * reversible, and the reason is shown to the participant.
 */

const FLAG_LABEL = {
  TAB_HIDDEN: 'Left the page',
  WINDOW_BLUR: 'Another window took focus',
  FULLSCREEN_EXIT: 'Left full screen',
  TAB_RETURN: 'Came back',
  COPY: 'Copy attempt',
  CUT: 'Cut attempt',
  PASTE: 'Paste attempt',
  CONTEXT_MENU: 'Right-click',
  DEVTOOLS_KEY: 'Developer-tools shortcut',
  PRINT: 'Print or save',
  MULTI_SESSION: 'Signed in elsewhere',
  DISQUALIFIED: 'Disqualified',
};
/** The flags worth interrupting a coordinator for. */
const LOUD = new Set(['FULLSCREEN_EXIT', 'PASTE', 'DEVTOOLS_KEY', 'MULTI_SESSION', 'PRINT']);

const secs = (ms) => `${Math.round((ms || 0) / 1000)}s`;

/** Live flags, newest first. Fed by the coordinator socket feed. */
export function IntegrityFeed({ rows = [], onReview }) {
  const [feed, setFeed] = useState([]);
  const { notify } = useToast();

  useEffect(() => {
    /* onSocketCreated ignores what its callback returns, so the handle is
       kept here and detached on unmount */
    let sock = null;
    const onFlag = (payload) => {
      setFeed((f) => [{ ...payload, key: `${payload.sessionId}-${payload.at}-${payload.type}` }, ...f].slice(0, 40));
      if (LOUD.has(payload.type)) {
        notify({ tone: 'crimson', title: (FLAG_LABEL[payload.type] || payload.type).toUpperCase(), body: `${payload.displayName || 'A participant'} · ${payload.violations || 0} flag${payload.violations === 1 ? '' : 's'}`, ttl: 8000 });
      }
    };
    const off = onSocketCreated((socket) => {
      sock = socket;
      socket.on(SOCKET_EVENTS.PROCTOR_FLAG, onFlag);
    });
    return () => {
      off();
      sock?.off(SOCKET_EVENTS.PROCTOR_FLAG, onFlag);
    };
  }, [notify]);

  const flagged = rows.filter((r) => r.violations > 0 || r.proctorLocked || r.disqualified);

  return (
    <Panel
      label="Integrity"
      title={feed.length ? `${feed.length} recent flag${feed.length === 1 ? '' : 's'}` : 'No flags yet'}
      tone="crimson"
      actions={<ShieldAlert className="h-5 w-5 text-ink-soft" strokeWidth={2.4} aria-hidden />}
      bodyClassName="p-0"
    >
      {flagged.length ? (
        <div className="flex flex-wrap gap-2 border-b-3 border-ink p-3">
          {flagged.map((r) => (
            <Button key={r.id} size="sm" variant="outline" icon={Eye} onClick={() => onReview(r)}>
              {r.displayName} · {r.disqualified ? 'disqualified' : r.proctorLocked ? 'on hold' : `${r.violations}`}
            </Button>
          ))}
        </div>
      ) : null}
      {feed.length ? (
        <ul className="max-h-72 divide-y-2 divide-line overflow-y-auto">
          {feed.map((f) => (
            <li key={f.key} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="min-w-0 text-sm font-bold text-ink">
                <span className="font-display text-base uppercase tracking-comic">{f.displayName || 'Participant'}</span>{' '}
                <span className={LOUD.has(f.type) ? 'text-red-deep' : 'text-ink-soft'}>{FLAG_LABEL[f.type] || f.type}</span>
                {f.durationMs > 1000 ? <span className="text-ink-faint"> · away {secs(f.durationMs)}</span> : null}
                {f.file ? <span className="font-mono text-xs text-ink-faint"> · {f.file}</span> : null}
              </span>
              <span className="shrink-0 font-mono text-xs text-ink-faint">{relativeTime(f.at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={ShieldAlert} title="Nothing flagged" body="Tab switches, full-screen exits and paste attempts appear here the moment they happen." />
      )}
    </Panel>
  );
}

/** One participant's record and the coordinator's decision. */
export function IntegrityReview({ row, open, onClose, onChanged }) {
  const { notify } = useToast();
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(null);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!open || !row?.sessionId) return;
    setDetail(null);
    setReason('');
    adminApi
      .session(row.sessionId)
      .then(setDetail)
      .catch(() => setDetail({ violations: [], violationCount: row.violations || 0 }));
  }, [open, row?.sessionId, row?.violations]);

  const run = async (label, fn) => {
    setBusy(label);
    try {
      await fn();
      notify({ tone: 'cyan', title: label.toUpperCase(), body: row.displayName });
      onChanged?.();
      onClose();
    } catch (err) {
      notify({ tone: 'crimson', title: errorTitle(err), body: errorMessage(err), ttl: 7000 });
    } finally {
      setBusy(null);
    }
  };

  if (!row) return null;
  const list = detail?.violations || [];

  return (
    <>
      {/* one sheet at a time: the confirm replaces the record rather than
          stacking on it, and cancelling comes straight back here */}
      <Modal open={open && !confirm} onClose={onClose} title={`${row.displayName} — integrity record`} label="Review" size="lg">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={row.disqualified ? 'crimson' : row.proctorLocked ? 'amber' : 'dim'}>
              {row.disqualified ? 'Disqualified' : row.proctorLocked ? 'On hold' : 'Investigating'}
            </Badge>
            <Badge tone="neutral">{detail?.violationCount ?? row.violations ?? 0} flags</Badge>
            {(detail?.awayMs ?? row.awayMs) > 1000 ? <Badge tone="neutral">{secs(detail?.awayMs ?? row.awayMs)} away</Badge> : null}
            {row.score != null ? <Badge tone="neutral">score {row.score}</Badge> : null}
          </div>

          {row.disqualified && (detail?.disqualifiedReason || row.disqualifiedReason) ? (
            <p className="border-3 border-ink bg-red-light p-3 text-sm font-bold text-ink">
              Reason given: {detail?.disqualifiedReason || row.disqualifiedReason}
            </p>
          ) : null}

          <div>
            <p className="label mb-2">What was recorded</p>
            {list.length ? (
              <ul className="max-h-60 divide-y-2 divide-line overflow-y-auto border-3 border-ink bg-white">
                {list.map((v, i) => (
                  <li key={`${v.at}-${i}`} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm font-bold">
                    <span>
                      {FLAG_LABEL[v.type] || v.type}
                      {v.durationMs > 1000 ? <span className="text-ink-faint"> · away {secs(v.durationMs)}</span> : null}
                      {v.file ? <span className="font-mono text-xs text-ink-faint"> · {v.file}</span> : null}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-ink-faint">{relativeTime(v.at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm font-bold text-ink-soft">{detail ? 'Nothing recorded.' : 'Loading…'}</p>
            )}
          </div>

          <p className="text-sm font-bold text-ink-soft">
            These checks see the participant&apos;s browser only. They cannot see a second device or another person in the room. Talk to the participant before deciding.
          </p>

          {!row.disqualified ? (
            <div className="space-y-3 border-t-3 border-ink pt-4">
              <Input
                label="Reason for disqualification"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. left full screen six times and would not explain"
                hint="Shown to the participant and written to the audit log."
                maxLength={300}
              />
              <div className="flex flex-wrap gap-3">
                {row.proctorLocked ? (
                  <Button variant="outline" icon={Unlock} loading={busy === 'Released'} onClick={() => run('Released', () => adminApi.proctorUnlock(row.sessionId, false))}>
                    Release the hold
                  </Button>
                ) : null}
                <Button variant="danger" icon={Gavel} disabled={reason.trim().length < 3} onClick={() => setConfirm(true)}>
                  Disqualify
                </Button>
              </div>
            </div>
          ) : (
            <div className="border-t-3 border-ink pt-4">
              <Button variant="outline" icon={RotateCcw} loading={busy === 'Reinstated'} onClick={() => run('Reinstated', () => adminApi.reinstate(row.sessionId))}>
                Reinstate this investigator
              </Button>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Disqualify ${row.displayName}?`}
        description="Their investigation closes and they drop off the leaderboard. Everything they solved and every flag is kept, and you can reinstate them. They are shown the reason you typed."
        confirmLabel="Disqualify"
        confirmWord="DISQUALIFY"
        loading={busy === 'Disqualified'}
        onConfirm={() => {
          setConfirm(false);
          return run('Disqualified', () => adminApi.disqualify(row.sessionId, reason.trim()));
        }}
      />
    </>
  );
}
