import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Minus, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useSetCartQtyMutation, useRemoveFromCartMutation } from '../store/api.js';
import { money } from '../lib/format.js';
import { ProductImage } from './bits.jsx';

export function QtyStepper({ value, max, onChange, disabled, size = 'md' }) {
  const h = size === 'sm' ? 'h-8' : 'h-10';
  const btn = clsx('grid w-8 place-items-center text-ink-soft transition-colors hover:text-ink disabled:opacity-30', h);
  return (
    <div className={clsx('inline-flex items-center rounded-lg border border-line-strong bg-white', h)}>
      <button type="button" className={btn} disabled={disabled || value <= 1} onClick={() => onChange(value - 1)} aria-label="One fewer"><Minus className="h-3.5 w-3.5" /></button>
      <span className="min-w-7 text-center text-sm font-semibold tabular" aria-live="polite">{value}</span>
      <button type="button" className={btn} disabled={disabled || value >= max} onClick={() => onChange(value + 1)} aria-label="One more"><Plus className="h-3.5 w-3.5" /></button>
    </div>
  );
}

export function CartLine({ line, compact = false }) {
  const [setQty] = useSetCartQtyMutation();
  const [remove] = useRemoveFromCartMutation();
  return (
    <li className={clsx('flex gap-3', compact ? 'py-3' : 'py-4', !line.available && 'opacity-80')}>
      <Link to={`/p/${line.slug}`} className="shrink-0"><ProductImage src={line.image} alt="" className={clsx('rounded-lg', compact ? 'h-16 w-16' : 'h-20 w-20 sm:h-24 sm:w-24')} /></Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <Link to={`/p/${line.slug}`} className="line-clamp-2 text-sm font-semibold leading-snug hover:underline">{line.title}</Link>
          <span className="shrink-0 text-sm font-semibold tabular">{line.available ? money(line.lineTotal) : ''}</span>
        </div>
        <p className="mt-0.5 text-xs tabular text-ink-faint">{money(line.price)} each{line.discount > 0 && <span className="text-go">, -{money(line.discount)} with code</span>}</p>
        {line.note && <p className={clsx('mt-1 flex items-center gap-1 text-xs font-semibold', line.available ? 'text-star-deep' : 'text-brand')}><TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />{line.note}</p>}
        <div className="mt-2 flex items-center gap-2">
          {line.available && <QtyStepper size="sm" value={line.qty} max={line.maxQty} onChange={(qty) => setQty({ productId: line.productId, qty })} />}
          <button type="button" onClick={() => remove(line.productId)} className="btn-ghost btn-sm px-2 text-ink-faint" aria-label={`Remove ${line.title}`}><Trash2 className="h-3.5 w-3.5" />{!compact && 'Remove'}</button>
        </div>
      </div>
    </li>
  );
}
