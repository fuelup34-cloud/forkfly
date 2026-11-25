import { formatMiles, formatMoney } from '../../shared/core.js';
import { imageUrl } from '../images.js';
import { Link } from '../router.jsx';
import { brandGradient, initials } from './Monogram.jsx';

// 1240 -> "1.2k", like the review counts people are used to.
export function formatCount(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n);
}

export function Rating({ rating, reviews }) {
  if (!reviews) return <span className="rating-pill rating-pill--new">New</span>;
  return (
    <span className="rating-pill" aria-label={`Rated ${rating.toFixed(1)} out of 5 from ${reviews.toLocaleString()} reviews`}>
      <span aria-hidden="true">★</span> {rating.toFixed(1)} <span className="rating-pill__count">({formatCount(reviews)})</span>
    </span>
  );
}

export function Cover({ src, colors, name, width, className = '' }) {
  if (src) return <img className={className} src={imageUrl(src, width)} alt="" loading="lazy" decoding="async" />;
  return (
    <div className={`cover-fallback ${className}`} style={{ background: brandGradient(colors) }} aria-hidden="true">
      <span>{initials(name)}</span>
    </div>
  );
}

export default function RestaurantCard({ r }) {
  return (
    <Link to={`/r/${r.id}`} className={`rcard ${r.open ? '' : 'is-closed'}`}>
      <div className="rcard__media">
        <Cover src={r.coverImage} colors={r.colors} name={r.name} width={560} className="rcard__img" />
        {!r.open && <span className="rcard__closed">Closed now</span>}
      </div>
      <div className="rcard__body">
        <div className="rcard__title">
          <h3>{r.name}</h3>
          <Rating rating={r.rating} reviews={r.reviews} />
        </div>
        <p className="rcard__meta">
          {r.cuisine} · {'$'.repeat(r.priceLevel)} · {formatMiles(r.km)}
        </p>
        <p className="rcard__facts">
          <span>
            {r.eta[0]}–{r.eta[1]} min
          </span>
          <span aria-hidden="true">·</span>
          <span className={r.deliveryFee <= 99 ? 'rcard__fee--low' : ''}>{formatMoney(r.deliveryFee)} delivery</span>
        </p>
      </div>
    </Link>
  );
}
