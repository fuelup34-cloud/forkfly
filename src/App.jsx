import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { ADDRESSES, applyFees } from '../shared/core.js';
import { useRoute } from './router.jsx';
import { useCart } from './useCart.js';
import { load, store } from './storage.js';
import { api } from './api.js';
import Header from './components/Header.jsx';
import Home from './components/Home.jsx';
import RestaurantPage from './components/RestaurantPage.jsx';
import Checkout from './components/Checkout.jsx';
import Tracking from './components/Tracking.jsx';
import Orders from './components/Orders.jsx';
import Courier from './components/Courier.jsx';
import SignIn from './components/SignIn.jsx';
import Account from './components/Account.jsx';
import Apply from './components/Apply.jsx';
import Icon from './components/Icon.jsx';

// Only restaurant teams need the dashboard, so customers never download it.
const DashboardApp = lazy(() => import('./dashboard/DashboardApp.jsx'));
// Same for the Forkfly admin dashboard.
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));
import { Link } from './router.jsx';
import Footer from './components/Footer.jsx';

export default function App() {
  const path = useRoute();
  const cart = useCart();
  const [addressId, setAddressIdState] = useState(() => {
    const saved = load('forkfly-address', 'home');
    return ADDRESSES.some((a) => a.id === saved) ? saved : 'home';
  });
  const setAddressId = (id) => {
    setAddressIdState(id);
    store('forkfly-address', id);
  };

  // Who's signed in, plus any restaurants they manage and their rider status.
  // undefined while loading; { user: null } when signed out.
  const [me, setMe] = useState(undefined);
  const refreshMe = useCallback(
    () =>
      api
        .me()
        .then((data) => {
          // Fees are set by Forkfly admins; use the live ones for every price shown.
          if (data.config) applyFees(data.config.fees);
          setMe(data);
          return data;
        })
        .catch(() => setMe((cur) => cur ?? { user: null, restaurants: [], rider: null })),
    []
  );
  useEffect(() => {
    refreshMe();
  }, [refreshMe]);
  const signedIn = !!me?.user;

  // Check for an order that's still on its way, so the header can link straight to it.
  const [activeOrder, setActiveOrder] = useState(null);
  useEffect(() => {
    if (!signedIn) return setActiveOrder(null);
    api
      .orders()
      .then((list) => setActiveOrder(list.find((o) => o.active) ?? null))
      .catch(() => {});
  }, [path, signedIn]);

  if (path === '/dashboard' || path.startsWith('/dashboard/'))
    return (
      <Suspense fallback={<div className="dash-loading" aria-label="Loading" />}>
        <DashboardApp me={me} path={path} />
      </Suspense>
    );

  if (path === '/admin' || path.startsWith('/admin/'))
    return (
      <Suspense fallback={<div className="dash-loading" aria-label="Loading" />}>
        <AdminApp me={me} path={path} />
      </Suspense>
    );

  // Sign-in gets the whole screen, without the store's navigation.
  if (path === '/signin' || path === '/signup') return <SignIn key={path} mode={path.slice(1)} onSignedIn={refreshMe} />;

  // Pick the page (and the title in the sticky bar) from the address.
  let page;
  let m;
  let title = 'Forkfly';
  if (path === '/') {
    page = <Home addressId={addressId} activeOrder={activeOrder} />;
  } else if ((m = path.match(/^\/r\/([\w-]+)$/))) {
    title = 'Menu';
    page = <RestaurantPage id={m[1]} addressId={addressId} cart={cart} />;
  } else if (path === '/checkout') {
    title = 'Checkout';
    page = <Checkout cart={cart} addressId={addressId} setAddressId={setAddressId} me={me} />;
  } else if (path === '/orders') {
    title = 'Your Orders';
    page = <Orders me={me} />;
  } else if ((m = path.match(/^\/orders\/([\w-]+)$/))) {
    title = 'Track Order';
    page = <Tracking id={m[1]} me={me} />;
  } else if (path === '/signin' || path === '/signup') {
    title = path === '/signin' ? 'Sign In' : 'Create Account';
    page = <SignIn key={path} mode={path.slice(1)} onSignedIn={refreshMe} />;
  } else if (path === '/account') {
    title = 'Account';
    page = <Account me={me} onSignedOut={refreshMe} />;
  } else if (path === '/apply') {
    title = 'Work With Us';
    page = <Apply me={me} onApplied={refreshMe} />;
  } else if ((m = path.match(/^\/courier\/([\w-]+)$/))) {
    title = 'Courier';
    page = <Courier id={m[1]} />;
  } else {
    page = (
      <div className="empty">
        <Icon name="compass" size={48} className="empty__icon" />
        <h1>Page not found</h1>
        <Link to="/" className="btn">
          Back to restaurants
        </Link>
      </div>
    );
  }
  return (
    <>
      <Header addressId={addressId} setAddressId={setAddressId} cartCount={cart.count} me={me} activeOrder={activeOrder} path={path} title={title} />
      <main className={path === '/' ? '' : 'main'}>{page}</main>
      <Footer />
    </>
  );
}
