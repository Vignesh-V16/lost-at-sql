import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Clapperboard, Play, FileText, Fingerprint, BookOpen } from 'lucide-react';
import { StoryIntro, introSeen, markIntroSeen } from '../../components/intro/StoryIntro.jsx';
import { FilePanel } from '../../components/play/FilePanel.jsx';
import { FinalPanel } from '../../components/play/FinalPanel.jsx';
import { EvidenceRecord } from '../../components/play/EvidenceRecord.jsx';
import { FileTabs } from '../../components/investigation/FileTabs.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { SystemLoader, ErrorState } from '../../components/ui/States.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useEvent } from '../../contexts/EventContext.jsx';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { investigationApi } from '../../services/api.js';
import { enterFullscreen } from '../../hooks/useProctor.js';
import { errorTitle, errorMessage } from '../../utils/errors.js';
import { cn } from '../../utils/cn.js';

/*
 * Investigate — the participant's one screen.
 *
 *   no session yet   → the story intro (motion comic) ending on Begin
 *   session          → the section rail (Case file · Evidence record ·
 *                        Story) stuck under the masthead as its second row,
 *                        then the case folder's tabs (FILE 01 … FINAL)
 *                        hanging off its seam into the red
 *
 * `/play` opens the current file, `/play/FILE_03` a specific one,
 * `/play/final` the final deduction. `?story=1` replays the intro.
 */
/* The case file is one working tab: the Chief's brief (collapsible once a
   result is in), the terminal and the finding — or, on the final file, the
   accusation. */
const SECTIONS = [
  { key: 'terminal', label: 'Case file', Icon: FileText },
  { key: 'evidence', label: 'Evidence record', Icon: Fingerprint },
  { key: 'story', label: 'Story', Icon: Clapperboard },
];

/*
 * The coordinator's notice, as the book's SFX pinned at the section rail's
 * right end: a starburst shouting the word. The rail is sticky, so it never
 * scrolls away, and growing the rail can never break a sticky offset.
 * Paused is cold — white on blue, the family of the frosted clock in the
 * masthead; over is white on red-deep. The sentence is not printed (the
 * frozen clock and the burst say it); it is read out once to screen
 * readers instead.
 */
const NOTICE = {
  paused: { burst: 'burst-blue', word: 'Paused!', text: 'Paused by the coordinator — your clock is frozen' },
  over: { burst: 'burst-deep', word: 'Case over!', text: 'The investigation is over — your results and evidence stay readable' },
};

