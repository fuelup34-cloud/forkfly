import { useCallback, useEffect, useState } from 'react';
import { dash, forgetRestaurantCache, signInLink } from '../api.js';
import { Link, navigate } from '../router.jsx';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import Monogram from '../components/Monogram.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { PageHead, RangePicker, StatusPill } from '../ui/kit.jsx';
import OrdersBoard from './OrdersBoard.jsx';
import OrderHistory from './OrderHistory.jsx';
import Overview from './Overview.jsx';
import MenuEditor from './MenuEditor.jsx';
import Settings from './Settings.jsx';
import { useKitchen } from './useKitchen.js';
import './dashboard.css';
import '../ui/console.css';

const TABS = [
  ['', 'Overview', 'grid'],
  ['/orders', 'Orders', 'receipt'],
  ['/menu', 'Menu', 'plate'],
  ['/settings', 'Settings', 'store'],
];
const SUBTITLE = {
  '': (r) => `How ${r.name} is doing today.`,
  '/orders': () => 'Accept new orders, then mark them ready for the courier.',
  '/menu': () => 'What customers can order. Switch an item off when it sells out.',
  '/settings': () => 'Your restaurant’s profile, and who can manage it.',
};
const STATUS_LABEL = { active: 'Open', paused: 'Paused', pending: 'Waiting for approval', suspended: 'Suspended' };

