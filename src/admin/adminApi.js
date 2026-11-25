// Data for the Forkfly admin dashboard.
//
// UI FIRST: every page talks to `adminApi` below, which for now answers from sample data
// generated in the browser (the same every load, so screens are stable). When the server
// endpoints exist, replace each function's body with a request to /api/admin/... — the
// shapes returned here are the contract the pages expect.

import { FEES, VEHICLES } from '../../shared/core.js';

// ---------- Deterministic sample data ----------

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261125);
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const DAY = 86_400_000;
const NOW = Date.now();
const startOfDay = (ms) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const FIRST = ['Ava', 'Noah', 'Mia', 'Liam', 'Zoe', 'Ethan', 'Isla', 'Omar', 'Chloe', 'Ravi', 'Nora', 'Leo', 'Hana', 'Sam', 'Ivy', 'Kofi', 'Grace', 'Mateo', 'Yuki', 'Ben', 'Sara', 'Felix', 'Amara', 'Jonah', 'Elena', 'Tariq', 'Ruby', 'Caleb', 'Mei', 'Hugo'];
const LAST = ['Patel', 'Nguyen', 'Garcia', 'Smith', 'Okafor', 'Kim', 'Rossi', 'Cohen', 'Silva', 'Haddad', 'Moreau', 'Brown', 'Tanaka', 'Mensah', 'Lopez', 'Novak'];
const person = () => `${pick(FIRST)} ${pick(LAST)}`;
const emailFor = (name, i) => `${name.toLowerCase().replace(/[^a-z]+/g, '.')}${i}@example.com`;

// The demo restaurants (server/restaurants.js), plus Mama's Kitchen from the test accounts,
// plus a few applications so every status shows up.
const RESTAURANT_SEED = [
  ['ember-oak', 'Ember & Oak', 'BBQ', ['#f97316', '#b45309'], 'active', true],
  ['pho-corner', 'Pho Corner', 'Vietnamese', ['#ef4444', '#991b1b'], 'active', true],
  ['slice-theory', 'Slice Theory', 'Pizza', ['#eab308', '#c2410c'], 'active', true],
  ['green-bowl', 'Green Bowl Co.', 'Healthy', ['#22c55e', '#15803d'], 'active', true],
  ['taco-loco', 'Tres Tacos', 'Mexican', ['#f43f5e', '#7c2d12'], 'paused', true],
  ['kumo-sushi', 'Kumo Sushi', 'Japanese', ['#0ea5e9', '#1e3a8a'], 'active', true],
  ['morning-crumb', 'Morning Crumb', 'Bakery', ['#f59e0b', '#92400e'], 'active', true],
  ['spice-route', 'Spice Route', 'Indian', ['#d97706', '#7f1d1d'], 'active', true],
  ['patty-lab', 'Patty Lab', 'Burgers', ['#a855f7', '#4c1d95'], 'active', true],
  ['mama-s-kitchen', "Mama's Kitchen", 'Home cooking', ['#14b8a6', '#115e59'], 'active', false],
  ['noodle-nest', 'Noodle Nest', 'Chinese', ['#fb7185', '#9f1239'], 'pending', false],
  ['casa-verde', 'Casa Verde', 'Mexican', ['#84cc16', '#3f6212'], 'pending', false],
  ['the-daily-grind', 'The Daily Grind', 'Café', ['#a16207', '#422006'], 'pending', false],
  ['wing-it', 'Wing It', 'Wings', ['#ef4444', '#7f1d1d'], 'suspended', false],
];

const restaurants = RESTAURANT_SEED.map(([id, name, cuisine, colors, status, isOwn], i) => {
  const owner = isOwn ? 'Forkfly' : person();
  return {
    id,
    name,
    cuisine,
    colors,
    coverImage: null,
    status,
    isOwn,
    owner: { name: owner, email: isOwn ? 'ops@forkfly.example' : emailFor(owner, i) },
    phone: `(555) 01${String(10 + i).padStart(2, '0')}-${between(1000, 9999)}`,
    commission: isOwn ? 0 : 0.15,
    rating: status === 'pending' ? 0 : Math.round((3.9 + rand() * 1) * 10) / 10,
    reviews: status === 'pending' ? 0 : between(40, 900),
    prepMin: pick([10, 12, 15, 18, 20]),
    menuItems: between(6, 28),
    joinedAt: status === 'pending' ? NOW - between(0, 5) * DAY - between(1, 20) * 3_600_000 : NOW - between(60, 600) * DAY,
    weight: status === 'active' ? 0.5 + rand() : status === 'paused' ? 0.3 : 0,
    note: status === 'suspended' ? 'Repeated late orders and two food-safety complaints.' : '',
  };
});

