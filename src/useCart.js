import { useEffect, useState } from 'react';
import { load, store } from './storage.js';

// The cart holds items from one restaurant at a time, and is saved between visits.
const EMPTY = { restaurant: null, lines: [] };

export function useCart() {
  const [cart, setCart] = useState(() => {
    const saved = load('forkfly-cart', EMPTY);
    return saved && Array.isArray(saved.lines) ? saved : EMPTY;
  });
  useEffect(() => store('forkfly-cart', cart), [cart]);

  function setQty(restaurant, item, qty) {
    setCart((c) => {
      const base = c.restaurant?.id === restaurant.id ? c : { restaurant: { id: restaurant.id, name: restaurant.name, colors: restaurant.colors }, lines: [] };
      const next = [...base.lines];
      const i = next.findIndex((l) => l.id === item.id);
      if (qty <= 0) {
        if (i >= 0) next.splice(i, 1);
      } else {
        const line = { id: item.id, name: item.name, price: item.price, qty: Math.min(20, qty) };
        if (i >= 0) next[i] = line;
        else next.push(line);
      }
      return next.length ? { ...base, lines: next } : EMPTY;
    });
  }

  const count = cart.lines.reduce((n, l) => n + l.qty, 0);
  const subtotal = cart.lines.reduce((n, l) => n + l.qty * l.price, 0);
  const qtyOf = (id) => cart.lines.find((l) => l.id === id)?.qty ?? 0;

  return { cart, count, subtotal, qtyOf, setQty, clear: () => setCart(EMPTY) };
}
