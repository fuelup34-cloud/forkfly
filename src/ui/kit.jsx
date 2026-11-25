// Building blocks shared by the Forkfly admin and restaurant dashboards.

import { useEffect, useRef } from 'react';
import Icon from '../components/Icon.jsx';

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const money = (cents) => USD.format(cents / 100);
// Short money for chart axes: $1.2k, $35k.
export const moneyShort = (cents) => {
  const d = cents / 100;
  if (d >= 1000) return `$${(d / 1000).toFixed(d >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return `$${Math.round(d)}`;
};
export const count = (n) => n.toLocaleString('en-US');
export const percent = (x, digits = 1) => `${(x * 100).toFixed(digits).replace(/\.0$/, '')}%`;
export const dateShort = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const timeShort = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export const hourLabel = (h) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);
export function ago(ms) {
  const min = Math.round((Date.now() - ms) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : d < 60 ? `${d} days ago` : dateShort(ms);
}
export const initials = (name) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

// A headline number with its change from the previous period.
// `better` says which direction is good ('up' or 'down'), so the arrow is coloured correctly.
export function StatTile({ label, value, now, before, better = 'up', hint }) {
  let delta = null;
  if (before != null && now != null && before !== 0) {
    const change = (now - before) / Math.abs(before);
    const good = Math.abs(change) < 0.005 ? null : (change > 0) === (better === 'up');
    delta = (
      <span className={`delta ${good == null ? '' : good ? 'delta--good' : 'delta--bad'}`}>
        <span aria-hidden="true">{change > 0 ? '↑' : change < 0 ? '↓' : '→'}</span> {percent(Math.abs(change), 0)}
        <span className="visually-hidden">{change > 0 ? ' up' : ' down'} from the previous period</span>
      </span>
    );
  }
  return (
    <div className="stat-tile dash-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {(delta || hint) && (
        <div className="dash-stat__foot">
          {delta}
          {hint && <span className="muted small">{hint}</span>}
        </div>
      )}
    </div>
  );
}

const STATUS_TEXT = {
  active: 'Active',
  approved: 'Approved',
  paused: 'Paused',
  pending: 'Pending',
  suspended: 'Suspended',
  new: 'New',
  preparing: 'Preparing',
  'on-the-way': 'On the way',
  ready: 'Ready',
  done: 'Picked up',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  rejected: 'Declined',
};
const STATUS_TONE = {
  active: 'good',
  approved: 'good',
  delivered: 'good',
  done: 'good',
  ready: 'good',
  paused: 'warn',
  pending: 'info',
  new: 'info',
  preparing: 'info',
  'on-the-way': 'info',
  suspended: 'bad',
  cancelled: 'bad',
  rejected: 'bad',
};
export function StatusPill({ status }) {
  return <span className={`badge badge--${STATUS_TONE[status] ?? 'neutral'}`}>{STATUS_TEXT[status] ?? status}</span>;
}

export function RangePicker({ value, onChange, ranges, label = 'Time range' }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {ranges.map(([id, label]) => (
        <button key={id} type="button" className={id === value ? 'is-active' : ''} aria-pressed={id === value} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Tabs({ value, onChange, tabs }) {
  return (
    <div className="chips dash-tabs" role="tablist">
      {tabs.map(([id, label, n]) => (
        <button key={id} type="button" role="tab" aria-selected={id === value} className={`chip ${id === value ? 'is-active' : ''}`} onClick={() => onChange(id)}>
          {label}
          {n != null && <span className="chip__count">{n}</span>}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="search search--compact">
      <Icon name="search" size={16} />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}

export function Avatar({ name, colors }) {
  return (
    <span className="dash-avatar" style={colors ? { background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`, color: '#fff' } : undefined} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

// A panel that slides in from the right, for details and actions on one row.
export function Drawer({ title, onClose, children, footer }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    d.showModal();
    return () => d.open && d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="drawer"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="drawer__panel">
        <header className="drawer__head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="drawer__body">{children}</div>
        {footer && <footer className="drawer__foot">{footer}</footer>}
      </div>
    </dialog>
  );
}

export function Loading() {
  return (
    <div className="dash-skeleton" aria-label="Loading">
      <div />
      <div />
      <div />
    </div>
  );
}

export function Empty({ icon = 'search', title, children }) {
  return (
    <div className="dash-empty">
      <Icon name={icon} size={32} className="muted" />
      <strong>{title}</strong>
      {children && <p className="muted small">{children}</p>}
    </div>
  );
}

// The title row every page starts with, with room for actions on the right.
export function PageHead({ title, subtitle, children }) {
  return (
    <header className="dash-top">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted small dash-subtitle">{subtitle}</p>}
      </div>
      {children && <div className="dash-top__actions">{children}</div>}
    </header>
  );
}

// Floats at the bottom of a form while it has unsaved changes. Put it inside the <form>.
export function SaveBar({ dirty, busy, note, onDiscard, label = 'Save changes' }) {
  return (
    <div className={`save-bar ${dirty || note ? 'is-visible' : ''}`} role="status">
      <span className="muted small">{dirty ? 'You have unsaved changes.' : note}</span>
      {dirty && (
        <>
          <button type="button" className="btn btn--outline btn--sm" onClick={onDiscard} disabled={busy}>
            Discard
          </button>
          <button type="submit" className="btn btn--sm" disabled={busy}>
            {busy ? 'Saving…' : label}
          </button>
        </>
      )}
    </div>
  );
}

export function Fact({ label, children }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
