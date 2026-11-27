/**
 * Key-value store for carts, cached sessions and cached pages.
 * Redis is the real driver. When Redis is not reachable in development an
 * in-memory map with the same interface takes over, so nothing else changes.
 */
import { config } from '../config.js';
import { log } from '../utils/log.js';

export const kvInfo = { driver: 'none' };
let redis = null;
const memory = new Map(); // key -> { value, expiresAt }

export async function initKv() {
  let driver = config.cacheDriver;
  if (driver !== 'memory') {
    const { default: IORedis } = await import('ioredis');
    // Probe first with a client that gives up quickly, so a missing Redis does not stall startup.
    const probe = new IORedis(config.redisUrl, { lazyConnect: true, connectTimeout: 2500, maxRetriesPerRequest: 0, retryStrategy: () => null, enableOfflineQueue: false });
    probe.on('error', () => {});
    try {
      await probe.connect();
      await probe.ping();
      redis = new IORedis(config.redisUrl, { maxRetriesPerRequest: 2 });
      redis.on('error', (err) => log.error('Redis:', err.message));
      driver = 'redis';
    } catch (err) {
      if (driver === 'redis' || config.isProd) throw new Error(`Redis is not reachable at REDIS_URL (${err.message || 'connection refused'}). Fix it or set CACHE_DRIVER=memory.`);
      log.warn('Redis not reachable. Carts and caches are kept in memory for this run.');
      driver = 'memory';
    } finally {
      probe.disconnect();
    }
  }
  kvInfo.driver = driver;
  return driver;
}

export async function closeKv() {
  redis?.disconnect();
  redis = null;
  memory.clear();
}

function memGet(key) {
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expiresAt && hit.expiresAt < Date.now()) { memory.delete(key); return null; }
  return hit.value;
}

export const kv = {
  async get(key) {
    const raw = redis ? await redis.get(key) : memGet(key);
    if (raw == null) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },
  async set(key, value, ttlSeconds) {
    const raw = JSON.stringify(value);
    if (redis) return ttlSeconds ? redis.set(key, raw, 'EX', ttlSeconds) : redis.set(key, raw);
    memory.set(key, { value: raw, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0 });
    if (memory.size > 20000) for (const k of memory.keys()) { if (!memGet(k)) memory.delete(k); }
    return 'OK';
  },
  async del(...keys) {
    if (!keys.length) return 0;
    if (redis) return redis.del(...keys);
    keys.forEach((k) => memory.delete(k));
    return keys.length;
  },
  /** Read-through cache: returns the cached value or computes, stores and returns it. */
  async cached(key, ttlSeconds, compute) {
    const hit = await this.get(key);
    if (hit !== null) return hit;
    const value = await compute();
    await this.set(key, value, ttlSeconds).catch(() => {});
    return value;
  },
  async ping() {
    if (!redis) return 'memory';
    return redis.ping();
  },
};

/** Cache keys used across the app, in one place. */
export const keys = {
  session: (userId) => `sess:${userId}`,
  cart: (cartId) => `cart:${cartId}`,
  home: () => 'page:home',
  facets: () => 'page:categories',
};
