import clsx from 'clsx';
import { money } from '../lib/format.js';

/** The till receipt: totals are always shown as a torn-off slip. */
export function Receipt({ title = 'Summary', rows, total, footer, className, children }) {
  return (
    <div className={clsx('drop-shadow-[0_8px_20px_rgba(23,24,28,.10)]', className)}>
      <div className="receipt rounded-t-panel px-5 pt-5">
        <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-ink-faint">{title}</p>
        <div className="tear" />
        <div className="space-y-2">
          {rows.filter(Boolean).map((r) => (
            <div key={r.label} className={clsx('receipt-row', r.tone === 'go' && 'text-go', r.muted && 'text-ink-faint')}>
              <span className="min-w-0 truncate">{r.label}</span><span className="dots" /><span className="amt">{typeof r.value === 'number' ? money(r.value) : r.value}</span>
            </div>
          ))}
        </div>
        <div className="tear" />
        <div className="flex items-baseline justify-between"><span className="text-sm font-bold">Total</span><span className="sign text-3xl tabular">{money(total)}</span></div>
        {children}
        {footer && <p className="mt-3 text-center text-xs text-ink-faint">{footer}</p>}
      </div>
    </div>
  );
}
