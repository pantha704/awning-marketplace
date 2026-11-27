import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ArrowRight, Truck, ShieldCheck, Store } from 'lucide-react';
import { useGetHomeQuery, useGetPaymentConfigQuery } from '../store/api.js';
import { selectUser } from '../store/authSlice.js';
import { ProductGrid } from '../components/ProductCard.jsx';
import { Stars, ShopMark } from '../components/bits.jsx';
import { Skeleton } from '../components/ui.jsx';
import { money, plural, assetUrl } from '../lib/format.js';

function Row({ title, to, products, loading }) {
  return (
    <section className="page mt-16">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="text-3xl sm:text-[2.1rem]">{title}</h2>
        <Link to={to} className="link inline-flex items-center gap-1 text-sm">See all <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
      </div>
      <ProductGrid products={(products || []).slice(0, 8)} loading={loading} />
    </section>
  );
}

/** A shopfront: the shop's own awning over its name. */
export function ShopFront({ shop }) {
  return (
    <Link to={`/shops/${shop.slug}`} className="group block overflow-hidden rounded-panel border border-line bg-white transition-shadow duration-150 hover:shadow-lift">
      <div className="awning" style={{ '--awning': shop.color }} aria-hidden="true" />
      <div className="px-4 pb-4 pt-3">
        <div className="flex items-center gap-2.5">
          {shop.logoUrl ? <img src={assetUrl(shop.logoUrl)} alt="" className="h-8 w-8 rounded-md object-cover" /> : <ShopMark color={shop.color} size={32} />}
          <h3 className="truncate text-xl leading-tight group-hover:underline group-hover:decoration-2 group-hover:underline-offset-4" style={{ textDecorationColor: shop.color }}>{shop.name}</h3>
        </div>
        <p className="mt-2 line-clamp-1 text-sm text-ink-soft">{shop.tagline}</p>
        <div className="mt-3 flex items-center justify-between text-xs text-ink-faint">
          <span>{plural(shop.productCount, 'product')}{shop.location && `, ${shop.location}`}</span>
          {shop.ratingCount > 0 && <Stars value={shop.ratingAvg} size={11} showValue />}
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  const user = useSelector(selectUser);
  const { data, isLoading } = useGetHomeQuery();
  const pay = useGetPaymentConfigQuery();
  const freeOver = pay.data?.shipping?.freeOver;
  const keep = 100 - (pay.data?.commissionPercent ?? 10);

  return (
    <>
      <section className="relative overflow-hidden bg-night text-white">
        <div className="awning awning-lg animate-unroll" aria-hidden="true" />
        <div className="page grid items-center gap-10 pb-16 pt-10 lg:grid-cols-[1.1fr_1fr] lg:pb-20 lg:pt-14">
          <div>
            <h1 className="text-balance text-5xl leading-[0.98] sm:text-6xl lg:text-7xl">Every shop on the street, one checkout.</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/70">
              Awning is a marketplace of independent shops. Fill one cart from {data ? plural(data.totals.shops, 'shop') : 'many shops'}, pay once, and each shop sends its own parcel.
            </p>
            <div className="on-night mt-8 flex flex-wrap gap-3">
              <Link to="/search" className="btn-buy btn-lg">Start shopping</Link>
              <Link to="/shops" className="btn btn-lg border border-white/25 text-white hover:bg-white/10">Browse the shops</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {isLoading ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-panel bg-white/10" />) : (data?.deals || []).slice(0, 4).map((p) => (
              <Link key={p.id} to={`/p/${p.slug}`} className="group relative block overflow-hidden rounded-panel bg-white/5">
                <img src={assetUrl(p.image)} alt="" className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                <span className="absolute bottom-2.5 left-2.5 rounded-md bg-white px-2 py-1 text-xs font-bold tabular text-ink shadow">{money(p.price)} <span className="ml-1 rounded-sm bg-star px-1 text-2xs">-{p.discountPercent}%</span></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-line bg-white">
        <ul className="page grid gap-4 py-5 text-sm sm:grid-cols-3">
          <li className="flex items-center gap-3"><Store className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" /><span><b>Independent shops,</b> each checked by our team before it opens.</span></li>
          <li className="flex items-center gap-3"><Truck className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" /><span><b>Free shipping</b> from any shop when you spend {freeOver ? money(freeOver) : 'enough'} there.</span></li>
          <li className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" /><span><b>One payment,</b> and you can cancel a parcel until the shop packs it.</span></li>
        </ul>
      </section>

      <section className="page mt-12">
        <h2 className="sr-only">Departments</h2>
        <ul className="scroll-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {(data?.categories || []).filter((c) => c.count > 0).map((c) => (
            <li key={c.name} className="shrink-0"><Link to={`/search?category=${encodeURIComponent(c.name)}`} className="flex h-10 items-center gap-2 rounded-full border border-line-strong bg-white px-4 text-sm font-semibold hover:border-ink">{c.name}<span className="text-xs font-normal tabular text-ink-faint">{c.count}</span></Link></li>
          ))}
        </ul>
      </section>

      <Row title="On offer this week" to="/search?sort=bestselling" products={data?.deals} loading={isLoading} />

      <section className="page mt-16">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 className="text-3xl sm:text-[2.1rem]">Shops on the street</h2>
          <Link to="/shops" className="link inline-flex items-center gap-1 text-sm">All shops <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-40 rounded-panel" />) : data?.shops.map((s) => <ShopFront key={s.id} shop={s} />)}
        </div>
      </section>

      <Row title="Bestsellers" to="/search?sort=bestselling" products={data?.bestsellers} loading={isLoading} />
      <Row title="New in" to="/search?sort=newest" products={data?.fresh} loading={isLoading} />

      {user?.role !== 'vendor' && user?.role !== 'admin' && (
        <section className="page mt-20">
          <div className="overflow-hidden rounded-panel bg-white ring-1 ring-line">
            <div className="awning" style={{ '--awning': '#17181C' }} aria-hidden="true" />
            <div className="flex flex-col gap-6 px-6 py-8 sm:px-10 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <h2 className="text-3xl">Open your own shop</h2>
                <p className="mt-2 leading-relaxed text-ink-soft">List your products, set your prices and run your own coupons. Customers pay once at checkout, and you receive {keep}% of every sale straight to your payout account.</p>
              </div>
              <Link to="/register?role=vendor" className="btn-primary btn-lg shrink-0">Start selling</Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