export default function Investigate() {
  useDocumentTitle('Investigation');
  const reduce = useReducedMotion();
  const { code: rawCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { status } = useEvent();
  const { notify } = useToast();
  const { session, loading, error, refresh, start } = useSession();
  const briefing = useAsync(() => investigationApi.briefing(), []);
  const wantsStory = new URLSearchParams(location.search).get('story') === '1';
  const [story, setStory] = useState(() => wantsStory || !introSeen(user?.id));
  /* a new file opens on its case-file tab: PlayLayout keys its ErrorBoundary
     on the pathname, so every file change remounts this page and
     re-initialises this */
  const [section, setSection] = useState('terminal');

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (wantsStory) setStory(true);
  }, [wantsStory]);

  const code = String(rawCode || '').toUpperCase();

  const closeStory = () => {
    markIntroSeen(user?.id);
    setStory(false);
    // strip only ?story=1 — stay on the file that was open when the replay started
    if (wantsStory) navigate(location.pathname, { replace: true });
  };

  const begin = async () => {
    try {
      /* the one reliable user gesture for the full-screen request: asking
         later needs another click, which the shield then provides */
      await enterFullscreen().catch(() => false);
      const view = await start();
      markIntroSeen(user?.id);
      setStory(false);
      navigate(view.currentFileCode ? `/play/${view.currentFileCode}` : '/play', { replace: true });
    } catch (err) {
      notify({ tone: 'crimson', title: errorTitle(err), body: errorMessage(err) });
    }
  };

  /* the desk goes under these too, or the first paint of /play is the body's
     paper and the red arrives with the session — a flash */
  if (loading && !session && !briefing.data)
    return <><div className="desk" aria-hidden /><div className="mt-3 border-5 border-ink bg-white shadow-comic-xl"><SystemLoader label="Opening the case" /></div></>;
  if (error && !session)
    return <><div className="desk" aria-hidden /><div className="mt-3 border-5 border-ink bg-white shadow-comic-xl"><ErrorState error={error} onRetry={refresh} /></div></>;

  /* ── before the session: the story, then Begin ── */
  if (!session) {
    return (
      <>
        <div className="desk" aria-hidden />
        <AnimatePresence>
          {story ? (
            <motion.div key="story" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <StoryIntro investigator={user?.displayName || 'Investigator'} briefing={briefing.data} canBegin={status === 'live'} waitingMessage="The coordinator has not started the event yet. You can watch the story now — the button unlocks the moment it goes live." onBegin={begin} onClose={closeStory} />
            </motion.div>
          ) : null}
        </AnimatePresence>
        {!story ? (
          /* The one screen on this route nobody works in. The field is the
             desk's — the cover's red under its white halftone, already
             painted behind the page — so the stage carries no ground of its
             own (a second copy of the halftone would sit out of phase with
             the fixed one and show a seam): it centres the panel and keeps
             the one-pass sweep on arrival (JS-gated). -mt-6 -mb-6 cancel
             main's py-6 so the sweep runs from the masthead's seam to the
             footer's. No disc: the ground on this route turns for nobody. */
          <div className="play-band relative isolate -mb-6 -mt-6 flex flex-1 items-center justify-center overflow-hidden py-[clamp(1.5rem,4vmin,3.5rem)]">

            {reduce ? null : (
              <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-[36%] -skew-x-12" aria-hidden>
                <motion.div
                  initial={{ x: '-60%', opacity: 0 }}
                  animate={{ x: '160%', opacity: [0, 0.55, 0] }}
                  transition={{ duration: 1.5, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full w-full bg-gradient-to-r from-transparent via-white to-transparent mix-blend-overlay"
                />
              </div>
            )}

            <div className="relative z-10 w-full max-w-lg">
              <motion.div
                initial={reduce ? false : { opacity: 0, scale: 0.9, rotate: -2 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                className="relative border-5 border-ink text-center shadow-comic-xl"
              >
                <div className="paper-strip border-b-3 border-ink px-[clamp(1.1rem,3vmin,1.9rem)] pb-[clamp(0.9rem,2.4vmin,1.4rem)] pt-[clamp(1.5rem,3.6vmin,2.2rem)]">
                  <span className="caption absolute -top-4 left-1/2 -translate-x-1/2">Ready when you are</span>
                  <h1 className="mt-2 font-display text-[clamp(1.9rem,5vmin,2.75rem)] uppercase leading-none tracking-comic">The case is yours</h1>
                  <p className="mx-auto mt-2.5 max-w-sm text-base font-bold text-ink-soft">Press Begin to open FILE 01. Your 60-minute clock starts at that moment.</p>
                </div>
                <div className="bg-white px-[clamp(1.1rem,3vmin,1.9rem)] py-[clamp(1rem,2.6vmin,1.5rem)]">
                  <Button size="xl" variant="danger" icon={Play} onClick={begin} disabled={status !== 'live'}>
                    {briefing.data?.beginLabel || 'Begin Investigation'}
                  </Button>
                </div>
                <div className="paper-strip border-t-3 border-ink px-[clamp(1.1rem,3vmin,1.9rem)] py-[clamp(0.75rem,2vmin,1.15rem)]">
                  <Button variant="outline" size="sm" icon={Clapperboard} onClick={() => setStory(true)}>
                    Watch the story
                  </Button>
                </div>
              </motion.div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  /* ── the investigation ── */
  const isFinal = code === 'FINAL' || (!code && (session.allComplete || session.currentFileCode === 'FINAL'));
  const activeCode = isFinal ? 'FINAL' : code || session.currentFileCode || session.files[0]?.code;
  const file = session.files.find((f) => f.code === activeCode);
  if (activeCode !== 'FINAL' && (!file || file.status === 'locked')) {
    const fallback = session.currentFileCode && session.currentFileCode !== 'FINAL' ? `/play/${session.currentFileCode}` : '/play/final';
    return <Navigate to={fallback} replace />;
  }
  const evidenceCount = session.evidence?.length || 0;
  /* the same test EventGate lets the page through on — and never over a
     story replay, where the old band was not shown either */
  const notice = wantsStory ? null : status === 'paused' ? NOTICE.paused : status === 'ended' || status === 'archived' ? NOTICE.over : null;

  /* The desk is a sibling of the root, not a child: it lives at z -10 and
     any stacking context between it and #root would trap it in front of
     the page — so the root stays a bare div (no isolate, no transform, no
     space-y: the sticky rail must be a direct child of the tall scroller). */
  return (
    <>
      <div className="desk" aria-hidden />
      <div>
        <AnimatePresence>
          {story ? (
            <motion.div key="story" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <StoryIntro investigator={user?.displayName || 'Investigator'} briefing={briefing.data} canBegin={false} onClose={closeStory} autoplay />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* THE MASTHEAD'S SECOND ROW: the section rail, stuck to the header.
            `.play-chrome` pulls it up over the header's own 5px rule (its
            margin cancels main's pt-6 and that rule) and sticks it at
            `--masthead - 5px`, painting above the header, so header and rail
            read as ONE cream masthead closed by this row's border-b-5 — the
            cover's seam — at rest and while scrolling alike. A margin, not a
            stacking context: the root div above stays bare for .desk. Sticky,
            so the three sections stay reachable down a long result set; the
            case folder's tabs below scroll away under it. flex-wrap: the
            coordinator's burst sits at the row's right end and drops under
            the tabs only when even that does not fit. The tablist's
            pb-0.5 / pr-0.5 keep the open chip's 2px shadow inside its own
            scroll box. */}
        <div className="play-chrome play-band paper-strip border-b-5 border-ink">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-1 pt-1">
            <div role="tablist" aria-label="Sections" className="flex min-w-0 gap-1.5 overflow-x-auto no-scrollbar pb-0.5 pr-0.5">
              {SECTIONS.map(({ key, label, Icon }) => {
                const active = section === key;
                return (
                  <button key={key} role="tab" type="button" aria-selected={active} onClick={() => setSection(key)} className={cn('inline-flex shrink-0 items-center gap-1.5 border-3 border-ink px-3 py-1.5 font-display text-base uppercase leading-none tracking-comic transition-colors duration-150', active ? 'bg-yellow text-ink shadow-comic-sm' : 'bg-white text-ink hover:bg-yellow-light')}>
                    {/* the icon sits up when its section opens — the sign-in
                        page's iconPop, one pass, JS-gated, on its own node */}
                    <motion.span key={active ? 'open' : 'shut'} initial={reduce || !active ? false : { scale: 0.5, rotate: -14 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 18 }} className="inline-flex">
                      <Icon className="h-4 w-4" strokeWidth={2.6} aria-hidden />
                    </motion.span>
                    {label}
                    {key === 'evidence' && evidenceCount ? <span className={cn('ml-0.5 inline-flex h-4 min-w-4 items-center justify-center border-2 border-ink px-1 font-display text-xs', active ? 'bg-ink text-yellow' : 'bg-blue text-white')}>{evidenceCount}</span> : null}
                  </button>
                );
              })}
            </div>
            {notice ? <Notice notice={notice} reduce={reduce} /> : null}
          </div>
        </div>

        {/* THE CASE FOLDER'S TABS, hanging off the seam into the red: 01 … 05
            and FIN, each a chip on its own paper with no top rule — the seam
            is it. No lettering ever sits on the red itself. They deal out
            from under the seam once per page life (FileTabs keeps that flag
            itself, so the Begin stage's mount cannot spend it) and scroll
            away with the page. */}
        <FileTabs files={session.files} currentCode={activeCode} />

        <AnimatePresence mode="wait">
          <motion.div
            key={`${section}-${activeCode}`}
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 1 } : { opacity: 0, y: -6, transition: { duration: 0.15 } }}
            transition={reduce ? { duration: 0 } : { duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="pt-[clamp(0.9rem,2.4vmin,1.4rem)]"
          >
            {section === 'evidence' ? (
              <EvidenceRecord session={session} />
            ) : section === 'story' ? (
              <StoryTab briefing={briefing.data} investigator={user?.displayName} onPlay={() => setStory(true)} />
            ) : activeCode === 'FINAL' ? (
              <FinalPanel />
            ) : (
              <FilePanel key={activeCode} code={activeCode} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}

/*
 * The SFX: the coordinator's shout at the rail's right end. The sentence is
 * a visually hidden role="status" so it is still announced when the state
 * changes; on screen the burst and the frozen clock carry it.
 *
 * The burst is four nodes, and it has to be four: the motion span owns the
 * pop; the next span hangs it — -my-2.5 gives the row back 20px of the
 * burst's 52px so the rail does not grow, translate-y-1.5 pushes it down so
 * its lower spikes cross the seam onto the red at the folder's right end
 * (`flex`, not block, so no line-box strut pads it); .burst-wrap carries the
 * ink outline, the resting +7deg (.burst-tilt) and the rock (.burst-rock,
 * only without reduced motion); .burst is the fill. It is aria-hidden and,
 * as a flex item, blockified, so Framer's transform takes.
 */
function Notice({ notice, reduce }) {
  const { burst, word, text } = notice;
  return (
    <div className="ml-auto flex shrink-0 items-center">
      <span role="status" className="sr-only">
        {text}
      </span>
      <motion.span
        initial={reduce ? false : { opacity: 0, scale: 0.3, rotate: 20 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 480, damping: 16 }}
        className="pointer-events-none shrink-0"
        aria-hidden
      >
        <span className="-my-2.5 flex translate-y-1.5">
          <span className={cn('burst-wrap burst-tilt', !reduce && 'burst-rock')}>
            <span className={cn('burst', burst, 'px-3 py-2 text-lg sm:px-5 sm:py-3.5 sm:text-2xl')}>{word}</span>
          </span>
        </span>
      </motion.span>
    </div>
  );
}

/*
 * The story tab is ONE panel: the cover's yellow burst at panel scale — the
 * narrator's caption box under a printed ink halftone, in the masthead's
 * border-5 frame with its 10px shadow — holding both the film's replay and
 * the written briefing, split by an ink rule (a column rule from lg, a
 * horizontal one below). Ink on yellow is 11:1 for every word on it; the
 * white caption chip is the cover's "Issue #1" device, because yellow on
 * yellow is no chip at all. No disc, so nothing here needs `reduce`.
 */
function StoryTab({ briefing, investigator, onPlay }) {
  return (
    <div className="relative mt-3">
      {/* the caption tab lives OUTSIDE the overflow-hidden field, or the
          field clips it — PlayLayout's gate documents the same trap */}
      <span className="caption-white absolute -top-4 left-5 z-20 text-base">The story so far</span>
      <section className="relative isolate overflow-hidden border-5 border-ink bg-yellow shadow-comic-xl">
        <div className="dots pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <div className="relative z-10 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="flex flex-col items-start p-6">
            <h2 className="mt-2 font-display text-[clamp(2rem,5.5vmin,3.25rem)] uppercase leading-none tracking-comic text-ink">Operation: Black Cipher</h2>
            <div className="bubble mt-5 max-w-[34ch]">
              <p className="text-[clamp(0.9rem,1.85vmin,1.3rem)] font-bold leading-snug text-ink">The film and its fifteen panels — everything you were told before FILE 01. Replay it any time.</p>
            </div>
            {/* red on the yellow panel, not yellow-on-yellow — the field's own
                colour as the one thing to press. If the yellow/red/red stack
                vibrates in the browser, `variant="violet"` is the in-palette
                fallback (already mapped in Button.jsx). */}
            <Button className="mt-7" size="lg" variant="danger" icon={Clapperboard} onClick={onPlay}>
              Play the story
            </Button>
          </div>

          <div className="border-t-3 border-ink p-6 lg:border-l-3 lg:border-t-0">
            <span className="caption-deep text-sm">Classified briefing</span>
            <div className="mt-3 flex items-center gap-2">
              <BookOpen className="h-5 w-5" strokeWidth={2.5} aria-hidden />
              <h2 className="font-display text-3xl uppercase leading-none tracking-comic">The written version</h2>
            </div>
            <pre className="mt-4 max-w-[72ch] whitespace-pre-wrap font-body text-[1.02rem] font-bold leading-[1.75] text-ink">{(briefing?.text || '').replace('{{investigator}}', investigator || 'Investigator')}</pre>
          </div>
        </div>
      </section>
    </div>
  );
}
