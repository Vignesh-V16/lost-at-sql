import { useState } from 'react';
import { Play, Pause, Square } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { ConfirmDialog } from '../ui/Modal.jsx';
import { useEvent } from '../../contexts/EventContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { adminApi } from '../../services/api.js';
import { errorTitle, errorMessage } from '../../utils/errors.js';

/**
 * Start / pause / resume / end from the top bar. End requires confirmation.
 */
export function QuickControls({ size = 'sm' }) {
  const { status, applyEvent } = useEvent();
  const { notify } = useToast();
  const [busy, setBusy] = useState(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const run = async (name, fn, okTitle) => {
    setBusy(name);
    try {
      const state = await fn();
      applyEvent(state);
      notify({ tone: 'cyan', title: okTitle });
    } catch (err) {
      notify({ tone: 'crimson', title: errorTitle(err), body: errorMessage(err) });
    } finally {
      setBusy(null);
      setConfirmEnd(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {status === 'draft' || status === 'ready' || status === 'scheduled' ? (
        <Button size={size} icon={Play} loading={busy === 'start'} onClick={() => run('start', adminApi.startEvent, 'INVESTIGATION STARTED')}>
          Start
        </Button>
      ) : null}
      {status === 'live' ? (
        <Button size={size} variant="outline" icon={Pause} loading={busy === 'pause'} onClick={() => run('pause', adminApi.pauseEvent, 'INVESTIGATION PAUSED')}>
          Pause
        </Button>
      ) : null}
      {status === 'paused' ? (
        <Button size={size} icon={Play} loading={busy === 'resume'} onClick={() => run('resume', adminApi.resumeEvent, 'INVESTIGATION RESUMED')}>
          Resume
        </Button>
      ) : null}
      {status === 'live' || status === 'paused' ? (
        <Button size={size} variant="danger" icon={Square} onClick={() => setConfirmEnd(true)}>
          End
        </Button>
      ) : null}
      <ConfirmDialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        onConfirm={() => run('end', adminApi.endEvent, 'INVESTIGATION ENDED')}
        title="End the investigation?"
        description="Every active session expires immediately and scores are frozen. A finished event cannot be restarted — only reset (which wipes all progress)."
        confirmLabel="End event"
        loading={busy === 'end'}
      />
    </div>
  );
}
