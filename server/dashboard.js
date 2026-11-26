// The restaurant dashboard API: /api/dash/<restaurant-id>/...
//
// Owners can change everything. Staff can run orders, pause the restaurant and mark items
// sold out, but not edit the menu, profile or team. Forkfly admins act as owners.

import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, max, sql } from 'drizzle-orm';
import { db, schema } from './db/index.js';
import { HttpError, cleanText, intIn, json, readBody } from './http.js';
import { UPLOAD_URL } from './uploads.js';
import { acceptOrder, addPrepTime, fromRowCached, getOrder, kitchenView, liveKitchenOrders, markReady, rejectOrder, withCustomerLabels } from './orders.js';

const { restaurant: restaurantTable, menuItem, restaurantMember, user: userTable, order: orderTable } = schema;

export async function membership(user, restaurantId) {
  if (typeof restaurantId !== 'string' || restaurantId.length > 64) return null;
  const [r] = await db.select().from(restaurantTable).where(eq(restaurantTable.id, restaurantId));
  if (!r) return null;
  const [m] = await db
    .select({ role: restaurantMember.role })
    .from(restaurantMember)
    .where(and(eq(restaurantMember.restaurantId, restaurantId), eq(restaurantMember.userId, user.id)));
  if (!m && user.role !== 'admin') return null;
  return { restaurant: r, role: m?.role ?? 'owner' };
}

async function onlyOwnerIs(restaurantId, userId) {
  const owners = await db
    .select({ id: restaurantMember.userId })
    .from(restaurantMember)
    .where(and(eq(restaurantMember.restaurantId, restaurantId), eq(restaurantMember.role, 'owner')));
  return owners.length === 1 && owners[0].id === userId;
}

function profile(r, role) {
  return {
    id: r.id,
    name: r.name,
    cuisine: r.cuisine,
    description: r.description,
    coverImage: r.coverImage,
    colors: r.colors,
    prepMin: r.prepMin,
    priceLevel: r.priceLevel,
    status: r.status,
    statusNote: r.statusNote,
    phone: r.phone ?? '',
    isOwn: r.isOwn,
    timezone: r.timezone,
    role,
  };
}

function itemView(m) {
  return {
    id: m.id,
    category: m.category,
    name: m.name,
    description: m.description,
    price: m.price,
    image: m.image,
    popular: m.popular,
    veg: m.veg,
    spicy: m.spicy,
    available: m.available,
    position: m.position,
  };
}

const optionalImage = (v) => {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || !UPLOAD_URL.test(v)) throw new HttpError(400, 'Upload the photo first.');
  return v;
};

function menuFields(body, { partial }) {
  const out = {};
  const has = (k) => Object.hasOwn(body ?? {}, k);
  if (!partial || has('name')) out.name = cleanText(body.name, { min: 1, max: 80, label: 'Name' });
  if (!partial || has('description')) out.description = cleanText(body.description, { max: 300, label: 'Description' });
  if (!partial || has('category')) out.category = cleanText(body.category, { min: 1, max: 40, label: 'Category' });
  if (!partial || has('price')) out.price = intIn(body.price, { min: 0, max: 100_000, label: 'Price (in cents)' });
  if (has('image')) out.image = optionalImage(body.image);
  for (const flag of ['popular', 'veg', 'spicy', 'available']) if (has(flag)) out[flag] = !!body[flag];
  return out;
}

async function todaySummary(r) {
  // "Today" in the restaurant's own time zone.
  const startOfDay = sql`(date_trunc('day', now() at time zone ${r.timezone}) at time zone ${r.timezone})`;
  const rows = await db
    .select()
    .from(orderTable)
    .where(and(eq(orderTable.restaurantId, r.id), gte(orderTable.placedAt, startOfDay)))
    .orderBy(desc(orderTable.placedAt))
    .limit(300);
  const orders = await withCustomerLabels(rows.map(fromRowCached));
  const now = Date.now();
  const views = orders.map((o) => kitchenView(o, now));
  const counted = views.filter((v) => v.status !== 'rejected' && v.status !== 'cancelled');
  const sales = counted.reduce((n, v) => n + v.subtotal, 0);
  return {
    orders: counted.length,
    sales,
    average: counted.length ? Math.round(sales / counted.length) : 0,
    declined: views.filter((v) => v.status === 'rejected').length,
    history: views.filter((v) => !['new', 'preparing', 'ready'].includes(v.status)).slice(0, 100),
  };
}

