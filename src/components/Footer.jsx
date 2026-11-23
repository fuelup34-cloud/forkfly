import { FEES, formatMoney } from '../../shared/core.js';
import { Link } from '../router.jsx';
import { goToSection } from '../sections.js';

const jump = (id) => (e) => {
  e.preventDefault();
  goToSection(id);
};

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <p className="footer__note">
          Forkfly is a demo. Restaurants, couriers and prices are made up, and no payment is taken. Delivery is{' '}
          {formatMoney(FEES.deliveryBase)} for the first {FEES.includedKm} km and never more than {formatMoney(FEES.deliveryCap)}.
        </p>
        <div className="footer__cols">
          <div>
            <h3 className="footer__title">Order</h3>
            <ul>
              <li><a href="/#restaurants" onClick={jump('restaurants')}>Restaurants</a></li>
              <li><Link to="/checkout">Your bag</Link></li>
              <li><Link to="/orders">Your orders</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="footer__title">Learn</h3>
            <ul>
              <li><a href="/#how" onClick={jump('how')}>How it works</a></li>
              <li><a href="/#fees" onClick={jump('fees')}>Fees</a></li>
            </ul>
          </div>
        </div>
        <div className="footer__bottom">
          <span>Copyright © {new Date().getFullYear()} Forkfly. Demo project.</span>
        </div>
      </div>
    </footer>
  );
}
