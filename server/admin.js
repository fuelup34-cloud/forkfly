// The Forkfly admin API: /api/admin/... Only accounts with role 'admin' get in.
//
// Reports are worked out from the orders themselves (the same orderSnapshot the tracking
// screens use), so a number on the admin dashboard always matches what customers and kitchens
// saw. "Today" and day boundaries are in PLATFORM_TIMEZONE.
//
// Scale note: reports read up to 60 days of orders per request. That's fine for thousands of
// orders a day; past that, move the totals into a nightly rollup table.

import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db, pool, schema } from './db/index.js';
import { HttpError, cleanText, json, readBody } from './http.js';
import { adminCancel, fromRowCached, getOrder, REJECT_REASONS } from './orders.js';
import { saveSettings, settings } from './settings.js';
import { KM_PER_MILE, orderSnapshot, toRealMinutes } from '../shared/core.js';

const { user: userTable, session: sessionTable, restaurant: restaurantTable, restaurantMember, rider: riderTable, order: orderTable, menuItem } = schema;

export const PLATFORM_TIMEZONE = process.env.PLATFORM_TIMEZONE || 'America/New_York';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: PLATFORM_TIMEZONE, hour: 'numeric', hourCycle: 'h23' });
const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: PLATFORM_TIMEZONE, weekday: 'short' });
const localHour = (ms) => Number(hourFmt.format(ms)) % 24;
const localWeekday = (ms) => WEEKDAYS.indexOf(weekdayFmt.format(ms));

// ---------- Time windows ----------

// The last `n` local midnights, oldest first, as epoch ms (DST-correct, worked out by Postgres).
async function dayStarts(n) {
  const { rows } = await pool.query(
    `select (extract(epoch from (d at time zone $1)) * 1000)::bigint as t
       from generate_series(date_trunc('day', now() at time zone $1) - ($2::int - 1) * interval '1 day',
                            date_trunc('day', now() at time zone $1), interval '1 day') d`,
    [PLATFORM_TIMEZONE, n]
  );
  return rows.map((r) => Number(r.t));
}

const RANGE_DAYS = { today: 1, '7d': 7, '30d': 30 };

async function period(range) {
  const days = RANGE_DAYS[range];
  if (!days) throw new HttpError(400, 'Unknown time range.');
  const starts = await dayStarts(days * 2);
  const now = Date.now();
  const from = starts[days];
  const prevFrom = starts[0];
  // "Today" is compared with yesterday up to the same time, not all of yesterday.
  return { range, days, now, from, to: now, prevFrom, prevTo: range === 'today' ? prevFrom + (now - from) : from, starts: starts.slice(days) };
}

// ---------- Orders, as the admin sees them ----------

// new · preparing · on-the-way · delivered · cancelled · rejected
function adminStatus(snap) {
  switch (snap.status) {
    case 'placed':
      return 'new';
    case 'preparing':
    case 'ready':
      return 'preparing';
    case 'on_the_way':
      return 'on-the-way';
    default:
      return snap.status; // delivered, cancelled, rejected
  }
}
const LIVE = new Set(['new', 'preparing', 'on-the-way']);
const isPaid = (o) => o.status !== 'cancelled' && o.status !== 'rejected';

// The facts reports need from one order.
function facts(order, now) {
  const snap = orderSnapshot(order, now);
  const status = adminStatus(snap);
  const p = order.pricing;
  let deliveryMin = null;
  if (status === 'delivered') {
    deliveryMin = order.gps?.deliveredAt ? Math.round((order.gps.deliveredAt - order.placedAt) / 60_000) : toRealMinutes(order.timeline.deliveredAt - order.placedAt);
  }
  return {
    id: order.id,
    placedAt: order.placedAt,
    restaurantId: order.restaurantId,
    customerId: order.customerId,
    riderId: order.riderId ?? null,
    courierName: order.courier?.name ?? null,
    subtotal: p.subtotal,
    fees: p.delivery + p.service + p.smallOrder,
    tip: p.tip ?? 0,
    total: p.total,
    commission: order.commission ?? 0,
    items: order.items.reduce((n, i) => n + i.qty, 0),
    miles: order.km / KM_PER_MILE,
    status,
    deliveryMin,
    rejectReason: order.rejectReason ? REJECT_REASONS[order.rejectReason] : '',
    // How it was paid (null for demo orders). The Stripe id lets an admin find it in the Stripe dashboard.
    payment: order.payment ? { status: order.payment.status, brand: order.payment.brand, last4: order.payment.last4, intentId: order.payment.intentId } : null,
  };
}

