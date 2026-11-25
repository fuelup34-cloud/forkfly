import { formatMoney } from '../../shared/core.js';

const STATUS = { done: 'Picked up', rejected: 'Declined', cancelled: 'Cancelled by customer' };
const time = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export function TodayStats({ today }) {
  const cells = [
    ['Orders today', today ? today.orders : '–'],
    ['Sales today', today ? formatMoney(today.sales) : '–'],
    ['Average order', today ? formatMoney(today.average) : '–'],
  ];
  return (
    <dl className="stat-row">
      {cells.map(([label, value]) => (
        <div key={label} className="stat-tile">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TodayHistory({ today }) {
  if (!today?.history.length) return null;
  return (
    <section className="dash-card">
      <h2 className="dash-card__title">Earlier today</h2>
      <div className="table-wrap">
        <table className="table">
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
            {today.history.map((o) => (
              <tr key={o.id}>
                <td>{time(o.placedAt)}</td>
                <td className="mono-text">#{o.id}</td>
                <td>{o.customer}</td>
                <td className="truncate" title={o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}>
                  {o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                </td>
                <td className="num">{formatMoney(o.subtotal)}</td>
                <td>
                  <span className={`pill pill--${o.status}`}>{STATUS[o.status] ?? o.status}</span>
                  {o.status === 'rejected' && o.rejectReason && <span className="muted small table__sub">{o.rejectReason}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
