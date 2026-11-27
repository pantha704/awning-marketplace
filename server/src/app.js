import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import multer from 'multer';
import { config, REPO_ROOT } from './config.js';
import { HttpError } from './utils/http.js';
import { log } from './utils/log.js';
import { mediaRoot, contentTypeFor } from './services/storage.js';
import { dbInfo } from './db.js';
import { kvInfo } from './services/kv.js';
import { searchInfo } from './services/search/index.js';
import { provider } from './services/payments/index.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import cartRoutes from './routes/cart.js';
import orderRoutes from './routes/orders.js';
import paymentRoutes, { stripeWebhook, razorpayWebhook } from './routes/payments.js';
import vendorRoutes from './routes/vendor.js';
import adminRoutes from './routes/admin.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // The API and the web app are deployed separately, so the API only needs a strict policy for itself.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || config.clientUrls.includes(origin) || origin === config.publicUrl),
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Cart-Id'],
    maxAge: 600,
  }));
  if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev', { skip: (req) => req.url.startsWith('/media/') }));

  // Payment webhooks need the raw request body, so they are mounted before express.json().
  app.post('/api/payments/webhook/stripe', ...stripeWebhook);
  app.post('/api/payments/webhook/razorpay', ...razorpayWebhook);
  app.use(express.json({ limit: '1mb' }));

  // Locally stored images. With the s3 driver the browser loads images from S3 directly.
  app.use('/media', express.static(mediaRoot, {
    maxAge: '365d', immutable: true, index: false,
    setHeaders: (res, file) => {
      res.setHeader('Content-Type', contentTypeFor(file));
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    },
  }));

  app.get('/api/health', (_req, res) => res.json({
    ok: dbInfo.mode !== 'none', env: config.nodeEnv, database: dbInfo.mode, cache: kvInfo.driver, search: searchInfo.driver,
    storage: config.storageDriver, payments: provider(), currency: config.currency, time: new Date().toISOString(),
  }));

  app.use('/api/auth', authRoutes);
  app.use('/api/catalog', catalogRoutes);
  app.use('/api/cart', cartRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/vendor', vendorRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'This API route does not exist.')));

  // Convenience for local use: `npm run build && npm start` serves the web app from the API as well.
  const dist = path.join(REPO_ROOT, 'client', 'dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/(api|media)\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    app.get('/', (_req, res) => res.json({ name: 'Awning API', health: '/api/health', app: config.clientUrl }));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? `That image is too large. The limit is ${config.maxImageMb} MB.` : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? 'Upload up to 6 images at a time.' : err.message;
      return res.status(400).json({ error: message });
    }
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    if (err?.name === 'ValidationError') return res.status(400).json({ error: Object.values(err.errors)[0]?.message || 'Invalid data.' });
    if (err?.name === 'CastError') return res.status(404).json({ error: 'Not found.' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON.' });
    log.error(err);
    res.status(500).json({ error: 'Something went wrong on the server. Try again.' });
  });

  return app;
}
