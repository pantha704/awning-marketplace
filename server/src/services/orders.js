/**
 * Order lifecycle: reserve stock and create the order, confirm payment,
 * move parcels through placed -> packed -> shipped -> delivered, cancel and refund.
 */
import { customAlphabet } from 'nanoid';
import { config } from '../config.js';
import { Order, Product, Coupon, Vendor, ORDER_STEPS } from '../models/index.js';
import { split } from './pricing.js';
import { clearCart } from './cart.js';
import { syncProducts } from './search/index.js';
import { kv, keys } from './kv.js';
import { settlePayouts, refundParcel } from './payments/index.js';
import { HttpError, badRequest } from '../utils/http.js';
import { log } from '../utils/log.js';

const orderNumber = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 8);
export const PENDING_MINUTES = 30;

async function restoreStock(items) {
  await Product.bulkWrite(items.map((l) => ({ updateOne: { filter: { _id: l.product }, update: { $inc: { stock: l.qty } } } })));
  syncProducts(items.map((l) => l.product));
}

/**
 * Create an unpaid order from a priced cart. Stock is reserved atomically,
 * one product at a time; if any product runs out mid-way everything taken so
 * far is put back and the buyer is told which item is short.
 */
export async function createOrder({ user, priced, address, provider }) {
  const lines = priced.lines.filter((l) => l.available);
  if (!lines.length && priced.lines.length) throw new HttpError(409, 'The items in your cart are no longer available. Review your cart.');
  if (!lines.length) throw badRequest('Your cart is empty.');
  if (priced.hasIssues) throw new HttpError(409, 'Some items in your cart changed. Review your cart and try again.');

  const taken = [];
  for (const line of lines) {
    const ok = await Product.updateOne({ _id: line.productId, status: 'active', stock: { $gte: line.qty } }, { $inc: { stock: -line.qty } });
    if (!ok.modifiedCount) {
      if (taken.length) await restoreStock(taken);
      throw new HttpError(409, `“${line.title}” just sold out or has fewer left than you asked for. Review your cart and try again.`);
    }
    taken.push({ product: line.productId, qty: line.qty });
  }

  try {
    const order = await Order.create({
      number: `AW-${orderNumber()}`,
      customer: user.id,
      items: lines.map((l) => ({ product: l.productId, vendor: l.vendor.id, title: l.title, slug: l.slug, image: l.imageKey, price: l.price, qty: l.qty, lineTotal: l.lineTotal, discount: l.discount })),
      vendorOrders: priced.groups.map((g) => ({
        vendor: g.vendor.id, vendorName: g.vendor.name, subtotal: g.subtotal, discount: g.discount, shipping: g.shipping, total: g.total,
        commissionPercent: g.commissionPercent, ...split(g), status: 'placed', history: [{ status: 'placed', at: new Date() }],
      })),
      shippingAddress: address,
      subtotal: priced.subtotal, discount: priced.discount, shippingTotal: priced.shippingTotal, total: priced.total,
      currency: config.currency,
      coupon: priced.coupon ? { code: priced.coupon.code, vendor: priced.coupon.vendorId || undefined } : undefined,
      payment: { provider, status: 'pending' },
    });
    syncProducts(taken.map((t) => t.product));
    return order;
  } catch (err) {
    await restoreStock(taken);
    throw err;
  }
}

/** Payment confirmed: mark paid, count the sale, empty the cart and pay the shops. Safe to call twice. */
export async function markPaid(orderId, { chargeRef } = {}) {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, 'payment.status': { $in: ['pending', 'expired', 'failed'] } },
    { $set: { 'payment.status': 'paid', 'payment.paidAt': new Date(), ...(chargeRef ? { 'payment.chargeRef': chargeRef } : {}) } },
    { returnDocument: 'after' }
  );
  if (!order) return Order.findById(orderId); // already paid (webhook and redirect both arrived)

  if (!order.stockReserved) {
    // Paid after the reservation lapsed: take the stock again (may go to zero, never negative).
    for (const l of order.items) await Product.updateOne({ _id: l.product }, [{ $set: { stock: { $max: [0, { $subtract: ['$stock', l.qty] }] } } }]);
    order.stockReserved = true;
  }
  await Product.bulkWrite(order.items.map((l) => ({ updateOne: { filter: { _id: l.product }, update: { $inc: { soldCount: l.qty } } } })));
  if (order.coupon?.code) await Coupon.updateOne({ code: order.coupon.code }, { $inc: { usedCount: 1 } });
  await clearCart(String(order.customer));
  await kv.del(keys.home());
  try {
    await settlePayouts(order);
  } catch (err) {
    log.error(`Payout settlement for ${order.number} failed: ${err.message}`);
  }
  await order.save();
  syncProducts(order.items.map((l) => l.product));
  return order;
}

