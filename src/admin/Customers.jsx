import { useEffect, useState } from 'react';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import { adminApi } from './adminApi.js';
import { PageHead } from './AdminApp.jsx';
import { Avatar, Empty, Loading, SearchBox, StatTile, StatusPill, Tabs, ago, count, dateShort, money } from '../ui/kit.jsx';

const SORTS = {
  spent: ['Most spent', (a, b) => b.spent - a.spent],
  orders: ['Most orders', (a, b) => b.orders - a.orders],
  recent: ['Ordered recently', (a, b) => (b.lastOrder ?? 0) - (a.lastOrder ?? 0)],
  joined: ['Newest', (a, b) => b.joinedAt - a.joinedAt],
};

export default function Customers() {
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('spent');
  const [limit, setLimit] = useState(50);
  const [dialog, ask] = useConfirm();
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi
      .customers()
      .then(setList)
      .catch((err) => setError(err.message));
  }, []);

  async function toggle(c) {
    const suspend = c.status === 'active';
    const ok = await ask(
      suspend
        ? { title: `Suspend ${c.name}?`, body: 'They won’t be able to sign in or place orders until you reinstate them.', confirm: 'Suspend', danger: true }
        : { title: `Reinstate ${c.name}?`, body: 'They’ll be able to sign in and order again.', confirm: 'Reinstate' }
    );
    if (!ok) return;
    try {
      const updated = await adminApi.setCustomerStatus(c.id, suspend ? 'suspended' : 'active');
      setList((all) => all.map((x) => (x.id === updated.id ? updated : x)));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  const needle = q.trim().toLowerCase();
  const shown = (list ?? [])
    .filter((c) => (status === 'all' || c.status === status) && (!needle || `${c.name} ${c.email}`.toLowerCase().includes(needle)))
    .sort(SORTS[sort][1]);
  const monthAgo = Date.now() - 30 * 86_400_000;

  return (
    <>
      <PageHead title="Customers" subtitle="People who order on Forkfly." />
      {list && (
        <dl className="stat-row dash-stats">
          <StatTile label="Customers" value={count(list.length)} />
          <StatTile label="Ordered in the last 30 days" value={count(list.filter((c) => c.lastOrder >= monthAgo).length)} />
          <StatTile label="Joined in the last 30 days" value={count(list.filter((c) => c.joinedAt >= monthAgo).length)} />
          <StatTile label="Suspended" value={count(list.filter((c) => c.status === 'suspended').length)} />
        </dl>
      )}
      <div className="toolbar-row dash-toolbar">
        <Tabs
          value={status}
          onChange={setStatus}
          tabs={[
            ['all', 'All'],
            ['active', 'Active'],
            ['suspended', 'Suspended'],
          ]}
        />
        <select className="select-sm" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
          {Object.entries(SORTS).map(([id, [label]]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <SearchBox value={q} onChange={setQ} placeholder="Name or email" />
      </div>
      {error && <p className="notice notice--error">{error}</p>}
      <section className="dash-card">
        {!list ? (
          !error && <Loading />
        ) : !shown.length ? (
          <Empty icon="users" title={list.length ? 'No customers match' : 'No customers yet'} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col" className="num">
                    Orders
                  </th>
                  <th scope="col" className="num">
                    Spent
                  </th>
                  <th scope="col">Last order</th>
                  <th scope="col">Joined</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, limit).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="cell-entity">
                        <Avatar name={c.name} />
                        <span>
                          <strong>{c.name}</strong>
                          <span className="muted small table__sub">{c.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className="num">{count(c.orders)}</td>
                    <td className="num">{money(c.spent)}</td>
                    <td>{c.lastOrder ? ago(c.lastOrder) : <span className="muted">Never</span>}</td>
                    <td>{dateShort(c.joinedAt)}</td>
                    <td>
                      <StatusPill status={c.status} />
                    </td>
                    <td className="num">
                      <button type="button" className={`text-btn small ${c.status === 'active' ? 'text-btn--danger' : ''}`} onClick={() => toggle(c)}>
                        {c.status === 'active' ? 'Suspend' : 'Reinstate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="table-foot table-foot--row">
              <span className="muted small">
                Showing {count(Math.min(limit, shown.length))} of {count(shown.length)}
              </span>
              {shown.length > limit && (
                <button type="button" className="btn btn--outline btn--sm" onClick={() => setLimit((n) => n + 50)}>
                  Show more
                </button>
              )}
            </div>
          </div>
        )}
      </section>
      {dialog}
    </>
  );
}
