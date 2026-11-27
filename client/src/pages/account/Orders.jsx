import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Package, FileDown, PartyPopper, Truck, Star } from 'lucide-react';
import { useGetOrdersQuery, useGetOrderQuery, useCancelParcelMutation } from '../../store/api.js';
import { toast } from '../../store/uiSlice.js';
import ParcelTracker from '../../components/ParcelTracker.jsx';
import { Receipt } from '../../components/Receipt.jsx';
import { ProductImage, ShopMark } from '../../components/bits.jsx';
import { Confirm, Empty, PageLoader, Skeleton, StatusTag } from '../../components/ui.jsx';
import { money, plural, dateLabel, errorMessage, API_ORIGIN } from '../../lib/format.js';
import { selectToken } from '../../store/authSlice.js';

/** PDFs sit behind auth, so they are fetched with the token and opened as a blob. */
export function useOpenPdf() {
  const token = useSelector(selectToken);
  const dispatch = useDispatch();
  return async (path, filename) => {
    const tab = window.open('', '_blank');
    try {
      const res = await fetch(`${API_ORIGIN}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'The invoice could not be created.');
      const url = URL.createObjectURL(await res.blob());
      if (tab) tab.location.href = url;
      else { const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      tab?.close();
      dispatch(toast.error(err.message));
    }
  };
}

export function OrdersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGetOrdersQuery(page);
  return (
    <div className="page max-w-4xl pt-10">
      <h1 className="text-5xl">Your orders</h1>
      <div className="mt-8 space-y-4">
        {isLoading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-32 rounded-panel" />)}
        {data?.items.length === 0 && <Empty icon={Package} title="No orders yet" action={<Link to="/search" className="btn-primary">Start shopping</Link>}>Orders you place appear here with live tracking for every parcel.</Empty>}
        {data?.items.map((o) => (
          <Link key={o.id} to={`/account/orders/${o.id}`} className="panel block p-5 transition-shadow duration-150 hover:shadow-lift">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="font-semibold">Order {o.number}</p><p className="text-xs text-ink-faint">{dateLabel(o.createdAt)}, {plural(o.itemCount, 'item')} from {plural(o.parcels.length, 'shop')}</p></div>
              <div className="flex items-center gap-3"><StatusTag status={o.status} /><span className="sign text-xl tabular">{money(o.total, o.currency)}</span></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {o.parcels.flatMap((p) => p.items).slice(0, 8).map((item, i) => <ProductImage key={`${item.productId}-${i}`} src={item.image} className="h-14 w-14 rounded-lg" />)}
            </div>
          </Link>
        ))}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-4">
            <button type="button" className="btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</button>
            <span className="text-sm tabular text-ink-faint">Page {page} of {data.pages}</span>
            <button type="button" className="btn-outline btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Older</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function OrderPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const dispatch = useDispatch();
  const { data, isLoading, error } = useGetOrderQuery(id);
  const [cancel, cancelState] = useCancelParcelMutation();
  const [confirm, setConfirm] = useState(null);
  const openPdf = useOpenPdf();

  if (isLoading) return <PageLoader />;
  if (error) return <div className="page pt-16"><Empty title="This order could not be found" action={<Link to="/account/orders" className="btn-primary">Your orders</Link>}>{errorMessage(error)}</Empty></div>;
  const o = data.order;
  const doCancel = async () => {
    try { await cancel({ orderId: o.id, parcelId: confirm.id }).unwrap(); dispatch(toast.success(`Parcel from ${confirm.vendor.name} cancelled. ${money(confirm.total, o.currency)} is on its way back to you.`)); setConfirm(null); }
    catch (err) { dispatch(toast.error(errorMessage(err))); setConfirm(null); }
  };
  const a = o.shippingAddress;

  return (
    <div className="page pt-10">
      {params.get('placed') && (
        <div className="mb-8 flex items-start gap-4 rounded-panel bg-go-light px-5 py-4 text-go" role="status">
          <PartyPopper className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
          <div><p className="text-lg font-bold">Thank you, your order is placed.</p><p className="text-sm text-ink-soft">Each shop has been told and will pack your parcel. Track every parcel on this page.</p></div>
        </div>
      )}
      <Link to="/account/orders" className="text-sm font-semibold text-ink-faint hover:text-ink">Your orders</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-5xl">Order {o.number}</h1><p className="mt-1 text-sm text-ink-faint">Placed {dateLabel(o.createdAt)}</p></div>
        {o.payment.status === 'paid' && <button type="button" className="btn-outline" onClick={() => openPdf(`/api/orders/${o.id}/invoice`, `awning-invoice-${o.number}.pdf`)}><FileDown className="h-4 w-4" />Invoice (PDF)</button>}
      </div>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          {o.parcels.map((p) => (
            <section key={p.id} className="overflow-hidden rounded-panel border border-line bg-white">
              <div className="awning awning-sm" style={{ '--awning': p.vendor.color }} aria-hidden="true" />
              <div className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-xl"><ShopMark color={p.vendor.color} size={22} />{p.vendor.slug ? <Link to={`/shops/${p.vendor.slug}`} className="hover:underline">{p.vendor.name}</Link> : p.vendor.name}</h2>
                  <span className="text-sm font-semibold tabular">{money(p.total, o.currency)}</span>
                </div>
                <div className="mt-5"><ParcelTracker parcel={p} color={p.vendor.color} /></div>
                {p.tracking?.number && <p className="mt-4 flex items-center gap-2 rounded-lg bg-paper px-3 py-2 text-sm"><Truck className="h-4 w-4 text-ink-faint" aria-hidden="true" />{p.tracking.carrier}, tracking number <b className="tabular">{p.tracking.number}</b></p>}
                <ul className="mt-4 divide-y divide-line">
                  {p.items.map((item) => (
                    <li key={item.productId} className="flex items-center gap-3 py-3">
                      <ProductImage src={item.image} className="h-14 w-14 shrink-0 rounded-lg" />
                      <div className="min-w-0 flex-1">{item.slug ? <Link to={`/p/${item.slug}`} className="block truncate text-sm font-semibold hover:underline">{item.title}</Link> : <p className="truncate text-sm font-semibold">{item.title}</p>}<p className="text-xs tabular text-ink-faint">{item.qty} x {money(item.price, o.currency)}</p></div>
                      {p.status === 'delivered' && item.slug && <Link to={`/p/${item.slug}#reviews`} className="btn-outline btn-sm shrink-0"><Star className="h-3.5 w-3.5 text-star" fill="currentColor" strokeWidth={0} />Review</Link>}
                    </li>
                  ))}
                </ul>
                {p.status === 'placed' && o.payment.status === 'paid' && (
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                    <p className="text-xs text-ink-faint">You can cancel this parcel until {p.vendor.name} packs it.</p>
                    <button type="button" className="btn-danger btn-sm" onClick={() => setConfirm(p)}>Cancel parcel</button>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
        <aside className="space-y-5 lg:sticky lg:top-36">
          <Receipt title="Paid" total={o.total} rows={[
            { label: 'Items', value: o.subtotal },
            o.discount > 0 && { label: `Code ${o.coupon || ''}`, value: -o.discount, tone: 'go' },
            { label: 'Shipping', value: o.shippingTotal === 0 ? 'Free' : o.shippingTotal },
            ...o.parcels.filter((p) => p.refund).map((p) => ({ label: `Refund, ${p.vendor.name}`, value: -p.refund.amount, tone: 'go' })),
          ]} footer={o.payment.provider === 'test' ? 'Paid with a test card' : `Paid with ${o.payment.provider === 'stripe' ? 'card via Stripe' : 'Razorpay'}`} />
          <div className="panel p-5 text-sm">
            <h2 className="font-sans text-sm font-bold" style={{ fontStretch: '100%' }}>Delivering to</h2>
            <p className="mt-2 leading-relaxed text-ink-soft">{a.fullName}<br />{a.line1}{a.line2 && <>, {a.line2}</>}<br />{a.city}{a.state && `, ${a.state}`} {a.postalCode}<br />{a.country}</p>
          </div>
        </aside>
      </div>
      <Confirm open={!!confirm} onClose={() => setConfirm(null)} onConfirm={doCancel} busy={cancelState.isLoading} title="Cancel this parcel?" confirmLabel="Cancel parcel">
        The parcel from {confirm?.vendor.name} is cancelled and {confirm && money(confirm.total, o.currency)} is refunded to you. Parcels from other shops are not affected.
      </Confirm>
    </div>
  );
}
