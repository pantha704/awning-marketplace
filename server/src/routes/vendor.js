/** Everything a shop owner does: onboarding, products, orders, payouts, coupons, reviews. */
import { Router } from 'express';
import path from 'node:path';
import mongoose from 'mongoose';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { Vendor, Product, Order, Coupon, Review, User, CATEGORIES, ORDER_STATUSES } from '../models/index.js';
import { requireRole, requireVendor, dropSession } from '../middleware/auth.js';
import { putBuffer, remove } from '../services/storage.js';
import { syncProduct, syncVendor } from '../services/search/index.js';
import { advanceParcel, cancelParcel } from '../services/orders.js';
import { provider } from '../services/payments/index.js';
import * as stripeDriver from '../services/payments/stripe.js';
import { totals, dailySeries, topProducts, rangeStart, cleanDays, parcelPipeline } from '../services/analytics.js';
import { writeInvoicePdf } from '../services/invoicePdf.js';
import { kv, keys } from '../services/kv.js';
import { wrap, validate, validatePatch, badRequest, notFound, slugify, escapeRegex } from '../utils/http.js';
import { vendorPrivate, productCard, productFull, couponView, reviewView, vendorOrderView } from '../utils/serialize.js';
import { config } from '../config.js';

const router = Router();
const isId = (v) => mongoose.isValidObjectId(v);
const owner = requireVendor(); // has a shop (any status)
const selling = requireVendor({ approved: true }); // shop is approved

const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxImageMb * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => (IMAGE_EXT.includes(path.extname(file.originalname).toLowerCase()) && /^image\//.test(file.mimetype) ? cb(null, true) : cb(badRequest('Upload JPG, PNG or WebP images.'))),
});

async function uniqueSlug(Model, text, excludeId) {
  const base = slugify(text);
  let slug = base;
  for (let i = 2; await Model.exists({ slug, _id: { $ne: excludeId } }); i++) slug = `${base}-${i}`;
  return slug;
}
const touchCatalog = () => kv.del(keys.home());

/* ---------- Onboarding and shop profile ---------- */

