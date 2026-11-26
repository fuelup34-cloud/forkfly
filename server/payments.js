// Card payments at checkout, through Stripe.
//
// 1. POST /api/checkout          checks the order, prices it, and starts a Stripe PaymentIntent.
// 2. The browser collects the card with Stripe's Payment Element and confirms the payment.
// 3. POST /api/checkout/complete (and the Stripe webhook, in case the tab closes) creates the order,
//    only once Stripe says the payment succeeded. Whichever arrives first claims it; the other
//    gets the same order back.
// Orders the kitchen declines, that time out, or that are cancelled are refunded automatically.
//
// Turned on by STRIPE_SECRET_KEY + STRIPE_PUBLISHABLE_KEY in .env (test keys while developing).
// STRIPE_WEBHOOK_SECRET enables /api/stripe/webhook. Without keys, checkout stays a demo with no payment.

import Stripe from 'stripe';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from './db/index.js';
import { HttpError } from './http.js';
import { createOrder, getOrder, newOrderId, orderEvents, persist, quoteOrder } from './orders.js';

const { checkout: checkoutTable } = schema;
const SECRET = process.env.STRIPE_SECRET_KEY ?? '';
const PUBLISHABLE = process.env.STRIPE_PUBLISHABLE_KEY ?? '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';

const stripe = SECRET && PUBLISHABLE ? new Stripe(SECRET) : null;
export const paymentsEnabled = !!stripe;
if (SECRET && !PUBLISHABLE) console.warn('Stripe: STRIPE_PUBLISHABLE_KEY is missing, so payments are off.');
if (stripe && SECRET.startsWith('sk_live_')) console.warn('Stripe: using LIVE keys — real cards will be charged.');

// What the browser needs to show the card form.
export function paymentConfig() {
  return stripe ? { provider: 'stripe', publishableKey: PUBLISHABLE } : null;
}

const cleanRequest = (body) => ({
  restaurantId: typeof body?.restaurantId === 'string' ? body.restaurantId.slice(0, 64) : '',
  addressId: typeof body?.addressId === 'string' ? body.addressId.slice(0, 64) : '',
  items: Array.isArray(body?.items) ? body.items.slice(0, 50).map((l) => ({ id: String(l?.id ?? '').slice(0, 64), qty: Number(l?.qty) })) : [],
  tip: Number(body?.tip) || 0,
  note: typeof body?.note === 'string' ? body.note.slice(0, 200) : '',
});

// Step 1: price the order and start a payment for exactly that amount.
export async function startCheckout(customer, body) {
  if (!stripe) throw new HttpError(503, 'Payments aren’t set up on this server.');
  const request = cleanRequest(body);
  const { restaurant, pricing } = await quoteOrder(request);
  const intent = await stripe.paymentIntents.create({
    amount: pricing.total,
    currency: 'usd',
    // Cards and wallets only, so the payment finishes on our page (no bank redirects).
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    description: `Forkfly order from ${restaurant.name}`,
    metadata: { customerId: customer.id, restaurantId: restaurant.id },
  });
  await db.insert(checkoutTable).values({ id: intent.id, customerId: customer.id, request, amount: pricing.total });
  return { checkoutId: intent.id, clientSecret: intent.client_secret, amount: pricing.total };
}

