import { useMemo } from 'react';
import { Link } from '../router.jsx';
import Icon from '../components/Icon.jsx';
import { BarChart, BarList, ChartCard } from '../ui/charts.jsx';
import { Empty, Loading, StatTile, StatusPill, ago, count, hourLabel, money, moneyShort } from '../ui/kit.jsx';

// The restaurant's home page: today's numbers, what's on the board now, sales by hour and top dishes.
// Uses today's summary from the server plus the live board, so it updates as orders move.
export default function Overview({ restaurant, today, kitchen, base }) {
  const live = kitchen.orders;
  const all = useMemo(() => (today && live ? [...live, ...today.history].sort((a, b) => b.placedAt - a.placedAt) : null), [today, live]);

  const hours = useMemo(() => {
    if (!all) return [];
    const counted = all.filter((o) => o.status !== 'rejected' && o.status !== 'cancelled');
    const nowHour = new Date().getHours();
    const first = Math.min(nowHour, 9, ...counted.map((o) => new Date(o.placedAt).getHours()));
    const rows = Array.from({ length: nowHour - first + 1 }, (_, i) => ({ hour: first + i, sales: 0, orders: 0 }));
    for (const o of counted) {
      const row = rows[new Date(o.placedAt).getHours() - first];
      if (row) {
        row.sales += o.subtotal;
        row.orders++;
      }
    }
    return rows;
  }, [all]);

  const dishes = useMemo(() => {
    const map = new Map();
    for (const o of all ?? []) {
      if (o.status === 'rejected' || o.status === 'cancelled') continue;
      for (const i of o.items) {
        const d = map.get(i.id) ?? { name: i.name, qty: 0 };
        d.qty += i.qty;
        map.set(i.id, d);
      }
    }
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 6);
  }, [all]);

  if (!today || !live) return <Loading />;

  const groups = { new: 0, preparing: 0, ready: 0 };
  for (const o of live) groups[o.status] = (groups[o.status] ?? 0) + 1;
  const finished = today.history.filter((o) => o.status === 'done').length;

  return (
    <>
      <dl className="stat-row dash-stats">
        <StatTile label="Orders today" value={count(today.orders)} hint={`${count(finished)} picked up`} />
        <StatTile label="Sales today" value={money(today.sales)} hint="food, before fees" />
        <StatTile label="Average order" value={today.orders ? money(today.average) : '—'} />
        <StatTile label="Declined" value={count(today.declined)} hint={today.declined ? 'check sold-out items' : 'none today'} />
      </dl>

      <div className="dash-split">
        <ChartCard
          title="Sales by hour"
          subtitle="Today, food sales"
          table={{
            columns: [
              ['Hour', (d) => hourLabel(d.hour)],
              ['Orders', (d) => count(d.orders), true],
              ['Sales', (d) => money(d.sales), true],
            ],
            rows: hours,
          }}
        >
          {today.orders ? (
            <BarChart data={hours} value={(d) => d.sales} format={(v, axis) => (axis ? moneyShort(v) : money(v))} xLabel={(d) => hourLabel(d.hour)} tipLabel={(d) => `${hourLabel(d.hour)}–${hourLabel((d.hour + 1) % 24)} · ${count(d.orders)} orders`} label="Sales by hour today" />
          ) : (
            <Empty icon="chart" title="No orders yet today">
              Sales show up here as orders come in.
            </Empty>
          )}
        </ChartCard>

        <section className="dash-card attention">
          <header className="chart-card__head">
            <h2 className="dash-card__title">Right now</h2>
            <span className={`live-chip ${kitchen.live ? '' : 'is-off'}`}>
              <span className="live-dot" aria-hidden="true" />
              {kitchen.live ? 'Live' : 'Reconnecting…'}
            </span>
          </header>
          <ul className="attention__list now-list">
            <NowRow n={groups.new} label="New" hint={groups.new ? 'Waiting for you to accept' : 'Nothing waiting'} tone={groups.new ? 'urgent' : ''} />
            <NowRow n={groups.preparing} label="Preparing" hint="Accepted and cooking" />
            <NowRow n={groups.ready} label="Ready for pickup" hint="Waiting for the courier" />
          </ul>
          <Link to={`${base}/orders`} className={`btn ${groups.new ? '' : 'btn--outline'} btn--block`}>
            {groups.new ? `Accept ${groups.new} new order${groups.new > 1 ? 's' : ''}` : 'Open the orders board'}
          </Link>
          {!kitchen.sound && (
            <button type="button" className="text-btn small now-sound" onClick={kitchen.toggleSound}>
              <Icon name="alert" size={14} /> Turn on the new-order chime
            </button>
          )}
        </section>
      </div>

      <div className="dash-grid-2">
        <ChartCard title="Top dishes" subtitle="Today, by quantity">
          {dishes.length ? <BarList rows={dishes} value={(d) => d.qty} format={(v) => `${count(v)} sold`} name={(d) => d.name} /> : <p className="muted">Your best sellers will show here.</p>}
        </ChartCard>
        <section className="dash-card">
          <header className="chart-card__head">
            <h2 className="dash-card__title">Latest orders</h2>
            <Link to={`${base}/orders`} className="text-btn small">
              All orders
            </Link>
          </header>
          {all.length ? (
            <ul className="recent-list">
              {all.slice(0, 6).map((o) => (
                <li key={o.id}>
                  <span className="recent-list__main">
                    <strong>{o.customer}</strong>
                    <span className="muted small">
                      #{o.id} · {ago(o.placedAt)} · {o.itemCount} item{o.itemCount > 1 ? 's' : ''}
                    </span>
                  </span>
                  <span className="recent-list__side">
                    <span className="recent-list__amount">{money(o.subtotal)}</span>
                    <StatusPill status={o.status} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No orders yet today.</p>
          )}
        </section>
      </div>
    </>
  );
}

function NowRow({ n, label, hint, tone = '' }) {
  return (
    <li className={`now-row ${tone ? `now-row--${tone}` : ''}`}>
      <span className="now-row__count">{n}</span>
      <span className="attention__text">
        <strong>{label}</strong>
        <span className="muted small">{hint}</span>
      </span>
    </li>
  );
}
