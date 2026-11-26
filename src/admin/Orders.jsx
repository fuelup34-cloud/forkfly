import { useEffect, useState } from 'react';
import { Link } from '../router.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import { adminApi } from './adminApi.js';
import { PageHead } from './AdminApp.jsx';
import { Drawer, Empty, Fact, Loading, SearchBox, StatusPill, Tabs, ago, count, dateShort, money, timeShort } from '../ui/kit.jsx';

const FILTERS = [
  ['all', 'All'],
  ['live', 'In progress'],
  ['delivered', 'Delivered'],
  ['cancelled', 'Cancelled'],
  ['rejected', 'Declined'],
];

export default function Orders() {
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const [version, setVersion] = useState(0); // bumped to reload after a change

  useEffect(() => {
    let stale = false;
    const t = setTimeout(
      () =>
        adminApi
          .orders({ status, q })
          .then((d) => !stale && (setData(d), setError('')))
          .catch((err) => !stale && setError(err.message)),
      q ? 200 : 0
    );
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [status, q, version]);

  return (
    <>
      <PageHead title="Orders" subtitle="Every order on Forkfly, newest first." />
      <div className="toolbar-row dash-toolbar">
        <Tabs value={status} onChange={setStatus} tabs={FILTERS} />
        <SearchBox value={q} onChange={setQ} placeholder="Order #, restaurant, customer" />
      </div>
      {error && <p className="notice notice--error">{error}</p>}
      <section className="dash-card">
        {!data ? (
          !error && <Loading />
        ) : !data.orders.length ? (
          <Empty title="No orders match">Try another filter or search.</Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table table--rows">
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col">Placed</th>
                    <th scope="col">Restaurant</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Rider</th>
                    <th scope="col" className="num">
                      Items
                    </th>
                    <th scope="col" className="num">
                      Total
                    </th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((o) => (
                    <tr key={o.id} onClick={() => setOpen(o)}>
                      <td>
                        <button type="button" className="row-link mono-text" onClick={() => setOpen(o)}>
                          #{o.id}
                        </button>
                      </td>
                      <td>
                        {dateShort(o.placedAt)} <span className="muted">{timeShort(o.placedAt)}</span>
                      </td>
                      <td>{o.restaurant.name}</td>
                      <td>{o.customer}</td>
                      <td>{o.rider ?? <span className="muted">—</span>}</td>
                      <td className="num">{o.items}</td>
                      <td className="num">{money(o.total)}</td>
                      <td>
                        <StatusPill status={o.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small table-foot">
              Showing {count(data.orders.length)} of {count(data.total)} orders
            </p>
          </>
        )}
      </section>
      {open && (
        <OrderDrawer
          order={open}
          onClose={() => setOpen(null)}
          onChange={(updated) => {
            setOpen(updated);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </>
  );
}

function OrderDrawer({ order: o, onClose, onChange }) {
  const [dialog, ask] = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const finished = ['delivered', 'cancelled', 'rejected'].includes(o.status);

  async function cancel() {
    const ok = await ask({
      title: `Cancel order #${o.id}?`,
      body: `The customer and ${o.restaurant.name} will see it as cancelled straight away. This can’t be undone.`,
      confirm: 'Cancel order',
      cancel: 'Keep order',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      onChange(await adminApi.cancelOrder(o.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title={`Order #${o.id}`}
      onClose={onClose}
      footer={
        <>
          {!finished && (
            <button type="button" className="btn btn--outline btn--danger-outline" disabled={busy} onClick={cancel}>
              {busy ? 'Cancelling…' : 'Cancel order'}
            </button>
          )}
          {o.status === 'delivered' && (
            <button type="button" className="btn btn--outline" disabled title="Refunds arrive with card payments. Checkout doesn’t take payment yet.">
              Issue refund
            </button>
          )}
        </>
      }
    >
      {error && <p className="notice notice--error">{error}</p>}
      {dialog}
      <div className="drawer__status">
        <StatusPill status={o.status} />
        <span className="muted small">Placed {ago(o.placedAt)}</span>
      </div>
      {o.rejectReason && <p className="notice notice--warn">Declined by the restaurant: {o.rejectReason}</p>}
      <dl className="facts">
        <Fact label="Restaurant">
          <Link to={`/admin/restaurants/${o.restaurant.id}`}>{o.restaurant.name}</Link>
        </Fact>
        <Fact label="Customer">{o.customer}</Fact>
        <Fact label="Rider">{o.rider ?? '—'}</Fact>
        <Fact label="Placed">
          {dateShort(o.placedAt)}, {timeShort(o.placedAt)}
        </Fact>
        {o.deliveryMin && <Fact label="Delivered in">{o.deliveryMin} min</Fact>}
        <Fact label="Items">{o.items}</Fact>
      </dl>
      <h3 className="drawer__section">Payment</h3>
      <dl className="money-lines">
        <div>
          <dt>Food</dt>
          <dd>{money(o.subtotal)}</dd>
        </div>
        <div>
          <dt>Delivery and service fees</dt>
          <dd>{money(o.fees)}</dd>
        </div>
        <div>
          <dt>Rider tip</dt>
          <dd>{money(o.tip)}</dd>
        </div>
        <div className="money-lines__total">
          <dt>Customer paid</dt>
          <dd>{money(o.total)}</dd>
        </div>
      </dl>
    </Drawer>
  );
}