// What Forkfly keeps from an order: fees plus commission (tips go to the rider).
const netOf = (o) => (isPaid(o) ? o.fees + o.commission : 0);

async function ordersSince(fromMs, where) {
  const rows = await db
    .select()
    .from(orderTable)
    .where(where ? and(gte(orderTable.placedAt, new Date(fromMs)), where) : gte(orderTable.placedAt, new Date(fromMs)))
    .orderBy(desc(orderTable.placedAt));
  const now = Date.now();
  return rows.map((r) => facts(fromRowCached(r), now));
}

// Orders that might still be in progress: recent ones, plus real-GPS deliveries not yet finished.
async function liveOrders() {
  const rows = await db
    .select()
    .from(orderTable)
    .where(
      and(
        isNull(orderTable.cancelledAt),
        isNull(orderTable.rejectedAt),
        or(gte(orderTable.placedAt, new Date(Date.now() - DAY)), and(isNotNull(orderTable.gps), sql`${orderTable.gps}->>'deliveredAt' is null`))
      )
    )
    .orderBy(desc(orderTable.placedAt))
    .limit(500);
  const now = Date.now();
  return rows.map((r) => facts(fromRowCached(r), now)).filter((o) => LIVE.has(o.status));
}

function summarize(list) {
  const paid = list.filter(isPaid);
  const delivered = list.filter((o) => o.status === 'delivered');
  return {
    orders: list.length,
    gmv: paid.reduce((s, o) => s + o.total, 0),
    net: list.reduce((s, o) => s + netOf(o), 0),
    average: paid.length ? Math.round(paid.reduce((s, o) => s + o.subtotal, 0) / paid.length) : 0,
    cancelRate: list.length ? (list.length - paid.length) / list.length : 0,
    avgDelivery: delivered.length ? Math.round(delivered.reduce((s, o) => s + o.deliveryMin, 0) / delivered.length) : 0,
    customers: new Set(list.map((o) => o.customerId).filter(Boolean)).size,
  };
}

// One point per hour for "today", otherwise one per day.
function series(list, w) {
  let points;
  let slot;
  if (w.range === 'today') {
    points = Array.from({ length: localHour(w.now) + 1 }, (_, h) => ({ t: w.from + h * HOUR }));
    slot = (o) => localHour(o.placedAt);
  } else {
    points = w.starts.map((t) => ({ t }));
    slot = (o) => {
      let i = w.starts.length - 1;
      while (i > 0 && w.starts[i] > o.placedAt) i--;
      return i;
    };
  }
  for (const p of points) Object.assign(p, { orders: 0, gmv: 0, net: 0 });
  for (const o of list) {
    const p = points[slot(o)];
    if (!p) continue;
    p.orders++;
    if (isPaid(o)) p.gmv += o.total;
    p.net += netOf(o);
  }
  return points;
}

// Names for a list of orders, in two queries.
async function decorate(list) {
  const rIds = [...new Set(list.map((o) => o.restaurantId))];
  const uIds = [...new Set(list.flatMap((o) => [o.customerId, o.riderId]).filter(Boolean))];
  const [restaurants, users] = await Promise.all([
    rIds.length ? db.select({ id: restaurantTable.id, name: restaurantTable.name, colors: restaurantTable.colors }).from(restaurantTable).where(inArray(restaurantTable.id, rIds)) : [],
    uIds.length ? db.select({ id: userTable.id, name: userTable.name }).from(userTable).where(inArray(userTable.id, uIds)) : [],
  ]);
  const rById = new Map(restaurants.map((r) => [r.id, r]));
  const uById = new Map(users.map((u) => [u.id, u.name]));
  return list.map(({ commission, miles, courierName, ...o }) => ({
    ...o,
    restaurant: rById.get(o.restaurantId) ?? { id: o.restaurantId, name: o.restaurantId, colors: ['#888', '#555'] },
    customer: o.customerId ? (uById.get(o.customerId) ?? 'Deleted account') : 'Deleted account',
    // Until real dispatch, demo couriers are simulated.
    rider: o.riderId ? (uById.get(o.riderId) ?? 'Former rider') : courierName && o.status !== 'new' && isPaid(o) ? `${courierName} (demo)` : null,
  }));
}

