import { Suspense, lazy, useState } from 'react';
import { STEPS, TIME_SCALE, formatMoney, toRealMinutes } from '../../shared/core.js';
import { api } from '../api.js';
import { useLiveOrder } from '../useLiveOrder.js';
import { Link } from '../router.jsx';
import CityMap from './CityMap.jsx';
import FeeLines from './FeeLines.jsx';

const GpsMap = lazy(() => import('./GpsMap.jsx'));

function headline(o) {
  if (o.gps && o.status === 'on_the_way') return 'Your courier is on the way with your food';
  const c = o.courier.name.split(' ')[0];
  switch (o.status) {
    case 'placed':
      return `Sending your order to ${o.restaurant.name}…`;
    case 'preparing':
      return o.courierPhase === 'at_restaurant' ? `${c} is waiting while your food is finished` : `${o.restaurant.name} is preparing your food`;
    case 'ready':
      return `Your food is ready — ${c} is almost at the restaurant`;
    case 'on_the_way':
      return o.almostThere ? `${c} is arriving now` : `${c} is on the way with your food`;
    case 'delivered':
      return 'Delivered. Enjoy your meal!';
    default:
      return 'Order cancelled';
  }
}

const stepIndex = (status) => ({ placed: 0, preparing: 1, ready: 1, on_the_way: 2, delivered: 3 })[status] ?? -1;

export default function Tracking({ id }) {
  const { order, setOrder, error, live } = useLiveOrder(id);
  const [cancelError, setCancelError] = useState('');

  if (error && !order)
    return (
      <div className="empty">
        <p className="empty__emoji">🔎</p>
        <h1>{error}</h1>
        <Link to="/orders" className="btn">
          Your orders
        </Link>
      </div>
    );
  if (!order) return <div className="page"><div className="map-wrap card--skeleton" aria-label="Loading your order" /></div>;

  const step = stepIndex(order.status);
  const mins = toRealMinutes(order.etaMs);

  const lastFix = order.gps?.trail.at(-1);
  const courierLink = order.gps && `${order.phoneBase ?? location.origin}/courier/${order.id}#${order.gps.key}`;
  const localLink = order.gps && `${location.origin}/courier/${order.id}#${order.gps.key}`;

  async function turnOnGps() {
    setCancelError('');
    try {
      setOrder(await api.useGps(order.id));
    } catch (err) {
      setCancelError(err.message);
    }
  }

  async function cancel() {
    if (!window.confirm('Cancel this order?')) return;
    setCancelError('');
    try {
      setOrder(await api.cancel(order.id));
    } catch (err) {
      setCancelError(err.message);
    }
  }

  return (
    <div className="page tracking">
      <div className="map-wrap">
        {order.gps && order.active ? (
          <Suspense fallback={null}>
            <GpsMap trail={order.gps.trail} />
          </Suspense>
        ) : (
          <CityMap order={order} />
        )}
        <span className={`live-badge ${live ? '' : 'is-off'}`}>
          <span className="live-dot" aria-hidden="true" />
          {live ? 'Live' : 'Reconnecting…'}
        </span>
        {!order.gps && <span className="demo-badge" title="So you don't have to wait half an hour to see it work">
          Demo: time runs {TIME_SCALE}× faster
        </span>}
      </div>

      <div className="tracking__panel">
        <section className="panel status-card" aria-live="polite">
          {order.active && !order.gps && (
            <p className="eta">
              <strong>{mins <= 1 ? '1' : mins}</strong> min
              <span>estimated arrival</span>
            </p>
          )}
          <h1>{headline(order)}</h1>
          {order.status !== 'cancelled' && (
            <>
              <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(order.progress * 100)} aria-label="Delivery progress">
                <span style={{ width: `${order.progress * 100}%` }} />
              </div>
              <ol className="steps">
                {STEPS.map((s, i) => (
                  <li key={s.id} className={i < step ? 'is-done' : i === step ? 'is-current' : ''}>
                    {s.label}
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>

        {order.active && order.gps && (
          <section className="panel gps-panel">
            <h2>Real GPS</h2>
            <p>
              {!lastFix
                ? 'No location received yet.'
                : order.now - lastFix.at > 20000
                  ? `No new location for ${Math.round((order.now - lastFix.at) / 1000)} seconds. The courier may be standing still or offline.`
                  : `Receiving location${lastFix.accuracy ? `, accurate to about ${Math.round(lastFix.accuracy)} m` : ''}.`}
            </p>
            <label className="field">
              Send this private link to the courier's phone
              <input readOnly value={courierLink} onFocus={(e) => e.target.select()} />
            </label>
            <a className="small" href={localLink} target="_blank" rel="noreferrer">Or open the courier page on this device</a>
          </section>
        )}
        {order.canCancel && !order.gps && (
          <button type="button" className="btn gps-on" onClick={turnOnGps}>
            Use a real courier with live GPS
          </button>
        )}

        {order.courierPos && order.status !== 'cancelled' && (
          <section className="panel courier">
            <span className="courier__avatar" aria-hidden="true">
              {order.courier.name[0]}
            </span>
            <span>
              <strong>{order.courier.name}</strong>
              <span className="muted">
                {order.courier.vehicle} · ★ {order.courier.rating.toFixed(2)}
              </span>
            </span>
          </section>
        )}

        <section className="panel">
          <h2>
            {order.restaurant.emoji} {order.restaurant.name} <span className="muted small">#{order.id}</span>
          </h2>
          <p className="muted small">
            To {order.address.label}, {order.address.line}
            {order.note && <> · “{order.note}”</>}
          </p>
          <ul className="receipt">
            {order.items.map((i) => (
              <li key={i.id}>
                <span>
                  {i.qty}× {i.name}
                </span>
                <span>{formatMoney(i.price * i.qty)}</span>
              </li>
            ))}
          </ul>
          <FeeLines pricing={order.pricing} km={order.km} />
          {order.canCancel && (
            <button type="button" className="btn btn--ghost btn--block" onClick={cancel}>
              Cancel order
            </button>
          )}
          {cancelError && (
            <p className="notice notice--error" role="alert">
              {cancelError}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
