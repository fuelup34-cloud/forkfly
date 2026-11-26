// Test accounts and a partner restaurant, for local development only.
//
//   npm run seed:dev        (also run by `npm run setup`)
//
// Every account below uses the password in TEST_PASSWORD. They exist only in your own local
// database. This repository is public, so never create these accounts on a real server:
// the script refuses to run when NODE_ENV is "production".
//
// Safe to run again: it resets these accounts' passwords and roles to what's listed here.

import { and, eq, sql } from 'drizzle-orm';
import { auth } from '../server/auth.js';
import { db, pool, schema } from '../server/db/index.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to create test accounts in production.');
  process.exit(1);
}

export const TEST_PASSWORD = 'forkfly-test-2026';

const ACCOUNTS = [
  { email: 'admin@example.com', name: 'Avery Admin', role: 'admin', note: 'Forkfly admin' },
  { email: 'owner@example.com', name: 'Ada Owner', restaurant: 'owner', note: "Owner of Mama's Kitchen (full dashboard)" },
  { email: 'staff@example.com', name: 'Sam Staff', restaurant: 'staff', note: "Staff at Mama's Kitchen (orders, pause, sold out)" },
  { email: 'rider@example.com', name: 'Rita Rider', rider: 'approved', note: 'Approved rider' },
  { email: 'customer@example.com', name: 'Casey Customer', note: 'Customer with no other roles' },
];

const RESTAURANT = {
  id: 'mama-s-kitchen',
  name: "Mama's Kitchen",
  cuisine: 'Nigerian',
  description: 'West African home cooking: smoky jollof, suya and stews made the way Mama does.',
  colors: ['#a855f7', '#6d28d9'],
  prepMin: 20,
  phone: '+1 555 010 0142',
  x: 800,
  y: 300,
  status: 'active',
};
const MENU = [
  { id: 'jollof', category: 'Mains', name: 'Jollof rice', description: 'Smoky party jollof with fried plantain.', price: 1450, popular: true },
  { id: 'egusi', category: 'Mains', name: 'Egusi soup with pounded yam', description: 'Melon seed stew with spinach and assorted meat.', price: 1750 },
  { id: 'suya', category: 'Starters', name: 'Suya skewers', description: 'Spiced beef, onions, yaji.', price: 900, spicy: true },
  { id: 'puff-puff', category: 'Starters', name: 'Puff-puff (6)', description: 'Warm, sweet fried dough.', price: 550, veg: true },
  { id: 'chapman', category: 'Drinks', name: 'Chapman', description: 'Fruity, fizzy and bitter-sweet.', price: 450, veg: true },
];

const { user, account, restaurant, menuItem, restaurantMember, rider } = schema;

async function ensureUser({ email, name }) {
  let [u] = await db.select().from(user).where(eq(user.email, email));
  if (!u) {
    await auth.api.signUpEmail({ body: { email, name, password: TEST_PASSWORD } });
    [u] = await db.select().from(user).where(eq(user.email, email));
  } else {
    // Already there (maybe with another password): put it back to the documented one.
    const ctx = await auth.$context;
    const hash = await ctx.password.hash(TEST_PASSWORD);
    await db.update(account).set({ password: hash }).where(and(eq(account.userId, u.id), eq(account.providerId, 'credential')));
    await db.update(user).set({ name }).where(eq(user.id, u.id));
  }
  // Test accounts skip the emailed code, so they can sign in straight away.
  if (!u.emailVerified) await db.update(user).set({ emailVerified: true }).where(eq(user.id, u.id));
  return u;
}

try {
  // The restaurant first, so its staff can be attached to it.
  await db
    .insert(restaurant)
    .values(RESTAURANT)
    .onConflictDoUpdate({ target: restaurant.id, set: { status: 'active', statusNote: '', cuisine: RESTAURANT.cuisine, phone: sql`coalesce(${restaurant.phone}, excluded.phone)` } });
  // Add any dish that isn't on the menu yet (matched by name, so edits made in the dashboard stay).
  const existing = new Set((await db.select({ name: menuItem.name }).from(menuItem).where(eq(menuItem.restaurantId, RESTAURANT.id))).map((m) => m.name));
  for (const [i, m] of MENU.entries()) {
    if (existing.has(m.name)) continue;
    await db
      .insert(menuItem)
      .values({ restaurantId: RESTAURANT.id, position: i, ...m })
      .onConflictDoNothing();
  }

  for (const a of ACCOUNTS) {
    const u = await ensureUser(a);
    await db.update(user).set({ role: a.role ?? 'customer' }).where(eq(user.id, u.id));
    if (a.restaurant) {
      await db
        .insert(restaurantMember)
        .values({ restaurantId: RESTAURANT.id, userId: u.id, role: a.restaurant })
        .onConflictDoUpdate({ target: [restaurantMember.restaurantId, restaurantMember.userId], set: { role: a.restaurant } });
    }
    if (a.rider) {
      await db
        .insert(rider)
        .values({ userId: u.id, status: a.rider, vehicle: 'E-bike', phone: '+1 555 010 0199' })
        .onConflictDoUpdate({ target: rider.userId, set: { status: a.rider } });
    }
  }

  console.log(`Test accounts ready (password for all: ${TEST_PASSWORD}):`);
  for (const a of ACCOUNTS) console.log(`  ${a.email.padEnd(22)} ${a.note}`);
} catch (err) {
  console.error('Could not create test accounts:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
