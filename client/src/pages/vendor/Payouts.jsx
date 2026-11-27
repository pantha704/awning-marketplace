import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Wallet, CircleCheck, Clock, ExternalLink, FlaskConical } from 'lucide-react';
import { useGetPayoutsQuery, useConnectPayoutsMutation } from '../../store/api.js';
import { toast } from '../../store/uiSlice.js';
import { Stat } from '../../components/Charts.jsx';
import { ErrorNote, Field, PageLoader, Spinner, StatusTag } from '../../components/ui.jsx';
import { money, dateLabel, errorMessage } from '../../lib/format.js';

function ConnectCard({ data }) {
  const dispatch = useDispatch();
  const [connect, state] = useConnectPayoutsMutation();
  const [acc, setAcc] = useState(data.account.razorpayAccountId);
  const run = async (body) => {
    try {
      const res = await connect(body).unwrap();
      if (res.url) return window.location.assign(res.url); // Stripe hosted onboarding
      dispatch(toast.success(res.connected ? 'Payout account connected. Waiting payouts have been sent.' : 'Payout account disconnected.'));
    } catch { /* shown */ }
  };
  return (
    <section className="panel p-5">
      <h3 className="flex items-center gap-2 text-xl">{data.connected ? <CircleCheck className="h-5 w-5 text-go" aria-hidden="true" /> : <Wallet className="h-5 w-5 text-ink-faint" aria-hidden="true" />}Payout account</h3>
      <ErrorNote className="mt-3">{state.error && errorMessage(state.error)}</ErrorNote>
      {data.provider === 'stripe' && (
        <>
          <p className="mt-2 text-sm text-ink-soft">{data.connected ? 'Your Stripe account is connected. Your share of every order is transferred to it when the customer pays.' : data.account.stripeStarted ? 'You started Stripe onboarding but Stripe still needs some details before it can send you money.' : 'Payouts go through Stripe Connect. Stripe asks for your details on its own secure page; Awning never sees your bank account.'}</p>
          {!data.connected && <button type="button" className="btn-primary mt-4" disabled={state.isLoading} onClick={() => run({})}>{state.isLoading ? <Spinner /> : <ExternalLink className="h-4 w-4" />}{data.account.stripeStarted ? 'Finish Stripe onboarding' : 'Connect with Stripe'}</button>}
          {data.account.stripeAccountId && <p className="mt-3 text-xs text-ink-faint">Account {data.account.stripeAccountId}</p>}
        </>
      )}
      {data.provider === 'razorpay' && (
        <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); run({ razorpayAccountId: acc.trim() }); }}>
          <p className="text-sm text-ink-soft">Payouts go through Razorpay Route. The marketplace team creates a linked account for your shop in Razorpay and gives you its id.</p>
          <Field label="Linked account id" hint="Starts with acc_"><input className="field tabular" value={acc} onChange={(e) => setAcc(e.target.value)} placeholder="acc_XXXXXXXXXXXXXX" /></Field>
          <button type="submit" className="btn-primary" disabled={state.isLoading || !acc.trim()}>{state.isLoading && <Spinner />}{data.connected ? 'Update' : 'Connect'}</button>
        </form>
      )}
      {data.provider === 'test' && (
        <>
          <p className="mt-2 flex items-start gap-2 rounded-lg bg-star-light px-3 py-2.5 text-sm text-star-deep"><FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Test mode. Connecting simulates a bank account so you can see payouts move. With Stripe or Razorpay configured, this becomes their real onboarding.</p>
          <button type="button" className={data.connected ? 'btn-outline mt-4' : 'btn-primary mt-4'} disabled={state.isLoading} onClick={() => run({ disconnect: data.connected })}>{state.isLoading && <Spinner />}{data.connected ? 'Disconnect test account' : 'Connect a test payout account'}</button>
        </>
      )}
    </section>
  );
}

export default function VendorPayouts() {
  const dispatch = useDispatch();
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useGetPayoutsQuery();
  useEffect(() => {
    if (params.get('stripe') === 'return') { dispatch(toast.info('Back from Stripe. If anything is still missing, Stripe will say so here.')); setParams({}, { replace: true }); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (isLoading) return <PageLoader />;
  return (
    <div>
      <h2 className="text-3xl">Payouts</h2>
      <p className="mt-1 text-sm text-ink-soft">When a customer pays, the payment is split: the marketplace keeps {data.commissionPercent}% of the goods, and the rest, with the shipping, is yours.</p>
      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat label="Paid out to you" value={money(data.summary.transferred)} sub="all time" />
            <Stat label="Waiting to be paid" value={money(data.summary.pending)} sub={data.connected ? 'being processed' : 'connect a payout account to receive it'} />
          </div>
          <section className="panel overflow-x-auto">
            <h3 className="border-b border-line px-5 py-4 text-xl">Ledger</h3>
            <table className="w-full min-w-[40rem] text-sm">
              <thead><tr className="text-left text-xs text-ink-faint"><th className="px-5 py-2.5 font-semibold">Order</th><th className="px-3 py-2.5 text-right font-semibold">Customer paid</th><th className="px-3 py-2.5 text-right font-semibold">Commission</th><th className="px-3 py-2.5 text-right font-semibold">You receive</th><th className="px-5 py-2.5 font-semibold">Payout</th></tr></thead>
              <tbody className="divide-y divide-line">
                {data.ledger.map((r) => (
                  <tr key={r.orderId} className={r.status === 'cancelled' ? 'text-ink-faint' : undefined}>
                    <td className="px-5 py-2.5"><p className="font-semibold">{r.number}</p><p className="text-xs text-ink-faint">{dateLabel(r.paidAt)}{r.status === 'cancelled' && ', cancelled'}</p></td>
                    <td className="px-3 py-2.5 text-right tabular">{money(r.total)}</td>
                    <td className="px-3 py-2.5 text-right tabular text-ink-faint">-{money(r.commission)} <span className="text-2xs">({r.commissionPercent}%)</span></td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular">{money(r.vendorNet)}</td>
                    <td className="px-5 py-2.5"><span className="inline-flex items-center gap-1.5"><StatusTag status={r.payout.status}>{{ transferred: 'Paid', pending: 'Waiting', reversed: 'Reversed', none: 'None' }[r.payout.status]}</StatusTag>{r.payout.status === 'pending' && <Clock className="h-3.5 w-3.5 text-ink-faint" aria-label={r.payout.note} />}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.ledger.length === 0 && <p className="px-5 py-8 text-center text-sm text-ink-faint">Payouts appear here after your first sale.</p>}
          </section>
        </div>
        <ConnectCard data={data} />
      </div>
    </div>
  );
}
