import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StoryIntro } from '../components/intro/StoryIntro.jsx';

/*
 * /intro-preview — the story intro on its own, without signing in. Only
 * routed in development (see App.jsx): for checking the pages while the
 * lettering and motion in components/intro/fx.js are being worked on.
 *   ?page=7      open on page 7
 *   ?paused=1    do not auto-advance
 *   ?begin=1     show the participant's Begin button on the last page
 *                (&live=0 shows it locked, as before the event starts)
 */
export default function IntroPreview() {
  const [params] = useSearchParams();
  const page = Math.max(0, (Number(params.get('page')) || 1) - 1);
  const autoplay = params.get('paused') !== '1';
  const begin = params.get('begin') === '1';
  const live = params.get('live') !== '0';
  const key = useMemo(() => `${page}-${autoplay}-${begin}-${live}`, [page, autoplay, begin, live]);
  const onBegin = begin ? () => new Promise((r) => setTimeout(r, 1500)) : undefined;
  return <StoryIntro key={key} investigator="Investigator" briefing={begin ? { beginLabel: 'Begin Investigation', text: 'Preview briefing.' } : undefined} canBegin={live} waitingMessage="The coordinator has not started the event yet. You can watch the story now — the button unlocks the moment it goes live." onBegin={onBegin} onClose={() => window.history.back()} autoplay={autoplay} startAt={page} />;
}
