/** The cart lives in Redis. Signed-in users are keyed by account; guests by a random id their browser keeps. */
import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Product } from '../models/index.js';
import { authOptional } from '../middleware/auth.js';
import { readCart, writeCart } from '../services/cart.js';
import { priceCart, MAX_QTY } from '../services/pricing.js';
import { wrap, validate, badRequest, notFound } from '../utils/http.js';

const router = Router();
router.use(authOptional);

export function cartIdFor(req) {
  if (req.user) return req.user.id;
  const id = req.headers['x-cart-id'];
  return typeof id === 'string' && /^[A-Za-z0-9_-]{10,40}$/.test(id) ? `g_${id}` : null;
}
const needCart = (req) => {
  const id = cartIdFor(req);
  if (!id) throw badRequest('Missing cart id.');
  return id;
};
const send = async (req, res, cart) => res.json({ cart: await priceCart(cart, { userId: req.user?.id }) });

router.get('/', wrap(async (req, res) => send(req, res, await readCart(cartIdFor(req)))));

router.post('/items', validate(z.object({ productId: z.string(), qty: z.number().int().min(1).max(MAX_QTY).default(1) })), wrap(async (req, res) => {
  const cartId = needCart(req);
  const { productId, qty } = req.body;
  if (!mongoose.isValidObjectId(productId)) throw notFound('Product not found.');
  const product = await Product.findById(productId).select('status stock title').lean();
  if (!product || product.status !== 'active') throw notFound('This product is no longer available.');
  if (product.stock <= 0) throw badRequest(`“${product.title}” is out of stock.`);
  const cart = await readCart(cartId);
  cart.items[productId] = Math.min((cart.items[productId] || 0) + qty, product.stock, MAX_QTY);
  await send(req, res, await writeCart(cartId, cart));
}));

router.patch('/items/:productId', validate(z.object({ qty: z.number().int().min(0).max(MAX_QTY) })), wrap(async (req, res) => {
  const cartId = needCart(req);
  const cart = await readCart(cartId);
  cart.items[req.params.productId] = req.body.qty;
  await send(req, res, await writeCart(cartId, cart));
}));

router.delete('/items/:productId', wrap(async (req, res) => {
  const cartId = needCart(req);
  const cart = await readCart(cartId);
  delete cart.items[req.params.productId];
  await send(req, res, await writeCart(cartId, cart));
}));

router.put('/coupon', validate(z.object({ code: z.string().trim().min(1, 'Enter a code.').max(24) })), wrap(async (req, res) => {
  const cartId = needCart(req);
  const cart = await readCart(cartId);
  cart.coupon = req.body.code.toUpperCase();
  const priced = await priceCart(cart, { userId: req.user?.id });
  if (priced.couponError) {
    // An invalid code is not kept on the cart; the message says why.
    return res.status(400).json({ error: priced.couponError });
  }
  await writeCart(cartId, cart);
  res.json({ cart: priced });
}));

router.delete('/coupon', wrap(async (req, res) => {
  const cartId = needCart(req);
  const cart = await readCart(cartId);
  cart.coupon = null;
  await send(req, res, await writeCart(cartId, cart));
}));

export default router;
