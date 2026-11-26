// Logic shared by the server and the app, so prices and arrival times always agree.
//
// The city is a 1000 × 1000 grid of streets (one street every 100 units).
// 100 units = 0.5 km. All money is in cents.

export const TIME_SCALE = 30; // The demo runs 30× faster than real life.
export const KM_PER_UNIT = 0.005;
export const GRID = 100;
export const CITY_SIZE = 1000;
const COURIER_KMH = 20;

// How far a courier moves per millisecond of demo time, in map units.
export const COURIER_SPEED = ((COURIER_KMH / 3_600_000) * TIME_SCALE) / KM_PER_UNIT;

export const ADDRESSES = [
  { id: 'home', label: 'Home', line: '12 Maple Street', x: 800, y: 700 },
  { id: 'work', label: 'Work', line: '480 Harbor Avenue', x: 300, y: 900 },
  { id: 'gym', label: 'Gym', line: '9 Ridge Road', x: 600, y: 100 },
  { id: 'friend', label: "Jamie's place", line: '77 Orchard Lane', x: 900, y: 300 },
];

// Distances are stored in km but shown, and charged, in miles.
export const KM_PER_MILE = 1.609344;

export const FEES = {
  deliveryBase: 99, // $0.99 covers the first mile
  includedMiles: 1,
  perExtraMile: 65, // then $0.65 per mile
  deliveryCap: 399, // never more than $3.99
  serviceRate: 0.05, // 5% service fee…
  serviceCap: 250, // …capped at $2.50
  smallOrderUnder: 1000, // orders under $10…
  smallOrderFee: 100, // …pay $1.00 extra
};
export const DEFAULT_FEES = Object.freeze({ ...FEES });

// Admins can change fees (admin → Settings). The server loads them at start and the app gets
// them with /api/me, so both sides price orders the same way. Only known keys are taken.
export function applyFees(next) {
  for (const key of Object.keys(DEFAULT_FEES)) if (Number.isFinite(next?.[key])) FEES[key] = next[key];
}

// How a rider can deliver.
export const VEHICLES = ['Bicycle', 'E-bike', 'Scooter', 'Motorbike', 'Car'];

export const TIP_OPTIONS =[0, 100, 200, 300, 500];

// ---------- Map geometry ----------

export function routeBetween(a, b) {
  // Couriers follow the streets: across first, then up or down.
  const points = [{ x: a.x, y: a.y }];
  if (a.x !== b.x && a.y !== b.y) points.push({ x: b.x, y: a.y });
  if (a.x !== b.x || a.y !== b.y) points.push({ x: b.x, y: b.y });
  return points;
}

export function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
  return total;
}

export function pointAlong(points, distance) {
  let left = Math.max(0, distance);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (left <= len) {
      const t = len ? left / len : 1;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= len;
  }
  return { ...points[points.length - 1] };
}

export function distanceKm(a, b) {
  return pathLength(routeBetween(a, b)) * KM_PER_UNIT;
}

// ---------- Fees ----------

export function deliveryFee(km) {
  // Round first, so 1.0004 miles of floating-point error never costs an extra mile.
  const miles = Math.round((km / KM_PER_MILE) * 100) / 100;
  const extra = Math.max(0, Math.ceil(miles - FEES.includedMiles));
  return Math.min(FEES.deliveryCap, FEES.deliveryBase + extra * FEES.perExtraMile);
}

export function formatMiles(km) {
  const mi = km / KM_PER_MILE;
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}

export function priceBreakdown({ subtotal, km, tip = 0 }) {
  const delivery = deliveryFee(km);
  const service = Math.min(FEES.serviceCap, Math.round(subtotal * FEES.serviceRate));
  const smallOrder = subtotal > 0 && subtotal < FEES.smallOrderUnder ? FEES.smallOrderFee : 0;
  return { subtotal, delivery, service, smallOrder, tip, total: subtotal + delivery + service + smallOrder + tip };
}

export function formatMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

// ---------- Time ----------

// Demo milliseconds -> real-life minutes, as shown to people.
export function toRealMinutes(demoMs) {
  return Math.max(0, Math.ceil((demoMs * TIME_SCALE) / 60_000));
}

// A rough real-life arrival window shown on restaurant cards.
export function estimateMinutes(restaurant, address) {
  const driveMin = (distanceKm(restaurant, address) / COURIER_KMH) * 60;
  const low = Math.round(restaurant.prepMin + driveMin);
  return [Math.max(10, low), Math.max(15, low + 6)];
}

// ---------- Live order status ----------

// How long each stage takes, in demo milliseconds. Used to plan a delivery, and to re-plan it
// when a partner restaurant accepts an order or says the food is ready.
export const HANDOVER_MS = 1500; // the courier taking the bag
export const PREP_CHOICES = [10, 15, 20, 30, 45]; // minutes a kitchen can quote when accepting

export function demoMs(realMinutes) {
  return (realMinutes * 60_000) / TIME_SCALE;
}

// Plans the rest of a delivery from the moment the kitchen accepts it.
export function planFromAcceptance(order, acceptedAt, prepMinutes) {
  const pickupMs = pathLength(order.pickupPath) / order.speed;
  const dropMs = pathLength(order.dropPath) / order.speed;
  const readyAt = acceptedAt + demoMs(prepMinutes);
  const assignedAt = acceptedAt + 1000;
  const arriveRestaurantAt = assignedAt + pickupMs;
  const pickedUpAt = Math.max(readyAt, arriveRestaurantAt) + HANDOVER_MS;
  return { ...order.timeline, acceptedAt, prepMinutes, readyAt, assignedAt, arriveRestaurantAt, pickedUpAt, deliveredAt: pickedUpAt + dropMs };
}

