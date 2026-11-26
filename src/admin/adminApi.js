// Data for the Forkfly admin dashboard: every page talks to the server through `adminApi`.
// The server side is server/admin.js (/api/admin/...).

import { request } from '../api.js';

export const RANGES = [
  ['today', 'Today'],
  ['7d', '7 days'],
  ['30d', '30 days'],
];

const id = (v) => encodeURIComponent(v);
const post = (path, body) => request(path, { method: 'POST', body });

export const adminApi = {
  // Waiting applications, for the badges in the sidebar.
  counts: () => request('/admin/counts'),
  // Headline numbers, the chart, the live queue and what needs attention.
  overview: (range = 'today') => request(`/admin/overview?range=${id(range)}`),
  analytics: (range = '30d') => request(`/admin/analytics?range=${id(range)}`),

  orders: ({ status = 'all', q = '' } = {}) => request(`/admin/orders?status=${id(status)}&q=${id(q)}`),
  cancelOrder: (orderId) => post(`/admin/orders/${id(orderId)}/cancel`),

  restaurants: () => request('/admin/restaurants'),
  restaurant: (rid) => request(`/admin/restaurants/${id(rid)}`),
  setRestaurantStatus: (rid, status, note = '') => post(`/admin/restaurants/${id(rid)}/status`, { status, note }),
  setCommission: (rid, commission) => post(`/admin/restaurants/${id(rid)}/commission`, { commission }),

  riders: () => request('/admin/riders'),
  setRiderStatus: (riderId, status, note = '') => post(`/admin/riders/${id(riderId)}/status`, { status, note }),

  customers: () => request('/admin/customers'),
  // Returns the updated customer.
  setCustomerStatus: (customerId, status) => post(`/admin/customers/${id(customerId)}/status`, { status }),

  settings: () => request('/admin/settings'),
  saveSettings: (next) => {
    const { admins: _admins, ...body } = next;
    return request('/admin/settings', { method: 'PUT', body });
  },
  // Both return the admin team.
  addAdmin: (email) => post('/admin/admins', { email }),
  removeAdmin: (userId) => request(`/admin/admins/${id(userId)}`, { method: 'DELETE' }),
};
