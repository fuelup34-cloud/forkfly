// Forkfly server.
//
//   • /api/auth/...  accounts: sign up, sign in, sign out (Better Auth)
//   • /api/...       restaurants, menus and orders (JSON over HTTP), stored in Postgres
//   • /api/dash/...  the restaurant dashboard (see dashboard.js)
//   • /api/admin/... the Forkfly admin dashboard (see admin.js)
//   • /uploads/...   restaurant photos
//   • /ws            live updates: order tracking for customers, the order board for kitchens
//   • serves the built site from dist/ when you run `npm start`
//
// Prices are always recalculated here, so the app can't be tricked into charging less.

import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { and, asc, desc, eq } from 'drizzle-orm';
import { toNodeHandler } from 'better-auth/node';
import { db, schema } from './db/index.js';
import { auth, getSession, TRUSTED_ORIGINS } from './auth.js';
import { HttpError, cleanText, json, readBody, readRaw } from './http.js';
import { loadRestaurant, loadRestaurants, summary } from './catalog.js';
import {
  cache,
  createOrder,
  customerCancel,
  declineUnanswered,
  fromRowCached,
  getOrder,
  hasPendingWrite,
  kitchenView,
  liveKitchenOrders,
  loadWaiting,
  orderEvents,
  persist,
  REJECT_REASONS,
} from './orders.js';
import { handleDashboard, membership } from './dashboard.js';
import { handleAdmin } from './admin.js';
import { loadSettings, publicConfig, settings } from './settings.js';
import { handleUpload, serveUpload } from './uploads.js';
import { completeCheckout, handleStripeWebhook, paymentConfig, paymentsEnabled, startCheckout } from './payments.js';
import { ADDRESSES, CITY_SIZE, GRID, VEHICLES, kitchenStatus, orderSnapshot } from '../shared/core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3002;
const DIST = path.join(HERE, '..', 'dist');
const TICK_MS = 500;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 5443;
const CERT_DIR = process.env.CERT_DIR || path.join(HERE, '..', '.certs');
// Behind a hosting proxy, the visitor's address arrives in X-Forwarded-For. Locally it doesn't,
// and trusting it would let anyone dodge the sign-in rate limit by making one up.
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
const tls = fs.existsSync(path.join(CERT_DIR, 'key.pem'))
  ? { key: fs.readFileSync(path.join(CERT_DIR, 'key.pem')), cert: fs.readFileSync(path.join(CERT_DIR, 'cert.pem')) }
  : null;

const addressById = new Map(ADDRESSES.map((a) => [a.id, a]));
const authHandler = toNodeHandler(auth);
const { restaurant: restaurantTable, restaurantMember, rider: riderTable, order: orderTable } = schema;

// What the customer sees (never anyone's account id).
function view(order) {
  const { customerId, customerLabel, commission, riderId, ...rest } = orderSnapshot(order);
  if (order.rejectReason) rest.rejectReason = REJECT_REASONS[order.rejectReason];
  if (order.payment) {
    const { intentId, ...payment } = order.payment;
    rest.payment = payment;
  }
  if (order.gps && tls) {
    const lan = Object.values(os.networkInterfaces()).flat().find((n) => n.family === 'IPv4' && !n.internal);
    if (lan) rest.phoneBase = `https://${lan.address}:${HTTPS_PORT}`;
  }
  return rest;
}

// Rules and fees, plus what the browser needs to take payment (null = demo checkout, no payment).
const clientConfig = () => ({ ...publicConfig(), payments: paymentConfig() });

// ---------- Accounts ----------

async function me(user) {
  const restaurants = await db
    .select({ id: restaurantTable.id, name: restaurantTable.name, colors: restaurantTable.colors, coverImage: restaurantTable.coverImage, status: restaurantTable.status, role: restaurantMember.role })
    .from(restaurantMember)
    .innerJoin(restaurantTable, eq(restaurantTable.id, restaurantMember.restaurantId))
    .where(eq(restaurantMember.userId, user.id))
    .orderBy(asc(restaurantTable.name));
  const [rider] = await db.select({ status: riderTable.status, vehicle: riderTable.vehicle, note: riderTable.statusNote }).from(riderTable).where(eq(riderTable.userId, user.id));
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    restaurants,
    rider: rider ?? null,
    config: clientConfig(),
  };
}

