import { useEffect, useState } from 'react';
import { formatMoney } from '../../shared/core.js';
import { api } from '../api.js';
import { Link } from '../router.jsx';

const LABELS = { placed: 'Placed', preparing: 'Preparing', ready: 'Ready for pickup', on_the_way: 'On the way', delivered: 'Delivered', cancelled: 'Cancelled' };

export default function Orders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.orders().then(setOrders).catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="page notice notice--error">{error}</p>;
  if (!orders) return <div className="page" aria-label="Loading" />;
  if (orders.length === 0)
    return (
      <div className="empty">
        <p className="empty__emoji">🧾</p>
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
              <span className="order-row__emoji" aria-hidden="true">
                {o.restaurant.emoji}
              </span>
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