/** An unpaid order is abandoned or its payment failed: give the stock back. */
export async function releaseOrder(orderId, status = 'expired') {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, 'payment.status': 'pending', stockReserved: true },
    { $set: { 'payment.status': status, stockReserved: false } },
    { returnDocument: 'after' }
  );
  if (order) await restoreStock(order.items);
  return order;
}

/** Unpaid orders hold stock for 30 minutes, then let it go. */
export async function sweepExpired() {
  const stale = await Order.find({ 'payment.status': 'pending', stockReserved: true, createdAt: { $lt: new Date(Date.now() - PENDING_MINUTES * 60000) } }).select('_id').lean();
  for (const o of stale) await releaseOrder(o._id, 'expired');
  return stale.length;
}

const vendorOf = (vo) => String(vo.vendor?._id || vo.vendor); // works whether or not the shop is populated

function parcel(order, { parcelId, vendorId }) {
  const vo = parcelId ? order.vendorOrders.id(parcelId) : order.vendorOrders.find((v) => vendorOf(v) === String(vendorId));
  if (!vo) throw new HttpError(404, 'That parcel is not part of this order.');
  return vo;
}

/** Move a parcel one step forward. Steps cannot be skipped or reversed. */
export async function advanceParcel(order, { parcelId, vendorId, to, tracking }) {
  if (order.payment.status !== 'paid') throw badRequest('This order has not been paid.');
  const vo = parcel(order, { parcelId, vendorId });
  if (vo.status === 'cancelled') throw badRequest('This parcel was cancelled.');
  const next = ORDER_STEPS[ORDER_STEPS.indexOf(vo.status) + 1];
  if (!next) throw badRequest('This parcel has already been delivered.');
  if (to !== next) throw badRequest(`This parcel is “${vo.status}”. The next step is “${next}”.`);
  if (to === 'shipped') {
    if (!tracking?.carrier?.trim() || !tracking?.number?.trim()) throw badRequest('Add the carrier and tracking number to mark the parcel as shipped.');
    vo.tracking = { carrier: tracking.carrier.trim(), number: tracking.number.trim() };
  }
  vo.status = to;
  vo.history.push({ status: to, at: new Date() });
  await order.save();
  return vo;
}

/**
 * Cancel one parcel. Customers may cancel until the shop has packed it; shops
 * and admins until it ships. Stock returns, the customer is refunded and the
 * shop's payout is reversed.
 */
export async function cancelParcel(order, { parcelId, vendorId, by, note = '' }) {
  if (order.payment.status !== 'paid') throw badRequest('This order has not been paid.');
  const vo = parcel(order, { parcelId, vendorId });
  const allowed = by === 'customer' ? ['placed'] : ['placed', 'packed'];
  if (!allowed.includes(vo.status)) {
    throw badRequest(vo.status === 'cancelled' ? 'This parcel is already cancelled.' : by === 'customer' ? 'The shop has already packed this parcel, so it can no longer be cancelled. Contact the shop.' : 'A shipped parcel cannot be cancelled.');
  }
  vo.status = 'cancelled';
  vo.history.push({ status: 'cancelled', at: new Date(), note: note || `Cancelled by the ${by}` });
  const lines = order.items.filter((l) => String(l.vendor) === vendorOf(vo));
  await restoreStock(lines);
  await Product.bulkWrite(lines.map((l) => ({ updateOne: { filter: { _id: l.product }, update: { $inc: { soldCount: -l.qty } } } })));
  try {
    await refundParcel(order, vo);
  } catch (err) {
    log.error(`Refund for ${order.number} failed: ${err.message}`);
    vo.refund = { amount: 0, ref: `failed: ${String(err.message).slice(0, 120)}`, at: new Date() };
  }
  await order.save();
  return vo;
}

export const commissionFor = (vendor) => vendor.commissionPercent ?? config.commissionPercent;
export { Vendor };
