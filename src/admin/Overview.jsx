import { useEffect, useState } from 'react';
import { Link } from '../router.jsx';
import Icon from '../components/Icon.jsx';
import { RANGES, adminApi } from './adminApi.js';
import { PageHead } from './AdminApp.jsx';
import { ChartCard, TrendChart } from '../ui/charts.jsx';
import { Avatar, Loading, RangePicker, StatTile, StatusPill, ago, count, dateShort, money, moneyShort, percent, timeShort } from '../ui/kit.jsx';

const GREETING = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export default function Overview() {
  const [range, setRange] = useState('today');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stale = false;
    adminApi
      .overview(range)
      .then((d) => !stale && setData(d))
      .catch((err) => !stale && setError(err.message));
    return () => {
      stale = true;
    };
  }, [range]);

  const byHour = range === 'today';
  const xLabel = (p) => (byHour ? timeShort(p.t).replace(':00', '') : dateShort(p.t));
  const prevName = range === 'today' ? 'vs. yesterday' : `vs. previous ${range === '7d' ? '7' : '30'} days`;

  return (
    <>
      <PageHead title={`${GREETING()}`} subtitle="Here’s how Forkfly is doing.">
        <RangePicker value={range} onChange={setRange} ranges={RANGES} />
      </PageHead>
      {error && <p className="notice notice--error">{error}</p>}
      {!data ? (
        <Loading />
      ) : (
        <>
          <dl className="stat-row dash-stats">
            <StatTile label="Orders" value={count(data.stats.orders)} now={data.stats.orders} before={data.previous.orders} hint={prevName} />
            <StatTile label="Gross order value" value={money(data.stats.gmv)} now={data.stats.gmv} before={data.previous.gmv} hint={prevName} />
            <StatTile label="Forkfly revenue" value={money(data.stats.net)} now={data.stats.net} before={data.previous.net} hint="fees + commission" />
            <StatTile label="Average delivery" value={`${data.stats.avgDelivery} min`} now={data.stats.avgDelivery} before={data.previous.avgDelivery} better="down" />
            <StatTile label="Riders online" value={`${data.ridersOnline} / ${data.ridersApproved}`} hint="approved riders" />
          </dl>

          <div className="dash-split">
            <ChartCard
              title="Gross order value"
              subtitle={byHour ? 'By hour, today' : `By day, last ${range === '7d' ? '7' : '30'} days`}
              table={{
                columns: [
                  [byHour ? 'Hour' : 'Day', xLabel],
                  ['Orders', (p) => count(p.orders), true],
                  ['Order value', (p) => money(p.gmv), true],
                ],
                rows: data.series,
              }}
            >
              <TrendChart points={data.series} value={(p) => p.gmv} format={(v, axis) => (axis ? moneyShort(v) : money(v))} xLabel={xLabel} tipLabel={(p) => `${byHour ? timeShort(p.t) : dateShort(p.t)} · ${count(p.orders)} orders`} label="Gross order value over time" />
            </ChartCard>
            <Attention data={data.attention} />
          </div>

          <section className="dash-card">
            <header className="chart-card__head">
              <h2 className="dash-card__title">Live orders</h2>
              <Link to="/admin/orders" className="text-btn small">
                All orders
              </Link>
            </header>
            {data.live.length ? <LiveTable orders={data.live} /> : <p className="muted">No orders in progress right now.</p>}
          </section>
        </>
      )}
    </>
  );
}

function Attention({ data }) {
  const total = data.restaurants.length + data.riders.length + data.slowRestaurants.length;
  return (
    <section className="dash-card attention">
      <h2 className="dash-card__title">Needs attention {total > 0 && <span className="nav-badge">{total}</span>}</h2>
      {total === 0 && <p className="muted">All caught up.</p>}
      <ul className="attention__list">
        {data.restaurants.map((r) => (
          <li key={r.id}>
            <Avatar name={r.name} colors={r.colors} />
            <span className="attention__text">
              <strong>{r.name}</strong>
              <span className="muted small">
                Restaurant application · {ago(r.joinedAt)}
              </span>
            </span>
            <Link to={`/admin/restaurants/${r.id}`} className="btn btn--sm btn--outline">
              Review
            </Link>
          </li>
        ))}
        {data.riders.map((r) => (
          <li key={r.id}>
            <Avatar name={r.name} />
            <span className="attention__text">
              <strong>{r.name}</strong>
              <span className="muted small">
                Rider application · {r.vehicle} · {ago(r.joinedAt)}
              </span>
            </span>
            <Link to="/admin/riders?status=pending" className="btn btn--sm btn--outline">
              Review
            </Link>
          </li>
        ))}
        {data.slowRestaurants.map((r) => (
          <li key={r.id}>
            <span className="attention__icon">
              <Icon name="alert" size={16} />
            </span>
            <span className="attention__text">
              <strong>{r.name}</strong>
              <span className="muted small">{percent(r.cancelRate)} of orders cancelled or declined this week</span>
            </span>
            <Link to={`/admin/restaurants/${r.id}`} className="btn btn--sm btn--outline">
              View
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LiveTable({ orders }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Placed</th>
            <th scope="col">Restaurant</th>
            <th scope="col">Customer</th>
            <th scope="col">Rider</th>
            <th scope="col" className="num">
              Total
            </th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td className="mono-text">#{o.id}</td>
              <td>{ago(o.placedAt)}</td>
              <td>
                <Link to={`/admin/restaurants/${o.restaurant.id}`}>{o.restaurant.name}</Link>
              </td>
              <td>{o.customer}</td>
              <td>{o.rider ?? <span className="muted">Not assigned</span>}</td>
              <td className="num">{money(o.total)}</td>
              <td>
                <StatusPill status={o.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
