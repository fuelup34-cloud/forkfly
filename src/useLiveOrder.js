import { useEffect, useState } from 'react';
import { api } from './api.js';

// Follows one order live. The server pushes a fresh snapshot (status, courier position, ETA)
// twice a second over a WebSocket. If the connection drops, it reconnects by itself.
export function useLiveOrder(orderId, signedIn = true) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!signedIn) return undefined;
    let ws;
    let retryTimer;
    let attempts = 0;
    let stopped = false;

    setOrder(null);
    setError('');
    // Show something straight away, even before the live connection opens.
    api.order(orderId).then((o) => !stopped && setOrder((cur) => cur ?? o)).catch((err) => !stopped && setError(err.message));

    function connect() {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      ws.onopen = () => {
        attempts = 0;
        setLive(true);
        ws.send(JSON.stringify({ type: 'watch', orderId }));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'order' && msg.order.id === orderId) setOrder(msg.order);
        if (msg.type === 'error' && msg.orderId === orderId) setError(msg.error);
      };
      ws.onclose = () => {
        setLive(false);
        if (stopped) return;
        retryTimer = setTimeout(connect, Math.min(10_000, 500 * 2 ** attempts++));
      };
    }
    connect();

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, [orderId, signedIn]);

  return { order, setOrder, error, live };
}
