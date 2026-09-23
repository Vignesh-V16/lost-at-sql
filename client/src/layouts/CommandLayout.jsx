import { useOutlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AppShell } from '../components/AppShell.jsx';
import { Timer } from '../components/Timer.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useEvent } from '../contexts/EventContext.jsx';
import { useIsMobile } from '../hooks/useMediaQuery.js';
import { COORDINATOR_NAV, EVENT_STATUS_META } from '../data/constants.js';
import { pageTransition } from '../animations/variants.js';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';
import { QuickControls } from '../components/command/QuickControls.jsx';

function Identity() {
  const { user } = useAuth();
  return (
    <div className="min-w-0">
      <p className="label text-red">Coordinator</p>
      <p className="truncate font-display text-2xl uppercase leading-none tracking-comic text-ink">{user?.displayName}</p>
      <p className="mt-1 text-sm font-bold text-ink-soft">{user?.title || 'Command center'}</p>
    </div>
  );
}

function TopBar() {
  const isMobile = useIsMobile();
  const { status, event } = useEvent();
  const meta = EVENT_STATUS_META[status] || EVENT_STATUS_META.draft;
  if (isMobile) {
    return (
      <div className="flex items-center justify-end gap-3">
        <Badge tone={meta.tone} pulse={status === 'live'}>
          {meta.label}
        </Badge>
        <Timer size="sm" showLabel={false} />
      </div>
    );
  }
  return (
    <>
      <div className="hidden min-w-0 items-center gap-6 lg:flex">
        <div className="min-w-0">
          <p className="label text-red">Command center</p>
          <p className="truncate font-display text-2xl uppercase leading-none tracking-comic">{event?.name || 'LOST AT SQL'}</p>
        </div>
        <div>
          <p className="label">Status</p>
          <Badge tone={meta.tone} pulse={status === 'live'} className="mt-0.5">
            {meta.label}
          </Badge>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-5">
        <QuickControls />
        <Timer size="sm" showLabel={false} />
      </div>
    </>
  );
}

export default function CommandLayout() {
  const location = useLocation();
  const outlet = useOutlet();
  return (
    <AppShell nav={COORDINATOR_NAV} topbar={<TopBar />} identity={<Identity />} accent="crimson">
      <div className="mx-auto w-full max-w-[1600px]">
        <ErrorBoundary>
          <AnimatePresence mode="wait">
            <motion.div key={location.pathname} variants={pageTransition} initial="initial" animate="animate" exit="exit">
              {outlet}
            </motion.div>
          </AnimatePresence>
        </ErrorBoundary>
      </div>
    </AppShell>
  );
}
