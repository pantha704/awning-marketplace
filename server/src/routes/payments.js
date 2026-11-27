import { Router } from 'express';
import express from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Order } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { markPaid, releaseOrder } from '../services/orders.js';
import { provider, TEST_CARDS } from '../services/payments/index.js';
import * as stripeDriver from '../services/payments/stripe.js';
import * as razorpayDriver from '../services/payments/razorpay.js';
import { wrap, validate, badRequest, notFound, forbidden } from '../utils/http.js';
import { config } from '../config.js';
import { log } from '../utils/log.js';

const router = Router();
const isId = (v) => mongoose.isValidObjectId(v);

router.get('/config', (_req, res) => res.json({
  provider: provider(), currency: config.currency, commissionPercent: config.commissionPercent,
  shipping: { flat: config.shippingFlat, freeOver: config.freeShippingOver },
}));

async function mine(req, orderId) {
  if (!isId(orderId)) throw notFound('Order not found.');
  const order = await Order.findById(orderId);
  if (!order) throw notFound('Order not found.');
  if (String(order.customer) !== req.user.id) throw forbidden();
  return order;
}

/* ---------- Built-in test gateway ---------- */
const cardSchema = z.object({ cardNumber: z.string().transform((s) => s.replace(/\D/g, '')), expiry: z.string().trim(), cvc: z.string().trim(), name: z.string().trim().min(1, 'Enter the name on the card.') });

router.post('/test/:orderId/pay', requireAuth, validate(cardSchema), wrap(async (req, res) => {
  if (provider() !== 'test') throw badRequest('The test gateway is off because a payment provider is configured.');
  const order = await mine(req, req.params.orderId);
  if (order.payment.status === 'paid') return res.json({ status: 'paid', orderId: String(order._id) });
  if (order.payment.status !== 'pending') throw badRequest('This order expired because it was not paid in time. Start checkout again.');
  const { cardNumber, expiry, cvc } = req.body;
  const m = expiry.match(/^(\d{2})\s*\/\s*(\d{2})$/);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) throw badRequest('Enter the expiry date as MM/YY.');
  if (new Date(2000 + Number(m[2]), Number(m[1]), 1) <= new Date()) throw badRequest('This card has expired. Use any future date.');
  if (!/^\d{3,4}$/.test(cvc)) throw badRequest('Enter the 3-digit security code.');
  const card = TEST_CARDS[cardNumber];
  if (!card) throw badRequest('This is test mode. Use the test card 4242 4242 4242 4242.');
  if (!card.ok) return res.status(402).json({ error: card.message }); // the order stays open so the buyer can try another card
  await markPaid(order._id, { chargeRef: `test_ch_${order._id}` });
  res.json({ status: 'paid', orderId: String(order._id) });
}));

/** The buyer backed out at the payment step: free the reserved stock straight away. */
router.post('/cancel/:orderId', requireAuth, wrap(async (req, res) => {
  const order = await mine(req, req.params.orderId);
  if (order.payment.status === 'pending') await releaseOrder(order._id, 'failed');
  res.json({ ok: true });
}));

/* ---------- Stripe ---------- */
router.get('/stripe/verify', requireAuth, wrap(async (req, res) => {
  if (!config.stripeSecretKey) throw badRequest('Stripe is not configured.');
  const sessionId = String(req.query.session_id || '');
  if (!sessionId) throw badRequest('Missing session_id.');
  const info = await stripeDriver.inspectSession(sessionId);
  const order = await mine(req, info.orderId);
  if (info.paid) await markPaid(order._id, { chargeRef: info.chargeRef });
  res.json({ paid: info.paid, orderId: String(order._id) });
}));

export const stripeWebhook = [
  express.raw({ type: 'application/json' }),
  wrap(async (req, res) => {
    const api = await stripeDriver.stripe();
    if (!api) return res.status(400).json({ error: 'Stripe is not configured.' });
    let event;
    try {
      event = config.stripeWebhookSecret ? api.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.stripeWebhookSecret) : JSON.parse(req.body.toString());
    } catch (err) {
      log.warn('Stripe webhook signature check failed:', err.message);
      return res.status(400).json({ error: 'Invalid signature.' });
    }
    const session = event.data?.object;
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const info = await stripeDriver.inspectSession(session.id);
      if (info.paid && isId(info.orderId)) await markPaid(info.orderId, { chargeRef: info.chargeRef });
    } else if (event.type === 'checkout.session.expired') {
      const orderId = session.metadata?.orderId;
      if (isId(orderId)) await releaseOrder(orderId, 'expired');
    }
    res.json({ received: true });
  }),
];

/* ---------- Razorpay ---------- */
const rzpSchema = z.object({ orderId: z.string(), razorpay_order_id: z.string(), razorpay_payment_id: z.string(), razorpay_signature: z.string() });

router.post('/razorpay/verify', requireAuth, validate(rzpSchema), wrap(async (req, res) => {
  const order = await mine(req, req.body.orderId);
  if (order.payment.ref !== req.body.razorpay_order_id) throw badRequest('This payment belongs to a different order.');
  const valid = razorpayDriver.verifyCheckoutSignature({ razorpayOrderId: req.body.razorpay_order_id, razorpayPaymentId: req.body.razorpay_payment_id, signature: req.body.razorpay_signature });
  if (!valid) throw badRequest('The payment signature is not valid.');
  await markPaid(order._id, { chargeRef: req.body.razorpay_payment_id });
  res.json({ paid: true, orderId: String(order._id) });
}));

export const razorpayWebhook = [
  express.raw({ type: 'application/json' }),
  wrap(async (req, res) => {
    if (!razorpayDriver.verifyWebhookSignature(req.body.toString(), req.headers['x-razorpay-signature'])) return res.status(400).json({ error: 'Invalid signature.' });
    const event = JSON.parse(req.body.toString());
    const payment = event.payload?.payment?.entity;
    if ((event.event === 'payment.captured' || event.event === 'order.paid') && payment?.order_id) {
      const order = await Order.findOne({ 'payment.ref': payment.order_id }).select('_id');
      if (order) await markPaid(order._id, { chargeRef: payment.id });
    }
    res.json({ received: true });
  }),
];

export default router;
