import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { ShoppingBag, Truck, Tag, X } from 'lucide-react';
import { useGetCartQuery, useApplyCouponMutation, useRemoveCouponMutation } from '../store/api.js';
import { toast } from '../store/uiSlice.js';
import { CartLine } from '../components/CartLine.jsx';
import { Receipt } from '../components/Receipt.jsx';
import { ShopMark } from '../components/bits.jsx';
import { Empty, ErrorNote, PageLoader, ProgressBar, Spinner } from '../components/ui.jsx';
import { money, plural, errorMessage } from '../lib/format.js';

export function CouponBox({ cart }) {
  const dispatch = useDispatch();
  const [code, setCode] = useState('');
  const [apply, applying] = useApplyCouponMutation();
  const [remove] = useRemoveCouponMutation();
  const submit = async (e) => {
    e.preventDefault();
    try { await apply(code.trim()).unwrap(); setCode(''); dispatch(toast.success('Code applied.')); } catch { /* shown below */ }
  };
  if (cart.coupon) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-go bg-go-light px-3 py-2.5 text-sm">
        <span className="flex min-w-0 items-center gap-2"><Tag className="h-4 w-4 shrink-0 text-go" aria-hidden="true" /><span className="min-w-0"><b className="tracking-wider">{cart.coupon.code}</b><span className="block truncate text-xs text-ink-soft">{cart.coupon.description}</span></span></span>
        <button type="button" onClick={() => remove()} className="btn-ghost btn-icon h-8 w-8 shrink-0" aria-label="Remove code"><X className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <form onSubmit={submit}>
      <label className="label" htmlFor="coupon">Discount code</label>
      <div className="flex gap-2">
        <input id="coupon" className="field uppercase tracking-wider placeholder:normal-case placeholder:tracking-normal" placeholder="Enter a code" value={code} onChange={(e) => { setCode(e.target.value); applying.reset(); }} maxLength={24} />
        <button type="submit" className="btn-outline" disabled={!code.trim() || applying.isLoading}>{applying.isLoading && <Spinner />}Apply</button>
      </div>
      <ErrorNote className="mt-2">{applying.error && errorMessage(applying.error)}</ErrorNote>
    </form>
  );
}

export function cartRows(cart) {
  return [
    { label: `Items (${cart.itemCount})`, value: cart.subtotal },
    cart.discount > 0 && { label: `Code ${cart.coupon?.code || ''}`, value: -cart.discount, tone: 'go' },
    { label: `Shipping, ${plural(cart.groups.length, 'parcel')}`, value: cart.shippingTotal === 0 ? 'Free' : cart.shippingTotal },
  ];
}

export default function CartPage() {
  const { data, isLoading } = useGetCartQuery();
  if (isLoading) return <PageLoader />;
  const cart = data?.cart;
  if (!cart || !cart.lines.length) {
    return <div className="page pt-16"><Empty icon={ShoppingBag} title="Your cart is empty" action={<Link to="/search" className="btn-primary">Start shopping</Link>}>Items you add from any shop collect here, and you check out once.</Empty></div>;
  }
  const unavailable = cart.lines.filter((l) => !l.available);
  return (
    <div className="page pt-10">
      <h1 className="text-5xl">Your cart</h1>
      <p className="mt-2 text-ink-soft">{plural(cart.itemCount, 'item')} from {plural(cart.groups.length, 'shop')}. One payment; each shop ships its own parcel.</p>
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="space-y-5">
          {unavailable.length > 0 && (
            <section className="rounded-panel border border-brand/30 bg-brand-light/40 p-5">
              <h2 className="text-xl">Needs your attention</h2>
              <p className="text-sm text-ink-soft">These items cannot be bought right now and are not counted in your total.</p>
              <ul className="divide-y divide-line">{unavailable.map((l) => <CartLine key={l.productId} line={l} />)}</ul>
            </section>
          )}
          {cart.groups.map((g) => {
            const pct = g.shipping === 0 ? 100 : Math.min(100, (g.subtotal / (g.subtotal + g.freeShippingGap)) * 100);
            return (
              <section key={g.vendor.id} className="overflow-hidden rounded-panel border border-line bg-white">
                <div className="awning awning-sm" style={{ '--awning': g.vendor.color }} aria-hidden="true" />
                <div className="px-5 pb-2 pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="flex items-center gap-2 text-xl"><ShopMark color={g.vendor.color} size={22} /><Link to={`/shops/${g.vendor.slug}`} className="hover:underline">{g.vendor.name}</Link></h2>
                    <span className="text-sm font-semibold tabular">{money(g.subtotal - g.discount)}</span>
                  </div>
                  <ul className="divide-y divide-line">{cart.lines.filter((l) => l.available && l.vendor.id === g.vendor.id).map((l) => <CartLine key={l.productId} line={l} />)}</ul>
                </div>
                <div className="border-t border-line bg-paper/60 px-5 py-3">
                  <p className="flex items-center gap-2 text-sm"><Truck className="h-4 w-4 text-ink-faint" aria-hidden="true" />{g.shipping === 0 ? <span className="font-semibold text-go">Free shipping from {g.vendor.name}</span> : <span>Add <b>{money(g.freeShippingGap)}</b> more from {g.vendor.name} for free shipping</span>}</p>
                  <ProgressBar value={pct} tone={g.shipping === 0 ? 'go' : 'brand'} className="mt-2" label="Progress to free shipping" />
                </div>
              </section>
            );
          })}
        </div>
        <aside className="space-y-5 lg:sticky lg:top-36">
          <Receipt rows={cartRows(cart)} total={cart.total} footer="Taxes included where they apply">
            <Link to="/checkout" className="btn-buy btn-lg mt-5 w-full">Go to checkout</Link>
          </Receipt>
          <div className="panel p-4"><CouponBox cart={cart} /></div>
        </aside>
      </div>
    </div>
  );
}
