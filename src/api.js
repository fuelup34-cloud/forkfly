import { createAuthClient } from 'better-auth/client';
import { emailOTPClient } from 'better-auth/client/plugins';

// Sign-up, sign-in and sign-out, plus emailed 6-digit codes (confirming an email, resetting a password).
// The session is a cookie, so every request below carries it.
export const authClient = createAuthClient({ baseURL: location.origin, basePath: '/api/auth', plugins: [emailOTPClient()] });

export async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong. Please try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}

// Restaurant lists rarely change, so remember them for instant back/forward navigation.
const cache = new Map();
function cached(key, fetcher) {
  if (!cache.has(key)) cache.set(key, fetcher().catch((err) => (cache.delete(key), Promise.reject(err))));
  return cache.get(key);
}

export const api = {
  me: () => request('/me'),
  applyRestaurant: (body) => request('/apply/restaurant', { method: 'POST', body }),
  applyRider: (body) => request('/apply/rider', { method: 'POST', body }),
  restaurants: (addressId) => cached(`list:${addressId}`, () => request(`/restaurants?address=${addressId}`)),
  restaurant: (id, addressId) => cached(`r:${id}:${addressId}`, () => request(`/restaurants/${encodeURIComponent(id)}?address=${addressId}`)),
  placeOrder: (body) => request('/orders', { method: 'POST', body }),
  // Paid checkout: start a card payment for the order, then turn the paid payment into the order.
  startCheckout: (body) => request('/checkout', { method: 'POST', body }),
  completeCheckout: (checkoutId) => request('/checkout/complete', { method: 'POST', body: { checkoutId } }),
  orders: () => request('/orders'),
  order: (id) => request(`/orders/${encodeURIComponent(id)}`),
  useGps: (id) => request(`/orders/${encodeURIComponent(id)}/gps`, { method: 'POST' }),
  cancel: (id) => request(`/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
};

// The restaurant dashboard.
const dashPath = (rid, rest = '') => `/dash/${encodeURIComponent(rid)}${rest}`;
export const dash = {
  restaurant: (rid) => request(dashPath(rid)),
  update: (rid, body) => request(dashPath(rid), { method: 'PATCH', body }),
  setOpen: (rid, open) => request(dashPath(rid, '/status'), { method: 'POST', body: { open } }),
  menu: (rid) => request(dashPath(rid, '/menu')),
  addItem: (rid, body) => request(dashPath(rid, '/menu'), { method: 'POST', body }),
  updateItem: (rid, id, body) => request(dashPath(rid, `/menu/${encodeURIComponent(id)}`), { method: 'PATCH', body }),
  deleteItem: (rid, id) => request(dashPath(rid, `/menu/${encodeURIComponent(id)}`), { method: 'DELETE' }),
  orders: (rid) => request(dashPath(rid, '/orders')),
  orderAction: (rid, id, action, body = {}) => request(dashPath(rid, `/orders/${encodeURIComponent(id)}/${action}`), { method: 'POST', body }),
  today: (rid) => request(dashPath(rid, '/today')),
  staff: (rid) => request(dashPath(rid, '/staff')),
  addStaff: (rid, body) => request(dashPath(rid, '/staff'), { method: 'POST', body }),
  removeStaff: (rid, userId) => request(dashPath(rid, `/staff/${encodeURIComponent(userId)}`), { method: 'DELETE' }),
};

// Restaurant lists are cached for quick back/forward; a dashboard change should show right away.
export function forgetRestaurantCache() {
  cache.clear();
}

// Where someone's work lives: admins → the admin dashboard, restaurant teams → their dashboard.
// null for customers and riders, who stay on the storefront.
export function homeFor(me) {
  if (me?.user?.role === 'admin') return '/admin';
  const restaurants = me?.restaurants ?? [];
  if (restaurants.length === 1) return `/dashboard/${restaurants[0].id}`;
  if (restaurants.length > 1) return '/dashboard';
  return null;
}

// Where to send someone after they sign in. Only paths on this site, never another website.
export function signInLink(next = location.pathname) {
  return `/signin?next=${encodeURIComponent(next)}`;
}
export function safeNext(raw) {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/';
}
