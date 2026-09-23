import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Fingerprint, Link2, Clock, Lightbulb, BrainCircuit, ShieldCheck, Network, Users, Settings, Bot, ChartNoAxesColumn, Database, ClipboardList, Code, Wrench, FlaskConical, Landmark, Building2, Lock, Cpu } from 'lucide-react';
import { Portrait } from '../ui/Portrait.jsx';
import { Stamp } from '../ui/Badge.jsx';
import { EmptyState } from '../ui/States.jsx';
import { SUSPECT_STATE_META } from '../../data/constants.js';
import { formatTime } from '../../utils/format.js';
import { stagger, panelIn, listItem } from '../../animations/variants.js';
import { cn } from '../../utils/cn.js';

/*
 * The roster's dressing, from the studio's character sheet: a role glyph
 * picked by keyword (first match wins, so the specific words come before
 * the generic "engineer" / "research"), a department pill in a pastel with
 * its own glyph, and the id tag in one of the sheet's five process tints —
 * the tint each id wears on the sheet, and a hash of the id for anyone not
 * on it, so a tag never changes between renders or sorts. Pastels carry
 * their deep tone for text (≥ 5:1); the tints carry ink (≥ 6:1).
 */
const ROLE_ICONS = [
  [/network/i, Network],
  [/\bhr\b|human/i, Users],
  [/admin|systems?/i, Settings],
  [/robot/i, Bot],
  [/financ|account/i, ChartNoAxesColumn],
  [/data/i, Database],
  [/project|manager/i, ClipboardList],
  [/\bml\b|machine|software|developer/i, Code],
  [/facilit|maintenance/i, Wrench],
  [/\blab\b|technician/i, FlaskConical],
  [/cyber|security/i, ShieldCheck],
  [/research|scientist|\bai\b|lead/i, BrainCircuit],
];
const roleIcon = (role = '') => (ROLE_ICONS.find(([re]) => re.test(role)) || [null, Cpu])[1];
const DEPTS = [
  [/\bai\b|research/i, { chip: 'bg-blue-light text-blue-deep', Icon: FlaskConical }],
  [/security|\bit\b/i, { chip: 'bg-purple-light text-purple-deep', Icon: Lock }],
  [/human|\bhr\b|people/i, { chip: 'bg-green-light text-green-deep', Icon: Users }],
  [/robot/i, { chip: 'bg-red-light text-red-deep', Icon: Bot }],
  [/financ/i, { chip: 'bg-yellow-light text-ink', Icon: Landmark }],
  [/facilit|operations/i, { chip: 'bg-red-light text-red-deep', Icon: Building2 }],
];
const dept = (name = '') => (DEPTS.find(([re]) => re.test(name)) || [null, { chip: 'bg-paper-2 text-ink', Icon: Building2 }])[1];
const TAGS = {
  yellow: { chip: 'bg-yellow text-ink', hex: '#ffd12e' },
  coral: { chip: 'bg-[#fa6165] text-ink', hex: '#fa6165' },
  sky: { chip: 'bg-[#5cbffe] text-ink', hex: '#5cbffe' },
  mint: { chip: 'bg-[#82e296] text-ink', hex: '#82e296' },
  lavender: { chip: 'bg-[#c8a8fe] text-ink', hex: '#c8a8fe' },
};
const TAG_BY_ID = { E101: 'yellow', E102: 'sky', E103: 'coral', E104: 'lavender', E105: 'sky', E106: 'mint', E107: 'coral', E108: 'coral', E109: 'lavender', E110: 'yellow', E111: 'sky', E112: 'mint' };
const TAG_KEYS = Object.keys(TAGS);
const tagOf = (id = '') => TAGS[TAG_BY_ID[id] || TAG_KEYS[[...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % TAG_KEYS.length]];

/*
 * EvidenceRecord — the full evidence tab: the twelve persons of interest
 * as character cards (state decided by the server as files close), the
 * evidence recovered so far, connections found, and the investigation
 * log. Nothing undiscovered is shown.
 */
export function EvidenceRecord({ session }) {
  const reduce = useReducedMotion();
  const suspects = session?.suspects || [];
  const evidence = session?.evidence || [];
  const connections = session?.connections || [];
  const timeline = (session?.timeline || []).filter((t) => t.type !== 'QUERY_EXECUTED');
  const names = new Map(suspects.map((s) => [s.id, s.name]));
  const linked = new Map();
  for (const e of evidence) for (const id of e.relatedEntities || []) linked.set(id, (linked.get(id) || 0) + 1);
  const order = { PRIME_SUSPECT: 0, ACCOMPLICE: 1, PERSON_OF_INTEREST: 2, SUSPECT: 3, UNKNOWN: 4, CLEARED: 5 };
  const sorted = [...suspects].sort((a, b) => (order[a.state] ?? 4) - (order[b.state] ?? 4) || a.name.localeCompare(b.name));
  const counts = suspects.reduce((acc, s) => ({ ...acc, [s.state]: (acc[s.state] || 0) + 1 }), {});

  return (
    <motion.div variants={stagger(0.06)} initial={reduce ? 'show' : 'hidden'} animate="show" className="space-y-7">
      {/* the board is the page's one heavy frame; the two panels under it
          step down to border-3 so it still reads as the focal object */}
      <motion.section variants={panelIn} className="relative mt-3 border-5 border-ink bg-white shadow-comic-xl">
        <div className="paper-strip relative border-b-3 border-ink px-5 pb-3 pt-[clamp(1.1rem,2.6vmin,1.6rem)]">
          <span className="caption absolute -top-4 left-5 text-base">Suspect board</span>
          <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
            <div>
              <h2 className="font-display text-3xl uppercase leading-none tracking-comic">Persons of interest</h2>
              <p className="mt-1.5 text-sm font-bold text-ink-soft">Every file you close moves people on this board. {counts.CLEARED || 0} cleared · {counts.SUSPECT || 0} suspect · {counts.PERSON_OF_INTEREST || 0} flagged · {(counts.PRIME_SUSPECT || 0) + (counts.ACCOMPLICE || 0)} named.</p>
            </div>
            <p className="text-sm font-bold text-ink-soft">
              {session?.completedCount || 0}/{session?.totalCount || 6} files closed
            </p>
          </div>
        </div>
        <div className="p-5">
          {/* variants on the li, .lift on the card inside it: Framer writes
              transform inline on the node it animates, which would kill the
              CSS hover. The caption and stamp stay on the li so they still
              overhang the card's edge. */}
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Suspects">
            {sorted.map((s) => {
              const meta = SUSPECT_STATE_META[s.state] || SUSPECT_STATE_META.UNKNOWN;
              const cleared = s.state === 'CLEARED';
              const n = linked.get(s.id) || 0;
              const tag = tagOf(s.id);
              const RoleIcon = roleIcon(s.role);
              const { chip: deptChip, Icon: DeptIcon } = dept(s.department);
              return (
                <motion.li key={s.id} layout={!reduce} variants={panelIn} className="relative">
                  {/* the id tag, clipped onto the card's top edge in its tint */}
                  <span className={cn('absolute -top-4 left-4 z-[2] inline-block border-3 border-ink px-4 py-2 font-display text-lg uppercase leading-none tracking-comic shadow-comic', tag.chip)}>{s.id}</span>
                  {meta.stamp ? (
                    <Stamp tone={meta.stamp} className="absolute -right-2 -top-3 z-[2] text-base">
                      {meta.label}
                    </Stamp>
                  ) : null}
                  {/* A cleared file greys the portrait and strikes the name; the
                      card itself stays at full opacity so its text stays
                      readable (opacity on the card put every line under AA). */}
                  <div className={cn('lift relative flex h-full flex-col border-3 border-ink p-4 pt-9 shadow-comic', meta.card, s.state === 'PRIME_SUSPECT' && 'border-red', s.state === 'ACCOMPLICE' && 'border-blue')}>
                    {/* the corner screentone in the tag's tint: the sheet's own
                        halftone, cut to a triangle. It owns the top-right corner
                        unless a state stamp does, and then drops to the
                        bottom-right, flipped so its right angle still hugs the
                        corner. */}
                    <span className={cn('pointer-events-none absolute h-10 w-10', meta.stamp ? 'bottom-1.5 right-1.5 [clip-path:polygon(100%_100%,0_100%,100%_0)]' : 'right-1.5 top-1.5 [clip-path:polygon(100%_0,0_0,100%_100%)]')} style={{ backgroundImage: `radial-gradient(circle, ${tag.hex} 2.3px, transparent 2.7px)`, backgroundSize: '9px 9px', backgroundPosition: '1px 1px' }} aria-hidden />
                    <div className="flex items-start gap-3">
                      <Portrait seed={s.id} size={96} tone={meta.portrait} flagged={s.state === 'PRIME_SUSPECT'} className={cn('shadow-comic-sm', cleared && 'opacity-70 grayscale')} />
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className={cn('font-display text-[1.65rem] uppercase leading-none tracking-comic', cleared ? 'text-ink-soft line-through decoration-red decoration-[3px]' : 'text-ink')}>{s.name}</p>
                        {/* role and department wrap rather than clip — the card
                            is a stretching grid cell, so a second line is free */}
                        <p className="mt-2 flex items-start gap-1.5 text-[0.95rem] font-bold leading-tight text-ink">
                          <RoleIcon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.4} aria-hidden />
                          <span className="min-w-0 break-words">{s.role}</span>
                        </p>
                        <p className={cn('mt-1.5 inline-flex max-w-full items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-bold leading-tight', deptChip)}>
                          <DeptIcon className="h-4 w-4 shrink-0" strokeWidth={2.4} aria-hidden />
                          <span className="min-w-0 break-words">{s.department}</span>
                        </p>
                      </div>
                    </div>
                    <p className="mt-4 inline-flex items-center gap-2 border-t-2 border-line pt-3 text-sm font-bold text-ink">
                      <Fingerprint className="h-5 w-5 shrink-0" strokeWidth={2.4} aria-hidden /> {n} piece{n === 1 ? '' : 's'} of evidence
                    </p>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </div>
      </motion.section>

      <div className="grid gap-7 xl:grid-cols-[1.2fr_1fr]">
        <motion.section variants={panelIn} className="relative mt-3 border-3 border-ink bg-white shadow-comic-lg">
          <div className="paper-strip relative border-b-3 border-ink px-5 pb-3 pt-[clamp(1.1rem,2.6vmin,1.6rem)]">
            <span className="caption-blue absolute -top-4 left-5 text-base">Evidence recovered</span>
            <div className="flex items-end justify-between gap-3 pt-2">
              <h2 className="font-display text-3xl uppercase leading-none tracking-comic">The record</h2>
              <p className="text-sm font-bold text-ink-soft">
                {evidence.length} piece{evidence.length === 1 ? '' : 's'} · <Lightbulb className="inline h-3.5 w-3.5" strokeWidth={2.4} aria-hidden /> {session?.hintsUsed || 0} hint{session?.hintsUsed === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div className="p-5">
            {evidence.length ? (
              <ul className="divide-y-2 divide-line">
                <AnimatePresence initial={false}>
                  {evidence.map((e) => (
                    <motion.li key={e.code} variants={listItem} initial={reduce ? 'show' : 'hidden'} animate="show" exit="exit" className="flash-blue py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="inline-flex items-center gap-2 font-display text-xl uppercase leading-none tracking-comic text-blue-deep">
                          <Fingerprint className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden /> {e.title || e.code.replace(/_/g, ' ')}
                        </p>
                        <span className="font-mono text-xs text-ink-soft">
                          {e.source ? `${e.source} · ` : ''}
                          {e.timestamp || ''}
                        </span>
                      </div>
                      {e.summary ? <p className="mt-1 text-base font-bold text-ink">{e.summary}</p> : null}
                      {e.relatedEntities?.length ? (
                        <p className="mt-1.5 flex flex-wrap gap-1.5">
                          {e.relatedEntities.map((id) => (
                            <span key={id} className="border-2 border-ink bg-white px-1.5 py-0.5 font-display text-sm uppercase tracking-comic">
                              {names.get(id) || id}
                            </span>
                          ))}
                        </p>
                      ) : null}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            ) : (
              <EmptyState compact icon={Fingerprint} title="Nothing recovered yet" body="Close FILE 01 to pin your first piece of evidence." />
            )}
            {connections.length ? (
              <div className="mt-4 border-t-3 border-ink pt-4">
                <p className="label">Connections</p>
                <ul className="mt-2 space-y-1.5">
                  {connections.map((c) => (
                    <li key={`${c.source}-${c.target}-${c.type}`} className="flex flex-wrap items-center gap-2 font-display text-xl uppercase tracking-comic text-ink">
                      <Link2 className="h-5 w-5 shrink-0 text-purple" strokeWidth={2.5} aria-hidden />
                      {names.get(c.source) || c.source} <span className="text-purple">→</span> {names.get(c.target) || c.target}
                      <span className="text-sm normal-case tracking-normal text-ink-soft">
                        {c.label || c.type.replace(/_/g, ' ')}
                        {c.timestamp ? ` · ${c.timestamp}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </motion.section>

        <motion.section variants={panelIn} className="relative mt-3 border-3 border-ink bg-white shadow-comic-lg">
          <div className="paper-strip relative border-b-3 border-ink px-5 pb-3 pt-[clamp(1.1rem,2.6vmin,1.6rem)]">
            <span className="caption absolute -top-4 left-5 text-base">Investigation log</span>
            <h2 className="pt-2 font-display text-3xl uppercase leading-none tracking-comic">What happened</h2>
          </div>
          <div className="p-5">
            {timeline.length ? (
              <ul className="max-h-[32rem] divide-y-2 divide-line overflow-y-auto">
                {/* keyed on append order + identity: the list is shown newest
                    first, so an index key would re-key every row on each event */}
                {timeline
                  .map((t, i) => ({ t, key: `${i}:${t.at}:${t.type}` }))
                  .reverse()
                  .map(({ t, key }) => (
                    <li key={key} className="flex items-start gap-3 py-2 text-sm font-bold">
                      <span className="inline-flex shrink-0 items-center gap-1 font-mono text-xs text-ink-soft">
                        <Clock className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> {formatTime(t.at)}
                      </span>
                      <span className="text-ink">
                        {t.type === 'SUSPECT_STATE' ? (
                          <>
                            {names.get(t.entity) || t.entity}: <span className="text-ink-soft">{SUSPECT_STATE_META[t.from]?.label || t.from || 'unknown'}</span> → <span className="bg-yellow px-1">{SUSPECT_STATE_META[t.to]?.label || t.to}</span>
                          </>
                        ) : t.type === 'EVIDENCE_DISCOVERED' ? (
                          <>
                            Evidence recorded: <span className="text-blue-deep">{String(t.evidence || '').replace(/_/g, ' ')}</span>
                          </>
                        ) : t.type === 'CONNECTION_FOUND' ? (
                          <>
                            Connection: {names.get(t.entity) || t.entity} → {names.get(t.to) || t.to}
                          </>
                        ) : t.type === 'FILE_COMPLETED' ? (
                          <>
                            File closed: <span className="text-green-deep">{String(t.file || '').replace('_', ' ')}</span>
                          </>
                        ) : t.type === 'HINT_USED' ? (
                          <>Hint used{t.delta ? ` (${t.delta})` : ''}</>
                        ) : t.type === 'WRONG_SUBMISSION' || t.type === 'FINAL_WRONG' ? (
                          <>Wrong finding{t.delta ? ` (${t.delta})` : ''}</>
                        ) : (
                          String(t.type).replace(/_/g, ' ').toLowerCase()
                        )}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <EmptyState compact icon={Clock} title="No events yet" body="Your closed files, evidence and board changes are logged here." />
            )}
          </div>
        </motion.section>
      </div>
    </motion.div>
  );
}