// ---------- Overview and analytics ----------

async function attention() {
  const pending = await db
    .select({ id: restaurantTable.id, name: restaurantTable.name, cuisine: restaurantTable.cuisine, colors: restaurantTable.colors, joinedAt: restaurantTable.createdAt })
    .from(restaurantTable)
    .where(eq(restaurantTable.status, 'pending'))
    .orderBy(asc(restaurantTable.createdAt));
  const riders = await db
    .select({ id: riderTable.userId, name: userTable.name, vehicle: riderTable.vehicle, joinedAt: riderTable.createdAt })
    .from(riderTable)
    .innerJoin(userTable, eq(userTable.id, riderTable.userId))
    .where(eq(riderTable.status, 'pending'))
    .orderBy(asc(riderTable.createdAt));
  // Active restaurants losing more than 1 in 10 orders this week (with enough orders to judge).
  const week = await ordersSince(Date.now() - 7 * DAY);
  const byR = new Map();
  for (const o of week) {
    const s = byR.get(o.restaurantId) ?? { n: 0, lost: 0 };
    s.n++;
    if (!isPaid(o)) s.lost++;
    byR.set(o.restaurantId, s);
  }
  const flagged = [...byR].filter(([, s]) => s.n >= 5 && s.lost / s.n > 0.1);
  const slow = flagged.length
    ? (
        await db
          .select({ id: restaurantTable.id, name: restaurantTable.name, colors: restaurantTable.colors })
          .from(restaurantTable)
          .where(and(eq(restaurantTable.status, 'active'), inArray(restaurantTable.id, flagged.map(([id]) => id))))
      ).map((r) => ({ ...r, cancelRate: byR.get(r.id).lost / byR.get(r.id).n }))
    : [];
  return {
    restaurants: pending.map((r) => ({ ...r, joinedAt: r.joinedAt.getTime() })),
    riders: riders.map((r) => ({ ...r, joinedAt: r.joinedAt.getTime() })),
    slowRestaurants: slow.sort((a, b) => b.cancelRate - a.cancelRate),
  };
}

async function overview(range) {
  const w = await period(range);
  const [all, live, needs, [{ approved }]] = await Promise.all([
    ordersSince(w.prevFrom),
    liveOrders(),
    attention(),
    db.select({ approved: count() }).from(riderTable).where(eq(riderTable.status, 'approved')),
  ]);
  const cur = all.filter((o) => o.placedAt >= w.from);
  const prev = all.filter((o) => o.placedAt >= w.prevFrom && o.placedAt < w.prevTo);
  return {
    range,
    timezone: PLATFORM_TIMEZONE,
    stats: summarize(cur),
    previous: summarize(prev),
    series: series(cur, w),
    live: await decorate(live.slice(0, 8)),
    attention: needs,
    // Riders don't have an app to go online in yet, so nobody shows as online.
    ridersOnline: 0,
    ridersApproved: approved,
  };
}