const COURIER_NAMES = ['Priya S.', 'Marcus T.', 'Lena K.', 'Diego R.', 'Ama O.', 'Theo B.'];
const riders = [...COURIER_NAMES.map((n) => n.replace('.', '')), ...Array.from({ length: 12 }, person)].map((name, i) => {
  const status = i < 14 ? 'approved' : i < 17 ? 'pending' : 'suspended';
  return {
    id: `rider-${i + 1}`,
    name,
    email: emailFor(name, i),
    phone: `(555) 02${String(10 + i).padStart(2, '0')}-${between(1000, 9999)}`,
    vehicle: pick(VEHICLES),
    status,
    online: status === 'approved' && rand() < 0.55,
    rating: status === 'pending' ? 0 : Math.round((4.3 + rand() * 0.7) * 10) / 10,
    onTime: status === 'pending' ? 0 : 0.82 + rand() * 0.17,
    joinedAt: status === 'pending' ? NOW - between(0, 4) * DAY - between(1, 20) * 3_600_000 : NOW - between(20, 400) * DAY,
    note: status === 'suspended' ? 'Phone GPS switched off on several deliveries.' : '',
  };
});

// A third joined in the last 60 days, so the sample has first-time customers too.
const customers = Array.from({ length: 420 }, (_, i) => {
  const name = person();
  return {
    id: `cust-${i + 1}`,
    name,
    email: emailFor(name, i),
    joinedAt: NOW - (i % 3 === 0 ? between(0, 59) * DAY + between(0, 86_399_999) : between(60, 480) * DAY),
    status: i === 7 || i === 31 || i === 212 ? 'suspended' : 'active',
  };
});

// 60 days of orders, busier at lunch, dinner and on weekends, growing slowly over time.
const HOUR_WEIGHT = [0, 0, 0, 0, 0, 0, 0.2, 0.5, 0.7, 0.5, 0.6, 1.4, 2, 1.3, 0.6, 0.5, 0.7, 1.4, 2.2, 2, 1.3, 0.8, 0.4, 0.1];
const active = restaurants.filter((r) => r.weight > 0);
const approvedRiders = riders.filter((r) => r.status === 'approved');
const orders = [];
let orderSeq = 48210;
for (let d = 59; d >= 0; d--) {
  const day = startOfDay(NOW) - d * DAY;
  const weekday = new Date(day).getDay();
  const base = 58 + (59 - d) * 0.6 + (weekday === 5 || weekday === 6 ? 22 : weekday === 0 ? 14 : 0);
  const count = Math.round(base * (0.85 + rand() * 0.3));
  for (let k = 0; k < count; k++) {
    let hour;
    do hour = between(6, 23);
    while (rand() * 2.2 > HOUR_WEIGHT[hour]);
    const placedAt = day + hour * 3_600_000 + between(0, 3_599_999);
    if (placedAt > NOW) continue;
    let r;
    do r = pick(active);
    while (rand() > r.weight / 1.5);
    const subtotal = between(900, 5200);
    const fees = between(150, 600);
    const tip = pick([0, 100, 200, 300, 500]);
    const ageMin = (NOW - placedAt) / 60_000;
    const roll = rand();
    const status = ageMin < 45 ? pick(['new', 'preparing', 'preparing', 'on-the-way', 'on-the-way']) : roll < 0.035 ? 'cancelled' : roll < 0.06 ? 'rejected' : 'delivered';
    let cust;
    do cust = pick(customers);
    while (cust.joinedAt > placedAt);
    orders.push({
      id: String(orderSeq++),
      placedAt,
      restaurantId: r.id,
      customerId: cust.id,
      riderId: status === 'cancelled' || status === 'rejected' || status === 'new' ? null : pick(approvedRiders).id,
      subtotal,
      fees,
      tip,
      total: subtotal + fees + tip,
      items: between(1, 5),
      status,
      deliveryMin: status === 'delivered' ? between(18, 52) : null,
      rejectReason: status === 'rejected' ? pick(['Too busy', 'Item sold out', 'Closing soon']) : '',
    });
  }
}
orders.sort((a, b) => b.placedAt - a.placedAt);

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
const restaurantById = byId(restaurants);
const riderById = byId(riders);
const customerById = byId(customers);

let settings = {
  fees: { ...FEES },
  commission: 0.15,
  riderPayBase: 350,
  riderPayPerMile: 75,
  maxRadiusMiles: 5,
  minOrder: 500,
  orderingOpen: true,
  autoApproveRiders: false,
  notifications: { newRestaurant: true, newRider: true, dailySummary: true, refundRequests: false },
  supportEmail: 'help@forkfly.example',
  admins: [
    { name: 'Forkfly Admin', email: 'admin@example.com', role: 'Owner' },
    { name: 'Ops Team', email: 'ops@forkfly.example', role: 'Operations' },
  ],
};

