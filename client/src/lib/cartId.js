/** A random id that names this browser's guest cart in Redis. It is merged into the account's cart at sign-in. */
const KEY = 'awning.cart';

export function cartId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id || !/^[A-Za-z0-9_-]{10,40}$/.test(id)) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'private-mode-cart-0000';
  }
}
