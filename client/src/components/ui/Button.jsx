import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { cn } from '../../utils/cn.js';

/*
 * Comic buttons: thick ink border, hard offset shadow. Hover lifts the
 * button off the page (bigger shadow); pressing pushes it flat into the
 * paper (shadow gone). `primary` is yellow, `danger` red, `violet` purple,
 * `outline` white, `ghost` borderless, `subtle` paper.
 */
const VARIANTS = {
  primary: 'border-3 border-ink bg-yellow text-ink shadow-comic hover:bg-yellow-deep/90',
  danger: 'border-3 border-ink bg-red text-white shadow-comic hover:bg-red-deep',
  violet: 'border-3 border-ink bg-purple text-white shadow-comic hover:bg-purple-deep',
  blue: 'border-3 border-ink bg-blue text-white shadow-comic hover:bg-blue-deep',
  outline: 'border-3 border-ink bg-white text-ink shadow-comic hover:bg-yellow-light',
  ghost: 'border-3 border-transparent bg-transparent text-ink-soft hover:border-ink hover:bg-white hover:text-ink',
  subtle: 'border-3 border-ink bg-paper text-ink shadow-comic-sm hover:bg-white',
};

const SIZES = {
  sm: 'h-9 px-3 text-base',
  md: 'h-11 px-4 text-lg',
  lg: 'h-12 px-6 text-2xl',
  xl: 'h-16 px-8 text-3xl',
};

const MOTION = 'transition-all duration-150 ease-bouncy hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-comic-lg active:translate-x-1 active:translate-y-1 active:shadow-none';
const MOTION_GHOST = 'transition-all duration-150 active:translate-y-0.5';

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled, icon: Icon, iconRight: IconRight, className, children, to, type = 'button', ...rest },
  ref,
) {
  const classes = cn(
    'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-display uppercase leading-none tracking-comic',
    variant === 'ghost' ? MOTION_GHOST : MOTION,
    'disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-comic',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
  const content = (
    <>
      {loading ? <LoaderCircle className="h-[1em] w-[1em] animate-spin" aria-hidden /> : Icon ? <Icon className="h-[1em] w-[1em]" strokeWidth={2.5} aria-hidden /> : null}
      <span>{children}</span>
      {IconRight ? <IconRight className="h-[1em] w-[1em]" strokeWidth={2.5} aria-hidden /> : null}
    </>
  );
  if (to) {
    return (
      <Link ref={ref} to={to} className={classes} aria-disabled={disabled || loading} {...rest}>
        {content}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
});

export function IconButton({ label, icon: Icon, className, size = 'md', tone = 'ink', ...rest }) {
  const tones = { ink: 'hover:bg-yellow-light', red: 'hover:bg-red-light hover:text-red', blue: 'hover:bg-blue-light hover:text-blue' };
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center border-3 border-ink bg-white text-ink shadow-comic-sm transition-all duration-150 hover:-translate-x-px hover:-translate-y-px hover:shadow-comic active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-40',
        size === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
        tones[tone],
        className,
      )}
      {...rest}
    >
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={2.5} aria-hidden />
    </button>
  );
}
