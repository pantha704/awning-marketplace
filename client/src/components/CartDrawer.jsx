import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { X, ShoppingBag, Truck } from 'lucide-react';
import { useGetCartQuery } from '../store/api.js';
import { cartClosed } from '../store/uiSlice.js';
import { money } from '../lib/format.js';
import { CartLine } from './CartLine.jsx';
import { ShopMark } from './bits.jsx';

/** Slides in after "Add to cart" so shoppers see what happened without leaving the page. */
export default function CartDrawer() {
  const open = useSelector((s) => s.ui.cartOpen);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { data } = useGetCartQuery();
  const panel = useRef(null);
  const close = () => dispatch(cartClosed());

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const cart = data?.cart;
  const groups = cart?.groups || [];
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade bg-night/45" onClick={close} aria-hidden="true" />
      <aside ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Your cart" className="absolute inset-y-0 right-0 flex w-full max-w-md animate-drawer flex-col bg-paper shadow-pop outline-none">
        <div className="awning awning-sm shrink-0" aria-hidden="true" />
        <div className="flex items-center justify-between px-5 pb-3 pt-2">
          <h2 className="text-2xl">Your cart</h2>
          <button type="button" onClick={close} className="btn-ghost btn-icon -mr-2" aria-label="Close cart"><X className="h-5 w-5" /></button>
        </div>
        {!cart || cart.lines.length === 0 ? (
          <div className="grid flex-1 place-items-center px-6 text-center">
            <div>
              <ShoppingBag className="mx-auto h-8 w-8 text-ink-faint" strokeWidth={1.5} />
              <p className="mt-3 font-semibold">Your cart is empty</p>
              <p className="mt-1 text-sm text-ink-faint">Browse the shops and add something you like.</p>
              <button type="button" className="btn-primary mt-5" onClick={() => { close(); navigate('/search'); }}>Start shopping</button>
            </div>
          </div>
        ) : (
          <>
            <div className="scroll-thin flex-1 overflow-y-auto px-5">
              {groups.length > 1 && <p className="mb-3 text-xs text-ink-faint">{groups.length} shops, one checkout. Each shop sends its own parcel.</p>}
              {cart.lines.filter((l) => !l.available).length > 0 && (
                <div className="mb-3 space-y-2">{cart.lines.filter((l) => !l.available).map((line) => <CartLine key={line.productId} line={line} compact />)}</div>
              )}
              {groups.map((g) => (
                <section key={g.vendor.id} className="mb-4 rounded-panel border border-line bg-white p-3.5">
                  <h3 className="flex items-center gap-2 font-sans text-sm font-semibold" style={{ fontStretch: '100%' }}><ShopMark color={g.vendor.color} size={18} />{g.vendor.name}</h3>
                  <ul className="mt-2 divide-y divide-line">{cart.lines.filter((l) => l.available && l.vendor.id === g.vendor.id).map((line) => <CartLine key={line.productId} line={line} compact />)}</ul>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-faint">
                    <Truck className="h-3.5 w-3.5" aria-hidden="true" />
                    {g.shipping === 0 ? <span className="font-semibold text-go">Free shipping from this shop</span> : <>Shipping {money(g.shipping)}. Add {money(g.freeShippingGap)} more for free shipping.</>}
                  </p>
                </section>
              ))}
            </div>
            <div className="border-t border-line bg-white px-5 pb-5 pt-4">
              <div className="flex items-baseline justify-between"><span className="text-sm text-ink-soft">Subtotal, {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'}</span><span className="sign text-2xl tabular">{money(cart.subtotal - cart.discount)}</span></div>
              <p className="mt-0.5 text-xs text-ink-faint">Shipping and codes are worked out at checkout.</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link to="/cart" onClick={close} className="btn-outline">View cart</Link>
                <Link to="/checkout" onClick={close} className="btn-buy">Checkout</Link>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>,
    document.body
  );
}
