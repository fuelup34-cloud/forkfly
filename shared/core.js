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

export const FEES = {
  deliveryBase: 99, // $0.99 covers the first 2 km
  includedKm: 2,
  perExtraKm: 40, // then $0.40 per km
  deliveryCap: 399, // never more than $3.99
  serviceRate: 0.05, // 5% service fee…
  serviceCap: 250, // …capped at $2.50
  smallOrderUnder: 1000, // orders under $10…
  smallOrderFee: 100, // …pay $1.00 extra
};

export const TIP_OPTIONS = [0, 100, 200, 300, 500];

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
  const extra = Math.max(0, Math.ceil(km - FEES.includedKm));
  return Math.min(FEES.deliveryCap, FEES.deliveryBase + extra * FEES.perExtraKm);
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

export const STEPS = [
  { id: 'placed', label: 'Order placed' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'on_the_way', label: 'On the way' },
  { id: 'delivered', label: 'Delivered' },
];

// With a real courier, their phone decides the position and their taps decide the status.
function gpsSnapshot(order, now) {
  const { pickedUpAt, deliveredAt } = order.gps;
  const status = order.cancelledAt ? 'cancelled' : deliveredAt ? 'delivered' : pickedUpAt ? 'on_the_way' : 'preparing';
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

// Where an order is at time `now`. The whole delivery is planned when the order is placed,
// so this is just arithmetic — it survives server restarts and never drifts.
export function orderSnapshot(order, now = Date.now()) {
  if (order.gps) return gpsSnapshot(order, now);
  const t = order.timeline;
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
  const total = t.deliveredAt - order.placedAt;
  return {
    ...order,
    status,
    active,
    courierPos: courier,
    courierPhase,
    etaMs: active ? t.deliveredAt - now : 0,
    progress: order.cancelledAt ? 0 : Math.min(1, Math.max(0, (now - order.placedAt) / total)),
    almostThere: status === 'on_the_way' && t.deliveredAt - now < (t.deliveredAt - t.pickedUpAt) * 0.2,
    canCancel: active && now < t.pickedUpAt,
    now,
  };
}
