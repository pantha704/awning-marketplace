/**
 * Product search facade. Elasticsearch when ELASTICSEARCH_URL is configured
 * and reachable, otherwise the MongoDB fallback. If Elasticsearch fails on a
 * live request the fallback answers that request, so search never goes down.
 */
import { config } from '../../config.js';
import { Product, Vendor } from '../../models/index.js';
import { log } from '../../utils/log.js';
import * as elastic from './elastic.js';
import * as mongo from './mongo.js';

export const searchInfo = { driver: 'none', detail: '' };
const usingElastic = () => searchInfo.driver === 'elasticsearch';

export async function initSearch() {
  const wanted = config.searchDriver;
  if (wanted !== 'mongo' && config.elastic.url) {
    try {
      const info = await elastic.ping();
      await elastic.ensureIndex();
      searchInfo.driver = 'elasticsearch';
      searchInfo.detail = `${info.distribution} ${info.version}`;
      return searchInfo.driver;
    } catch (err) {
      if (wanted === 'elasticsearch' || config.isProd) throw new Error(`Elasticsearch is not usable at ELASTICSEARCH_URL: ${err.message}`);
      log.warn(`Elasticsearch not reachable (${err.message}). Search falls back to MongoDB.`);
    }
  }
  searchInfo.driver = 'mongo';
  searchInfo.detail = 'MongoDB fallback';
  return searchInfo.driver;
}

/** The document Elasticsearch stores for a product. */
export function toDocument(product, vendor) {
  return {
    id: String(product._id),
    title: product.title,
    description: product.description,
    brand: product.brand || '',
    category: product.category,
    tags: product.tags || [],
    vendorId: String(vendor._id),
    vendorName: vendor.name,
    slug: product.slug,
    price: product.price,
    ratingAvg: product.ratingAvg || 0,
    ratingCount: product.ratingCount || 0,
    soldCount: product.soldCount || 0,
    stock: product.stock,
    inStock: product.stock > 0,
    createdAt: product.createdAt,
  };
}

/** Bring the index in line with MongoDB for the given products (index the visible ones, remove the rest). */
export async function syncProducts(productIds) {
  if (!usingElastic() || !productIds?.length) return;
  try {
    const products = await Product.find({ _id: { $in: productIds } }).lean();
    const vendors = new Map((await Vendor.find({ _id: { $in: products.map((p) => p.vendor) } }).select('name status').lean()).map((v) => [String(v._id), v]));
    const found = new Set(products.map((p) => String(p._id)));
    const visible = [];
    const hidden = productIds.map(String).filter((id) => !found.has(id));
    for (const p of products) {
      const vendor = vendors.get(String(p.vendor));
      if (p.status === 'active' && vendor?.status === 'approved') visible.push(toDocument(p, vendor));
      else hidden.push(String(p._id));
    }
    if (visible.length) await elastic.bulkIndex(visible);
    await Promise.all(hidden.map((id) => elastic.removeDoc(id)));
    await elastic.refresh().catch(() => {});
  } catch (err) {
    log.warn(`Search index sync failed (${err.message}). Run "npm run reindex" to repair it.`);
  }
}
export const syncProduct = (id) => syncProducts([id]);
export async function syncVendor(vendorId) {
  if (!usingElastic()) return;
  await syncProducts(await Product.find({ vendor: vendorId }).distinct('_id'));
}

export async function reindexAll() {
  if (!usingElastic()) return { driver: searchInfo.driver, indexed: 0 };
  await elastic.resetIndex();
  const approved = await Vendor.find({ status: 'approved' }).select('name status').lean();
  const byId = new Map(approved.map((v) => [String(v._id), v]));
  const products = await Product.find({ status: 'active', vendor: { $in: approved.map((v) => v._id) } }).lean();
  await elastic.bulkIndex(products.map((p) => toDocument(p, byId.get(String(p.vendor)))));
  await elastic.refresh();
  return { driver: 'elasticsearch', indexed: products.length };
}

export async function search(params) {
  if (usingElastic()) {
    try {
      return { ...(await elastic.search(params)), engine: 'elasticsearch' };
    } catch (err) {
      log.warn(`Elasticsearch query failed, answering from MongoDB: ${err.message}`);
    }
  }
  return { ...(await mongo.search(params)), engine: 'mongo' };
}

export async function suggest(q) {
  if (usingElastic()) {
    try { return await elastic.suggest(q); } catch { /* fall through */ }
  }
  return mongo.suggest(q);
}
