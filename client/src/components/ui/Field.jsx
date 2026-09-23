import { forwardRef, useId } from 'react';
import { cn } from '../../utils/cn.js';

/*
 * Form primitives. A display-lettered label, the control with a thick
 * ink border, and an optional hint / error line, wired with aria.
 */
function Wrapper({ id, label, hint, error, className, children, required }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={id} className="label">
          {label}
          {required ? <span className="ml-1 text-red">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        // red-deep, not red: #e5322d on white is 4.35:1, under AA for text this size
        <p id={`${id}-error`} role="alert" className="font-display text-base uppercase tracking-comic text-red-deep">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/*
 * `trailing` puts a control inside the field's right edge — a reveal toggle, a
 * unit, a clear button. It is rendered in a `relative` box with the input, so
 * the control positions itself absolutely against the field rather than the
 * whole wrapper, and the input gains right padding so text cannot run under it.
 */
export const Input = forwardRef(function Input({ label, hint, error, className, inputClassName, required, trailing, ...rest }, ref) {
  const auto = useId();
  const id = rest.id || auto;
  const field = (
    <input ref={ref} id={id} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} className={cn('field', error && 'field-error', trailing && 'pr-14', inputClassName)} required={required} {...rest} />
  );
  return (
    <Wrapper id={id} label={label} hint={hint} error={error} className={className} required={required}>
      {trailing ? (
        <div className="relative">
          {field}
          {trailing}
        </div>
      ) : field}
    </Wrapper>
  );
});

export const Textarea = forwardRef(function Textarea({ label, hint, error, className, rows = 4, required, ...rest }, ref) {
  const auto = useId();
  const id = rest.id || auto;
  return (
    <Wrapper id={id} label={label} hint={hint} error={error} className={className} required={required}>
      <textarea ref={ref} id={id} rows={rows} aria-invalid={Boolean(error) || undefined} className={cn('field resize-y', error && 'field-error')} required={required} {...rest} />
    </Wrapper>
  );
});

export const Select = forwardRef(function Select({ label, hint, error, className, options = [], placeholder, required, ...rest }, ref) {
  const auto = useId();
  const id = rest.id || auto;
  return (
    <Wrapper id={id} label={label} hint={hint} error={error} className={className} required={required}>
      <select
        ref={ref}
        id={id}
        aria-invalid={Boolean(error) || undefined}
        className={cn('field appearance-none bg-no-repeat pr-9', error && 'field-error')}
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='none' stroke='%23141414' stroke-width='3'%3E%3Cpath d='M2 5l5 5 5-5'/%3E%3C/svg%3E\")", backgroundPosition: 'right 0.75rem center' }}
        required={required}
        {...rest}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrapper>
  );
});

export function Toggle({ label, checked, onChange, hint, disabled, className }) {
  const id = useId();
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <div>
        <label htmlFor={id} className="label cursor-pointer text-ink">
          {label}
        </label>
        {hint ? <p className="mt-0.5 text-sm text-ink-soft">{hint}</p> : null}
      </div>
      <button id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={cn('relative h-7 w-14 shrink-0 border-3 border-ink shadow-comic-sm transition-colors disabled:opacity-40', checked ? 'bg-green' : 'bg-white')}>
        <span className={cn('absolute top-0.5 h-4 w-5 border-2 border-ink bg-white transition-all duration-200 ease-bouncy', checked ? 'left-[30px]' : 'left-0.5')} />
      </button>
    </div>
  );
}
