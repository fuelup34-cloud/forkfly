import { useState } from "react";
import { authClient, signInLink } from "../api.js";
import { Link, navigate } from "../router.jsx";
import Icon from "./Icon.jsx";
import Monogram from "./Monogram.jsx";

const RESTAURANT_STATUS = {
  pending: "Waiting for approval",
  active: "Taking orders",
  paused: "Paused",
  suspended: "Suspended",
};
const initials = (name) =>
  name
    .trim()
    .split(/\s+/)
    .map((w) => [...w][0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
const RIDER_STATUS = {
  pending: "Waiting for approval",
  approved: "Approved to deliver",
  suspended: "Suspended",
};

export default function Account({ me, onSignedOut }) {
  const [busy, setBusy] = useState(false);

  if (!me) return <div className="page" aria-label="Loading" />;
  if (!me.user)
    return (
      <div className="empty">
        <Icon name="user" size={48} className="empty__icon" />
        <h1>You’re signed out</h1>
        <Link to={signInLink("/account")} className="btn">
          Sign in
        </Link>
      </div>
    );

  async function signOut() {
    setBusy(true);
    await authClient.signOut();
    await onSignedOut();
    navigate("/", { replace: true });
  }

  const { user, restaurants, rider } = me;
  const admin = user.role === "admin";
  const workspaces = admin || restaurants.length > 0;
  return (
    <div className="page narrow account">
      <section className="panel account-profile">
        <span className="account-profile__avatar" aria-hidden="true">
          {initials(user.name)}
        </span>
        <div className="account-profile__text">
          <h1>{user.name}</h1>
          <p className="muted">{user.email}</p>
        </div>
        <div className="account-profile__tags">
          {admin && <span className="tag">Forkfly admin</span>}
          {restaurants.some((r) => r.role === "owner") && (
            <span className="tag tag--quiet">Restaurant owner</span>
          )}
          {rider?.status === "approved" && (
            <span className="tag tag--quiet">Rider</span>
          )}
        </div>
      </section>

      {workspaces && (
        <section aria-labelledby="ws-title">
          <h2 id="ws-title" className="account-section-title">
            Your workspaces
          </h2>
          <div className="workspace-grid">
            {admin && (
              <Link to="/admin" className="workspace workspace--admin">
                <span className="workspace__icon">
                  <Icon name="shield" size={22} />
                </span>
                <span className="workspace__text">
                  <strong>Admin dashboard</strong>
                  <span>
                    Orders, restaurants, riders, customers and settings for all
                    of Forkfly.
                  </span>
                </span>
                <span className="workspace__go">Open ›</span>
              </Link>
            )}
            {restaurants.map((r) => (
              <Link key={r.id} to={`/dashboard/${r.id}`} className="workspace">
                <Monogram
                  name={r.name}
                  colors={r.colors}
                  image={r.coverImage}
                  size="sm"
                />
                <span className="workspace__text">
                  <strong>{r.name}</strong>
                  <span>
                    {r.role === "owner" ? "Owner" : "Staff"} ·{" "}
                    <span
                      className={`workspace__status workspace__status--${r.status}`}
                    >
                      {RESTAURANT_STATUS[r.status] ?? r.status}
                    </span>
                  </span>
                </span>
                <span className="workspace__go">Open dashboard ›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Ordering</h2>
        <div className="account-actions">
          <Link to="/orders" className="btn btn--outline btn--sm">
            Your orders
          </Link>
          <Link to="/" className="btn btn--outline btn--sm">
            Browse restaurants
          </Link>
        </div>
      </section>

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
                <span className="muted small">
                  {rider.vehicle}
                  {rider.status === "suspended" &&
                    rider.note &&
                    ` · ${rider.note}`}
                </span>
              </span>
            </li>
          </ul>
        </section>
      )}

      {!admin && (
        <section className="panel">
          <h2>Work with Forkfly</h2>
          <div className="account-actions">
            <Link
              to="/apply?as=restaurant"
              className="btn btn--outline btn--sm"
            >
              {restaurants.length
                ? "Add another restaurant"
                : "List your restaurant"}
            </Link>
            {!rider && (
              <Link to="/apply?as=rider" className="btn btn--outline btn--sm">
                Deliver with us
              </Link>
            )}
          </div>
        </section>
      )}

      <div>
        <button
          type="button"
          className="btn btn--outline"
          onClick={signOut}
          disabled={busy}
        >
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}
