import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import clsx from 'clsx';
import { LockKeyhole, FlaskConical, Plus, Check } from 'lucide-react';
import { api, useGetCartQuery, useGetAddressesQuery, useCheckoutMutation, usePayTestMutation, useCancelPaymentMutation, useVerifyRazorpayMutation } from '../store/api.js';
import { toast } from '../store/uiSlice.js';
import { Receipt } from '../components/Receipt.jsx';
import { CouponBox, cartRows } from './Cart.jsx';
import { ProductImage, ShopMark } from '../components/bits.jsx';
import { Empty, ErrorNote, Field, PageLoader, Spinner } from '../components/ui.jsx';
import { money, errorMessage } from '../lib/format.js';
import { openRazorpay } from '../lib/razorpay.js';

const BLANK = { fullName: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: '', phone: '' };

export function AddressForm({ value, onChange, errors = {} }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name" error={errors.fullName} className="sm:col-span-2"><input className="field h-11" autoComplete="name" value={value.fullName} onChange={set('fullName')} /></Field>
      <Field label="Address" error={errors.line1} className="sm:col-span-2"><input className="field h-11" autoComplete="address-line1" value={value.line1} onChange={set('line1')} placeholder="Street and number" /></Field>
      <Field label="Apartment, suite (optional)" className="sm:col-span-2"><input className="field h-11" autoComplete="address-line2" value={value.line2} onChange={set('line2')} /></Field>
      <Field label="City" error={errors.city}><input className="field h-11" autoComplete="address-level2" value={value.city} onChange={set('city')} /></Field>
      <Field label="State or region (optional)"><input className="field h-11" autoComplete="address-level1" value={value.state} onChange={set('state')} /></Field>
      <Field label="Postal code" error={errors.postalCode}><input className="field h-11" autoComplete="postal-code" value={value.postalCode} onChange={set('postalCode')} /></Field>
      <Field label="Country" error={errors.country}><input className="field h-11" autoComplete="country-name" value={value.country} onChange={set('country')} /></Field>
      <Field label="Phone (optional)" hint="For the courier, if they need to reach you." className="sm:col-span-2"><input className="field h-11" type="tel" autoComplete="tel" value={value.phone} onChange={set('phone')} /></Field>
    </div>
  );
}

const formatCard = (v) => v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
const formatExpiry = (v) => { const d = v.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; };

/** The built-in test gateway. With Stripe or Razorpay configured, buyers never see this form. */
function TestCardForm({ order, onPaid, onBack }) {
  const [pay, state] = usePayTestMutation();
  const [card, setCard] = useState({ name: '', cardNumber: '', expiry: '', cvc: '' });
  const submit = async (e) => {
    e.preventDefault();
    try { await pay({ orderId: order.id, ...card }).unwrap(); onPaid(); } catch { /* shown below */ }
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="flex items-start gap-3 rounded-xl border border-star/60 bg-star-light px-4 py-3 text-sm text-star-deep">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">Test mode. No real money moves.</p>
          <p className="mt-0.5">Use 4242 4242 4242 4242 with any future date and any 3 digits. 4000 0000 0000 0002 is declined on purpose.</p>
          <button type="button" className="mt-1.5 font-semibold underline underline-offset-2" onClick={() => setCard((c) => ({ name: c.name || 'Test Buyer', cardNumber: '4242 4242 4242 4242', expiry: '12/34', cvc: '123' }))}>Fill in the test card</button>
        </div>
      </div>
      <ErrorNote>{state.error && errorMessage(state.error)}</ErrorNote>
      <Field label="Name on card"><input className="field h-11" autoComplete="cc-name" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} /></Field>
      <Field label="Card number"><input className="field h-11 tabular" inputMode="numeric" autoComplete="cc-number" placeholder="1234 1234 1234 1234" value={card.cardNumber} onChange={(e) => setCard({ ...card, cardNumber: formatCard(e.target.value) })} /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Expiry"><input className="field h-11 tabular" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })} /></Field>
        <Field label="Security code"><input className="field h-11 tabular" inputMode="numeric" autoComplete="cc-csc" placeholder="123" maxLength={4} value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '') })} /></Field>
      </div>
      <button type="submit" className="btn-buy btn-lg w-full" disabled={state.isLoading}>{state.isLoading ? <Spinner /> : <LockKeyhole className="h-4 w-4" />}Pay {money(order.total)}</button>
      <button type="button" className="btn-ghost w-full" onClick={onBack}>Back to delivery details</button>
    </form>
  );
}