// Step 3: once Stripe says it's paid, create the order (once). Returns the order.
export async function completeCheckout(intentId, customerId = null) {
  if (!stripe) throw new HttpError(503, 'Payments aren’t set up on this server.');
  if (typeof intentId !== 'string' || !intentId.startsWith('pi_') || intentId.length > 100) throw new HttpError(400, 'Unknown payment.');
  const [row] = await db.select().from(checkoutTable).where(eq(checkoutTable.id, intentId));
  // Someone else's payment looks exactly like one that doesn't exist.
  if (!row || (customerId && row.customerId !== customerId)) throw new HttpError(404, 'Unknown payment.');
  if (row.orderId) return waitForOrder(row);

  const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ['latest_charge'] });
  if (intent.status !== 'succeeded') {
    throw new HttpError(402, intent.status === 'processing' ? 'Your payment is still processing. Please wait a moment.' : 'The payment didn’t go through. You haven’t been charged.');
  }
  if (intent.amount_received !== row.amount || intent.currency !== 'usd') throw new HttpError(409, 'The payment amount doesn’t match the order. Please contact support.');

  // Claim it, so a second caller (browser or webhook) doesn't create the order twice.
  const orderId = newOrderId();
  const claimed = await db
    .update(checkoutTable)
    .set({ orderId })
    .where(and(eq(checkoutTable.id, intentId), isNull(checkoutTable.orderId)))
    .returning({ id: checkoutTable.id });
  if (!claimed.length) {
    const [again] = await db.select().from(checkoutTable).where(eq(checkoutTable.id, intentId));
    return waitForOrder(again);
  }

  const card = intent.latest_charge?.payment_method_details?.card;
  const payment = {
    provider: 'stripe',
    intentId,
    amount: intent.amount_received,
    status: 'paid',
    brand: card?.brand ?? null,
    last4: card?.last4 ?? null,
    paidAt: Date.now(),
    refundedAt: null,
  };
  const [customer] = await db.select().from(schema.user).where(eq(schema.user.id, row.customerId));
  try {
    const order = await createOrder(customer, row.request, { id: orderId, payment });
    await db.update(checkoutTable).set({ status: 'done' }).where(eq(checkoutTable.id, intentId));
    return order;
  } catch (err) {
    // Paid, but the order can't go through any more (sold out, restaurant closed, prices changed): refund it all.
    await stripe.refunds.create({ payment_intent: intentId }, { idempotencyKey: `refund-${intentId}` }).catch((e) => console.error('Stripe: refund failed for', intentId, e.message));
    await db.update(checkoutTable).set({ status: 'failed', error: err.message }).where(eq(checkoutTable.id, intentId));
    throw new HttpError(err.status ?? 409, `${err.message} Your payment has been refunded.`);
  }
}

// The other caller is creating the order right now; give it a moment.
async function waitForOrder(row) {
  for (let i = 0; i < 20; i++) {
    const [r] = i ? await db.select().from(checkoutTable).where(eq(checkoutTable.id, row.id)) : [row];
    if (r.status === 'failed') throw new HttpError(409, `${r.error ?? 'This order couldn’t be placed.'} Your payment has been refunded.`);
    if (r.status === 'done') {
      const order = await getOrder(r.orderId);
      if (order) return order;
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new HttpError(504, 'Your payment went through and your order is being placed. Check Orders in a moment.');
}

// Refund a paid order that won't be delivered. Safe to call twice (Stripe idempotency key).
export async function refundOrder(order) {
  const p = order.payment;
  if (!stripe || !p || p.provider !== 'stripe' || p.status !== 'paid') return;
  try {
    await stripe.refunds.create({ payment_intent: p.intentId }, { idempotencyKey: `refund-${p.intentId}` });
    order.payment = { ...p, status: 'refunded', refundedAt: Date.now() };
    await persist(order, ['payment']);
  } catch (err) {
    console.error('Stripe: could not refund order', order.id, err.message);
  }
}
orderEvents.on('stopped', (order) => void refundOrder(order));

// Stripe calls this when a payment succeeds, so the order is created even if the customer's tab closed.
export async function handleStripeWebhook(rawBody, signature) {
  if (!stripe || !WEBHOOK_SECRET) throw new HttpError(404, 'Not found.');
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? '', WEBHOOK_SECRET);
  } catch {
    throw new HttpError(400, 'Bad signature.');
  }
  if (event.type === 'payment_intent.succeeded') {
    await completeCheckout(event.data.object.id).catch((err) => {
      // 404: a payment that didn't come from Forkfly checkout. Others are already logged/refunded.
      if (err.status !== 404) console.error('Stripe webhook:', event.data.object.id, err.message);
    });
  }
  return { received: true };
}
