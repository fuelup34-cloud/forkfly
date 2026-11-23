import { useEffect, useState } from 'react';

// Opened on the courier's phone from a private link. The key is after '#', so it stays out of URLs sent to the server.
export default function Courier({ id }) {
  const [key] = useState(() => location.hash.slice(1));
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [sentAt, setSentAt] = useState(null);
  const finished = job?.status === 'delivered' || job?.status === 'cancelled';

  async function call(action, body) {
    const res = await fetch(`/api/courier/${id}${action ? `/${action}` : ''}`, {
      method: action ? 'POST' : 'GET',
      headers: { 'X-Courier-Key': key, 'Content-Type': 'application/json' },
      body: action ? JSON.stringify(body ?? {}) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setJob(data);
  }
  const run = (action) => call(action).then(() => setError(''), (err) => setError(err.message));

  useEffect(() => {
    run();
    const timer = setInterval(run, 5000); // notice if the customer cancels
    return () => clearInterval(timer);
  }, [id, key]);

  useEffect(() => {
    if (!sharing || finished) return undefined;
    let lock;
    let stopped = false;
    navigator.wakeLock?.request('screen').then((l) => (stopped ? l.release() : (lock = l))).catch(() => {});
    const watch = navigator.geolocation.watchPosition(
      ({ coords }) =>
        call('location', { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy })
          .then(() => (setError(''), setSentAt(Date.now())))
          .catch((err) => setError(err.message)),
      (err) => {
        setError(`Could not get your location: ${err.message}`);
        if (err.code === 1) setSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
    return () => {
      stopped = true;
      navigator.geolocation.clearWatch(watch);
      lock?.release();
    };
  }, [sharing, finished]);

  return (
    <div className="page narrow panel courier-page">
      <h1>Courier</h1>
      {job && (
        <p>
          Collect from <strong>{job.restaurant}</strong> and take it to <strong>{job.address}</strong>.{job.note && ` Note: ${job.note}`}
        </p>
      )}
      {finished && <p role="status">This delivery is {job.status}. Location sharing is off.</p>}
      {job && !finished && !window.isSecureContext && <p className="notice notice--error">Location needs the https:// version of this link.</p>}
      {job && !finished && (
        <>
          <button type="button" className="btn" disabled={!window.isSecureContext} onClick={() => setSharing(!sharing)}>
            {sharing ? 'Stop sharing location' : 'Share my live location'}
          </button>
          {sharing && <p role="status">{sentAt ? `Location sent at ${new Date(sentAt).toLocaleTimeString()}.` : 'Finding you…'} Keep this page open.</p>}
          {job.status === 'preparing' ? (
            <button type="button" className="btn" onClick={() => run('pickup')}>I picked up the food</button>
          ) : (
            <button type="button" className="btn" onClick={() => run('deliver')}>I delivered it</button>
          )}
        </>
      )}
      {error && <p className="notice notice--error" role="alert">{error}</p>}
    </div>
  );
}
