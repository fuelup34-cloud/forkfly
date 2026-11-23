# Forkfly

A food delivery app with low, clearly explained fees and live courier tracking.

## Run it

```bash
npm install
npm run cert   # needed for phone GPS; re-run when your computer's IP changes
npm start      # builds, then serves the app on port 5190 (and HTTPS on 5443)
```

Open http://localhost:5190, or `http://<your-computer's-IP>:5190` on a phone on the same Wi-Fi.

`npm run dev` is for editing and only works on this computer: the Vite 5 dev server has known
vulnerabilities, so don't add `--host` to it.

## Real GPS

1. Place an order and, before pickup, press **Use a real courier with live GPS**.
2. Open the private link on the courier's phone. The certificate is self-signed, so the phone shows a warning.
   Only continue for your own computer's address.
3. Press **Share my live location** and keep the page open. Browsers can't track in the background.
4. The courier taps "picked up" and "delivered". Locations are erased on delivery or cancellation.

Anyone with the link can act as that order's courier. **Show streets** loads tiles from OpenStreetMap,
which reveals the approximate area being viewed to them. Their public tiles aren't for commercial-scale use.

## How it works

- `server/index.js` — Node server. Restaurant menus, orders, and a WebSocket (`/ws`) that sends each
  order's live status and courier position twice a second. It always recalculates prices itself.
- `server/restaurants.js` — the demo restaurants and couriers.
- `shared/core.js` — fees, map routes and the delivery timeline, used by both server and app so they agree.
- `src/` — the React app: browse → menu → checkout → live tracking → order history.

## Fees

| Fee | Amount |
| --- | --- |
| Delivery | $0.99 for the first 2 km, then $0.40/km, never more than $3.99 |
| Service | 5% of the items, never more than $2.50 |
| Small order | $1.00, only on orders under $10 |
| Tip | optional, 100% to the courier |

## What's simulated

This is a working demo, not a live service:

- The city, restaurants, prices and couriers are made up. Without real GPS, couriers move along a drawn street grid.
- Time runs 30× faster, so a ~20 minute delivery takes about 40 seconds to watch.
- No payment is taken. You only see your own orders (tied to your browser), but there are no accounts.
- Orders are saved to `server/data.json`.

Making it real would need payments, accounts, restaurant partners, courier dispatch and sign-in, real addresses
with routing and ETAs, a native courier app for background GPS, a database, and public hosting.
