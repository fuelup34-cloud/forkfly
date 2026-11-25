import { useEffect, useState } from 'react';
import { formatMoney } from '../../shared/core.js';
import { api, signInLink } from '../api.js';
import Icon from './Icon.jsx';
import Monogram from './Monogram.jsx';
import { Link } from '../router.jsx';

const LABELS = { placed: 'Waiting for restaurant', preparing: 'Preparing', ready: 'Ready for pickup', on_the_way: 'On the way', delivered: 'Delivered', cancelled: 'Cancelled', rejected: 'Declined' };

export default function Orders({ me }) {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const signedIn = !!me?.user;
  useEffect(() => {
    if (signedIn) api.orders().then(setOrders).catch((err) => setError(err.message));
  }, [signedIn]);

  if (me && !me.user)
    return (
      <div className="empty">
        <Icon name="receipt" size={48} className="empty__icon" />
        <h1>Sign in to see your orders</h1>
        <Link to={signInLink('/orders')} className="btn">
          Sign in
        </Link>
      </div>
    );

  if (error) return <p className="page notice notice--error">{error}</p>;
  if (!orders) return <div className="page" aria-label="Loading" />;
  if (orders.length === 0)
    return (
      <div className="empty">
        <Icon name="receipt" size={48} className="empty__icon" />
        <h1>No orders yet</h1>
        <Link to="/" className="btn">
          Order something
        </Link>
      </div>
    );

  return (
    <div className="page narrow">
      <h1>Your orders</h1>
      <ul className="order-list">
        {orders.map((o) => (
          <li key={o.id}>
            <Link to={`/orders/${o.id}`} className="order-row">
              <Monogram name={o.restaurant.name} colors={o.restaurant.colors} image={o.restaurant.coverImage} />
              <span className="order-row__text">
                <strong>{o.restaurant.name}</strong>
                <span className="muted">
                  {new Date(o.placedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · {o.items.reduce((n, i) => n + i.qty, 0)} items ·{' '}
                  {formatMoney(o.pricing.total)}
                </span>
              </span>
              <span className={`status status--${o.status}`}>
                {o.active && <span className="live-dot" aria-hidden="true" />}
                {LABELS[o.status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
