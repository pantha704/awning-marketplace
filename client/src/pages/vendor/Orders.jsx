import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { PackageCheck, Truck, CircleCheck, FileDown, ShoppingBag, MapPin } from 'lucide-react';
import { useGetVendorOrdersQuery, useAdvanceParcelMutation, useVendorCancelParcelMutation } from '../../store/api.js';
import { toast } from '../../store/uiSlice.js';
import ParcelTracker from '../../components/ParcelTracker.jsx';
import { ProductImage } from '../../components/bits.jsx';
import { useOpenPdf } from '../account/Orders.jsx';
import { Confirm, Empty, Field, Modal, Segmented, Skeleton, Spinner, StatusTag } from '../../components/ui.jsx';
import { money, fromNow, plural, errorMessage } from '../../lib/format.js';

const NEXT = { placed: ['packed', 'Mark as packed', PackageCheck], packed: ['shipped', 'Mark as shipped', Truck], shipped: ['delivered', 'Mark as delivered', CircleCheck] };

function OrderCard({ row }) {
  const dispatch = useDispatch();
  const [advance, advState] = useAdvanceParcelMutation();
  const [cancel, cancelState] = useVendorCancelParcelMutation();
  const [ship, setShip] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const openPdf = useOpenPdf();
  const p = row.parcel;
  const next = NEXT[p.status];
  const go = async (to, tracking) => {
    try { await advance({ orderId: row.orderId, to, tracking }).unwrap(); setShip(null); dispatch(toast.success(`Order ${row.number} is now ${to}.`)); }
    catch (err) { dispatch(toast.error(errorMessage(err))); }
  };
  const a = row.shippingAddress;
  return (
    <article className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold">Order {row.number}<StatusTag status={p.status} /></p>
          <p className="mt-0.5 text-xs text-ink-faint">Paid {fromNow(row.paidAt)} by {row.customer?.name || 'a customer'}</p>
        </div>
        <div className="text-right text-sm">
          <p className="sign text-xl tabular">{money(p.vendorNet)}</p>
          <p className="text-xs text-ink-faint">yours, of {money(p.total)} paid ({p.commissionPercent}% commission {money(p.commission)})</p>
        </div>
      </div>
      <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1fr)_14rem]">
        <ul className="space-y-2">
          {p.items.map((item) => (
            <li key={item.productId} className="flex items-center gap-3 text-sm">
              <ProductImage src={item.image} className="h-12 w-12 shrink-0 rounded-md" />
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{item.title}</span><span className="text-xs tabular text-ink-faint">{item.qty} x {money(item.price)}</span></span>
              <span className="shrink-0 rounded-md bg-paper px-2 py-1 text-xs font-bold tabular">x{item.qty}</span>
            </li>
          ))}
        </ul>
        <div className="rounded-lg bg-paper p-3 text-xs leading-relaxed text-ink-soft">
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-ink"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />Ship to</p>
          {a.fullName}<br />{a.line1}{a.line2 && `, ${a.line2}`}<br />{a.city} {a.postalCode}, {a.country}{a.phone && <><br />{a.phone}</>}
        </div>
      </div>
      <div className="mt-5"><ParcelTracker parcel={p} /></div>
      {p.tracking?.number && <p className="mt-3 text-xs text-ink-faint">Tracking: {p.tracking.carrier}, {p.tracking.number}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {next && <button type="button" className="btn-primary" disabled={advState.isLoading} onClick={() => (next[0] === 'shipped' ? setShip({ carrier: '', number: '' }) : go(next[0]))}>{advState.isLoading ? <Spinner /> : (() => { const Icon = next[2]; return <Icon className="h-4 w-4" />; })()}{next[1]}</button>}
        <button type="button" className="btn-outline" onClick={() => openPdf(`/api/vendor/orders/${row.orderId}/invoice`, `invoice-${row.number}.pdf`)}><FileDown className="h-4 w-4" />Invoice</button>
        {['placed', 'packed'].includes(p.status) && <button type="button" className="btn-ghost ml-auto text-brand hover:text-brand" onClick={() => setConfirm(true)}>Cancel and refund</button>}
      </div>
      <Modal open={!!ship} onClose={() => setShip(null)} title={`Ship order ${row.number}`} width="max-w-md"
        footer={<><button type="button" className="btn-outline" onClick={() => setShip(null)}>Cancel</button><button type="button" className="btn-primary" disabled={advState.isLoading || !ship?.carrier.trim() || !ship?.number.trim()} onClick={() => go('shipped', ship)}>{advState.isLoading && <Spinner />}Mark as shipped</button></>}>
        {ship && (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">The customer sees the carrier and tracking number on their order page.</p>
            <Field label="Carrier"><input className="field" list="carriers" value={ship.carrier} onChange={(e) => setShip({ ...ship, carrier: e.target.value })} /></Field>
            <datalist id="carriers">{['Royal Mail', 'DHL', 'DPD', 'UPS', 'FedEx', 'USPS', 'India Post', 'Delhivery', 'PostNord'].map((c) => <option key={c} value={c} />)}</datalist>
            <Field label="Tracking number"><input className="field tabular" value={ship.number} onChange={(e) => setShip({ ...ship, number: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
      <Confirm open={confirm} onClose={() => setConfirm(false)} busy={cancelState.isLoading} title="Cancel and refund this order?" confirmLabel="Cancel and refund"
        onConfirm={async () => { try { await cancel({ orderId: row.orderId, note: 'Cancelled by the shop' }).unwrap(); setConfirm(false); dispatch(toast.success('Cancelled. The customer has been refunded and the stock is back.')); } catch (err) { setConfirm(false); dispatch(toast.error(errorMessage(err))); } }}>
        {row.customer?.name || 'The customer'} is refunded {money(p.total)}, your payout for this order is reversed, and the items go back into stock.
      </Confirm>
    </article>
  );
}

export default function VendorOrders() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const page = Number(params.get('page')) || 1;
  const { data, isLoading, isFetching } = useGetVendorOrdersQuery({ ...(status && { status }), page });
  const set = (changes) => setParams(Object.fromEntries(Object.entries({ status, ...changes }).filter(([, v]) => v)));
  return (
    <div>
      <h2 className="text-3xl">Orders</h2>
      <Segmented className="mt-5" size="sm" label="Status" value={status} onChange={(v) => set({ status: v, page: '' })}
        options={[{ value: '', label: 'All' }, { value: 'placed', label: 'To pack' }, { value: 'packed', label: 'To ship' }, { value: 'shipped', label: 'Shipped' }, { value: 'delivered', label: 'Delivered' }, { value: 'cancelled', label: 'Cancelled' }]} />
      <div className={isFetching && !isLoading ? 'mt-5 space-y-4 opacity-60 transition-opacity' : 'mt-5 space-y-4 transition-opacity'}>
        {isLoading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-56 rounded-panel" />)}
        {data?.items.map((row) => <OrderCard key={row.orderId} row={row} />)}
        {data?.items.length === 0 && <Empty icon={ShoppingBag} title={status ? 'No orders in this state' : 'No orders yet'}>{status ? 'Try another filter.' : 'Orders appear here the moment a customer pays.'}</Empty>}
      </div>
      {data && data.pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button type="button" className="btn-outline btn-sm" disabled={page <= 1} onClick={() => set({ page: page > 2 ? String(page - 1) : '' })}>Newer</button>
          <span className="text-sm tabular text-ink-faint">Page {page} of {data.pages}, {plural(data.total, 'order')}</span>
          <button type="button" className="btn-outline btn-sm" disabled={page >= data.pages} onClick={() => set({ page: String(page + 1) })}>Older</button>
        </div>
      )}
    </div>
  );
}
