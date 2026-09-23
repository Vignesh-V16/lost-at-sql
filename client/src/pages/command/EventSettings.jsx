import { useEffect, useState } from 'react';
import { Save, Calculator, Lock, ShieldAlert } from 'lucide-react';
import { Panel } from '../../components/ui/Panel.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input, Toggle, Select } from '../../components/ui/Field.jsx';
import { SectionHeading } from '../../components/ui/Misc.jsx';
import { SystemLoader, ErrorState } from '../../components/ui/States.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useEvent } from '../../contexts/EventContext.jsx';
import { adminApi } from '../../services/api.js';
import { errorTitle, errorMessage } from '../../utils/errors.js';

const SCORING_FIELDS = [
  ['initialScore', 'Initial score', 'Every session starts here (prototype: 1000)'],
  ['wrongAnswerPenalty', 'Wrong finding penalty', 'Per incorrect submission (prototype: 25)'],
  ['hintPenalty', 'Hint penalty', 'Per hint (prototype: 50)'],
  ['finalAttemptPenalty', 'Wrong final deduction penalty', 'Per incorrect final submission (prototype: 25)'],
  ['completionBonus', 'Completion bonus', 'Added once when the case is closed (prototype: 0)'],
  ['minimumScore', 'Score floor', 'Scores never drop below this (prototype: 0)'],
];

/**
 * EventSettings — identity, clock, participation, scoring policy,
 * leaderboard policy and query limits. Structural settings are locked
 * while the event is live (the server refuses them without force).
 */
