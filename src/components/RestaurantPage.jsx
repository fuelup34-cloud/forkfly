import { useEffect, useMemo, useState } from 'react';
import { formatMoney } from '../../shared/core.js';
import { api } from '../api.js';
import { Link } from '../router.jsx';
import QtyStepper from './QtyStepper.jsx';

export default function RestaurantPage({ id, addressId, cart }) {
  const [r, setR] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    api
      .restaurant(id, addressId)
      .then((data) => !cancelled && setR(data))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id, addressId]);

  const categories = useMemo(() => {
    if (!r) return [];
    const map = new Map();
    for (const item of r.menu) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category).push(item);
    }
    return [...map];
  }, [r]);

  if (error)
    return (
      <div className="empty">
        <p className="empty__emoji">🍽️</p>
        <h1>{error}</h1>
        <Link to="/" className="btn">
          Back to restaurants
        </Link>
      </div>
    );
  if (!r) return <div className="page"><div className="r-hero card--skeleton" aria-label="Loading" /></div>;

  const fromOther = cart.cart.restaurant && cart.cart.restaurant.id !== r.id;

  function change(item, qty) {
    if (fromOther && qty > 0) {
      const ok = window.confirm(`Start a new order from ${r.name}?\n\nYour cart has items from ${cart.cart.restaurant.name}. They'll be removed.`);
      if (!ok) return;
    }
    cart.setQty(r, item, qty);
  }

  const mine = cart.cart.restaurant?.id === r.id;

  return (
    <div className="page page--with-cart">
      <div>
        <Link to="/" className="back-link">
          ← All restaurants
        </Link>
        <section className="r-hero" style={{ background: `linear-gradient(135deg, ${r.colors[0]}, ${r.colors[1]})` }}>
          <span className="r-hero__emoji">{r.emoji}</span>
          <div>
            <h1>{r.name}</h1>
            <p>
              {r.cuisine} · {'$'.repeat(r.priceLevel)} · ★ {r.rating.toFixed(1)} ({r.reviews.toLocaleString()})
            </p>
          </div>
        </section>
        <ul className="r-facts">
          <li>
            <strong>
              {r.eta[0]}–{r.eta[1]} min
            </strong>
            <span>delivery time</span>
          </li>
          <li>
            <strong>{formatMoney(r.deliveryFee)}</strong>
            <span>delivery fee</span>
          </li>
          <li>
            <strong>{r.km} km</strong>
            <span>away</span>
          </li>
        </ul>

        <nav className="chips chips--sticky" aria-label="Menu sections">
          {categories.map(([cat]) => (
            <a key={cat} className="chip" href={`#cat-${cat}`} onClick={(e) => {
              e.preventDefault();
              document.getElementById(`cat-${cat}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}>
              {cat}
            </a>
          ))}
        </nav>

        {categories.map(([cat, items]) => (
          <section key={cat} id={`cat-${cat}`} className="menu-section">
            <h2>{cat}</h2>
            <ul className="menu">
              {items.map((item) => (
                <li key={item.id} className="menu-item">
                  <span className="menu-item__emoji" aria-hidden="true">
                    {item.emoji}
                  </span>
                  <div className="menu-item__text">
                    <h3>
                      {item.name}
                      {item.popular && <span className="tag tag--hot">Popular</span>}
                      {item.veg && <span className="tag tag--veg" title="Vegetarian">Veg</span>}
                      {item.spicy && <span className="tag tag--spicy" title="Spicy">Spicy</span>}
                    </h3>
                    <p className="muted">{item.desc}</p>
                    <strong>{formatMoney(item.price)}</strong>
                  </div>
                  <QtyStepper qty={mine ? cart.qtyOf(item.id) : 0} label={item.name} onChange={(q) => change(item, q)} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <aside className="side-cart" aria-label="Your cart">
        <h2>Your order</h2>
        {mine ? (
          <>
            <ul className="side-cart__lines">
              {cart.cart.lines.map((l) => (
                <li key={l.id}>
                  <span>
                    {l.qty}× {l.name}
                  </span>
                  <span>{formatMoney(l.price * l.qty)}</span>
                </li>
              ))}
            </ul>
            <p className="side-cart__total">
              <span>Subtotal</span>
              <strong>{formatMoney(cart.subtotal)}</strong>
            </p>
            <Link to="/checkout" className="btn btn--block">
              Go to checkout
            </Link>
          </>
        ) : (
          <p className="muted">Add something tasty with the + buttons.</p>
        )}
      </aside>

      {mine && (
        <Link to="/checkout" className="cart-bar">
          <span className="cart-bar__count">{cart.count}</span>
          <span>View cart</span>
          <strong>{formatMoney(cart.subtotal)}</strong>
        </Link>
      )}
    </div>
  );
}