export default function DashboardApp({ me, path }) {
  const m = path.match(/^\/dashboard(?:\/([\w-]+))?(\/orders|\/menu|\/settings)?\/?$/);
  const rid = m?.[1];
  const tab = m?.[2] ?? '';

  if (!me) return <div className="dash-loading" aria-label="Loading" />;
  if (!me.user)
    return (
      <Centered>
        <h1>Restaurant dashboard</h1>
        <p className="muted">Sign in with the account that manages your restaurant.</p>
        <Link to={signInLink(path)} className="btn">
          Sign in
        </Link>
      </Centered>
    );
  if (!m)
    return (
      <Centered>
        <h1>Page not found</h1>
        <Link to="/dashboard" className="btn">
          Back to dashboard
        </Link>
      </Centered>
    );
  if (!rid) return <Chooser me={me} />;
  return <Restaurant key={rid} me={me} rid={rid} tab={tab} />;
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

function Chooser({ me }) {
  const list = me.restaurants;
  useEffect(() => {
    if (list.length === 1) navigate(`/dashboard/${list[0].id}`, { replace: true });
  }, [list]);
  if (list.length === 1) return null;
  if (!list.length)
    return (
      <Centered>
        <h1>No restaurants yet</h1>
        <p className="muted">List your restaurant on Forkfly to get a dashboard for orders and your menu.</p>
        <Link to="/apply?as=restaurant" className="btn">
          List your restaurant
        </Link>
      </Centered>
    );
  return (
    <Centered>
      <h1>Choose a restaurant</h1>
      <ul className="chooser">
        {list.map((r) => (
          <li key={r.id}>
            <Link to={`/dashboard/${r.id}`} className="chooser__row">
              <Monogram name={r.name} colors={r.colors} image={r.coverImage} />
              <span>
                <strong>{r.name}</strong>
                <span className="muted small">{STATUS_LABEL[r.status]}</span>
              </span>
              <span className="link-arrow" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </Centered>
  );
}

function Restaurant({ me, rid, tab }) {
  const [restaurant, setRestaurant] = useState(null);
  const [error, setError] = useState('');
  const [today, setToday] = useState(null);
  const [toggling, setToggling] = useState(false);
  const kitchen = useKitchen(rid);

  useEffect(() => {
    dash
      .restaurant(rid)
      .then(setRestaurant)
      .catch((err) => setError(err.message));
  }, [rid]);

  // Today's totals change whenever an order leaves the board (picked up, declined, cancelled).
  const refreshToday = useCallback(() => {
    dash
      .today(rid)
      .then(setToday)
      .catch(() => {});
  }, [rid]);
  const onBoard = kitchen.orders?.length;
  const boardKey = (kitchen.orders ?? []).map((o) => `${o.id}:${o.status}`).join();
  useEffect(() => {
    if (onBoard != null) refreshToday();
  }, [boardKey, onBoard, refreshToday]);

  if (error)
    return (
      <Centered>
        <h1>{error}</h1>
        <Link to="/dashboard" className="btn">
          Back
        </Link>
      </Centered>
    );
  if (!restaurant) return <div className="dash-loading" aria-label="Loading" />;

  const base = `/dashboard/${rid}`;
  const title = TABS.find(([t]) => t === tab)?.[1] ?? 'Overview';
  const canToggle = restaurant.status === 'active' || restaurant.status === 'paused';

  async function toggleOpen() {
    setToggling(true);
    try {
      setRestaurant(await dash.setOpen(rid, restaurant.status !== 'active'));
      forgetRestaurantCache();
    } catch (err) {
      setError(err.message);
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="dash">
      <aside className="dash-side">
        <Link to="/" className="dash-brand" aria-label="Forkfly home">
          <Logo size={17} />
          <span className="dash-brand__tag">for Restaurants</span>
        </Link>
        <div className="dash-place">
          <Monogram name={restaurant.name} colors={restaurant.colors} image={restaurant.coverImage} size="sm" />
          <div className="dash-place__text">
            <strong>{restaurant.name}</strong>
            <span className={`status-dot status-dot--${restaurant.status}`}>{STATUS_LABEL[restaurant.status]}</span>
          </div>
          {me.restaurants.length > 1 && (
            <Link to="/dashboard" className="text-btn small">
              Switch
            </Link>
          )}
        </div>
        <nav className="dash-nav" aria-label="Dashboard">
          {TABS.map(([t, label, icon]) => (
            <Link key={label} to={`${base}${t}`} className={`dash-nav__item ${t === tab ? 'is-active' : ''}`} aria-current={t === tab ? 'page' : undefined}>
              <Icon name={icon} size={18} />
              <span className="dash-nav__label">{label}</span>
              {t === '/orders' && kitchen.newCount > 0 && (
                <span className="nav-badge" aria-label={`${kitchen.newCount} new`}>
                  {kitchen.newCount}
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

      <main className="dash-main">
        <PageHead title={title} subtitle={SUBTITLE[tab](restaurant)}>
          {canToggle && (
            <label className="open-toggle">
              <span>{restaurant.status === 'active' ? 'Accepting orders' : 'Paused'}</span>
              <span className="switch switch--big">
                <input type="checkbox" checked={restaurant.status === 'active'} onChange={toggleOpen} disabled={toggling} />
                <span className="switch__track" aria-hidden="true" />
              </span>
            </label>
          )}
          {!canToggle && <StatusPill status={restaurant.status} />}
        </PageHead>

        {restaurant.status === 'pending' && (
          <div className="notice notice--info dash-banner">
            <strong>Thanks for joining Forkfly.</strong> We’re reviewing {restaurant.name}. Meanwhile, add your menu and photos so you’re ready to go live.
          </div>
        )}

        {tab === '' && <Overview restaurant={restaurant} today={today} kitchen={kitchen} base={base} />}
        {tab === '/orders' && <OrdersPage restaurant={restaurant} today={today} kitchen={kitchen} />}
        {tab === '/menu' && <MenuEditor restaurant={restaurant} />}
        {tab === '/settings' && <Settings restaurant={restaurant} onChange={setRestaurant} />}
      </main>
    </div>
  );
}

function OrdersPage({ restaurant, today, kitchen }) {
  const [view, setView] = useState('live');
  return (
    <>
      <div className="orders-switch">
        <RangePicker
          label="Which orders"
          value={view}
          onChange={setView}
          ranges={[
            ['live', `Live board${kitchen.orders ? ` · ${kitchen.orders.length}` : ''}`],
            ['history', `Today’s history${today ? ` · ${today.history.length}` : ''}`],
          ]}
        />
      </div>
      {view === 'live' ? <OrdersBoard restaurant={restaurant} kitchen={kitchen} /> : <OrderHistory today={today} />}
    </>
  );
}
