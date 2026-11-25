import { useState } from 'react';
import { api, authClient, safeNext } from '../api.js';
import { Link, navigate } from '../router.jsx';
import { ACCOUNT_TYPES, AccountTypePicker, EMPTY_JOIN, JoinFields, submitApplication } from './JoinFields.jsx';

const authError = (err) =>
  err.status === 429 ? 'Too many attempts. Please wait a minute and try again.' : err.message || 'That didn’t work. Please try again.';

// One page for both signing in and creating an account (as a customer, restaurant or rider).
export default function SignIn({ mode, onSignedIn }) {
  const creating = mode === 'signup';
  const params = new URLSearchParams(location.search);
  const next = safeNext(params.get('next'));
  const [type, setType] = useState(() => (ACCOUNT_TYPES.some((t) => t.id === params.get('as')) ? params.get('as') : 'customer'));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [join, setJoin] = useState(EMPTY_JOIN);
  // Set once the account exists, so a retry after a failed application doesn't sign up twice.
  const [accountMade, setAccountMade] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const query = next === '/' ? '' : `?next=${encodeURIComponent(next)}`;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!creating) {
        const { error: err } = await authClient.signIn.email({ email: email.trim(), password });
        if (err) throw new Error(authError(err));
      } else if (!accountMade) {
        const { error: err } = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password });
        if (err) throw new Error(authError(err));
        setAccountMade(true);
      }
      const applied = creating ? await submitApplication(api, type, join) : null;
      await onSignedIn();
      const dest = !creating || type === 'customer' ? next : type === 'restaurant' ? `/dashboard/${applied.id}` : '/account';
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="page narrow auth">
      <h1>{creating ? 'Create your account' : 'Sign in'}</h1>
      <form className="panel" onSubmit={submit}>
        {creating && <AccountTypePicker value={type} onChange={setType} />}
        {creating && (
          <label className="field">
            <span>Your name</span>
            <input required autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} disabled={accountMade} />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input required type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={accountMade} />
        </label>
        <label className="field">
          <span>Password{creating ? ' (at least 8 characters)' : ''}</span>
          <input
            required
            type="password"
            minLength={creating ? 8 : undefined}
            maxLength={128}
            autoComplete={creating ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={accountMade}
          />
        </label>
        {creating && <JoinFields type={type} values={join} onChange={setJoin} />}
        {creating && type !== 'customer' && (
          <p className="muted small">We review every {type === 'rider' ? 'rider' : 'restaurant'} before they go live. You can still order food while you wait.</p>
        )}
        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn--block btn--big" disabled={busy}>
          {busy ? 'One moment…' : !creating ? 'Sign in' : type === 'customer' ? 'Create account' : 'Create account and apply'}
        </button>
        <p className="muted small auth__switch">
          {creating ? 'Already have an account? ' : 'New to Forkfly? '}
          <Link to={`${creating ? '/signin' : '/signup'}${query}`}>{creating ? 'Sign in' : 'Create an account'}</Link>
        </p>
      </form>
    </div>
  );
}
