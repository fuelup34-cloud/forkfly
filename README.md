# Forkfly

A food delivery app with low, clearly explained fees and live courier tracking.

## Run it

You need Node 22+ and PostgreSQL running locally (`brew services start postgresql@14`).

```bash
npm install
npm run setup  # writes .env with a fresh secret, creates the database, loads demo data and test accounts
npm run cert   # needed for phone GPS; re-run when your computer's IP changes
npm start      # builds, migrates, then serves the app on port 5190 (and HTTPS on 5443)
```

Open http://localhost:5190, or `http://<your-computer's-IP>:5190` on a phone on the same Wi-Fi.

`npm run dev` is for editing and only works on this computer: the Vite 5 dev server has known
vulnerabilities, so don't add `--host` to it.

## Test accounts

`npm run setup` (or `npm run seed:dev` on its own) creates these in **your local database only**.
They all use the password `forkfly-test-2026`:

| Email | What it can do |
| --- | --- |
| `admin@example.com` | Forkfly admin |
| `owner@example.com` | Owner of Mama's Kitchen: the full restaurant dashboard |
| `staff@example.com` | Staff at Mama's Kitchen: orders, pausing, marking items sold out |
| `rider@example.com` | Approved rider |
| `customer@example.com` | Customer only |

To see the dashboard at work, sign in as `customer@example.com` in one browser and order from
Mama's Kitchen, and as `owner@example.com` in another (or a private window) at `/dashboard`.

This repository is public, so these logins are public too. Never create them on a real server
(the script refuses when `NODE_ENV=production`).

## Accounts

Anyone can browse. Placing and tracking orders needs an account (email and password).
When signing up, people choose what they're here for:

- **Order food**: a customer account.
- **Run a restaurant**: also creates the restaurant as *pending*. It's hidden until approved and has a menu.
- **Deliver**: also creates a *pending* rider.

A signed-in customer can apply later from **Account → Work with Forkfly**.
Admins approve applications on the admin dashboard (below). The same jobs also work from the terminal:

```bash
npm run manage -- list                                   # restaurants, staff, riders, admins
npm run manage -- make-admin you@example.com
npm run manage -- approve-restaurant <restaurant-id>
npm run manage -- approve-rider rider@example.com
npm run manage -- own-restaurant <restaurant-id>         # mark one as Forkfly's own
npm run manage -- add-member <restaurant-id> <email> [owner|staff]
npm run manage -- add-rider <email> [vehicle]
```

## Restaurant dashboard

Restaurant teams open **/dashboard** (linked from the header and their account page):

- **Orders**: a live board with **New → Preparing → Ready for pickup**. New orders chime (turn
  sound on once) and show in the tab title. Accept with a prep time, decline with a reason, add
  5 minutes, or mark ready. Unanswered orders are declined automatically after 10 minutes, so
  customers never wait for food that isn't coming. Today's orders, sales and history sit alongside.
- **Menu**: add, edit and delete items with photos, and switch items to sold out.
- **Settings**: cover photo, name, cuisine, description, usual prep time, price range, and the team.
- The **Accepting orders** switch pauses the restaurant. Customers see it as closed.

Owners can change everything. Staff can run orders, pause the restaurant and mark items sold out.
Restaurants with a team run their own kitchen. The demo restaurants (no team) run themselves.
Once a restaurant has a member (`npm run manage -- add-member pho-corner you@example.com owner`),
its new orders wait for that team.

Photos are shrunk in the browser (longest side 1600 px for covers, 1200 px for dishes), checked
on the server to be real JPEG, PNG or WebP files, and stored in `server/uploads/`. That folder
is not in git, so back it up or move to object storage before hosting. The demo restaurants'
covers are hotlinked from Unsplash, which is free to use under the Unsplash License. Menu items
only show photos the restaurant uploads.

## Admin dashboard

Accounts with the admin role open **/admin** (sign in as `admin@example.com` locally):

- **Overview**: orders, order value, Forkfly revenue (fees + commission) and delivery time for today,
  7 or 30 days against the period before, live orders, and what needs attention: applications, and
  restaurants losing more than 1 in 10 orders this week.
- **Orders**: every order with search and filters. Admins can cancel any order that isn't finished;
  the customer and kitchen see it straight away. Refunds come with card payments.
