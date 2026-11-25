import { useMemo, useState } from 'react';
import { PREP_CHOICES, formatMoney, toRealMinutes } from '../../shared/core.js';
import { dash } from '../api.js';
import Icon from '../components/Icon.jsx';
import { useTicker } from './useBoard.js';

const ACCEPT_WITHIN_MS = 10 * 60 * 1000; // matches the server
const DECLINE_REASONS = [
  ['busy', 'Too busy'],
  ['sold_out', 'Item sold out'],
  ['closing', 'Closing soon'],
];

const ago = (ms) => {
  const m = Math.floor(ms / 60_000);
  return m < 1 ? 'just now' : m === 1 ? '1 min ago' : `${m} min ago`;
};
const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const nearestPrep = (m) => PREP_CHOICES.reduce((best, c) => (Math.abs(c - m) < Math.abs(best - m) ? c : best), PREP_CHOICES[1]);

// `kitchen` comes from useKitchen in the dashboard shell (live orders, sound, alerts).
export default function OrdersBoard({ restaurant, kitchen }) {
  const { orders, error, live, update, serverNow, sound, toggleSound } = kitchen;
  useTicker(1000);

  const groups = useMemo(() => {
    const g = { new: [], preparing: [], ready: [] };
    for (const o of orders ?? []) g[o.status]?.push(o);
    g.new.sort((a, b) => a.placedAt - b.placedAt);
    g.preparing.sort((a, b) => a.readyBy - b.readyBy);
    return g;
  }, [orders]);

  const now = serverNow();
  const act = async (order, action, body) => {
    const updated = await dash.orderAction(restaurant.id, order.id, action, body);
    update(updated);
  };

  return (
    <div className="board">
      <div className="board__bar">
        <span className={`live-chip ${live ? '' : 'is-off'}`}>
          <span className="live-dot" aria-hidden="true" />
          {live ? 'Live — updates by itself' : 'Reconnecting…'}
        </span>
        <label className="sound-toggle">
          <span>{sound ? 'Chime on' : 'Chime off'}</span>
          <span className="switch">
            <input type="checkbox" checked={sound} onChange={toggleSound} />
            <span className="switch__track" aria-hidden="true" />
          </span>
          <span className="visually-hidden">Play a chime for new orders</span>
        </label>
      </div>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      {restaurant.status !== 'active' && (
        <p className="notice notice--warn">
          {restaurant.status === 'paused'
            ? 'You’re paused, so customers can’t place new orders. Orders already placed still show here.'
            : restaurant.status === 'pending'
              ? 'Your restaurant is waiting for approval. Orders will appear here once you’re live.'
              : 'This restaurant is suspended. Please contact Forkfly.'}
        </p>
      )}

      <div className="board__cols">
        <Column title="New" count={groups.new.length} tone="new" empty="New orders appear here, with a chime if sound is on.">
          {groups.new.map((o) => (
            <NewOrder key={o.id} order={o} now={now} act={act} />
          ))}
        </Column>
        <Column title="Preparing" count={groups.preparing.length} tone="prep" empty="Accepted orders you’re cooking.">
          {groups.preparing.map((o) => (
            <PreparingOrder key={o.id} order={o} now={now} act={act} />
          ))}
        </Column>
        <Column title="Ready for pickup" count={groups.ready.length} tone="ready" empty="Bagged and waiting for the courier.">
          {groups.ready.map((o) => (
            <ReadyOrder key={o.id} order={o} now={now} />
          ))}
        </Column>
      </div>
      {orders === null && !error && <p className="muted center">Loading orders…</p>}
    </div>
  );
}

function Column({ title, count, tone, empty, children }) {
  return (
    <section className={`board-col board-col--${tone}`} aria-label={title}>
      <h2 className="board-col__head">
        <span className="board-col__dot" aria-hidden="true" />
        {title} <span className={`board-col__count ${count ? 'has-items' : ''}`}>{count}</span>
      </h2>
      <div className="board-col__list">{count ? children : <p className="board-col__empty">{empty}</p>}</div>
    </section>
  );
}

function OrderHead({ order, now, right }) {
  return (
    <div className="ticket__head">
      <div>
        <strong className="ticket__customer">{order.customer}</strong>
        <span className="ticket__meta">
          #{order.id} · {ago(now - order.placedAt)}
        </span>
      </div>
      {right}
    </div>
  );
}