// ---------- Joining as a restaurant partner or rider ----------
//
// Both start as "pending" and do nothing until an admin approves them on the admin dashboard
// (or with `npm run manage -- approve-restaurant <id>` / `approve-rider <email>`). Riders are
// approved straight away if an admin turned on "Approve rider applications automatically".

const BRAND_COLORS = [
  ['#f97316', '#b45309'],
  ['#ef4444', '#991b1b'],
  ['#0ea5e9', '#1d4ed8'],
  ['#22c55e', '#15803d'],
  ['#a855f7', '#6d28d9'],
  ['#ec4899', '#be185d'],
  ['#14b8a6', '#0f766e'],
];

const PHONE = /^\+?[0-9 ().-]{7,20}$/;

async function applyRestaurant(user, body) {
  const name = cleanText(body?.name, { min: 2, max: 60, label: 'Restaurant name' });
  const cuisine = cleanText(body?.cuisine, { min: 2, max: 30, label: 'Cuisine' });
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  if (!PHONE.test(phone)) throw new HttpError(400, 'Enter a phone number we can reach the restaurant on.');
  const owned = await db
    .select({ id: restaurantMember.restaurantId })
    .from(restaurantMember)
    .where(and(eq(restaurantMember.userId, user.id), eq(restaurantMember.role, 'owner')));
  if (owned.length >= 5) throw new HttpError(409, 'You already have 5 restaurants. Contact us to add more.');

  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'restaurant';
  const cell = () => GRID * (1 + Math.floor(Math.random() * (CITY_SIZE / GRID - 1)));
  return db.transaction(async (tx) => {
    let id = base;
    for (let n = 2; (await tx.select({ id: restaurantTable.id }).from(restaurantTable).where(eq(restaurantTable.id, id))).length; n++) id = `${base}-${n}`;
    // Until real addresses arrive, a new restaurant gets a spot on the demo city grid.
    await tx.insert(restaurantTable).values({
      id,
      name,
      cuisine,
      colors: BRAND_COLORS[Math.floor(Math.random() * BRAND_COLORS.length)],
      x: cell(),
      y: cell(),
      phone,
      status: 'pending',
      commission: settings().commission,
    });
    await tx.insert(restaurantMember).values({ restaurantId: id, userId: user.id, role: 'owner' });
    return { id, name, status: 'pending' };
  });
}

async function applyRider(user, body) {
  const vehicle = VEHICLES.includes(body?.vehicle) ? body.vehicle : null;
  if (!vehicle) throw new HttpError(400, 'Pick how you’ll deliver.');
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  if (!PHONE.test(phone)) throw new HttpError(400, 'Enter a phone number we can reach you on.');
  const [existing] = await db.select().from(riderTable).where(eq(riderTable.userId, user.id));
  if (existing) throw new HttpError(409, 'You’ve already applied to ride.');
  const status = settings().autoApproveRiders ? 'approved' : 'pending';
  await db.insert(riderTable).values({ userId: user.id, vehicle, phone, status });
  return { status, vehicle };
}

// ---------- Real GPS couriers ----------

