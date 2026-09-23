import { useState } from 'react';
import { Copy, Check, RefreshCw, ShieldAlert, Lightbulb, Table2, Gauge } from 'lucide-react';
import { Panel } from '../../components/ui/Panel.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { DataGrid } from '../../components/ui/DataGrid.jsx';
import { SectionHeading } from '../../components/ui/Misc.jsx';
import { SystemLoader, ErrorState } from '../../components/ui/States.jsx';
import { RichText } from '../../components/investigation/RichText.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { adminApi } from '../../services/api.js';
import { cn } from '../../utils/cn.js';

/*
 * Answers — the coordinator's answer key. Every file's reference query, the
 * rows it returns against the loaded dataset, and the answer the engine
 * accepts. Only a coordinator session can load it; nothing here is ever
 * served to a participant.
 */

const SKILL_LABEL = { JOIN: 'JOIN', SUBQUERY: 'Subquery', GROUP_BY: 'GROUP BY', HAVING: 'HAVING', AGGREGATE: 'Aggregate', DISTINCT: 'DISTINCT', ORDER_BY: 'ORDER BY', WHERE: 'WHERE' };
const DIFFICULTY_TONE = { easy: 'green', medium: 'amber', hard: 'crimson' };

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* clipboard unavailable: the query is still on screen */
    }
  };
  return (
    <Button size="sm" variant="outline" icon={done ? Check : Copy} onClick={copy}>
      {done ? 'Copied' : 'Copy SQL'}
    </Button>
  );
}

