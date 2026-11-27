import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Product, Vendor, Review, Order, CATEGORIES } from '../models/index.js';
import { authOptional, requireAuth } from '../middleware/auth.js';
import { search, suggest, searchInfo, syncProduct } from '../services/search/index.js';
import { kv, keys } from '../services/kv.js';
import { wrap, validate, notFound, forbidden } from '../utils/http.js';
import { productCard, productFull, vendorPublic, reviewView } from '../utils/serialize.js';

const router = Router();
const isId = (v) => mongoose.isValidObjectId(v);

/** Load products by id, keeping the order the search engine returned. */
async function cardsFor(ids) {
  const docs = await Product.find({ _id: { $in: ids } }).populate('vendor', 'name slug color').lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  return ids.map((id) => byId.get(String(id))).filter(Boolean).map(productCard);
}

/** Home page payload, cached in Redis for a minute. */
router.get('/home', wrap(async (_req, res) => {
  const data = await kv.cached(keys.home(), 60, async () => {
    const approved = await Vendor.find({ status: 'approved' }).sort({ ratingCount: -1 }).lean();
    const visible = { status: 'active', vendor: { $in: approved.map((v) => v._id) } };
    const pick = (filter, sort, limit = 8) => Product.find({ ...visible, ...filter }).sort(sort).limit(limit).populate('vendor', 'name slug color').lean();
    const [fresh, deals, best, counts] = await Promise.all([
      pick({ stock: { $gt: 0 } }, { createdAt: -1 }),
      pick({ stock: { $gt: 0 }, $expr: { $gt: ['$compareAtPrice', '$price'] } }, { soldCount: -1 }),
      pick({}, { soldCount: -1 }),
      Product.aggregate([{ $match: visible }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
    ]);
    const countBy = Object.fromEntries(counts.map((c) => [c._id, c.count]));
    return {
      categories: CATEGORIES.map((name) => ({ name, count: countBy[name] || 0 })),
      fresh: fresh.map(productCard), deals: deals.map(productCard), bestsellers: best.map(productCard),
      shops: approved.slice(0, 6).map(vendorPublic),
      totals: { products: counts.reduce((n, c) => n + c.count, 0), shops: approved.length },
    };
  });
  res.json(data);
}));

const csv = z.string().optional().transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20) : []));
const optNum = z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().min(0).optional());
const searchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(CATEGORIES).optional(),
  brand: csv,
  minPrice: optNum, maxPrice: optNum,
  minRating: z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().min(1).max(5).optional()),
  inStock: z.enum(['1', 'true']).optional(),
  vendor: z.string().optional(),
  sort: z.enum(['relevance', 'price-asc', 'price-desc', 'newest', 'rating', 'bestselling']).default('relevance'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(24),
});

router.get('/search', validate(searchSchema, 'query'), wrap(async (req, res) => {
  const p = req.validQuery;
  const started = performance.now();
  const result = await search({
    q: p.q || '', category: p.category, brands: p.brand, minPrice: p.minPrice, maxPrice: p.maxPrice, minRating: p.minRating,
    inStock: !!p.inStock, vendorId: p.vendor && isId(p.vendor) ? p.vendor : undefined, sort: p.sort, page: p.page, limit: p.limit,
  });
  res.json({
    items: await cardsFor(result.ids), total: result.total, page: result.page, pages: result.pages,
    facets: result.facets, engine: result.engine, tookMs: Math.round(performance.now() - started),
  });
}));

router.get('/suggest', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60);
  res.json({ items: q.length < 2 ? [] : await suggest(q) });
}));

router.get('/meta', (_req, res) => res.json({ categories: CATEGORIES, searchEngine: searchInfo.driver }));

router.get('/shops', wrap(async (_req, res) => {
  const shops = await Vendor.find({ status: 'approved' }).sort({ productCount: -1 }).lean();
  res.json({ items: shops.map(vendorPublic) });
}));

