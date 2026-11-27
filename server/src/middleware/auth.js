import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User, Vendor } from '../models/index.js';
import { kv, keys } from '../services/kv.js';
import { unauthorized, forbidden } from '../utils/http.js';

const SESSION_TTL = 300; // seconds

export const signToken = (user) => jwt.sign({ sub: String(user._id || user.id), role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

/**
 * The signed-in user for a token. The profile is cached in Redis for five
 * minutes so most requests never touch MongoDB for authentication; anything
 * that changes a user or their shop calls dropSession().
 */
export async function sessionFor(userId) {
  return kv.cached(keys.session(userId), SESSION_TTL, async () => {
    const user = await User.findById(userId).lean();
    if (!user) return { missing: true };
    const vendor = user.role === 'vendor' ? await Vendor.findOne({ owner: user._id }).select('status name slug').lean() : null;
    return {
      id: String(user._id), name: user.name, email: user.email, role: user.role, disabled: !!user.disabled,
      vendorId: vendor ? String(vendor._id) : null, vendorStatus: vendor?.status || null, vendorName: vendor?.name || null, vendorSlug: vendor?.slug || null,
      createdAt: user.createdAt,
    };
  });
}
export const dropSession = (userId) => kv.del(keys.session(String(userId)));

export async function userFromToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const session = await sessionFor(payload.sub);
    return session && !session.missing && !session.disabled ? session : null;
  } catch {
    return null;
  }
}

const bearer = (req) => {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
};

/** Attach req.user when a valid token is present; never rejects. */
export async function authOptional(req, _res, next) {
  req.user = await userFromToken(bearer(req));
  next();
}
export async function requireAuth(req, _res, next) {
  req.user = await userFromToken(bearer(req));
  next(req.user ? undefined : unauthorized());
}
export const requireRole = (...roles) => [requireAuth, (req, _res, next) => next(roles.includes(req.user.role) ? undefined : forbidden())];

/** Vendor routes: the user must own a shop. `approved` additionally requires admin approval. */
export const requireVendor = ({ approved = false } = {}) => [
  ...requireRole('vendor'),
  (req, _res, next) => {
    if (!req.user.vendorId) return next(forbidden('Set up your shop first.'));
    if (approved && req.user.vendorStatus !== 'approved') return next(forbidden(req.user.vendorStatus === 'suspended' ? 'Your shop is suspended. Contact the marketplace team.' : 'Your shop is waiting for approval.'));
    next();
  },
];
