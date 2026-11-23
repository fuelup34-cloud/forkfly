// Forkfly server.
//
//   • /api/...  restaurants, menus and orders (JSON over HTTP)
//   • /ws       live order tracking: pushes the courier's position twice a second
//   • serves the built site from dist/ when you run `npm start`
//
// Prices are always recalculated here, so the app can't be tricked into charging less.

import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { RESTAURANTS, COURIERS } from './restaurants.js';
import {
  ADDRESSES,
  CITY_SIZE,
  COURIER_SPEED,
  GRID,
  TIME_SCALE,
  distanceKm,
  estimateMinutes,
  orderSnapshot,
  pathLength,
  priceBreakdown,
  routeBetween,
  deliveryFee,
} from '../shared/core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3002;
const DATA_FILE = process.env.DATA_FILE || path.join(HERE, 'data.json');
const DIST = path.join(HERE, '..', 'dist');
const TICK_MS = 500;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 5443;
const CERT_DIR = process.env.CERT_DIR || path.join(HERE, '..', '.certs');
const tls = fs.existsSync(path.join(CERT_DIR, 'key.pem'))
  ? { key: fs.readFileSync(path.join(CERT_DIR, 'key.pem')), cert: fs.readFileSync(path.join(CERT_DIR, 'cert.pem')) }
  : null;

const byId = new Map(RESTAURANTS.map((r) => [r.id, r]));
const addressById = new Map(ADDRESSES.map((a) => [a.id, a]));

// ---------- Storage ----------

// No prototype, so an id like "constructor" can't match a built-in property.
const orders = Object.create(null);
try {
  Object.assign(orders, JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).orders);
} catch {
  // Nothing saved yet.
}
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DATA_FILE, JSON.stringify({ orders }), (err) => err && console.error('Could not save:', err.message));
  }, 200);
}

// ---------- Restaurants ----------

function summary(r, address) {
  const km = distanceKm(r, address);
  return {
    id: r.id,
    name: r.name,
    cuisine: r.cuisine,
    emoji: r.emoji,
    colors: r.colors,
    rating: r.rating,
    reviews: r.reviews,
    priceLevel: r.priceLevel,
    x: r.x,
    y: r.y,
    km: Math.round(km * 10) / 10,
    deliveryFee: deliveryFee(km),
    eta: estimateMinutes(r, address),
    dishes: r.menu.map((m) => m.name),
  };
}

// ---------- Orders ----------

const rand = (min, max) => min + Math.random() * (max - min);
const clampGrid = (v) => Math.min(CITY_SIZE - GRID, Math.max(GRID, v));
const demoMs = (realMinutes) => (realMinutes * 60_000) / TIME_SCALE;

function createOrder(deviceId, body) {
  const restaurant = byId.get(body?.restaurantId);
  if (!restaurant) throw new Error('That restaurant does not exist.');
  const address = addressById.get(body?.addressId);
  if (!address) throw new Error('Pick a delivery address.');

  const counts = new Map();
  for (const line of Array.isArray(body.items) ? body.items.slice(0, 50) : []) {
    const qty = Number(line?.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) continue;
    if (!restaurant.menu.some((m) => m.id === line.id)) continue;
    counts.set(line.id, Math.min(20, (counts.get(line.id) ?? 0) + qty));
  }
  const items = restaurant.menu
    .filter((m) => counts.has(m.id))
    .map((m) => ({ id: m.id, name: m.name, emoji: m.emoji, price: m.price, qty: counts.get(m.id) }));
  if (items.length === 0) throw new Error('Your cart is empty.');

  const tip = Number(body.tip);
  const safeTip = Number.isInteger(tip) && tip >= 0 && tip <= 5000 ? tip : 0;
  const subtotal = items.reduce((n, i) => n + i.price * i.qty, 0);
  const km = distanceKm(restaurant, address);
  const pricing = priceBreakdown({ subtotal, km, tip: safeTip });

  // Plan the whole delivery now. A nearby courier heads to the restaurant while the food is cooked.
  const courier = COURIERS[Math.floor(Math.random() * COURIERS.length)];
  const start = {
    x: clampGrid(restaurant.x + GRID * Math.round(rand(-3, 3))),
    y: clampGrid(restaurant.y + GRID * Math.round(rand(-3, 3))),
  };
  const pickupPath = routeBetween(start, restaurant);
  const dropPath = routeBetween(restaurant, address);
  const placedAt = Date.now();
  const acceptedAt = placedAt + 2500;
  const readyAt = acceptedAt + demoMs(restaurant.prepMin * rand(0.85, 1.15));
  const assignedAt = placedAt + 3500;
  const arriveRestaurantAt = assignedAt + pathLength(pickupPath) / COURIER_SPEED;
  const pickedUpAt = Math.max(readyAt, arriveRestaurantAt) + 1500; // a moment to hand over the bag
  const deliveredAt = pickedUpAt + pathLength(dropPath) / COURIER_SPEED;

  const order = {
    id: randomUUID().slice(0, 8).toUpperCase(),
    deviceId,
    restaurant: { id: restaurant.id, name: restaurant.name, emoji: restaurant.emoji, x: restaurant.x, y: restaurant.y },
    address: { ...address },
    items,
    pricing,
    km: Math.round(km * 10) / 10,
    note: typeof body.note === 'string' ? body.note.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 200) : '',
    courier: { ...courier, start },
    speed: COURIER_SPEED,
    pickupPath,
    dropPath,
    placedAt,
    timeline: { acceptedAt, readyAt, assignedAt, arriveRestaurantAt, pickedUpAt, deliveredAt },
    cancelledAt: null,
  };
  orders[order.id] = order;
  save();
  return order;
}

