/**
 * Demo data: six approved shops (and one waiting for approval), a product
 * catalog with pictures, customers, three months of orders in every state,
 * reviews and coupons.
 *
 *   npm run seed            add demo data to an empty database
 *   npm run seed:reset      wipe everything first
 *   npm run seed:photos     wipe, then build the catalog from DummyJSON product photos (needs internet)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { connectDb, disconnectDb } from '../db.js';
import { User, Vendor, Product, Coupon, Order, Review, CATEGORIES } from '../models/index.js';
import { putBuffer, exists } from '../services/storage.js';
import { initKv, closeKv, kv, keys, kvInfo } from '../services/kv.js';
import { initSearch, reindexAll, searchInfo } from '../services/search/index.js';
import { writeCart } from '../services/cart.js';
import { split } from '../services/pricing.js';
import { slugify } from '../utils/http.js';
import { log } from '../utils/log.js';
import { productArt } from './art.js';
import { SHOPS, PENDING_SHOP, COUPONS, REVIEW_TEXT, PASSWORD, FIRST_NAMES, LAST_NAMES, CITIES } from './content.js';

const DAY = 24 * 3600 * 1000;
// Demo prices are written in US cents; scale them so other currencies look plausible.
const SCALE = { inr: 80, jpy: 1.5, idr: 150 }[config.currency] || 1;
const price = (cents) => (SCALE === 1 ? cents : Math.round((cents * SCALE) / 1000) * 1000);

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function artImages(kind, palette) {
  const out = [];
  for (const [suffix, closeUp] of [['a', false], ['b', true]]) {
    const key = `seed/${kind}-${palette}-${suffix}.svg`;
    if (!(await exists(key))) await putBuffer(Buffer.from(productArt(kind, palette, { closeUp })), key);
    out.push(key);
  }
  return out;
}

/** Optional: real product photos and listings from DummyJSON. Returns null when it cannot be reached. */
const PHOTO_CATEGORY = {
  smartphones: 'Electronics', laptops: 'Electronics', tablets: 'Electronics', 'mobile-accessories': 'Electronics',
  furniture: 'Home & Kitchen', 'home-decoration': 'Home & Kitchen', 'kitchen-accessories': 'Home & Kitchen', groceries: 'Home & Kitchen',
  'mens-shirts': 'Fashion', 'mens-shoes': 'Fashion', 'mens-watches': 'Fashion', 'womens-dresses': 'Fashion', 'womens-shoes': 'Fashion', 'womens-watches': 'Fashion', 'womens-bags': 'Fashion', 'womens-jewellery': 'Fashion', tops: 'Fashion', sunglasses: 'Fashion',
  'sports-accessories': 'Sports & Outdoors', motorcycle: 'Sports & Outdoors', vehicle: 'Sports & Outdoors',
  beauty: 'Beauty & Care', fragrances: 'Beauty & Care', 'skin-care': 'Beauty & Care',
};
const SHOP_FOR = { Electronics: 'circuit', 'Home & Kitchen': 'kettle', Fashion: 'northfold', 'Sports & Outdoors': 'northfold', 'Beauty & Care': 'fern' };