- **Analytics**: trends, busiest hours and weekdays, top restaurants, cuisines, outcomes, new vs. returning.
- **Restaurants**: approve or decline applications, suspend with a reason (the owner sees it on their
  dashboard), reinstate, and set each partner's commission. New orders record the commission at the
  rate when they were placed.
- **Riders**: approve, decline, suspend (with a reason) and reinstate.
- **Customers**: suspend or reinstate. A suspended account is signed out everywhere and can't sign in.
- **Settings**: customer fees, minimum order, delivery radius, pausing all ordering, default commission,
  rider pay, auto-approving riders, and the admin team (add someone by the email of their existing
  account). Fees take effect for new orders at once, in checkout and on the server.

Reports use `PLATFORM_TIMEZONE` (default `America/New_York`) for "today" and day boundaries.
Not built yet: rider presence and ratings (they arrive with the rider app), email notifications
(the preferences are saved), and refunds (they need payments).

## Database

Postgres, with [Drizzle](https://orm.drizzle.team) for the schema and queries, and
[Better Auth](https://www.better-auth.com) for sign-in. The tables are defined in `server/db/schema.js`:

| Table | Holds |
| --- | --- |
| `user`, `session`, `account`, `verification` | Accounts and sign-in (password hashes live in `account`) |
| `restaurant`, `menu_item` | Restaurants (`status`, `is_own`, cover photo, time zone) and their menus |
| `restaurant_member` | Who can manage which restaurant (owner or staff) |
| `rider` | Riders and their approval status |
| `order` | Orders, with snapshots of the items, prices and address at the time, Forkfly's commission, and why one was declined |
| `setting` | Platform settings edited on the admin dashboard (fees, rules, rider pay) |

After changing the schema, run `npm run db:generate` to write a migration, then `npm run db:migrate`
(`npm start` migrates automatically). `npm run db:studio` opens a browser view of the data.
`npm run db:seed` re-applies `server/restaurants.js` without deleting anything.

## Real GPS

1. Place an order and, before pickup, press **Use a real courier with live GPS**.
2. Open the private link on the courier's phone. The certificate is self-signed, so the phone shows a warning.
   Only continue for your own computer's address.
3. Press **Share my live location** and keep the page open. Browsers can't track in the background.
4. The courier taps "picked up" and "delivered". Locations are erased on delivery or cancellation.

Anyone with the link can act as that order's courier. **Show streets** loads tiles from OpenStreetMap,
which reveals the approximate area being viewed to them. Their public tiles aren't for commercial-scale use.

## How it works

- `server/index.js` — Node server: routing, accounts, and the WebSocket (`/ws`) that sends customers
  their order twice a second and kitchens their live board. Requests that change something are
  only accepted from the app's own pages.
- `server/orders.js` — placing orders (prices always recalculated here) and the kitchen's steps.
- `server/dashboard.js` — the restaurant dashboard API, with owner/staff permissions.
- `server/admin.js` — the admin dashboard API (reports, approvals, suspensions); `server/settings.js` — platform settings.
- `server/catalog.js`, `server/uploads.js`, `server/http.js` — menus, photos, request helpers.
- `server/auth.js` — sign-in setup, and the list of addresses allowed to use it.
- `server/db/` — schema, migrations, seeding.
- `server/restaurants.js` — the demo restaurants (seed data) and simulated couriers.
- `shared/core.js` — fees, map routes and the delivery timeline, used by both server and app so they agree.
- `src/` — the React app: browse → menu → checkout → live tracking → order history.
- `src/dashboard/` — the restaurant dashboard, loaded only by people who open it.
- `src/admin/` — the admin dashboard; `src/ui/` — parts both dashboards share.

## Fees

The defaults below. Admins can change them under **Admin → Settings**.

| Fee | Amount |
| --- | --- |
| Delivery | $0.99 for the first mile, then $0.65 a mile, never more than $3.99 |
| Service | 5% of the items, never more than $2.50 |
| Small order | $1.00, only on orders under $10 |
| Tip | optional, 100% to the courier |

## What's simulated

This is a working demo, not a live service:

- The city, restaurants, prices and couriers are made up. Without real GPS, couriers move along a drawn street grid.
- Time runs 30× faster, so a ~20 minute delivery takes about 40 seconds to watch.
- No payment is taken.
- There's no email yet, so addresses aren't verified and there's no password reset.

Making it real would still need payments, restaurant and rider dashboards, courier dispatch, email, real addresses
with routing and ETAs, a native courier app for background GPS, and public hosting.
