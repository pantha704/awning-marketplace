import { NavLink, Outlet, Link } from 'react-router-dom';
import clsx from 'clsx';
import { LayoutDashboard, Package, ShoppingBag, Wallet, Tag, MessageSquareText, Settings, Hourglass, Ban, ExternalLink } from 'lucide-react';
import { useGetMyShopQuery } from '../../store/api.js';
import { PageLoader } from '../../components/ui.jsx';
import ApplyShop from './Apply.jsx';

const NAV = [
  ['/sell', 'Overview', LayoutDashboard, true], ['/sell/products', 'Products', Package], ['/sell/orders', 'Orders', ShoppingBag],
  ['/sell/payouts', 'Payouts', Wallet], ['/sell/coupons', 'Coupons', Tag], ['/sell/reviews', 'Reviews', MessageSquareText], ['/sell/settings', 'Shop settings', Settings],
];

export default function VendorShell() {
  const { data, isLoading } = useGetMyShopQuery();
  if (isLoading) return <PageLoader />;
  const shop = data?.shop;
  if (!shop) return <ApplyShop />;
  return (
    <div>
      <div className="border-b border-line bg-white">
        <div className="awning awning-sm" style={{ '--awning': shop.color }} aria-hidden="true" />
        <div className="page flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Your shop</p>
            <h1 className="text-3xl leading-tight">{shop.name}</h1>
          </div>
          {shop.status === 'approved' && <Link to={`/shops/${shop.slug}`} className="btn-outline btn-sm"><ExternalLink className="h-3.5 w-3.5" />View shopfront</Link>}
        </div>
        <nav className="page scroll-thin flex gap-1 overflow-x-auto pb-2" aria-label="Shop sections">
          {NAV.map(([to, label, Icon, end]) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => clsx('flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-100', isActive ? 'bg-ink text-white' : 'text-ink-soft hover:bg-ink/5 hover:text-ink')}>
              <Icon className="h-4 w-4" aria-hidden="true" />{label}
            </NavLink>
          ))}
        </nav>
      </div>
      {shop.status !== 'approved' && (
        <div className={clsx('border-b', shop.status === 'pending' ? 'border-star/40 bg-star-light' : 'border-brand/30 bg-brand-light')}>
          <p className="page flex items-start gap-3 py-3 text-sm">
            {shop.status === 'pending' ? <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-star-deep" aria-hidden="true" /> : <Ban className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />}
            <span>{shop.status === 'pending'
              ? <><b>Your shop is waiting for approval.</b> The marketplace team reviews new shops, usually within a day. Meanwhile, add products as drafts so you can go live the moment you are approved.</>
              : <><b>Your shop is suspended.</b> {shop.reviewNote || 'Your products are hidden from customers.'} Contact the marketplace team to resolve it.</>}</span>
          </p>
        </div>
      )}
      <div className="page pt-8"><Outlet context={{ shop }} /></div>
    </div>
  );
}