export default function Checkout() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { data: cartData, isLoading } = useGetCartQuery();
  const addresses = useGetAddressesQuery();
  const [checkout, checkoutState] = useCheckoutMutation();
  const [cancelPayment] = useCancelPaymentMutation();
  const [verifyRazorpay] = useVerifyRazorpayMutation();
  const [choice, setChoice] = useState(null); // saved address id, or 'new'
  const [address, setAddress] = useState(BLANK);
  const [save, setSave] = useState(true);
  const [pending, setPending] = useState(null); // { order, payment } once the order exists
  const saved = addresses.data?.items || [];
  useEffect(() => {
    if (choice === null && addresses.data) setChoice(saved.find((a) => a.isDefault)?.id || saved[0]?.id || 'new');
  }, [addresses.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || addresses.isLoading) return <PageLoader />;
  const cart = cartData?.cart;
  if (!pending && (!cart || cart.itemCount === 0)) return <div className="page pt-16"><Empty title="Nothing to check out" action={<Link to="/search" className="btn-primary">Start shopping</Link>}>Your cart is empty.</Empty></div>;

  const fieldErrors = Object.fromEntries((checkoutState.error?.data?.details || []).map((d) => [d.field.replace('address.', ''), d.message]));
  const finish = (orderId) => {
    dispatch(api.util.invalidateTags(['Cart', 'Orders', 'Search', 'Home', 'Product']));
    dispatch(toast.success('Payment received. Thank you!'));
    navigate(`/account/orders/${orderId}?placed=1`, { replace: true });
  };

  const placeOrder = async (e) => {
    e.preventDefault();
    try {
      const body = choice && choice !== 'new' ? { addressId: choice } : { address, saveAddress: save };
      const result = await checkout(body).unwrap();
      const { payment, order } = result;
      if (payment.provider === 'stripe') return window.location.assign(payment.url);
      if (payment.provider === 'razorpay') {
        try {
          const res = await openRazorpay(payment);
          await verifyRazorpay({ orderId: order.id, ...res }).unwrap();
          return finish(order.id);
        } catch (err) {
          await cancelPayment(order.id);
          if (err.message !== 'dismissed') dispatch(toast.error(err.message));
          return;
        }
      }
      setPending({ order, payment });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err.status === 409) dispatch(api.util.invalidateTags(['Cart']));
    }
  };
  const back = async () => {
    // Leaving the payment step releases the reserved stock straight away.
    await cancelPayment(pending.order.id);
    setPending(null);
    dispatch(api.util.invalidateTags(['Cart']));
  };

  return (
    <div className="page pt-10">
      <ol className="flex items-center gap-3 text-sm font-semibold" aria-label="Checkout steps">
        {['Delivery', 'Payment'].map((step, i) => {
          const done = i === 0 && pending;
          const current = (i === 0 && !pending) || (i === 1 && pending);
          return (
            <li key={step} className="flex items-center gap-3">
              {i > 0 && <span className="h-px w-8 bg-line-strong" aria-hidden="true" />}
              <span className={clsx('flex items-center gap-2', current ? 'text-ink' : 'text-ink-faint')} aria-current={current ? 'step' : undefined}>
                <span className={clsx('grid h-6 w-6 place-items-center rounded-full text-xs', done ? 'bg-go text-white' : current ? 'bg-ink text-white' : 'bg-line text-ink-soft')}>{done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}</span>{step}
              </span>
            </li>
          );
        })}
      </ol>
      <h1 className="mt-4 text-5xl">{pending ? 'Payment' : 'Checkout'}</h1>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="panel p-5 sm:p-7">
          {pending ? (
            <>
              <p className="mb-5 text-sm text-ink-soft">Order <b className="text-ink">{pending.order.number}</b> is reserved for you for 30 minutes.</p>
              <TestCardForm order={pending.order} onPaid={() => finish(pending.order.id)} onBack={back} />
            </>
          ) : (
            <form onSubmit={placeOrder} noValidate>
              <h2 className="text-2xl">Delivery address</h2>
              {checkoutState.error && !Object.keys(fieldErrors).length && <ErrorNote className="mt-4">{errorMessage(checkoutState.error)}{checkoutState.error.status === 409 && <> <Link to="/cart" className="link">Review your cart</Link></>}</ErrorNote>}
              {saved.length > 0 && (
                <div className="mt-4 grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Saved addresses">
                  {saved.map((a) => (
                    <label key={a.id} className={clsx('cursor-pointer rounded-xl border p-4 text-sm transition-colors duration-100', choice === a.id ? 'border-ink ring-2 ring-ink/10' : 'border-line-strong hover:border-ink')}>
                      <input type="radio" name="address" className="sr-only" checked={choice === a.id} onChange={() => setChoice(a.id)} />
                      <span className="block font-semibold">{a.fullName}</span>
                      <span className="mt-1 block leading-snug text-ink-soft">{a.line1}{a.line2 && `, ${a.line2}`}<br />{a.city} {a.postalCode}, {a.country}</span>
                    </label>
                  ))}
                  <label className={clsx('flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-sm font-semibold', choice === 'new' ? 'border-ink bg-white' : 'border-line-strong text-ink-soft hover:border-ink')}>
                    <input type="radio" name="address" className="sr-only" checked={choice === 'new'} onChange={() => setChoice('new')} /><Plus className="h-4 w-4" />New address
                  </label>
                </div>
              )}
              {choice === 'new' && (
                <div className="mt-5">
                  <AddressForm value={address} onChange={setAddress} errors={fieldErrors} />
                  <label className="mt-4 flex items-center gap-2.5 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#17181C]" checked={save} onChange={(e) => setSave(e.target.checked)} />Save this address for next time</label>
                </div>
              )}
              <h2 className="mt-8 text-2xl">Your parcels</h2>
              <ul className="mt-3 space-y-3">
                {cart.groups.map((g) => (
                  <li key={g.vendor.id} className="rounded-xl border border-line p-3.5">
                    <p className="flex items-center justify-between gap-3 text-sm font-semibold"><span className="flex items-center gap-2"><ShopMark color={g.vendor.color} size={18} />{g.vendor.name}</span><span className="text-xs font-normal text-ink-faint">{g.shipping ? `Shipping ${money(g.shipping)}` : 'Free shipping'}</span></p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {cart.lines.filter((l) => l.available && l.vendor.id === g.vendor.id).map((l) => (
                        <span key={l.productId} className="relative" title={`${l.qty} x ${l.title}`}>
                          <ProductImage src={l.image} className="h-14 w-14 rounded-lg" />
                          {l.qty > 1 && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-2xs font-bold text-white">{l.qty}</span>}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              <button type="submit" className="btn-buy btn-lg mt-8 w-full" disabled={checkoutState.isLoading || cart.hasIssues}>{checkoutState.isLoading && <Spinner />}Continue to payment</button>
              {cart.hasIssues && <p className="mt-2 text-center text-sm text-brand">Some items changed. <Link to="/cart" className="link">Review your cart</Link> first.</p>}
            </form>
          )}
        </div>
        <aside className="space-y-5 lg:sticky lg:top-36">
          {pending ? (
            <Receipt title={`Order ${pending.order.number}`} rows={[{ label: 'Reserved and ready', value: 'Awaiting payment', muted: true }]} total={pending.order.total} />
          ) : (
            <>
              <Receipt rows={cartRows(cart)} total={cart.total} footer="You pay once. Each shop is paid its share." />
              <div className="panel p-4"><CouponBox cart={cart} /></div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
