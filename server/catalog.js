// Restaurants and menus, as customers see them.

import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, schema } from './db/index.js';
import { deliveryFee, distanceKm, estimateMinutes } from '../shared/core.js';

const { restaurant: restaurantTable, menuItem } = schema;

// Customers can see restaurants that are open, or paused for a while (shown as closed).
const VISIBLE = ['active', 'paused'];

export function menuView(m) {
  return {
    id: m.id,
    category: m.category,
    name: m.name,
    desc: m.description,
    price: m.price,
    image: m.image,
    popular: m.popular,
    veg: m.veg,
    spicy: m.spicy,
  };
}

export async function loadRestaurants(ids) {
  const where = ids ? and(inArray(restaurantTable.status, VISIBLE), inArray(restaurantTable.id, ids)) : inArray(restaurantTable.status, VISIBLE);
  const rows = await db.select().from(restaurantTable).where(where).orderBy(asc(restaurantTable.createdAt), asc(restaurantTable.id));
  if (!rows.length) return [];
  const items = await db
    .select()
    .from(menuItem)
    .where(and(inArray(menuItem.restaurantId, rows.map((r) => r.id)), eq(menuItem.available, true)))
    .orderBy(asc(menuItem.position), asc(menuItem.createdAt));
  return rows.map((r) => ({ ...r, open: r.status === 'active', menu: items.filter((m) => m.restaurantId === r.id).map(menuView) }));
}

export async function loadRestaurant(id) {
  if (typeof id !== 'string' || id.length > 64) return null;
  return (await loadRestaurants([id]))[0] ?? null;
}

export function summary(r, address) {
  const km = distanceKm(r, address);
  return {
    id: r.id,
    name: r.name,
    cuisine: r.cuisine,
    description: r.description,
    coverImage: r.coverImage,
    colors: r.colors,
    rating: r.rating,
    reviews: r.reviews,
    priceLevel: r.priceLevel,
    open: r.open,
    x: r.x,
    y: r.y,
    km: Math.round(km * 100) / 100,
    deliveryFee: deliveryFee(km),
    eta: estimateMinutes(r, address),
    dishes: r.menu.map((m) => m.name),
  };
}
