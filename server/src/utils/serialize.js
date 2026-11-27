import { urlFor } from '../services/storage.js';

const id = (v) => (v == null ? v : String(v._id || v));
const pctOff = (p) => (p.compareAtPrice > p.price ? Math.round((1 - p.price / p.compareAtPrice) * 100) : 0);

export function vendorBrief(v) {
  if (!v || !v.name) return v ? { id: id(v) } : null;
  return { id: id(v), name: v.name, slug: v.slug, color: v.color };
}

export function vendorPublic(v) {
  return {
    ...vendorBrief(v), tagline: v.tagline, description: v.description, location: v.location, logoUrl: urlFor(v.logoKey),
    productCount: v.productCount, ratingAvg: v.ratingAvg, ratingCount: v.ratingCount, since: v.approvedAt || v.createdAt,
  };
}

export function vendorPrivate(v, extra = {}) {
  return {
    ...vendorPublic(v), status: v.status, reviewNote: v.reviewNote, contactEmail: v.contactEmail, commissionPercent: v.commissionPercent,
    payout: { stripeAccountId: v.payout?.stripeAccountId || '', stripeReady: !!v.payout?.stripeReady, razorpayAccountId: v.payout?.razorpayAccountId || '', testConnected: !!v.payout?.testConnected },
    createdAt: v.createdAt, ...extra,
  };
}

export function productCard(p) {
  return {
    id: id(p), slug: p.slug, title: p.title, category: p.category, brand: p.brand,
    price: p.price, compareAtPrice: p.compareAtPrice > p.price ? p.compareAtPrice : 0, discountPercent: pctOff(p),
    stock: p.stock, inStock: p.stock > 0, image: urlFor(p.images?.[0]),
    ratingAvg: p.ratingAvg, ratingCount: p.ratingCount, soldCount: p.soldCount, status: p.status,
    vendor: vendorBrief(p.vendor), createdAt: p.createdAt,
  };
}

export function productFull(p) {
  return { ...productCard(p), description: p.description, tags: p.tags || [], attributes: p.attributes || [], images: (p.images || []).map(urlFor), imageKeys: p.images || [], rawCompareAtPrice: p.compareAtPrice };
}

export function reviewView(r) {
  return { id: id(r), rating: r.rating, title: r.title, body: r.body, authorName: r.authorName, createdAt: r.createdAt, reply: r.reply?.body ? { body: r.reply.body, at: r.reply.at } : null, productId: id(r.product), product: r.product?.title ? { id: id(r.product), title: r.product.title, slug: r.product.slug } : undefined };
}

export function couponView(c) {
  return {
    id: id(c), code: c.code, description: c.description, type: c.type, value: c.value, minSubtotal: c.minSubtotal, maxDiscount: c.maxDiscount,
    vendorId: c.vendor ? id(c.vendor) : null, vendorName: c.vendor?.name, startsAt: c.startsAt, expiresAt: c.expiresAt, usageLimit: c.usageLimit,
    perCustomerLimit: c.perCustomerLimit, usedCount: c.usedCount, active: c.active, createdAt: c.createdAt,
  };
}

/** Overall status of an order, derived from its parcels. */
export function overallStatus(order) {
  if (order.payment.status !== 'paid') return order.payment.status === 'pending' ? 'awaiting payment' : order.payment.status;
  const live = order.vendorOrders.filter((v) => v.status !== 'cancelled');
  if (!live.length) return 'cancelled';
  for (const step of ['placed', 'packed', 'shipped']) if (live.some((v) => v.status === step)) return step;
  return 'delivered';
}

export function vendorOrderView(order, vo, { forVendor = false } = {}) {
  const lines = order.items.filter((l) => String(l.vendor) === String(vo.vendor._id || vo.vendor));
  return {
    id: id(vo), vendor: vo.vendor?.name ? vendorBrief(vo.vendor) : { id: id(vo.vendor), name: vo.vendorName },
    status: vo.status, tracking: vo.tracking, history: vo.history,
    subtotal: vo.subtotal, discount: vo.discount, shipping: vo.shipping, total: vo.total,
    items: lines.map((l) => ({ productId: id(l.product), slug: l.slug, title: l.title, image: urlFor(l.image), price: l.price, qty: l.qty, lineTotal: l.lineTotal, discount: l.discount })),
    refund: vo.refund?.amount ? vo.refund : null,
    ...(forVendor ? { commissionPercent: vo.commissionPercent, commission: vo.commission, vendorNet: vo.vendorNet, payout: vo.payout } : {}),
  };
}

export function orderView(order, { admin = false } = {}) {
  return {
    id: id(order), number: order.number, createdAt: order.createdAt, status: overallStatus(order), currency: order.currency,
    subtotal: order.subtotal, discount: order.discount, shippingTotal: order.shippingTotal, total: order.total,
    coupon: order.coupon?.code || null, shippingAddress: order.shippingAddress,
    payment: { provider: order.payment.provider, status: order.payment.status, paidAt: order.payment.paidAt },
    itemCount: order.items.reduce((n, l) => n + l.qty, 0),
    parcels: order.vendorOrders.map((vo) => vendorOrderView(order, vo, { forVendor: admin })),
    customer: order.customer?.name ? { id: id(order.customer), name: order.customer.name, email: order.customer.email } : undefined,
  };
}
