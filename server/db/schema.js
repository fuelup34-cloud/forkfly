// Database tables. Column names are written in camelCase here and stored as snake_case
// (see `casing` in server/db/index.js and drizzle.config.js).
//
// After changing this file: `npm run db:generate` writes a migration, `npm run db:migrate` applies it.

import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp } from 'drizzle-orm/pg-core';

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------- Accounts (the tables Better Auth expects) ----------

export const user = pgTable(
  'user',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    // 'customer' or 'admin'. Restaurant staff and riders are customers too; what else they
    // can do comes from restaurant_member and rider, so one person can be both.
    role: text().notNull().default('customer'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check('user_role_check', sql`${t.role} in ('customer', 'admin')`)]
);

export const session = pgTable(
  'session',
  {
    id: text().primaryKey(),
    token: text().notNull().unique(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('session_user_idx').on(t.userId)]
);

export const account = pgTable(
  'account',
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(), // a hash, never the password itself
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('account_user_idx').on(t.userId)]
);

export const verification = pgTable(
  'verification',
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)]
);

// ---------- Restaurants ----------

export const restaurant = pgTable(
  'restaurant',
  {
    id: text().primaryKey(), // a slug used in links, like "ember-oak"
    name: text().notNull(),
    cuisine: text().notNull(),
    emoji: text().notNull().default(''), // no longer shown; kept so old rows stay valid
    description: text().notNull().default(''),
    // A photo URL: our own /uploads/... file, or (for the demo restaurants) an Unsplash photo.
    coverImage: text(),
    colors: jsonb().$type().notNull(), // [from, to], used when there's no photo
    timezone: text().notNull().default('America/New_York'), // for "today" on the dashboard
    rating: real().notNull().default(0),
    reviews: integer().notNull().default(0),
    priceLevel: integer().notNull().default(2),
    prepMin: integer().notNull().default(12), // usual kitchen time in real minutes
    x: integer().notNull(), // position on the demo city grid
    y: integer().notNull(),
    // true for restaurants Forkfly runs itself; false for partners.
    isOwn: boolean().notNull().default(false),
    // pending: applied, not approved yet · active: taking orders · paused: closed for now · suspended: by us
    status: text().notNull().default('pending'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check('restaurant_status_check', sql`${t.status} in ('pending', 'active', 'paused', 'suspended')`)]
);

export const menuItem = pgTable(
  'menu_item',
  {
    restaurantId: text()
      .notNull()
      .references(() => restaurant.id, { onDelete: 'cascade' }),
    id: text().notNull(),
    category: text().notNull(),
    name: text().notNull(),
    description: text().notNull().default(''),
    price: integer().notNull(), // cents
    emoji: text().notNull().default(''), // no longer shown
    image: text(), // /uploads/... — only the restaurant's own photos, never stock images
    popular: boolean().notNull().default(false),
    veg: boolean().notNull().default(false),
    spicy: boolean().notNull().default(false),
    available: boolean().notNull().default(true), // false = sold out today
    position: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.restaurantId, t.id] }), check('menu_item_price_check', sql`${t.price} >= 0`)]
);

// Who can manage a restaurant's dashboard.
export const restaurantMember = pgTable(
  'restaurant_member',
  {
    restaurantId: text()
      .notNull()
      .references(() => restaurant.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text().notNull().default('staff'), // owner: everything · staff: orders and menu availability
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.restaurantId, t.userId] }),
    index('restaurant_member_user_idx').on(t.userId),
    check('restaurant_member_role_check', sql`${t.role} in ('owner', 'staff')`),
  ]
);

// ---------- Riders ----------

export const rider = pgTable(
  'rider',
  {
    userId: text()
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    // pending: applied · approved: can take deliveries · suspended: by us
    status: text().notNull().default('pending'),
    vehicle: text().notNull().default('Bicycle'),
    phone: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check('rider_status_check', sql`${t.status} in ('pending', 'approved', 'suspended')`)]
);

// ---------- Orders ----------

export const order = pgTable(
  'order',
  {
    id: text().primaryKey(),
    // Kept (as null) if the customer deletes their account, so restaurant records stay complete.
    customerId: text().references(() => user.id, { onDelete: 'set null' }),
    restaurantId: text()
      .notNull()
      .references(() => restaurant.id),
    riderId: text().references(() => rider.userId, { onDelete: 'set null' }), // set once real dispatch exists
    total: integer().notNull(), // cents, copied from pricing for quick reporting
    placedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp({ withTimezone: true }),
    rejectedAt: timestamp({ withTimezone: true }), // the restaurant couldn't take it
    rejectReason: text(),
    // Snapshots taken when the order was placed, so later menu or name changes don't rewrite history.
    restaurantSnapshot: jsonb().$type().notNull(),
    address: jsonb().$type().notNull(),
    items: jsonb().$type().notNull(),
    pricing: jsonb().$type().notNull(),
    km: real().notNull(),
    note: text().notNull().default(''),
    // The simulated delivery plan (demo couriers move along these paths on this schedule).
    courier: jsonb().$type().notNull(),
    speed: real().notNull(),
    pickupPath: jsonb().$type().notNull(),
    dropPath: jsonb().$type().notNull(),
    timeline: jsonb().$type().notNull(),
    // Set when a real courier shares GPS from their phone. Holds the link key and recent trail.
    gps: jsonb().$type(),
  },
  (t) => [
    index('order_customer_idx').on(t.customerId, t.placedAt),
    index('order_restaurant_idx').on(t.restaurantId, t.placedAt),
    index('order_rider_idx').on(t.riderId),
  ]
);
