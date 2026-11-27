import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Order, User } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { addressSchema } from './auth.js';
import { readCart } from '../services/cart.js';
import { priceCart } from '../services/pricing.js';
import { createOrder, cancelParcel, releaseOrder, sweepExpired } from '../services/orders.js';
import { startPayment, provider } from '../services/payments/index.js';
import { writeInvoicePdf } from '../services/invoicePdf.js';
import { wrap, validate, badRequest, notFound, forbidden } from '../utils/http.js';
import { orderView } from '../utils/serialize.js';

const router = Router();
router.use(requireAuth);
const isId = (v) => mongoose.isValidObjectId(v);
const populate = [{ path: 'vendorOrders.vendor', select: 'name slug color' }];

async function loadMine(req) {
  if (!isId(req.params.id)) throw notFound('Order not found.');
  const order = await Order.findById(req.params.id).populate(populate);
  if (!order) throw notFound('Order not found.');
  if (String(order.customer) !== req.user.id && req.user.role !== 'admin') throw forbidden();
  return order;
}

const checkoutSchema = z.object({
  addressId: z.string().optional(),
  address: addressSchema.optional(),
  saveAddress: z.boolean().optional(),
}).refine((b) => b.addressId || b.address, { message: 'Choose or enter a delivery address.' });

/** Price the cart again on the server, reserve stock, create the order and start payment. */
router.post('/checkout', validate(checkoutSchema), wrap(async (req, res) => {
  if (req.user.role === 'admin') throw badRequest('Admin accounts cannot place orders. Use a customer account.');
  await sweepExpired();
  const user = await User.findById(req.user.id);
  let address = req.body.address;
  if (req.body.addressId) {
    const saved = user.addresses.id(req.body.addressId);
    if (!saved) throw badRequest('That address is no longer saved. Choose another.');
    address = saved.toObject();
  } else if (req.body.saveAddress) {
    user.addresses.push({ ...address, isDefault: user.addresses.length === 0 });
    await user.save();
  }
  const priced = await priceCart(await readCart(req.user.id), { userId: req.user.id });
  if (req.user.vendorId && priced.groups.some((g) => g.vendor.id === req.user.vendorId)) throw badRequest('You cannot buy from your own shop. Remove those items to continue.');
  const order = await createOrder({ user: req.user, priced, address, provider: provider() });
  try {
    const payment = await startPayment(order, req.user);
    res.status(201).json({ order: { id: String(order._id), number: order.number, total: order.total, currency: order.currency }, payment });
  } catch (err) {
    await releaseOrder(order._id, 'failed');
    throw badRequest(`The payment could not be started: ${err.message}`);
  }
}));

router.get('/', wrap(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 10;
  const filter = { customer: req.user.id, 'payment.status': { $in: ['paid', 'pending'] } };
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate(populate),
    Order.countDocuments(filter),
  ]);
  res.json({ items: orders.map((o) => orderView(o)), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}));

router.get('/:id', wrap(async (req, res) => res.json({ order: orderView(await loadMine(req)) })));

/** Resume payment for an order that was created but not paid. */
router.post('/:id/pay', wrap(async (req, res) => {
  const order = await loadMine(req);
  if (order.payment.status === 'paid') return res.json({ paid: true });
  if (order.payment.status !== 'pending') throw badRequest('This order expired because it was not paid in time. Add the items to your cart again.');
  res.json({ order: { id: String(order._id), number: order.number, total: order.total, currency: order.currency }, payment: await startPayment(order, req.user) });
}));

router.post('/:id/parcels/:parcelId/cancel', wrap(async (req, res) => {
  const order = await loadMine(req);
  await cancelParcel(order, { parcelId: req.params.parcelId, by: 'customer' });
  res.json({ order: orderView(await Order.findById(order._id).populate(populate)) });
}));

router.get('/:id/invoice', wrap(async (req, res) => {
  const order = await loadMine(req);
  if (order.payment.status !== 'paid') throw badRequest('An invoice is available once the order is paid.');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="awning-invoice-${order.number}.pdf"`);
  writeInvoicePdf(order, res);
}));

export default router;
