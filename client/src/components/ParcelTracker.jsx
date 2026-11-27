import clsx from 'clsx';
import { Check, X } from 'lucide-react';
import { dayLabel, timeLabel } from '../lib/format.js';

const STEPS = [['placed', 'Placed'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['delivered', 'Delivered']];

/** The four-step lifecycle of one parcel, with the time each step happened. */
export default function ParcelTracker({ parcel, color = '#17181C' }) {
  if (parcel.status === 'cancelled') {
    const at = parcel.history.find((h) => h.status === 'cancelled')?.at;
    return <p className="flex items-center gap-2 rounded-lg bg-brand-light px-3 py-2 text-sm text-brand-dark"><X className="h-4 w-4" aria-hidden="true" />Cancelled{at && ` ${dayLabel(at).toLowerCase()}`}{parcel.refund?.amount ? ', refunded in full' : ''}</p>;
  }
  const reached = STEPS.findIndex(([s]) => s === parcel.status);
  const when = (s) => parcel.history.find((h) => h.status === s)?.at;
  return (
    <ol className="grid grid-cols-4" aria-label={`Parcel status: ${parcel.status}`}>
      {STEPS.map(([key, label], i) => {
        const done = i <= reached;
        const at = when(key);
        return (
          <li key={key} className="relative flex flex-col items-center text-center" aria-current={i === reached ? 'step' : undefined}>
            {i > 0 && <span className="absolute right-1/2 top-3 h-[3px] w-full -translate-y-1/2" style={{ background: i <= reached ? color : '#E2E0DA' }} aria-hidden="true" />}
            <span className={clsx('relative z-10 grid h-6 w-6 place-items-center rounded-full ring-4 ring-white transition-colors', done ? 'text-white' : 'bg-line text-ink-faint')} style={done ? { background: color } : undefined}>
              {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            </span>
            <span className={clsx('mt-1.5 text-xs font-semibold', done ? 'text-ink' : 'text-ink-faint')}>{label}</span>
            <span className="text-2xs tabular text-ink-faint">{at ? `${dayLabel(at)}, ${timeLabel(at)}` : ' '}</span>
          </li>
        );
      })}
    </ol>
  );
}
