import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(__dirname, '..');
export const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

dotenv.config({ path: path.join(SERVER_ROOT, '.env'), quiet: true });

/**
 * Read an env var. Empty values and untouched placeholders (anything that
 * starts with REPLACE_ME) count as "not set", so the app boots with the
 * shipped .env and falls back to its local drivers.
 */
function env(name, fallback = undefined) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = String(raw).trim();
  if (!value || value.startsWith('REPLACE_ME')) return fallback;
  return value;
}
const bool = (name, fallback) => {
  const v = env(name);
  return v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
};
const num = (name, fallback) => {
  const v = env(name);
  return v !== undefined && Number.isFinite(Number(v)) ? Number(v) : fallback;
};
const trimUrl = (u) => (u ? u.replace(/\/+$/, '') : u);

const nodeEnv = env('NODE_ENV', 'development');
const isProd = nodeEnv === 'production';
const isTest = nodeEnv === 'test';
const port = num('PORT', 4000);

const aws = {
  region: env('AWS_REGION'),
  accessKeyId: env('AWS_ACCESS_KEY_ID'),
  secretAccessKey: env('AWS_SECRET_ACCESS_KEY'),
  bucket: env('S3_BUCKET'),
  publicUrl: trimUrl(env('S3_PUBLIC_URL')),
};
const s3Ready = Boolean(aws.region && aws.bucket);
const requestedStorage = env('STORAGE_DRIVER', 'auto');

const stripeSecretKey = env('STRIPE_SECRET_KEY');
const razorpay = { keyId: env('RAZORPAY_KEY_ID'), keySecret: env('RAZORPAY_KEY_SECRET'), webhookSecret: env('RAZORPAY_WEBHOOK_SECRET') };
const requestedPayments = env('PAYMENT_PROVIDER', 'auto');
const paymentProvider =
  requestedPayments !== 'auto' ? requestedPayments : stripeSecretKey ? 'stripe' : razorpay.keyId && razorpay.keySecret ? 'razorpay' : 'test';

const clientUrls = env('CLIENT_URL', 'http://localhost:5173').split(',').map((s) => trimUrl(s.trim())).filter(Boolean);

export const config = {
  nodeEnv, isProd, isTest, port,
  clientUrls,
  clientUrl: clientUrls[0], // the first one is used in emails, redirects and invoices
  publicUrl: trimUrl(env('PUBLIC_URL', `http://localhost:${port}`)),

  mongoUri: env('MONGO_URI', 'mongodb://127.0.0.1:27017/awning'),
  mongoMemoryFallback: bool('MONGO_MEMORY_FALLBACK', !isProd),
  autoSeed: bool('AUTO_SEED', !isProd && !isTest),

  jwtSecret: env('JWT_SECRET', isProd ? undefined : 'dev-only-secret-change-me'),
  jwtExpiresIn: env('JWT_EXPIRES_IN', '7d'),

  redisUrl: env('REDIS_URL', 'redis://127.0.0.1:6379'),
  cacheDriver: env('CACHE_DRIVER', 'auto'), // auto | redis | memory

  searchDriver: env('SEARCH_DRIVER', 'auto'), // auto | elasticsearch | mongo
  elastic: {
    url: trimUrl(env('ELASTICSEARCH_URL')),
    apiKey: env('ELASTICSEARCH_API_KEY'),
    username: env('ELASTICSEARCH_USERNAME'),
    password: env('ELASTICSEARCH_PASSWORD'),
    index: env('ELASTICSEARCH_INDEX', 'awning_products'),
  },

  storageDriver: requestedStorage === 'auto' ? (s3Ready ? 's3' : 'local') : requestedStorage,
  aws, s3Ready,
  storageRoot: path.resolve(SERVER_ROOT, env('STORAGE_DIR', 'storage')),
  maxImageMb: num('MAX_IMAGE_MB', 5),

  paymentProvider, // stripe | razorpay | test
  stripeSecretKey,
  stripeWebhookSecret: env('STRIPE_WEBHOOK_SECRET'),
  razorpay,
  commissionPercent: num('PLATFORM_COMMISSION_PERCENT', 10),
  currency: env('CURRENCY', 'usd').toLowerCase(),
  shippingFlat: num('SHIPPING_FLAT', 499), // per shop, in minor units
  freeShippingOver: num('FREE_SHIPPING_OVER', 5000), // per shop, in minor units
};

export function assertConfig() {
  const problems = [];
  if (!config.jwtSecret) problems.push('JWT_SECRET is required in production.');
  if (config.storageDriver === 's3' && !config.s3Ready) problems.push('STORAGE_DRIVER=s3 needs AWS_REGION and S3_BUCKET.');
  if (config.paymentProvider === 'stripe' && !config.stripeSecretKey) problems.push('PAYMENT_PROVIDER=stripe needs STRIPE_SECRET_KEY.');
  if (config.paymentProvider === 'razorpay' && !(config.razorpay.keyId && config.razorpay.keySecret)) problems.push('PAYMENT_PROVIDER=razorpay needs RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  if (config.searchDriver === 'elasticsearch' && !config.elastic.url) problems.push('SEARCH_DRIVER=elasticsearch needs ELASTICSEARCH_URL.');
  if (problems.length) throw new Error(`Invalid configuration:\n - ${problems.join('\n - ')}\nSee SETUP_GUIDE.md.`);
}