// The kitchen says the food is ready: the courier takes it as soon as they're there.
export function planFromReady(order, readyAt) {
  const t = order.timeline;
  const dropMs = pathLength(order.dropPath) / order.speed;
  const pickedUpAt = Math.max(readyAt, t.arriveRestaurantAt) + HANDOVER_MS;
  return { ...t, readyAt, readyConfirmedAt: readyAt, pickedUpAt, deliveredAt: pickedUpAt + dropMs };
}

export const STEPS = [
  { id: 'placed', label: 'Order placed' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'on_the_way', label: 'On the way' },
  { id: 'delivered', label: 'Delivered' },
];

// With a real courier, their phone decides the position and their taps decide the status.
function gpsSnapshot(order, now) {
  const { pickedUpAt, deliveredAt } = order.gps;
  const waiting = order.timeline.manual && !order.timeline.acceptedAt;
  const status = order.cancelledAt ? 'cancelled' : deliveredAt ? 'delivered' : pickedUpAt ? 'on_the_way' : waiting ? 'placed' : 'preparing';
  const active = status !== 'delivered' && status !== 'cancelled';
  return {
    ...order,
    status,
    active,
    courierPos: null,
    courierPhase: null,
    etaMs: null,
    progress: { preparing: 0.3, on_the_way: 0.7, delivered: 1, cancelled: 0 }[status],
    almostThere: false,
    canCancel: active && !pickedUpAt,
    now,
  };
}

const FINISHED = (order, status, now) => ({
  ...order,
  status,
  active: false,
  courierPos: null,
  courierPhase: null,
  etaMs: 0,
  progress: 0,
  almostThere: false,
  canCancel: false,
  now,
});

// Where an order is at time `now`. The delivery is planned in advance, so this is just
// arithmetic — it survives server restarts and never drifts.
//
// Demo restaurants run themselves (the plan is fixed when the order is placed). Partner
// restaurants ("manual" orders) accept, quote a prep time and mark the food ready, and each of
// those re-plans what's left. Until a step happens, its time is treated as "not yet".
export function orderSnapshot(order, now = Date.now()) {
  if (order.rejectedAt) return FINISHED(order, 'rejected', now);
  if (order.gps) return gpsSnapshot(order, now);
  const plan = order.timeline;
  let t = plan;
  let etaOverride = null;
  if (plan.manual && !order.cancelledAt) {
    const dropMs = pathLength(order.dropPath) / order.speed;
    if (!plan.acceptedAt) {
      const never = { acceptedAt: Infinity, readyAt: Infinity, assignedAt: Infinity, arriveRestaurantAt: Infinity, pickedUpAt: Infinity, deliveredAt: Infinity };
      t = { ...plan, ...never };
      etaOverride = demoMs(plan.estimatePrepMinutes) + dropMs + HANDOVER_MS;
    } else if (!plan.readyConfirmedAt) {
      t = { ...plan, readyAt: Infinity, pickedUpAt: Infinity, deliveredAt: Infinity };
      const pickup = Math.max(plan.readyAt, plan.arriveRestaurantAt, now) + HANDOVER_MS;
      etaOverride = pickup + dropMs - now;
    }
  }
  let status;
  if (order.cancelledAt) status = 'cancelled';
  else if (now < t.acceptedAt) status = 'placed';
  else if (now < t.readyAt) status = 'preparing';
  else if (now < t.pickedUpAt) status = 'ready';
  else if (now < t.deliveredAt) status = 'on_the_way';
  else status = 'delivered';

  let courier = null;
  let courierPhase = null;
  if (!order.cancelledAt && now >= t.assignedAt) {
    if (now < t.arriveRestaurantAt) {
      courierPhase = 'to_restaurant';
      courier = pointAlong(order.pickupPath, (now - t.assignedAt) * order.speed);
    } else if (now < t.pickedUpAt) {
      courierPhase = 'at_restaurant';
      courier = { x: order.restaurant.x, y: order.restaurant.y };
    } else if (now < t.deliveredAt) {
      courierPhase = 'to_customer';
      courier = pointAlong(order.dropPath, (now - t.pickedUpAt) * order.speed);
    } else {
      courierPhase = 'arrived';
      courier = { x: order.address.x, y: order.address.y };
    }
  }

  const active = status !== 'delivered' && status !== 'cancelled';
  const etaMs = active ? (etaOverride ?? t.deliveredAt - now) : 0;
  const total = now + etaMs - order.placedAt;
  return {
    ...order,
    status,
    active,
    courierPos: courier,
    courierPhase,
    etaMs,
    progress: order.cancelledAt ? 0 : status === 'delivered' ? 1 : Math.min(0.98, Math.max(0, (now - order.placedAt) / total)),
    almostThere: status === 'on_the_way' && t.deliveredAt - now < (t.deliveredAt - t.pickedUpAt) * 0.2,
    // Partner kitchens start cooking once they accept, so after that it's too late to cancel.
    canCancel: active && (plan.manual ? !plan.acceptedAt : now < t.pickedUpAt),
    now,
  };
}

// The same order, as the kitchen sees it.
//   new: waiting to be accepted · preparing · ready: waiting for the courier · done · cancelled · rejected
export function kitchenStatus(snap) {
  if (snap.status === 'rejected' || snap.status === 'cancelled') return snap.status;
  if (snap.status === 'placed') return 'new';
  if (snap.status === 'preparing') return 'preparing';
  if (snap.status === 'ready') return 'ready';
  return 'done';
}
