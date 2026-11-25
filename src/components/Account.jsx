import { useState } from 'react';
import { authClient, signInLink } from '../api.js';
import { Link, navigate } from '../router.jsx';
import Icon from './Icon.jsx';
import Monogram from './Monogram.jsx';

const RESTAURANT_STATUS = { pending: 'Waiting for approval', active: 'Taking orders', paused: 'Paused', suspended: 'Suspended' };
const RIDER_STATUS = { pending: 'Waiting for approval', approved: 'Approved to deliver', suspended: 'Suspended' };

export default function Account({ me, onSignedOut }) {
  const [busy, setBusy] = useState(false);

  if (!me) return <div className="page" aria-label="Loading" />;
  if (!me.user)
    return (
      <div className="empty">
        <Icon name="user" size={48} className="empty__icon" />
        <h1>You’re signed out</h1>
        <Link to={signInLink('/account')} className="btn">
          Sign in
        </Link>
      </div>
    );

  async function signOut() {
    setBusy(true);
    await authClient.signOut();
    await onSignedOut();
    navigate('/', { replace: true });
  }

  const { user, restaurants, rider } = me;
  return (
    <div className="page narrow">
      <h1>Your account</h1>
      <section className="panel">
        <div className="account-head">
          <span className="account-head__avatar">
            <Icon name="user" size={22} />
          </span>
          <div>
            <h2>{user.name}</h2>
            <p className="muted">{user.email}</p>
          </div>
          {user.role === 'admin' && <span className="tag">Admin</span>}
        </div>
        <div>
          <Link to="/orders" className="btn btn--outline btn--sm">
            Your orders
          </Link>
        </div>
      </section>

      {restaurants.length > 0 && (
        <section className="panel">
          <h2>Your restaurants</h2>
          <ul className="account-list">
            {restaurants.map((r) => (
              <li key={r.id}>
                <Monogram name={r.name} colors={r.colors} image={r.coverImage} size="sm" />
                <span className="account-list__text">
                  <strong>{r.name}</strong>
                  <span className="muted small">
                    {r.role === 'owner' ? 'Owner' : 'Staff'} · {RESTAURANT_STATUS[r.status] ?? r.status}
                  </span>
                </span>
                <Link to={`/dashboard/${r.id}`} className="btn btn--sm account-list__go">
                  Open dashboard
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rider && (
        <section className="panel">
          <h2>Delivering</h2>
          <ul className="account-list">
            <li>
              <span className="account-head__avatar">
                <Icon name="bike" size={20} />
              </span>
              <span className="account-list__text">
                <strong>{RIDER_STATUS[rider.status] ?? rider.status}</strong>
                <span className="muted small">{rider.vehicle}</span>
              </span>
            </li>
          </ul>
        </section>
      )}

      <section className="panel">
        <h2>Work with Forkfly</h2>
        <div className="account-actions">
          <Link to="/apply?as=restaurant" className="btn btn--outline btn--sm">
            {restaurants.length ? 'Add another restaurant' : 'List your restaurant'}
          </Link>
          {!rider && (
            <Link to="/apply?as=rider" className="btn btn--outline btn--sm">
              Deliver with us
            </Link>
          )}
        </div>
      </section>

      <div>
        <button type="button" className="btn btn--outline" onClick={signOut} disabled={busy}>
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}
