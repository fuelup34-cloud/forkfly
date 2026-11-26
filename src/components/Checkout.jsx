import { useEffect, useState } from 'react';
import { ADDRESSES, KM_PER_MILE, TIP_OPTIONS, distanceKm, formatMoney, priceBreakdown } from '../../shared/core.js';
import { api, signInLink } from '../api.js';
import Icon from './Icon.jsx';
import Monogram from './Monogram.jsx';
import { Link, navigate } from '../router.jsx';
import FeeLines from './FeeLines.jsx';
import QtyStepper from './QtyStepper.jsx';
import PaymentStep from './PaymentStep.jsx';

export default function Checkout({ cart, addressId, setAddressId, me }) {
  const [restaurant, setRestaurant] = useState(null);
  const [tip, setTip] = useState(200);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A started card payment: { checkoutId, clientSecret, amount, key }. Null until "Continue to payment".
  const [payment, setPayment] = useState(null);
  const { restaurant: cartRestaurant, lines } = cart.cart;
  const payments = me?.config?.payments ?? null; // null: demo checkout, no payment taken

  // What's being paid for. If any of it changes after payment starts, the payment starts over.
  const request = cartRestaurant
    ? { restaurantId: cartRestaurant.id, addressId, items: lines.map((l) => ({ id: l.id, qty: l.qty })), tip, note: note.trim() }
    : null;
  const requestKey = JSON.stringify(request);
  useEffect(() => {
    if (payment && payment.key !== requestKey) setPayment(null);
  }, [requestKey, payment]);

  // We need the restaurant's location to work out the delivery fee.
  useEffect(() => {
    if (!cartRestaurant) return;
    api.restaurant(cartRestaurant.id, addressId).then(setRestaurant).catch((err) => setError(err.message));
  }, [cartRestaurant?.id, addressId]);

  if (!cartRestaurant)
    return (
      <div className="empty">
        <Icon name="bag" size={48} className="empty__icon" />
        <h1>Your cart is empty</h1>
        <p className="muted">Pick a restaurant and add a few things.</p>
        <Link to="/" className="btn">
          Find food
        </Link>
      </div>
    );

  const address = ADDRESSES.find((a) => a.id === addressId);
  const km = restaurant ? distanceKm(restaurant, address) : null;
  const pricing = priceBreakdown({ subtotal: cart.subtotal, km: km ?? 0, tip });
  // Rules set by Forkfly admins. The server checks them too.
  const config = me?.config;
  const blocked = !config
    ? ''
    : !config.orderingOpen
      ? 'Forkfly is paused right now. Please try again a little later.'
      : cart.subtotal < config.minOrder
        ? `The minimum order is ${formatMoney(config.minOrder)} before fees. Add ${formatMoney(config.minOrder - cart.subtotal)} more.`
        : km != null && km / KM_PER_MILE > config.maxRadiusMiles
          ? `${restaurant.name} is too far away to deliver to this address.`
          : '';

  const placed = (order) => {
    cart.clear();
    navigate(`/orders/${order.id}`, { replace: true });
  };

  async function placeOrder() {
    setBusy(true);
    setError('');
    try {
      if (payments) {
        // The server checks the order and prices it, then starts a payment for exactly that.
        const started = await api.startCheckout(request);
        setPayment({ ...started, key: requestKey });
        setBusy(false);
      } else {
        placed(await api.placeOrder(request));
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="page checkout">
      <Link to={`/r/${cartRestaurant.id}`} className="back-link">
        ← Back to {cartRestaurant.name}
      </Link>
      <h1>Checkout</h1>

      <div className="checkout__grid">
        <div className="checkout__main">
          <section className="panel">
            <h2>Deliver to</h2>
            <div className="addresses">
              {ADDRESSES.map((a) => (
                <label key={a.id} className={`address ${a.id === addressId ? 'is-active' : ''}`}>
                  <input type="radio" name="address" value={a.id} checked={a.id === addressId} onChange={() => setAddressId(a.id)} />
                  <span>
                    <strong>{a.label}</strong>
                    <span className="muted">{a.line}</span>
                  </span>
                </label>
              ))}
            </div>
            <label className="field">
              <span>Note for your courier (optional)</span>
              <textarea rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Ring the bell, flat 3B" />
            </label>
          </section>

          <section className="panel">
            <h2 className="with-mono">
              <Monogram name={cartRestaurant.name} colors={cartRestaurant.colors} image={restaurant?.coverImage} size="sm" />
              {cartRestaurant.name}
            </h2>
            <ul className="lines">
              {lines.map((l) => (
                <li key={l.id}>
                  <span className="lines__name">
                    {l.name}
                    <span className="muted">{formatMoney(l.price)} each</span>
                  </span>
                  <QtyStepper compact qty={l.qty} label={l.name} onChange={(q) => cart.setQty(cartRestaurant, l, q)} />
                  <strong className="lines__price">{formatMoney(l.price * l.qty)}</strong>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <h2>Tip your courier</h2>
            <p className="muted small">Optional. 100% goes to them — we never take a cut.</p>
            <div className="chips" role="radiogroup" aria-label="Tip">
              {TIP_OPTIONS.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={tip === t} className={`chip ${tip === t ? 'is-active' : ''}`} onClick={() => setTip(t)}>
                  {t ? formatMoney(t) : 'No tip'}
                </button>
              ))}
            </div>
          </section>
        </div>

        <aside className="panel checkout__summary">
          <h2>Summary</h2>
          <FeeLines pricing={pricing} km={km} />
          {blocked && (
            <p className="notice notice--warn" role="status">
              {blocked}
            </p>
          )}
          {error && (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          )}
          {me && !me.user ? (
            <Link to={signInLink('/checkout')} className="btn btn--block btn--big">
              Sign in to place your order
            </Link>
          ) : payment && !blocked ? (
            <PaymentStep publishableKey={payments.publishableKey} checkout={payment} onPaid={placed} onBack={() => setPayment(null)} />
          ) : (
            <button type="button" className="btn btn--block btn--big" onClick={placeOrder} disabled={busy || !restaurant || !me || !!blocked}>
              {busy
                ? payments
                  ? 'One moment…'
                  : 'Placing order…'
                : payments
                  ? `Continue to payment · ${formatMoney(pricing.total)}`
                  : `Place order · ${formatMoney(pricing.total)}`}
            </button>
          )}
          {!payments && <p className="muted small center">Demo checkout: no payment is taken.</p>}
        </aside>
      </div>
    </div>
  );
}
