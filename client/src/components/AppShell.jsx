import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X, LogOut, ChevronsLeft, ChevronsRight, Ellipsis } from 'lucide-react';
import { Logo } from './Logo.jsx';
import { Icon } from './ui/Misc.jsx';
import { ConnectionStatus } from './ConnectionStatus.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useIsMobile, useIsTablet } from '../hooks/useMediaQuery.js';
import { cn } from '../utils/cn.js';

/*
 * AppShell — shared chrome for both roles, drawn as a comic page.
 *
 * Desktop  : a cream sidebar of caption-style links + a white top strip.
 * Tablet   : collapsible icon rail.
 * Mobile   : compact top bar + bottom tab bar (first four items) + "more" sheet.
 *
 * `accent` picks the colour of the active link: cyan → blue, crimson → red.
 */
export function AppShell({ nav, topbar, children, identity, accent = 'cyan' }) {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const [collapsed, setCollapsed] = useState(false);
  const [sheet, setSheet] = useState(false);
  const location = useLocation();
  const { logout } = useAuth();

  useEffect(() => {
    setSheet(false);
  }, [location.pathname]);

  useEffect(() => {
    if (isTablet && !isMobile) setCollapsed(true);
    if (!isTablet) setCollapsed(false);
  }, [isTablet, isMobile]);

  const active = accent === 'crimson' ? 'bg-red text-white' : accent === 'violet' ? 'bg-purple text-white' : 'bg-yellow text-ink';
  const links = nav.filter((item) => !item.heading);

  const renderLink = (item, { rail = false, bottom = false } = {}) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 font-display uppercase leading-none tracking-comic transition-all duration-150 ease-bouncy',
          bottom ? 'flex-col gap-1 px-1 py-2 text-[0.7rem]' : rail ? 'mx-2 my-1 justify-center border-3 px-0 py-2.5 text-base' : 'mx-3 my-1 border-3 px-3 py-2.5 text-lg',
          isActive
            ? cn(active, !bottom && 'border-ink shadow-comic-sm', bottom && 'text-ink')
            : cn('text-ink-soft', !bottom && 'border-transparent hover:border-ink hover:bg-white hover:text-ink hover:shadow-comic-sm', bottom && 'hover:text-ink'),
        )
      }
      title={rail ? item.label : undefined}
    >
      {({ isActive }) => (
        <>
          <span className={cn('inline-flex items-center justify-center', bottom && isActive && 'border-2 border-ink bg-yellow px-2 py-0.5')}>
            <Icon name={item.icon} className={cn('h-5 w-5 shrink-0 transition-transform duration-200 ease-bouncy group-hover:-rotate-6 group-hover:scale-110')} />
          </span>
          {!rail ? <span className={cn(bottom && 'truncate')}>{item.label}</span> : null}
        </>
      )}
    </NavLink>
  );

  if (isMobile) {
    const primary = links.slice(0, 4);
    const rest = links.slice(4);
    return (
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-40 border-b-3 border-ink bg-white">
          <div className="flex h-14 items-center justify-between gap-3 px-3">
            <Logo compact />
            <div className="min-w-0 flex-1">{topbar}</div>
            <button type="button" aria-label="Open menu" onClick={() => setSheet(true)} className="border-2 border-ink bg-yellow p-1.5 text-ink shadow-comic-sm">
              <Menu className="h-5 w-5" strokeWidth={2.6} />
            </button>
          </div>
        </header>
        <main className="flex-1 px-3 pb-24 pt-5">{children}</main>
        <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t-3 border-ink bg-white safe-bottom">
          {primary.map((item) => renderLink(item, { bottom: true }))}
          <button type="button" onClick={() => setSheet(true)} className="flex flex-col items-center gap-1 px-1 py-2 font-display text-[0.7rem] uppercase tracking-comic text-ink-soft">
            <Ellipsis className="h-5 w-5" strokeWidth={2.4} />
            More
          </button>
        </nav>
        <AnimatePresence>
          {sheet ? (
            <motion.div className="fixed inset-0 z-50 bg-ink/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheet(false)}>
              <motion.div
                role="dialog"
                aria-label="Navigation"
                className="absolute inset-x-0 bottom-0 border-t-3 border-ink bg-paper pb-6 safe-bottom"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 400, damping: 38 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b-3 border-ink px-4 py-3">
                  <div className="min-w-0">{identity}</div>
                  <button type="button" aria-label="Close menu" onClick={() => setSheet(false)} className="border-2 border-ink bg-white p-1.5 text-ink shadow-comic-sm">
                    <X className="h-5 w-5" strokeWidth={2.6} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1 p-2">{[...primary, ...rest].map((item) => renderLink(item))}</div>
                <div className="flex items-center justify-between px-4 pt-2">
                  <ConnectionStatus />
                  <button type="button" onClick={logout} className="inline-flex items-center gap-2 font-display text-base uppercase tracking-comic text-ink-soft hover:text-red">
                    <LogOut className="h-4 w-4" strokeWidth={2.5} /> Sign out
                  </button>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      <aside className={cn('sticky top-0 flex h-dvh shrink-0 flex-col border-r-3 border-ink bg-paper transition-[width] duration-300', collapsed ? 'w-[4.5rem]' : 'w-64')} aria-label="Sidebar">
        <div className={cn('flex h-16 items-center border-b-3 border-ink bg-white', collapsed ? 'justify-center' : 'px-4')}>
          <Logo compact size={collapsed ? 'rail' : 'nav'} />
        </div>
        <nav aria-label="Primary" className="flex-1 overflow-y-auto py-3">
          {nav.map((item, i) =>
            item.heading ? (
              collapsed ? (
                i > 0 ? <span key={`h-${item.heading}`} className="mx-3 my-2 block border-t-2 border-ink" aria-hidden /> : null
              ) : (
                <p key={`h-${item.heading}`} className={cn('mx-3 mb-1 border-b-2 border-ink pb-1 font-display text-sm uppercase tracking-widest2 text-ink-faint', i > 0 ? 'mt-5' : 'mt-1')}>
                  {item.heading}
                </p>
              )
            ) : (
              renderLink(item, { rail: collapsed })
            ),
          )}
        </nav>
        <div className={cn('border-t-3 border-ink bg-white', collapsed ? 'p-2' : 'p-4')}>
          {!collapsed ? <div className="mb-3">{identity}</div> : null}
          <div className={cn('flex items-center', collapsed ? 'flex-col gap-2' : 'justify-between')}>
            <ConnectionStatus compact={collapsed} />
            <button type="button" onClick={logout} title="Sign out" className="inline-flex items-center gap-2 font-display text-base uppercase tracking-comic text-ink-soft transition-colors hover:text-red">
              <LogOut className="h-4 w-4" strokeWidth={2.5} /> {!collapsed ? 'Sign out' : null}
            </button>
          </div>
        </div>
        <button type="button" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="absolute -right-3.5 top-20 flex h-7 w-7 items-center justify-center border-2 border-ink bg-yellow text-ink shadow-comic-sm transition-transform hover:scale-110">
          {collapsed ? <ChevronsRight className="h-3.5 w-3.5" strokeWidth={3} /> : <ChevronsLeft className="h-3.5 w-3.5" strokeWidth={3} />}
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b-3 border-ink bg-white">
          <div className="flex h-16 items-center gap-4 px-6">{topbar}</div>
        </header>
        <main className="flex-1 px-6 py-7">{children}</main>
      </div>
    </div>
  );
}
