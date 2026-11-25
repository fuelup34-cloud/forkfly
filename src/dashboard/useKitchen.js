import { useEffect, useRef, useState } from 'react';
import { load, store } from '../storage.js';
import { chime, enableChime, useBoard } from './useBoard.js';

// The live board plus new-order alerts, kept at the dashboard level so they work on every page:
// a chime (if sound is on), the count in the tab title, and the badge on "Orders".
export function useKitchen(restaurantId) {
  const board = useBoard(restaurantId);
  const [sound, toggleSound] = useSound();
  const seen = useRef(null);
  const orders = board.orders;
  const newCount = (orders ?? []).filter((o) => o.status === 'new').length;

  useEffect(() => {
    if (!orders) return;
    const ids = new Set(orders.filter((o) => o.status === 'new').map((o) => o.id));
    if (seen.current && [...ids].some((id) => !seen.current.has(id)) && sound) chime();
    seen.current = ids;
    document.title = ids.size ? `(${ids.size}) New order${ids.size > 1 ? 's' : ''} · Forkfly` : 'Dashboard · Forkfly';
  }, [orders, sound]);
  useEffect(
    () => () => {
      document.title = 'Forkfly';
    },
    []
  );

  return { ...board, newCount, sound, toggleSound };
}

function useSound() {
  const [on, setOn] = useState(() => load('forkfly-dash-sound', false));
  // Browsers only allow sound after a tap, so the saved choice takes effect on the first tap.
  useEffect(() => {
    if (!on) return undefined;
    const wake = () => enableChime().catch(() => {});
    wake();
    window.addEventListener('pointerdown', wake, { once: true });
    return () => window.removeEventListener('pointerdown', wake);
  }, [on]);
  const toggle = async () => {
    const next = !on;
    setOn(next);
    store('forkfly-dash-sound', next);
    if (next) {
      await enableChime().catch(() => {});
      chime();
    }
  };
  return [on, toggle];
}
