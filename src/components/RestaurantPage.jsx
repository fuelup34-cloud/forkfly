import { useEffect, useMemo, useState } from 'react';
import { formatMiles, formatMoney } from '../../shared/core.js';
import { api } from '../api.js';
import { imageUrl } from '../images.js';
import { Link } from '../router.jsx';
import QtyStepper from './QtyStepper.jsx';
import Icon from './Icon.jsx';
import { Cover, Rating } from './RestaurantCard.jsx';
import { useConfirm } from './ConfirmDialog.jsx';

export default function RestaurantPage({ id, addressId, cart }) {
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  const [dialog, ask] = useConfirm();

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
        <Icon name="plate" size={48} className="empty__icon" />
        <h1>{error}</h1>
        <Link to="/" className="btn">
          Back to restaurants
        </Link>
      </div>
    );
  if (!r)
    return (
      <div className="page">
        <div className="rp-hero card--skeleton" aria-label="Loading" />
      </div>
    );

  const fromOther = cart.cart.restaurant && cart.cart.restaurant.id !== r.id;
  const mine = cart.cart.restaurant?.id === r.id;

  async function change(item, qty) {
    if (fromOther && qty > 0) {
      const ok = await ask({
        title: `Start a new order from ${r.name}?`,
        body: `Your bag has items from ${cart.cart.restaurant.name}. Starting a new order will remove them.`,
        confirm: 'Start new order',
      });
      if (!ok) return;
    }
    cart.setQty(r, item, qty);
  }

  return (
    <div className="rp">
      {dialog}
      <section className="rp-hero">
        <Cover src={r.coverImage} colors={r.colors} name={r.name} width={1200} className="rp-hero__img" />
        <Link to="/" className="rp-hero__back" aria-label="All restaurants">
          ←
        </Link>
      </section>

      <div className="page--with-cart">
        <div className="rp-main">
          <header className="rp-head">
            <h1>{r.name}</h1>
            <p className="rp-head__meta">
              <Rating rating={r.rating} reviews={r.reviews} />
              <span>
                {r.cuisine} · {'$'.repeat(r.priceLevel)}
              </span>
            </p>
            {r.description && <p className="rp-head__desc">{r.description}</p>}
            <ul className="rp-facts">
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
                <strong>{formatMiles(r.km)}</strong>
                <span>away</span>
              </li>
            </ul>
            {!r.open && (
              <p className="notice notice--warn" role="status">
                {r.name} isn’t taking orders right now. You can still look at the menu.
              </p>
            )}
          </header>

          {categories.length > 1 && (
            <nav className="chips chips--sticky" aria-label="Menu sections">
              {categories.map(([cat]) => (
                <a
                  key={cat}
                  className="chip"
                  href={`#cat-${encodeURIComponent(cat)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(`cat-${cat}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  {cat}
                </a>
              ))}
            </nav>
          )}

          {categories.map(([cat, items]) => (
            <section key={cat} id={`cat-${cat}`} className="menu-section">
              <h2>{cat}</h2>
              <ul className="mi-grid">
                {items.map((item) => {
                  const qty = mine ? cart.qtyOf(item.id) : 0;
                  return (
                    <li key={item.id} className={`mi ${qty ? 'is-in-bag' : ''}`}>
                      <div className="mi__text">
                        <h3>{item.name}</h3>
                        {item.desc && <p className="mi__desc">{item.desc}</p>}
                        <p className="mi__price">
                          <strong>{formatMoney(item.price)}</strong>
                          {item.popular && <span className="tag tag--hot">Popular</span>}
                          {item.veg && (
                            <span className="tag tag--veg" title="Vegetarian">
                              Vegetarian
                            </span>
                          )}
                          {item.spicy && <span className="tag tag--spicy">Spicy</span>}
                        </p>
                      </div>
                      <div className={`mi__side ${item.image ? 'has-photo' : ''}`}>
                        {item.image && <img className="mi__photo" src={imageUrl(item.image, 240)} alt="" loading="lazy" decoding="async" />}
                        {r.open && <QtyStepper qty={qty} label={item.name} onChange={(q) => change(item, q)} />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <aside className="side-cart" aria-label="Your bag">
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
            <p className="muted">{r.open ? 'Add items with the + buttons.' : 'Ordering is paused.'}</p>
          )}
        </aside>
      </div>

      {mine && (
        <Link to="/checkout" className="cart-bar">
          <span className="cart-bar__count">{cart.count}</span>
          <span>View bag</span>
          <strong>{formatMoney(cart.subtotal)}</strong>
        </Link>
      )}
    </div>
  );
}