const shopSchema = z.object({
  name: z.string().trim().min(3, 'Give your shop a name of at least 3 characters.').max(60),
  tagline: z.string().trim().max(120).optional().default(''),
  description: z.string().trim().min(30, 'Describe what you sell in at least 30 characters.').max(2000),
  location: z.string().trim().max(80).optional().default(''),
  contactEmail: z.string().trim().email('Enter a valid contact email.').optional().or(z.literal('')),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

/** Step 1 of selling: apply with a shop profile. An admin reviews it before products go public. */
router.post('/apply', requireRole('vendor'), validate(shopSchema), wrap(async (req, res) => {
  if (req.user.vendorId) throw badRequest('You already have a shop.');
  if (await Vendor.exists({ name: new RegExp(`^${escapeRegex(req.body.name)}$`, 'i') })) throw badRequest('Another shop already uses this name.');
  const vendor = await Vendor.create({ ...req.body, contactEmail: req.body.contactEmail || req.user.email, owner: req.user.id, slug: await uniqueSlug(Vendor, req.body.name), status: 'pending' });
  await dropSession(req.user.id);
  res.status(201).json({ shop: vendorPrivate(vendor) });
}));

router.get('/me', requireRole('vendor'), wrap(async (req, res) => {
  if (!req.user.vendorId) return res.json({ shop: null });
  const vendor = await Vendor.findById(req.user.vendorId);
  res.json({ shop: vendorPrivate(vendor, { effectiveCommission: vendor.commissionPercent ?? config.commissionPercent }) });
}));

router.patch('/me', owner, validatePatch(shopSchema), wrap(async (req, res) => {
  const vendor = await Vendor.findById(req.user.vendorId);
  const renamed = req.body.name && req.body.name !== vendor.name;
  if (renamed && (await Vendor.exists({ _id: { $ne: vendor._id }, name: new RegExp(`^${escapeRegex(req.body.name)}$`, 'i') }))) throw badRequest('Another shop already uses this name.');
  Object.assign(vendor, req.body);
  await vendor.save();
  await dropSession(req.user.id);
  if (renamed) await syncVendor(vendor._id);
  await touchCatalog();
  res.json({ shop: vendorPrivate(vendor) });
}));

router.post('/logo', owner, upload.single('image'), wrap(async (req, res) => {
  if (!req.file) throw badRequest('Choose an image to upload.');
  const vendor = await Vendor.findById(req.user.vendorId);
  const key = `shops/${vendor._id}/${nanoid(10)}${path.extname(req.file.originalname).toLowerCase()}`;
  await putBuffer(req.file.buffer, key);
  if (vendor.logoKey) await remove(vendor.logoKey).catch(() => {});
  vendor.logoKey = key;
  await vendor.save();
  await touchCatalog();
  res.json({ shop: vendorPrivate(vendor) });
}));

/* ---------- Dashboard ---------- */

router.get('/dashboard', owner, wrap(async (req, res) => {
  const days = cleanDays(req.query.days);
  const vendorId = req.user.vendorId;
  const since = rangeStart(days);
  const previousSince = new Date(since.getTime() - days * 24 * 3600 * 1000);
  const [range, previous, lifetime, series, best, byStatus, lowStock, products] = await Promise.all([
    totals({ vendorId, since }),
    totals({ vendorId, since: previousSince, until: since }),
    totals({ vendorId }),
    dailySeries({ vendorId }, days),
    topProducts({ vendorId, since }, 5),
    Order.aggregate([
      { $match: { 'payment.status': 'paid', 'vendorOrders.vendor': new mongoose.Types.ObjectId(vendorId) } },
      { $unwind: '$vendorOrders' },
      { $match: { 'vendorOrders.vendor': new mongoose.Types.ObjectId(vendorId) } },
      { $group: { _id: '$vendorOrders.status', count: { $sum: 1 } } },
    ]),
    Product.find({ vendor: vendorId, status: 'active', stock: { $lte: 5 } }).sort({ stock: 1 }).limit(6).select('title slug stock images').lean(),
    Product.countDocuments({ vendor: vendorId, status: 'active' }),
  ]);
  const vendor = await Vendor.findById(vendorId).select('ratingAvg ratingCount commissionPercent').lean();
  res.json({
    days, currency: config.currency, commissionPercent: vendor.commissionPercent ?? config.commissionPercent,
    range, previous, lifetime, series, topProducts: best,
    parcels: Object.fromEntries(ORDER_STATUSES.map((s) => [s, byStatus.find((b) => b._id === s)?.count || 0])),
    lowStock: lowStock.map((p) => ({ id: String(p._id), title: p.title, slug: p.slug, stock: p.stock })),
    activeProducts: products, ratingAvg: vendor.ratingAvg, ratingCount: vendor.ratingCount,
  });
}));

/* ---------- Products ---------- */

const money = z.coerce.number().int('Use whole cents.').min(0).max(100000000);
const productSchema = z.object({
  title: z.string().trim().min(3, 'Give the product a title of at least 3 characters.').max(140),
  description: z.string().trim().max(6000).optional().default(''),
  category: z.enum(CATEGORIES, { message: 'Choose a category.' }),
  brand: z.string().trim().max(60).optional().default(''),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).optional().default([]),
  attributes: z.array(z.object({ name: z.string().trim().min(1).max(40), value: z.string().trim().min(1).max(120) })).max(12).optional().default([]),
  price: money.refine((v) => v > 0, 'Set a price above zero.'),
  compareAtPrice: money.optional().default(0),
  stock: z.coerce.number().int().min(0).max(1000000),
  status: z.enum(['draft', 'active', 'archived']).optional(),
});

async function loadProduct(req) {
  if (!isId(req.params.id)) throw notFound('Product not found.');
  const product = await Product.findOne({ _id: req.params.id, vendor: req.user.vendorId });
  if (!product) throw notFound('Product not found.');
  return product;
}
async function afterProductChange(product) {
  await Vendor.updateOne({ _id: product.vendor }, { productCount: await Product.countDocuments({ vendor: product.vendor, status: 'active' }) });
  await syncProduct(product._id);
  await touchCatalog();
}
const needsImage = (product) => {
  if (product.status === 'active' && !product.images.length) throw badRequest('Add at least one photo before putting a product on sale.');
};

router.get('/products', owner, wrap(async (req, res) => {
  const filter = { vendor: req.user.vendorId };
  if (['draft', 'active', 'archived'].includes(req.query.status)) filter.status = req.query.status;
  if (req.query.q) filter.title = new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), 'i');
  const products = await Product.find(filter).sort({ updatedAt: -1 }).limit(200).lean();
  res.json({ items: products.map((p) => ({ ...productCard(p), updatedAt: p.updatedAt })) });
}));

