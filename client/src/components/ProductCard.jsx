import { Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import clsx from 'clsx';
import { Plus, Check } from 'lucide-react';
import { useState } from 'react';
import { api } from '../store/api.js';
import { useAddToCart } from '../hooks/useAddToCart.js';
import { Price, Stars, ShopLink, ProductImage } from './bits.jsx';
import { Skeleton, Spinner } from './ui.jsx';

export default function ProductCard({ product, showShop = true }) {
  const dispatch = useDispatch();
  const { addToCart, adding, addingId } = useAddToCart();
  const [added, setAdded] = useState(false);
  // Warm the cache on hover so the product page opens instantly.
  const prefetch = () => dispatch(api.util.prefetch('getProduct', product.slug, { ifOlderThan: 60 }));
  const busy = adding && addingId === product.id;
  const quickAdd = async (e) => {
    e.preventDefault();
    if (await addToCart(product.id, 1, { open: false })) {
      setAdded(true);
      setTimeout(() => setAdded(false), 1400);
    }
  };

  return (
    <article className="group relative flex flex-col">
      <Link to={`/p/${product.slug}`} onMouseEnter={prefetch} onFocus={prefetch} className="block rounded-panel focus-visible:outline-offset-4">
        <div className="relative">
          <ProductImage src={product.image} alt={product.title} className="aspect-square rounded-panel transition-transform duration-200 ease-out group-hover:scale-[1.015]" />
          {!product.inStock && <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-1 text-2xs font-bold text-ink shadow-sm">Sold out</span>}
          {product.inStock && product.stock <= 5 && <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-1 text-2xs font-bold text-brand shadow-sm">Only {product.stock} left</span>}
        </div>
        <h3 className="mt-3 line-clamp-2 font-sans text-[15px] font-semibold leading-snug text-ink" style={{ fontStretch: '100%', letterSpacing: 0 }}>{product.title}</h3>
      </Link>
      {product.inStock && (
        <button type="button" onClick={quickAdd} disabled={busy} aria-label={`Add ${product.title} to cart`}
          className={clsx('absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full shadow-lift transition-all duration-150 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100',
            added ? 'bg-go text-white opacity-100' : 'bg-white text-ink hover:bg-ink hover:text-white')}>
          {busy ? <Spinner /> : added ? <Check className="h-4 w-4" strokeWidth={3} /> : <Plus className="h-4 w-4" strokeWidth={2.5} />}
        </button>
      )}
      <div className="mt-1.5 flex flex-1 flex-col gap-1.5">
        {product.ratingCount > 0 && <Stars value={product.ratingAvg} count={product.ratingCount} size={12} />}
        <Price price={product.price} compareAtPrice={product.compareAtPrice} discountPercent={product.discountPercent} size="sm" />
        {showShop && <ShopLink shop={product.vendor} className="mt-auto pt-0.5" />}
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-square rounded-panel" />
      <Skeleton className="mt-3 h-4 w-11/12" />
      <Skeleton className="mt-2 h-4 w-1/3" />
      <Skeleton className="mt-2 h-3 w-1/2" />
    </div>
  );
}

export function ProductGrid({ products, loading, count = 8, className, showShop }) {
  return (
    <div className={clsx('grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4', className)}>
      {loading ? Array.from({ length: count }, (_, i) => <ProductCardSkeleton key={i} />) : products.map((p) => <ProductCard key={p.id} product={p} showShop={showShop} />)}
    </div>
  );
}
