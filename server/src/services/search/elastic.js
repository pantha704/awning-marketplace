/**
 * Elasticsearch driver. Talks to the REST API directly, so it works with
 * Elasticsearch 7, 8 and 9, Elastic Cloud (API key) and OpenSearch alike,
 * without pinning a client library to a server version.
 */
import { config } from '../../config.js';

const { elastic } = config;
const index = () => elastic.index;

function headers(extra = {}) {
  const h = { ...extra };
  if (elastic.apiKey) h.Authorization = `ApiKey ${elastic.apiKey}`;
  else if (elastic.username) h.Authorization = `Basic ${Buffer.from(`${elastic.username}:${elastic.password || ''}`).toString('base64')}`;
  return h;
}

export async function es(method, path, body, { ndjson = false, ok404 = false } = {}) {
  const res = await fetch(`${elastic.url}${path}`, {
    method,
    headers: headers(body !== undefined ? { 'Content-Type': ndjson ? 'application/x-ndjson' : 'application/json' } : {}),
    body: body === undefined ? undefined : ndjson ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 404 && ok404) return null;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const reason = data?.error?.reason || data?.error?.root_cause?.[0]?.reason || data?.error || text.slice(0, 200);
    throw new Error(`Elasticsearch ${method} ${path} failed (${res.status}): ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`);
  }
  return data;
}

export const MAPPING = {
  properties: {
    title: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 256 }, suggest: { type: 'search_as_you_type' } } },
    description: { type: 'text' },
    brand: { type: 'keyword', fields: { text: { type: 'text' } } },
    category: { type: 'keyword', fields: { text: { type: 'text' } } },
    tags: { type: 'keyword', fields: { text: { type: 'text' } } },
    vendorId: { type: 'keyword' },
    vendorName: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 256 } } },
    slug: { type: 'keyword' },
    price: { type: 'integer' },
    ratingAvg: { type: 'float' },
    ratingCount: { type: 'integer' },
    soldCount: { type: 'integer' },
    stock: { type: 'integer' },
    inStock: { type: 'boolean' },
    createdAt: { type: 'date' },
  },
};

export async function ping() {
  const info = await es('GET', '/');
  return { version: info?.version?.number || 'unknown', distribution: info?.version?.distribution || 'elasticsearch', cluster: info?.cluster_name };
}

export async function ensureIndex() {
  const found = await es('GET', `/${index()}`, undefined, { ok404: true });
  if (!found) await es('PUT', `/${index()}`, { mappings: MAPPING });
}

export async function resetIndex() {
  await es('DELETE', `/${index()}`, undefined, { ok404: true });
  await es('PUT', `/${index()}`, { mappings: MAPPING });
}

export const indexDoc = (id, doc) => es('PUT', `/${index()}/_doc/${id}`, doc);
export const removeDoc = (id) => es('DELETE', `/${index()}/_doc/${id}`, undefined, { ok404: true });
export const refresh = () => es('POST', `/${index()}/_refresh`);

export async function bulkIndex(docs) {
  for (let i = 0; i < docs.length; i += 500) {
    const lines = docs.slice(i, i + 500).flatMap(({ id, ...doc }) => [JSON.stringify({ index: { _index: index(), _id: id } }), JSON.stringify(doc)]);
    const result = await es('POST', '/_bulk', `${lines.join('\n')}\n`, { ndjson: true });
    if (result?.errors) {
      const first = result.items.find((item) => item.index?.error)?.index.error;
      throw new Error(`Elasticsearch bulk index failed: ${first?.reason || 'unknown error'}`);
    }
  }
}

const SORTS = {
  relevance: ['_score', { soldCount: 'desc' }],
  'price-asc': [{ price: 'asc' }, '_score'],
  'price-desc': [{ price: 'desc' }, '_score'],
  newest: [{ createdAt: 'desc' }],
  rating: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }],
  bestselling: [{ soldCount: 'desc' }, '_score'],
};