function keyMatches(order, given) {
  if (!order?.gps || typeof given !== 'string') return false;
  const a = Buffer.from(order.gps.key);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handleCourier(req, res, id, action) {
  const order = await getOrder(id);
  if (!keyMatches(order, req.headers['x-courier-key'])) return json(res, 404, { error: 'This courier link is not valid.' });
  const body = req.method === 'POST' ? await readBody(req) : null;
  const { gps } = order;
  if (req.method === 'POST') {
    const snap = orderSnapshot(order);
    if (!snap.active) return json(res, 409, { error: 'This delivery has finished.' });
    if (action === 'location') {
      const { lat, lng, accuracy } = body ?? {};
      if (!(Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180))
        return json(res, 400, { error: 'Invalid location.' });
      gps.trail.push({ lat, lng, accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null, at: Date.now() });
      if (gps.trail.length > 100) gps.trail.shift();
    } else if (action === 'pickup' && !gps.pickedUpAt) {
      if (snap.status === 'placed') return json(res, 409, { error: 'The restaurant hasn’t accepted this order yet.' });
      gps.pickedUpAt = Date.now();
    } else if (action === 'deliver' && gps.pickedUpAt) {
      gps.deliveredAt = Date.now();
      gps.trail = []; // don't keep anyone's movements after the delivery
    } else return json(res, 409, { error: 'That step is not available now.' });
    await persist(order, ['gps']);
  } else if (req.method !== 'GET' || action) return json(res, 404, { error: 'Not found.' });
  return json(res, 200, { status: orderSnapshot(order).status, restaurant: order.restaurant.name, address: order.address.line, note: order.note });
}

// ---------- HTTP ----------

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

// Sign-in cookies are sent with every request, so a change (anything but GET) is only accepted
// from our own pages. Otherwise another website could place or cancel orders as you.
function fromTrustedPage(req) {
  const origin = req.headers.origin;
  return typeof origin === 'string' && TRUSTED_ORIGINS.includes(origin);
}

async function requireUser(req) {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'Please sign in first.');
  return session.user;
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const address = addressById.get(url.searchParams.get('address')) ?? ADDRESSES[0];
  // Stripe's server calls this (signed with the webhook secret), so it skips the same-page check.
  if (req.method === 'POST' && parts[0] === 'stripe' && parts[1] === 'webhook' && parts.length === 2) {
    const raw = await readRaw(req, 512 * 1024);
    return json(res, 200, await handleStripeWebhook(raw, req.headers['stripe-signature']));
  }
  if (req.method !== 'GET' && !fromTrustedPage(req)) return json(res, 403, { error: 'Requests must come from the Forkfly app.' });

  if (req.method === 'GET' && parts[0] === 'restaurants' && parts.length === 1) {
    // Open restaurants first. A newly approved one shows up once it has something to sell.
    const list = (await loadRestaurants()).filter((r) => r.menu.length > 0).map((r) => summary(r, address));
    return json(res, 200, list.sort((a, b) => Number(b.open) - Number(a.open)));
  }
  if (req.method === 'GET' && parts[0] === 'restaurants' && parts.length === 2) {
    const r = await loadRestaurant(parts[1]);
    if (!r) return json(res, 404, { error: 'Restaurant not found.' });
    return json(res, 200, { ...summary(r, address), menu: r.menu });
  }

  if (req.method === 'GET' && parts[0] === 'me' && parts.length === 1) {
    const session = await getSession(req);
    return json(res, 200, session ? await me(session.user) : { user: null, restaurants: [], rider: null, config: clientConfig() });
  }

  if (req.method === 'POST' && parts[0] === 'apply' && parts.length === 2) {
    const user = await requireUser(req);
    if (parts[1] === 'restaurant') return json(res, 201, await applyRestaurant(user, await readBody(req)));
    if (parts[1] === 'rider') return json(res, 201, await applyRider(user, await readBody(req)));
  }

  if (req.method === 'POST' && parts[0] === 'uploads' && parts.length === 1) return handleUpload(req, res, await requireUser(req));

  if (parts[0] === 'dash' && parts[1]) return handleDashboard(req, res, await requireUser(req), parts.slice(1));

  if (parts[0] === 'admin' && parts[1]) return handleAdmin(req, res, await requireUser(req), parts.slice(1), url);

  if (parts[0] === 'courier' && parts[1]) return handleCourier(req, res, parts[1], parts[2]);

  if (parts[0] === 'checkout' && req.method === 'POST') {
    const user = await requireUser(req);
    if (parts.length === 1) return json(res, 201, await startCheckout(user, await readBody(req)));
    if (parts[1] === 'complete' && parts.length === 2) return json(res, 200, view(await completeCheckout((await readBody(req)).checkoutId, user.id)));
  }

  if (parts[0] === 'orders') {
    const user = await requireUser(req);

    if (req.method === 'GET' && parts.length === 1) {
      const rows = await db.select().from(orderTable).where(eq(orderTable.customerId, user.id)).orderBy(desc(orderTable.placedAt)).limit(50);
      return json(res, 200, rows.map((row) => view(fromRowCached(row))));
    }
    if (req.method === 'POST' && parts.length === 1) {
      // With payments on, orders are only created by a paid checkout.
      if (paymentsEnabled) return json(res, 402, { error: 'Please pay to place your order.' });
      return json(res, 201, view(await createOrder(user, await readBody(req))));
    }

    const order = await getOrder(parts[1]);
    // Someone else's order looks exactly like one that doesn't exist.
    if (!order || order.customerId !== user.id) return json(res, 404, { error: 'Order not found.' });

    if (req.method === 'GET' && parts.length === 2) return json(res, 200, view(order));
    if (req.method === 'POST' && parts[2] === 'gps') {
      if (!order.gps) {
        if (!orderSnapshot(order).canCancel) return json(res, 409, { error: 'Real GPS has to be turned on before the kitchen starts cooking.' });
        order.gps = { key: randomBytes(24).toString('hex'), trail: [], pickedUpAt: null, deliveredAt: null };
        await persist(order, ['gps']);
      }
      return json(res, 200, view(order));
    }
    if (req.method === 'POST' && parts[2] === 'cancel') {
      await customerCancel(order);
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

  if (url.pathname === '/api/auth' || url.pathname.startsWith('/api/auth/')) {
    if (!TRUST_PROXY) req.headers['x-forwarded-for'] = req.socket.remoteAddress ?? '';
    authHandler(req, res).catch((err) => {
      console.error('Auth error:', err);
      if (!res.headersSent) json(res, 500, { error: 'Sign-in is unavailable right now.' });
    });
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((err) => {
      if (res.headersSent) return;
      if (err instanceof HttpError) return json(res, err.status, { error: err.message });
      // Two identical requests at once (e.g. a double-tapped button) hit a unique key.
      if ((err.cause ?? err).code === '23505') return json(res, 409, { error: 'That was already saved.' });
      console.error('API error:', err);
      json(res, 500, { error: 'Something went wrong on our side. Please try again.' });
    });
    return;
  }
  if (url.pathname.startsWith('/uploads/')) return serveUpload(res, url.pathname.slice('/uploads/'.length));

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
    const cacheControl = file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': cacheControl }).end(data);
  });
}

