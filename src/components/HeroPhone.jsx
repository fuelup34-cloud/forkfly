import { useEffect, useState } from 'react';
import { COURIER_SPEED, orderSnapshot, pathLength, routeBetween, toRealMinutes } from '../../shared/core.js';
import CityMap from './CityMap.jsx';

// A pretend order that replays forever, so the hero shows live tracking in action.
function demoOrder(start) {
  const restaurant = { id: 'demo', name: 'Slice Theory', x: 400, y: 500 };
  const address = { id: 'home', label: 'Home', line: '12 Maple Street', x: 800, y: 700 };
  const courierStart = { x: 300, y: 300 };
  const pickupPath = routeBetween(courierStart, restaurant);
  const dropPath = routeBetween(restaurant, address);
  const speed = COURIER_SPEED * 1.6;
  const assignedAt = start;
  const arriveRestaurantAt = assignedAt + pathLength(pickupPath) / speed;
  const pickedUpAt = arriveRestaurantAt + 1200;
  const deliveredAt = pickedUpAt + pathLength(dropPath) / speed;
  return {
    id: 'DEMO',
    restaurant,
    address,
    courier: { name: 'Priya S.', vehicle: 'E-bike', rating: 4.98, start: courierStart },
    speed,
    pickupPath,
    dropPath,
    placedAt: start - 6000,
    timeline: { acceptedAt: start - 5000, readyAt: pickedUpAt - 500, assignedAt, arriveRestaurantAt, pickedUpAt, deliveredAt },
    cancelledAt: null,
  };
}

const LABEL = {
  preparing: 'Preparing your food',
  ready: 'Food is ready',
  on_the_way: 'On the way',
  delivered: 'Delivered',
};

export default function HeroPhone() {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [order, setOrder] = useState(() => demoOrder(Date.now()));
  const [now, setNow] = useState(() => (reduced ? order.timeline.pickedUpAt + 2500 : Date.now()));

  useEffect(() => {
    if (reduced) return undefined;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setOrder((o) => (t > o.timeline.deliveredAt + 2500 ? demoOrder(t) : o));
    }, 500);
    return () => clearInterval(id);
  }, [reduced]);

  const snap = orderSnapshot(order, now);
  return (
    <div className="phone" aria-hidden="true">
      <div className="phone__screen">
        <div className="phone__map">
          <CityMap order={snap} />
        </div>
        <div className="phone__sheet">
          <p className="phone__eta">
            {snap.status === 'delivered' ? 'Enjoy!' : `${Math.max(1, toRealMinutes(snap.etaMs))} min`}
          </p>
          <p className="phone__status">{LABEL[snap.status] ?? 'Order placed'}</p>
          <div className="progress">
            <span style={{ width: `${snap.progress * 100}%` }} />
          </div>
          <p className="phone__courier">Slice Theory · Priya on an e-bike</p>
        </div>
      </div>
    </div>
  );
}
