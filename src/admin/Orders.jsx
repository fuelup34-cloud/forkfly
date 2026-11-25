import { useEffect, useState } from 'react';
import { Link } from '../router.jsx';
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
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let stale = false;
    const t = setTimeout(() => adminApi.orders({ status, q }).then((d) => !stale && setData(d)), q ? 200 : 0);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [status, q]);

  return (
    <>
      <PageHead title="Orders" subtitle="Every order on Forkfly, newest first." />
      <div className="toolbar-row dash-toolbar">
        <Tabs value={status} onChange={setStatus} tabs={FILTERS} />
        <SearchBox value={q} onChange={setQ} placeholder="Order #, restaurant, customer" />
      </div>
      <section className="dash-card">
        {!data ? (
          <Loading />
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
      {open && <OrderDrawer order={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function OrderDrawer({ order: o, onClose }) {
  const [done, setDone] = useState('');
  const finished = ['delivered', 'cancelled', 'rejected'].includes(o.status);
  return (
    <Drawer
      title={`Order #${o.id}`}
      onClose={onClose}
      footer={
        <>
          {!finished && (
            <button type="button" className="btn btn--outline btn--danger-outline" onClick={() => setDone('Cancel requested — this will work once the server side is built.')}>
              Cancel order
            </button>
          )}
          {o.status === 'delivered' && (
            <button type="button" className="btn btn--outline" onClick={() => setDone('Refund requested — this will work once the server side is built.')}>
              Issue refund
            </button>
          )}
        </>
      }
    >
      {done && <p className="notice notice--info">{done}</p>}
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
