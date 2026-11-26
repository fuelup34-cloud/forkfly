// Orders: placing them, the kitchen's steps, and keeping tracked orders in memory.
//
// Orders live in Postgres. Ones in progress are also kept in memory, so the twice-a-second
// tracking updates don't hit the database. Every change is written through, one write at a
// time per order, and announced on `orderEvents` so live screens can update.

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { COURIERS } from './restaurants.js';
import { db, schema } from './db/index.js';
import { HttpError, intIn } from './http.js';
import { loadRestaurant } from './catalog.js';
import { settings } from './settings.js';
import {
  ADDRESSES,
  KM_PER_MILE,
  formatMoney,
  CITY_SIZE,
  COURIER_SPEED,
  GRID,
  HANDOVER_MS,
  PREP_CHOICES,
  demoMs,
  distanceKm,
  kitchenStatus,
  orderSnapshot,
  pathLength,
  planFromAcceptance,
  planFromReady,
  priceBreakdown,
  routeBetween,
} from '../shared/core.js';

const { order: orderTable, restaurantMember, user: userTable } = schema;
const addressById = new Map(ADDRESSES.map((a) => [a.id, a]));

export const orderEvents = new EventEmitter();
orderEvents.setMaxListeners(50);

export const cache = new Map(); // order id -> order
const writes = new Map(); // order id -> promise of the last pending write

function fromRow(row) {
  return {
    id: row.id,
    customerId: row.customerId,
    restaurantId: row.restaurantId,
    restaurant: row.restaurantSnapshot,
    address: row.address,
    items: row.items,
    pricing: row.pricing,
    km: row.km,
    note: row.note,
    courier: row.courier,
    speed: row.speed,
    pickupPath: row.pickupPath,
    dropPath: row.dropPath,
    placedAt: row.placedAt.getTime(),
    timeline: row.timeline,
    cancelledAt: row.cancelledAt ? row.cancelledAt.getTime() : null,
    rejectedAt: row.rejectedAt ? row.rejectedAt.getTime() : null,
    rejectReason: row.rejectReason ?? null,
    riderId: row.riderId ?? null,
    commission: row.commission ?? 0, // Forkfly's cut; never sent to customers
    gps: row.gps ?? undefined,
  };
}

// The cached copy if there is one, so every screen sees the same object.
export function fromRowCached(row) {
  if (cache.has(row.id)) return cache.get(row.id);
  const order = fromRow(row);
  if (orderSnapshot(order).active) cache.set(order.id, order);
  return order;
}

export async function getOrder(id) {
  if (typeof id !== 'string' || id.length > 32) return null;
  if (cache.has(id)) return cache.get(id);
  await writes.get(id);
  const [row] = await db.select().from(orderTable).where(eq(orderTable.id, id));
  if (!row) return null;
  // Another request may have loaded it while we waited.
  if (!cache.has(id)) cache.set(id, fromRow(row));
  return cache.get(id);
}

export const hasPendingWrite = (id) => writes.has(id);

const DATE_FIELDS = new Set(['cancelledAt', 'rejectedAt']);

// Saves the given fields of a cached order, then tells live screens. Writes for one order run
// in order, so an older GPS trail can never overwrite a newer one.
export function persist(order, fields) {
  const values = {};
  for (const f of fields) {
    if (DATE_FIELDS.has(f)) values[f] = order[f] ? new Date(order[f]) : null;
    else values[f] = order[f] ?? null;
  }
  const prev = writes.get(order.id) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(() => db.update(orderTable).set(values).where(eq(orderTable.id, order.id)));
  writes.set(order.id, next);
  next.finally(() => writes.get(order.id) === next && writes.delete(order.id)).catch(() => {});
  return next.then(() => orderEvents.emit('changed', order));
}

// ---------- Placing an order ----------

const rand = (min, max) => min + Math.random() * (max - min);
const clampGrid = (v) => Math.min(CITY_SIZE - GRID, Math.max(GRID, v));

