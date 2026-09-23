import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Upload, KeyRound, RotateCcw, Trash2, Pencil, Users, Copy, ShieldCheck } from 'lucide-react';
import { Panel } from '../../components/ui/Panel.jsx';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Input, Textarea, Toggle } from '../../components/ui/Field.jsx';
import { Modal, ConfirmDialog } from '../../components/ui/Modal.jsx';
import { SectionHeading, Tabs } from '../../components/ui/Misc.jsx';
import { SystemLoader, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { adminApi } from '../../services/api.js';
import { errorTitle, errorMessage } from '../../utils/errors.js';
import { relativeTime } from '../../utils/format.js';

/**
 * Participants — create, edit, search, assign team, reset credentials,
 * view progress, remove. Teams are managed on the second tab.
 */
export default function Participants() {
  useDocumentTitle('Participants');
  const { notify } = useToast();
  const [tab, setTab] = useState('participants');
  const [search, setSearch] = useState('');
  const q = useDebounce(search, 250);
  const list = useAsync(() => adminApi.participants({ search: q, limit: 200 }), [q]);
  const teams = useAsync(() => adminApi.teams(), []);
  const [modal, setModal] = useState(null); // { type: 'create'|'edit'|'bulk'|'credentials'|'remove'|'resetProgress', row }
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState(null); // { username, accessCode } shown once

  const teamOptions = useMemo(() => (teams.data || []).map((t) => ({ value: t.name, label: `${t.name} (${t.members})` })), [teams.data]);

  const run = async (fn, okTitle, okBody) => {
    setBusy(true);
    try {
      const result = await fn();
      notify({ tone: 'cyan', title: okTitle, body: okBody });
      setModal(null);
      await Promise.all([list.refetch().catch(() => {}), teams.refetch().catch(() => {})]);
      return result;
    } catch (err) {
      notify({ tone: 'crimson', title: errorTitle(err), body: errorMessage(err) });
      return null;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeading
        label="The roster"
        title="Participants"
        tone="crimson"
        description="Investigator credentials are created here. Access codes are shown once — copy them into your hand-out sheet."
        actions={
          <>
            <Button variant="outline" icon={Upload} onClick={() => setModal({ type: 'bulk' })}>
              Bulk import
            </Button>
            <Button icon={Plus} onClick={() => setModal({ type: 'create' })}>
              New participant
            </Button>
          </>
        }
      />

      <Tabs tabs={[{ value: 'participants', label: 'Participants', count: list.data?.total }, { value: 'teams', label: 'Teams', count: teams.data?.length }]} value={tab} onChange={setTab} />

      {tab === 'participants' ? (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" aria-hidden />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by ID or name" aria-label="Search participants" className="field pl-9" />
          </div>
          {list.loading && !list.data ? (
            <SystemLoader label="Loading the roster" />
          ) : list.error && !list.data ? (
            <ErrorState error={list.error} onRetry={() => list.refetch().catch(() => {})} />
          ) : list.data?.items?.length ? (
            <div className="overflow-x-auto border-3 border-ink bg-white shadow-comic">
              <table className="w-full min-w-[880px] border-collapse">
                <thead>
                  <tr className="border-b-3 border-ink bg-yellow text-left">
                    {['Investigator', 'Team', 'Progress', 'Last login', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="px-3 py-2 font-display text-base font-normal uppercase tracking-comic text-ink">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((r) => (
                    <tr key={r.id} className="border-b-2 border-line hover:bg-yellow-light">
                      <td className="px-3 py-2.5">
                        <p className="font-display text-xl uppercase leading-none tracking-comic text-ink">{r.displayName}</p>
                        <p className="font-mono text-xs text-ink-faint">{r.username}</p>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">
                        {r.team ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="h-2 w-2" style={{ background: r.team.color }} aria-hidden /> {r.team.name}
                          </span>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-ink-soft">
                        {r.progress ? `${r.progress.score} pts · ${r.progress.filesCompleted}/${r.progress.filesTotal} files · ${r.progress.queries} queries${r.progress.completed ? ' · case closed' : r.progress.status === 'time_expired' ? ' · time up' : ''}` : <span className="text-ink-faint">not started</span>}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-ink-soft">{r.lastLoginAt ? relativeTime(r.lastLoginAt) : 'never'}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone={r.isActive ? 'cyan' : 'crimson'}>{r.isActive ? 'Active' : 'Disabled'}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-0.5">
                          <IconButton size="sm" label="Edit" icon={Pencil} onClick={() => setModal({ type: 'edit', row: r })} />
                          <IconButton size="sm" label="Reset credentials" icon={KeyRound} onClick={() => setModal({ type: 'credentials', row: r })} />
                          <IconButton size="sm" label="Reset progress" icon={RotateCcw} onClick={() => setModal({ type: 'resetProgress', row: r })} />
                          <IconButton size="sm" label="Remove" icon={Trash2} className="hover:text-red" onClick={() => setModal({ type: 'remove', row: r })} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={Users} title="No participants" body={q ? 'No one matches that search.' : 'Create the first investigator or import a roster.'} action={<Button icon={Plus} onClick={() => setModal({ type: 'create' })}>New participant</Button>} />
          )}
        </>
      ) : (
        <TeamsPanel teams={teams} notify={notify} />
      )}

      {/* ---- modals ---- */}
      <ParticipantForm
        open={modal?.type === 'create' || modal?.type === 'edit'}
        row={modal?.type === 'edit' ? modal.row : null}
        teams={teamOptions}
        busy={busy}
        onClose={() => setModal(null)}
        onSubmit={async (data) => {
          if (modal.type === 'create') {
            const created = await run(() => adminApi.createParticipant(data), 'PARTICIPANT CREATED', data.username);
            if (created?.accessCode) setIssued({ username: created.username, accessCode: created.accessCode });
          } else {
            await run(() => adminApi.updateParticipant(modal.row.id, data), 'PARTICIPANT UPDATED', data.displayName || modal.row.username);
          }
        }}
      />
      <BulkImport
        open={modal?.type === 'bulk'}
        busy={busy}
        onClose={() => setModal(null)}
        onSubmit={async (rows) => {
          const result = await run(() => adminApi.bulkCreateParticipants(rows), 'ROSTER IMPORTED');
          if (result) setIssued({ bulk: result });
        }}
      />
      <ConfirmDialog
        open={modal?.type === 'credentials'}
        onClose={() => setModal(null)}
        title="Reset access code?"
        description={`A new access code will be generated for ${modal?.row?.username}. Their current session ends immediately.`}
        confirmLabel="Reset code"
        tone="cyan"
        loading={busy}
        onConfirm={async () => {
          const r = await run(() => adminApi.resetCredentials(modal.row.id), 'CREDENTIALS RESET', modal.row.username);
          if (r) setIssued({ username: r.username, accessCode: r.accessCode });
        }}
      />
      <ConfirmDialog
        open={modal?.type === 'resetProgress'}
        onClose={() => setModal(null)}
        title="Reset investigation progress?"
        description={`All case files, evidence, queries and any verdict for ${modal?.row?.username} will be erased. Their credential stays valid.`}
        confirmLabel="Reset progress"
        confirmWord="RESET"
        loading={busy}
        onConfirm={() => run(() => adminApi.resetProgress(modal.row.id), 'PROGRESS RESET', modal.row.username)}
      />
      <ConfirmDialog
        open={modal?.type === 'remove'}
        onClose={() => setModal(null)}
        title="Remove participant?"
        description={`${modal?.row?.username} and everything they did will be permanently deleted.`}
        confirmLabel="Remove"
        confirmWord="REMOVE"
        loading={busy}
        onConfirm={() => run(() => adminApi.removeParticipant(modal.row.id), 'PARTICIPANT REMOVED', modal.row.username)}
      />
      <IssuedCredentials issued={issued} onClose={() => setIssued(null)} notify={notify} />
    </div>
  );
}

function ParticipantForm({ open, row, teams, busy, onClose, onSubmit }) {
  const [form, setForm] = useState({ username: '', displayName: '', team: '', accessCode: '', isActive: true });
  useEffect(() => {
    if (open) setForm({ username: row?.username || '', displayName: row?.displayName || '', team: row?.team?.name || '', accessCode: '', isActive: row ? row.isActive : true });
  }, [open, row]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = (e) => {
    e.preventDefault();
    const data = { username: form.username.trim().toLowerCase(), displayName: form.displayName.trim() || undefined, team: form.team || null };
    if (!row && form.accessCode) data.accessCode = form.accessCode;
    if (row) data.isActive = form.isActive;
    onSubmit(data);
  };
  return (
    <Modal open={open} onClose={onClose} title={row ? 'Edit participant' : 'New participant'} label="The roster" footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="participant-form" loading={busy}>{row ? 'Save' : 'Create'}</Button>
      </>
    }>
      <form id="participant-form" onSubmit={submit} className="space-y-4">
        <Input label="Investigator ID" value={form.username} onChange={set('username')} placeholder="e.g. vignesh" required minLength={3} maxLength={40} pattern="[a-zA-Z0-9._-]+" hint="Letters, numbers, dot, underscore, dash. Used to log in." autoCapitalize="none" data-autofocus />
        <Input label="Display name" value={form.displayName} onChange={set('displayName')} placeholder="Shown on the leaderboard" maxLength={60} />
        <Input label="Team" value={form.team} onChange={set('team')} placeholder="Pick a team or type a new name" maxLength={40} list="team-options" hint="Unknown team names are created automatically. Leave blank for no team." />
        <datalist id="team-options">
          {teams.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </datalist>
        {!row ? <Input label="Access code (optional)" value={form.accessCode} onChange={set('accessCode')} placeholder="Leave blank to generate" minLength={6} maxLength={128} hint="Generated codes look like cipher-a1b2-c3d4." /> : null}
        {row ? <Toggle label="Credential active" checked={form.isActive} onChange={(v) => setForm((f) => ({ ...f, isActive: v }))} hint="Disabling ends the participant's session immediately." /> : null}
      </form>
    </Modal>
  );
}

function BulkImport({ open, busy, onClose, onSubmit }) {
  const [text, setText] = useState('');
  const rows = useMemo(
    () =>
      text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [username, displayName, team, accessCode] = l.split(',').map((s) => s?.trim());
          return { username: (username || '').toLowerCase(), displayName: displayName || undefined, team: team || null, accessCode: accessCode || undefined };
        })
        .filter((r) => r.username),
    [text],
  );
  return (
    <Modal open={open} onClose={onClose} title="Bulk import" label="The roster" size="lg" footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={busy} disabled={!rows.length} onClick={() => onSubmit(rows)} icon={Upload}>Import {rows.length || ''}</Button>
      </>
    }>
      <div className="space-y-3">
        <Textarea label="One participant per line" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'investigator_id, display name, team, access code\nvignesh, VIGNESH, BLACK OPS, cipher-7741\nananya, ANANYA, BLACK OPS'} hint="Only the ID is required. Missing access codes are generated and shown once after import. Unknown teams are created." data-autofocus />
        {rows.length ? <p className="font-display text-sm uppercase tracking-comic text-blue">{rows.length} participant{rows.length === 1 ? '' : 's'} ready</p> : null}
      </div>
    </Modal>
  );
}

function IssuedCredentials({ issued, onClose, notify }) {
  if (!issued) return null;
  const rows = issued.bulk ? issued.bulk.created : [issued];
  const failed = issued.bulk?.failed || [];
  const text = rows.map((r) => `${r.username}\t${r.accessCode}`).join('\n');
  return (
    <Modal open onClose={onClose} title="Credentials issued" label="Show once" tone="cyan" persistent footer={
      <>
        <Button variant="outline" icon={Copy} onClick={() => navigator.clipboard?.writeText(text).then(() => notify({ tone: 'cyan', title: 'COPIED TO CLIPBOARD' }))}>Copy all</Button>
        <Button onClick={onClose}>Done</Button>
      </>
    }>
      <p className="text-sm text-ink-soft">These access codes are stored hashed. They cannot be shown again — reset the credential if one is lost.</p>
      <div className="mt-3 max-h-64 overflow-auto border-3 border-ink">
        <table className="w-full font-mono text-xs">
          <tbody>
            {rows.map((r) => (
              <tr key={r.username} className="border-b-2 border-line">
                <td className="px-3 py-1.5 text-ink">{r.username}</td>
                <td className="px-3 py-1.5 text-blue">{r.accessCode}</td>
                <td className="px-3 py-1.5 text-ink-faint">{r.team?.name || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {failed.length ? (
        <div className="mt-3 border-3 border-ink bg-red-light p-3">
          <p className="label text-red">{failed.length} not created</p>
          <ul className="mt-1 space-y-0.5 font-mono text-xs text-ink-soft">
            {failed.map((f) => (
              <li key={f.username}>
                {f.username}: {f.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Modal>
  );
}

function TeamsPanel({ teams, notify }) {
  const [form, setForm] = useState({ name: '', color: '#2364e8' });
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn, title) => {
    setBusy(true);
    try {
      await fn();
      notify({ tone: 'cyan', title });
      setEditing(null);
      setRemoving(null);
      setForm({ name: '', color: '#2364e8' });
      await teams.refetch();
    } catch (err) {
      notify({ tone: 'crimson', title: errorTitle(err), body: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Panel label="Teams" title={`${teams.data?.length || 0} teams`} bodyClassName="divide-y-2 divide-line">
        {teams.loading && !teams.data ? (
          <SystemLoader compact label="Loading teams" />
        ) : teams.data?.length ? (
          teams.data.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3">
              {editing?.id === t.id ? (
                <>
                  <input type="color" value={editing.color} onChange={(e) => setEditing((s) => ({ ...s, color: e.target.value }))} aria-label="Team colour" className="h-8 w-10 cursor-pointer border-3 border-ink bg-transparent" />
                  <input value={editing.name} onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))} aria-label="Team name" className="field flex-1 uppercase" />
                  <Button size="sm" loading={busy} onClick={() => run(() => adminApi.updateTeam(t.id, { name: editing.name.trim(), color: editing.color }), 'TEAM UPDATED')}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <span className="h-3 w-3 shrink-0" style={{ background: t.color }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-2xl uppercase leading-none tracking-comic text-ink">{t.name}</p>
                    <p className="font-display text-sm uppercase tracking-comic text-ink-faint">
                      {t.code} · {t.members} member{t.members === 1 ? '' : 's'}
                    </p>
                  </div>
                  <IconButton size="sm" label="Edit team" icon={Pencil} onClick={() => setEditing({ id: t.id, name: t.name, color: t.color })} />
                  <IconButton size="sm" label="Delete team" icon={Trash2} className="hover:text-red" onClick={() => setRemoving(t)} />
                </>
              )}
            </div>
          ))
        ) : (
          <EmptyState compact icon={Users} title="No teams" body="Create a team here or assign one while creating a participant." />
        )}
      </Panel>
      <Panel bracket tone="cyan" label="New team" bodyClassName="p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (form.name.trim()) run(() => adminApi.createTeam({ name: form.name.trim(), color: form.color }), 'TEAM CREATED');
          }}
          className="space-y-3"
        >
          <Input label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. CIPHER SIX" maxLength={40} required />
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <p className="label mb-1.5">Colour</p>
              <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} aria-label="Team colour" className="h-10 w-full cursor-pointer border-3 border-ink bg-white p-1" />
            </div>
            <Button type="submit" loading={busy} icon={Plus}>
              Create
            </Button>
          </div>
        </form>
        <p className="mt-4 flex items-center gap-2 font-display text-sm uppercase tracking-comic text-ink-faint">
          <ShieldCheck className="h-3 w-3" aria-hidden /> Teams only group investigators — scoring stays individual.
        </p>
      </Panel>
      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} title="Delete team?" description={`Members of ${removing?.name} keep their accounts but lose the team assignment.`} confirmLabel="Delete" loading={busy} onConfirm={() => run(() => adminApi.deleteTeam(removing.id), 'TEAM DELETED')} />
    </div>
  );
}
