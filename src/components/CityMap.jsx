import { memo } from 'react';
import { CITY_SIZE, GRID } from '../../shared/core.js';

const PARKS = new Set(['2,3', '3,3', '6,1', '7,6', '1,8']);
const BLOCKS = [];
for (let i = 0; i < CITY_SIZE / GRID; i++) for (let j = 0; j < CITY_SIZE / GRID; j++) BLOCKS.push([i, j]);

// The streets and blocks never change, so draw them once.
const City = memo(function City() {
  return (
    <g>
      {BLOCKS.map(([i, j]) => (
        <rect
          key={`${i},${j}`}
          className={PARKS.has(`${i},${j}`) ? 'map__park' : 'map__block'}
          x={i * GRID + 9}
          y={j * GRID + 9}
          width={GRID - 18}
          height={GRID - 18}
          rx="8"
        />
      ))}
      <path className="map__river" d="M-50 455 C 200 430, 260 470, 500 455 S 800 430, 1050 455" />
    </g>
  );
});

const pts = (points) => points.map((p) => `${p.x},${p.y}`).join(' ');

// Zoom the map to fit the restaurant, the delivery address and where the courier started.
function viewBoxFor(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const pad = 110;
  let minX = Math.min(...xs) - pad;
  let minY = Math.min(...ys) - pad;
  let w = Math.max(...xs) - Math.min(...xs) + pad * 2;
  let h = Math.max(...ys) - Math.min(...ys) + pad * 2;
  const size = Math.max(w, h, 420);
  minX -= (size - w) / 2;
  minY -= (size - h) / 2;
  return `${minX} ${minY} ${size} ${size}`;
}

function Pin({ x, y, emoji, label, className = '' }) {
  return (
    <g className={`map__pin ${className}`} transform={`translate(${x} ${y})`} role="img" aria-label={label}>
      <circle r="30" />
      <text textAnchor="middle" dominantBaseline="central" fontSize="30">
        {emoji}
      </text>
    </g>
  );
}

export default function CityMap({ order }) {
  const { restaurant, address, courierPos, courierPhase, pickupPath, dropPath, status } = order;
  const vb = viewBoxFor([restaurant, address, order.courier.start]);
  const done = status === 'delivered' || status === 'cancelled';
  // While waiting at the restaurant, stand just beside its pin so both stay visible.
  const nudge = courierPhase === 'at_restaurant' ? 34 : 0;
  const vehicle = order.courier.vehicle === 'Bicycle' ? '🚲' : order.courier.vehicle === 'Scooter' ? '🛵' : '🚴';

  return (
    <svg className="map" viewBox={vb} preserveAspectRatio="xMidYMid slice" aria-label="Live delivery map">
      <rect x="-200" y="-200" width={CITY_SIZE + 400} height={CITY_SIZE + 400} className="map__ground" />
      <City />
      {courierPhase === 'to_restaurant' && <polyline className="map__route map__route--pickup" points={pts(pickupPath)} />}
      {status !== 'cancelled' && <polyline className={`map__route ${done ? 'map__route--done' : ''}`} points={pts(dropPath)} />}
      <Pin x={restaurant.x} y={restaurant.y} emoji={restaurant.emoji} label={restaurant.name} />
      <Pin x={address.x} y={address.y} emoji="🏠" label={address.label} className="map__pin--home" />
      {courierPos && status !== 'delivered' && (
        // CSS moves the courier smoothly between the twice-a-second updates.
        <g className="map__courier" style={{ transform: `translate(${courierPos.x + nudge}px, ${courierPos.y - nudge}px)` }} role="img" aria-label="Your courier">
          <circle className="map__pulse" r="34" />
          <circle r="26" />
          <text textAnchor="middle" dominantBaseline="central" fontSize="28">
            {vehicle}
          </text>
        </g>
      )}
    </svg>
  );
}