// ---------- Helpers the pages share ----------

const PAID = new Set(['delivered', 'on-the-way', 'preparing', 'new']);
const paid = (o) => PAID.has(o.status);
const commissionOf = (o) => Math.round(o.subtotal * (restaurantById[o.restaurantId]?.commission ?? 0));
// What Forkfly keeps: fees plus commission (tips go to riders).
const netOf = (o) => (paid(o) ? o.fees + commissionOf(o) : 0);

export const RANGES = [
  ['today', 'Today'],
  ['7d', '7 days'],
  ['30d', '30 days'],
];
function period(range) {
  const today = startOfDay(NOW);
  const days = range === 'today' ? 1 : range === '7d' ? 7 : 30;
  const from = today - (days - 1) * DAY;
  // "Today" is compared with yesterday up to the same time, not all of yesterday.
  const prevFrom = from - days * DAY;
  return { from, to: NOW, prevFrom, prevTo: range === 'today' ? prevFrom + (NOW - from) : from, days };
}
const inWindow = (from, to) => (o) => o.placedAt >= from && o.placedAt < to;

function summarize(list) {
  const done = list.filter(paid);
  const gmv = done.reduce((s, o) => s + o.total, 0);
  const delivered = list.filter((o) => o.status === 'delivered');
  return {
    orders: list.length,
    gmv,
    net: list.reduce((s, o) => s + netOf(o), 0),
    average: done.length ? Math.round(done.reduce((s, o) => s + o.subtotal, 0) / done.length) : 0,
    cancelRate: list.length ? list.filter((o) => o.status === 'cancelled' || o.status === 'rejected').length / list.length : 0,
    avgDelivery: delivered.length ? Math.round(delivered.reduce((s, o) => s + o.deliveryMin, 0) / delivered.length) : 0,
    customers: new Set(list.map((o) => o.customerId)).size,
  };
}

// One point per hour for "today", otherwise one per day.
function series(list, range) {
  const { from, days } = period(range);
  const step = range === 'today' ? 3_600_000 : DAY;
  const n = range === 'today' ? new Date(NOW).getHours() + 1 : days;
  const points = Array.from({ length: n }, (_, i) => ({ t: from + i * step, orders: 0, gmv: 0, net: 0 }));
  for (const o of list) {
    const p = points[Math.floor((o.placedAt - from) / step)];
    if (!p) continue;
    p.orders++;
    if (paid(o)) p.gmv += o.total;
    p.net += netOf(o);
  }
  return points;
}

function decorate(o) {
  const r = restaurantById[o.restaurantId];
  return {
    ...o,
    restaurant: { id: r.id, name: r.name, colors: r.colors },
    customer: customerById[o.customerId]?.name ?? 'Deleted account',
    rider: o.riderId ? riderById[o.riderId]?.name : null,
  };
}

function restaurantStats(r, from = NOW - 30 * DAY) {
  const list = orders.filter((o) => o.restaurantId === r.id && o.placedAt >= from);
  const s = summarize(list);
  return { ...r, orders30: s.orders, gmv30: s.gmv, cancelRate: s.cancelRate, avgDelivery: s.avgDelivery };
}

function riderStats(r) {
  const list = orders.filter((o) => o.riderId === r.id && o.placedAt >= NOW - 30 * DAY);
  return {
    ...r,
    deliveries30: list.filter((o) => o.status === 'delivered').length,
    earnings30: list.reduce((s, o) => s + settings.riderPayBase + o.tip, 0),
    onDelivery: list.some((o) => o.status === 'on-the-way'),
  };
}

const later = (value) => new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), 180));
const fail = (message) => new Promise((_, reject) => setTimeout(() => reject(new Error(message)), 180));

// ---------- The API the pages use ----------

