import { useEffect, useRef, useState } from 'react';
import { dash } from '../api.js';

// The kitchen's live order board. The server pushes the whole board whenever anything on it
// changes (a new order, a courier arriving…). Reconnects by itself if the connection drops.
export function useBoard(restaurantId) {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  // Server clock minus ours, so countdowns are right even if this device's clock is off.
  const offset = useRef(0);

  useEffect(() => {
    let ws;
    let retryTimer;
    let attempts = 0;
    let stopped = false;
    setOrders(null);
    setError('');
    dash
      .orders(restaurantId)
      .then((list) => !stopped && setOrders((cur) => cur ?? list))
      .catch((err) => !stopped && setError(err.message));

    function connect() {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      ws.onopen = () => {
        attempts = 0;
        setLive(true);
        ws.send(JSON.stringify({ type: 'watch-restaurant', restaurantId }));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'board' && msg.restaurantId === restaurantId) {
          offset.current = msg.now - Date.now();
          setOrders(msg.orders);
          setError('');
        }
        if (msg.type === 'error' && msg.restaurantId === restaurantId) setError(msg.error);
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
  }, [restaurantId]);

  // Replace one order straight away after an action, before the server's push arrives.
  const update = (order) => setOrders((list) => (list ?? []).map((o) => (o.id === order.id ? order : o)).filter((o) => ['new', 'preparing', 'ready'].includes(o.status)));

  return { orders, error, live, update, serverNow: () => Date.now() + offset.current };
}

// Re-renders every `ms`, for countdowns.
export function useTicker(ms = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

// A short two-note chime made in the browser, so there's no sound file to load.
let audio;
export function enableChime() {
  audio ??= new (window.AudioContext || window.webkitAudioContext)();
  return audio.resume();
}
export function chime() {
  if (!audio || audio.state !== 'running') return;
  const now = audio.currentTime;
  for (const [i, freq] of [880, 1320].entries()) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.3, now + i * 0.18 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.5);
    osc.connect(gain).connect(audio.destination);
    osc.start(now + i * 0.18);
    osc.stop(now + i * 0.18 + 0.55);
  }
}