async function analytics(range) {
  if (range === 'today') throw new HttpError(400, 'Pick 7 or 30 days.');
  const w = await period(range);
  const all = await ordersSince(w.prevFrom);
  const cur = all.filter((o) => o.placedAt >= w.from);
  const prev = all.filter((o) => o.placedAt < w.prevTo);

  const restaurants = await db.select({ id: restaurantTable.id, name: restaurantTable.name, colors: restaurantTable.colors, cuisine: restaurantTable.cuisine }).from(restaurantTable);
  const rById = new Map(restaurants.map((r) => [r.id, r]));
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }));
  const weekdayCounts = Array(7).fill(0);
  const byCuisine = new Map();
  const byRestaurant = new Map();
  for (const o of cur) {
    byHour[localHour(o.placedAt)].orders++;
    weekdayCounts[localWeekday(o.placedAt)]++;
    const r = rById.get(o.restaurantId);
    const cuisine = r?.cuisine ?? 'Other';
    byCuisine.set(cuisine, (byCuisine.get(cuisine) ?? 0) + 1);
    const row = byRestaurant.get(o.restaurantId) ?? { id: o.restaurantId, name: r?.name ?? o.restaurantId, colors: r?.colors ?? ['#888', '#555'], orders: 0, gmv: 0 };
    row.orders++;
    if (isPaid(o)) row.gmv += o.total;
    byRestaurant.set(o.restaurantId, row);
  }
  // How many of each weekday the period covers, for a fair per-day average.
  const weekdayDays = Array(7).fill(0);
  for (const t of w.starts) weekdayDays[localWeekday(t + 12 * HOUR)]++;

  // Customers whose first order ever falls in this period.
  const ids = [...new Set(cur.map((o) => o.customerId).filter(Boolean))];
  const firsts = ids.length
    ? await db
        .select({ id: orderTable.customerId, first: sql`min(${orderTable.placedAt})`.mapWith((v) => new Date(v).getTime()) })
        .from(orderTable)
        .where(inArray(orderTable.customerId, ids))
        .groupBy(orderTable.customerId)
    : [];
  const newCustomers = firsts.filter((f) => f.first >= w.from).length;

  return {
    range,
    timezone: PLATFORM_TIMEZONE,
    stats: summarize(cur),
    previous: summarize(prev),
    series: series(cur, w),
    byHour,
    byWeekday: weekdayCounts.map((n, day) => ({ day, orders: weekdayDays[day] ? Math.round(n / weekdayDays[day]) : 0 })),
    byCuisine: [...byCuisine].map(([cuisine, orders]) => ({ cuisine, orders })).sort((a, b) => b.orders - a.orders),
    topRestaurants: [...byRestaurant.values()].sort((a, b) => b.gmv - a.gmv),
    outcomes: ['delivered', 'cancelled', 'rejected'].map((status) => ({ status, orders: cur.filter((o) => o.status === status).length })),
    customers: { active: ids.length, new: newCustomers, returning: ids.length - newCustomers },
  };
}

// ---------- All orders ----------

const ORDER_FILTERS = new Set(['all', 'live', 'delivered', 'cancelled', 'rejected']);

async function listOrders(params) {
  const status = ORDER_FILTERS.has(params.get('status')) ? params.get('status') : 'all';
  const q = (params.get('q') ?? '').trim().slice(0, 60);
  const conditions = [];
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const matchingRestaurants = db.select({ id: restaurantTable.id }).from(restaurantTable).where(ilike(restaurantTable.name, like));
    const matchingCustomers = db.select({ id: userTable.id }).from(userTable).where(or(ilike(userTable.name, like), ilike(userTable.email, like)));
    conditions.push(or(ilike(orderTable.id, like), inArray(orderTable.restaurantId, matchingRestaurants), inArray(orderTable.customerId, matchingCustomers)));
  }
  if (status === 'cancelled') conditions.push(isNotNull(orderTable.cancelledAt), isNull(orderTable.rejectedAt));
  if (status === 'rejected') conditions.push(isNotNull(orderTable.rejectedAt));
  if (status === 'live' || status === 'delivered') conditions.push(isNull(orderTable.cancelledAt), isNull(orderTable.rejectedAt));
  const where = conditions.length ? and(...conditions) : undefined;

  if (status === 'live' || status === 'delivered') {
    // Whether an order is still moving depends on its timeline, so sort those out here.
    let live = await liveOrders();
    if (q && live.length) {
      const match = new Set((await db.select({ id: orderTable.id }).from(orderTable).where(and(where, inArray(orderTable.id, live.map((o) => o.id))))).map((r) => r.id));
      live = live.filter((o) => match.has(o.id));
    } else if (q) live = [];
    if (status === 'live') return { total: live.length, orders: await decorate(live.slice(0, 100)) };
    const [{ n }] = await db.select({ n: count() }).from(orderTable).where(where);
    const rows = await db.select().from(orderTable).where(where).orderBy(desc(orderTable.placedAt)).limit(100 + live.length);
    const now = Date.now();
    const list = rows.map((r) => facts(fromRowCached(r), now)).filter((o) => o.status === 'delivered');
    return { total: Math.max(0, n - live.length), orders: await decorate(list.slice(0, 100)) };
  }

  const [{ n }] = await db.select({ n: count() }).from(orderTable).where(where);
  const rows = await db.select().from(orderTable).where(where).orderBy(desc(orderTable.placedAt)).limit(100);
  const now = Date.now();
  return { total: n, orders: await decorate(rows.map((r) => facts(fromRowCached(r), now))) };
}

// ---------- Restaurants ----------

