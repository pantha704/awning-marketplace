/**
 * Payments with split payouts. One customer payment covers parcels from
 * several shops; each shop is paid its share and the platform keeps a commission.
 *
 *   stripe    Stripe Connect: Checkout on the platform account, then one
 *             Transfer per shop ("separate charges and transfers").
 *   razorpay  Razorpay Route: the order carries a transfer per linked account.
 *   test      Built-in gateway for local development. Same bookkeeping, no network.
 */
import { config } from '../../config.js';
import { Vendor } from '../../models/index.js';
import * as stripeDriver from './stripe.js';
import * as razorpayDriver from './razorpay.js';

export const provider = () => config.paymentProvider;

/** Begin payment for an unpaid order. Returns what the browser needs to continue. */
export async function startPayment(order, user) {
  if (provider() === 'stripe') return stripeDriver.start(order, user);
  if (provider() === 'razorpay') return razorpayDriver.start(order, user);
  order.payment.ref = `test_${order._id}`;
  await order.save();
  return { provider: 'test', orderId: String(order._id) };
}

/** After the customer has paid: move each shop's share to that shop. */
export async function settlePayouts(order) {
  const vendors = new Map((await Vendor.find({ _id: { $in: order.vendorOrders.map((v) => v.vendor) } }).lean()).map((v) => [String(v._id), v]));
  for (const vo of order.vendorOrders) {
    if (vo.payout.status === 'transferred' || vo.status === 'cancelled') continue;
    const vendor = vendors.get(String(vo.vendor));
    let result;
    if (order.payment.provider === 'stripe') result = await stripeDriver.transfer(order, vo, vendor);
    else if (order.payment.provider === 'razorpay') result = razorpayDriver.transferResult(order, vo, vendor);
    else result = vendor?.payout?.testConnected ? { status: 'transferred', ref: `test_tr_${vo._id}` } : { status: 'pending', note: 'The shop has not connected a payout account yet.' };
    vo.payout = { status: result.status, ref: result.ref, note: result.note || '', at: result.status === 'transferred' ? new Date() : undefined };
  }
}

/** Refund the customer for a cancelled parcel and take the payout back from the shop. */
export async function refundParcel(order, vo) {
  let ref = `test_re_${vo._id}`;
  if (order.payment.provider === 'stripe') ref = await stripeDriver.refund(order, vo);
  else if (order.payment.provider === 'razorpay') ref = await razorpayDriver.refund(order, vo);
  vo.refund = { amount: vo.total, ref, at: new Date() };
  if (vo.payout.status === 'transferred') vo.payout = { status: 'reversed', ref: vo.payout.ref, at: new Date(), note: 'Reversed after cancellation' };
  else vo.payout = { status: 'none', note: 'Cancelled before payout' };
}

export const TEST_CARDS = {
  '4242424242424242': { ok: true },
  '5555555555554444': { ok: true },
  '4000000000000002': { ok: false, message: 'The card was declined. Try 4242 4242 4242 4242.' },
  '4000000000009995': { ok: false, message: 'The card has insufficient funds. Try 4242 4242 4242 4242.' },
};
