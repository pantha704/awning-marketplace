import { kv, keys } from './kv.js';
import { MAX_QTY } from './pricing.js';

const TTL = 60 * 60 * 24 * 30; // carts live for 30 days in Redis
const empty = () => ({ items: {}, coupon: null });

export async function readCart(cartId) {
  if (!cartId) return empty();
  return (await kv.get(keys.cart(cartId))) || empty();
}
export async function writeCart(cartId, cart) {
  for (const [pid, qty] of Object.entries(cart.items)) {
    if (!(qty > 0)) delete cart.items[pid];
    else cart.items[pid] = Math.min(MAX_QTY, Math.floor(qty));
  }
  await kv.set(keys.cart(cartId), cart, TTL);
  return cart;
}
export const clearCart = (cartId) => kv.del(keys.cart(cartId));

/** Called at sign-in: fold the guest cart into the account's cart. */
export async function mergeCarts(guestId, userId) {
  if (!guestId || guestId === userId) return;
  const guest = await readCart(guestId);
  if (!Object.keys(guest.items).length) return;
  const mine = await readCart(userId);
  for (const [pid, qty] of Object.entries(guest.items)) mine.items[pid] = Math.min(MAX_QTY, (mine.items[pid] || 0) + qty);
  mine.coupon = mine.coupon || guest.coupon;
  await writeCart(userId, mine);
  await clearCart(guestId);
}