function Items({ order }) {
  return (
    <>
      <ul className="ticket__items">
        {order.items.map((i) => (
          <li key={i.id}>
            <span className="ticket__qty">{i.qty}×</span> {i.name}
          </li>
        ))}
      </ul>
      {order.note && <p className="ticket__note">“{order.note}”</p>}
      <p className="ticket__total">
        <span>
          {order.itemCount} item{order.itemCount > 1 ? 's' : ''}
        </span>
        <strong>{formatMoney(order.subtotal)}</strong>
      </p>
    </>
  );
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function NewOrder({ order, now, act }) {
  const [prep, setPrep] = useState(() => nearestPrep(order.estimatePrepMinutes ?? 15));
  const [declining, setDeclining] = useState(false);
  const { busy, error, run } = useAction();
  const left = order.placedAt + ACCEPT_WITHIN_MS - now;
  if (!order.manual) return <AutoOrder order={order} now={now} />;

  return (
    <article className="ticket ticket--new">
      <OrderHead order={order} now={now} right={
          <span className={`ticket__timer ${left < 120_000 ? 'is-urgent' : ''}`} title="Time left to accept before it’s declined automatically">
            {clock(left)} to accept
          </span>
        } />
      <Items order={order} />
      {!declining ? (
        <>
          <div className="ticket__prep" role="radiogroup" aria-label="Prep time">
            <span className="ticket__label">Ready in</span>
            {PREP_CHOICES.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={prep === m} className={`chip chip--sm ${prep === m ? 'is-active' : ''}`} onClick={() => setPrep(m)}>
                {m} min
              </button>
            ))}
          </div>
          <div className="ticket__actions">
            <button type="button" className="btn btn--outline" disabled={busy} onClick={() => setDeclining(true)}>
              Decline
            </button>
            <button type="button" className="btn ticket__primary" disabled={busy} onClick={() => run(() => act(order, 'accept', { prepMinutes: prep }))}>
              Accept · {prep} min
            </button>
          </div>
        </>
      ) : (
        <div className="ticket__decline">
          <span className="ticket__label">Why can’t you take it?</span>
          <div className="ticket__reasons">
            {DECLINE_REASONS.map(([id, label]) => (
              <button key={id} type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={() => run(() => act(order, 'reject', { reason: id }))}>
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="text-btn" onClick={() => setDeclining(false)}>
            Back
          </button>
        </div>
      )}
      {error && <p className="ticket__error">{error}</p>}
    </article>
  );
}

function CourierLine({ order, now }) {
  const c = order.courier;
  if (!c) return null;
  const first = c.name.split(' ')[0];
  let text;
  if (!c.phase) text = `Finding a courier…`;
  else if (c.phase === 'to_restaurant') text = `${first} arrives in ${Math.max(1, toRealMinutes(c.arrivesAt - now))} min`;
  else text = `${first} is here`;
  return (
    <p className={`ticket__courier ${c.phase === 'at_restaurant' ? 'is-here' : ''}`}>
      <Icon name="bike" size={16} /> {text} <span className="muted">· {c.vehicle}</span>
    </p>
  );
}

function PreparingOrder({ order, now, act }) {
  const { busy, error, run } = useAction();
  const left = order.readyBy - now;
  const late = left < 0;
  if (!order.manual) return <AutoOrder order={order} now={now} />;
  return (
    <article className={`ticket ticket--prep ${late ? 'is-late' : ''}`}>
      <OrderHead
        order={order}
        now={now}
        right={<span className={`ticket__timer ${late ? 'is-urgent' : ''}`}>{late ? 'Due now' : `${Math.max(1, toRealMinutes(left))} min`}</span>}
      />
      <Items order={order} />
      <CourierLine order={order} now={now} />
      <div className="ticket__actions">
        <button type="button" className="btn btn--outline" disabled={busy} onClick={() => run(() => act(order, 'delay', { minutes: 5 }))}>
          +5 min
        </button>
        <button type="button" className="btn ticket__primary" disabled={busy} onClick={() => run(() => act(order, 'ready'))}>
          Mark ready
        </button>
      </div>
      {error && <p className="ticket__error">{error}</p>}
    </article>
  );
}

function ReadyOrder({ order, now }) {
  return (
    <article className="ticket ticket--ready">
      <OrderHead order={order} now={now} right={<span className="ticket__badge">Ready</span>} />
      <Items order={order} />
      <CourierLine order={order} now={now} />
    </article>
  );
}

// Orders placed before this restaurant had staff run themselves, so there's nothing to press.
function AutoOrder({ order, now }) {
  return (
    <article className="ticket">
      <OrderHead order={order} now={now} />
      <Items order={order} />
      <p className="muted small">Handled automatically.</p>
    </article>
  );
}
