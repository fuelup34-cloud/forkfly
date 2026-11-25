import { useEffect, useState } from 'react';
import { Link } from '../router.jsx';
import { adminApi } from './adminApi.js';
import { PageHead } from './AdminApp.jsx';
import { BarChart, BarList, ChartCard, TrendChart } from '../ui/charts.jsx';
import { Loading, RangePicker, StatTile, count, dateShort, hourLabel, money, moneyShort, percent } from '../ui/kit.jsx';

const RANGES = [
  ['7d', '7 days'],
  ['30d', '30 days'],
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const OUTCOME = { delivered: 'Delivered', cancelled: 'Cancelled by customer', rejected: 'Declined by restaurant' };

export default function Analytics() {
  const [range, setRange] = useState('30d');
  const [metric, setMetric] = useState('gmv');
  const [data, setData] = useState(null);

  useEffect(() => {
    let stale = false;
    adminApi.analytics(range).then((d) => !stale && setData(d));
    return () => {
      stale = true;
    };
  }, [range]);

  const days = range === '7d' ? 7 : 30;
  const METRICS = {
    gmv: ['Gross order value', (p) => p.gmv, (v, axis) => (axis ? moneyShort(v) : money(v))],
    net: ['Forkfly revenue', (p) => p.net, (v, axis) => (axis ? moneyShort(v) : money(v))],
    orders: ['Orders', (p) => p.orders, (v) => count(v)],
  };
  const [metricName, metricValue, metricFormat] = METRICS[metric];

  return (
    <>
      <PageHead title="Analytics" subtitle={`The last ${days} days, compared with the ${days} days before.`}>
        <RangePicker value={range} onChange={setRange} ranges={RANGES} />
      </PageHead>
      {!data ? (
        <Loading />
      ) : (
        <>
          <dl className="stat-row dash-stats dash-stats--6">
            <StatTile label="Gross order value" value={money(data.stats.gmv)} now={data.stats.gmv} before={data.previous.gmv} />
            <StatTile label="Forkfly revenue" value={money(data.stats.net)} now={data.stats.net} before={data.previous.net} />
            <StatTile label="Orders" value={count(data.stats.orders)} now={data.stats.orders} before={data.previous.orders} />
            <StatTile label="Average basket" value={money(data.stats.average)} now={data.stats.average} before={data.previous.average} />
            <StatTile label="Cancelled or declined" value={percent(data.stats.cancelRate)} now={data.stats.cancelRate} before={data.previous.cancelRate} better="down" />
            <StatTile label="Customers ordering" value={count(data.customers.active)} hint={`${count(data.customers.new)} new`} />
          </dl>

          <ChartCard
            title={metricName}
            subtitle={`By day, last ${days} days`}
            action={
              <select className="select-sm" value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Measure">
                {Object.entries(METRICS).map(([id, [name]]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            }
            table={{
              columns: [
                ['Day', (p) => dateShort(p.t)],
                ['Orders', (p) => count(p.orders), true],
                ['Order value', (p) => money(p.gmv), true],
                ['Forkfly revenue', (p) => money(p.net), true],
              ],
              rows: data.series,
            }}
          >
            <TrendChart points={data.series} value={metricValue} format={metricFormat} xLabel={(p) => dateShort(p.t)} tipLabel={(p) => new Date(p.t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} label={`${metricName} by day`} height={260} />
          </ChartCard>

          <div className="dash-grid-2">
            <ChartCard
              title="Busiest hours"
              subtitle="Orders by hour of day"
              table={{
                columns: [
                  ['Hour', (d) => hourLabel(d.hour)],
                  ['Orders', (d) => count(d.orders), true],
                ],
                rows: data.byHour,
              }}
            >
              <BarChart data={data.byHour} value={(d) => d.orders} format={(v) => count(v)} xLabel={(d) => hourLabel(d.hour)} tipLabel={(d) => `${hourLabel(d.hour)}–${hourLabel((d.hour + 1) % 24)}`} label="Orders by hour of day" />
            </ChartCard>
            <ChartCard
              title="Busiest days"
              subtitle="Average orders per weekday"
              table={{
                columns: [
                  ['Day', (d) => WEEKDAYS[d.day]],
                  ['Average orders', (d) => count(d.orders), true],
                ],
                rows: data.byWeekday,
              }}
            >
              <BarChart data={data.byWeekday} value={(d) => d.orders} format={(v) => count(v)} xLabel={(d) => WEEKDAYS[d.day]} tipLabel={(d) => `${WEEKDAYS[d.day]} average`} label="Average orders per weekday" />
            </ChartCard>
          </div>

          <div className="dash-grid-2">
            <ChartCard title="Top restaurants" subtitle="By gross order value">
              <BarList
                rows={data.topRestaurants.slice(0, 8)}
                value={(r) => r.gmv}
                format={money}
                name={(r) => (
                  <Link to={`/admin/restaurants/${r.id}`}>
                    {r.name} <span className="muted small">· {count(r.orders)} orders</span>
                  </Link>
                )}
              />
            </ChartCard>
            <ChartCard title="Cuisines" subtitle="Share of orders">
              <BarList rows={data.byCuisine} value={(c) => c.orders} format={(v) => percent(v / data.stats.orders)} name={(c) => c.cuisine} />
            </ChartCard>
          </div>

          <div className="dash-grid-2">
            <ChartCard title="How orders ended" subtitle="Finished orders only">
              <BarList rows={data.outcomes} value={(o) => o.orders} max={data.outcomes.reduce((s, o) => s + o.orders, 0)} format={(v) => `${count(v)}`} name={(o) => OUTCOME[o.status]} />
            </ChartCard>
            <ChartCard title="Customers" subtitle={`Who ordered in the last ${days} days`}>
              <BarList
                rows={[
                  { label: 'Returning customers', n: data.customers.returning },
                  { label: 'First order in this period', n: data.customers.new },
                ]}
                value={(r) => r.n}
                max={data.customers.active}
                format={(v) => `${count(v)} (${percent(v / Math.max(1, data.customers.active), 0)})`}
                name={(r) => r.label}
              />
            </ChartCard>
          </div>
        </>
      )}
    </>
  );
}
