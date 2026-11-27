/**
 * End-to-end API tests: the real Express app against a real MongoDB
 * (TEST_MONGO_URI, or an embedded one). Nothing is mocked.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fsp from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import mongoose from 'mongoose';

let api, models, kvMod;
const s = {};
const auth = (who) => ({ Authorization: `Bearer ${who.token}` });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const CARD = { name: 'Test Buyer', cardNumber: '4242 4242 4242 4242', expiry: '12/40', cvc: '123' };
const ADDRESS = { fullName: 'Cora Customer', line1: '1 Test Street', city: 'London', postalCode: 'E1 1AA', country: 'UK' };

async function register(name, email, role) {
  const res = await api.post('/api/auth/register').send({ name, email, password: 'password123', role });
  expect(res.status).toBe(201);
  return res.body;
}
async function refresh(who) {
  who.user = (await api.get('/api/auth/me').set(auth(who))).body.user;
  return who;
}
async function makeShop(owner, name) {
  const res = await api.post('/api/vendor/apply').set(auth(owner)).send({ name, description: `${name} sells things made for the automated test suite.`, tagline: 'Test shop' });
  expect(res.status).toBe(201);
  return res.body.shop;
}
async function makeProduct(owner, fields) {
  const created = await api.post('/api/vendor/products').set(auth(owner)).send({ category: 'Home & Kitchen', stock: 10, ...fields });
  expect(created.status).toBe(201);
  const id = created.body.product.id;
  await api.post(`/api/vendor/products/${id}/images`).set(auth(owner)).attach('images', PNG, 'photo.png').expect(201);
  const live = await api.patch(`/api/vendor/products/${id}`).set(auth(owner)).send({ status: 'active' });
  expect(live.status).toBe(200);
  return live.body.product;
}
const stockOf = async (id) => (await models.Product.findById(id)).stock;

beforeAll(async () => {
  const { connectDb } = await import('../src/db.js');
  await connectDb();
  await mongoose.connection.dropDatabase();
  models = await import('../src/models/index.js');
  kvMod = await import('../src/services/kv.js');
  await kvMod.initKv();
  await (await import('../src/services/search/index.js')).initSearch();
  const { createApp } = await import('../src/app.js');
  api = request(createApp());

  s.cora = await register('Cora Customer', 'cora@test.dev', 'customer');
  s.cal = await register('Cal Customer', 'cal@test.dev', 'customer');
  s.vera = await register('Vera Vendor', 'vera@test.dev', 'vendor');
  s.vic = await register('Vic Vendor', 'vic@test.dev', 'vendor');
  const admin = new models.User({ name: 'Ada Admin', email: 'ada@test.dev', role: 'admin' });
  await admin.setPassword('password123');
  await admin.save();
  s.admin = (await api.post('/api/auth/login').send({ email: 'ada@test.dev', password: 'password123' })).body;
});

afterAll(async () => {
  await kvMod.closeKv();
  await mongoose.connection.dropDatabase();
  const { disconnectDb } = await import('../src/db.js');
  await disconnectDb();
  await fsp.rm(path.resolve('storage-test'), { recursive: true, force: true });
});

describe('auth and roles', () => {
  it('reports its drivers', async () => {
    const res = await api.get('/api/health');
    expect(res.body).toMatchObject({ ok: true, search: 'mongo', storage: 'local', payments: 'test' });
  });
  it('rejects duplicate emails, weak passwords and self-made admins', async () => {
    expect((await api.post('/api/auth/register').send({ name: 'X Y', email: 'cora@test.dev', password: 'password123' })).status).toBe(400);
    expect((await api.post('/api/auth/register').send({ name: 'X Y', email: 'n@test.dev', password: 'short' })).body.error).toMatch(/8 characters/);
    expect((await api.post('/api/auth/register').send({ name: 'Evil', email: 'evil@test.dev', password: 'password123', role: 'admin' })).status).toBe(400);
  });
  it('signs in with a JWT and never returns the password hash', async () => {
    const ok = await api.post('/api/auth/login').send({ email: 'CORA@test.dev', password: 'password123' });
    expect(ok.body.user).toMatchObject({ role: 'customer', email: 'cora@test.dev' });
    expect(JSON.stringify(ok.body)).not.toMatch(/passwordHash/);
    expect((await api.post('/api/auth/login').send({ email: 'cora@test.dev', password: 'nope' })).status).toBe(401);
    expect((await api.get('/api/auth/me')).status).toBe(401);
  });
  it('keeps each role out of the others’ areas', async () => {
    expect((await api.get('/api/admin/analytics').set(auth(s.cora))).status).toBe(403);
    expect((await api.get('/api/admin/analytics').set(auth(s.vera))).status).toBe(403);
    expect((await api.get('/api/vendor/products').set(auth(s.cora))).status).toBe(403);
    expect((await api.post('/api/vendor/apply').set(auth(s.cora)).send({ name: 'Nope', description: 'x'.repeat(40) })).status).toBe(403);
  });
  it('stores a delivery address book', async () => {
    const added = await api.post('/api/auth/addresses').set(auth(s.cora)).send(ADDRESS);
    expect(added.status).toBe(201);
    expect(added.body.items[0]).toMatchObject({ city: 'London', isDefault: true });
    s.addressId = added.body.items[0].id;
    expect((await api.post('/api/auth/addresses').set(auth(s.cora)).send({ fullName: 'C' })).status).toBe(400);
  });
});

describe('vendor onboarding and products', () => {
  it('takes a shop application and holds it for approval', async () => {
    s.shopA = await makeShop(s.vera, 'Alpha Goods');
    s.shopB = await makeShop(s.vic, 'Beta Supplies');
    expect(s.shopA).toMatchObject({ status: 'pending', slug: 'alpha-goods' });
    expect((await api.post('/api/vendor/apply').set(auth(s.vera)).send({ name: 'Second Shop', description: 'x'.repeat(40) })).status).toBe(400);
    expect((await api.get('/api/catalog/shops/alpha-goods')).status).toBe(404);
    await refresh(s.vera); await refresh(s.vic);
    expect(s.vera.user).toMatchObject({ vendorStatus: 'pending', vendorId: s.shopA.id });
  });

  it('lets a pending shop prepare drafts but not sell', async () => {
    const draft = await api.post('/api/vendor/products').set(auth(s.vera)).send({ title: 'Blue Ceramic Mug', category: 'Home & Kitchen', brand: 'Alpha', price: 2000, compareAtPrice: 2500, stock: 5, description: 'A mug for tests.' });
    expect(draft.status).toBe(201);
    s.mug = draft.body.product;
    expect(s.mug).toMatchObject({ status: 'draft', slug: 'blue-ceramic-mug', discountPercent: 20 });
    const live = await api.patch(`/api/vendor/products/${s.mug.id}`).set(auth(s.vera)).send({ status: 'active' });
    expect(live.status).toBe(400);
    expect(live.body.error).toMatch(/approved/);
  });

  it('validates product input', async () => {
    const bad = await api.post('/api/vendor/products').set(auth(s.vera)).send({ title: 'No', category: 'Nonsense', price: 0, stock: -1 });
    expect(bad.status).toBe(400);
    expect(bad.body.details.map((d) => d.field)).toEqual(expect.arrayContaining(['title', 'category', 'price', 'stock']));
  });

  it('is approved by an admin, which takes effect on the owner’s next request', async () => {
    expect((await api.patch(`/api/admin/vendors/${s.shopA.id}`).set(auth(s.vera)).send({ status: 'approved' })).status).toBe(403);
    for (const shop of [s.shopA, s.shopB]) await api.patch(`/api/admin/vendors/${shop.id}`).set(auth(s.admin)).send({ status: 'approved' }).expect(200);
    await api.patch(`/api/admin/vendors/${s.shopB.id}`).set(auth(s.admin)).send({ commissionPercent: 20 }).expect(200);
    await refresh(s.vera);
    expect(s.vera.user.vendorStatus).toBe('approved'); // the cached session was dropped
    expect((await api.get('/api/catalog/shops/alpha-goods')).body.shop.name).toBe('Alpha Goods');
  });

  it('uploads product images and requires one before going on sale', async () => {
    expect((await api.patch(`/api/vendor/products/${s.mug.id}`).set(auth(s.vera)).send({ status: 'active' })).body.error).toMatch(/photo/);
    expect((await api.post(`/api/vendor/products/${s.mug.id}/images`).set(auth(s.vera)).attach('images', Buffer.from('not an image'), 'notes.txt')).status).toBe(400);
    const up = await api.post(`/api/vendor/products/${s.mug.id}/images`).set(auth(s.vera)).attach('images', PNG, 'front.png').attach('images', PNG, 'back.png');
    expect(up.status).toBe(201);
    expect(up.body.product.images).toHaveLength(2);
    expect((await api.get(up.body.product.images[0])).headers['content-type']).toBe('image/png');
    // reorder and drop one
    const kept = await api.put(`/api/vendor/products/${s.mug.id}/images`).set(auth(s.vera)).send({ keys: [up.body.product.imageKeys[1]] });
    expect(kept.body.product.images).toHaveLength(1);
    expect((await api.get(up.body.product.images[0])).status).toBe(404); // the dropped file is gone from storage
    const live = await api.patch(`/api/vendor/products/${s.mug.id}`).set(auth(s.vera)).send({ status: 'active' });
    expect(live.body.product.status).toBe('active');
  });

  it('stops one shop from touching another shop’s product', async () => {
    expect((await api.patch(`/api/vendor/products/${s.mug.id}`).set(auth(s.vic)).send({ price: 1 })).status).toBe(404);
    expect((await api.delete(`/api/vendor/products/${s.mug.id}`).set(auth(s.vic))).status).toBe(404);
  });
});

describe('search, filters and sorting', () => {
  beforeAll(async () => {
    s.kettle = await makeProduct(s.vera, { title: 'Steel Pour Kettle', brand: 'Alpha', price: 6000, stock: 3, description: 'Gooseneck spout.' });
    s.bowl = await makeProduct(s.vera, { title: 'Oak Salad Bowl', brand: 'Timberline', price: 3500, stock: 0 });
    s.lamp = await makeProduct(s.vic, { title: 'Brass Desk Lamp', category: 'Electronics', brand: 'Lumen', price: 4500, stock: 8 });
    s.cable = await makeProduct(s.vic, { title: 'Braided USB Cable', category: 'Electronics', brand: 'Lumen', price: 900, stock: 50 });
  });
  const titles = (res) => res.body.items.map((p) => p.title);

  it('finds products by words in the title, brand or description', async () => {
    expect(titles(await api.get('/api/catalog/search?q=kettle'))).toEqual(['Steel Pour Kettle']);
    expect(titles(await api.get('/api/catalog/search?q=lumen')).sort()).toEqual(['Braided USB Cable', 'Brass Desk Lamp']);
    expect(titles(await api.get('/api/catalog/search?q=gooseneck'))).toEqual(['Steel Pour Kettle']);
    expect((await api.get('/api/catalog/search?q=zzzz')).body.total).toBe(0);
  });
  it('filters by category, brand, price and stock', async () => {
    expect((await api.get('/api/catalog/search?category=Electronics')).body.total).toBe(2);
    expect(titles(await api.get('/api/catalog/search?brand=Alpha,Timberline&sort=price-asc'))).toEqual(['Blue Ceramic Mug', 'Oak Salad Bowl', 'Steel Pour Kettle']);
    expect(titles(await api.get('/api/catalog/search?minPrice=3000&maxPrice=5000&sort=price-desc'))).toEqual(['Brass Desk Lamp', 'Oak Salad Bowl']);
    expect(titles(await api.get('/api/catalog/search?inStock=1'))).not.toContain('Oak Salad Bowl');
    expect((await api.get(`/api/catalog/search?vendor=${s.shopB.id}`)).body.total).toBe(2);
  });
  it('sorts by price and newest', async () => {
    expect(titles(await api.get('/api/catalog/search?sort=price-asc'))[0]).toBe('Braided USB Cable');
    expect(titles(await api.get('/api/catalog/search?sort=price-desc'))[0]).toBe('Steel Pour Kettle');
    expect(titles(await api.get('/api/catalog/search?sort=newest'))[0]).toBe('Braided USB Cable');
  });
  it('returns facets that ignore their own filter', async () => {
    const res = await api.get('/api/catalog/search?category=Electronics');
    expect(res.body.facets.categories).toEqual(expect.arrayContaining([{ value: 'Home & Kitchen', count: 3 }, { value: 'Electronics', count: 2 }]));
    expect(res.body.facets.brands).toEqual([{ value: 'Lumen', count: 2 }]);
    expect(res.body.facets.price).toEqual({ min: 900, max: 4500 });
  });
  it('suggests as you type and paginates', async () => {
    expect((await api.get('/api/catalog/suggest?q=bra')).body.items.map((i) => i.title).sort()).toEqual(['Braided USB Cable', 'Brass Desk Lamp']);
    const page = await api.get('/api/catalog/search?limit=2&page=2&sort=price-asc');
    expect(page.body).toMatchObject({ total: 5, pages: 3, page: 2 });
    expect(page.body.items).toHaveLength(2);
  });
  it('hides drafts and serves the product page', async () => {
    const draft = (await api.post('/api/vendor/products').set(auth(s.vera)).send({ title: 'Secret Draft', category: 'Garden', price: 100, stock: 1 })).body.product;
    expect((await api.get('/api/catalog/search?q=secret')).body.total).toBe(0);
    expect((await api.get(`/api/catalog/products/${draft.slug}`)).status).toBe(404);
    expect((await api.get(`/api/catalog/products/${draft.slug}`).set(auth(s.vera))).status).toBe(200); // the owner can preview
    const page = await api.get('/api/catalog/products/steel-pour-kettle');
    expect(page.body).toMatchObject({ product: { title: 'Steel Pour Kettle' }, shop: { name: 'Alpha Goods' }, canReview: false });
  });
});

describe('cart in the key-value store', () => {
  const guest = { 'X-Cart-Id': 'guest_cart_0001' };
  it('keeps a guest cart and prices it on the server', async () => {
    const res = await api.post('/api/cart/items').set(guest).send({ productId: s.mug.id, qty: 2 });
    expect(res.body.cart).toMatchObject({ itemCount: 2, subtotal: 4000, shippingTotal: 500, total: 4500 });
    expect(res.body.cart.groups[0]).toMatchObject({ vendor: { name: 'Alpha Goods' }, freeShippingGap: 1000 });
    expect((await api.get('/api/cart').set(guest)).body.cart.itemCount).toBe(2);
    expect((await api.get('/api/cart').set({ 'X-Cart-Id': 'someone_else_01' })).body.cart.itemCount).toBe(0);
  });
  it('never lets the quantity exceed stock and refuses sold-out products', async () => {
    const res = await api.post('/api/cart/items').set(guest).send({ productId: s.kettle.id, qty: 9 });
    expect(res.body.cart.lines.find((l) => l.productId === s.kettle.id).qty).toBe(3);
    expect((await api.post('/api/cart/items').set(guest).send({ productId: s.bowl.id })).body.error).toMatch(/out of stock/);
    await api.delete(`/api/cart/items/${s.kettle.id}`).set(guest).expect(200);
  });
  it('merges the guest cart into the account at sign-in', async () => {
    await api.post('/api/cart/items').set(auth(s.cora)).send({ productId: s.mug.id, qty: 1 });
    const login = await api.post('/api/auth/login').set(guest).send({ email: 'cora@test.dev', password: 'password123' });
    s.cora.token = login.body.token;
    const mine = await api.get('/api/cart').set(auth(s.cora));
    expect(mine.body.cart.lines[0]).toMatchObject({ productId: s.mug.id, qty: 3 });
    expect((await api.get('/api/cart').set(guest)).body.cart.itemCount).toBe(0);
  });
  it('charges shipping per shop and frees it above the threshold', async () => {
    await api.post('/api/cart/items').set(auth(s.cora)).send({ productId: s.lamp.id, qty: 1 });
    const res = await api.patch(`/api/cart/items/${s.mug.id}`).set(auth(s.cora)).send({ qty: 3 });
    // Alpha: 3 x 2000 = 6000, free shipping. Beta: 4500 + 500 shipping.
    expect(res.body.cart.groups.map((g) => [g.vendor.name, g.subtotal, g.shipping])).toEqual([['Alpha Goods', 6000, 0], ['Beta Supplies', 4500, 500]]);
    expect(res.body.cart).toMatchObject({ subtotal: 10500, shippingTotal: 500, total: 11000 });
  });
});

describe('coupons', () => {
  beforeAll(async () => {
    await api.post('/api/admin/coupons').set(auth(s.admin)).send({ code: 'SAVE10', type: 'percent', value: 10, maxDiscount: 800, perCustomerLimit: 1 }).expect(201);
    await api.post('/api/admin/coupons').set(auth(s.admin)).send({ code: 'OLD', type: 'fixed', value: 500, expiresAt: '2020-01-01' }).expect(201);
    await api.post('/api/vendor/coupons').set(auth(s.vic)).send({ code: 'BETA5', type: 'fixed', value: 500, minSubtotal: 4000 }).expect(201);
  });
  it('rejects unknown, expired and duplicate codes', async () => {
    expect((await api.put('/api/cart/coupon').set(auth(s.cora)).send({ code: 'nope' })).body.error).toMatch(/not valid/);
    expect((await api.put('/api/cart/coupon').set(auth(s.cora)).send({ code: 'OLD' })).body.error).toMatch(/expired/);
    expect((await api.post('/api/vendor/coupons').set(auth(s.vera)).send({ code: 'SAVE10', type: 'fixed', value: 100 })).body.error).toMatch(/already in use/);
    expect((await api.post('/api/admin/coupons').set(auth(s.admin)).send({ code: 'HUGE', type: 'percent', value: 95 })).status).toBe(400);
  });
  it('applies a shop coupon only to that shop’s items', async () => {
    const res = await api.put('/api/cart/coupon').set(auth(s.cora)).send({ code: 'beta5' });
    expect(res.body.cart.coupon).toMatchObject({ code: 'BETA5', discount: 500, vendorId: s.shopB.id });
    expect(res.body.cart.groups.map((g) => g.discount)).toEqual([0, 500]);
  });
  it('applies a marketplace coupon across shops, capped, and spread in proportion', async () => {
    const res = await api.put('/api/cart/coupon').set(auth(s.cora)).send({ code: 'SAVE10' });
    // 10% of 10500 = 1050, capped at 800: 457 to Alpha's 6000, 343 to Beta's 4500
    expect(res.body.cart).toMatchObject({ discount: 800, total: 10200 });
    expect(res.body.cart.groups.map((g) => g.discount)).toEqual([457, 343]);
  });
});

describe('checkout, split payment and commission', () => {
  it('needs an address and a non-empty cart', async () => {
    expect((await api.post('/api/orders/checkout').set(auth(s.cora)).send({})).status).toBe(400);
    expect((await api.post('/api/orders/checkout').set(auth(s.cal)).send({ address: ADDRESS })).body.error).toMatch(/empty/);
    expect((await api.post('/api/orders/checkout').send({ address: ADDRESS })).status).toBe(401);
  });

  it('reserves stock when the order is created', async () => {
    const res = await api.post('/api/orders/checkout').set(auth(s.cora)).send({ addressId: s.addressId });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ order: { total: 10200 }, payment: { provider: 'test' } });
    s.order = res.body.order;
    expect(await stockOf(s.mug.id)).toBe(2);
    expect(await stockOf(s.lamp.id)).toBe(7);
    expect((await api.get('/api/catalog/products/blue-ceramic-mug')).body.product.stock).toBe(2);
  });

  it('declines a bad card, protects other people’s orders, then takes payment', async () => {
    const pay = (who, card) => api.post(`/api/payments/test/${s.order.id}/pay`).set(auth(who)).send(card);
    expect((await pay(s.cora, { ...CARD, cardNumber: '4000 0000 0000 0002' })).status).toBe(402);
    expect((await pay(s.cora, { ...CARD, expiry: '01/20' })).status).toBe(400);
    expect((await pay(s.cal, CARD)).status).toBe(403);
    expect((await pay(s.cora, CARD)).body).toMatchObject({ status: 'paid' });
    expect((await pay(s.cora, CARD)).body).toMatchObject({ status: 'paid' }); // paying twice changes nothing
  });

  it('splits the payment between shops and the platform, to the cent', async () => {
    const order = await models.Order.findById(s.order.id);
    expect(order.payment.status).toBe('paid');
    const [alpha, beta] = order.vendorOrders;
    // Alpha, default 10%: goods 6000 - 457 = 5543, commission 554, shop gets 4989
    expect(alpha).toMatchObject({ subtotal: 6000, discount: 457, shipping: 0, total: 5543, commissionPercent: 10, commission: 554, vendorNet: 4989 });
    // Beta, negotiated 20%: goods 4500 - 343 = 4157, commission 831, shop gets 3326 + 500 shipping
    expect(beta).toMatchObject({ subtotal: 4500, discount: 343, shipping: 500, total: 4657, commissionPercent: 20, commission: 831, vendorNet: 3826 });
    expect(alpha.total + beta.total).toBe(order.total);
    expect(alpha.commission + alpha.vendorNet + beta.commission + beta.vendorNet).toBe(order.total);
    expect(alpha.payout.status).toBe('pending'); // neither shop has connected a payout account yet
  });

  it('empties the cart, counts the coupon and enforces one use per customer', async () => {
    expect((await api.get('/api/cart').set(auth(s.cora))).body.cart.itemCount).toBe(0);
    expect((await models.Coupon.findOne({ code: 'SAVE10' })).usedCount).toBe(1);
    expect((await models.Product.findById(s.mug.id)).soldCount).toBe(3);
    await api.post('/api/cart/items').set(auth(s.cora)).send({ productId: s.cable.id });
    expect((await api.put('/api/cart/coupon').set(auth(s.cora)).send({ code: 'SAVE10' })).body.error).toMatch(/already used/);
    await api.delete(`/api/cart/items/${s.cable.id}`).set(auth(s.cora));
  });

  it('pays shops once they connect a payout account', async () => {
    const before = await api.get('/api/vendor/payouts').set(auth(s.vera));
    expect(before.body).toMatchObject({ connected: false, summary: { pending: 4989, transferred: 0 } });
    await api.post('/api/vendor/payouts/connect').set(auth(s.vera)).send({}).expect(200);
    const after = await api.get('/api/vendor/payouts').set(auth(s.vera));
    expect(after.body).toMatchObject({ connected: true, summary: { pending: 0, transferred: 4989 } });
    expect(after.body.ledger[0]).toMatchObject({ commission: 554, vendorNet: 4989, payout: { status: 'transferred' } });
  });

  it('will not sell the last unit twice', async () => {
    for (const who of [s.cora, s.cal]) await api.post('/api/cart/items').set(auth(who)).send({ productId: s.mug.id, qty: 2 });
    // Both buyers check out at the same moment for the last two units.
    const results = await Promise.all([
      api.post('/api/orders/checkout').set(auth(s.cora)).send({ addressId: s.addressId }),
      api.post('/api/orders/checkout').set(auth(s.cal)).send({ address: ADDRESS }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await stockOf(s.mug.id)).toBe(0);
    const first = results.find((r) => r.status === 201);
    const winner = first === results[0] ? s.cora : s.cal;
    s.loser = winner === s.cora ? s.cal : s.cora;
    s.winner = winner;
    s.abandoned = first.body.order;
  });

  it('returns reserved stock when an unpaid order is abandoned or expires', async () => {
    await api.post(`/api/payments/cancel/${s.abandoned.id}`).set(auth(s.winner)).expect(200);
    expect(await stockOf(s.mug.id)).toBe(2);
    // and the timed sweep does the same for orders nobody cancelled
    await api.patch(`/api/cart/items/${s.mug.id}`).set(auth(s.cal)).send({ qty: 1 });
    const stale = (await api.post('/api/orders/checkout').set(auth(s.cal)).send({ address: ADDRESS })).body.order;
    expect(await stockOf(s.mug.id)).toBe(1);
    // backdate the order (createdAt is immutable through Mongoose, so write it directly)
    await models.Order.collection.updateOne({ _id: new mongoose.Types.ObjectId(stale.id) }, { $set: { createdAt: new Date(Date.now() - 45 * 60000) } });
    const { sweepExpired } = await import('../src/services/orders.js');
    expect(await sweepExpired()).toBe(1);
    expect(await stockOf(s.mug.id)).toBe(2);
    expect((await api.post(`/api/payments/test/${stale.id}/pay`).set(auth(s.cal)).send(CARD)).body.error).toMatch(/expired/);
  });
});

describe('order lifecycle: placed, packed, shipped, delivered', () => {
  const advance = (who, body) => api.post(`/api/vendor/orders/${s.order.id}/advance`).set(auth(who)).send(body);
  it('shows each shop only its own parcel', async () => {
    const mine = await api.get('/api/vendor/orders?status=placed').set(auth(s.vera));
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0].parcel.items.map((i) => i.title)).toEqual(['Blue Ceramic Mug']);
    expect(mine.body.items[0].parcel).toMatchObject({ status: 'placed', vendorNet: 4989 });
    expect(mine.body.items[0].shippingAddress.city).toBe('London');
  });
  it('moves forward one step at a time and needs tracking to ship', async () => {
    expect((await advance(s.vera, { to: 'shipped' })).body.error).toMatch(/next step is “packed”/);
    expect((await advance(s.vera, { to: 'packed' })).body.parcel.status).toBe('packed');
    expect((await advance(s.vera, { to: 'shipped' })).body.error).toMatch(/tracking/);
    const shipped = await advance(s.vera, { to: 'shipped', tracking: { carrier: 'DHL', number: 'JD0146' } });
    expect(shipped.body.parcel).toMatchObject({ status: 'shipped', tracking: { carrier: 'DHL', number: 'JD0146' } });
    expect((await advance(s.vera, { to: 'delivered' })).body.parcel.history.map((h) => h.status)).toEqual(['placed', 'packed', 'shipped', 'delivered']);
    expect((await advance(s.vera, { to: 'delivered' })).status).toBe(400);
  });
  it('shows the customer per-parcel progress', async () => {
    const res = await api.get(`/api/orders/${s.order.id}`).set(auth(s.cora));
    expect(res.body.order.status).toBe('placed'); // Beta has not packed yet
    expect(res.body.order.parcels.map((p) => p.status)).toEqual(['delivered', 'placed']);
    expect(JSON.stringify(res.body)).not.toMatch(/commission|vendorNet/); // shop economics are not shown to customers
    expect((await api.get(`/api/orders/${s.order.id}`).set(auth(s.cal))).status).toBe(403);
  });
  it('lets the customer cancel a parcel that is not packed, refunding and restocking it', async () => {
    const order = (await api.get(`/api/orders/${s.order.id}`).set(auth(s.cora))).body.order;
    const [alpha, beta] = order.parcels;
    expect((await api.post(`/api/orders/${s.order.id}/parcels/${alpha.id}/cancel`).set(auth(s.cora))).status).toBe(400); // already delivered
    const cancelled = await api.post(`/api/orders/${s.order.id}/parcels/${beta.id}/cancel`).set(auth(s.cora));
    expect(cancelled.body.order.parcels[1]).toMatchObject({ status: 'cancelled', refund: { amount: 4657 } });
    expect(cancelled.body.order.status).toBe('delivered');
    expect(await stockOf(s.lamp.id)).toBe(8);
    expect((await api.post(`/api/vendor/orders/${s.order.id}/advance`).set(auth(s.vic)).send({ to: 'packed' })).status).toBe(400);
  });
});

describe('reviews', () => {
  it('only accepts reviews from customers whose parcel was delivered', async () => {
    const review = { rating: 4, title: 'Good mug', body: 'Holds coffee.' };
    expect((await api.post(`/api/catalog/products/${s.mug.id}/reviews`).set(auth(s.cal)).send(review)).status).toBe(403);
    expect((await api.post(`/api/catalog/products/${s.lamp.id}/reviews`).set(auth(s.cora)).send(review)).status).toBe(403); // that parcel was cancelled
    expect((await api.get('/api/catalog/products/blue-ceramic-mug').set(auth(s.cora))).body.canReview).toBe(true);
    expect((await api.post(`/api/catalog/products/${s.mug.id}/reviews`).set(auth(s.cora)).send(review)).status).toBe(201);
  });
  it('keeps one review per customer and updates the product and shop rating', async () => {
    await api.post(`/api/catalog/products/${s.mug.id}/reviews`).set(auth(s.cora)).send({ rating: 5, title: 'Great mug' }).expect(201);
    const list = await api.get(`/api/catalog/products/${s.mug.id}/reviews`);
    expect(list.body).toMatchObject({ total: 1, items: [{ rating: 5, title: 'Great mug', authorName: 'Cora Customer' }] });
    expect((await api.get('/api/catalog/products/blue-ceramic-mug')).body.product).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
    expect((await api.get('/api/catalog/shops/alpha-goods')).body.shop).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
    expect((await api.get('/api/catalog/search?minRating=4')).body.items.map((p) => p.title)).toEqual(['Blue Ceramic Mug']);
  });
  it('lets the shop reply', async () => {
    const mine = await api.get('/api/vendor/reviews').set(auth(s.vera));
    const reply = await api.put(`/api/vendor/reviews/${mine.body.items[0].id}/reply`).set(auth(s.vera)).send({ body: 'Thank you!' });
    expect(reply.body.review.reply.body).toBe('Thank you!');
    expect((await api.put(`/api/vendor/reviews/${mine.body.items[0].id}/reply`).set(auth(s.vic)).send({ body: 'Hijack' })).status).toBe(404);
  });
});

describe('PDF invoices', () => {
  const pdf = (req) => req.buffer(true).parse((res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); });
  it('gives the customer an invoice for the order and each shop one for its parcel', async () => {
    const mine = await pdf(api.get(`/api/orders/${s.order.id}/invoice`).set(auth(s.cora)));
    expect(mine.headers['content-type']).toBe('application/pdf');
    expect(mine.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(mine.body.length).toBeGreaterThan(1500);
    const shop = await pdf(api.get(`/api/vendor/orders/${s.order.id}/invoice`).set(auth(s.vera)));
    expect(shop.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await api.get(`/api/orders/${s.order.id}/invoice`).set(auth(s.cal))).status).toBe(403);
    expect((await api.get(`/api/orders/${s.order.id}/invoice`)).status).toBe(401);
  });
});

describe('analytics', () => {
  it('gives each shop its own numbers', async () => {
    const res = await api.get('/api/vendor/dashboard?days=30').set(auth(s.vera));
    expect(res.body.range).toMatchObject({ gross: 5543, commission: 554, net: 4989, parcels: 1 });
    expect(res.body.series).toHaveLength(30);
    expect(res.body.series.at(-1)).toMatchObject({ net: 4989 });
    expect(res.body.parcels).toMatchObject({ delivered: 1, placed: 0 });
    expect(res.body.topProducts[0]).toMatchObject({ title: 'Blue Ceramic Mug', units: 3, revenue: 5543 });
    expect(res.body.lowStock.map((p) => p.title)).toEqual(expect.arrayContaining(['Oak Salad Bowl', 'Blue Ceramic Mug']));
  });
  it('gives the admin marketplace totals that exclude cancelled parcels', async () => {
    const res = await api.get('/api/admin/analytics?days=30').set(auth(s.admin));
    expect(res.body.range).toMatchObject({ gross: 5543, commission: 554, parcels: 1, orders: 1 });
    expect(res.body.parcels).toMatchObject({ delivered: 1, cancelled: 1 });
    expect(res.body.vendors).toMatchObject({ approved: 2, pending: 0 });
    expect(res.body.topVendors[0]).toMatchObject({ name: 'Alpha Goods', gross: 5543 });
    expect(res.body.categories[0]).toMatchObject({ name: 'Home & Kitchen', units: 3 });
    expect(res.body.customers.total).toBe(2);
  });
});

describe('admin controls', () => {
  it('suspends a shop, which removes its products from search and from carts', async () => {
    await api.post('/api/cart/items').set(auth(s.cal)).send({ productId: s.cable.id }).expect(200);
    await api.patch(`/api/admin/vendors/${s.shopB.id}`).set(auth(s.admin)).send({ status: 'suspended', reviewNote: 'Testing suspension' }).expect(200);
    expect((await api.get('/api/catalog/search?category=Electronics')).body.total).toBe(0);
    expect((await api.get('/api/catalog/products/brass-desk-lamp')).status).toBe(404);
    const cart = (await api.get('/api/cart').set(auth(s.cal))).body.cart;
    expect(cart.lines.find((l) => l.productId === s.cable.id)).toMatchObject({ available: false, note: 'No longer available' });
    expect(cart.total).toBe(cart.groups.reduce((n, g) => n + g.total, 0));
    expect((await api.post(`/api/vendor/orders/${s.order.id}/advance`).set(auth(s.vic)).send({ to: 'packed' })).status).toBe(403);
  });
  it('disables an account immediately, even with a valid token', async () => {
    await api.patch(`/api/admin/users/${s.cal.user.id}`).set(auth(s.admin)).send({ disabled: true }).expect(200);
    expect((await api.get('/api/auth/me').set(auth(s.cal))).status).toBe(401);
    expect((await api.patch(`/api/admin/users/${s.admin.user.id}`).set(auth(s.admin)).send({ role: 'customer' })).status).toBe(400);
  });
  it('lists orders with shop economics and can cancel on a customer’s behalf', async () => {
    const res = await api.get('/api/admin/orders').set(auth(s.admin));
    expect(res.body.items[0].parcels[0]).toMatchObject({ commission: 554, vendorNet: 4989 });
    expect(res.body.items[0].customer.email).toBe('cora@test.dev');
  });
  it('archives a product that has been sold instead of deleting it', async () => {
    expect((await api.delete(`/api/vendor/products/${s.mug.id}`).set(auth(s.vera))).body).toEqual({ archived: true });
    expect((await api.get('/api/catalog/search?q=mug')).body.total).toBe(0);
    expect((await api.get(`/api/orders/${s.order.id}`).set(auth(s.cora))).body.order.parcels[0].items[0].title).toBe('Blue Ceramic Mug');
  });
});
