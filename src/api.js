import { load, store } from './storage.js';

// A random id for this browser, so you only ever see your own orders.
// (crypto.randomUUID needs https, so build one from getRandomValues, which works on plain http too.)
function makeId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
export const deviceId = (() => {
  let id = load('forkfly-device', null);
  if (typeof id !== 'string' || id.length < 16) {
    id = makeId();
    store('forkfly-device', id);
  }
  return id;
})();

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'X-Device-Id': deviceId, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

// Restaurant lists rarely change, so remember them for instant back/forward navigation.
const cache = new Map();
function cached(key, fetcher) {
  if (!cache.has(key)) cache.set(key, fetcher().catch((err) => (cache.delete(key), Promise.reject(err))));
  return cache.get(key);
}

export const api = {
  restaurants: (addressId) => cached(`list:${addressId}`, () => request(`/restaurants?address=${addressId}`)),
  restaurant: (id, addressId) => cached(`r:${id}:${addressId}`, () => request(`/restaurants/${encodeURIComponent(id)}?address=${addressId}`)),
  placeOrder: (body) => request('/orders', { method: 'POST', body }),
  orders: () => request('/orders'),
  order: (id) => request(`/orders/${encodeURIComponent(id)}`),
  useGps: (id) => request(`/orders/${encodeURIComponent(id)}/gps`, { method: 'POST' }),
  cancel: (id) => request(`/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
};
