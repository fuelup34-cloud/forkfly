import { useEffect, useState } from 'react';
import { ADDRESSES } from '../../shared/core.js';
import { Link } from '../router.jsx';
import { goToSection } from '../sections.js';
import Logo from './Logo.jsx';
import ThemeToggle from './ThemeToggle.jsx';

const SECTIONS = [
  ['restaurants', 'Restaurants'],
  ['how', 'How It Works'],
  ['fees', 'Fees'],
];

// True on phone-sized screens, where the street name doesn't fit.
function useNarrow() {
  const [narrow, setNarrow] = useState(() => matchMedia('(max-width: 734px)').matches);
  useEffect(() => {
    const mq = matchMedia('(max-width: 734px)');
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

// Two bars, like Strawberry Pay: a thin global bar, then a sticky bar for the current page.
export default function Header({ addressId, setAddressId, cartCount, activeOrder, path, title }) {
  const [open, setOpen] = useState(false);
  const narrow = useNarrow();
  useEffect(() => setOpen(false), [path]);

  return (
    <>
      <header className={`globalnav ${open ? 'is-open' : ''}`}>
        <nav className="globalnav__inner" aria-label="Global">
          <Link to="/" className="globalnav__brand" aria-label="Forkfly home">
            <Logo size={17} />
          </Link>
          <ul className="globalnav__links">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`/#${id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setOpen(false);
                    goToSection(id);
                  }}
                >
                  {label}
                </a>
              </li>
            ))}
            <li>
              <Link to="/orders">Your Orders</Link>
            </li>
          </ul>
          <div className="globalnav__end">
            <ThemeToggle />
            <button
              type="button"
              className="globalnav__toggle"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              <span />
              <span />
            </button>
          </div>
        </nav>
      </header>

      <div className="localnav">
        <div className="localnav__inner">
          <span className="localnav__title">{title}</span>
          <div className="localnav__right">
            <label className="address-pick">
              <span className="address-pick__label">Deliver to</span>
              <select value={addressId} onChange={(e) => setAddressId(e.target.value)}>
                {ADDRESSES.map((a) => (
                  <option key={a.id} value={a.id}>
                    {narrow ? a.label : `${a.label} · ${a.line}`}
                  </option>
                ))}
              </select>
            </label>
            {activeOrder && path !== `/orders/${activeOrder.id}` && (
              <Link to={`/orders/${activeOrder.id}`} className="track-pill" aria-label="Track your order">
                <span className="live-dot" aria-hidden="true" />
                <span className="track-pill__text">Track</span>
              </Link>
            )}
            <Link to="/checkout" className="btn btn--sm cart-btn" aria-label={`Cart, ${cartCount} items`}>
              Bag{cartCount ? ` · ${cartCount}` : ''}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