// What the owner of an order sees (never the device id of anyone else).
function view(order) {
  const { deviceId, ...rest } = orderSnapshot(order);
  if (order.gps && tls) {
    const lan = Object.values(os.networkInterfaces()).flat().find((n) => n.family === 'IPv4' && !n.internal);
    if (lan) rest.phoneBase = `https://${lan.address}:${HTTPS_PORT}`;
  }
  return rest;
}

// ---------- Real GPS couriers ----------

function keyMatches(order, given) {
  if (!order?.gps || typeof given !== 'string') return false;
  const a = Buffer.from(order.gps.key);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handleCourier(req, res, id, action) {
  const order = orders[id];
  if (!keyMatches(order, req.headers['x-courier-key'])) return json(res, 404, { error: 'This courier link is not valid.' });
  let body;
  try {
    body = req.method === 'POST' ? await readBody(req) : null;
  } catch (err) {
    return json(res, 400, { error: err.message });
  }
  const { gps } = order;
  if (req.method === 'POST') {
    if (!orderSnapshot(order).active) return json(res, 409, { error: 'This delivery has finished.' });
    if (action === 'location') {
      const { lat, lng, accuracy } = body ?? {};
      if (!(Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180))
        return json(res, 400, { error: 'Invalid location.' });
      gps.trail.push({ lat, lng, accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null, at: Date.now() });
      if (gps.trail.length > 100) gps.trail.shift();
    } else if (action === 'pickup' && !gps.pickedUpAt) {
      gps.pickedUpAt = Date.now();
    } else if (action === 'deliver' && gps.pickedUpAt) {
      gps.deliveredAt = Date.now();
      gps.trail = []; // don't keep anyone's movements after the delivery
    } else return json(res, 409, { error: 'That step is not available now.' });
    save();
    pushNow(order.id);
  } else if (req.method !== 'GET' || action) return json(res, 404, { error: 'Not found.' });
  return json(res, 200, { status: orderSnapshot(order).status, restaurant: order.restaurant.name, address: order.address.line, note: order.note });
}

// ---------- HTTP ----------

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 16 * 1024) {
        reject(new Error('Request too large.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('Invalid JSON.'));
      }
    });
  });
}