/** Build the search request body. Exported so the test suite can check its shape. */
export function buildQuery({ q, category, brands = [], minPrice, maxPrice, minRating, inStock, vendorId, sort = 'relevance', page = 1, limit = 24 }) {
  const must = q
    ? [{
        bool: {
          minimum_should_match: 1,
          should: [
            // every word somewhere across the fields (exact terms rank highest)
            { multi_match: { query: q, type: 'cross_fields', operator: 'and', boost: 2, fields: ['title^4', 'brand.text^3', 'category.text^2', 'tags.text^2', 'vendorName', 'description'] } },
            // typo tolerance
            { multi_match: { query: q, type: 'best_fields', operator: 'and', fuzziness: 'AUTO', fields: ['title^4', 'brand.text^3', 'tags.text^2', 'description'] } },
            // as-you-type prefixes
            { multi_match: { query: q, type: 'bool_prefix', fields: ['title.suggest', 'title.suggest._2gram', 'title.suggest._3gram'] } },
          ],
        },
      }]
    : [{ match_all: {} }];

  // Hard filters shrink the result set and every facet.
  const filter = [];
  if (vendorId) filter.push({ term: { vendorId } });
  if (inStock) filter.push({ term: { inStock: true } });

  // Facet filters are applied after aggregation (post_filter), and each facet
  // is counted with every facet filter except its own, so options stay selectable.
  const facet = {
    category: category ? { term: { category } } : null,
    brands: brands.length ? { terms: { brand: brands } } : null,
    price: minPrice != null || maxPrice != null ? { range: { price: { ...(minPrice != null && { gte: minPrice }), ...(maxPrice != null && { lte: maxPrice }) } } } : null,
    rating: minRating ? { range: { ratingAvg: { gte: minRating } } } : null,
  };
  const except = (...names) => ({ bool: { filter: Object.entries(facet).filter(([k, v]) => v && !names.includes(k)).map(([, v]) => v) } });

  return {
    from: (page - 1) * limit,
    size: limit,
    track_total_hits: true,
    _source: false,
    query: { bool: { must, filter } },
    post_filter: except(),
    sort: SORTS[sort] || SORTS.relevance,
    aggs: {
      categories: { filter: except('category'), aggs: { values: { terms: { field: 'category', size: 20 } } } },
      brands: { filter: except('brands'), aggs: { values: { terms: { field: 'brand', size: 40 } } } },
      price: { filter: except('price'), aggs: { stats: { stats: { field: 'price' } } } },
    },
  };
}

const buckets = (agg) => (agg?.values?.buckets || []).filter((b) => b.key !== '').map((b) => ({ value: b.key, count: b.doc_count }));

export function parseResponse(res, { page = 1, limit = 24 } = {}) {
  const total = typeof res.hits.total === 'number' ? res.hits.total : res.hits.total?.value || 0;
  const stats = res.aggregations?.price?.stats;
  return {
    ids: res.hits.hits.map((h) => h._id),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    facets: {
      categories: buckets(res.aggregations?.categories),
      brands: buckets(res.aggregations?.brands),
      price: { min: stats?.min ?? 0, max: stats?.max ?? 0 },
    },
  };
}

export async function search(params) {
  const res = await es('POST', `/${index()}/_search`, buildQuery(params));
  return parseResponse(res, params);
}

export async function suggest(q, limit = 6) {
  const res = await es('POST', `/${index()}/_search`, {
    size: limit,
    _source: ['title', 'slug', 'category'],
    query: {
      bool: {
        should: [
          { multi_match: { query: q, type: 'bool_prefix', boost: 2, fields: ['title.suggest', 'title.suggest._2gram', 'title.suggest._3gram', 'brand.text'] } },
          { match: { title: { query: q, fuzziness: 'AUTO', operator: 'and' } } }, // still suggests through a typo
        ],
        minimum_should_match: 1,
      },
    },
    sort: ['_score', { soldCount: 'desc' }],
  });
  return res.hits.hits.map((h) => ({ id: h._id, title: h._source.title, slug: h._source.slug, category: h._source.category }));
}
