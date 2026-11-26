// Platform settings, edited on the admin Settings page and stored in the `setting` table.
//
// Read them with `settings()` (kept in memory, so it's free to call on every order) and change
// them with `saveSettings()`. Fees are also pushed into shared/core.js so prices use them.

import { eq } from 'drizzle-orm';
import { db, schema } from './db/index.js';
import { HttpError } from './http.js';
import { DEFAULT_FEES, FEES, applyFees } from '../shared/core.js';

const KEY = 'platform';

export const DEFAULT_SETTINGS = Object.freeze({
  fees: { ...DEFAULT_FEES },
  commission: 0.15, // default for partners approved from now on
  riderPayBase: 350, // cents per delivery
  riderPayPerMile: 75,
  maxRadiusMiles: 5,
  minOrder: 500,
  orderingOpen: true,
  autoApproveRiders: false,
  notifications: { newRestaurant: true, newRider: true, dailySummary: true, refundRequests: false },
  supportEmail: 'help@forkfly.example',
});

let current = structuredClone(DEFAULT_SETTINGS);

export const settings = () => current;

// What every visitor's app needs to price and place orders.
export function publicConfig() {
  const s = current;
  return { fees: { ...FEES }, orderingOpen: s.orderingOpen, minOrder: s.minOrder, maxRadiusMiles: s.maxRadiusMiles, supportEmail: s.supportEmail };
}

export async function loadSettings() {
  const [row] = await db.select().from(schema.setting).where(eq(schema.setting.key, KEY));
  // Stored values win, and anything added to the defaults since then is filled in.
  current = row ? merge(DEFAULT_SETTINGS, row.value) : structuredClone(DEFAULT_SETTINGS);
  applyFees(current.fees);
  return current;
}

function merge(base, over) {
  const out = structuredClone(base);
  for (const k of Object.keys(base)) {
    if (over?.[k] === undefined) continue;
    out[k] = base[k] && typeof base[k] === 'object' ? { ...base[k], ...over[k] } : over[k];
  }
  return out;
}

const cents = (v, label, max = 100_000) => {
  if (!Number.isInteger(v) || v < 0 || v > max) throw new HttpError(400, `${label} must be between $0 and $${max / 100}.`);
  return v;
};
const rate = (v, label, max = 0.5) => {
  if (!Number.isFinite(v) || v < 0 || v > max) throw new HttpError(400, `${label} must be between 0% and ${max * 100}%.`);
  return Math.round(v * 10_000) / 10_000;
};

// Checks every field, so a bad value never reaches checkout.
export function validateSettings(body) {
  const f = body?.fees ?? {};
  const fees = {
    deliveryBase: cents(f.deliveryBase, 'Delivery, first mile', 2_000),
    includedMiles: DEFAULT_FEES.includedMiles,
    perExtraMile: cents(f.perExtraMile, 'Each extra mile', 1_000),
    deliveryCap: cents(f.deliveryCap, 'Delivery fee cap', 5_000),
    serviceRate: rate(f.serviceRate, 'Service fee', 0.3),
    serviceCap: cents(f.serviceCap, 'Service fee cap', 5_000),
    smallOrderUnder: cents(f.smallOrderUnder, 'Small order threshold', 5_000),
    smallOrderFee: cents(f.smallOrderFee, 'Small order fee', 1_000),
  };
  if (fees.deliveryCap < fees.deliveryBase) throw new HttpError(400, 'The delivery fee cap can’t be below the first-mile fee.');
  const radius = Number(body?.maxRadiusMiles);
  if (!Number.isFinite(radius) || radius < 1 || radius > 25) throw new HttpError(400, 'Delivery radius must be between 1 and 25 miles.');
  const email = typeof body?.supportEmail === 'string' ? body.supportEmail.trim().toLowerCase() : '';
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(email)) throw new HttpError(400, 'Enter a valid support email.');
  const n = body?.notifications ?? {};
  return {
    fees,
    commission: rate(body?.commission, 'Default commission'),
    riderPayBase: cents(body?.riderPayBase, 'Rider pay per delivery', 5_000),
    riderPayPerMile: cents(body?.riderPayPerMile, 'Rider pay per mile', 1_000),
    maxRadiusMiles: Math.round(radius * 2) / 2,
    minOrder: cents(body?.minOrder, 'Minimum order', 10_000),
    orderingOpen: body?.orderingOpen !== false,
    autoApproveRiders: body?.autoApproveRiders === true,
    notifications: Object.fromEntries(Object.keys(DEFAULT_SETTINGS.notifications).map((k) => [k, n[k] === true])),
    supportEmail: email,
  };
}

export async function saveSettings(body, user) {
  const value = validateSettings(body);
  await db
    .insert(schema.setting)
    .values({ key: KEY, value, updatedBy: user.id })
    .onConflictDoUpdate({ target: schema.setting.key, set: { value, updatedBy: user.id } });
  current = value;
  applyFees(value.fees);
  return current;
}
