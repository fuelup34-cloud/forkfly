// Loads the demo restaurants and menus into the database.
// Re-running it updates them to match server/restaurants.js; it never deletes anything.
import { sql } from 'drizzle-orm';
import { RESTAURANTS } from '../restaurants.js';
import { db, pool, schema } from './index.js';

const { restaurant, menuItem } = schema;
const excluded = (col) => sql.raw(`excluded.${col}`);

try {
  await db.transaction(async (tx) => {
    for (const r of RESTAURANTS) {
      const row = {
        id: r.id,
        name: r.name,
        cuisine: r.cuisine,
        description: r.description ?? '',
        coverImage: r.cover ?? null,
        colors: r.colors,
        rating: r.rating,
        reviews: r.reviews,
        priceLevel: r.priceLevel,
        prepMin: r.prepMin,
        x: r.x,
        y: r.y,
        status: 'active',
      };
      await tx
        .insert(restaurant)
        .values(row)
        .onConflictDoUpdate({
          target: restaurant.id,
          // Leave status and isOwn alone, so seeding never undoes a choice made later,
          // and keep any photo or description a restaurant has set itself.
          set: {
            ...Object.fromEntries(
              ['name', 'cuisine', 'colors', 'rating', 'reviews', 'price_level', 'prep_min', 'x', 'y'].map((c) => [
                c.replace(/_(\w)/g, (_, l) => l.toUpperCase()),
                excluded(c),
              ])
            ),
            coverImage: sql`coalesce(${restaurant.coverImage}, excluded.cover_image)`,
            description: sql`case when ${restaurant.description} = '' then excluded.description else ${restaurant.description} end`,
          },
        });

      const items = r.menu.map((m, i) => ({
        restaurantId: r.id,
        id: m.id,
        category: m.category,
        name: m.name,
        description: m.desc ?? '',
        price: m.price,
        popular: !!m.popular,
        veg: !!m.veg,
        spicy: !!m.spicy,
        position: i,
      }));
      await tx
        .insert(menuItem)
        .values(items)
        .onConflictDoUpdate({
          target: [menuItem.restaurantId, menuItem.id],
          set: Object.fromEntries(
            ['category', 'name', 'description', 'price', 'popular', 'veg', 'spicy', 'position'].map((c) => [c, excluded(c)])
          ),
        });
    }
  });
  console.log(`Seeded ${RESTAURANTS.length} restaurants.`);
} catch (err) {
  console.error('Seeding failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
