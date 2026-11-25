import { useState } from 'react';
import { api } from '../api.js';
import { Link, navigate } from '../router.jsx';
import Icon from './Icon.jsx';
import { ACCOUNT_TYPES, AccountTypePicker, EMPTY_JOIN, JoinFields, submitApplication } from './JoinFields.jsx';

const PARTNER_TYPES = ACCOUNT_TYPES.filter((t) => t.id !== 'customer');

// For people who already have an account and want to add a restaurant or start riding.
export default function Apply({ me, onApplied }) {
  const as = new URLSearchParams(location.search).get('as');
  const [type, setType] = useState(PARTNER_TYPES.some((t) => t.id === as) ? as : 'restaurant');
  const [join, setJoin] = useState(EMPTY_JOIN);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!me) return <div className="page" aria-label="Loading" />;
  if (!me.user)
    return (
      <div className="empty">
        <Icon name="store" size={48} className="empty__icon" />
        <h1>Create an account to apply</h1>
        <Link to={`/signup?as=${type}`} className="btn">
          Get started
        </Link>
      </div>
    );
  // Someone who already rides can still add a restaurant, but not apply to ride twice.
  const types = me.rider ? PARTNER_TYPES.filter((t) => t.id !== 'rider') : PARTNER_TYPES;
  const current = types.some((t) => t.id === type) ? type : types[0].id;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const applied = await submitApplication(api, current, join);
      await onApplied();
      navigate(current === 'restaurant' ? `/dashboard/${applied.id}` : '/account', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="page narrow auth">
      <Link to="/account" className="back-link">
        ← Your account
      </Link>
      <h1>Work with Forkfly</h1>
      <form className="panel" onSubmit={submit}>
        <AccountTypePicker value={current} onChange={setType} types={types} />
        <JoinFields type={current} values={join} onChange={setJoin} />
        <p className="muted small">We review every application before it goes live.</p>
        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn--block btn--big" disabled={busy}>
          {busy ? 'Sending…' : 'Apply'}
        </button>
      </form>
    </div>
  );
}
