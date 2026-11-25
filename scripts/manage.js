// Admin tasks from the terminal, until the admin dashboard exists.
//
//   npm run manage -- make-admin <email>
//   npm run manage -- own-restaurant <restaurant-id>           mark a restaurant as one Forkfly runs
//   npm run manage -- approve-restaurant <restaurant-id>       let a partner start taking orders
//   npm run manage -- approve-rider <email>
//   npm run manage -- add-member <restaurant-id> <email> [owner|staff]
//   npm run manage -- add-rider <email> [vehicle]              add an approved rider
//   npm run manage -- list
import { and, eq } from 'drizzle-orm';
import { db, pool, schema } from '../server/db/index.js';

const { user, restaurant, restaurantMember, rider } = schema;
const [command, ...args] = process.argv.slice(2);

async function findUser(email) {
  if (!email) throw new Error('Give an email address.');
  const [u] = await db.select().from(user).where(eq(user.email, email.trim().toLowerCase()));
  if (!u) throw new Error(`No account for ${email}. They need to sign up in the app first.`);
  return u;
}

async function findRestaurant(id) {
  const [r] = await db.select().from(restaurant).where(eq(restaurant.id, id ?? ''));
  if (!r) throw new Error(`No restaurant with id "${id}". Run \`npm run manage -- list\` to see them.`);
  return r;
}

const commands = {
  async 'make-admin'(email) {
    const u = await findUser(email);
    await db.update(user).set({ role: 'admin' }).where(eq(user.id, u.id));
    console.log(`${u.email} is now an admin.`);
  },
  async 'own-restaurant'(id) {
    const r = await findRestaurant(id);
    await db.update(restaurant).set({ isOwn: true }).where(eq(restaurant.id, r.id));
    console.log(`${r.name} is marked as a Forkfly restaurant.`);
  },
  async 'approve-restaurant'(id) {
    const r = await findRestaurant(id);
    await db.update(restaurant).set({ status: 'active' }).where(eq(restaurant.id, r.id));
    console.log(`${r.name} is approved and now taking orders.`);
  },
  async 'approve-rider'(email) {
    const u = await findUser(email);
    const done = await db.update(rider).set({ status: 'approved' }).where(eq(rider.userId, u.id)).returning();
    if (!done.length) throw new Error(`${u.email} hasn't applied to ride. Use add-rider instead.`);
    console.log(`${u.email} is an approved rider.`);
  },
  async 'add-member'(id, email, role = 'staff') {
    if (!['owner', 'staff'].includes(role)) throw new Error('Role must be owner or staff.');
    const r = await findRestaurant(id);
    const u = await findUser(email);
    await db
      .insert(restaurantMember)
      .values({ restaurantId: r.id, userId: u.id, role })
      .onConflictDoUpdate({ target: [restaurantMember.restaurantId, restaurantMember.userId], set: { role } });
    console.log(`${u.email} is now ${role} of ${r.name}.`);
  },
  async 'add-rider'(email, vehicle = 'Bicycle') {
    const u = await findUser(email);
    await db
      .insert(rider)
      .values({ userId: u.id, status: 'approved', vehicle })
      .onConflictDoUpdate({ target: rider.userId, set: { status: 'approved', vehicle } });
    console.log(`${u.email} is an approved rider (${vehicle}).`);
  },
  async list() {
    const rs = await db.select().from(restaurant).orderBy(restaurant.name);
    console.log('Restaurants:');
    for (const r of rs) console.log(`  ${r.id.padEnd(16)} ${r.name.padEnd(20)} ${r.status}${r.isOwn ? '  (ours)' : ''}`);
    const members = await db
      .select({ email: user.email, restaurantId: restaurantMember.restaurantId, role: restaurantMember.role })
      .from(restaurantMember)
      .innerJoin(user, eq(user.id, restaurantMember.userId));
    if (members.length) console.log('Restaurant staff:');
    for (const m of members) console.log(`  ${m.email} — ${m.role} of ${m.restaurantId}`);
    const riders = await db.select({ email: user.email, status: rider.status, vehicle: rider.vehicle }).from(rider).innerJoin(user, eq(user.id, rider.userId));
    if (riders.length) console.log('Riders:');
    for (const r of riders) console.log(`  ${r.email} — ${r.status}, ${r.vehicle}`);
    const admins = await db.select({ email: user.email }).from(user).where(and(eq(user.role, 'admin')));
    if (admins.length) console.log('Admins:');
    for (const a of admins) console.log(`  ${a.email}`);
  },
};

try {
  const run = commands[command];
  if (!run) {
    console.log('Commands: make-admin <email> · own-restaurant <id> · approve-restaurant <id> · approve-rider <email> · add-member <id> <email> [owner|staff] · add-rider <email> [vehicle] · list');
    process.exitCode = command ? 1 : 0;
  } else await run(...args);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
