import { useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import clsx from 'clsx';
import { ChartNoAxesColumn, Store, ShoppingBag, Users as UsersIcon, Tag, Package, Search, Check, Ban, Percent } from 'lucide-react';
import {
  useGetAnalyticsQuery, useGetAdminVendorsQuery, useUpdateAdminVendorMutation, useGetAdminUsersQuery, useUpdateAdminUserMutation,
  useGetAdminOrdersQuery, useAdminAdvanceMutation, useAdminCancelMutation, useGetAdminCouponsQuery, useSaveAdminCouponMutation, useDeleteAdminCouponMutation,
  useGetAdminProductsQuery, useUpdateAdminProductMutation,
} from '../../store/api.js';
import { selectUser } from '../../store/authSlice.js';
import { toast } from '../../store/uiSlice.js';
import { BarChart, Stat, pctChange, RankBars } from '../../components/Charts.jsx';
import ParcelTracker from '../../components/ParcelTracker.jsx';
import { CouponManager } from '../vendor/Coupons.jsx';
import { ShopMark, ProductImage } from '../../components/bits.jsx';
import { Avatar, Confirm, Empty, Field, Modal, Segmented, Skeleton, Spinner, StatusTag } from '../../components/ui.jsx';
import { money, plural, dateLabel, fromNow, errorMessage } from '../../lib/format.js';

const NAV = [['/admin', 'Analytics', ChartNoAxesColumn, true], ['/admin/shops', 'Shops', Store], ['/admin/orders', 'Orders', ShoppingBag], ['/admin/products', 'Products', Package], ['/admin/coupons', 'Coupons', Tag], ['/admin/people', 'People', UsersIcon]];

export function AdminShell() {
  const pending = useGetAdminVendorsQuery('pending');
  const count = pending.data?.items.length || 0;
  return (
    <div>
      <div className="border-b border-line bg-white">
        <div className="page py-5"><p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Marketplace admin</p><h1 className="text-3xl leading-tight">Awning control room</h1></div>
        <nav className="page scroll-thin flex gap-1 overflow-x-auto pb-2" aria-label="Admin sections">
          {NAV.map(([to, label, Icon, end]) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => clsx('flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-100', isActive ? 'bg-ink text-white' : 'text-ink-soft hover:bg-ink/5 hover:text-ink')}>
              <Icon className="h-4 w-4" aria-hidden="true" />{label}{label === 'Shops' && count > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-2xs text-white">{count}</span>}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="page pt-8"><Outlet /></div>
    </div>
  );
}

const PERIODS = [{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }, { value: 365, label: '12 months' }];
const CAT_COLORS = ['#D4402B', '#2F6690', '#31572C', '#A23B72', '#E09F3E', '#2A9D8F', '#5E548E', '#17181C'];

export function Analytics() {
  const [days, setDays] = useState(30);
  const { data: d, isLoading, isFetching } = useGetAnalyticsQuery(days);
  if (isLoading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28 rounded-panel" />)}</div>;
  const parcelsTotal = Object.values(d.parcels).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className={isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl">Analytics</h2>
        <Segmented size="sm" label="Period" value={days} onChange={setDays} options={PERIODS} />
      </div>
      {d.vendors.pending > 0 && <Link to="/admin/shops?status=pending" className="mt-5 flex items-center gap-3 rounded-panel bg-star-light px-5 py-3.5 text-sm text-star-deep hover:bg-star/30"><Store className="h-5 w-5" aria-hidden="true" /><span><b>{plural(d.vendors.pending, 'shop')} waiting for approval.</b> Review them now.</span></Link>}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Gross sales (GMV)" value={money(d.range.gross)} delta={pctChange(d.range.gross, d.previous.gross)} sub="against the period before" />
        <Stat label="Commission earned" value={money(d.range.commission)} delta={pctChange(d.range.commission, d.previous.commission)} sub={`take rate ${d.range.gross ? ((d.range.commission / d.range.gross) * 100).toFixed(1) : '0'}%`} />
        <Stat label="Orders" value={d.range.orders.toLocaleString()} sub={`average ${money(d.averageOrder)}, ${plural(d.range.parcels, 'parcel')}`} />
        <Stat label="Customers" value={d.customers.total.toLocaleString()} sub={`${d.customers.new} new in this period`} />
      </div>
      <div className="panel mt-4 p-5 sm:p-6">
        <BarChart series={d.series} keys={['commission', 'net']} colors={['#D4402B', '#17181C']} labels={['Commission', 'Paid to shops']} />
        <p className="mt-4 border-t border-line pt-3 text-xs text-ink-faint">Every bar is what customers paid that day, split into the platform's commission and the shops' share. Cancelled parcels are excluded. Lifetime commission: {money(d.lifetime.commission)} on {money(d.lifetime.gross)} of sales.</p>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="panel p-5"><h3 className="mb-4 text-xl">Top shops</h3><RankBars rows={d.topVendors} value={(r) => r.gross} label={(r) => r.name} sub={(r) => `${money(r.commission)} fee`} color="#D4402B" /></section>
        <section className="panel p-5"><h3 className="mb-4 text-xl">Top products</h3><RankBars rows={d.topProducts} value={(r) => r.revenue} label={(r) => r.title} sub={(r) => `${r.units} sold`} /></section>
        <section className="panel p-5"><h3 className="mb-4 text-xl">Departments</h3><RankBars rows={d.categories} value={(r) => r.revenue} label={(r) => r.name} sub={(r) => `${r.units} units`} color={(r) => CAT_COLORS[d.categories.indexOf(r) % CAT_COLORS.length]} /></section>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="panel p-5">
          <h3 className="text-xl">Fulfilment, all time</h3>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full">
            {[['placed', '#F2A20C'], ['packed', '#2F6690'], ['shipped', '#5E548E'], ['delivered', '#1D7F54'], ['cancelled', '#D4402B']].map(([k, c]) => <span key={k} style={{ width: `${(d.parcels[k] / parcelsTotal) * 100}%`, background: c }} title={`${k}: ${d.parcels[k]}`} />)}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">{Object.entries(d.parcels).map(([k, v]) => <li key={k} className="tabular"><StatusTag status={k} /> <span className="ml-1 font-semibold">{v}</span></li>)}</ul>
        </section>
        <section className="panel p-5 text-sm">
          <h3 className="text-xl">Marketplace</h3>
          <dl className="mt-3 space-y-2">
            {[['Shops open', d.vendors.approved], ['Waiting for approval', d.vendors.pending], ['Suspended', d.vendors.suspended], ['Products on sale', d.products.active], ['Sold out', d.products.outOfStock]].map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-ink-faint">{k}</dt><dd className="font-semibold tabular">{v}</dd></div>)}
          </dl>
          <p className="mt-4 border-t border-line pt-3 text-xs text-ink-faint">Search: {d.system.search === 'elasticsearch' ? 'Elasticsearch' : 'MongoDB fallback'}. Cache: {d.system.cache}. Images: {d.system.storage === 's3' ? 'S3' : 'local disk'}. Payments: {d.system.payments}.</p>
        </section>
      </div>
    </div>
  );
}

export function Shops() {
  const dispatch = useDispatch();
  const [status, setStatus] = useState(() => new URLSearchParams(window.location.search).get('status') || '');
  const { data, isLoading } = useGetAdminVendorsQuery(status);
  const [update, state] = useUpdateAdminVendorMutation();
  const [suspend, setSuspend] = useState(null);
  const [rate, setRate] = useState(null);
  const run = async (body, message) => { try { await update(body).unwrap(); dispatch(toast.success(message)); return true; } catch (err) { dispatch(toast.error(errorMessage(err))); return false; } };
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-3xl">Shops</h2>
        <Segmented size="sm" label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'pending', label: 'Waiting' }, { value: 'approved', label: 'Open' }, { value: 'suspended', label: 'Suspended' }]} />
      </div>
      <div className="mt-6 space-y-3">
        {isLoading && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-panel" />)}
        {data?.items.map((v) => (
          <article key={v.id} className="panel overflow-hidden">
            <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <ShopMark color={v.color} size={40} />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2"><span className="sign text-xl">{v.name}</span><StatusTag status={v.status}>{{ pending: 'Waiting', approved: 'Open', suspended: 'Suspended' }[v.status]}</StatusTag></p>
                  <p className="text-xs text-ink-faint">{v.owner?.name}, {v.owner?.email}{v.location && `, ${v.location}`}. Applied {fromNow(v.createdAt)}.</p>
                  <p className="mt-2 line-clamp-2 max-w-2xl text-sm text-ink-soft">{v.description}</p>
                </div>
              </div>
              <dl className="grid shrink-0 grid-cols-3 gap-4 text-sm md:text-right">
                <div><dt className="text-xs text-ink-faint">Sales</dt><dd className="font-semibold tabular">{money(v.gross)}</dd></div>
                <div><dt className="text-xs text-ink-faint">Fees earned</dt><dd className="font-semibold tabular">{money(v.commissionEarned)}</dd></div>
                <div><dt className="text-xs text-ink-faint">Commission</dt><dd className="font-semibold tabular">{v.commissionPercent ?? data.defaultCommission}%{v.commissionPercent == null && <span className="text-2xs font-normal text-ink-faint"> default</span>}</dd></div>
              </dl>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line bg-paper/60 px-5 py-3">
              {v.status !== 'approved' && <button type="button" className="btn-primary btn-sm" disabled={state.isLoading} onClick={() => run({ id: v.id, status: 'approved' }, `${v.name} is open. Its products are now in search.`)}><Check className="h-3.5 w-3.5" />{v.status === 'pending' ? 'Approve' : 'Reinstate'}</button>}
              {v.status !== 'suspended' && <button type="button" className="btn-outline btn-sm" onClick={() => setSuspend({ shop: v, note: '' })}><Ban className="h-3.5 w-3.5" />{v.status === 'pending' ? 'Reject' : 'Suspend'}</button>}
              <button type="button" className="btn-ghost btn-sm" onClick={() => setRate({ shop: v, value: v.commissionPercent ?? '' })}><Percent className="h-3.5 w-3.5" />Set commission</button>
              {v.status === 'approved' && <Link to={`/shops/${v.slug}`} className="btn-ghost btn-sm ml-auto">Shopfront</Link>}
            </div>
          </article>
        ))}
        {data?.items.length === 0 && <Empty icon={Store} title="No shops here">{status === 'pending' ? 'Every application has been reviewed.' : 'Try another filter.'}</Empty>}
      </div>
      <Modal open={!!suspend} onClose={() => setSuspend(null)} title={suspend?.shop.status === 'pending' ? `Reject ${suspend?.shop.name}` : `Suspend ${suspend?.shop.name}`} width="max-w-md"
        footer={<><button type="button" className="btn-outline" onClick={() => setSuspend(null)}>Cancel</button><button type="button" className="btn bg-brand text-white hover:bg-brand-dark" disabled={state.isLoading} onClick={async () => { if (await run({ id: suspend.shop.id, status: 'suspended', reviewNote: suspend.note }, `${suspend.shop.name} is suspended. Its products are hidden.`)) setSuspend(null); }}>{state.isLoading && <Spinner />}Confirm</button></>}>
        {suspend && <><p className="mb-4 text-sm text-ink-soft">The shop's products disappear from search and from customers' carts at once. Orders already paid are not affected.</p><Field label="Message to the shop owner"><textarea className="field" value={suspend.note} onChange={(e) => setSuspend({ ...suspend, note: e.target.value })} placeholder="Why, and what they can do about it" /></Field></>}
      </Modal>
      <Modal open={!!rate} onClose={() => setRate(null)} title={`Commission for ${rate?.shop.name}`} width="max-w-sm"
        footer={<><button type="button" className="btn-outline" onClick={() => setRate(null)}>Cancel</button><button type="button" className="btn-primary" disabled={state.isLoading} onClick={async () => { const value = rate.value === '' ? null : Number(rate.value); if (await run({ id: rate.shop.id, commissionPercent: value }, 'Commission updated. It applies to new orders.')) setRate(null); }}>Save</button></>}>
        {rate && <Field label="Percent of each sale" hint={`Leave empty to use the default of ${data.defaultCommission}%. Applies to orders placed from now on.`}><input className="field tabular" type="number" min="0" max="60" step="0.5" value={rate.value} onChange={(e) => setRate({ ...rate, value: e.target.value })} /></Field>}
      </Modal>
    </div>
  );
}

export function Orders() {
  const dispatch = useDispatch();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useGetAdminOrdersQuery({ ...(status && { status }), ...(q && { q }), page });
  const [advance] = useAdminAdvanceMutation();
  const [cancel, cancelState] = useAdminCancelMutation();
  const [confirm, setConfirm] = useState(null);
  const next = { placed: 'packed', packed: 'shipped', shipped: 'delivered' };
  const step = async (o, p) => {
    const to = next[p.status];
    try { await advance({ orderId: o.id, parcelId: p.id, to, ...(to === 'shipped' ? { tracking: { carrier: 'Marketplace', number: `ADM-${o.number}` } } : {}) }).unwrap(); dispatch(toast.success(`Parcel marked ${to}.`)); }
    catch (err) { dispatch(toast.error(errorMessage(err))); }
  };
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-3xl">Orders</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative"><span className="sr-only">Order number</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" /><input type="search" className="field w-48 pl-9" placeholder="Order number" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
          <Segmented size="sm" label="Parcel status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: '', label: 'All' }, { value: 'placed', label: 'Placed' }, { value: 'packed', label: 'Packed' }, { value: 'shipped', label: 'Shipped' }, { value: 'cancelled', label: 'Cancelled' }]} />
        </div>
      </div>
      <div className={clsx('mt-6 space-y-3 transition-opacity', isFetching && !isLoading && 'opacity-60')}>
        {isLoading && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-40 rounded-panel" />)}
        {data?.items.map((o) => (
          <article key={o.id} className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="flex items-center gap-2 font-semibold">Order {o.number}<StatusTag status={o.status} /></p><p className="text-xs text-ink-faint">{o.customer?.name}, {o.customer?.email}, paid {fromNow(o.payment.paidAt)} ({o.payment.provider})</p></div>
              <div className="text-right"><p className="sign text-xl tabular">{money(o.total)}</p><p className="text-xs text-ink-faint">commission {money(o.parcels.reduce((n, p) => n + (p.status === 'cancelled' ? 0 : p.commission), 0))}</p></div>
            </div>
            <ul className="mt-4 space-y-3">
              {o.parcels.map((p) => (
                <li key={p.id} className="grid items-center gap-3 rounded-lg border border-line p-3 md:grid-cols-[13rem_minmax(0,1fr)_11rem]">
                  <div className="flex min-w-0 items-center gap-2 text-sm"><ShopMark color={p.vendor.color} size={20} /><span className="truncate font-semibold">{p.vendor.name}</span></div>
                  <ParcelTracker parcel={p} color={p.vendor.color} />
                  <div className="flex flex-wrap justify-end gap-1.5 text-xs">
                    <span className="w-full text-right tabular text-ink-faint">{money(p.total)}, shop gets {money(p.vendorNet)} ({p.payout?.status})</span>
                    {next[p.status] && <button type="button" className="btn-outline btn-sm h-7 px-2 text-xs" onClick={() => step(o, p)}>Mark {next[p.status]}</button>}
                    {['placed', 'packed'].includes(p.status) && <button type="button" className="btn-ghost btn-sm h-7 px-2 text-xs text-brand" onClick={() => setConfirm({ o, p })}>Cancel</button>}
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ))}
        {data?.items.length === 0 && <Empty icon={ShoppingBag} title="No orders match" />}
      </div>
      {data && data.pages > 1 && <div className="mt-6 flex items-center justify-center gap-3"><button type="button" className="btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</button><span className="text-sm tabular text-ink-faint">Page {page} of {data.pages}</span><button type="button" className="btn-outline btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Older</button></div>}
      <Confirm open={!!confirm} onClose={() => setConfirm(null)} busy={cancelState.isLoading} title="Cancel this parcel?" confirmLabel="Cancel and refund"
        onConfirm={async () => { try { await cancel({ orderId: confirm.o.id, parcelId: confirm.p.id }).unwrap(); dispatch(toast.success('Cancelled and refunded.')); } catch (err) { dispatch(toast.error(errorMessage(err))); } setConfirm(null); }}>
        The customer is refunded {confirm && money(confirm.p.total)} for the parcel from {confirm?.p.vendor.name}, the shop's payout is reversed and the stock is restored.
      </Confirm>
    </div>
  );
}

export function Products() {
  const dispatch = useDispatch();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const { data, isLoading } = useGetAdminProductsQuery({ ...(q && { q }), ...(status && { status }) });
  const [update] = useUpdateAdminProductMutation();
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-3xl">Products</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative"><span className="sr-only">Search</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" /><input type="search" className="field w-56 pl-9" placeholder="Search by title" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <Segmented size="sm" label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'active', label: 'On sale' }, { value: 'draft', label: 'Drafts' }, { value: 'archived', label: 'Archived' }]} />
        </div>
      </div>
      <div className="panel mt-6 overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-ink-faint"><th className="px-4 py-3 font-semibold">Product</th><th className="px-3 py-3 font-semibold">Shop</th><th className="px-3 py-3 text-right font-semibold">Price</th><th className="px-3 py-3 text-right font-semibold">Stock</th><th className="px-4 py-3 font-semibold">Status</th></tr></thead>
          <tbody className="divide-y divide-line">
            {isLoading && Array.from({ length: 6 }, (_, i) => <tr key={i}><td colSpan={5} className="px-4 py-3"><Skeleton className="h-10" /></td></tr>)}
            {data?.items.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2.5"><Link to={`/p/${p.slug}`} className="flex items-center gap-3"><ProductImage src={p.image} className="h-10 w-10 shrink-0 rounded-md" /><span className="font-semibold hover:underline">{p.title}</span></Link></td>
                <td className="px-3 py-2.5 text-ink-soft">{p.vendor?.name}</td>
                <td className="px-3 py-2.5 text-right tabular">{money(p.price)}</td>
                <td className="px-3 py-2.5 text-right tabular">{p.stock}</td>
                <td className="px-4 py-2.5"><div className="flex items-center gap-2"><StatusTag status={p.status} />
                  {p.status === 'active' && <button type="button" className="btn-ghost btn-sm h-7 px-2 text-xs text-brand" onClick={async () => { await update({ id: p.id, status: 'archived' }); dispatch(toast.success('Product taken down.')); }}>Take down</button>}
                  {p.status === 'archived' && <button type="button" className="btn-ghost btn-sm h-7 px-2 text-xs" onClick={async () => { try { await update({ id: p.id, status: 'active' }).unwrap(); dispatch(toast.success('Product restored.')); } catch (err) { dispatch(toast.error(errorMessage(err))); } }}>Restore</button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Coupons() {
  return <CouponManager title="Marketplace coupons" intro="Codes that work at every shop. The discount is shared across the shops in the cart in proportion to their items."
    list={useGetAdminCouponsQuery()} save={useSaveAdminCouponMutation()} remove={useDeleteAdminCouponMutation()} />;
}

export function People() {
  const me = useSelector(selectUser);
  const dispatch = useDispatch();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGetAdminUsersQuery({ page, ...(q && { q }), ...(role && { role }) });
  const [update] = useUpdateAdminUserMutation();
  const change = async (u, body, message) => { try { await update({ id: u.id, ...body }).unwrap(); dispatch(toast.success(message)); } catch (err) { dispatch(toast.error(errorMessage(err))); } };
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-3xl">People</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative"><span className="sr-only">Search people</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" /><input type="search" className="field w-56 pl-9" placeholder="Name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
          <Segmented size="sm" label="Role" value={role} onChange={(v) => { setRole(v); setPage(1); }} options={[{ value: '', label: 'Everyone' }, { value: 'customer', label: 'Customers' }, { value: 'vendor', label: 'Shop owners' }, { value: 'admin', label: 'Admins' }]} />
        </div>
      </div>
      <div className="panel mt-6 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-ink-faint"><th className="px-4 py-3 font-semibold">Person</th><th className="px-3 py-3 font-semibold">Joined</th><th className="px-3 py-3 font-semibold">Role</th><th className="px-4 py-3 text-right font-semibold">Access</th></tr></thead>
          <tbody className="divide-y divide-line">
            {isLoading && Array.from({ length: 6 }, (_, i) => <tr key={i}><td colSpan={4} className="px-4 py-3"><Skeleton className="h-8" /></td></tr>)}
            {data?.items.map((u) => {
              const self = u.id === me.id;
              return (
                <tr key={u.id} className={u.disabled ? 'bg-paper/70 text-ink-faint' : undefined}>
                  <td className="px-4 py-2.5"><div className="flex items-center gap-3"><Avatar name={u.name} size={30} /><div className="min-w-0"><p className="truncate font-semibold text-ink">{u.name}{self && ' (you)'}</p><p className="truncate text-xs text-ink-faint">{u.email}</p></div></div></td>
                  <td className="px-3 py-2.5 text-xs tabular">{dateLabel(u.createdAt)}</td>
                  <td className="px-3 py-2.5"><select aria-label={`Role of ${u.name}`} className="field h-8 w-36 py-1 text-[13px]" value={u.role} disabled={self} onChange={(e) => change(u, { role: e.target.value }, `${u.name} is now ${e.target.value === 'admin' ? 'an' : 'a'} ${e.target.value}.`)}><option value="customer">Customer</option><option value="vendor">Shop owner</option><option value="admin">Admin</option></select></td>
                  <td className="px-4 py-2.5 text-right">{self ? <span className="text-xs">Signed in</span> : <button type="button" className={u.disabled ? 'btn-outline btn-sm' : 'btn-ghost btn-sm text-brand hover:text-brand'} onClick={() => change(u, { disabled: !u.disabled }, u.disabled ? `${u.name} can sign in again.` : `${u.name} is signed out and cannot sign in.`)}>{u.disabled ? 'Restore' : 'Disable'}</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data && data.pages > 1 && <div className="mt-4 flex items-center justify-end gap-3 text-sm"><button type="button" className="btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span className="tabular text-ink-faint">Page {data.page} of {data.pages}</span><button type="button" className="btn-outline btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button></div>}
    </div>
  );
}