/** Validators that are not a plain set or field, printed one per line. */
function Rules({ rules, lead = 'Also checked' }) {
  if (!rules?.length) return null;
  return (
    <div className="mt-3">
      <p className="label mb-1">{lead}</p>
      <ul className="space-y-1">
        {rules.map((r) => (
          <li key={r} className="border-l-3 border-ink pl-2 text-sm font-bold text-ink">
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Entity({ id, name }) {
  return (
    <span className="inline-flex items-center gap-1.5 border-2 border-ink bg-white px-2 py-0.5 font-mono text-sm font-bold text-ink shadow-comic-sm">
      {id}
      {name ? <span className="font-body font-bold text-ink-soft">{name}</span> : null}
    </span>
  );
}

/** The accepted answer, per validation kind. */
function Accepted({ answer }) {
  if (!answer) return null;
  if (answer.kind === 'set') {
    return (
      <div>
        <p className="label mb-2">Accepted {answer.column} set · exactly these, any order</p>
        <div className="flex flex-wrap gap-2">
          {answer.values.map((v) => (
            <Entity key={v.id} id={v.id} name={v.name} />
          ))}
        </div>
        <Rules rules={answer.rules} />
      </div>
    );
  }
  if (answer.kind === 'field') {
    return (
      <div>
        <p className="label mb-2">
          Accepted · {answer.every ? 'every' : 'any'} row where {answer.column} is
        </p>
        <div className="flex flex-wrap gap-2">
          {answer.values.map((v) => (
            <Entity key={v.id} id={v.id} name={v.name} />
          ))}
        </div>
        <Rules rules={answer.rules} />
      </div>
    );
  }
  if (answer.kind === 'rules') return <Rules rules={answer.rules} lead="Accepted when" />;
  if (answer.kind === 'boolean') {
    return (
      <div className="space-y-3">
        {answer.prior ? (
          <div>
            <p className="label mb-2">
              Step 1 · the query must return {answer.prior.exact ? 'exactly this ' : ''}
              {answer.prior.column || 'result'}
            </p>
            <div className="flex flex-wrap gap-2">
              {answer.prior.values.map((v) => (
                <Entity key={v.id} id={v.id} name={v.name} />
              ))}
            </div>
            <Rules rules={answer.prior.rules} />
          </div>
        ) : null}
        <div>
          <p className="label mb-1">Step 2 · {answer.question || 'the question'}</p>
          <p className="font-display text-2xl uppercase leading-none tracking-comic text-green-deep">{answer.expectedLabels.join(' / ') || '—'}</p>
        </div>
        <Rules rules={answer.rules} />
      </div>
    );
  }
  if (answer.kind === 'final') {
    return (
      <div>
        <p className="label mb-2">Accepted accusation</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {answer.fields.map((f) => (
            <div key={f.key} className="contents">
              <dt className="pt-0.5 text-sm font-bold text-ink-soft">{f.label}</dt>
              <dd className="min-w-0 break-words">
                <span className="font-display text-xl uppercase leading-none tracking-comic text-green-deep">{f.display ?? '—'}</span>
                {f.accepts ? <span className="ml-2 text-sm font-bold text-ink-soft">({f.accepts})</span> : null}
                {f.unchecked ? <span className="ml-2 text-sm font-bold text-red-deep">not checked — any value passes</span> : null}
                {f.noField ? <span className="ml-2 text-sm font-bold text-red-deep">rule with no form field — unanswerable</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  return null;
}

function Challenge({ ch }) {
  return (
    <div className="space-y-4">
      {ch.stageLabel ? <p className="caption-deep inline-block text-sm">{ch.stageLabel}</p> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <RichText text={ch.brief} as="p" className="max-w-3xl text-base font-bold leading-relaxed text-ink-soft" boldClassName="text-ink" />
        {ch.skills.length ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {ch.skills.map((s) => (
              <Badge key={s} tone={ch.requiredSkills?.includes(s) ? 'crimson' : 'blue'}>
                {SKILL_LABEL[s] || s}
              </Badge>
            ))}
            <span className="min-w-0 break-words text-xs font-bold text-ink-soft">{ch.requiredSkills?.length ? 'required' : 'designed around · any correct query passes'}</span>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="label">{ch.sqlKind === 'starter' ? 'Reconstruction query · optional for participants' : 'Reference query'}</p>
            {ch.sql ? <CopyButton text={ch.sql} /> : null}
          </div>
          {ch.sql ? (
            <pre className="term mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[13px] leading-relaxed text-[#e6f1ff]">
              <code>{ch.sql}</code>
            </pre>
          ) : (
            <p className="mt-2 text-sm font-bold text-ink-faint">No query for this step.</p>
          )}
        </div>
        <div>
          <p className="label">
            Result
            {ch.result ? (
              <span className="ml-2 normal-case tracking-normal text-ink-faint">
                {ch.result.rowCount} row{ch.result.rowCount === 1 ? '' : 's'}
                {ch.result.truncated ? ' · truncated' : ''}
              </span>
            ) : null}
          </p>
          {ch.resultError ? (
            <p className="mt-2 border-3 border-ink bg-red-light p-3 text-sm font-bold text-red-deep">The reference query failed: {ch.resultError}</p>
          ) : ch.result ? (
            <DataGrid columns={ch.result.columns} rows={ch.result.rows} maxHeight="max-h-80" dense className="mt-2 scroll-green !bg-green-light" />
          ) : (
            <p className="mt-2 text-sm font-bold text-ink-faint">Nothing to run.</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 border-t-2 border-dashed border-line pt-4 lg:grid-cols-2">
        <Accepted answer={ch.answer} />
        <div className="space-y-3">
          {ch.hints.length ? (
            <div>
              <p className="label mb-2">Hints · what a participant can buy</p>
              <ul className="space-y-2">
                {ch.hints.map((h) => (
                  <li key={h.code} className="flex items-start gap-2 border-2 border-ink bg-red-light px-3 py-2 text-sm font-bold text-ink">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>
                      <span className="text-ink-soft">{h.code}{h.penalty != null ? ` · −${h.penalty} pts` : ''} · </span>
                      {h.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {ch.successMessage ? (
            <div>
              <p className="label mb-1">Shown when solved</p>
              <RichText text={ch.successMessage} as="p" className="text-sm font-bold text-ink-soft" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FileSection({ file }) {
  return (
    <Panel
      label={file.label}
      title={file.title}
      tone={file.isFinal ? 'crimson' : 'neutral'}
      actions={
        file.difficulty ? (
          <Badge tone={DIFFICULTY_TONE[file.difficulty] || 'neutral'}>
            <Gauge className="h-3.5 w-3.5" aria-hidden />
            {file.difficulty}
          </Badge>
        ) : null
      }
      bodyClassName="divide-y-3 divide-ink"
    >
      {/* the tables live in the body, not the header's no-shrink actions
          slot, so six chips can wrap on a phone */}
      {file.tables.length ? (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
          <span className="label">Tables</span>
          {file.tables.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 border-2 border-ink bg-paper px-2 py-0.5 font-mono text-xs font-semibold text-ink">
              <Table2 className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> {t}
            </span>
          ))}
        </div>
      ) : null}
      {file.challenges.map((ch) => (
        <div key={ch.code} className="p-4 sm:p-5">
          <Challenge ch={ch} />
        </div>
      ))}
    </Panel>
  );
}

export default function Answers() {
  useDocumentTitle('Answer key');
  const key = useAsync(() => adminApi.answers(), []);
  if (key.loading && !key.data) return <SystemLoader label="Running the reference queries" />;
  if (key.error && !key.data) return <ErrorState error={key.error} onRetry={() => key.refetch().catch(() => {})} />;
  const files = key.data?.files || [];
  return (
    <div className="space-y-8">
      <SectionHeading
        label="Coordinator eyes only"
        title="Answer key"
        tone="crimson"
        description="Every file's reference query, the rows it returns against the loaded dataset, and the answer the engine accepts."
        actions={
          <Button variant="outline" icon={RefreshCw} onClick={() => key.refetch().catch(() => {})} loading={key.loading}>
            Re-run queries
          </Button>
        }
      />
      <div className={cn('flex items-start gap-3 border-3 border-ink bg-red-light p-3 text-sm font-bold text-ink shadow-comic-sm')}>
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-deep" aria-hidden />
        <p>
          Solutions on screen. Keep this tab off the projector — participants never receive any of it, but a glance is enough.
          {key.data?.datasetChecksum ? <span className="ml-2 font-mono text-xs text-ink-faint">dataset {key.data.datasetChecksum}</span> : null}
        </p>
      </div>
      {files.length ? files.map((f) => <FileSection key={f.code} file={f} />) : <p className="text-base font-bold text-ink-soft">No case files are loaded.</p>}
    </div>
  );
}
