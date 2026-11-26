// The Forkfly admin dashboard, at /admin. Only accounts with role 'admin' can open it.

import { useCallback, useEffect, useState } from 'react';
import { signInLink } from '../api.js';
import { Link } from '../router.jsx';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { adminApi } from './adminApi.js';
import Overview from './Overview.jsx';
import Orders from './Orders.jsx';
import Analytics from './Analytics.jsx';
import Restaurants, { RestaurantDetail } from './Restaurants.jsx';
import Riders from './Riders.jsx';
import Customers from './Customers.jsx';
import Settings from './Settings.jsx';
import '../dashboard/dashboard.css';
import '../ui/console.css';
import './admin.css';

const NAV = [
  ['', 'Overview', 'grid'],
  ['/orders', 'Orders', 'receipt'],
  ['/analytics', 'Analytics', 'chart'],
  ['/restaurants', 'Restaurants', 'store'],
  ['/riders', 'Riders', 'bike'],
  ['/customers', 'Customers', 'users'],
  ['/settings', 'Settings', 'gear'],
];

export default function AdminApp({ me, path }) {
  const m = path.match(/^\/admin(\/[\w-]+)?(?:\/([\w-]+))?\/?$/);
  const section = m?.[1] ?? '';
  const id = m?.[2];

  // Pending applications, shown as badges in the sidebar.
  const [pending, setPending] = useState({ restaurants: 0, riders: 0 });
  const refreshPending = useCallback(() => {
    adminApi
      .counts()
      .then(setPending)
      .catch(() => {});
  }, []);
  const isAdmin = me?.user?.role === 'admin';
  useEffect(() => {
    if (isAdmin) refreshPending();
  }, [isAdmin, refreshPending]);

  if (!me) return <div className="dash-loading" aria-label="Loading" />;
  if (!me.user)
    return (
      <Centered>
        <h1>Forkfly admin</h1>
        <p className="muted">Sign in with an admin account.</p>
        <Link to={signInLink(path)} className="btn">
          Sign in
        </Link>
      </Centered>
    );
  if (!isAdmin)
    return (
      <Centered>
        <Icon name="shield" size={32} className="muted" />
        <h1>Admins only</h1>
        <p className="muted">{me.user.email} doesn’t have access to the admin dashboard.</p>
        <Link to="/" className="btn">
          Back to Forkfly
        </Link>
      </Centered>
    );

  const item = NAV.find(([s]) => s === section);
  if (!m || !item || (id && section !== '/restaurants'))
    return (
      <Centered>
        <h1>Page not found</h1>
        <Link to="/admin" className="btn">
          Back to overview
        </Link>
      </Centered>
    );

  const badge = { '/restaurants': pending.restaurants, '/riders': pending.riders };
  let page;
  if (section === '') page = <Overview onChange={refreshPending} />;
  else if (section === '/orders') page = <Orders />;
  else if (section === '/analytics') page = <Analytics />;
  else if (section === '/restaurants') page = id ? <RestaurantDetail key={id} id={id} onChange={refreshPending} /> : <Restaurants onChange={refreshPending} />;
  else if (section === '/riders') page = <Riders onChange={refreshPending} />;
  else if (section === '/customers') page = <Customers />;
  else if (section === '/settings') page = <Settings me={me} />;

  return (
    <div className="dash admin">
      <aside className="dash-side">
        <Link to="/admin" className="dash-brand" aria-label="Forkfly admin home">
          <Logo size={17} />
          <span className="dash-brand__tag">Admin</span>
        </Link>
        <nav className="dash-nav" aria-label="Admin">
          {NAV.map(([s, label, icon]) => (
            <Link key={label} to={`/admin${s}`} className={`dash-nav__item ${s === section ? 'is-active' : ''}`} aria-current={s === section ? 'page' : undefined}>
              <Icon name={icon} size={18} />
              <span className="dash-nav__label">{label}</span>
              {badge[s] > 0 && (
                <span className="nav-badge" aria-label={`${badge[s]} waiting for review`}>
                  {badge[s]}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="dash-side__foot">
          <Link to="/account" className="dash-side__user">
            <Icon name="user" size={16} /> {me.user.name}
          </Link>
          <ThemeToggle />
        </div>
      </aside>
      <main className="dash-main">{page}</main>
    </div>
  );
}

function Centered({ children }) {
  return (
    <div className="dash-centered">
      <Link to="/" className="dash-brand">
        <Logo size={18} />
      </Link>
      <div className="dash-centered__card">{children}</div>
    </div>
  );
}

// Admin pages import the page header from here.
export { PageHead } from '../ui/kit.jsx';