function validDevice(id) {
  return typeof id === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(id);
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const device = req.headers['x-device-id'];
  const address = addressById.get(url.searchParams.get('address')) ?? ADDRESSES[0];

  if (req.method === 'GET' && parts[0] === 'restaurants' && parts.length === 1) {
    return json(res, 200, RESTAURANTS.map((r) => summary(r, address)));
  }
  if (req.method === 'GET' && parts[0] === 'restaurants' && parts.length === 2) {
    const r = byId.get(parts[1]);
    if (!r) return json(res, 404, { error: 'Restaurant not found.' });
    return json(res, 200, { ...summary(r, address), menu: r.menu });
  }

  if (parts[0] === 'courier' && parts[1]) return handleCourier(req, res, parts[1], parts[2]);

  if (parts[0] === 'orders') {
    if (!validDevice(device)) return json(res, 400, { error: 'Missing device id.' });

    if (req.method === 'GET' && parts.length === 1) {
      const mine = Object.values(orders)
        .filter((o) => o.deviceId === device)
        .sort((a, b) => b.placedAt - a.placedAt)
        .slice(0, 50)
        .map(view);
      return json(res, 200, mine);
    }
    if (req.method === 'POST' && parts.length === 1) {
      try {
        return json(res, 201, view(createOrder(device, await readBody(req))));
      } catch (err) {
        return json(res, 400, { error: err.message });
      }
    }

    const order = orders[parts[1]];
    // Someone else's order looks exactly like one that doesn't exist.
    if (!order || order.deviceId !== device) return json(res, 404, { error: 'Order not found.' });

    if (req.method === 'GET' && parts.length === 2) return json(res, 200, view(order));
    if (req.method === 'POST' && parts[2] === 'gps') {
      if (!order.gps) {
        if (!orderSnapshot(order).canCancel) return json(res, 409, { error: 'Real GPS has to be turned on before pickup.' });
        order.gps = { key: randomBytes(24).toString('hex'), trail: [], pickedUpAt: null, deliveredAt: null };
        save();
        pushNow(order.id);
      }
      return json(res, 200, view(order));
    }
    if (req.method === 'POST' && parts[2] === 'cancel') {
      if (!orderSnapshot(order).canCancel) return json(res, 409, { error: 'Your courier already has the food, so it can’t be cancelled now.' });
      order.cancelledAt = Date.now();
      if (order.gps) order.gps.trail = [];
      save();
      pushNow(order.id);
      return json(res, 200, view(order));
    }
  }
  return json(res, 404, { error: 'Not found.' });
}

function onRequest(req, res) {
  let url;
  try {
    url = new URL(req.url, 'http://x');
  } catch {
    return res.writeHead(400).end();
  }
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((err) => json(res, 500, { error: err.message }));
    return;
  }

  let file;
  try {
    file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
  } catch {
    return res.writeHead(400).end();
  }
  if (!file.startsWith(DIST + path.sep)) return res.writeHead(403).end();
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Run `npm run build` first, or use `npm run dev`.');
    const cache = file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': cache }).end(data);
  });
}

const server = http.createServer(onRequest);
const secureServer = tls && https.createServer(tls, onRequest);

// ---------- Live tracking ----------

const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
for (const s of [server, secureServer].filter(Boolean)) {
  s.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws') return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
}

function sendOrder(ws, order) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'order', order: view(order) }));
}

function pushNow(orderId) {
  for (const ws of wss.clients) if (ws.watching?.has(orderId)) sendOrder(ws, orders[orderId]);
}

wss.on('connection', (ws) => {
  ws.watching = new Map(); // orderId -> last status sent
  ws.isAlive = true;
  // Without a listener, one bad or oversized frame would crash the whole server.
  ws.on('error', (err) => console.warn('Dropped a tracking connection:', err.message));
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg?.type !== 'watch' || typeof msg.orderId !== 'string') return;
    const order = orders[msg.orderId];
    if (!order || !validDevice(msg.deviceId) || order.deviceId !== msg.deviceId) {
      ws.send(JSON.stringify({ type: 'error', orderId: msg.orderId, error: 'Order not found.' }));
      return;
    }
    if (ws.watching.size >= 10) ws.watching.delete(ws.watching.keys().next().value);
    ws.watching.set(order.id, null);
    sendOrder(ws, order);
  });
});

// Twice a second, send every watcher the latest position of their active orders.
setInterval(() => {
  const now = Date.now();
  for (const ws of wss.clients) {
    for (const [id, lastStatus] of ws.watching) {
      const order = orders[id];
      if (!order) continue;
      const snap = orderSnapshot(order, now);
      // Finished orders get one final update, then we stop sending.
      if (!snap.active && lastStatus === snap.status) continue;
      ws.watching.set(id, snap.status);
      sendOrder(ws, order);
    }
  }
}, TICK_MS);

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);

secureServer?.listen(HTTPS_PORT, () => console.log(`Forkfly HTTPS (for phone GPS) on port ${HTTPS_PORT}`));
server.listen(PORT, () => console.log(`Forkfly server on http://localhost:${PORT}`));