export const adminApi = {
  // Headline numbers, the chart, the live queue and what needs attention.
  overview(range = 'today') {
    const w = period(range);
    const cur = orders.filter(inWindow(w.from, w.to));
    const prev = orders.filter(inWindow(w.prevFrom, w.prevTo));
    return later({
      range,
      stats: summarize(cur),
      previous: summarize(prev),
      series: series(cur, range),
      live: orders.filter((o) => ['new', 'preparing', 'on-the-way'].includes(o.status)).slice(0, 8).map(decorate),
      attention: {
        restaurants: restaurants.filter((r) => r.status === 'pending').map(({ id, name, cuisine, colors, joinedAt, owner }) => ({ id, name, cuisine, colors, joinedAt, owner })),
        riders: riders.filter((r) => r.status === 'pending').map(({ id, name, vehicle, joinedAt }) => ({ id, name, vehicle, joinedAt })),
        slowRestaurants: restaurants
          .filter((r) => r.status === 'active')
          .map((r) => restaurantStats(r, NOW - 7 * DAY))
          .filter((r) => r.cancelRate > 0.1)
          .map(({ id, name, colors, cancelRate }) => ({ id, name, colors, cancelRate })),
      },
      ridersOnline: riders.filter((r) => r.online).length,
      ridersApproved: approvedRiders.length,
    });
  },

  analytics(range = '30d') {
    const w = period(range);
    const cur = orders.filter(inWindow(w.from, w.to));
    const prev = orders.filter(inWindow(w.prevFrom, w.prevTo));
    const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0 }));
    const byWeekday = Array.from({ length: 7 }, (_, d) => ({ day: d, orders: 0, days: new Set() }));
    const byCuisine = {};
    const byRestaurant = {};
    for (const o of cur) {
      const d = new Date(o.placedAt);
      byHour[d.getHours()].orders++;
      byWeekday[d.getDay()].orders++;
      byWeekday[d.getDay()].days.add(startOfDay(o.placedAt));
      const r = restaurantById[o.restaurantId];
      byCuisine[r.cuisine] = (byCuisine[r.cuisine] ?? 0) + 1;
      const row = (byRestaurant[r.id] ??= { id: r.id, name: r.name, colors: r.colors, orders: 0, gmv: 0 });
      row.orders++;
      if (paid(o)) row.gmv += o.total;
    }
    const outcomes = ['delivered', 'cancelled', 'rejected'].map((s) => ({ status: s, orders: cur.filter((o) => o.status === s).length }));
    const firstOrder = {};
    for (const o of [...orders].reverse()) firstOrder[o.customerId] ??= o.placedAt;
    const custIds = new Set(cur.map((o) => o.customerId));
    const newCustomers = [...custIds].filter((id) => firstOrder[id] >= w.from).length;
    return later({
      range,
      stats: summarize(cur),
      previous: summarize(prev),
      series: series(cur, range),
      byHour,
      byWeekday: byWeekday.map(({ day, orders, days }) => ({ day, orders: days.size ? Math.round(orders / days.size) : 0 })),
      byCuisine: Object.entries(byCuisine)
        .map(([cuisine, n]) => ({ cuisine, orders: n }))
        .sort((a, b) => b.orders - a.orders),
      topRestaurants: Object.values(byRestaurant).sort((a, b) => b.gmv - a.gmv),
      outcomes,
      customers: { active: custIds.size, new: newCustomers, returning: custIds.size - newCustomers },
    });
  },

  orders({ status = 'all', q = '' } = {}) {
    const needle = q.trim().toLowerCase();
    const list = orders
      .filter((o) => status === 'all' || (status === 'live' ? ['new', 'preparing', 'on-the-way'].includes(o.status) : o.status === status))
      .map(decorate)
      .filter((o) => !needle || o.id.includes(needle) || o.restaurant.name.toLowerCase().includes(needle) || o.customer.toLowerCase().includes(needle));
    return later({ total: list.length, orders: list.slice(0, 100) });
  },

  restaurants() {
    return later(restaurants.map((r) => restaurantStats(r)));
  },
  restaurant(id) {
    const r = restaurantById[id];
    if (!r) return fail('No restaurant with that address.');
    return later({
      ...restaurantStats(r),
      series: series(
        orders.filter((o) => o.restaurantId === id && o.placedAt >= period('30d').from),
        '30d'
      ),
      recent: orders
        .filter((o) => o.restaurantId === id)
        .slice(0, 8)
        .map(decorate),
    });
  },
  setRestaurantStatus(id, status, note = '') {
    const r = restaurantById[id];
    r.status = status;
    r.note = note;
    if (status === 'active' && !r.weight) r.weight = 0.6;
    return adminApi.restaurant(id);
  },
  setCommission(id, commission) {
    restaurantById[id].commission = commission;
    return adminApi.restaurant(id);
  },

  riders() {
    return later(riders.map(riderStats));
  },
  setRiderStatus(id, status, note = '') {
    const r = riderById[id];
    r.status = status;
    r.note = note;
    if (status !== 'approved') r.online = false;
    return later(riderStats(r));
  },

  customers() {
    const counts = {};
    for (const o of orders) {
      const c = (counts[o.customerId] ??= { orders: 0, spent: 0, lastOrder: 0 });
      c.orders++;
      if (paid(o)) c.spent += o.total;
      c.lastOrder = Math.max(c.lastOrder, o.placedAt);
    }
    return later(customers.map((c) => ({ ...c, orders: 0, spent: 0, lastOrder: null, ...counts[c.id] })));
  },
  setCustomerStatus(id, status) {
    customerById[id].status = status;
    return adminApi.customers();
  },

  settings() {
    return later(settings);
  },
  saveSettings(next) {
    settings = structuredClone(next);
    return later(settings);
  },
};
