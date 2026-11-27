/**
 * Runs the search driver against a real Elasticsearch or OpenSearch node.
 * Skipped unless TEST_ELASTICSEARCH_URL is set, for example:
 *   TEST_ELASTICSEARCH_URL=http://localhost:9200 npm test
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';

const url = process.env.TEST_ELASTICSEARCH_URL;

describe.skipIf(!url)('search against a real Elasticsearch node', () => {
  let search; let models; let elastic;
  beforeAll(async () => {
    const { config } = await import('../src/config.js');
    Object.assign(config.elastic, { url, index: `awning_test_${Date.now()}`, apiKey: undefined, username: undefined, password: undefined });
    config.searchDriver = 'elasticsearch';
    process.env.MONGO_URI = `${process.env.MONGO_URI}_es`;
    const { connectDb } = await import('../src/db.js');
    await connectDb();
    await mongoose.connection.dropDatabase();
    models = await import('../src/models/index.js');
    search = await import('../src/services/search/index.js');
    elastic = await import('../src/services/search/elastic.js');
    await search.initSearch();
    const owner = await models.User.create({ name: 'O', email: 'o@es.dev', role: 'vendor', passwordHash: 'x' });
    const shop = await models.Vendor.create({ owner: owner._id, name: 'Test Shop', slug: 'test-shop', status: 'approved' });
    const hidden = await models.Vendor.create({ owner: new mongoose.Types.ObjectId(), name: 'Hidden Shop', slug: 'hidden', status: 'suspended' });
    const p = (title, extra) => ({ vendor: shop._id, title, slug: title.toLowerCase().replace(/\W+/g, '-'), category: 'Home & Kitchen', price: 1000, stock: 5, status: 'active', ...extra });
    await models.Product.insertMany([
      p('Stoneware Coffee Mug', { brand: 'Halden', price: 1800, soldCount: 40, ratingAvg: 4.8 }),
      p('Enamel Mug', { brand: 'Halden', price: 1200, soldCount: 5, ratingAvg: 3.9 }),
      p('Gooseneck Kettle', { brand: 'Halden', price: 6400, description: 'A slow, steady pour.', soldCount: 12 }),
      p('Wireless Headphones', { category: 'Electronics', brand: 'Aerial', price: 12900, stock: 0 }),
      p('Draft Lamp', { status: 'draft' }),
      { ...p('Hidden Mug'), vendor: hidden._id },
    ]);
    const result = await search.reindexAll();
    expect(result.indexed).toBe(4); // drafts and suspended shops are never indexed
  });
  afterAll(async () => {
    await elastic.es('DELETE', `/${(await import('../src/config.js')).config.elastic.index}`, undefined, { ok404: true });
    await mongoose.connection.dropDatabase();
    await (await import('../src/db.js')).disconnectDb();
  });
  const titles = (r) => r.ids.length;

  it('answers from Elasticsearch, not the fallback', async () => {
    expect((await search.search({ q: 'mug' })).engine).toBe('elasticsearch');
  });
  it('tolerates typos', async () => {
    const r = await search.search({ q: 'stonware mgu' });
    expect(r.total).toBeGreaterThanOrEqual(1);
    const first = await models.Product.findById(r.ids[0]);
    expect(first.title).toBe('Stoneware Coffee Mug');
  });
  it('matches description words and brands', async () => {
    expect(titles(await search.search({ q: 'steady pour' }))).toBe(1);
    expect((await search.search({ q: 'halden' })).total).toBe(3);
  });
  it('filters, sorts and builds facets', async () => {
    const r = await search.search({ category: 'Home & Kitchen', sort: 'price-asc' });
    const docs = await models.Product.find({ _id: { $in: r.ids } });
    const byId = new Map(docs.map((d) => [String(d._id), d.price]));
    expect(r.ids.map((id) => byId.get(id))).toEqual([1200, 1800, 6400]);
    expect(r.facets.categories).toEqual(expect.arrayContaining([{ value: 'Home & Kitchen', count: 3 }, { value: 'Electronics', count: 1 }]));
    expect(r.facets.brands).toEqual([{ value: 'Halden', count: 3 }]);
    expect((await search.search({ inStock: true })).total).toBe(3);
    expect((await search.search({ minPrice: 1500, maxPrice: 7000 })).total).toBe(2);
    expect((await search.search({ minRating: 4.5 })).total).toBe(1);
  });
  it('suggests as you type', async () => {
    const s = await search.suggest('goose');
    expect(s[0].title).toBe('Gooseneck Kettle');
  });
  it('keeps the index in step with product changes', async () => {
    const kettle = await models.Product.findOne({ title: 'Gooseneck Kettle' });
    kettle.status = 'archived';
    await kettle.save();
    await search.syncProduct(kettle._id);
    expect((await search.search({ q: 'kettle' })).total).toBe(0);
  });
});
