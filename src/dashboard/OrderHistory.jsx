import { useState } from 'react';
import { Drawer, Empty, Fact, Loading, SearchBox, StatusPill, Tabs, count, money, timeShort } from '../ui/kit.jsx';

const FILTERS = [
  ['all', 'All'],
  ['done', 'Picked up'],
  ['rejected', 'Declined'],
  ['cancelled', 'Cancelled'],
];
const itemsText = (o) => o.items.map((i) => `${i.qty}× ${i.name}`).join(', ');

// Today's finished orders (picked up, declined or cancelled), with search and details.
export default function OrderHistory({ today }) {
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  if (!today) return <Loading />;

  const needle = q.trim().toLowerCase();
  const list = today.history.filter((o) => (status === 'all' || o.status === status) && (!needle || `${o.id} ${o.customer} ${itemsText(o)}`.toLowerCase().includes(needle)));
  const tabs = FILTERS.map(([id, label]) => [id, label, id === 'all' ? today.history.length : today.history.filter((o) => o.status === id).length]);

  return (
    <>
      <div className="toolbar-row dash-toolbar">
        <Tabs value={status} onChange={setStatus} tabs={tabs} />
        <SearchBox value={q} onChange={setQ} placeholder="Order #, customer or dish" />
      </div>
      <section className="dash-card">
        {!list.length ? (
          <Empty icon="receipt" title={today.history.length ? 'No orders match' : 'Nothing finished yet today'}>
            {today.history.length ? 'Try another filter or search.' : 'Orders show up here once they’re picked up, declined or cancelled.'}
          </Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table table--rows">
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Order</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Items</th>
                    <th scope="col" className="num">
                      Subtotal
                    </th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((o) => (
                    <tr key={o.id} onClick={() => setOpen(o)}>
                      <td>{timeShort(o.placedAt)}</td>
                      <td>
                        <button type="button" className="row-link mono-text" onClick={() => setOpen(o)}>
                          #{o.id}
                        </button>
                      </td>
                      <td>{o.customer}</td>
                      <td className="truncate" title={itemsText(o)}>
                        {itemsText(o)}
                      </td>
                      <td className="num">{money(o.subtotal)}</td>
                      <td>
                        <StatusPill status={o.status} />
                        {o.status === 'rejected' && o.rejectReason && <span className="muted small table__sub">{o.rejectReason}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small table-foot">
              {count(list.length)} order{list.length === 1 ? '' : 's'}
            </p>
          </>
        )}
      </section>
      {open && <OrderDrawer order={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function OrderDrawer({ order: o, onClose }) {
  return (
    <Drawer title={`Order #${o.id}`} onClose={onClose}>
      <div className="drawer__status">
        <StatusPill status={o.status} />
        <span className="muted small">Placed at {timeShort(o.placedAt)}</span>
      </div>
      {o.status === 'rejected' && <p className="notice notice--warn">Declined: {o.rejectReason ?? 'no reason given'}.</p>}
      {o.status === 'cancelled' && <p className="notice notice--warn">The customer cancelled this order.</p>}
      <dl className="facts">
        <Fact label="Customer">{o.customer}</Fact>
        <Fact label="Items">{o.itemCount}</Fact>
      </dl>
      <h3 className="drawer__section">What they ordered</h3>
      <dl className="money-lines">
        {o.items.map((i) => (
          <div key={i.id}>
            <dt>
              <strong>{i.qty}×</strong> {i.name}
            </dt>
            <dd>{money(i.price * i.qty)}</dd>
          </div>
        ))}
        <div className="money-lines__total">
          <dt>Subtotal</dt>
          <dd>{money(o.subtotal)}</dd>
        </div>
      </dl>
      {o.note && <p className="ticket__note">“{o.note}”</p>}
    </Drawer>
  );
}