// "Jordan Smith" -> "Jordan S." — enough for the kitchen to call out, without the full name.
export function shortName(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Customer';
  return parts.length > 1 ? `${parts[0]} ${[...parts[parts.length - 1]][0].toUpperCase()}.` : parts[0];
}

export async function createOrder(customer, body) {
  const rules = settings();
  if (!rules.orderingOpen) throw new HttpError(503, 'Forkfly is paused right now. Please try again a little later.');
  const restaurant = await loadRestaurant(typeof body?.restaurantId === 'string' ? body.restaurantId : '');
  if (!restaurant || !restaurant.open) throw new HttpError(400, 'That restaurant isn’t taking orders right now.');
  const address = addressById.get(body?.addressId);
  if (!address) throw new HttpError(400, 'Pick a delivery address.');

  const counts = new Map();
  for (const line of Array.isArray(body.items) ? body.items.slice(0, 50) : []) {
    const qty = Number(line?.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) continue;
    if (!restaurant.menu.some((m) => m.id === line.id)) continue;
    counts.set(line.id, Math.min(20, (counts.get(line.id) ?? 0) + qty));
  }
  const items = restaurant.menu
    .filter((m) => counts.has(m.id))
    .map((m) => ({ id: m.id, name: m.name, price: m.price, qty: counts.get(m.id) }));
  if (items.length === 0) throw new HttpError(400, 'Your bag is empty, or those items just sold out.');

  const tip = Number(body.tip);
  const safeTip = Number.isInteger(tip) && tip >= 0 && tip <= 5000 ? tip : 0;
  const subtotal = items.reduce((n, i) => n + i.price * i.qty, 0);
  if (subtotal < rules.minOrder) throw new HttpError(400, `The minimum order is ${formatMoney(rules.minOrder)} before fees.`);
  const km = distanceKm(restaurant, address);
  if (km / KM_PER_MILE > rules.maxRadiusMiles) throw new HttpError(400, `${restaurant.name} is too far away to deliver to that address.`);
  const pricing = priceBreakdown({ subtotal, km, tip: safeTip });

  // Restaurants with their own staff run their kitchen from the dashboard. The demo ones run themselves.
  const [staffed] = await db.select({ id: restaurantMember.userId }).from(restaurantMember).where(eq(restaurantMember.restaurantId, restaurant.id)).limit(1);
  const manual = !!staffed;

  // A nearby courier heads to the restaurant while the food is cooked.
  const courier = COURIERS[Math.floor(Math.random() * COURIERS.length)];
  const start = {
    x: clampGrid(restaurant.x + GRID * Math.round(rand(-3, 3))),
    y: clampGrid(restaurant.y + GRID * Math.round(rand(-3, 3))),
  };
  const pickupPath = routeBetween(start, restaurant);
  const dropPath = routeBetween(restaurant, address);
  const placedAt = Date.now();

  let timeline;
  if (manual) {
    timeline = { manual: true, estimatePrepMinutes: restaurant.prepMin, acceptedAt: null, readyConfirmedAt: null };
  } else {
    const acceptedAt = placedAt + 2500;
    const readyAt = acceptedAt + demoMs(restaurant.prepMin * rand(0.85, 1.15));
    const assignedAt = placedAt + 3500;
    const arriveRestaurantAt = assignedAt + pathLength(pickupPath) / COURIER_SPEED;
    const pickedUpAt = Math.max(readyAt, arriveRestaurantAt) + HANDOVER_MS;
    const deliveredAt = pickedUpAt + pathLength(dropPath) / COURIER_SPEED;
    timeline = { acceptedAt, readyAt, assignedAt, arriveRestaurantAt, pickedUpAt, deliveredAt };
  }

  const order = {
    id: randomUUID().slice(0, 8).toUpperCase(),
    customerId: customer.id,
    customerLabel: shortName(customer.name),
    restaurantId: restaurant.id,
    restaurant: { id: restaurant.id, name: restaurant.name, colors: restaurant.colors, coverImage: restaurant.coverImage, x: restaurant.x, y: restaurant.y },
    address: { ...address },
    items,
    pricing,
    km: Math.round(km * 100) / 100,
    note: typeof body.note === 'string' ? body.note.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 200) : '',
    courier: { ...courier, start },
    speed: COURIER_SPEED,
    pickupPath,
    dropPath,
    placedAt,
    timeline,
    cancelledAt: null,
    rejectedAt: null,
    rejectReason: null,
    riderId: null,
    commission: Math.round(subtotal * restaurant.commission),
  };
  await db.insert(orderTable).values({
    id: order.id,
    customerId: customer.id,
    restaurantId: restaurant.id,
    total: pricing.total,
    commission: order.commission,
    placedAt: new Date(placedAt),
    restaurantSnapshot: order.restaurant,
    address: order.address,
    items,
    pricing,
    km: order.km,
    note: order.note,
    courier: order.courier,
    speed: order.speed,
    pickupPath,
    dropPath,
    timeline,
  });
  cache.set(order.id, order);
  orderEvents.emit('changed', order);
  return order;
}

