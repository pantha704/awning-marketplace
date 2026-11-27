import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import clsx from 'clsx';
import { Truck, RotateCcw, ShieldCheck, PackageX, Star as StarIcon } from 'lucide-react';
import { useGetProductQuery, useGetReviewsQuery, usePostReviewMutation, useGetPaymentConfigQuery } from '../store/api.js';
import { selectUser } from '../store/authSlice.js';
import { toast } from '../store/uiSlice.js';
import { useAddToCart } from '../hooks/useAddToCart.js';
import { Price, Stars, ShopMark, ProductImage } from '../components/bits.jsx';
import { QtyStepper } from '../components/CartLine.jsx';
import { ProductGrid } from '../components/ProductCard.jsx';
import { Empty, ErrorNote, Field, PageLoader, Spinner } from '../components/ui.jsx';
import { money, plural, dateLabel, errorMessage, assetUrl } from '../lib/format.js';

function Gallery({ images, title }) {
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [images]);
  if (!images.length) return <ProductImage className="aspect-square rounded-panel" />;
  return (
    <div className="flex flex-col-reverse gap-3 self-start sm:flex-row sm:items-start lg:sticky lg:top-32">
      {images.length > 1 && (
        <div className="flex gap-2 sm:flex-col">
          {images.map((src, n) => (
            <button key={src} type="button" onClick={() => setI(n)} onMouseEnter={() => setI(n)} aria-label={`Photo ${n + 1}`} aria-pressed={i === n}
              className={clsx('h-16 w-16 overflow-hidden rounded-lg ring-2 transition-shadow duration-100 sm:h-20 sm:w-20', i === n ? 'ring-ink' : 'ring-transparent hover:ring-line-strong')}>
              <img src={assetUrl(src)} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <div className="min-w-0 flex-1 overflow-hidden rounded-panel bg-[#EFEDE7]"><img src={assetUrl(images[i])} alt={title} className="aspect-square w-full object-cover" /></div>
    </div>
  );
}

function ReviewForm({ product, existing }) {
  const dispatch = useDispatch();
  const [post, { isLoading, error }] = usePostReviewMutation();
  const [form, setForm] = useState({ rating: existing?.rating || 0, title: existing?.title || '', body: existing?.body || '' });
  const [hover, setHover] = useState(0);
  const submit = async (e) => {
    e.preventDefault();
    if (!form.rating) return dispatch(toast.error('Choose a star rating.'));
    try { await post({ productId: product.id, ...form }).unwrap(); dispatch(toast.success(existing ? 'Review updated.' : 'Thank you for your review.')); } catch { /* shown */ }
  };
  return (
    <form onSubmit={submit} className="panel space-y-4 p-5">
      <h3 className="text-xl">{existing ? 'Edit your review' : 'Review this product'}</h3>
      <fieldset>
        <legend className="label">Your rating</legend>
        <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setForm({ ...form, rating: n })} onMouseEnter={() => setHover(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={form.rating === n}>
              <StarIcon className={clsx('h-7 w-7 transition-colors', n <= (hover || form.rating) ? 'text-star' : 'text-line-strong')} fill="currentColor" strokeWidth={0} />
            </button>
          ))}
        </div>
      </fieldset>
      <Field label="Headline"><input className="field" maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What stood out?" /></Field>
      <Field label="Your review"><textarea className="field min-h-24" maxLength={3000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
      <ErrorNote>{error && errorMessage(error)}</ErrorNote>
      <button type="submit" className="btn-primary" disabled={isLoading}>{isLoading && <Spinner />}{existing ? 'Update review' : 'Post review'}</button>
    </form>
  );
}

function Reviews({ product, canReview, myReview }) {
  const [page, setPage] = useState(1);
  const { data } = useGetReviewsQuery({ productId: product.id, page });
  const total = data?.spread?.reduce((n, s) => n + s.count, 0) || 0;
  return (
    <section className="mt-16 grid gap-10 lg:grid-cols-[18rem_minmax(0,1fr)]" id="reviews">
      <div>
        <h2 className="text-3xl">Reviews</h2>
        {total > 0 ? (
          <>
            <div className="mt-3 flex items-center gap-3"><span className="sign text-5xl tabular">{product.ratingAvg.toFixed(1)}</span><div><Stars value={product.ratingAvg} size={16} /><p className="text-xs text-ink-faint">{plural(total, 'review')}</p></div></div>
            <ul className="mt-4 space-y-1.5">
              {data.spread.map((s) => (
                <li key={s.star} className="flex items-center gap-2 text-xs"><span className="w-10 tabular text-ink-soft">{s.star} star</span><span className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10"><span className="block h-full rounded-full bg-star" style={{ width: `${(s.count / total) * 100}%` }} /></span><span className="w-6 text-right tabular text-ink-faint">{s.count}</span></li>
              ))}
            </ul>
          </>
        ) : <p className="mt-3 text-sm text-ink-faint">No reviews yet.</p>}
        <p className="mt-5 text-xs leading-relaxed text-ink-faint">Only customers whose order was delivered can review, so every review comes from a real purchase.</p>
      </div>
      <div className="space-y-6">
        {canReview && <ReviewForm product={product} existing={myReview} />}
        <ul className="divide-y divide-line">
          {data?.items.map((r) => (
            <li key={r.id} className="py-5 first:pt-0">
              <div className="flex items-center gap-3"><Stars value={r.rating} size={13} /><span className="text-sm font-semibold">{r.title}</span></div>
              <p className="mt-1 text-xs text-ink-faint">{r.authorName}, {dateLabel(r.createdAt)}, verified purchase</p>
              {r.body && <p className="mt-2 max-w-[65ch] text-[15px] leading-relaxed text-ink-soft">{r.body}</p>}
              {r.reply && <div className="mt-3 border-l-[3px] border-brand pl-3 text-sm"><p className="text-xs font-semibold">Reply from the shop</p><p className="mt-0.5 text-ink-soft">{r.reply.body}</p></div>}
            </li>
          ))}
        </ul>
        {data && data.pages > 1 && (
          <div className="flex items-center gap-3">
            <button type="button" className="btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</button>
            <span className="text-xs tabular text-ink-faint">Page {page} of {data.pages}</span>
            <button type="button" className="btn-outline btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Older</button>
          </div>
        )}
      </div>
    </section>
  );
}

export default function ProductPage() {
  const { slug } = useParams();
  const user = useSelector(selectUser);
  const { data, isLoading, error } = useGetProductQuery(slug);
  const pay = useGetPaymentConfigQuery();
  const { addToCart, adding } = useAddToCart();
  const [qty, setQty] = useState(1);
  useEffect(() => setQty(1), [slug]);

  if (isLoading) return <PageLoader label="Loading product" />;
  if (error) return <div className="page pt-16"><Empty icon={PackageX} title="This product is not available" action={<Link to="/search" className="btn-primary">Keep shopping</Link>}>{error.status === 404 ? 'It may have sold out for good or been removed by the shop.' : errorMessage(error)}</Empty></div>;
  const { product: p, shop, more, myReview, canReview } = data;
  const own = user?.vendorId === shop.id;
  const ship = pay.data?.shipping;

  return (
    <div className="page pt-6">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-ink-faint" aria-label="Breadcrumb">
        <Link to="/search" className="hover:text-ink">All</Link><span aria-hidden="true">/</span>
        <Link to={`/search?category=${encodeURIComponent(p.category)}`} className="hover:text-ink">{p.category}</Link>
        {p.status !== 'active' && <span className="ml-2 rounded-full bg-star-light px-2 py-0.5 text-xs font-semibold text-star-deep">Preview: this product is {p.status}</span>}
      </nav>
      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14">
        <Gallery images={p.images} title={p.title} />
        <div>
          <Link to={`/shops/${shop.slug}`} className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft hover:text-ink"><ShopMark color={shop.color} size={20} />{shop.name}</Link>
          <h1 className="mt-2 text-balance text-4xl leading-[1.05] sm:text-[2.75rem]">{p.title}</h1>
          {p.ratingCount > 0 && <a href="#reviews" className="mt-3 inline-flex"><Stars value={p.ratingAvg} count={p.ratingCount} size={15} showValue /></a>}
          <div className="mt-5"><Price price={p.price} compareAtPrice={p.compareAtPrice} discountPercent={p.discountPercent} size="lg" /></div>
          {p.compareAtPrice > 0 && <p className="mt-1 text-sm font-semibold text-go">You save {money(p.compareAtPrice - p.price)}</p>}

          <div className="mt-6 rounded-panel border border-line bg-white p-5">
            <p className={clsx('text-sm font-semibold', !p.inStock ? 'text-brand' : p.stock <= 5 ? 'text-star-deep' : 'text-go')}>{!p.inStock ? 'Sold out' : p.stock <= 5 ? `Only ${p.stock} left` : 'In stock'}</p>
            {own ? (
              <Link to={`/sell/products/${p.id}`} className="btn-primary mt-4 w-full">Edit this product</Link>
            ) : (
              <div className="mt-4 flex gap-3">
                {p.inStock && <QtyStepper value={qty} max={Math.min(p.stock, 20)} onChange={setQty} />}
                <button type="button" onClick={() => addToCart(p.id, qty)} disabled={!p.inStock || adding} className="btn-buy btn-lg flex-1 h-10 sm:h-12">{adding && <Spinner />}{p.inStock ? 'Add to cart' : 'Sold out'}</button>
              </div>
            )}
            <ul className="mt-5 space-y-2.5 border-t border-line pt-4 text-sm text-ink-soft">
              {ship && <li className="flex gap-2.5"><Truck className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />Shipped by {shop.name}. {money(ship.flat)}, or free when you spend {money(ship.freeOver)} at this shop.</li>}
              <li className="flex gap-2.5"><RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />Cancel for a full refund until the shop packs your parcel.</li>
              <li className="flex gap-2.5"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />One secure payment for your whole cart, across every shop.</li>
            </ul>
          </div>

          {p.description && <div className="mt-8"><h2 className="text-xl">About this item</h2><p className="mt-2 whitespace-pre-line leading-relaxed text-ink-soft">{p.description}</p></div>}
          {p.attributes.length > 0 && (
            <dl className="mt-6 divide-y divide-line rounded-panel border border-line bg-white text-sm">
              {p.attributes.map((a) => <div key={a.name} className="grid grid-cols-[9rem_1fr] gap-3 px-4 py-2.5"><dt className="text-ink-faint">{a.name}</dt><dd className="font-medium">{a.value}</dd></div>)}
            </dl>
          )}
        </div>
      </div>

      <Reviews product={p} canReview={canReview} myReview={myReview} />

      <section className="mt-16 overflow-hidden rounded-panel border border-line bg-white">
        <div className="awning" style={{ '--awning': shop.color }} aria-hidden="true" />
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Sold by</p>
            <h2 className="mt-1 text-3xl">{shop.name}</h2>
            <p className="mt-1 text-sm text-ink-soft">{shop.tagline}{shop.location && ` · ${shop.location}`}</p>
          </div>
          <div className="flex items-center gap-4">
            {shop.ratingCount > 0 && <Stars value={shop.ratingAvg} count={shop.ratingCount} size={14} showValue />}
            <Link to={`/shops/${shop.slug}`} className="btn-outline">Visit the shop</Link>
          </div>
        </div>
      </section>
      {more.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-6 text-3xl">More from {shop.name}</h2>
          <ProductGrid products={more} showShop={false} />
        </section>
      )}
    </div>
  );
}
