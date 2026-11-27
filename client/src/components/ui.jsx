import { cloneElement, isValidElement, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X, LoaderCircle } from 'lucide-react';
import { initials } from '../lib/format.js';

export function Spinner({ className }) {
  return <LoaderCircle className={clsx('h-4 w-4 animate-spin', className)} aria-hidden="true" />;
}

export function PageLoader({ label = 'Loading' }) {
  return (
    <div className="grid min-h-[40vh] place-items-center" role="status" aria-label={label}>
      <Spinner className="h-6 w-6 text-brand" />
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={clsx('skeleton', className)} aria-hidden="true" />;
}

/** Pencil-yellow progress on a ruled track. */
export function ProgressBar({ value = 0, className, tone = 'ink', label }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-ink/10', className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'Progress'}>
      <div className={clsx('h-full rounded-full transition-[width] duration-300 ease-out', tone === 'brand' ? 'bg-brand' : tone === 'go' ? 'bg-go' : tone === 'star' ? 'bg-star' : 'bg-ink')} style={{ width: `${pct}%` }} />
    </div>
  );
}

const AVATAR_TONES = ['bg-ink text-white', 'bg-brand text-white', 'bg-[#2F6690] text-white', 'bg-[#31572C] text-white', 'bg-[#A23B72] text-white', 'bg-star text-ink'];
export function Avatar({ name = '', size = 36, className }) {
  const tone = AVATAR_TONES[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span className={clsx('inline-grid shrink-0 select-none place-items-center rounded-full font-semibold', tone, className)} style={{ width: size, height: size, fontSize: Math.max(11, size * 0.38) }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

const STATUS_STYLES = {
  active: 'bg-go-light text-go', approved: 'bg-go-light text-go', delivered: 'bg-go-light text-go', transferred: 'bg-go-light text-go', paid: 'bg-go-light text-go',
  draft: 'bg-paper text-ink-soft ring-1 ring-line-strong', pending: 'bg-star-light text-star-deep', 'awaiting payment': 'bg-star-light text-star-deep',
  placed: 'bg-star-light text-star-deep', packed: 'bg-[#E6EEF6] text-[#24527A]', shipped: 'bg-[#EDE9F7] text-[#4B3B8F]',
  archived: 'bg-paper text-ink-faint ring-1 ring-line', cancelled: 'bg-brand-light text-brand', suspended: 'bg-brand-light text-brand', reversed: 'bg-brand-light text-brand', expired: 'bg-paper text-ink-faint ring-1 ring-line', failed: 'bg-brand-light text-brand', none: 'bg-paper text-ink-faint ring-1 ring-line',
  customer: 'bg-paper text-ink-soft ring-1 ring-line-strong', vendor: 'bg-star-light text-star-deep', admin: 'bg-ink text-white',
};
export function StatusTag({ status, children, className }) {
  return (
    <span className={clsx('tag', STATUS_STYLES[status] || 'bg-paper text-ink-soft ring-1 ring-line-strong', className)}>
            {children || status?.charAt(0).toUpperCase() + status?.slice(1)}
    </span>
  );
}

export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="grid place-items-center rounded-panel border border-dashed border-line-strong bg-white/70 px-6 py-14 text-center">
      {Icon && <Icon className="mb-3 h-7 w-7 text-ink-faint" strokeWidth={1.6} aria-hidden="true" />}
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <p className="mt-1.5 max-w-md text-sm text-ink-faint">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorNote({ children, className }) {
  if (!children) return null;
  return <div role="alert" className={clsx('rounded-lg border border-brand/25 bg-brand-light px-3.5 py-2.5 text-sm text-brand-dark', className)}>{children}</div>;
}

/**
 * A labelled form control. The label is tied to the control by id, and the
 * hint or error is linked with aria-describedby, so screen readers announce
 * the label as the name and the hint as extra description.
 */
export function Field({ label, hint, error, children, className }) {
  const id = useId();
  const noteId = `${id}-note`;
  const child = isValidElement(children)
    ? cloneElement(children, { id: children.props.id || id, 'aria-describedby': error || hint ? noteId : undefined, 'aria-invalid': error ? true : undefined })
    : children;
  return (
    <div className={clsx('block', className)}>
      {label && <label htmlFor={children?.props?.id || id} className="label">{label}</label>}
      {child}
      {error ? <span id={noteId} className="mt-1.5 block text-xs font-medium text-brand">{error}</span> : hint ? <span id={noteId} className="hint block">{hint}</span> : null}
    </div>
  );
}

/** Segmented control for small sets of options. */
export function Segmented({ value, onChange, options, className, size = 'md', label }) {
  return (
    <div role="tablist" aria-label={label} className={clsx('inline-flex rounded-lg bg-ink/[.06] p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} type="button" role="tab" aria-selected={active} onClick={() => onChange(o.value)}
            className={clsx('rounded-md font-semibold transition-colors duration-100', size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3.5 text-[13px]',
              active ? 'bg-white text-ink shadow-sm' : 'text-ink-faint hover:text-ink')}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector('input, textarea, select, button:not([data-close])')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-end overflow-y-auto sm:place-items-center sm:p-6">
      <div className="fixed inset-0 animate-fade bg-night/55" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={clsx('relative w-full animate-pop rounded-t-panel bg-white shadow-pop sm:rounded-panel', width)}>
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" data-close onClick={onClose} className="btn-ghost btn-icon -mr-2" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-paper/70 px-5 py-3.5 sm:rounded-b-panel">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function Confirm({ open, onClose, onConfirm, title, children, confirmLabel = 'Delete', busy, tone = 'danger' }) {
  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-md"
      footer={<>
        <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
        <button type="button" className={tone === 'danger' ? 'btn bg-brand text-white hover:bg-brand-dark' : 'btn-primary'} onClick={onConfirm} disabled={busy}>{busy && <Spinner />}{confirmLabel}</button>
      </>}>
      <p className="text-sm leading-relaxed text-ink-soft">{children}</p>
    </Modal>
  );
}
