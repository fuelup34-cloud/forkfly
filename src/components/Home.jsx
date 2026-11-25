import { useEffect, useMemo, useState } from 'react';
import { ADDRESSES, FEES, formatMoney } from '../../shared/core.js';
import { api } from '../api.js';
import { Link } from '../router.jsx';
import { goToSection } from '../sections.js';
import HeroPhone from './HeroPhone.jsx';
import Monogram from './Monogram.jsx';
import RestaurantCard from './RestaurantCard.jsx';

const SORTS = [
  ['recommended', 'Recommended'],
  ['fastest', 'Fastest'],
  ['fee', 'Lowest fee'],
  ['rating', 'Top rated'],
];

const STEPS = [
  ['Pick something good.', 'Search by restaurant or dish, and see the arrival time and delivery fee before you open a menu.'],
  ['Pay what you see.', 'Every fee is listed with the reason for it. No surge pricing and no surprises at checkout.'],
  ['Watch it arrive.', 'Follow your courier on a live map, from the restaurant to your door.'],
];

export default function Home({ addressId, activeOrder }) {
  const [restaurants, setRestaurants] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [cuisine, setCuisine] = useState('All');
  const [sort, setSort] = useState('recommended');
  const address = ADDRESSES.find((a) => a.id === addressId);

  useEffect(() => {
    let cancelled = false;
    setError('');
    api
      .restaurants(addressId)
      .then((list) => !cancelled && setRestaurants(list))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [addressId]);

  const cuisines = useMemo(() => ['All', ...new Set((restaurants ?? []).map((r) => r.cuisine))], [restaurants]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (restaurants ?? []).filter(
      (r) =>
        (cuisine === 'All' || r.cuisine === cuisine) &&
        (!q || r.name.toLowerCase().includes(q) || r.cuisine.toLowerCase().includes(q) || r.dishes.some((d) => d.toLowerCase().includes(q)))
    );
    const by = {
      recommended: (a, b) => b.rating * 10 - a.eta[0] / 3 - (a.rating * 10 - b.eta[0] / 3),
      fastest: (a, b) => a.eta[0] - b.eta[0],
      fee: (a, b) => a.deliveryFee - b.deliveryFee || a.eta[0] - b.eta[0],
      rating: (a, b) => b.rating - a.rating,
    }[sort];
    return [...list].sort(by);
  }, [restaurants, query, cuisine, sort]);

  const jump = (id) => (e) => {
    e.preventDefault();
    goToSection(id);
  };

  return (
    <>
      <section className="hero" id="top">
        <div className="container text-center">
          <p className="eyebrow hero__eyebrow">Forkfly</p>
          <h1 className="headline-hero hero__title">
            Dinner,
            <br />
            <span className="gradient-text">right on time.</span>
          </h1>
          <p className="subhead hero__sub">
            Delivery from {formatMoney(FEES.deliveryBase)}. A service fee that never tops {formatMoney(FEES.serviceCap)}.
            <br className="hide-sm" /> And a live map from the kitchen to your door.
          </p>
          <div className="cta-row">
            <a href="/#restaurants" className="btn" onClick={jump('restaurants')}>
              Find food
            </a>
            <a href="/#how" className="link-arrow" onClick={jump('how')}>
              How it works
            </a>
          </div>
        </div>
        <div className="hero__visual">
          <div className="hero__glow" />
          <HeroPhone />
        </div>
      </section>

      <section className="section section--alt" id="restaurants">
        <div className="container-wide">
          {activeOrder && (
            <Link to={`/orders/${activeOrder.id}`} className="active-banner">
              <Monogram name={activeOrder.restaurant.name} colors={activeOrder.restaurant.colors} image={activeOrder.restaurant.coverImage} />
              <span>
                <strong>Your {activeOrder.restaurant.name} order is on its way.</strong>
                <span>Follow it live</span>
              </span>
              <span className="link-arrow" aria-hidden="true" />
            </Link>
          )}

          <div className="section-head text-center">
            <p className="eyebrow">Restaurants</p>
            <h2 className="headline">Something for everyone.</h2>
            <p className="lede section-lede">
              Delivering to {address.label}, {address.line}. Times and fees below are for this address.
            </p>
          </div>

          <div className="toolbar">
            <label className="search">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search restaurants or dishes" aria-label="Search restaurants or dishes" />
            </label>
            <div className="segmented" role="radiogroup" aria-label="Sort restaurants">
              {SORTS.map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={sort === id} className={`segmented__btn ${sort === id ? 'is-active' : ''}`} onClick={() => setSort(id)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="chips" role="group" aria-label="Cuisine">
            {cuisines.map((c) => (
              <button key={c} type="button" className={`chip ${cuisine === c ? 'is-active' : ''}`} aria-pressed={cuisine === c} onClick={() => setCuisine(c)}>
                {c}
              </button>
            ))}
          </div>

          {error && (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          )}

          <div className="rgrid">
            {restaurants === null && !error && Array.from({ length: 8 }, (_, i) => <div key={i} className="rcard rcard--skeleton" aria-hidden="true" />)}
            {shown.map((r) => (
              <RestaurantCard key={r.id} r={r} />
            ))}
          </div>
          {restaurants && shown.length === 0 && <p className="empty-line">Nothing matches “{query || cuisine}”. Try another search.</p>}
        </div>
      </section>

      <section className="section" id="how">
        <div className="container">
          <div className="section-head text-center">
            <p className="eyebrow">How it works</p>
            <h2 className="headline">Three steps to dinner.</h2>
          </div>
          <ol className="how-steps">
            {STEPS.map(([title, body], i) => (
              <li key={title}>
                <span className="step__num">{i + 1}</span>
                <h3 className="step__title">{title}</h3>
                <p className="step__body">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--dark" id="fees">
        <div className="container">
          <div className="section-head text-center">
            <p className="eyebrow">Fees</p>
            <h2 className="headline">Fair. And spelled out.</h2>
          </div>
          <div className="stats__grid">
            <div>
              <p className="stat__value">{formatMoney(FEES.deliveryBase)}</p>
              <p className="stat__label">delivery for the first {FEES.includedMiles === 1 ? 'mile' : `${FEES.includedMiles} miles`}</p>
            </div>
            <div>
              <p className="stat__value">{formatMoney(FEES.deliveryCap)}</p>
              <p className="stat__label">the most you'll pay for delivery, however far</p>
            </div>
            <div>
              <p className="stat__value">{FEES.serviceRate * 100}%</p>
              <p className="stat__label">service fee, capped at {formatMoney(FEES.serviceCap)}</p>
            </div>
          </div>
          <p className="footnote text-center">
            Orders under {formatMoney(FEES.smallOrderUnder)} add a {formatMoney(FEES.smallOrderFee)} small order fee. Tips are optional.
          </p>
        </div>
      </section>

      <section className="section getstarted">
        <div className="container">
          <div className="getstarted__card text-center">
            <h2 className="headline">Hungry yet?</h2>
            <p className="lede getstarted__sub">Local kitchens, one live map.</p>
            <div className="cta-row">
              <a href="/#restaurants" className="btn btn--light" onClick={jump('restaurants')}>
                Find food
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
