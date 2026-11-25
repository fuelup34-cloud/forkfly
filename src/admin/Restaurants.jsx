import { useEffect, useRef, useState } from 'react';
import { Link, navigate } from '../router.jsx';
import Icon from '../components/Icon.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import { adminApi } from './adminApi.js';
import { PageHead } from './AdminApp.jsx';
import { ChartCard, TrendChart } from '../ui/charts.jsx';
import { LiveTable } from './Overview.jsx';
import { Avatar, Empty, Fact, Loading, SearchBox, StatTile, StatusPill, Tabs, ago, count, dateShort, money, moneyShort, percent } from '../ui/kit.jsx';

const STATUSES = ['all', 'pending', 'active', 'paused', 'suspended'];
const STATUS_TAB = { all: 'All', pending: 'Applications', active: 'Active', paused: 'Paused', suspended: 'Suspended' };

export default function Restaurants({ onChange }) {
  const [list, setList] = useState(null);
  const [status, setStatus] = useState(() => new URLSearchParams(location.search).get('status') ?? 'all');
  const [q, setQ] = useState('');
  const [dialog, ask] = useConfirm();

  const load = () => adminApi.restaurants().then(setList);
  useEffect(() => {
    load();
  }, []);

  async function approve(r) {
    if (!(await ask({ title: `Approve ${r.name}?`, body: 'They’ll go live on Forkfly and start receiving orders.', confirm: 'Approve' }))) return;
    await adminApi.setRestaurantStatus(r.id, 'active');
    await load();
    onChange?.();
  }

  const needle = q.trim().toLowerCase();
  const shown = (list ?? []).filter((r) => (status === 'all' || r.status === status) && (!needle || `${r.name} ${r.cuisine} ${r.owner.name}`.toLowerCase().includes(needle)));
  const tabs = STATUSES.map((s) => [s, STATUS_TAB[s], list ? (s === 'all' ? list.length : list.filter((r) => r.status === s).length) : null]);

  return (
    <>
      <PageHead title="Restaurants" subtitle="Partners and Forkfly’s own kitchens." />
      <div className="toolbar-row dash-toolbar">
        <Tabs value={status} onChange={setStatus} tabs={tabs} />
        <SearchBox value={q} onChange={setQ} placeholder="Name, cuisine or owner" />
      </div>
      <section className="dash-card">
        {!list ? (
          <Loading />
        ) : !shown.length ? (
          <Empty icon="store" title={status === 'pending' ? 'No applications waiting' : 'No restaurants match'} />
        ) : (
          <div className="table-wrap">
            <table className="table table--rows">
              <thead>
                <tr>
                  <th scope="col">Restaurant</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">
                    Orders (30d)
                  </th>
                  <th scope="col" className="num">
                    Order value (30d)
                  </th>
                  <th scope="col" className="num">
                    Rating
                  </th>
                  <th scope="col">Joined</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} onClick={() => navigate(`/admin/restaurants/${r.id}`)}>
                    <td>
                      <span className="cell-entity">
                        <Avatar name={r.name} colors={r.colors} />
                        <span>
                          <Link to={`/admin/restaurants/${r.id}`} onClick={(e) => e.stopPropagation()}>
                            <strong>{r.name}</strong>
                          </Link>
                          <span className="muted small table__sub">
                            {r.cuisine}
                            {r.isOwn && ' · Forkfly kitchen'}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td>{r.owner.name}</td>
                    <td>
                      <StatusPill status={r.status} />
                    </td>
                    <td className="num">{r.status === 'pending' ? '—' : count(r.orders30)}</td>
                    <td className="num">{r.status === 'pending' ? '—' : money(r.gmv30)}</td>
                    <td className="num">{r.rating ? `★ ${r.rating.toFixed(1)}` : '—'}</td>
                    <td>{r.status === 'pending' ? ago(r.joinedAt) : dateShort(r.joinedAt)}</td>
                    <td className="num" onClick={(e) => e.stopPropagation()}>
                      {r.status === 'pending' ? (
                        <button type="button" className="btn btn--sm" onClick={() => approve(r)}>
                          Approve
                        </button>
                      ) : (
                        <span className="link-arrow" aria-hidden="true" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {dialog}
    </>
  );
}

export function RestaurantDetail({ id, onChange }) {
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(null); // { title, confirm, status }
  const [dialog, ask] = useConfirm();

  useEffect(() => {
    adminApi
      .restaurant(id)
      .then(setR)
      .catch((err) => setError(err.message));
  }, [id]);

  async function setStatus(status, note = '') {
    setBusy(true);
    try {
      setR(await adminApi.setRestaurantStatus(id, status, note));
      onChange?.();
    } finally {
      setBusy(false);
    }
  }
  async function approve() {
    if (await ask({ title: `Approve ${r.name}?`, body: 'They’ll go live on Forkfly and start receiving orders.', confirm: 'Approve' })) setStatus('active');
  }
  async function reinstate() {
    if (await ask({ title: `Reinstate ${r.name}?`, body: 'They’ll be able to take orders again.', confirm: 'Reinstate' })) setStatus('active');
  }

  if (error)
    return (
      <>
        <BackLink />
        <Empty icon="store" title={error} />
      </>
    );
  if (!r)
    return (
      <>
        <BackLink />
        <Loading />
      </>
    );

  const live = r.status !== 'pending';
  return (
    <>
      <BackLink />
      <header className="dash-top detail-head">
        <div className="cell-entity">
          <Avatar name={r.name} colors={r.colors} />
          <div>
            <h1>{r.name}</h1>
            <p className="muted small dash-subtitle">
              {r.cuisine} · {r.isOwn ? 'Forkfly kitchen' : 'Partner'} · <StatusPill status={r.status} />
            </p>
          </div>
        </div>
        <div className="dash-top__actions">
          {live && (
            <Link to={`/r/${r.id}`} className="btn btn--outline btn--sm">
              Public page
            </Link>
          )}
          {r.status === 'pending' && (
            <>
              <button type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={() => setReason({ title: `Decline ${r.name}?`, confirm: 'Decline application', status: 'suspended' })}>
                Decline
              </button>
              <button type="button" className="btn btn--sm" disabled={busy} onClick={approve}>
                Approve
              </button>
            </>
          )}
          {(r.status === 'active' || r.status === 'paused') && (
            <button type="button" className="btn btn--sm btn--danger" disabled={busy} onClick={() => setReason({ title: `Suspend ${r.name}?`, confirm: 'Suspend', status: 'suspended' })}>
              Suspend
            </button>
          )}
          {r.status === 'suspended' && (
            <button type="button" className="btn btn--sm" disabled={busy} onClick={reinstate}>
              Reinstate
            </button>
          )}
        </div>
      </header>

      {r.status === 'pending' && (
        <p className="notice notice--info">
          <strong>New application, {ago(r.joinedAt)}.</strong> Check the details below, then approve to put {r.name} live.
        </p>
      )}
      {r.status === 'suspended' && r.note && (
        <p className="notice notice--warn">
          <strong>Suspended:</strong> {r.note}
        </p>
      )}

      {live && (
        <dl className="stat-row dash-stats">
          <StatTile label="Orders (30 days)" value={count(r.orders30)} />
          <StatTile label="Order value (30 days)" value={money(r.gmv30)} />
          <StatTile label="Cancelled or declined" value={percent(r.cancelRate)} />
          <StatTile label="Average delivery" value={r.avgDelivery ? `${r.avgDelivery} min` : '—'} />
          <StatTile label="Rating" value={r.rating ? `★ ${r.rating.toFixed(1)}` : '—'} hint={`${count(r.reviews)} reviews`} />
        </dl>
      )}

      <div className="dash-split dash-split--detail">
        {live ? (
          <ChartCard
            title="Order value"
            subtitle="By day, last 30 days"
            table={{
              columns: [
                ['Day', (p) => dateShort(p.t)],
                ['Orders', (p) => count(p.orders), true],
                ['Order value', (p) => money(p.gmv), true],
              ],
              rows: r.series,
            }}
          >
            <TrendChart points={r.series} value={(p) => p.gmv} format={(v, axis) => (axis ? moneyShort(v) : money(v))} xLabel={(p) => dateShort(p.t)} tipLabel={(p) => `${dateShort(p.t)} · ${count(p.orders)} orders`} label={`${r.name} order value by day`} />
          </ChartCard>
        ) : (
          <section className="dash-card">
            <h2 className="dash-card__title">Application checklist</h2>
            <ul className="checklist">
              <li className="is-done">Owner account created</li>
              <li className={r.menuItems >= 5 ? 'is-done' : ''}>Menu has at least 5 items ({r.menuItems} so far)</li>
              <li>Cover photo uploaded</li>
              <li>Food-safety certificate checked</li>
            </ul>
          </section>
        )}
        <Details r={r} onSave={setR} />
      </div>

      {live && (
        <section className="dash-card">
          <h2 className="dash-card__title">Recent orders</h2>
          {r.recent.length ? <LiveTable orders={r.recent} /> : <p className="muted">No orders yet.</p>}
        </section>
      )}
      {reason && (
        <ReasonDialog
          {...reason}
          onClose={async (note) => {
            const next = reason.status;
            setReason(null);
            if (note != null) await setStatus(next, note);
          }}
        />
      )}
      {dialog}
    </>
  );
}

function Details({ r, onSave }) {
  const [commission, setCommission] = useState(r.commission);
  const [saved, setSaved] = useState(false);
  useEffect(() => setCommission(r.commission), [r.commission]);
  async function save() {
    onSave(await adminApi.setCommission(r.id, commission));
    setSaved(true);
  }
  return (
    <section className="dash-card">
      <h2 className="dash-card__title">Details</h2>
      <dl className="facts facts--1">
        <Fact label="Owner">{r.owner.name}</Fact>
        <Fact label="Email">
          <a href={`mailto:${r.owner.email}`}>{r.owner.email}</a>
        </Fact>
        <Fact label="Phone">{r.phone}</Fact>
        <Fact label="Joined">{dateShort(r.joinedAt)}</Fact>
        <Fact label="Menu items">{r.menuItems}</Fact>
        <Fact label="Usual prep time">{r.prepMin} min</Fact>
      </dl>
      <div className="inline-field">
        <label className="field">
          <span>Commission on food sales</span>
          <select
            value={commission}
            onChange={(e) => {
              setCommission(Number(e.target.value));
              setSaved(false);
            }}
            disabled={r.isOwn}
          >
            {[0, 0.1, 0.12, 0.15, 0.18, 0.2, 0.25].map((c) => (
              <option key={c} value={c}>
                {percent(c, 0)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn--sm btn--outline" disabled={commission === r.commission} onClick={save}>
          Save
        </button>
      </div>
      {r.isOwn && <p className="muted small">Forkfly’s own kitchens don’t pay commission.</p>}
      {saved && <p className="saved-note">Saved</p>}
    </section>
  );
}

function BackLink() {
  return (
    <Link to="/admin/restaurants" className="back-link">
      ‹ All restaurants
    </Link>
  );
}

// Asks for a short reason before suspending or declining. Calls onClose(reason) or onClose(null).
export function ReasonDialog({ title, confirm, onClose }) {
  const ref = useRef(null);
  const [text, setText] = useState('');
  useEffect(() => {
    const d = ref.current;
    d.showModal();
    return () => d.open && d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet sheet--small"
      onCancel={(e) => {
        e.preventDefault();
        onClose(null);
      }}
    >
      <form
        className="sheet__body"
        onSubmit={(e) => {
          e.preventDefault();
          onClose(text.trim());
        }}
      >
        <h2 className="sheet__title">{title}</h2>
        <label className="field">
          <span>Reason (they’ll see this)</span>
          <textarea required minLength={5} rows={3} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        </label>
        <div className="sheet__actions">
          <button type="button" className="btn btn--outline" onClick={() => onClose(null)}>
            Cancel
          </button>
          <button type="submit" className="btn btn--danger">
            <Icon name="alert" size={16} /> {confirm}
          </button>
        </div>
      </form>
    </dialog>
  );
}