router.get('/shops/:slug', wrap(async (req, res) => {
  const vendor = await Vendor.findOne({ slug: req.params.slug, status: 'approved' }).lean();
  if (!vendor) throw notFound('This shop does not exist.');
  res.json({ shop: vendorPublic(vendor) });
}));

router.get('/products/:slug', authOptional, wrap(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug }).populate('vendor').lean();
  if (!product) throw notFound('This product does not exist.');
  const owner = req.user && (req.user.role === 'admin' || req.user.vendorId === String(product.vendor._id));
  if ((product.status !== 'active' || product.vendor.status !== 'approved') && !owner) throw notFound('This product is no longer available.');

  const [more, review, purchased] = await Promise.all([
    Product.find({ vendor: product.vendor._id, status: 'active', _id: { $ne: product._id } }).sort({ soldCount: -1 }).limit(4).populate('vendor', 'name slug color').lean(),
    req.user ? Review.findOne({ product: product._id, user: req.user.id }).lean() : null,
    req.user ? Order.exists({ customer: req.user.id, 'payment.status': 'paid', items: { $elemMatch: { product: product._id } }, vendorOrders: { $elemMatch: { vendor: product.vendor._id, status: 'delivered' } } }) : null,
  ]);
  res.json({
    product: productFull(product), shop: vendorPublic(product.vendor), more: more.map(productCard),
    myReview: review ? reviewView(review) : null,
    canReview: !!purchased,
  });
}));

router.get('/products/:id/reviews', wrap(async (req, res) => {
  if (!isId(req.params.id)) throw notFound('Product not found.');
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 6;
  const productId = new mongoose.Types.ObjectId(req.params.id);
  const [items, total, spread] = await Promise.all([
    Review.find({ product: productId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Review.countDocuments({ product: productId }),
    Review.aggregate([{ $match: { product: productId } }, { $group: { _id: '$rating', count: { $sum: 1 } } }]),
  ]);
  const byStar = Object.fromEntries(spread.map((s) => [s._id, s.count]));
  res.json({ items: items.map(reviewView), total, page, pages: Math.max(1, Math.ceil(total / limit)), spread: [5, 4, 3, 2, 1].map((star) => ({ star, count: byStar[star] || 0 })) });
}));

/** Recalculate a product's and its shop's rating from their reviews. */
export async function refreshRatings(productId, vendorId) {
  const avg = async (match) => {
    const [row] = await Review.aggregate([{ $match: match }, { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }]);
    return { ratingAvg: row ? Math.round(row.avg * 10) / 10 : 0, ratingCount: row?.count || 0 };
  };
  await Product.updateOne({ _id: productId }, await avg({ product: new mongoose.Types.ObjectId(String(productId)) }));
  await Vendor.updateOne({ _id: vendorId }, await avg({ vendor: new mongoose.Types.ObjectId(String(vendorId)) }));
  await syncProduct(productId);
  await kv.del(keys.home());
}

const reviewSchema = z.object({ rating: z.number().int().min(1).max(5), title: z.string().trim().max(120).optional().default(''), body: z.string().trim().max(3000).optional().default('') });

/** Only customers whose parcel with this product was delivered may review it. One review each; posting again edits it. */
router.post('/products/:id/reviews', requireAuth, validate(reviewSchema), wrap(async (req, res) => {
  if (!isId(req.params.id)) throw notFound('Product not found.');
  const product = await Product.findById(req.params.id).select('vendor');
  if (!product) throw notFound('Product not found.');
  const delivered = await Order.exists({ customer: req.user.id, 'payment.status': 'paid', items: { $elemMatch: { product: product._id } }, vendorOrders: { $elemMatch: { vendor: product.vendor, status: 'delivered' } } });
  if (!delivered) throw forbidden('You can review a product once your order with it has been delivered.');
  const review = await Review.findOneAndUpdate(
    { product: product._id, user: req.user.id },
    { $set: { ...req.body, authorName: req.user.name, vendor: product.vendor } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  await refreshRatings(product._id, product.vendor);
  res.status(201).json({ review: reviewView(review) });
}));

export default router;
