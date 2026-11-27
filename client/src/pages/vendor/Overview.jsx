import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { PackageOpen, TriangleAlert, ArrowRight } from 'lucide-react';
import { useGetVendorDashboardQuery } from '../../store/api.js';
import { BarChart, Stat, pctChange, RankBars } from '../../components/Charts.jsx';
import { Segmented, Skeleton } from '../../components/ui.jsx';
import { Stars } from '../../components/bits.jsx';
import { money, plural } from '../../lib/format.js';

const PERIODS = [{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }, { value: 365, label: '12 months' }];

export default function VendorOverview() {
  const { shop } = useOutletContext();
  const [days, setDays] = useState(30);
  const { data: d, isLoading, isFetching } = useGetVendorDashboardQuery(days);
  if (isLoading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28 rounded-panel" />)}</div>;
  const toShip = d.parcels.placed + d.parcels.packed;
  return (
    <div className={isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl">Overview</h2>
        <Segmented size="sm" label="Period" value={days} onChange={setDays} options={PERIODS} />
      </div>
      {toShip > 0 && (
        <Link to="/sell/orders?status=placed" className="mt-5 flex items-center justify-between gap-3 rounded-panel bg-ink px-5 py-4 text-white transition-colors hover:bg-night-700">
          <span className="flex items-center gap-3"><PackageOpen className="h-5 w-5 text-star" aria-hidden="true" /><span><b>{plural(toShip, 'parcel')} to send.</b> {d.parcels.placed} waiting to be packed, {d.parcels.packed} packed and ready to ship.</span></span>
          <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
        </Link>
      )}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Your earnings" value={money(d.range.net)} delta={pctChange(d.range.net, d.previous.net)} sub="against the period before" />
        <Stat label="Sales" value={money(d.range.gross)} sub={`${plural(d.range.parcels, 'order')} paid by customers`} />
        <Stat label="Marketplace commission" value={money(d.range.commission)} sub={`${d.commissionPercent}% of goods sold`} />
        <Stat label="Earned all time" value={money(d.lifetime.net)} sub={`from ${plural(d.lifetime.parcels, 'order')}`} />
      </div>
      <div className="panel mt-4 p-5 sm:p-6">
        <BarChart series={d.series} keys={['net', 'commission']} colors={[shop.color, '#CCCAC3']} labels={['Your earnings', 'Commission']} />
        <p className="mt-4 border-t border-line pt-3 text-xs text-ink-faint">Each order is split when it is paid: the marketplace keeps {d.commissionPercent}% of the goods, and you receive the rest plus the shipping you charged. Cancelled orders are excluded.</p>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="panel p-5 lg:col-span-2">
          <h3 className="mb-4 text-xl">Best sellers in this period</h3>
          <RankBars rows={d.topProducts} value={(r) => r.revenue} label={(r) => r.title} sub={(r) => `${r.units} sold`} color={shop.color} />
        </section>
        <div className="space-y-4">
          <section className="panel p-5">
            <h3 className="text-xl">Running low</h3>
            {d.lowStock.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {d.lowStock.map((p) => <li key={p.id} className="flex items-center justify-between gap-3"><Link to={`/sell/products/${p.id}`} className="min-w-0 truncate hover:underline">{p.title}</Link><span className={p.stock === 0 ? 'shrink-0 font-semibold text-brand' : 'shrink-0 font-semibold text-star-deep'}>{p.stock === 0 ? 'Sold out' : `${p.stock} left`}</span></li>)}
              </ul>
            ) : <p className="mt-2 text-sm text-ink-faint">Every product has more than 5 in stock.</p>}
          </section>
          <section className="panel p-5">
            <h3 className="text-xl">Your shop</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-faint">Products on sale</dt><dd className="font-semibold tabular">{d.activeProducts}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-faint">Rating</dt><dd>{d.ratingCount ? <Stars value={d.ratingAvg} count={d.ratingCount} size={12} /> : 'No reviews yet'}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-faint">Delivered</dt><dd className="font-semibold tabular">{d.parcels.delivered}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-faint">Cancelled</dt><dd className="font-semibold tabular">{d.parcels.cancelled}</dd></div>
            </dl>
            {d.activeProducts === 0 && <p className="mt-3 flex items-start gap-2 text-xs text-star-deep"><TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />Nothing is on sale yet. <Link to="/sell/products/new" className="link">Add a product</Link></p>}
          </section>
        </div>
      </div>
    </div>
  );
}