async function owners(ids) {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ restaurantId: restaurantMember.restaurantId, name: userTable.name, email: userTable.email })
    .from(restaurantMember)
    .innerJoin(userTable, eq(userTable.id, restaurantMember.userId))
    .where(and(inArray(restaurantMember.restaurantId, ids), eq(restaurantMember.role, 'owner')))
    .orderBy(asc(restaurantMember.createdAt));
  const map = new Map();
  for (const r of rows) if (!map.has(r.restaurantId)) map.set(r.restaurantId, { name: r.name, email: r.email });
  return map;
}

function restaurantRow(r, owner, menuCount, list) {
  const s = summarize(list);
  return {
    id: r.id,
    name: r.name,
    cuisine: r.cuisine,
    colors: r.colors,
    coverImage: r.coverImage,
    status: r.status,
    note: r.statusNote,
    isOwn: r.isOwn,
    owner: r.isOwn ? { name: 'Forkfly', email: settings().supportEmail } : (owner ?? { name: 'No owner yet', email: '' }),
    phone: r.phone ?? '',
    commission: r.isOwn ? 0 : r.commission,
    rating: r.rating,
    reviews: r.reviews,
    prepMin: r.prepMin,
    menuItems: menuCount,
    joinedAt: r.createdAt.getTime(),
    orders30: s.orders,
    gmv30: s.gmv,
    cancelRate: s.cancelRate,
    avgDelivery: s.avgDelivery,
  };
}

