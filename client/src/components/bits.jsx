import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { money, assetUrl } from '../lib/format.js';

export function Stars({ value = 0, count, size = 14, className, showValue = false }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className={clsx('inline-flex items-center gap-1.5', className)}>
      <span className="relative inline-flex" aria-label={`${value.toFixed(1)} out of 5 stars`} role="img">
        <span className="flex text-line-strong">{[0, 1, 2, 3, 4].map((i) => <Star key={i} style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />)}</span>
        <span className="absolute inset-0 flex overflow-hidden text-star" style={{ width: `${pct}%` }}>{[0, 1, 2, 3, 4].map((i) => <Star key={i} className="shrink-0" style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />)}</span>
      </span>
      {showValue && <span className="text-xs font-semibold tabular text-ink">{value.toFixed(1)}</span>}
      {count != null && <span className="text-xs tabular text-ink-faint">({count.toLocaleString()})</span>}
    </span>
  );
}

/** Price with the old price struck through and a marigold "price sticker" for the saving. */
export function Price({ price, compareAtPrice, discountPercent, size = 'md', className }) {
  return (
    <span className={clsx('inline-flex flex-wrap items-baseline gap-x-2 gap-y-1', className)}>
      <span className={clsx('sign tabular text-ink', size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-[15px]' : 'text-lg')}>{money(price)}</span>
      {compareAtPrice > 0 && <s className={clsx('tabular text-ink-faint', size === 'lg' ? 'text-base' : 'text-xs')}>{money(compareAtPrice)}</s>}
      {discountPercent > 0 && <span className="rounded-sm bg-star px-1.5 py-px text-2xs font-bold text-ink">-{discountPercent}%</span>}
    </span>
  );
}

/** A small awning in the shop's colour, used as the shop's mark everywhere. */
export function ShopMark({ color, size = 28, className }) {
  return (
    <span className={clsx('inline-block shrink-0 overflow-hidden rounded-[5px] bg-white ring-1 ring-ink/10', className)} style={{ width: size, height: size }} aria-hidden="true">
      <span className="awning block" style={{ '--awning': color, '--w': `${size / 4}px`, height: size * 0.62 }} />
    </span>
  );
}

export function ShopLink({ shop, className }) {
  if (!shop?.slug) return null;
  return (
    <Link to={`/shops/${shop.slug}`} className={clsx('inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold text-ink-soft hover:text-ink', className)}>
      <ShopMark color={shop.color} size={16} /><span className="truncate">{shop.name}</span>
    </Link>
  );
}

export function ProductImage({ src, alt = '', className, sizes }) {
  return (
    <div className={clsx('overflow-hidden bg-[#EFEDE7]', className)}>
      {src ? <img src={assetUrl(src)} alt={alt} loading="lazy" decoding="async" sizes={sizes} className="h-full w-full object-cover" /> : <div className="h-full w-full" />}
    </div>
  );
}