const server = http.createServer(onRequest);
const secureServer = tls && https.createServer(tls, onRequest);

// ---------- Live updates ----------
//
// Customers send {type:'watch', orderId} and get their order twice a second while it moves.
// Kitchens send {type:'watch-restaurant', restaurantId} and get the full live board whenever
// anything on it changes.

const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
for (const s of [server, secureServer].filter(Boolean)) {
  s.on('upgrade', async (req, socket, head) => {
    socket.on('error', () => {});
    // Browsers send sign-in cookies with WebSockets from any site, so check where it came from.
    if (req.url !== '/ws' || !fromTrustedPage(req)) return socket.destroy();
    const session = await getSession(req);
    if (socket.destroyed) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.user = session?.user ?? null;
      wss.emit('connection', ws, req);
    });
  });
}

const send = (ws, msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));

function sendOrder(ws, order) {
  send(ws, { type: 'order', order: view(order) });
}

// restaurant id -> set of order ids on its live board
const boards = new Map();

async function loadBoard(restaurantId) {
  const live = await liveKitchenOrders(restaurantId);
  boards.set(restaurantId, new Set(live.map((o) => o.id)));
}

function boardPayload(restaurantId, now = Date.now()) {
  const ids = boards.get(restaurantId) ?? new Set();
  const orders = [];
  for (const id of ids) {
    const order = cache.get(id);
    if (!order) continue;
    const v = kitchenView(order, now);
    if (['new', 'preparing', 'ready'].includes(v.status)) orders.push(v);
    else ids.delete(id); // finished: drop it from the board
  }
  return orders;
}

