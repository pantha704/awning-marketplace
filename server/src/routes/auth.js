import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { User } from '../models/index.js';
import { requireAuth, signToken, sessionFor, dropSession } from '../middleware/auth.js';
import { mergeCarts } from '../services/cart.js';
import { wrap, validate, validatePatch, badRequest, unauthorized, notFound } from '../utils/http.js';
import { config } from '../config.js';

const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.isTest ? 100000 : 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Wait a few minutes and try again.' } });
const guestCart = (req) => { const id = req.headers['x-cart-id']; return typeof id === 'string' && /^[A-Za-z0-9_-]{10,40}$/.test(id) ? `g_${id}` : null; };

async function respond(res, user, status = 200) {
  await dropSession(user._id);
  res.status(status).json({ token: signToken(user), user: await sessionFor(String(user._id)) });
}

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
  role: z.enum(['customer', 'vendor']).default('customer'),
});
router.post('/register', limiter, validate(registerSchema), wrap(async (req, res) => {
  const { name, email, password, role } = req.body;
  if (await User.exists({ email })) throw badRequest('An account with this email already exists. Sign in instead.');
  const user = new User({ name, email, role });
  await user.setPassword(password);
  await user.save();
  await mergeCarts(guestCart(req), String(user._id));
  await respond(res, user, 201);
}));

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address.'), password: z.string().min(1, 'Enter your password.') });
router.post('/login', limiter, validate(loginSchema), wrap(async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+passwordHash');
  if (!user || !(await user.checkPassword(req.body.password))) throw unauthorized('Email or password is incorrect.');
  if (user.disabled) throw unauthorized('This account has been disabled. Contact the marketplace team.');
  await mergeCarts(guestCart(req), String(user._id));
  await respond(res, user);
}));

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

router.patch('/me', requireAuth, validate(z.object({ name: z.string().trim().min(2).max(80) })), wrap(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.user.id, { name: req.body.name }, { returnDocument: 'after' });
  await dropSession(user._id);
  res.json({ user: await sessionFor(req.user.id) });
}));

router.post('/password', requireAuth, validate(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8, 'Use at least 8 characters.').max(200) })), wrap(async (req, res) => {
  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!(await user.checkPassword(req.body.currentPassword))) throw badRequest('Your current password is incorrect.');
  await user.setPassword(req.body.newPassword);
  await user.save();
  res.json({ ok: true });
}));

/* ---------- Address book ---------- */
export const addressSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the recipient’s name.').max(80),
  line1: z.string().trim().min(3, 'Enter the street address.').max(120),
  line2: z.string().trim().max(120).optional().default(''),
  city: z.string().trim().min(2, 'Enter the city.').max(80),
  state: z.string().trim().max(80).optional().default(''),
  postalCode: z.string().trim().min(3, 'Enter the postal code.').max(20),
  country: z.string().trim().min(2, 'Enter the country.').max(60),
  phone: z.string().trim().max(30).optional().default(''),
});
const addressView = (a) => ({ id: String(a._id), fullName: a.fullName, line1: a.line1, line2: a.line2, city: a.city, state: a.state, postalCode: a.postalCode, country: a.country, phone: a.phone, isDefault: a.isDefault });

router.get('/addresses', requireAuth, wrap(async (req, res) => {
  const user = await User.findById(req.user.id).select('addresses');
  res.json({ items: user.addresses.map(addressView) });
}));
router.post('/addresses', requireAuth, validate(addressSchema.extend({ isDefault: z.boolean().optional() })), wrap(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (user.addresses.length >= 10) throw badRequest('You can save up to 10 addresses.');
  const makeDefault = req.body.isDefault || user.addresses.length === 0;
  if (makeDefault) user.addresses.forEach((a) => { a.isDefault = false; });
  user.addresses.push({ ...req.body, isDefault: makeDefault });
  await user.save();
  res.status(201).json({ items: user.addresses.map(addressView), created: addressView(user.addresses.at(-1)) });
}));
router.patch('/addresses/:id', requireAuth, validatePatch(addressSchema.extend({ isDefault: z.boolean().optional() })), wrap(async (req, res) => {
  const user = await User.findById(req.user.id);
  const address = user.addresses.id(req.params.id);
  if (!address) throw notFound('Address not found.');
  if (req.body.isDefault) user.addresses.forEach((a) => { a.isDefault = false; });
  Object.assign(address, req.body);
  await user.save();
  res.json({ items: user.addresses.map(addressView) });
}));
router.delete('/addresses/:id', requireAuth, wrap(async (req, res) => {
  const user = await User.findById(req.user.id);
  const address = user.addresses.id(req.params.id);
  if (!address) throw notFound('Address not found.');
  const wasDefault = address.isDefault;
  address.deleteOne();
  if (wasDefault && user.addresses[0]) user.addresses[0].isDefault = true;
  await user.save();
  res.json({ items: user.addresses.map(addressView) });
}));

export default router;
