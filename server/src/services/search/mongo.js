/**
 * MongoDB fallback for product search. Same inputs and outputs as the
 * Elasticsearch driver, without relevance scoring or typo tolerance. It keeps
 * search, filters, sorting and facets working when no cluster is configured.
 */
import mongoose from 'mongoose';
import { Product, Vendor } from '../../models/index.js';
import { escapeRegex } from '../../utils/http.js';

const SORTS = {
  relevance: { soldCount: -1, ratingAvg: -1, _id: 1 },
  'price-asc': { price: 1, _id: 1 },
  'price-desc': { price: -1, _id: 1 },
  newest: { createdAt: -1, _id: 1 },
  rating: { ratingAvg: -1, ratingCount: -1, _id: 1 },
  bestselling: { soldCount: -1, _id: 1 },
};

async function baseFilter({ q, inStock, vendorId }) {
  const approved = await Vendor.find({ status: 'approved' }).distinct('_id');
  const filter = { status: 'active', vendor: vendorId ? new mongoose.Types.ObjectId(vendorId) : { $in: approved } };
  if (vendorId && !approved.some((id) => String(id) === String(vendorId))) filter.vendor = null;
  if (inStock) filter.stock = { $gt: 0 };
  if (q) {
    // every word must start a word in the title, brand, tags, category or description
    filter.$and = q.split(/\s+/).filter(Boolean).slice(0, 8).map((word) => {
      const rx = new RegExp(`(^|[^a-z0-9])${escapeRegex(word)}`, 'i');
      return { $or: [{ title: rx }, { brand: rx }, { tags: rx }, { category: rx }, { description: rx }] };
    });
  }
  return filter;
}

const facetFilters = ({ category, brands = [], minPrice, maxPrice, minRating }) => ({
  category: category ? { category } : null,
  brands: brands.length ? { brand: { $in: brands } } : null,
  price: minPrice != null || maxPrice != null ? { price: { ...(minPrice != null && { $gte: minPrice }), ...(maxPrice != null && { $lte: maxPrice }) } } : null,
  rating: minRating ? { ratingAvg: { $gte: minRating } } : null,
});
const except = (facets, ...names) => Object.assign({}, ...Object.entries(facets).filter(([k, v]) => v && !names.includes(k)).map(([, v]) => v));

export async function search(params) {
  const { sort = 'relevance', page = 1, limit = 24 } = params;
  const base = await baseFilter(params);
  const facets = facetFilters(params);
  const full = { ...base, ...except(facets) };
  const count = (field, ...skip) => Product.aggregate([
    { $match: { ...base, ...except(facets, ...skip) } },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 40 },
  ]);
  const [docs, total, categories, brands, price] = await Promise.all([
    Product.find(full).sort(SORTS[sort] || SORTS.relevance).skip((page - 1) * limit).limit(limit).select('_id').lean(),
    Product.countDocuments(full),
    count('category', 'category'),
    count('brand', 'brands'),
    Product.aggregate([{ $match: { ...base, ...except(facets, 'price') } }, { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } }]),
  ]);
  const toFacet = (rows) => rows.filter((r) => r._id).map((r) => ({ value: r._id, count: r.count }));
  return {
    ids: docs.map((d) => String(d._id)),
    total, page, pages: Math.max(1, Math.ceil(total / limit)),
    facets: { categories: toFacet(categories), brands: toFacet(brands), price: { min: price[0]?.min ?? 0, max: price[0]?.max ?? 0 } },
  };
}

export async function suggest(q, limit = 6) {
  const base = await baseFilter({ q });
  const docs = await Product.find(base).sort({ soldCount: -1 }).limit(limit).select('title slug category').lean();
  return docs.map((d) => ({ id: String(d._id), title: d.title, slug: d.slug, category: d.category }));
}
