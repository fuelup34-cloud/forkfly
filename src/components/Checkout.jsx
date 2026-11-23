import { useEffect, useState } from 'react';
import { ADDRESSES, TIP_OPTIONS, distanceKm, formatMoney, priceBreakdown } from '../../shared/core.js';
import { api } from '../api.js';
import { Link, navigate } from '../router.jsx';
import FeeLines from './FeeLines.jsx';
import QtyStepper from './QtyStepper.jsx';

export default function Checkout({ cart, addressId, setAddressId }) {
  const [restaurant, setRestaurant] = useState(null);
  const [tip, setTip] = useState(200);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { restaurant: cartRestaurant, lines } = cart.cart;

  // We need the restaurant's location to work out the delivery fee.
  useEffect(() => {
    if (!cartRestaurant) return;
    api.restaurant(cartRestaurant.id, addressId).then(setRestaurant).catch((err) => setError(err.message));
  }, [cartRestaurant?.id, addressId]);

  if (!cartRestaurant)
    return (
      <div className="empty">
        <p className="empty__emoji">🛍️</p>
        <h1>Your cart is empty</h1>
        <p className="muted">Pick a restaurant and add a few things.</p>
        <Link to="/" className="btn">
          Find food
        </Link>
      </div>
    );

  const address = ADDRESSES.find((a) => a.id === addressId);
  const km = restaurant ? Math.round(distanceKm(restaurant, address) * 10) / 10 : null;
  const pricing = priceBreakdown({ subtotal: cart.subtotal, km: km ?? 0, tip });

  async function placeOrder() {
    setBusy(true);
    setError('');
    try {
      const order = await api.placeOrder({
        restaurantId: cartRestaurant.id,
        addressId,
        items: lines.map((l) => ({ id: l.id, qty: l.qty })),
        tip,
        note,
      });
      cart.clear();
      navigate(`/orders/${order.id}`, { replace: true });
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
            <h2>
              {cartRestaurant.emoji} {cartRestaurant.name}
            </h2>
            <ul className="lines">
              {lines.map((l) => (
                <li key={l.id}>
                  <span className="lines__emoji" aria-hidden="true">
                    {l.emoji}
                  </span>
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
          {error && (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="btn btn--block btn--big" onClick={placeOrder} disabled={busy || !restaurant}>
            {busy ? 'Placing order…' : `Place order · ${formatMoney(pricing.total)}`}
          </button>
          <p className="muted small center">Demo checkout: no payment is taken.</p>
        </aside>
      </div>
    </div>
  );
}
