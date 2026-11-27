/**
 * Cart pricing. The server is the only place prices, stock, shipping and
 * coupons are calculated; the browser just displays the result.
 */
import mongoose from 'mongoose';
import { config } from '../config.js';
import { Product, Coupon, Order } from '../models/index.js';
import { urlFor } from './storage.js';
import { vendorBrief } from '../utils/serialize.js';

export const MAX_QTY = 20;

/** Check a coupon against a priced cart. Returns { coupon, eligible lines, discount } or { error }. */
export async function evaluateCoupon(code, lines, userId) {
  if (!code) return {};
  const coupon = await Coupon.findOne({ code: String(code).toUpperCase().trim() }).populate('vendor', 'name');
  const now = new Date();
  if (!coupon || !coupon.active) return { error: 'This code is not valid.' };
  if (coupon.startsAt && coupon.startsAt > now) return { error: 'This code is not active yet.' };
  if (coupon.expiresAt && coupon.expiresAt < now) return { error: 'This code has expired.' };
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) return { error: 'This code has been used up.' };

  const eligible = lines.filter((l) => l.available && (!coupon.vendor || String(coupon.vendor._id) === l.vendor.id));
  if (!eligible.length) return { error: coupon.vendor ? `This code only works on items from ${coupon.vendor.name}.` : 'Add an item to use this code.' };
  const base = eligible.reduce((sum, l) => sum + l.lineTotal, 0);
  if (base < coupon.minSubtotal) return { error: `Spend ${(coupon.minSubtotal / 100).toFixed(2)} ${config.currency.toUpperCase()} ${coupon.vendor ? `at ${coupon.vendor.name} ` : ''}to use this code.`, coupon };

  if (userId && coupon.perCustomerLimit) {
    const used = await Order.countDocuments({ customer: userId, 'coupon.code': coupon.code, 'payment.status': { $in: ['paid', 'pending'] } });
    if (used >= coupon.perCustomerLimit) return { error: 'You have already used this code.' };
  }

  let discount = coupon.type === 'percent' ? Math.round((base * coupon.value) / 100) : coupon.value;
  if (coupon.type === 'percent' && coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.min(discount, base);
  return { coupon, eligible, discount, base };
}

/** Spread a discount over lines in proportion to their value, exact to the cent. */
export function allocate(discount, lines) {
  const base = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  let left = discount;
  lines.forEach((line, i) => {
    const share = i === lines.length - 1 ? left : Math.min(left, Math.round((discount * line.lineTotal) / base));
    line.discount = share;
    left -= share;
  });
}

/**
 * Turn a raw cart ({ items: { productId: qty }, coupon }) into priced lines,
 * one group per shop, and totals. Never throws for stale carts: lines that can
 * no longer be bought are flagged and left out of the totals.
 */
export async function priceCart(raw, { userId } = {}) {
  const entries = Object.entries(raw?.items || {}).filter(([pid, qty]) => mongoose.isValidObjectId(pid) && qty > 0);
  const products = await Product.find({ _id: { $in: entries.map(([pid]) => pid) } }).populate('vendor', 'name slug color status commissionPercent').lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const lines = [];
  for (const [pid, wanted] of entries) {
    const p = byId.get(pid);
    if (!p) continue; // deleted products silently leave the cart
    const sellable = p.status === 'active' && p.vendor?.status === 'approved';
    const qty = Math.min(wanted, MAX_QTY, Math.max(p.stock, 0));
    const available = sellable && qty > 0;
    lines.push({
      productId: pid, slug: p.slug, title: p.title, image: urlFor(p.images?.[0]), imageKey: p.images?.[0] || '',
      price: p.price, compareAtPrice: p.compareAtPrice > p.price ? p.compareAtPrice : 0,
      qty: available ? qty : wanted, maxQty: Math.min(MAX_QTY, p.stock), stock: p.stock,
      lineTotal: available ? p.price * qty : 0, discount: 0, available,
      note: !sellable ? 'No longer available' : p.stock <= 0 ? 'Out of stock' : qty < wanted ? `Only ${p.stock} left, quantity reduced` : '',
      vendor: vendorBrief(p.vendor), commissionPercent: p.vendor?.commissionPercent,
    });
  }

  const live = lines.filter((l) => l.available);
  let coupon = null;
  let couponError = '';
  if (raw?.coupon) {
    const result = await evaluateCoupon(raw.coupon, lines, userId);
    if (result.error) couponError = result.error;
    else if (result.coupon) {
      allocate(result.discount, result.eligible);
      coupon = { code: result.coupon.code, description: result.coupon.description, discount: result.discount, vendorId: result.coupon.vendor ? String(result.coupon.vendor._id) : null };
    }
  }

  const groups = [];
  for (const line of live) {
    let group = groups.find((g) => g.vendor.id === line.vendor.id);
    if (!group) groups.push((group = { vendor: line.vendor, commissionPercent: line.commissionPercent ?? config.commissionPercent, subtotal: 0, discount: 0, itemCount: 0 }));
    group.subtotal += line.lineTotal;
    group.discount += line.discount;
    group.itemCount += line.qty;
  }
  for (const group of groups) {
    // Shipping is charged per shop, because each shop sends its own parcel.
    group.shipping = group.subtotal >= config.freeShippingOver ? 0 : config.shippingFlat;
    group.freeShippingGap = Math.max(0, config.freeShippingOver - group.subtotal);
    group.total = group.subtotal - group.discount + group.shipping;
  }

  const sum = (key) => groups.reduce((n, g) => n + g[key], 0);
  return {
    lines: lines.map(({ commissionPercent, ...rest }) => rest),
    groups,
    itemCount: live.reduce((n, l) => n + l.qty, 0),
    subtotal: sum('subtotal'), discount: sum('discount'), shippingTotal: sum('shipping'), total: sum('total'),
    coupon, couponError, couponCode: raw?.coupon || '',
    hasIssues: lines.some((l) => l.note),
    currency: config.currency,
    shipping: { flat: config.shippingFlat, freeOver: config.freeShippingOver },
  };
}

/** Platform commission and shop earnings for one parcel. Shipping goes to the shop in full. */
export function split(group) {
  const goods = group.subtotal - group.discount;
  const commission = Math.round((goods * group.commissionPercent) / 100);
  return { commission, vendorNet: goods - commission + group.shipping };
}