router.post('/products', owner, validate(productSchema), wrap(async (req, res) => {
  if (req.body.status === 'active') throw badRequest('Save the product, add a photo, then put it on sale.');
  const product = await Product.create({ ...req.body, status: 'draft', vendor: req.user.vendorId, slug: await uniqueSlug(Product, req.body.title) });
  res.status(201).json({ product: productFull(product) });
}));

router.get('/products/:id', owner, wrap(async (req, res) => res.json({ product: productFull(await loadProduct(req)) })));

router.patch('/products/:id', owner, validatePatch(productSchema), wrap(async (req, res) => {
  const product = await loadProduct(req);
  if (req.body.status === 'active' && req.user.vendorStatus !== 'approved') throw badRequest('Your shop must be approved before products can go on sale. You can keep preparing drafts.');
  Object.assign(product, req.body);
  needsImage(product);
  await product.save();
  await afterProductChange(product);
  res.json({ product: productFull(product) });
}));

router.delete('/products/:id', owner, wrap(async (req, res) => {
  const product = await loadProduct(req);
  if (await Order.exists({ 'items.product': product._id })) {
    // Sold products stay in order history, so they are archived instead of removed.
    product.status = 'archived';
    await product.save();
    await afterProductChange(product);
    return res.json({ archived: true });
  }
  await Promise.all(product.images.map((key) => remove(key).catch(() => {})));
  await product.deleteOne();
  await afterProductChange(product);
  res.json({ deleted: true });
}));

/** Upload up to six product photos. Files go straight to S3 (or local disk in development). */
router.post('/products/:id/images', owner, upload.array('images', 6), wrap(async (req, res) => {
  if (!req.files?.length) throw badRequest('Choose at least one image.');
  const product = await loadProduct(req);
  if (product.images.length + req.files.length > 6) throw badRequest('A product can have up to 6 photos.');
  for (const file of req.files) {
    const key = `products/${product._id}/${nanoid(10)}${path.extname(file.originalname).toLowerCase()}`;
    await putBuffer(file.buffer, key);
    product.images.push(key);
  }
  await product.save();
  await touchCatalog();
  res.status(201).json({ product: productFull(product) });
}));

/** Save the photo order (the first photo is the cover) and drop photos that are no longer listed. */
router.put('/products/:id/images', owner, validate(z.object({ keys: z.array(z.string()).max(6) })), wrap(async (req, res) => {
  const product = await loadProduct(req);
  const keep = req.body.keys.filter((k) => product.images.includes(k));
  const dropped = product.images.filter((k) => !keep.includes(k));
  product.images = keep;
  needsImage(product);
  await product.save();
  await Promise.all(dropped.map((key) => remove(key).catch(() => {})));
  await touchCatalog();
  res.json({ product: productFull(product) });
}));

/* ---------- Orders ---------- */

router.get('/orders', owner, wrap(async (req, res) => {
  const vendorId = new mongoose.Types.ObjectId(req.user.vendorId);
  const status = ORDER_STATUSES.includes(req.query.status) ? req.query.status : null;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 15;
  const filter = { 'payment.status': 'paid', vendorOrders: { $elemMatch: { vendor: vendorId, ...(status ? { status } : {}) } } };
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ 'payment.paidAt': -1 }).skip((page - 1) * limit).limit(limit).populate('customer', 'name email').lean(),
    Order.countDocuments(filter),
  ]);
  res.json({
    items: orders.map((o) => {
      const vo = o.vendorOrders.find((v) => String(v.vendor) === req.user.vendorId);
      return { orderId: String(o._id), number: o.number, paidAt: o.payment.paidAt, customer: o.customer ? { name: o.customer.name, email: o.customer.email } : null, shippingAddress: o.shippingAddress, currency: o.currency, parcel: vendorOrderView(o, vo, { forVendor: true }) };
    }),
    total, page, pages: Math.max(1, Math.ceil(total / limit)),
  });
}));

async function loadOrder(req) {
  if (!isId(req.params.orderId)) throw notFound('Order not found.');
  const order = await Order.findOne({ _id: req.params.orderId, 'vendorOrders.vendor': req.user.vendorId });
  if (!order) throw notFound('Order not found.');
  return order;
}

