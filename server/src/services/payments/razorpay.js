/**
 * Razorpay with Route (split payments). Plain REST calls with basic auth,
 * so there is no SDK version to keep in step.
 */
import crypto from 'node:crypto';
import { config } from '../../config.js';
import { Vendor } from '../../models/index.js';

const { razorpay } = config;

async function api(method, path, body) {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${razorpay.keyId}:${razorpay.keySecret}`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Razorpay ${path} failed (${res.status}): ${data?.error?.description || 'unknown error'}`);
  return data;
}

export async function start(order, user) {
  const vendors = new Map((await Vendor.find({ _id: { $in: order.vendorOrders.map((v) => v.vendor) } }).lean()).map((v) => [String(v._id), v]));
  // Route: each shop with a linked account gets its share straight from this payment.
  const transfers = order.vendorOrders
    .filter((vo) => vendors.get(String(vo.vendor))?.payout?.razorpayAccountId && vo.vendorNet > 0)
    .map((vo) => ({
      account: vendors.get(String(vo.vendor)).payout.razorpayAccountId, amount: vo.vendorNet, currency: order.currency.toUpperCase(),
      notes: { order: order.number, parcel: String(vo._id), shop: vo.vendorName }, on_hold: 0,
    }));
  const rzpOrder = await api('POST', '/orders', {
    amount: order.total, currency: order.currency.toUpperCase(), receipt: order.number, notes: { orderId: String(order._id) },
    ...(transfers.length ? { transfers } : {}),
  });
  order.payment.ref = rzpOrder.id;
  await order.save();
  return {
    provider: 'razorpay', orderId: String(order._id), keyId: razorpay.keyId, razorpayOrderId: rzpOrder.id,
    amount: order.total, currency: order.currency.toUpperCase(), name: 'Awning', description: `Order ${order.number}`,
    prefill: { name: user.name, email: user.email },
  };
}

const hmac = (secret, text) => crypto.createHmac('sha256', secret).update(text).digest('hex');
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Checkout.js hands the browser a signature; only a payment Razorpay really accepted can produce it. */
export function verifyCheckoutSignature({ razorpayOrderId, razorpayPaymentId, signature }) {
  return safeEqual(hmac(razorpay.keySecret, `${razorpayOrderId}|${razorpayPaymentId}`), String(signature || ''));
}
export function verifyWebhookSignature(rawBody, signature) {
  if (!razorpay.webhookSecret) return false;
  return safeEqual(hmac(razorpay.webhookSecret, rawBody), String(signature || ''));
}

/** Transfers were created by Razorpay together with the payment; just record them. */
export function transferResult(order, vo, vendor) {
  if (vendor?.payout?.razorpayAccountId && vo.vendorNet > 0) return { status: 'transferred', ref: `route:${vendor.payout.razorpayAccountId}` };
  return { status: 'pending', note: 'The shop has no Razorpay linked account yet. Settle this payout manually from the Razorpay dashboard.' };
}

export async function refund(order, vo) {
  // First take this shop's Route transfer back, then refund the customer for this parcel only.
  if (vo.payout.status === 'transferred') {
    const list = await api('GET', `/payments/${order.payment.chargeRef}/transfers`);
    const mine = (list.items || []).find((t) => t.notes?.parcel === String(vo._id));
    if (mine) await api('POST', `/transfers/${mine.id}/reversals`, { amount: vo.vendorNet });
  }
  const re = await api('POST', `/payments/${order.payment.chargeRef}/refund`, { amount: vo.total, notes: { order: order.number, parcel: String(vo._id) } });
  return re.id;
}

export const ping = () => api('GET', '/orders?count=1');