function pushBoard(restaurantId) {
  const now = Date.now();
  let payload;
  for (const ws of wss.clients) {
    if (!ws.restaurants?.has(restaurantId)) continue;
    payload ??= boardPayload(restaurantId, now);
    const text = JSON.stringify(payload.map(({ now: _now, ...o }) => o));
    if (ws.restaurants.get(restaurantId) === text) continue;
    ws.restaurants.set(restaurantId, text);
    send(ws, { type: 'board', restaurantId, orders: payload, now });
  }
}

orderEvents.on('changed', (order) => {
  for (const ws of wss.clients) if (ws.watching?.has(order.id)) sendOrder(ws, order);
  if (order.restaurantId) {
    if (!boards.has(order.restaurantId)) boards.set(order.restaurantId, new Set());
    boards.get(order.restaurantId).add(order.id);
    pushBoard(order.restaurantId);
  }
});

wss.on('connection', (ws) => {
  ws.watching = new Map(); // orderId -> last status sent
  ws.restaurants = new Map(); // restaurantId -> last board sent
  ws.isAlive = true;
  // Without a listener, one bad or oversized frame would crash the whole server.
  ws.on('error', (err) => console.warn('Dropped a live connection:', err.message));
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    try {
      if (msg?.type === 'watch' && typeof msg.orderId === 'string') {
        const order = ws.user ? await getOrder(msg.orderId) : null;
        if (!order || order.customerId !== ws.user.id) return send(ws, { type: 'error', orderId: msg.orderId, error: 'Order not found.' });
        if (ws.watching.size >= 10) ws.watching.delete(ws.watching.keys().next().value);
        ws.watching.set(order.id, null);
        sendOrder(ws, order);
      } else if (msg?.type === 'watch-restaurant' && typeof msg.restaurantId === 'string') {
        const access = ws.user ? await membership(ws.user, msg.restaurantId) : null;
        if (!access) return send(ws, { type: 'error', restaurantId: msg.restaurantId, error: 'Restaurant not found.' });
        if (ws.restaurants.size >= 10) ws.restaurants.delete(ws.restaurants.keys().next().value);
        await loadBoard(access.restaurant.id);
        ws.restaurants.set(access.restaurant.id, null);
        pushBoard(access.restaurant.id);
      }
    } catch (err) {
      console.warn('Live update failed:', err.message);
    }
  });
});

setInterval(() => {
  const now = Date.now();
  const restaurants = new Set();
  for (const ws of wss.clients) {
    // Twice a second, send every customer the latest position of their active orders.
    for (const [id, lastStatus] of ws.watching) {
      const order = cache.get(id);
      if (!order) continue;
      const snap = orderSnapshot(order, now);
      // Finished orders get one final update, then we stop sending.
      if (!snap.active && lastStatus === snap.status) continue;
      ws.watching.set(id, snap.status);
      sendOrder(ws, order);
    }
    for (const id of ws.restaurants.keys()) restaurants.add(id);
  }
  // Boards change on their own too (a courier arrives and takes the bag).
  for (const id of restaurants) pushBoard(id);
}, TICK_MS);

await loadSettings();
await loadWaiting().catch((err) => console.error('Could not load waiting orders:', err.message));
setInterval(() => declineUnanswered(), 15_000);

// Every half minute: drop dead connections, and forget finished orders nobody is watching.
setInterval(() => {
  const watched = new Set();
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
    for (const id of ws.watching.keys()) watched.add(id);
  }
  const now = Date.now();
  for (const [id, order] of cache) {
    if (watched.has(id) || hasPendingWrite(id)) continue;
    const snap = orderSnapshot(order, now);
    if (!snap.active && kitchenStatus(snap) !== 'ready') cache.delete(id);
  }
}, 30_000);

secureServer?.listen(HTTPS_PORT, () => console.log(`Forkfly HTTPS (for phone GPS) on port ${HTTPS_PORT}`));
server.listen(PORT, () => console.log(`Forkfly server on http://localhost:${PORT}`));