export async function handleDashboard(req, res, user, parts) {
  const [rid, section, sub, action] = parts;
  const access = await membership(user, rid);
  // Someone else's restaurant looks exactly like one that doesn't exist.
  if (!access) throw new HttpError(404, 'Restaurant not found.');
  const { restaurant: r, role } = access;
  const owner = role === 'owner';
  const ownerOnly = () => {
    if (!owner) throw new HttpError(403, 'Only the owner can change this.');
  };
  const m = req.method;

  // ----- Profile and opening -----
  if (!section) {
    if (m === 'GET') return json(res, 200, profile(r, role));
    if (m === 'PATCH') {
      ownerOnly();
      const body = await readBody(req);
      const has = (k) => Object.hasOwn(body, k);
      const set = {};
      if (has('name')) set.name = cleanText(body.name, { min: 2, max: 60, label: 'Restaurant name' });
      if (has('cuisine')) set.cuisine = cleanText(body.cuisine, { min: 2, max: 30, label: 'Cuisine' });
      if (has('description')) set.description = cleanText(body.description, { max: 300, label: 'Description', multiline: true });
      if (has('prepMin')) set.prepMin = intIn(body.prepMin, { min: 5, max: 90, label: 'Usual prep time' });
      if (has('priceLevel')) set.priceLevel = intIn(body.priceLevel, { min: 1, max: 4, label: 'Price level' });
      if (has('coverImage')) set.coverImage = optionalImage(body.coverImage);
      if (has('phone')) {
        const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
        if (!/^\+?[0-9 ().-]{7,20}$/.test(phone)) throw new HttpError(400, 'Enter a phone number Forkfly can reach you on.');
        set.phone = phone;
      }
      if (!Object.keys(set).length) return json(res, 200, profile(r, role));
      const [updated] = await db.update(restaurantTable).set(set).where(eq(restaurantTable.id, r.id)).returning();
      return json(res, 200, profile(updated, role));
    }
  }

  if (section === 'status' && m === 'POST') {
    const { open } = await readBody(req);
    if (r.status === 'pending') throw new HttpError(409, 'You can open once Forkfly approves your restaurant.');
    if (r.status === 'suspended') throw new HttpError(409, 'This restaurant is suspended. Please contact Forkfly.');
    const [updated] = await db
      .update(restaurantTable)
      .set({ status: open ? 'active' : 'paused' })
      .where(eq(restaurantTable.id, r.id))
      .returning();
    return json(res, 200, profile(updated, role));
  }

  // ----- Menu -----
  if (section === 'menu') {
    if (m === 'GET' && !sub) {
      const items = await db.select().from(menuItem).where(eq(menuItem.restaurantId, r.id)).orderBy(asc(menuItem.position), asc(menuItem.createdAt));
      return json(res, 200, items.map(itemView));
    }
    if (m === 'POST' && !sub) {
      ownerOnly();
      const fields = menuFields(await readBody(req), { partial: false });
      const [{ top }] = await db.select({ top: max(menuItem.position) }).from(menuItem).where(eq(menuItem.restaurantId, r.id));
      const [created] = await db
        .insert(menuItem)
        .values({ restaurantId: r.id, id: randomUUID().slice(0, 8), available: true, ...fields, position: (top ?? -1) + 1 })
        .returning();
      return json(res, 201, itemView(created));
    }
    if (sub && (m === 'PATCH' || m === 'DELETE')) {
      const where = and(eq(menuItem.restaurantId, r.id), eq(menuItem.id, sub));
      if (m === 'DELETE') {
        ownerOnly();
        const gone = await db.delete(menuItem).where(where).returning();
        if (!gone.length) throw new HttpError(404, 'That item no longer exists.');
        return json(res, 200, { ok: true });
      }
      const body = await readBody(req);
      // Staff can mark things sold out and back, nothing else.
      if (!owner && Object.keys(body).some((k) => k !== 'available')) ownerOnly();
      const fields = menuFields(body, { partial: true });
      if (!Object.keys(fields).length) throw new HttpError(400, 'Nothing to change.');
      const [updated] = await db.update(menuItem).set(fields).where(where).returning();
      if (!updated) throw new HttpError(404, 'That item no longer exists.');
      return json(res, 200, itemView(updated));
    }
  }

  // ----- Orders -----
  if (section === 'orders') {
    if (m === 'GET' && !sub) return json(res, 200, (await liveKitchenOrders(r.id)).map((o) => kitchenView(o)));
    if (m === 'POST' && sub && action) {
      const order = await getOrder(sub);
      if (!order || order.restaurantId !== r.id) throw new HttpError(404, 'Order not found.');
      const body = await readBody(req);
      if (action === 'accept') await acceptOrder(order, body);
      else if (action === 'reject') await rejectOrder(order, body);
      else if (action === 'ready') await markReady(order);
      else if (action === 'delay') await addPrepTime(order, body);
      else throw new HttpError(404, 'Not found.');
      await withCustomerLabels([order]);
      return json(res, 200, kitchenView(order));
    }
  }

  if (section === 'today' && m === 'GET') return json(res, 200, await todaySummary(r));

  // ----- Team -----
  if (section === 'staff') {
    if (m === 'GET') {
      const rows = await db
        .select({ id: userTable.id, name: userTable.name, email: userTable.email, role: restaurantMember.role })
        .from(restaurantMember)
        .innerJoin(userTable, eq(userTable.id, restaurantMember.userId))
        .where(eq(restaurantMember.restaurantId, r.id))
        .orderBy(asc(restaurantMember.createdAt));
      return json(res, 200, rows.map((s) => ({ ...s, you: s.id === user.id })));
    }
    ownerOnly();
    if (m === 'POST' && !sub) {
      const body = await readBody(req);
      const email = cleanText(body.email, { min: 3, max: 254, label: 'Email' }).toLowerCase();
      const memberRole = body.role === 'owner' ? 'owner' : 'staff';
      const [u] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, email));
      if (!u) throw new HttpError(404, 'No Forkfly account uses that email. Ask them to sign up first, then add them.');
      if (memberRole === 'staff' && (await onlyOwnerIs(r.id, u.id))) throw new HttpError(409, 'A restaurant needs at least one owner.');
      await db
        .insert(restaurantMember)
        .values({ restaurantId: r.id, userId: u.id, role: memberRole })
        .onConflictDoUpdate({ target: [restaurantMember.restaurantId, restaurantMember.userId], set: { role: memberRole } });
      return json(res, 201, { ok: true });
    }
    if (m === 'DELETE' && sub) {
      if (await onlyOwnerIs(r.id, sub)) throw new HttpError(409, 'A restaurant needs at least one owner.');
      await db.delete(restaurantMember).where(and(eq(restaurantMember.restaurantId, r.id), eq(restaurantMember.userId, sub)));
      return json(res, 200, { ok: true });
    }
  }

  throw new HttpError(404, 'Not found.');
}
