import { useEffect, useState } from 'react';
import { ADDRESSES } from '../shared/core.js';
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

  // Check for an order that's still on its way, so the header can link straight to it.
  const [activeOrder, setActiveOrder] = useState(null);
  useEffect(() => {
    api
      .orders()
      .then((list) => setActiveOrder(list.find((o) => o.active) ?? null))
      .catch(() => {});
  }, [path]);

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
    page = <Checkout cart={cart} addressId={addressId} setAddressId={setAddressId} />;
  } else if (path === '/orders') {
    title = 'Your Orders';
    page = <Orders />;
  } else if ((m = path.match(/^\/orders\/([\w-]+)$/))) {
    title = 'Track Order';
    page = <Tracking id={m[1]} />;
  } else if ((m = path.match(/^\/courier\/([\w-]+)$/))) {
    title = 'Courier';
    page = <Courier id={m[1]} />;
  } else {
    page = (
      <div className="empty">
        <p className="empty__emoji">🧭</p>
        <h1>Page not found</h1>
        <Link to="/" className="btn">
          Back to restaurants
        </Link>
      </div>
    );
  }
  return (
    <>
      <Header addressId={addressId} setAddressId={setAddressId} cartCount={cart.count} activeOrder={activeOrder} path={path} title={title} />
      <main className={path === '/' ? '' : 'main'}>{page}</main>
      <Footer />
    </>
  );
}