// ---------- The kitchen's steps ----------

export const REJECT_REASONS = {
  busy: 'The kitchen is too busy right now',
  sold_out: 'Something in the order sold out',
  closing: 'The restaurant is closing',
  other: 'The restaurant couldn’t take this order',
  no_response: 'The restaurant didn’t respond in time',
};

// A kitchen has this long (real time) to accept before the order is declined for them,
// so nobody waits forever for food that isn't coming.
export const ACCEPT_WITHIN_MS = 10 * 60 * 1000;

export async function declineUnanswered(now = Date.now()) {
  for (const order of cache.values()) {
    if (!order.timeline.manual || order.timeline.acceptedAt || order.cancelledAt || order.rejectedAt) continue;
    if (now - order.placedAt < ACCEPT_WITHIN_MS) continue;
    order.rejectedAt = now;
    order.rejectReason = 'no_response';
    if (order.gps) order.gps.trail = [];
    await persist(order, ['rejectedAt', 'rejectReason', 'gps']).catch((err) => console.error('Could not decline order', order.id, err.message));
  }
}

// After a restart: bring back orders still waiting for a kitchen, so they're answered or timed out.
export async function loadWaiting() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(orderTable)
    .where(and(gte(orderTable.placedAt, since), isNull(orderTable.cancelledAt), isNull(orderTable.rejectedAt)));
  for (const row of rows) if (row.timeline?.manual && !row.timeline.acceptedAt) fromRowCached(row);
}

function requireKitchen(order, expected) {
  const now = Date.now();
  const status = kitchenStatus(orderSnapshot(order, now));
  if (!order.timeline.manual) throw new HttpError(409, 'This order is handled automatically.');
  if (status !== expected) {
    const msg = {
      new: 'Accept the order first.',
      ready: 'This order is already marked ready.',
      cancelled: 'The customer cancelled this order.',
      rejected: 'This order was already declined.',
      done: 'The courier already has this order.',
    }[status];
    throw new HttpError(409, msg ?? 'This order has already moved on. Refresh to see the latest.');
  }
  return now;
}

export async function acceptOrder(order, body) {
  const prep = intIn(body?.prepMinutes, { min: 1, max: 120, label: 'Prep time' });
  const now = requireKitchen(order, 'new');
  order.timeline = planFromAcceptance(order, now, prep);
  await persist(order, ['timeline']);
}

export async function rejectOrder(order, body) {
  const reason = Object.hasOwn(REJECT_REASONS, body?.reason) ? body.reason : 'other';
  const now = requireKitchen(order, 'new');
  order.rejectedAt = now;
  order.rejectReason = reason;
  if (order.gps) order.gps.trail = [];
  await persist(order, ['rejectedAt', 'rejectReason', 'gps']);
}