async function photoCatalog() {
  try {
    const res = await fetch('https://dummyjson.com/products?limit=120', { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rows = (data.products || []).filter((p) => p?.title && p?.price > 0 && Array.isArray(p.images) && p.images.length && PHOTO_CATEGORY[p.category]);
    if (rows.length < 20) throw new Error('unexpected response');
    return rows.map((p) => {
      const cents = Math.round(p.price * 100);
      const was = p.discountPercentage > 8 ? Math.round(cents / (1 - p.discountPercentage / 100) / 100) * 100 : 0;
      const category = PHOTO_CATEGORY[p.category];
      return {
        shop: SHOP_FOR[category], title: String(p.title).slice(0, 140), category, brand: p.brand || '', price: cents, compareAtPrice: was,
        stock: Number.isFinite(p.stock) ? Math.min(p.stock, 200) : 20, description: String(p.description || '').slice(0, 2000),
        images: p.images.slice(0, 4).map(String), tags: Array.isArray(p.tags) ? p.tags.slice(0, 6).map(String) : [],
        attributes: [p.warrantyInformation && { name: 'Warranty', value: p.warrantyInformation }, p.shippingInformation && { name: 'Shipping', value: p.shippingInformation }, p.returnPolicy && { name: 'Returns', value: p.returnPolicy }].filter(Boolean),
      };
    });
  } catch (err) {
    log.warn(`  could not load DummyJSON (${err.message}); using the built-in illustrated catalog instead.`);
    return null;
  }
}

export async function runSeed({ reset = false, photos = false } = {}) {
  if (reset) {
    await Promise.all([User, Vendor, Product, Coupon, Order, Review].map((m) => m.deleteMany({})));
    log.info('  existing data removed');
  } else if (await User.exists({ email: 'admin@awning.test' })) {
    log.info('  demo data already present (use seed:reset to rebuild it)');
    return;
  }
  const rand = rng(20261115);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const now = Date.now();
  const hash = await (async () => { const u = new User(); await u.setPassword(PASSWORD); return u.passwordHash; })();
  const mkUser = (fields, daysAgo = 120) => {
    const at = new Date(now - daysAgo * DAY);
    return { ...fields, passwordHash: hash, createdAt: at, updatedAt: at };
  };
  const address = (name) => {
    const [city, country, postalCode] = pick(CITIES);
    return { fullName: name, line1: `${10 + Math.floor(rand() * 180)} ${pick(['Market Street', 'Mill Lane', 'Harbour Road', 'Orchard Way', 'Station Road', 'Canal Walk'])}`, line2: '', city, state: '', postalCode, country, phone: '', isDefault: true };
  };

  /* People */
  const [admin, sam] = await User.insertMany([
    mkUser({ name: 'Priya Raman', email: 'admin@awning.test', role: 'admin' }),
    mkUser({ name: 'Sam Carter', email: 'sam@awning.test', role: 'customer', addresses: [{ fullName: 'Sam Carter', line1: '14 Mill Lane', line2: 'Flat 3', city: 'London', state: '', postalCode: 'E2 8AA', country: 'UK', phone: '+44 20 7946 0958', isDefault: true }] }),
  ], { timestamps: false });
  const crowd = await User.insertMany(Array.from({ length: 40 }, (_, i) => {
    const name = `${FIRST_NAMES[i]} ${pick(LAST_NAMES)}`;
    return mkUser({ name, email: `${name.replace(/\s+/g, '.').toLowerCase()}${i}@example.com`, role: 'customer', addresses: [address(name)] }, Math.floor(rand() * 110));
  }), { timestamps: false });

  /* Shops */
  const shops = {};
  for (const def of [...SHOPS, { ...PENDING_SHOP, key: 'pending', pending: true }]) {
    const [owner] = await User.insertMany([mkUser({ ...def.owner, role: 'vendor' }, 130)], { timestamps: false });
    const createdAt = new Date(now - (def.pending ? 2 : 125) * DAY);
    const [vendor] = await Vendor.insertMany([{
      owner: owner._id, name: def.name, slug: slugify(def.name), tagline: def.tagline, description: def.description, color: def.color, location: def.location,
      contactEmail: def.owner.email, status: def.pending ? 'pending' : 'approved', approvedAt: def.pending ? undefined : createdAt,
      payout: { testConnected: !!def.connected }, createdAt, updatedAt: createdAt,
    }], { timestamps: false });
    shops[def.key] = vendor;
  }
  shops.fern.commissionPercent = 8; // one shop on a negotiated rate, to show per-shop commission
  await shops.fern.save();

  /* Products */
  const remote = photos ? await photoCatalog() : null;
  const docs = [];
  const used = new Set();
  const slugFor = (title) => { let s = slugify(title); for (let i = 2; used.has(s); i++) s = `${slugify(title)}-${i}`; used.add(s); return s; };
  if (remote) {
    for (const p of remote) {
      const createdAt = new Date(now - Math.floor(rand() * 100) * DAY);
      docs.push({ ...p, shop: undefined, vendor: shops[p.shop]._id, slug: slugFor(p.title), price: price(p.price), compareAtPrice: price(p.compareAtPrice), status: 'active', createdAt, updatedAt: createdAt });
    }
  }
  for (const def of [...SHOPS, { ...PENDING_SHOP, key: 'pending' }]) {
    if (remote && def.key !== 'pending' && !['paper', 'rocket'].includes(def.key)) continue; // photo mode keeps the shops DummyJSON has no stock for
    for (const [title, category, brand, cents, was, kind, palette, stock, description, specs] of def.products) {
      const createdAt = new Date(now - Math.floor(rand() * 100) * DAY);
      docs.push({
        vendor: shops[def.key]._id, title, slug: slugFor(title), category, brand, price: price(cents), compareAtPrice: price(was), stock, description,
        attributes: specs.split('|').map((s) => { const [name, ...rest] = s.split(':'); return { name, value: rest.join(':') }; }),
        tags: [kind, brand.toLowerCase()].filter(Boolean), images: await artImages(kind, palette),
        status: def.key === 'pending' ? 'draft' : 'active', createdAt, updatedAt: createdAt,
      });
    }
  }
  const products = await Product.insertMany(docs, { timestamps: false });
  const sellable = products.filter((p) => p.status === 'active');
  log.info(`  ${Object.keys(shops).length} shops, ${products.length} products${remote ? ' (with DummyJSON photos)' : ''}`);

  /* Coupons */
  for (const { shop, ...c } of COUPONS) {
    await Coupon.create({ ...c, value: c.type === 'fixed' ? price(c.value) : c.value, minSubtotal: price(c.minSubtotal || 0), maxDiscount: price(c.maxDiscount || 0), vendor: shop ? shops[shop]._id : null });
  }

  /* Orders */
  const shopById = new Map(Object.values(shops).map((v) => [String(v._id), v]));
  const sold = new Map();
  const orders = [];
  const reviews = [];
  let serial = 0;
  const makeOrder = (customer, picks, daysAgo, statusFor) => {
    const paidAt = new Date(now - daysAgo * DAY - Math.floor(rand() * DAY * 0.9));
    const items = picks.map(([p, qty]) => ({ product: p._id, vendor: p.vendor, title: p.title, slug: p.slug, image: p.images[0], price: p.price, qty, lineTotal: p.price * qty, discount: 0 }));
    const vendorOrders = [];
    for (const vendorId of [...new Set(items.map((l) => String(l.vendor)))]) {
      const vendor = shopById.get(vendorId);
      const subtotal = items.filter((l) => String(l.vendor) === vendorId).reduce((n, l) => n + l.lineTotal, 0);
      const shipping = subtotal >= config.freeShippingOver ? 0 : config.shippingFlat;
      const commissionPercent = vendor.commissionPercent ?? config.commissionPercent;
      const status = statusFor(daysAgo);
      const steps = ['placed', 'packed', 'shipped', 'delivered'];
      const reached = status === 'cancelled' ? ['placed'] : steps.slice(0, steps.indexOf(status) + 1);
      const history = reached.map((s, i) => ({ status: s, at: new Date(Math.min(now, paidAt.getTime() + i * (0.6 + rand()) * DAY)) }));
      if (status === 'cancelled') history.push({ status: 'cancelled', at: new Date(paidAt.getTime() + 0.2 * DAY), note: 'Cancelled by the customer' });
      const group = { subtotal, discount: 0, shipping, commissionPercent };
      vendorOrders.push({
        vendor: vendor._id, vendorName: vendor.name, subtotal, discount: 0, shipping, total: subtotal + shipping, commissionPercent, ...split(group), status,
        tracking: reached.includes('shipped') ? { carrier: pick(['Royal Mail', 'DHL', 'DPD', 'PostNord']), number: `AW${Math.floor(1e9 + rand() * 9e9)}` } : { carrier: '', number: '' },
        history,
        payout: status === 'cancelled' ? { status: 'none', note: 'Cancelled before payout' } : vendor.payout.testConnected ? { status: 'transferred', ref: `test_tr_seed${serial}`, at: paidAt } : { status: 'pending', note: 'The shop has not connected a payout account yet.' },
        refund: status === 'cancelled' ? { amount: subtotal + shipping, ref: `test_re_seed${serial}`, at: new Date(paidAt.getTime() + 0.2 * DAY) } : undefined,
      });
      if (status !== 'cancelled') for (const l of items.filter((x) => String(x.vendor) === vendorId)) sold.set(String(l.product), (sold.get(String(l.product)) || 0) + l.qty);
    }
    const sum = (k) => vendorOrders.reduce((n, v) => n + v[k], 0);
    serial += 1;
    const order = {
      number: `AW-${(100000 + serial * 37).toString(36).toUpperCase().padStart(4, '0')}${String.fromCharCode(65 + (serial % 26))}${(serial * 7919 % 1000).toString().padStart(3, '0')}`,
      customer: customer._id, items, vendorOrders, shippingAddress: (({ isDefault, _id, ...a }) => a)(customer.addresses[0].toObject ? customer.addresses[0].toObject() : customer.addresses[0]),
      subtotal: sum('subtotal'), discount: 0, shippingTotal: sum('shipping'), total: sum('total'), currency: config.currency,
      payment: { provider: 'test', status: 'paid', ref: `test_seed_${serial}`, chargeRef: `test_ch_seed_${serial}`, paidAt }, stockReserved: true, createdAt: paidAt, updatedAt: paidAt,
    };
    orders.push(order);
    return order;
  };
  const byAge = (daysAgo) => {
    const r = rand();
    if (daysAgo > 9) return r < 0.05 ? 'cancelled' : 'delivered';
    if (daysAgo > 4) return r < 0.7 ? 'delivered' : 'shipped';
    if (daysAgo > 1) return r < 0.5 ? 'shipped' : 'packed';
    return r < 0.5 ? 'packed' : 'placed';
  };
  for (let i = 0; i < 170; i++) {
    const customer = pick(crowd);
    const picks = [...sellable].sort(() => rand() - 0.5).slice(0, 1 + Math.floor(rand() * 3)).map((p) => [p, rand() < 0.8 ? 1 : 2]);
    // Skew toward recent weeks so the charts trend upward.
    makeOrder(customer, picks, Math.floor(Math.pow(rand(), 1.6) * 95), byAge);
  }
  // The demo customer has one order in each interesting state.
  const find = (title) => sellable.find((p) => p.title.startsWith(title)) || sellable[0];
  makeOrder(sam, [[find('Stoneware Mug, 350'), 2], [find('Dot Grid Notebook'), 1], [sellable[5], 1]], 24, () => 'delivered');
  makeOrder(sam, [[find('Wireless Over-Ear'), 1]], 5, () => 'shipped');
  makeOrder(sam, [[find('Monstera'), 1], [find('Family Dice'), 1]], 0.05, () => 'placed');
  await Order.insertMany(orders, { timestamps: false });

  /* Reviews from delivered parcels */
  const reviewed = new Set();
  for (const order of orders) {
    for (const vo of order.vendorOrders.filter((v) => v.status === 'delivered')) {
      for (const line of order.items.filter((l) => String(l.vendor) === String(vo.vendor))) {
        const key = `${line.product}:${order.customer}`;
        if (reviewed.has(key) || String(order.customer) === String(sam._id) || rand() > 0.55) continue;
        reviewed.add(key);
        const r = rand();
        const rating = r < 0.55 ? 5 : r < 0.85 ? 4 : r < 0.95 ? 3 : 2;
        const [title, body] = pick(REVIEW_TEXT[rating]);
        const customer = crowd.find((c) => String(c._id) === String(order.customer));
        const at = new Date(Math.min(now, vo.history.at(-1).at.getTime() + rand() * 4 * DAY));
        reviews.push({ product: line.product, vendor: line.vendor, user: order.customer, authorName: customer.name, rating, title, body, createdAt: at, updatedAt: at,
          reply: rating <= 3 && rand() < 0.6 ? { body: 'Thank you for telling us. We have written to you directly to put this right.', at: new Date(at.getTime() + DAY) } : undefined });
      }
    }
  }
  await Review.insertMany(reviews, { timestamps: false });

  /* Denormalised counters */
  const ratingRows = await Review.aggregate([{ $group: { _id: '$product', avg: { $avg: '$rating' }, count: { $sum: 1 } } }]);
  const ratings = new Map(ratingRows.map((r) => [String(r._id), r]));
  await Product.bulkWrite(products.map((p) => ({ updateOne: { filter: { _id: p._id }, update: { $set: { soldCount: sold.get(String(p._id)) || 0, ratingAvg: Math.round((ratings.get(String(p._id))?.avg || 0) * 10) / 10, ratingCount: ratings.get(String(p._id))?.count || 0 } } } })));
  for (const vendor of Object.values(shops)) {
    const [row] = await Review.aggregate([{ $match: { vendor: vendor._id } }, { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }]);
    await Vendor.updateOne({ _id: vendor._id }, { productCount: await Product.countDocuments({ vendor: vendor._id, status: 'active' }), ratingAvg: row ? Math.round(row.avg * 10) / 10 : 0, ratingCount: row?.count || 0 });
  }
  log.info(`  ${orders.length} orders, ${reviews.length} reviews, ${COUPONS.length} coupons, ${crowd.length + 2 + Object.keys(shops).length} accounts`);

  /* Search index and caches */
  if (kvInfo.driver !== 'none') {
    await kv.del(keys.home());
    await writeCart(String(sam._id), { items: { [String(find('Gooseneck')._id)]: 1, [String(find('Brass Fountain')._id)]: 1 }, coupon: null });
  }
  if (searchInfo.driver === 'elasticsearch') log.info(`  search index: ${(await reindexAll()).indexed} products in Elasticsearch`);

  log.info('');
  log.info(`  Demo accounts (password for all: ${PASSWORD})`);
  log.info('    customer   sam@awning.test');
  log.info('    shop owner maya@awning.test   (Kettle & Crumb)');
  log.info('    admin      admin@awning.test');
  log.info(`  Coupons: ${COUPONS.map((c) => c.code).join(', ')}`);
  log.info('');
  return { admin, sam };
}

// Run directly: node src/seed/seed.js [--reset] [--photos]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    try {
      await connectDb();
      await initKv();
      await initSearch();
      log.info('Seeding the demo marketplace...');
      await runSeed({ reset: process.argv.includes('--reset') || process.argv.includes('--photos'), photos: process.argv.includes('--photos') });
      log.info('Seed complete.');
    } catch (err) {
      log.error(err);
      process.exitCode = 1;
    } finally {
      await closeKv();
      await disconnectDb();
    }
  })();
}
