import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Store } from 'lucide-react';
import { useGetShopsQuery, useGetShopQuery, useSearchQuery } from '../store/api.js';
import { ShopFront } from './Home.jsx';
import { ProductGrid } from '../components/ProductCard.jsx';
import { Stars } from '../components/bits.jsx';
import { Empty, PageLoader, Skeleton } from '../components/ui.jsx';
import { plural, dateLabel, assetUrl } from '../lib/format.js';

export function ShopsPage() {
  const { data, isLoading } = useGetShopsQuery();
  return (
    <div className="page pt-10">
      <h1 className="text-5xl">The shops</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">Every shop on Awning is run independently and checked by our team before it opens.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-40 rounded-panel" />) : data?.items.map((s) => <ShopFront key={s.id} shop={s} />)}
      </div>
    </div>
  );
}

export function ShopPage() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const sort = params.get('sort') || 'bestselling';
  const { data, isLoading, error } = useGetShopQuery(slug);
  const shop = data?.shop;
  const products = useSearchQuery({ vendor: shop?.id, sort, limit: 48 }, { skip: !shop });
  if (isLoading) return <PageLoader />;
  if (error) return <div className="page pt-16"><Empty icon={Store} title="This shop is not open" action={<Link to="/shops" className="btn-primary">See all shops</Link>}>It may have closed or the link is wrong.</Empty></div>;
  return (
    <>
      <section className="bg-white">
        <div className="awning awning-lg animate-unroll" style={{ '--awning': shop.color }} aria-hidden="true" />
        <div className="page flex flex-col gap-6 pb-10 pt-8 md:flex-row md:items-end md:justify-between">
          <div className="flex items-start gap-5">
            {shop.logoUrl && <img src={assetUrl(shop.logoUrl)} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-line" />}
            <div>
              <h1 className="text-5xl leading-none sm:text-6xl">{shop.name}</h1>
              <p className="mt-2 text-lg text-ink-soft">{shop.tagline}</p>
              <p className="mt-4 max-w-2xl leading-relaxed text-ink-soft">{shop.description}</p>
            </div>
          </div>
          <dl className="grid shrink-0 grid-cols-3 gap-6 text-sm md:text-right">
            <div><dt className="text-ink-faint">Products</dt><dd className="sign text-2xl tabular">{shop.productCount}</dd></div>
            <div><dt className="text-ink-faint">Rating</dt><dd className="mt-1">{shop.ratingCount ? <Stars value={shop.ratingAvg} size={13} showValue /> : 'New'}</dd></div>
            <div><dt className="text-ink-faint">On Awning since</dt><dd className="mt-1 font-semibold">{dateLabel(shop.since)}</dd></div>
          </dl>
        </div>
      </section>
      <div className="page mt-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="text-3xl">{products.data ? plural(products.data.total, 'product') : 'Products'}</h2>
          <select aria-label="Sort" className="field h-10 w-auto pr-8 font-semibold" value={sort} onChange={(e) => setParams({ sort: e.target.value })}>
            <option value="bestselling">Bestselling</option><option value="newest">Newest</option><option value="price-asc">Price, low to high</option><option value="price-desc">Price, high to low</option><option value="rating">Top rated</option>
          </select>
        </div>
        <ProductGrid products={products.data?.items || []} loading={products.isLoading} showShop={false} />
      </div>
    </>
  );
}
