import { useEffect, useState } from 'react';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import { adminApi } from './adminApi.js';
import { PageHead } from './AdminApp.jsx';
import { ReasonDialog } from './Restaurants.jsx';
import { Avatar, Drawer, Empty, Fact, Loading, SearchBox, StatTile, StatusPill, Tabs, ago, count, dateShort, money, percent } from '../ui/kit.jsx';

const TABS = [
  ['all', 'All'],
  ['pending', 'Applications'],
  ['approved', 'Approved'],
  ['suspended', 'Suspended'],
];

export default function Riders({ onChange }) {
  const [list, setList] = useState(null);
  const [status, setStatus] = useState(() => new URLSearchParams(location.search).get('status') ?? 'all');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = () => adminApi.riders().then(setList);
  useEffect(() => {
    load();
  }, []);

  const needle = q.trim().toLowerCase();
  const shown = (list ?? []).filter((r) => (status === 'all' || r.status === status) && (!needle || `${r.name} ${r.email} ${r.vehicle}`.toLowerCase().includes(needle)));
  const tabs = TABS.map(([s, label]) => [s, label, list ? (s === 'all' ? list.length : list.filter((r) => r.status === s).length) : null]);
  const open = list?.find((r) => r.id === openId);

  return (
    <>
      <PageHead title="Riders" subtitle="Couriers who deliver Forkfly orders." />
      {list && (
        <dl className="stat-row dash-stats">
          <StatTile label="Approved riders" value={count(list.filter((r) => r.status === 'approved').length)} />
          <StatTile label="Online now" value={count(list.filter((r) => r.online).length)} />
          <StatTile label="On a delivery" value={count(list.filter((r) => r.onDelivery).length)} />
          <StatTile label="Deliveries (30 days)" value={count(list.reduce((s, r) => s + r.deliveries30, 0))} />
          <StatTile label="Applications" value={count(list.filter((r) => r.status === 'pending').length)} />
        </dl>
      )}
      <div className="toolbar-row dash-toolbar">
        <Tabs value={status} onChange={setStatus} tabs={tabs} />
        <SearchBox value={q} onChange={setQ} placeholder="Name, email or vehicle" />
      </div>
      <section className="dash-card">
        {!list ? (
          <Loading />
        ) : !shown.length ? (
          <Empty icon="bike" title={status === 'pending' ? 'No applications waiting' : 'No riders match'} />
        ) : (
          <div className="table-wrap">
            <table className="table table--rows">
              <thead>
                <tr>
                  <th scope="col">Rider</th>
                  <th scope="col">Vehicle</th>
                  <th scope="col">Status</th>
                  <th scope="col">Right now</th>
                  <th scope="col" className="num">
                    Deliveries (30d)
                  </th>
                  <th scope="col" className="num">
                    On time
                  </th>
                  <th scope="col" className="num">
                    Rating
                  </th>
                  <th scope="col" className="num">
                    Earnings (30d)
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} onClick={() => setOpenId(r.id)}>
                    <td>
                      <span className="cell-entity">
                        <Avatar name={r.name} />
                        <span>
                          <button type="button" className="row-link" onClick={() => setOpenId(r.id)}>
                            <strong>{r.name}</strong>
                          </button>
                          <span className="muted small table__sub">{r.email}</span>
                        </span>
                      </span>
                    </td>
                    <td>{r.vehicle}</td>
                    <td>
                      <StatusPill status={r.status} />
                    </td>
                    <td>
                      <Presence r={r} />
                    </td>
                    <td className="num">{r.status === 'pending' ? '—' : count(r.deliveries30)}</td>
                    <td className="num">{r.status === 'pending' ? '—' : percent(r.onTime, 0)}</td>
                    <td className="num">{r.rating ? `★ ${r.rating.toFixed(1)}` : '—'}</td>
                    <td className="num">{r.status === 'pending' ? '—' : money(r.earnings30)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {open && (
        <RiderDrawer
          r={open}
          onClose={() => setOpenId(null)}
          onChange={async () => {
            await load();
            onChange?.();
          }}
        />
      )}
    </>
  );
}

function Presence({ r }) {
  if (r.status !== 'approved') return <span className="muted">—</span>;
  if (r.onDelivery) return <span className="status-dot status-dot--paused">On a delivery</span>;
  return <span className={`status-dot ${r.online ? 'status-dot--active' : ''}`}>{r.online ? 'Online' : 'Offline'}</span>;
}

function RiderDrawer({ r, onClose, onChange }) {
  const [dialog, ask] = useConfirm();
  const [reason, setReason] = useState(null);
  const [busy, setBusy] = useState(false);

  async function setStatus(status, note = '') {
    setBusy(true);
    try {
      await adminApi.setRiderStatus(r.id, status, note);
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  const actions = (
    <>
      {r.status === 'pending' && (
        <>
          <button type="button" className="btn btn--outline" disabled={busy} onClick={() => setReason({ title: `Decline ${r.name}?`, confirm: 'Decline' })}>
            Decline
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={async () => (await ask({ title: `Approve ${r.name}?`, body: 'They’ll be able to go online and take deliveries.', confirm: 'Approve' })) && setStatus('approved')}
          >
            Approve
          </button>
        </>
      )}
      {r.status === 'approved' && (
        <button type="button" className="btn btn--danger" disabled={busy} onClick={() => setReason({ title: `Suspend ${r.name}?`, confirm: 'Suspend' })}>
          Suspend
        </button>
      )}
      {r.status === 'suspended' && (
        <button type="button" className="btn" disabled={busy} onClick={async () => (await ask({ title: `Reinstate ${r.name}?`, confirm: 'Reinstate' })) && setStatus('approved')}>
          Reinstate
        </button>
      )}
    </>
  );

  return (
    <Drawer title={r.name} onClose={onClose} footer={actions}>
      <div className="drawer__status">
        <StatusPill status={r.status} />
        <Presence r={r} />
      </div>
      {r.status === 'pending' && <p className="notice notice--info">Applied {ago(r.joinedAt)}. Check their ID and vehicle before approving.</p>}
      {r.status === 'suspended' && r.note && (
        <p className="notice notice--warn">
          <strong>Suspended:</strong> {r.note}
        </p>
      )}
      <dl className="facts">
        <Fact label="Email">
          <a href={`mailto:${r.email}`}>{r.email}</a>
        </Fact>
        <Fact label="Phone">{r.phone}</Fact>
        <Fact label="Vehicle">{r.vehicle}</Fact>
        <Fact label={r.status === 'pending' ? 'Applied' : 'Rider since'}>{dateShort(r.joinedAt)}</Fact>
      </dl>
      {r.status !== 'pending' && (
        <>
          <h3 className="drawer__section">Last 30 days</h3>
          <dl className="facts">
            <Fact label="Deliveries">{count(r.deliveries30)}</Fact>
            <Fact label="On time">{percent(r.onTime, 0)}</Fact>
            <Fact label="Rating">{r.rating ? `★ ${r.rating.toFixed(1)}` : '—'}</Fact>
            <Fact label="Earnings incl. tips">{money(r.earnings30)}</Fact>
          </dl>
        </>
      )}
      {reason && (
        <ReasonDialog
          {...reason}
          onClose={async (note) => {
            setReason(null);
            if (note != null) await setStatus('suspended', note);
          }}
        />
      )}
      {dialog}
    </Drawer>
  );
}