async function menuCounts(ids) {
  if (!ids.length) return new Map();
  const rows = await db.select({ id: menuItem.restaurantId, n: count() }).from(menuItem).where(inArray(menuItem.restaurantId, ids)).groupBy(menuItem.restaurantId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

async function listRestaurants() {
  const rows = await db.select().from(restaurantTable).orderBy(asc(restaurantTable.name));
  const ids = rows.map((r) => r.id);
  const [own, menus, recent] = await Promise.all([owners(ids), menuCounts(ids), ordersSince(Date.now() - 30 * DAY)]);
  return rows.map((r) =>
    restaurantRow(
      r,
      own.get(r.id),
      menus.get(r.id) ?? 0,
      recent.filter((o) => o.restaurantId === r.id)
    )
  );
}

async function restaurantDetail(id) {
  const [r] = typeof id === 'string' && id.length <= 64 ? await db.select().from(restaurantTable).where(eq(restaurantTable.id, id)) : [];
  if (!r) throw new HttpError(404, 'No restaurant with that address.');
  const w = await period('30d');
  const [own, menus, list, recentRows] = await Promise.all([
    owners([id]),
    menuCounts([id]),
    ordersSince(w.from, eq(orderTable.restaurantId, id)),
    db.select().from(orderTable).where(eq(orderTable.restaurantId, id)).orderBy(desc(orderTable.placedAt)).limit(8),
  ]);
  const now = Date.now();
  return {
    ...restaurantRow(r, own.get(id), menus.get(id) ?? 0, list),
    series: series(list, w),
    recent: await decorate(recentRows.map((row) => facts(fromRowCached(row), now))),
  };
}

const reason = (v) => cleanText(v, { min: 5, max: 300, label: 'Reason', multiline: true });

async function setRestaurantStatus(id, body) {
  const [r] = await db.select().from(restaurantTable).where(eq(restaurantTable.id, String(id)));
  if (!r) throw new HttpError(404, 'No restaurant with that address.');
  const next = body?.status;
  const set = {};
  if (next === 'active') {
    if (r.status !== 'pending' && r.status !== 'suspended') throw new HttpError(409, `${r.name} is already live.`);
    Object.assign(set, { status: 'active', statusNote: '' });
    // Partners approved from now on get today's default commission.
    if (r.status === 'pending') set.commission = r.isOwn ? 0 : settings().commission;
  } else if (next === 'suspended') {
    if (r.status === 'suspended') throw new HttpError(409, `${r.name} is already suspended.`);
    Object.assign(set, { status: 'suspended', statusNote: reason(body.note) });
  } else throw new HttpError(400, 'Status must be active or suspended.');
  await db.update(restaurantTable).set(set).where(eq(restaurantTable.id, r.id));
  return restaurantDetail(r.id);
}

async function setCommission(id, body) {
  const [r] = await db.select().from(restaurantTable).where(eq(restaurantTable.id, String(id)));
  if (!r) throw new HttpError(404, 'No restaurant with that address.');
  if (r.isOwn) throw new HttpError(409, 'Forkfly’s own kitchens don’t pay commission.');
  const c = Number(body?.commission);
  if (!Number.isFinite(c) || c < 0 || c > 0.5) throw new HttpError(400, 'Commission must be between 0% and 50%.');
  // Applies to new orders; orders already placed keep the commission they were placed with.
  await db.update(restaurantTable).set({ commission: Math.round(c * 10_000) / 10_000 }).where(eq(restaurantTable.id, r.id));
  return restaurantDetail(r.id);
}

// ---------- Riders ----------

async function riderRows(where) {
  const rows = await db
    .select({ id: riderTable.userId, name: userTable.name, email: userTable.email, phone: riderTable.phone, vehicle: riderTable.vehicle, status: riderTable.status, note: riderTable.statusNote, joinedAt: riderTable.createdAt })
    .from(riderTable)
    .innerJoin(userTable, eq(userTable.id, riderTable.userId))
    .where(where)
    .orderBy(asc(userTable.name));
  const ids = rows.map((r) => r.id);
  const [recent, live] = ids.length ? await Promise.all([ordersSince(Date.now() - 30 * DAY, inArray(orderTable.riderId, ids)), liveOrders()]) : [[], []];
  const { riderPayBase, riderPayPerMile } = settings();
  return rows.map((r) => {
    const mine = recent.filter((o) => o.riderId === r.id && o.status === 'delivered');
    return {
      ...r,
      phone: r.phone ?? '',
      joinedAt: r.joinedAt.getTime(),
      online: false, // riders get an app to go online in with dispatch
      onDelivery: live.some((o) => o.riderId === r.id),
      deliveries30: mine.length,
      // Pay at today's rates: base + per mile, plus every tip.
      earnings30: mine.reduce((s, o) => s + riderPayBase + Math.round(o.miles * riderPayPerMile) + o.tip, 0),
      rating: null, // no rider ratings yet
      onTime: null,
    };
  });
}

async function setRiderStatus(id, body) {
  const [r] = await db.select().from(riderTable).where(eq(riderTable.userId, String(id)));
  if (!r) throw new HttpError(404, 'No rider with that id.');
  const next = body?.status;
  if (next === 'approved') {
    if (r.status === 'approved') throw new HttpError(409, 'Already approved.');
    await db.update(riderTable).set({ status: 'approved', statusNote: '' }).where(eq(riderTable.userId, r.userId));
  } else if (next === 'suspended') {
    if (r.status === 'suspended') throw new HttpError(409, 'Already suspended.');
    await db.update(riderTable).set({ status: 'suspended', statusNote: reason(body.note) }).where(eq(riderTable.userId, r.userId));
  } else throw new HttpError(400, 'Status must be approved or suspended.');
  return (await riderRows(eq(riderTable.userId, r.userId)))[0];
}

// ---------- Customers ----------

async function listCustomers(where = eq(userTable.role, 'customer')) {
  const paid = and(isNull(orderTable.cancelledAt), isNull(orderTable.rejectedAt));
  const rows = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      status: userTable.status,
      joinedAt: userTable.createdAt,
      orders: count(orderTable.id),
      spent: sql`coalesce(sum(${orderTable.total}) filter (where ${paid}), 0)`.mapWith(Number),
      lastOrder: sql`max(${orderTable.placedAt})`.mapWith((v) => (v ? new Date(v).getTime() : null)),
    })
    .from(userTable)
    .leftJoin(orderTable, eq(orderTable.customerId, userTable.id))
    .where(where)
    .groupBy(userTable.id)
    .orderBy(desc(userTable.createdAt))
    .limit(5000);
  return rows.map((r) => ({ ...r, joinedAt: r.joinedAt.getTime() }));
}

async function setCustomerStatus(admin, id, body) {
  const next = body?.status;
  if (next !== 'active' && next !== 'suspended') throw new HttpError(400, 'Status must be active or suspended.');
  const [u] = await db.select().from(userTable).where(eq(userTable.id, String(id)));
  if (!u) throw new HttpError(404, 'No customer with that id.');
  if (u.id === admin.id) throw new HttpError(409, 'You can’t suspend your own account.');
  if (u.role === 'admin') throw new HttpError(409, 'Remove them from the admin team first.');
  await db.transaction(async (tx) => {
    await tx.update(userTable).set({ status: next }).where(eq(userTable.id, u.id));
    // Sign them out everywhere straight away.
    if (next === 'suspended') await tx.delete(sessionTable).where(eq(sessionTable.userId, u.id));
  });
  return (await listCustomers(eq(userTable.id, u.id)))[0];
}

