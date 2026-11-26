import { Suspense, lazy, useState } from 'react';
import { STEPS, TIME_SCALE, formatMoney, toRealMinutes } from '../../shared/core.js';
import { api, signInLink } from '../api.js';
import Icon from './Icon.jsx';
import Monogram from './Monogram.jsx';
import { useConfirm } from './ConfirmDialog.jsx';
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
      return o.timeline.manual ? `Waiting for ${o.restaurant.name} to confirm your order` : `Sending your order to ${o.restaurant.name}…`;
    case 'preparing':
      return o.courierPhase === 'at_restaurant' ? `${c} is waiting while your food is finished` : `${o.restaurant.name} is preparing your food`;
    case 'ready':
      return o.courierPhase === 'at_restaurant' ? `${c} is picking up your food` : `Your food is ready — ${c} is almost at the restaurant`;
    case 'on_the_way':
      return o.almostThere ? `${c} is arriving now` : `${c} is on the way with your food`;
    case 'delivered':
      return 'Delivered. Enjoy your meal!';
    case 'rejected':
      return `${o.restaurant.name} couldn’t take your order`;
    default:
      return 'Order cancelled';
  }
}

const stepIndex = (status) => ({ placed: 0, preparing: 1, ready: 1, on_the_way: 2, delivered: 3 })[status] ?? -1;

export default function Tracking({ id, me }) {
  const { order, setOrder, error, live } = useLiveOrder(id, !!me?.user);
  const [cancelError, setCancelError] = useState('');
  const [dialog, ask] = useConfirm();

  if (me && !me.user)
    return (
      <div className="empty">
        <Icon name="receipt" size={48} className="empty__icon" />
        <h1>Sign in to follow your order</h1>
        <Link to={signInLink()} className="btn">
          Sign in
        </Link>
      </div>
    );

  if (error && !order)
    return (
      <div className="empty">
        <Icon name="search" size={48} className="empty__icon" />
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
    const paid = order.payment?.status === 'paid';
    const ok = await ask({ title: 'Cancel this order?', body: paid ? `You’ll get a full refund of ${formatMoney(order.payment.amount)} to your card.` : 'You won’t be charged.', confirm: 'Cancel order', cancel: 'Keep order', danger: true });
    if (!ok) return;
    setCancelError('');
    try {
      setOrder(await api.cancel(order.id));
    } catch (err) {
      setCancelError(err.message);
    }
  }

  return (
    <div className="page tracking">
      {dialog}
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
          {order.status === 'rejected' && (
            <p className="muted">
              {order.rejectReason}. {order.payment ? 'Your payment is refunded in full.' : 'You haven’t been charged.'}{' '}
              <Link to="/" className="text-link">
                Find another restaurant
              </Link>
            </p>
          )}
          {order.status === 'placed' && order.timeline.manual && <p className="muted">Restaurants usually confirm within a couple of minutes.</p>}
          {order.status !== 'cancelled' && order.status !== 'rejected' && (
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

        {order.courierPos && order.active && (
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
          <h2 className="with-mono">
            <Monogram name={order.restaurant.name} colors={order.restaurant.colors} image={order.restaurant.coverImage} size="sm" />
            {order.restaurant.name} <span className="muted small">#{order.id}</span>
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
          {order.payment && <PaymentLine payment={order.payment} />}
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

const BRANDS = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover', diners: 'Diners Club', jcb: 'JCB', unionpay: 'UnionPay' };

// How the order was paid, and whether the money has gone back.
function PaymentLine({ payment: p }) {
  const card = p.last4 ? `${BRANDS[p.brand] ?? 'Card'} •••• ${p.last4}` : 'card';
  const refunded = p.status === 'refunded';
  return (
    <p className={`pay-line ${refunded ? 'is-refunded' : ''}`}>
      <Icon name={refunded ? 'receipt' : 'check'} size={16} />
      <span>
        {refunded ? (
          <>
            <strong>Refunded {formatMoney(p.amount)}</strong> to {card}
            <span className="muted small"> · It can take 5–10 business days to show on your statement.</span>
          </>
        ) : (
          <>
            <strong>Paid {formatMoney(p.amount)}</strong> with {card}
          </>
        )}
      </span>
    </p>
  );
}