export default function EventSettings() {
  useDocumentTitle('Event settings');
  const { notify } = useToast();
  const { status, applyEvent } = useEvent();
  const event = useAsync(() => adminApi.event(), []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const locked = status === 'live' || status === 'paused';

  useEffect(() => {
    if (event.data && !form) {
      const d = event.data;
      setForm({
        name: d.name,
        caseNumber: d.caseNumber || '',
        description: d.description || '',
        durationMinutes: d.durationMinutes,
        registrationOpen: d.registrationOpen,
        maxParticipants: d.maxParticipants,
        exposeQueryHistory: d.exposeQueryHistory !== false,
        proctoring: {
          enabled: d.proctoring?.enabled !== false,
          requireFullscreen: d.proctoring?.requireFullscreen !== false,
          blockCopyPaste: d.proctoring?.blockCopyPaste !== false,
          blockContextMenu: d.proctoring?.blockContextMenu !== false,
          warnLimit: d.proctoring?.warnLimit ?? 3,
          maxViolations: d.proctoring?.maxViolations ?? 0,
          onLimit: d.proctoring?.onLimit || 'notify',
        },
        queryScope: d.queryScope || 'dataset',
        scoring: { ...(d.scoringPolicy || {}), timeBonus: { ...(d.scoringPolicy?.timeBonus || {}) } },
        leaderboard: { ...(d.leaderboardPolicy || {}), order: (d.leaderboardPolicy?.order || []).join(', ') },
        query: { ...(d.queryPolicy || {}) },
        finalMaxAttempts: d.finalAttemptPolicy?.maxAttempts ?? 0,
        force: false,
      });
    }
  }, [event.data, form]);

  if (event.loading && !event.data) return <SystemLoader label="Loading settings" />;
  if (event.error && !event.data) return <ErrorState error={event.error} onRetry={() => event.refetch().catch(() => {})} />;
  if (!form) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setNested = (group, k) => (e) => setForm((f) => ({ ...f, [group]: { ...f[group], [k]: e.target.value } }));
  const setProctor = (k, v) => setForm((f) => ({ ...f, proctoring: { ...f.proctoring, [k]: v } }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const patch = {
        name: form.name.trim(),
        caseNumber: form.caseNumber.trim(),
        description: form.description.trim(),
        durationMinutes: Number(form.durationMinutes),
        registrationOpen: form.registrationOpen,
        maxParticipants: Number(form.maxParticipants),
        exposeQueryHistory: form.exposeQueryHistory,
        queryScope: form.queryScope,
        scoringPolicy: {
          ...Object.fromEntries(SCORING_FIELDS.map(([k]) => [k, Number(form.scoring[k]) || 0])),
          hintPenaltyScope: form.scoring.hintPenaltyScope === 'hint' ? 'hint' : 'file',
          timeBonus: { enabled: Boolean(form.scoring.timeBonus?.enabled), perMinuteRemaining: Number(form.scoring.timeBonus?.perMinuteRemaining) || 0, max: Number(form.scoring.timeBonus?.max) || 0 },
        },
        leaderboardPolicy: {
          order: form.leaderboard.order.split(',').map((s) => s.trim()).filter(Boolean),
          groupBy: form.leaderboard.groupBy === 'team' ? 'team' : 'participant',
          visibleToParticipants: form.leaderboard.visibleToParticipants !== false,
          limit: Number(form.leaderboard.limit) || 100,
        },
        queryPolicy: { timeoutMs: Number(form.query.timeoutMs) || 4000, maxRows: Number(form.query.maxRows) || 500, maxLength: Number(form.query.maxLength) || 4000 },
        proctoring: {
          enabled: Boolean(form.proctoring.enabled),
          requireFullscreen: Boolean(form.proctoring.requireFullscreen),
          blockCopyPaste: Boolean(form.proctoring.blockCopyPaste),
          blockContextMenu: Boolean(form.proctoring.blockContextMenu),
          warnLimit: Number(form.proctoring.warnLimit) || 0,
          maxViolations: Number(form.proctoring.maxViolations) || 0,
          onLimit: form.proctoring.onLimit === 'lock' ? 'lock' : 'notify',
        },
        finalAttemptPolicy: { maxAttempts: Number(form.finalMaxAttempts) || 0 },
        force: locked ? form.force : undefined,
      };
      const updated = await adminApi.updateEvent(patch);
      applyEvent(updated);
      event.setData(updated);
      notify({ tone: 'cyan', title: 'SETTINGS SAVED', body: 'Broadcast to every client.' });
    } catch (err) {
      notify({ tone: 'crimson', title: errorTitle(err), body: errorMessage(err), ttl: 7000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-6">
      <SectionHeading label="Configuration" title="Event settings" tone="crimson" description="Scoring, duration and dataset are locked while the investigation is live; the server refuses those changes unless you force them (audited)." actions={<Button type="submit" icon={Save} loading={busy}>Save settings</Button>} />

      {locked ? (
        <div className="flex flex-wrap items-center gap-3 border-3 border-ink bg-yellow px-4 py-3 shadow-comic-sm">
          <Lock className="h-5 w-5 text-ink" strokeWidth={2.6} aria-hidden />
          <p className="font-display text-lg uppercase tracking-comic text-ink">Event is {status} — structural settings are locked</p>
          <div className="ml-auto">
            <Toggle label="Force changes (audited)" checked={form.force} onChange={(v) => setForm((f) => ({ ...f, force: v }))} />
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel label="The event" title="Name & clock" bodyClassName="space-y-4 p-5">
          <Input label="Event name" value={form.name} onChange={set('name')} required maxLength={120} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Case number" value={form.caseNumber} onChange={set('caseNumber')} maxLength={40} inputClassName="font-mono" />
            <Input label="Investigation duration (minutes)" type="number" min={5} max={600} value={form.durationMinutes} onChange={set('durationMinutes')} hint="Each participant's own clock — it starts when they press Begin." />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Maximum participants" type="number" min={1} max={5000} value={form.maxParticipants} onChange={set('maxParticipants')} />
            <Input label="Max final attempts (0 = unlimited)" type="number" min={0} max={100} value={form.finalMaxAttempts} onChange={set('finalMaxAttempts')} hint="Prototype: unlimited, −25 each." />
          </div>
          <Toggle label="Registration open" checked={form.registrationOpen} onChange={(v) => setForm((f) => ({ ...f, registrationOpen: v }))} hint="When closed, credentials that have never logged in are refused." />
        </Panel>

        <Panel label="Scoring" title="Points" actions={<Calculator className="h-5 w-5 text-ink-soft" strokeWidth={2.4} aria-hidden />} bodyClassName="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {SCORING_FIELDS.map(([k, label, hint]) => (
              <Input key={k} label={label} type="number" value={form.scoring[k] ?? 0} onChange={setNested('scoring', k)} hint={hint || undefined} />
            ))}
            <Select label="Hint penalty scope" value={form.scoring.hintPenaltyScope || 'file'} onChange={setNested('scoring', 'hintPenaltyScope')} options={[{ value: 'file', label: 'Once per file (prototype)' }, { value: 'hint', label: 'Per hint' }]} hint="FILE 04 has two hints: once-per-file charges 50 total, per-hint charges 100." />
          </div>
        </Panel>
        {/* Exam integrity. Plain about what a browser can and cannot see, so
            nobody treats the flag count as proof on its own. */}
        <Panel label="Integrity" title="Exam proctoring" actions={<ShieldAlert className="h-5 w-5 text-ink-soft" strokeWidth={2.4} aria-hidden />} bodyClassName="space-y-4 p-5">
          <Toggle label="Record integrity flags" checked={form.proctoring.enabled} onChange={(v) => setProctor('enabled', v)} hint="Tab switches, full-screen exits, paste attempts and devtools shortcuts are recorded on the session and shown live in the results table." />
          <Toggle label="Require full screen" checked={form.proctoring.requireFullscreen} onChange={(v) => setProctor('requireFullscreen', v)} hint="The case files are covered until the participant returns to full screen. Skipped automatically on iPhones, where browsers have no full-screen mode." />
          <Toggle label="Block copy, cut and paste" checked={form.proctoring.blockCopyPaste} onChange={(v) => setProctor('blockCopyPaste', v)} hint="Stops an answer being pasted into the SQL terminal and the brief being copied out." />
          <Toggle label="Block the right-click menu" checked={form.proctoring.blockContextMenu} onChange={(v) => setProctor('blockContextMenu', v)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Warn the participant at" type="number" min={0} max={100} value={form.proctoring.warnLimit} onChange={(e) => setProctor('warnLimit', e.target.value)} hint="Flags before the counter turns red. 0 never warns." />
            <Input label="Act at" type="number" min={0} max={100} value={form.proctoring.maxViolations} onChange={(e) => setProctor('maxViolations', e.target.value)} hint="0 never acts — the coordinator decides. Set a number only if you mean it." />
            <Select label="When the limit is reached" value={form.proctoring.onLimit} onChange={(e) => setProctor('onLimit', e.target.value)} options={[{ value: 'notify', label: 'Flag it for the coordinator' }, { value: 'lock', label: 'Put the session on hold' }]} hint="A session on hold keeps its progress; you release it from the results table." />
          </div>
          <p className="text-sm font-bold text-ink-soft">
            These checks see this browser only. They cannot see a second device, a phone, or another person in the room, and a determined participant can switch them off. Treat the flag count as something to look into, not as proof.
          </p>
        </Panel>
      </div>
      <p className="text-sm font-bold text-ink-soft">Changes apply to new score changes immediately; existing scores are never rewritten.</p>
    </form>
  );
}
