import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, TriangleAlert } from 'lucide-react';
import { Button } from './Button.jsx';
import { Input } from './Field.jsx';
import { cn } from '../../utils/cn.js';

/*
 * Modal — a comic panel slammed onto a dotted backdrop. Focus-trapped,
 * rendered in a portal. Escape and backdrop close it unless `persistent`.
 */
export function Modal({ open, onClose, title, label, tone = 'neutral', size = 'md', persistent = false, children, footer }) {
  const reduce = useReducedMotion();
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const persistentRef = useRef(persistent);
  onCloseRef.current = onClose;
  persistentRef.current = persistent;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape' && !persistentRef.current) onCloseRef.current?.();
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = panel.querySelector('[data-autofocus]') || panel.querySelector('input, select, textarea, button:not([aria-label="Close dialog"])') || panel.querySelector('button');
      target?.focus();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      clearTimeout(t);
      previous?.focus?.();
    };
  }, [open]);

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  const captions = { neutral: 'caption', cyan: 'caption-blue', crimson: 'caption-red', violet: 'caption-blue', amber: 'caption' };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !persistent) onClose?.();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'modal-title' : undefined}
            initial={reduce ? false : { opacity: 0, y: 30, scale: 0.9, rotate: -2 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            className={cn('panel-raised flex max-h-[92dvh] w-full flex-col overflow-visible', widths[size])}
          >
            {label ? <span className={cn(captions[tone] || 'caption', 'absolute -top-4 left-4 text-[0.95rem]')}>{label}</span> : null}
            <header className="flex items-start justify-between gap-4 border-b-3 border-ink px-5 pb-3 pt-6">
              {title ? (
                <h2 id="modal-title" className="font-display text-3xl uppercase leading-none tracking-comic text-ink">
                  {title}
                </h2>
              ) : (
                <span />
              )}
              {!persistent ? (
                <button type="button" onClick={onClose} aria-label="Close dialog" className="-mr-1 -mt-2 border-2 border-ink bg-white p-1 text-ink shadow-comic-sm transition-transform hover:rotate-90">
                  <X className="h-4 w-4" strokeWidth={3} />
                </button>
              ) : null}
            </header>
            <div className="overflow-y-auto px-5 py-4 text-ink">{children}</div>
            {footer ? <footer className="flex flex-wrap items-center justify-end gap-2 border-t-3 border-ink bg-paper px-5 py-3">{footer}</footer> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

/*
 * ConfirmDialog — for dangerous actions. When `confirmWord` is set the
 * user must type it before the action is enabled.
 */
export function ConfirmDialog({ open, onClose, onConfirm, title, label = 'Hold on!', description, confirmLabel = 'Confirm', confirmWord, tone = 'crimson', loading = false }) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);
  const ready = !confirmWord || typed.trim().toUpperCase() === confirmWord.toUpperCase();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      label={label}
      tone={tone}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Never mind
          </Button>
          <Button variant={tone === 'crimson' ? 'danger' : 'primary'} onClick={onConfirm} disabled={!ready} loading={loading} data-autofocus={!confirmWord || undefined}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <TriangleAlert className={cn('mt-0.5 h-6 w-6 shrink-0', tone === 'crimson' ? 'text-red' : 'text-blue')} strokeWidth={2.5} aria-hidden />
        <div className="space-y-3 text-base text-ink-soft">
          <p>{description}</p>
          {confirmWord ? <Input label={`Type ${confirmWord} to proceed`} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={confirmWord} autoComplete="off" data-autofocus /> : null}
        </div>
      </div>
    </Modal>
  );
}