// ---------- Settings and the admin team ----------

async function admins() {
  const rows = await db.select({ id: userTable.id, name: userTable.name, email: userTable.email }).from(userTable).where(eq(userTable.role, 'admin')).orderBy(asc(userTable.createdAt));
  return rows.map((a) => ({ ...a, role: 'Admin' }));
}

async function settingsView() {
  return { ...settings(), admins: await admins() };
}

async function addAdmin(body) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email.includes('@')) throw new HttpError(400, 'Enter their email address.');
  const [u] = await db.select().from(userTable).where(eq(userTable.email, email));
  if (!u) throw new HttpError(404, 'No Forkfly account uses that email. Ask them to sign up first, then add them here.');
  if (u.status === 'suspended') throw new HttpError(409, 'That account is suspended. Reinstate it first.');
  if (u.role === 'admin') throw new HttpError(409, 'They’re already an admin.');
  await db.update(userTable).set({ role: 'admin' }).where(eq(userTable.id, u.id));
  return admins();
}

async function removeAdmin(admin, id) {
  if (id === admin.id) throw new HttpError(409, 'You can’t remove yourself. Ask another admin.');
  const team = await admins();
  if (!team.some((a) => a.id === id)) throw new HttpError(404, 'They’re not an admin.');
  if (team.length <= 1) throw new HttpError(409, 'Forkfly needs at least one admin.');
  await db.transaction(async (tx) => {
    await tx.update(userTable).set({ role: 'customer' }).where(eq(userTable.id, id));
    // Their open sessions carry the old role, so sign them out.
    await tx.delete(sessionTable).where(eq(sessionTable.userId, id));
  });
  return admins();
}

// ---------- Routes ----------

export async function handleAdmin(req, res, user, parts, url) {
  if (user.role !== 'admin') throw new HttpError(403, 'Admins only.');
  const m = req.method;
  const [section, id, action] = parts;
  const range = url.searchParams.get('range');

  if (m === 'GET' && section === 'counts' && !id) {
    const [[{ restaurants }], [{ riders }]] = await Promise.all([
      db.select({ restaurants: count() }).from(restaurantTable).where(eq(restaurantTable.status, 'pending')),
      db.select({ riders: count() }).from(riderTable).where(eq(riderTable.status, 'pending')),
    ]);
    return json(res, 200, { restaurants, riders });
  }
  if (m === 'GET' && section === 'overview' && !id) return json(res, 200, await overview(range ?? 'today'));
  if (m === 'GET' && section === 'analytics' && !id) return json(res, 200, await analytics(range ?? '30d'));

  if (section === 'orders') {
    if (m === 'GET' && !id) return json(res, 200, await listOrders(url.searchParams));
    if (m === 'POST' && id && action === 'cancel') {
      const order = await getOrder(id);
      if (!order) throw new HttpError(404, 'Order not found.');
      await adminCancel(order);
      return json(res, 200, (await decorate([facts(order, Date.now())]))[0]);
    }
  }

  if (section === 'restaurants') {
    if (m === 'GET' && !id) return json(res, 200, await listRestaurants());
    if (m === 'GET' && id && !action) return json(res, 200, await restaurantDetail(id));
    if (m === 'POST' && id && action === 'status') return json(res, 200, await setRestaurantStatus(id, await readBody(req)));
    if (m === 'POST' && id && action === 'commission') return json(res, 200, await setCommission(id, await readBody(req)));
  }

  if (section === 'riders') {
    if (m === 'GET' && !id) return json(res, 200, await riderRows());
    if (m === 'POST' && id && action === 'status') return json(res, 200, await setRiderStatus(id, await readBody(req)));
  }

  if (section === 'customers') {
    if (m === 'GET' && !id) return json(res, 200, await listCustomers());
    if (m === 'POST' && id && action === 'status') return json(res, 200, await setCustomerStatus(user, id, await readBody(req)));
  }

  if (section === 'settings' && !id) {
    if (m === 'GET') return json(res, 200, await settingsView());
    if (m === 'PUT') {
      await saveSettings(await readBody(req), user);
      return json(res, 200, await settingsView());
    }
  }

  if (section === 'admins') {
    if (m === 'POST' && !id) return json(res, 201, await addAdmin(await readBody(req)));
    if (m === 'DELETE' && id) return json(res, 200, await removeAdmin(user, id));
  }

  throw new HttpError(404, 'Not found.');
}

