import { useEffect, useState } from 'react';
import { dash, forgetRestaurantCache } from '../api.js';
import { Link } from '../router.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import PhotoField from './PhotoField.jsx';
import { Avatar, SaveBar } from '../ui/kit.jsx';

const PREP = [5, 10, 15, 20, 25, 30, 40, 45, 60];

export default function Settings({ restaurant, onChange }) {
  const owner = restaurant.role === 'owner';
  return (
    <div className="settings dash-settings">
      <Profile restaurant={restaurant} owner={owner} onChange={onChange} />
      <Team restaurant={restaurant} owner={owner} />
      <section className="dash-card">
        <h2 className="dash-card__title">Your page</h2>
        <p className="muted">See what customers see.</p>
        <div>
          <Link to={`/r/${restaurant.id}`} className="btn btn--outline btn--sm">
            View your restaurant page
          </Link>
        </div>
      </section>
    </div>
  );
}

function Profile({ restaurant, owner, onChange }) {
  const pick = (r) => ({
    name: r.name,
    cuisine: r.cuisine,
    description: r.description,
    prepMin: r.prepMin,
    priceLevel: r.priceLevel,
    coverImage: r.coverImage,
    phone: r.phone ?? '',
  });
  const [form, setForm] = useState(() => pick(restaurant));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ error: '', saved: false });
  const dirty = JSON.stringify(form) !== JSON.stringify(pick(restaurant));
  const set = (key, num) => (e) => setForm((f) => ({ ...f, [key]: num ? Number(e.target.value) : e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setStatus({ error: '', saved: false });
    try {
      const updated = await dash.update(restaurant.id, form);
      forgetRestaurantCache();
      onChange(updated);
      setForm(pick(updated));
      setStatus({ error: '', saved: true });
    } catch (err) {
      setStatus({ error: err.message, saved: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="dash-card" onSubmit={save}>
      <h2 className="dash-card__title">Restaurant profile</h2>
      {!owner && <p className="notice">Only the owner can change the profile.</p>}
      <PhotoField
        wide
        label="Cover photo"
        value={form.coverImage}
        disabled={!owner}
        onChange={(coverImage) => setForm((f) => ({ ...f, coverImage }))}
        hint="Shown on your card and at the top of your page. Landscape, at least 1200 px wide."
      />
      <div className="field-row">
        <label className="field">
          <span>Restaurant name</span>
          <input required minLength={2} maxLength={60} value={form.name} onChange={set('name')} disabled={!owner} />
        </label>
        <label className="field">
          <span>Cuisine</span>
          <input required minLength={2} maxLength={30} value={form.cuisine} onChange={set('cuisine')} disabled={!owner} />
        </label>
      </div>
      <label className="field">
        <span>Description</span>
        <textarea rows={3} maxLength={300} value={form.description} onChange={set('description')} disabled={!owner} placeholder="One or two sentences about your food." />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Usual prep time</span>
          <select value={form.prepMin} onChange={set('prepMin', true)} disabled={!owner}>
            {[...new Set([...PREP, form.prepMin])]
              .sort((a, b) => a - b)
              .map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span>Phone (for Forkfly, not shown to customers)</span>
          <input type="tel" autoComplete="tel" inputMode="tel" maxLength={20} pattern="\+?[0-9 ()\-.]{7,20}" value={form.phone} onChange={set('phone')} disabled={!owner} />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Price range</span>
          <select value={form.priceLevel} onChange={set('priceLevel', true)} disabled={!owner}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {'$'.repeat(n)} · {['Inexpensive', 'Moderate', 'Pricey', 'High end'][n - 1]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {status.error && (
        <p className="notice notice--error" role="alert">
          {status.error}
        </p>
      )}
      {owner && <SaveBar dirty={dirty} busy={busy} note={status.saved ? 'Profile saved.' : ''} onDiscard={() => setForm(pick(restaurant))} />}
    </form>
  );
}

function Team({ restaurant, owner }) {
  const [staff, setStaff] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialog, ask] = useConfirm();
  const refresh = () =>
    dash
      .staff(restaurant.id)
      .then(setStaff)
      .catch((err) => setError(err.message));
  useEffect(() => {
    refresh();
  }, [restaurant.id]);

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await dash.addStaff(restaurant.id, { email: email.trim(), role });
      setEmail('');
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(person) {
    const ok = await ask({ title: `Remove ${person.name}?`, body: `They’ll lose access to ${restaurant.name}’s dashboard.`, confirm: 'Remove', danger: true });
    if (!ok) return;
    setError('');
    try {
      await dash.removeStaff(restaurant.id, person.id);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="dash-card">
      {dialog}
      <h2 className="dash-card__title">Team</h2>
      <p className="muted small">Staff can run orders, pause the restaurant and mark items sold out. Owners can also edit the menu, profile and team.</p>
      <ul className="team">
        {(staff ?? []).map((p) => (
          <li key={p.id}>
            <Avatar name={p.name} />
            <span className="team__text">
              <strong>
                {p.name}
                {p.you && <span className="muted"> (you)</span>}
              </strong>
              <span className="muted small">{p.email}</span>
            </span>
            <span className={`badge ${p.role === 'owner' ? 'badge--good' : ''}`}>{p.role === 'owner' ? 'Owner' : 'Staff'}</span>
            {owner && !p.you && (
              <button type="button" className="text-btn small text-btn--danger" onClick={() => remove(p)}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {owner && (
        <form className="team__add" onSubmit={add}>
          <label className="field">
            <span>Add someone by email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="staff">Staff</option>
              <option value="owner">Owner</option>
            </select>
          </label>
          <button type="submit" className="btn" disabled={busy}>
            Add
          </button>
        </form>
      )}
      {owner && <p className="muted small">They need a Forkfly account first.</p>}
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
