import { cn } from '../../utils/cn.js';

/*
 * Panel — one comic panel. White paper, thick ink border, hard shadow.
 * Optional header row: a `label` rendered as a yellow caption box hanging
 * from the top edge, a `title` in display lettering, and `actions`.
 *
 *   tone   colours the caption: neutral (yellow), cyan, crimson, violet, amber
 *   paper  cream body instead of white
 *   raised deeper shadow
 *   bracket kept for compatibility (no-op)
 */
const CAPTION = {
  neutral: 'caption',
  amber: 'caption',
  cyan: 'caption-blue',
  crimson: 'caption-red',
  violet: 'caption-blue',
};

export function Panel({ as: Tag = 'section', tone = 'neutral', label, title, actions, className, bodyClassName, children, raised = false, paper = false, bracket: _bracket, ...rest }) {
  return (
    <Tag className={cn(raised ? 'panel-raised' : paper ? 'panel-paper' : 'panel', label && 'mt-3', className)} {...rest}>
      {label ? (
        <span className={cn(CAPTION[tone] || 'caption', 'absolute -top-4 left-4 z-[1] text-[0.95rem]')}>{label}</span>
      ) : null}
      {title || actions ? (
        <header className={cn('flex items-center justify-between gap-3 border-b-3 border-ink px-4 py-3', label && 'pt-5')}>
          <div className="min-w-0">{title ? <h3 className="truncate font-display text-2xl uppercase leading-none tracking-comic text-ink">{title}</h3> : null}</div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : label ? (
        <div className="h-3" aria-hidden />
      ) : null}
      <div className={cn('text-ink', bodyClassName)}>{children}</div>
    </Tag>
  );
}
