import { Link } from 'react-router-dom';
import { cn } from '../utils/cn.js';

/*
 * Site logo — the LOST AT SQL artwork supplied for the event, framed like
 * a comic masthead.
 *
 *   size="nav"        compact wordmark for the top bars (default)
 *   size="masthead"   the same wordmark, printed larger for a cover's masthead
 *   size="hero"       large, for the cover / login
 *   size="rail"       the icon only
 *   compact           logo only (no issue tagline)
 */
export function Logo({ to = '/', compact = false, size = 'nav', className, tagline = 'Issue #1 · Operation: Black Cipher' }) {
  const hero = size === 'hero';
  const rail = size === 'rail';
  const masthead = size === 'masthead';
  return (
    <Link to={to} className={cn('group inline-flex items-center gap-3', className)} aria-label="LOST AT SQL — home">
      <img
        src={hero || masthead ? '/logo.png' : rail ? '/favicon-64.png' : '/logo-sm.png'}
        alt="LOST AT SQL"
        draggable={false}
        className={cn('shrink-0 select-none object-contain transition-transform duration-300 ease-bouncy group-hover:-rotate-2 group-hover:scale-[1.04]', hero ? 'w-[min(80vw,560px)]' : rail ? 'h-10 w-10 border-2 border-ink bg-white' : masthead ? 'h-12 w-auto' : 'h-10 w-auto')}
      />
      {!compact && !hero && !masthead ? <span className="hidden font-display text-base uppercase tracking-comic text-ink-soft sm:block">{tagline}</span> : null}
    </Link>
  );
}

/** Non-link variant for places that already sit inside a link or a heading. */
export function LogoMark({ size = 'hero', className }) {
  return <img src={size === 'hero' ? '/logo.png' : '/logo-sm.png'} alt="LOST AT SQL" draggable={false} className={cn('select-none object-contain', size === 'hero' ? 'w-[min(80vw,560px)]' : 'h-10 w-auto', className)} />;
}
