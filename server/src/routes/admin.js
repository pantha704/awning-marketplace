import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { User, Vendor, Product, Order, Coupon, ROLES, ORDER_STATUSES } from '../models/index.js';
import { requireRole, dropSession } from '../middleware/auth.js';
import { syncVendor, syncProduct, searchInfo } from '../services/search/index.js';
import { advanceParcel, cancelParcel } from '../services/orders.js';
import { totals, dailySeries, topProducts, rangeStart, cleanDays, parcelPipeline } from '../services/analytics.js';
import { kv, keys, kvInfo } from '../services/kv.js';
import { provider } from '../services/payments/index.js';
import { couponSchema, saveCoupon } from './vendor.js';
import { wrap, validate, badRequest, notFound, escapeRegex } from '../utils/http.js';
import { vendorPrivate, productCard, couponView, orderView } from '../utils/serialize.js';
import { config } from '../config.js';

const router = Router();
router.use(requireRole('admin'));
const isId = (v) => mongoose.isValidObjectId(v);

/** The analytics page: sales, commission, trends and leaderboards. */
router.get('/analytics', wrap(async (req, res) => {
  const days = cleanDays(req.query.days);
  const since = rangeStart(days);
  const previousSince = new Date(since.getTime() - days * 24 * 3600 * 1000);
  const [range, previous, lifetime, series, best, topVendors, byCategory, byStatus, newCustomers, customers, vendorCounts, products, lowStock] = await Promise.all([
    totals({ since }), totals({ since: previousSince, until: since }), totals({}), dailySeries({}, days), topProducts({ since }, 6),
    Order.aggregate([...parcelPipeline({ since }), { $group: { _id: '$vendorOrders.vendor', name: { $first: '$vendorOrders.vendorName' }, gross: { $sum: '$vendorOrders.total' }, commission: { $sum: '$vendorOrders.commission' }, parcels: { $sum: 1 } } }, { $sort: { gross: -1 } }, { $limit: 6 }]),
    Order.aggregate([
      { $match: { 'payment.status': 'paid', 'payment.paidAt': { $gte: since } } }, { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'p' } },
      { $group: { _id: { $ifNull: [{ $first: '$p.category' }, 'Removed products'] }, revenue: { $sum: { $subtract: ['$items.lineTotal', '$items.discount'] } }, units: { $sum: '$items.qty' } } },
      { $sort: { revenue: -1 } },
    ]),
    Order.aggregate([{ $match: { 'payment.status': 'paid' } }, { $unwind: '$vendorOrders' }, { $group: { _id: '$vendorOrders.status', count: { $sum: 1 } } }]),
    User.countDocuments({ role: 'customer', createdAt: { $gte: since } }),
    User.countDocuments({ role: 'customer' }),
    Vendor.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Product.countDocuments({ status: 'active' }),
    Product.countDocuments({ status: 'active', stock: 0 }),
  ]);
  const vendors = Object.fromEntries(vendorCounts.map((v) => [v._id, v.count]));
  res.json({
    days, currency: config.currency, commissionPercent: config.commissionPercent,
    range, previous, lifetime, series,
    averageOrder: range.orders ? Math.round(range.gross / range.orders) : 0,
    topProducts: best,
    topVendors: topVendors.map((v) => ({ vendorId: String(v._id), name: v.name, gross: v.gross, commission: v.commission, parcels: v.parcels })),
    categories: byCategory.map((c) => ({ name: c._id, revenue: c.revenue, units: c.units })),
    parcels: Object.fromEntries(ORDER_STATUSES.map((s) => [s, byStatus.find((b) => b._id === s)?.count || 0])),
    customers: { total: customers, new: newCustomers },
    vendors: { approved: vendors.approved || 0, pending: vendors.pending || 0, suspended: vendors.suspended || 0 },
    products: { active: products, outOfStock: lowStock },
    system: { search: searchInfo.driver, cache: kvInfo.driver, storage: config.storageDriver, payments: provider() },
  });
}));

/* ---------- Shops: approval, suspension, commission ---------- */

router.get('/vendors', wrap(async (req, res) => {
  const filter = ['pending', 'approved', 'suspended'].includes(req.query.status) ? { status: req.query.status } : {};
  const vendors = await Vendor.find(filter).sort({ createdAt: -1 }).populate('owner', 'name email').lean();
  const sales = await Order.aggregate([...parcelPipeline({}), { $group: { _id: '$vendorOrders.vendor', gross: { $sum: '$vendorOrders.total' }, commission: { $sum: '$vendorOrders.commission' } } }]);
  const byVendor = new Map(sales.map((s) => [String(s._id), s]));
  res.json({
    defaultCommission: config.commissionPercent,
    items: vendors.map((v) => vendorPrivate(v, { owner: v.owner ? { name: v.owner.name, email: v.owner.email } : null, gross: byVendor.get(String(v._id))?.gross || 0, commissionEarned: byVendor.get(String(v._id))?.commission || 0 })),
  });
}));

