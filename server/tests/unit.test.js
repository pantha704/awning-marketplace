import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { allocate, split } from '../src/services/pricing.js';
import { buildQuery, parseResponse } from '../src/services/search/elastic.js';
import { overallStatus } from '../src/utils/serialize.js';
import { productArt, KINDS } from '../src/seed/art.js';

describe('money maths', () => {
  it('spreads a discount across lines without losing a cent', () => {
    const lines = [{ lineTotal: 3333 }, { lineTotal: 3333 }, { lineTotal: 3334 }];
    allocate(1000, lines);
    expect(lines.reduce((n, l) => n + l.discount, 0)).toBe(1000);
    expect(lines.map((l) => l.discount)).toEqual([333, 333, 334]);
  });
  it('takes commission on goods after discount and passes shipping to the shop', () => {
    expect(split({ subtotal: 10000, discount: 1000, shipping: 500, commissionPercent: 10 })).toEqual({ commission: 900, vendorNet: 8600 });
    const s = split({ subtotal: 3333, discount: 0, shipping: 0, commissionPercent: 12.5 });
    expect(s.commission + s.vendorNet).toBe(3333);
  });
});

describe('order status', () => {
  const order = (statuses, payment = 'paid') => ({ payment: { status: payment }, vendorOrders: statuses.map((status) => ({ status })) });
  it('is the least advanced parcel, ignoring cancelled ones', () => {
    expect(overallStatus(order(['delivered', 'packed']))).toBe('packed');
    expect(overallStatus(order(['delivered', 'cancelled']))).toBe('delivered');
    expect(overallStatus(order(['cancelled']))).toBe('cancelled');
    expect(overallStatus(order(['placed'], 'pending'))).toBe('awaiting payment');
  });
});

describe('Elasticsearch query builder', () => {
  it('searches text with typo tolerance and prefix matching', () => {
    const body = buildQuery({ q: 'stonware mug' });
    const should = body.query.bool.must[0].bool.should;
    expect(should.map((s) => s.multi_match.type)).toEqual(['cross_fields', 'best_fields', 'bool_prefix']);
    expect(should[1].multi_match.fuzziness).toBe('AUTO');
    expect(body.sort[0]).toBe('_score');
  });
  it('applies facet filters after aggregation so other options stay countable', () => {
    const body = buildQuery({ category: 'Electronics', brands: ['Aerial', 'Tacto'], minPrice: 1000, maxPrice: 9000, minRating: 4, inStock: true, vendorId: 'v1', sort: 'price-asc', page: 3, limit: 12 });
    expect(body.from).toBe(24);
    expect(body.query.bool.filter).toEqual([{ term: { vendorId: 'v1' } }, { term: { inStock: true } }]);
    expect(body.post_filter.bool.filter).toHaveLength(4);
    // the category facet ignores the category filter but keeps the others
    expect(body.aggs.categories.filter.bool.filter).toHaveLength(3);
    expect(JSON.stringify(body.aggs.categories.filter)).not.toContain('"category"');
    expect(JSON.stringify(body.aggs.brands.filter)).not.toContain('"brand"');
    expect(body.aggs.price.filter.bool.filter.some((f) => f.range?.price)).toBe(false);
    expect(body.sort[0]).toEqual({ price: 'asc' });
  });
  it('matches everything when there is no query', () => {
    expect(buildQuery({}).query.bool.must).toEqual([{ match_all: {} }]);
  });
  it('reads hits, totals and facets from a response', () => {
    const out = parseResponse({
      hits: { total: { value: 37, relation: 'eq' }, hits: [{ _id: 'a' }, { _id: 'b' }] },
      aggregations: { categories: { values: { buckets: [{ key: 'Garden', doc_count: 9 }] } }, brands: { values: { buckets: [{ key: '', doc_count: 2 }, { key: 'Olaria', doc_count: 3 }] } }, price: { stats: { min: 900, max: 5400 } } },
    }, { page: 2, limit: 12 });
    expect(out).toMatchObject({ ids: ['a', 'b'], total: 37, page: 2, pages: 4 });
    expect(out.facets).toEqual({ categories: [{ value: 'Garden', count: 9 }], brands: [{ value: 'Olaria', count: 3 }], price: { min: 900, max: 5400 } });
  });
});

/**
 * The Elasticsearch driver is exercised against a small stand-in HTTP server
 * that records what it is sent. This proves the requests are well formed
 * (paths, auth header, NDJSON bulk body); it does not replace a run against a real cluster.
 */
describe('Elasticsearch driver wire format', () => {
  let server; let seen = []; let elastic; let config;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        seen.push({ method: req.method, url: req.url, headers: req.headers, body });
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'GET' && req.url === '/') return res.end(JSON.stringify({ cluster_name: 'stub', version: { number: '8.15.0' } }));
        if (req.method === 'GET' && req.url === '/awning_products') { res.statusCode = 404; return res.end(JSON.stringify({ error: { reason: 'no such index' } })); }
        if (req.url === '/_bulk') return res.end(JSON.stringify({ errors: false, items: [] }));
        if (req.url.endsWith('/_search')) return res.end(JSON.stringify({ hits: { total: { value: 1 }, hits: [{ _id: 'p1', _source: { title: 'Mug', slug: 'mug', category: 'Home & Kitchen' } }] }, aggregations: {} }));
        res.end(JSON.stringify({ acknowledged: true }));
      });
    });
    await new Promise((r) => server.listen(0, r));
    ({ config } = await import('../src/config.js'));
    config.elastic.url = `http://127.0.0.1:${server.address().port}`;
    config.elastic.apiKey = 'abc123';
    elastic = await import('../src/services/search/elastic.js');
  });
  afterAll(async () => { config.elastic.url = undefined; config.elastic.apiKey = undefined; await new Promise((r) => server.close(r)); });

  it('pings, creates the index with a mapping and authenticates with the API key', async () => {
    expect(await elastic.ping()).toMatchObject({ version: '8.15.0' });
    await elastic.ensureIndex();
    const put = seen.find((r) => r.method === 'PUT');
    expect(put.url).toBe('/awning_products');
    expect(JSON.parse(put.body).mappings.properties.title.fields.suggest.type).toBe('search_as_you_type');
    expect(seen.every((r) => r.headers.authorization === 'ApiKey abc123')).toBe(true);
  });
  it('bulk indexes as NDJSON and parses search results', async () => {
    seen = [];
    await elastic.bulkIndex([{ id: 'p1', title: 'Mug', price: 1800 }, { id: 'p2', title: 'Bowl', price: 1600 }]);
    const bulk = seen[0];
    expect(bulk.headers['content-type']).toBe('application/x-ndjson');
    const lines = bulk.body.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toEqual([{ index: { _index: 'awning_products', _id: 'p1' } }, { title: 'Mug', price: 1800 }, { index: { _index: 'awning_products', _id: 'p2' } }, { title: 'Bowl', price: 1600 }]);
    expect(await elastic.search({ q: 'mug' })).toMatchObject({ ids: ['p1'], total: 1 });
    expect(await elastic.suggest('mu')).toEqual([{ id: 'p1', title: 'Mug', slug: 'mug', category: 'Home & Kitchen' }]);
  });
  it('surfaces Elasticsearch errors with their reason', async () => {
    await expect(elastic.es('GET', '/awning_products')).rejects.toThrow(/no such index/);
  });
});

describe('demo product art', () => {
  it('draws every pictogram as valid, script-free SVG', () => {
    for (const kind of KINDS) {
      const svg = productArt(kind, 3);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).not.toMatch(/<script|undefined|NaN/);
    }
  });
});
