/**
 * `npm run doctor` - checks every external dependency and says, in plain words,
 * what works, what is running on a local fallback, and what to fix.
 * Exit code 0 = nothing failed. Exit code 1 = at least one FAIL line.
 */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { config, SERVER_ROOT } from './config.js';

const lines = [];
let failed = false;
const pass = (name, detail) => lines.push(`PASS  ${name.padEnd(14)} ${detail}`);
const warn = (name, detail) => lines.push(`WARN  ${name.padEnd(14)} ${detail}`);
const fail = (name, detail) => { failed = true; lines.push(`FAIL  ${name.padEnd(14)} ${detail}`); };
const redact = (url) => String(url).replace(/\/\/([^:/]*):([^@]+)@/, '//$1:***@');

async function main() {
  const [major] = process.versions.node.split('.').map(Number);
  major >= 18 ? pass('node', `v${process.versions.node}`) : fail('node', `v${process.versions.node} is too old; install Node 20+`);
  fs.existsSync(path.join(SERVER_ROOT, '.env')) ? pass('env file', 'server/.env found') : warn('env file', 'server/.env missing; run `npm run setup`');
  if (!config.jwtSecret || config.jwtSecret === 'dev-only-secret-change-me') (config.isProd ? fail : warn)('jwt', 'JWT_SECRET is not set; run `npm run setup` or set a long random value');
  else pass('jwt', 'JWT_SECRET is set');

  // MongoDB
  let mongoOk = false;
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 4000 });
    mongoOk = true;
    pass('mongodb', `connected to ${redact(config.mongoUri)}`);
  } catch (err) {
    const msg = `cannot reach MONGO_URI (${err.message.split('\n')[0]})`;
    config.mongoMemoryFallback && !config.isProd ? warn('mongodb', `${msg}. Development will use the embedded database. For production see SETUP_GUIDE.md step B2.`) : fail('mongodb', `${msg}. See SETUP_GUIDE.md step B2.`);
  }

  // Redis
  if (config.cacheDriver === 'memory') warn('redis', 'CACHE_DRIVER=memory: carts and sessions are kept in the API process and are lost on restart');
  else {
    try {
      const { default: IORedis } = await import('ioredis');
      const redis = new IORedis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 0, connectTimeout: 3000, retryStrategy: () => null });
      redis.on('error', () => {});
      await redis.connect();
      await redis.set('awning:doctor', '1', 'EX', 10);
      redis.disconnect();
      pass('redis', `connected to ${redact(config.redisUrl)} (carts and session cache)`);
    } catch (err) {
      const msg = `cannot reach REDIS_URL (${err.message || 'connection refused'})`;
      config.cacheDriver === 'auto' && !config.isProd ? warn('redis', `${msg}. Development keeps carts in memory. See SETUP_GUIDE.md step B3.`) : fail('redis', `${msg}. See SETUP_GUIDE.md step B3.`);
    }
  }

  // Elasticsearch
  if (config.searchDriver === 'mongo' || !config.elastic.url) {
    warn('elasticsearch', 'not configured: product search uses the MongoDB fallback (no typo tolerance or relevance ranking). See SETUP_GUIDE.md step B4.');
  } else {
    try {
      const elastic = await import('./services/search/elastic.js');
      const info = await elastic.ping();
      await elastic.ensureIndex();
      const count = await elastic.es('GET', `/${config.elastic.index}/_count`);
      pass('elasticsearch', `${info.distribution} ${info.version} at ${config.elastic.url}, index "${config.elastic.index}" holds ${count.count} products`);
      if (mongoOk) {
        const active = await mongoose.connection.collection('products').countDocuments({ status: 'active' });
        if (active > 0 && count.count === 0) warn('search index', `the index is empty but MongoDB has ${active} products. Run \`npm run reindex\`.`);
      }
    } catch (err) {
      fail('elasticsearch', `${err.message}. Check ELASTICSEARCH_URL and the API key or password (SETUP_GUIDE.md step B4).`);
    }
  }

  // S3
  if (config.storageDriver === 'local') {
    warn('s3', 'not configured: images are stored on local disk (server/storage). See SETUP_GUIDE.md step B5.');
  } else {
    const { putBuffer, remove, urlFor } = await import('./services/storage.js');
    const key = `healthchecks/doctor-${Date.now()}.txt`;
    try {
      await putBuffer(Buffer.from('awning'), key);
      pass('s3 write', `wrote an object to bucket ${config.aws.bucket}`);
      try {
        const res = await fetch(urlFor(key));
        res.ok ? pass('s3 read', `${urlFor(key).split('/healthchecks')[0]} serves images publicly`) : fail('s3 read', `${urlFor(key)} answered HTTP ${res.status}. Shoppers cannot see images. Add the public-read bucket policy (SETUP_GUIDE.md step B5.2).`);
      } catch (err) {
        fail('s3 read', `could not fetch ${urlFor(key)}: ${err.message}`);
      }
      await remove(key).catch(() => {});
    } catch (err) {
      fail('s3 write', `could not write to bucket ${config.aws.bucket}: ${err.name} ${err.message}. Check keys, region and the IAM policy (SETUP_GUIDE.md step B5.3).`);
    }
  }

  // Payments
  if (config.paymentProvider === 'test') {
    warn('payments', 'built-in test gateway (card 4242 4242 4242 4242). Configure Stripe Connect or Razorpay Route for real test-mode payments (SETUP_GUIDE.md step B6).');
  } else if (config.paymentProvider === 'stripe') {
    try {
      const { default: Stripe } = await import('stripe');
      const api = new Stripe(config.stripeSecretKey);
      await api.balance.retrieve();
      pass('stripe', `key accepted (${config.stripeSecretKey.startsWith('sk_test_') ? 'test mode' : 'LIVE mode: real money will move'})`);
      try {
        await api.accounts.list({ limit: 1 });
        pass('stripe connect', 'Connect is enabled on this account');
      } catch (err) {
        fail('stripe connect', `Connect is not enabled: ${err.message}. Turn it on in the Stripe dashboard (SETUP_GUIDE.md step B6, option A).`);
      }
      config.stripeWebhookSecret ? pass('stripe webhook', 'STRIPE_WEBHOOK_SECRET is set') : warn('stripe webhook', 'STRIPE_WEBHOOK_SECRET not set. Payments still confirm when the buyer returns; add the webhook for reliability.');
    } catch (err) {
      fail('stripe', `Stripe rejected STRIPE_SECRET_KEY: ${err.message}`);
    }
  } else {
    try {
      const { ping } = await import('./services/payments/razorpay.js');
      await ping();
      pass('razorpay', `keys accepted (${config.razorpay.keyId.startsWith('rzp_test_') ? 'test mode' : 'LIVE mode: real money will move'})`);
      config.currency === 'inr' ? pass('currency', 'CURRENCY=inr') : warn('currency', `CURRENCY=${config.currency}. Razorpay accounts normally charge in INR; set CURRENCY=inr unless international payments are enabled.`);
      config.razorpay.webhookSecret ? pass('razorpay hook', 'RAZORPAY_WEBHOOK_SECRET is set') : warn('razorpay hook', 'RAZORPAY_WEBHOOK_SECRET not set. Payments still confirm in the browser; add the webhook for reliability.');
    } catch (err) {
      fail('razorpay', `${err.message}. Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.`);
    }
  }

  // URLs
  if (config.isProd && /localhost|127\.0\.0\.1/.test(`${config.clientUrls.join()}${config.publicUrl}`)) fail('urls', 'CLIENT_URL / PUBLIC_URL still point at localhost in production');
  else pass('urls', `CLIENT_URL=${config.clientUrls.join(',')}  PUBLIC_URL=${config.publicUrl}`);

  await mongoose.disconnect().catch(() => {});
  console.log('\nAwning doctor\n-------------');
  console.log(lines.join('\n'));
  console.log(failed ? '\nResult: FIX THE FAIL LINES ABOVE.\n' : '\nResult: OK. WARN lines are local fallbacks; they are fine for development.\n');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