const advanceSchema = z.object({ to: z.enum(['packed', 'shipped', 'delivered']), tracking: z.object({ carrier: z.string().max(60), number: z.string().max(80) }).optional() });
router.post('/orders/:orderId/advance', selling, validate(advanceSchema), wrap(async (req, res) => {
  const order = await loadOrder(req);
  const vo = await advanceParcel(order, { vendorId: req.user.vendorId, to: req.body.to, tracking: req.body.tracking });
  res.json({ parcel: vendorOrderView(order, vo, { forVendor: true }) });
}));

router.post('/orders/:orderId/cancel', owner, validate(z.object({ note: z.string().trim().max(200).optional() })), wrap(async (req, res) => {
  const order = await loadOrder(req);
  const vo = await cancelParcel(order, { vendorId: req.user.vendorId, by: 'shop', note: req.body.note });
  res.json({ parcel: vendorOrderView(order, vo, { forVendor: true }) });
}));

router.get('/orders/:orderId/invoice', owner, wrap(async (req, res) => {
  const order = await loadOrder(req);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="awning-invoice-${order.number}.pdf"`);
  writeInvoicePdf(order, res, { vendorId: req.user.vendorId });
}));

/* ---------- Payouts ---------- */

router.get('/payouts', owner, wrap(async (req, res) => {
  const vendor = await Vendor.findById(req.user.vendorId);
  if (provider() === 'stripe' && vendor.payout.stripeAccountId) {
    const ready = await stripeDriver.refreshAccount(vendor).catch(() => vendor.payout.stripeReady);
    if (ready) await stripeDriver.retryPending(vendor).catch(() => {});
  }
  const vid = new mongoose.Types.ObjectId(req.user.vendorId);
  const [byStatus, rows] = await Promise.all([
    Order.aggregate([...parcelPipeline({ vendorId: vid }), { $group: { _id: '$vendorOrders.payout.status', amount: { $sum: '$vendorOrders.vendorNet' }, count: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: { 'payment.status': 'paid', 'vendorOrders.vendor': vid } },
      { $unwind: '$vendorOrders' },
      { $match: { 'vendorOrders.vendor': vid } },
      { $sort: { 'payment.paidAt': -1 } },
      { $limit: 40 },
      { $project: { number: 1, paidAt: '$payment.paidAt', currency: 1, vo: '$vendorOrders' } },
    ]),
  ]);
  const sum = (status) => byStatus.find((b) => b._id === status)?.amount || 0;
  const connected = provider() === 'stripe' ? vendor.payout.stripeReady : provider() === 'razorpay' ? !!vendor.payout.razorpayAccountId : vendor.payout.testConnected;
  res.json({
    provider: provider(), connected, currency: config.currency,
    commissionPercent: vendor.commissionPercent ?? config.commissionPercent,
    account: { stripeAccountId: vendor.payout.stripeAccountId || '', stripeStarted: !!vendor.payout.stripeAccountId, razorpayAccountId: vendor.payout.razorpayAccountId || '' },
    summary: { transferred: sum('transferred'), pending: sum('pending') },
    ledger: rows.map((r) => ({
      orderId: String(r._id), number: r.number, paidAt: r.paidAt, status: r.vo.status,
      total: r.vo.total, commission: r.vo.commission, commissionPercent: r.vo.commissionPercent, vendorNet: r.vo.vendorNet, payout: r.vo.payout,
    })),
  });
}));

/** Connect a payout account. Stripe: hosted onboarding link. Razorpay: save the linked account id. Test: a switch. */
router.post('/payouts/connect', owner, validate(z.object({ razorpayAccountId: z.string().trim().regex(/^acc_[A-Za-z0-9]+$/, 'A linked account id starts with acc_.').optional(), disconnect: z.boolean().optional() })), wrap(async (req, res) => {
  const vendor = await Vendor.findById(req.user.vendorId);
  if (provider() === 'stripe') {
    const user = await User.findById(req.user.id).select('email');
    return res.json({ url: await stripeDriver.onboardingLink(vendor, vendor.contactEmail || user.email) });
  }
  if (provider() === 'razorpay') {
    if (!req.body.razorpayAccountId) throw badRequest('Enter your Razorpay linked account id.');
    vendor.payout.razorpayAccountId = req.body.razorpayAccountId;
    await vendor.save();
    return res.json({ connected: true });
  }
  vendor.payout.testConnected = !req.body.disconnect;
  await vendor.save();
  if (vendor.payout.testConnected) {
    // Release the test payouts that were waiting for a connected account.
    await Order.updateMany(
      { 'payment.provider': 'test', 'payment.status': 'paid' },
      { $set: { 'vendorOrders.$[vo].payout.status': 'transferred', 'vendorOrders.$[vo].payout.ref': 'test_tr_released', 'vendorOrders.$[vo].payout.at': new Date(), 'vendorOrders.$[vo].payout.note': '' } },
      { arrayFilters: [{ 'vo.vendor': vendor._id, 'vo.payout.status': 'pending', 'vo.status': { $ne: 'cancelled' } }] }
    );
  }
  res.json({ connected: vendor.payout.testConnected });
}));

/* ---------- Coupons (valid only on this shop's products) ---------- */

export const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,24}$/, 'Use 3 to 24 letters and digits.'),
  description: z.string().trim().max(140).optional().default(''),
  type: z.enum(['percent', 'fixed']),
  value: z.coerce.number().int().min(1),
  minSubtotal: z.coerce.number().int().min(0).optional().default(0),
  maxDiscount: z.coerce.number().int().min(0).optional().default(0),
  startsAt: z.coerce.date().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
  usageLimit: z.coerce.number().int().min(0).optional().default(0),
  perCustomerLimit: z.coerce.number().int().min(0).optional().default(1),
  active: z.boolean().optional().default(true),
}).refine((c) => c.type !== 'percent' || c.value <= 90, { message: 'A percentage discount can be 90% at most.', path: ['value'] });

export async function saveCoupon(body, { vendorId = null, couponId = null }) {
  const clash = await Coupon.findOne({ code: body.code, _id: { $ne: couponId } }).select('_id').lean();
  if (clash) throw badRequest('This code is already in use. Pick another.');
  if (couponId) {
    const coupon = await Coupon.findOneAndUpdate({ _id: couponId, vendor: vendorId }, { $set: body }, { returnDocument: 'after' });
    if (!coupon) throw notFound('Coupon not found.');
    return coupon;
  }
  return Coupon.create({ ...body, vendor: vendorId });
}

router.get('/coupons', owner, wrap(async (req, res) => {
  const coupons = await Coupon.find({ vendor: req.user.vendorId }).sort({ createdAt: -1 }).lean();
  res.json({ items: coupons.map(couponView) });
}));
router.post('/coupons', owner, validate(couponSchema), wrap(async (req, res) => {
  res.status(201).json({ coupon: couponView(await saveCoupon(req.body, { vendorId: req.user.vendorId })) });
}));
router.patch('/coupons/:id', owner, validate(couponSchema), wrap(async (req, res) => {
  if (!isId(req.params.id)) throw notFound('Coupon not found.');
  res.json({ coupon: couponView(await saveCoupon(req.body, { vendorId: req.user.vendorId, couponId: req.params.id })) });
}));
router.delete('/coupons/:id', owner, wrap(async (req, res) => {
  if (!isId(req.params.id)) throw notFound('Coupon not found.');
  const gone = await Coupon.findOneAndDelete({ _id: req.params.id, vendor: req.user.vendorId });
  if (!gone) throw notFound('Coupon not found.');
  res.json({ ok: true });
}));

/* ---------- Reviews ---------- */

router.get('/reviews', owner, wrap(async (req, res) => {
  const reviews = await Review.find({ vendor: req.user.vendorId }).sort({ createdAt: -1 }).limit(60).populate('product', 'title slug').lean();
  res.json({ items: reviews.map(reviewView) });
}));
router.put('/reviews/:id/reply', owner, validate(z.object({ body: z.string().trim().max(2000) })), wrap(async (req, res) => {
  if (!isId(req.params.id)) throw notFound('Review not found.');
  const review = await Review.findOneAndUpdate({ _id: req.params.id, vendor: req.user.vendorId }, { $set: { reply: req.body.body ? { body: req.body.body, at: new Date() } : undefined } }, { returnDocument: 'after' }).populate('product', 'title slug');
  if (!review) throw notFound('Review not found.');
  res.json({ review: reviewView(review) });
}));

export default router;
