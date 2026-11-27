import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { money, moneyShort } from '../lib/format.js';

const short = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * Daily bars, optionally split into two stacked parts (for example shop
 * earnings and platform commission). Long ranges are grouped into weeks.
 */
export function BarChart({ series, keys, colors, labels, height = 208 }) {
  const [hover, setHover] = useState(null);
  const buckets = useMemo(() => {
    if (series.length <= 92) return series.map((d) => ({ ...d, label: short(d.date) }));
    const weeks = [];
    for (let i = 0; i < series.length; i += 7) {
      const chunk = series.slice(i, i + 7);
      weeks.push({ date: chunk[0].date, label: `${short(chunk[0].date)} to ${short(chunk.at(-1).date)}`, ...Object.fromEntries(keys.map((k) => [k, chunk.reduce((n, d) => n + d[k], 0)])), parcels: chunk.reduce((n, d) => n + (d.parcels || 0), 0) });
    }
    return weeks;
  }, [series, keys]);
  const total = (b) => keys.reduce((n, k) => n + b[k], 0);
  const max = Math.max(1, ...buckets.map(total));
  const step = 10 ** Math.floor(Math.log10(max));
  const top = Math.ceil(max / step) * step;
  const active = hover != null ? buckets[hover] : null;
  return (
    <div>
      <div className="mb-3 flex min-h-10 flex-wrap items-end justify-between gap-x-6 gap-y-2 text-sm" aria-live="polite">
        {active ? (
          <p><span className="font-semibold">{active.label}:</span> {keys.map((k, i) => <span key={k} className="ml-2 tabular"><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: colors[i] }} />{labels[i]} {money(active[k])}</span>)}{active.parcels != null && <span className="ml-2 text-ink-faint">{active.parcels} {active.parcels === 1 ? 'parcel' : 'parcels'}</span>}</p>
        ) : <p className="text-ink-faint">Hover or focus a bar for the detail.</p>}
        <ul className="flex gap-4 text-xs text-ink-soft">{labels.map((l, i) => <li key={l} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: colors[i] }} />{l}</li>)}</ul>
      </div>
      <div className="flex gap-3">
        <div className="flex w-12 shrink-0 flex-col justify-between text-right text-2xs tabular text-ink-faint" style={{ height }} aria-hidden="true">
          <span>{moneyShort(top)}</span><span>{moneyShort(top / 2)}</span><span>{moneyShort(0)}</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height }} aria-hidden="true"><span className="border-t border-line" /><span className="border-t border-dashed border-line" /><span className="border-t border-line-strong" /></div>
          <ul className="relative flex items-end gap-px sm:gap-[3px]" style={{ height }} aria-label="Sales over time">
            {buckets.map((b, i) => (
              <li key={b.date} className="flex h-full min-w-0 flex-1 items-end">
                <button type="button" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                  aria-label={`${b.label}: ${keys.map((k, n) => `${labels[n]} ${money(b[k])}`).join(', ')}`} className="flex h-full w-full flex-col-reverse items-stretch focus-visible:outline-offset-0">
                  {total(b) === 0 ? <span className="block h-[2px] w-full bg-line" /> : keys.map((k, n) => (
                    <span key={k} className={clsx('block w-full transition-opacity duration-75', n === keys.length - 1 && 'rounded-t-[3px]', hover != null && hover !== i && 'opacity-45')} style={{ height: `${(b[k] / top) * 100}%`, background: colors[n], minHeight: b[k] ? 2 : 0 }} />
                  ))}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between text-2xs text-ink-faint" aria-hidden="true"><span>{short(buckets[0].date)}</span><span>{short(buckets[Math.floor(buckets.length / 2)].date)}</span><span>{short(series.at(-1).date)}</span></div>
        </div>
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, delta, className }) {
  return (
    <div className={clsx('panel p-5', className)}>
      <p className="text-[13px] font-semibold text-ink-faint">{label}</p>
      <p className="sign mt-1.5 text-3xl tabular">{value}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
        {delta != null && Number.isFinite(delta) && (
          <span className={clsx('flex items-center gap-0.5 font-semibold', delta >= 0 ? 'text-go' : 'text-brand')}>
            {delta >= 0 ? <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />}{delta >= 0 ? '+' : ''}{delta}%
          </span>
        )}
        {sub}
      </p>
    </div>
  );
}

export const pctChange = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

/** Horizontal bars for rankings (top products, categories, shops). */
export function RankBars({ rows, value, label, sub, color = '#17181C', format = money }) {
  const max = Math.max(1, ...rows.map(value));
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={i}>
          <div className="flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0 truncate font-semibold">{label(r)}</span><span className="shrink-0 tabular">{format(value(r))}</span></div>
          <div className="mt-1 flex items-center gap-2"><span className="h-2 flex-1 overflow-hidden rounded-full bg-ink/[.06]"><span className="block h-full rounded-full" style={{ width: `${(value(r) / max) * 100}%`, background: typeof color === 'function' ? color(r) : color }} /></span>{sub && <span className="w-24 shrink-0 text-right text-2xs text-ink-faint">{sub(r)}</span>}</div>
        </li>
      ))}
      {rows.length === 0 && <li className="text-sm text-ink-faint">Nothing to show for this period yet.</li>}
    </ul>
  );
}
