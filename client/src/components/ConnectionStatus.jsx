import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useEvent } from '../contexts/EventContext.jsx';
import { cn } from '../utils/cn.js';

export function ConnectionStatus({ className, compact = false }) {
  const { connection } = useEvent();
  const meta =
    {
      online: { Icon: Wifi, label: 'Connected', tone: 'text-green' },
      reconnecting: { Icon: RefreshCw, label: 'Reconnecting', tone: 'text-orange animate-spin' },
      offline: { Icon: WifiOff, label: 'Offline', tone: 'text-red' },
      idle: { Icon: WifiOff, label: 'Not connected', tone: 'text-ink-faint' },
    }[connection] || { Icon: WifiOff, label: 'Not connected', tone: 'text-ink-faint' };
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-display text-sm uppercase tracking-comic text-ink-soft', className)} title={meta.label}>
      <meta.Icon className={cn('h-3.5 w-3.5', meta.tone)} strokeWidth={2.6} aria-hidden />
      {!compact ? meta.label : null}
    </span>
  );
}