const vendorPatch = z.object({
  status: z.enum(['pending', 'approved', 'suspended']).optional(),
  reviewNote: z.string().trim().max(300).optional(),
  commissionPercent: z.number().min(0).max(60).nullable().optional(),
});
router.patch('/vendors/:id', validate(vendorPatch), wrap(async (req, res) => {
  if (!isId(req.params.id)) throw notFound('Shop not found.');
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) throw notFound('Shop not found.');
  const statusChanged = req.body.status && req.body.status !== vendor.status;
  Object.assign(vendor, req.body);
  if (statusChanged && vendor.status === 'approved') { vendor.approvedAt = vendor.approvedAt || new Date(); vendor.reviewNote = ''; }
  await vendor.save();
  if (statusChanged) {
    // Approval puts the shop's products into search; suspension takes them out.
    await dropSession(vendor.owner);
    await syncVendor(vendor._id);
    await kv.del(keys.home());
  }
  res.json({ shop: vendorPrivate(vendor) });
}));

/* ---------- People ---------- */

router.get('/users', wrap(async (req, res) => {
  const filter = {};
  if (ROLES.includes(req.query.role)) filter.role = req.query.role;
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 25;
  const [users, total] = await Promise.all([User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), User.countDocuments(filter)]);
  res.json({ items: users.map((u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role, disabled: !!u.disabled, createdAt: u.createdAt })), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}));

router.patch('/users/:id', validate(z.object({ role: z.enum(ROLES).optional(), disabled: z.boolean().optional() })), wrap(async (req, res) => {
  if (!isId(req.params.id)) throw notFound('User not found.');
  if (req.user.id === req.params.id) throw badRequest('You cannot change your own role or disable yourself.');
  const user = await User.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
  if (!user) throw notFound('User not found.');
  await dropSession(user._id); // takes effect on the user's very next request
  res.json({ user: { id: String(user._id), name: user.name, email: user.email, role: user.role, disabled: user.disabled, createdAt: user.createdAt } });
}));

/* ---------- Orders ---------- */

router.get('/orders', wrap(async (req, res) => {
  const filter = { 'payment.status': 'paid' };
  if (ORDER_STATUSES.includes(req.query.status)) filter['vendorOrders.status'] = req.query.status;
  if (req.query.q) filter.number = new RegExp(escapeRegex(String(req.query.q).slice(0, 40)), 'i');
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 15;
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ 'payment.paidAt': -1 }).skip((page - 1) * limit).limit(limit).populate('customer', 'name email').populate('vendorOrders.vendor', 'name slug color'),
    Order.countDocuments(filter),
  ]);
  res.json({ items: orders.map((o) => orderView(o, { admin: true })), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}));

async function loadOrder(id) {
  if (!isId(id)) throw notFound('Order not found.');
  const order = await Order.findById(id);
  if (!order) throw notFound('Order not found.');
  return order;
}
const reload = (id) => Order.findById(id).populate('customer', 'name email').populate('vendorOrders.vendor', 'name slug color');

router.post('/orders/:id/parcels/:parcelId/advance', validate(z.object({ to: z.enum(['packed', 'shipped', 'delivered']), tracking: z.object({ carrier: z.string(), number: z.string() }).optional() })), wrap(async (req, res) => {
  const order = await loadOrder(req.params.id);
  await advanceParcel(order, { parcelId: req.params.parcelId, to: req.body.to, tracking: req.body.tracking });
  res.json({ order: orderView(await reload(order._id), { admin: true }) });
}));
router.post('/orders/:id/parcels/:parcelId/cancel', wrap(async (req, res) => {
  const order = await loadOrder(req.params.id);
  await cancelParcel(order, { parcelId: req.params.parcelId, by: 'marketplace' });
  res.json({ order: orderView(await reload(order._id), { admin: true }) });
}));

/* ---------- Coupons valid across the marketplace ---------- */

router.get('/coupons', wrap(async (_req, res) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 }).populate('vendor', 'name').lean();
  res.json({ items: coupons.map(couponView) });
}));
router.post('/coupons', validate(couponSchema), wrap(async (req, res) => res.status(201).json({ coupon: couponView(await saveCoupon(req.body, {})) })));
router.patch('/coupons/:id', validate(couponSchema), wrap(async (req, res) => {
  if (!isId(req.params.id)) throw notFound('Coupon not found.');
  const existing = await Coupon.findById(req.params.id).select('vendor').lean();
  if (!existing) throw notFound('Coupon not found.');
  res.json({ coupon: couponView(await saveCoupon(req.body, { couponId: req.params.id, vendorId: existing.vendor })) });
}));
router.delete('/coupons/:id', wrap(async (req, res) => {
  if (!isId(req.params.id)) throw notFound('Coupon not found.');
  await Coupon.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}));

/* ---------- Product moderation ---------- */

router.get('/products', wrap(async (req, res) => {
  const filter = {};
  if (req.query.q) filter.title = new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), 'i');
  if (['draft', 'active', 'archived'].includes(req.query.status)) filter.status = req.query.status;
  const products = await Product.find(filter).sort({ createdAt: -1 }).limit(100).populate('vendor', 'name slug color').lean();
  res.json({ items: products.map(productCard) });
}));
router.patch('/products/:id', validate(z.object({ status: z.enum(['active', 'archived']) })), wrap(async (req, res) => {
  if (!isId(req.params.id)) throw notFound('Product not found.');
  const product = await Product.findByIdAndUpdate(req.params.id, { status: req.body.status }, { returnDocument: 'after' }).populate('vendor', 'name slug color');
  if (!product) throw notFound('Product not found.');
  await Vendor.updateOne({ _id: product.vendor._id }, { productCount: await Product.countDocuments({ vendor: product.vendor._id, status: 'active' }) });
  await syncProduct(product._id);
  await kv.del(keys.home());
  res.json({ product: productCard(product) });
}));

export default router;