export async function markReady(order) {
  const now = requireKitchen(order, 'preparing');
  order.timeline = planFromReady(order, now);
  await persist(order, ['timeline']);
}

// More time needed: push the "ready by" estimate back.
export async function addPrepTime(order, body) {
  const extra = intIn(body?.minutes, { min: 1, max: 60, label: 'Extra time' });
  requireKitchen(order, 'preparing');
  const t = order.timeline;
  order.timeline = planFromAcceptance(order, t.acceptedAt, t.prepMinutes + extra);
  await persist(order, ['timeline']);
}

export { PREP_CHOICES };

// An admin stops an order at any point before it's delivered (the customer can only cancel early).
export async function adminCancel(order) {
  const snap = orderSnapshot(order);
  if (!snap.active || order.rejectedAt) throw new HttpError(409, 'This order has already finished.');
  order.cancelledAt = Date.now();
  if (order.gps) order.gps.trail = [];
  await persist(order, ['cancelledAt', 'gps']);
}

// ---------- What the kitchen sees ----------

export function kitchenView(order, now = Date.now()) {
  const snap = orderSnapshot(order, now);
  const t = order.timeline;
  const status = kitchenStatus(snap);
  return {
    id: order.id,
    status,
    manual: !!t.manual,
    placedAt: order.placedAt,
    customer: order.customerLabel ?? 'Customer',
    items: order.items.map((i) => ({ id: i.id, name: i.name, qty: i.qty, price: i.price })),
    itemCount: order.items.reduce((n, i) => n + i.qty, 0),
    note: order.note,
    subtotal: order.pricing.subtotal,
    prepMinutes: t.prepMinutes ?? null,
    estimatePrepMinutes: t.estimatePrepMinutes ?? null,
    acceptedAt: t.acceptedAt ?? null,
    readyBy: status === 'preparing' ? t.readyAt : null,
    readyAt: t.readyConfirmedAt ?? (status !== 'new' && now >= t.readyAt ? t.readyAt : null),
    pickedUpAt: status === 'done' ? (order.gps?.pickedUpAt ?? t.pickedUpAt) : null,
    courier:
      status === 'preparing' || status === 'ready'
        ? {
            name: order.courier.name,
            vehicle: order.courier.vehicle,
            phase: snap.courierPhase,
            arrivesAt: snap.courierPhase === 'to_restaurant' ? t.arriveRestaurantAt : null,
          }
        : null,
    rejectReason: order.rejectReason ? REJECT_REASONS[order.rejectReason] : null,
    cancelledAt: order.cancelledAt,
    now,
  };
}

// Fills in the customer's short name for orders loaded from the database.
export async function withCustomerLabels(orders) {
  const missing = [...new Set(orders.filter((o) => !o.customerLabel && o.customerId).map((o) => o.customerId))];
  if (missing.length) {
    const rows = await db.select({ id: userTable.id, name: userTable.name }).from(userTable).where(inArray(userTable.id, missing));
    const byId = new Map(rows.map((r) => [r.id, shortName(r.name)]));
    for (const o of orders) if (!o.customerLabel) o.customerLabel = byId.get(o.customerId) ?? 'Customer';
  }
  return orders;
}

// Orders a kitchen still has to deal with: waiting, cooking, or waiting for the courier.
export async function liveKitchenOrders(restaurantId) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(orderTable)
    .where(and(eq(orderTable.restaurantId, restaurantId), gte(orderTable.placedAt, since), isNull(orderTable.cancelledAt), isNull(orderTable.rejectedAt)))
    .orderBy(desc(orderTable.placedAt))
    .limit(200);
  const now = Date.now();
  const live = rows.map(fromRowCached).filter((o) => ['new', 'preparing', 'ready'].includes(kitchenStatus(orderSnapshot(o, now))));
  for (const o of live) cache.set(o.id, o);
  return withCustomerLabels(live);
}

export { fromRow };
