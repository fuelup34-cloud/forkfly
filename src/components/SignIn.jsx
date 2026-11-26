import { useState } from "react";
import { FEES, formatMoney } from "../../shared/core.js";
import { api, authClient, homeFor, safeNext } from "../api.js";
import { imageUrl } from "../images.js";
import { Link, navigate } from "../router.jsx";
import Icon from "./Icon.jsx";
import Logo from "./Logo.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import {
  ACCOUNT_TYPES,
  AccountTypePicker,
  EMPTY_JOIN,
  JoinFields,
  submitApplication,
} from "./JoinFields.jsx";
import "./auth.css";

const authError = (err) =>
  err.status === 429
    ? "Too many attempts. Please wait a minute and try again."
    : err.message || "That didn’t work. Please try again.";

// One page for both signing in and creating an account (as a customer, restaurant or rider).
export default function SignIn({ mode, onSignedIn }) {
  const creating = mode === "signup";
  const params = new URLSearchParams(location.search);
  const next = safeNext(params.get("next"));
  const [type, setType] = useState(() =>
    ACCOUNT_TYPES.some((t) => t.id === params.get("as"))
      ? params.get("as")
      : "customer",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [join, setJoin] = useState(EMPTY_JOIN);
  // Set once the account exists, so a retry after a failed application doesn't sign up twice.
  const [accountMade, setAccountMade] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const query = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!creating) {
        const { error: err } = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (err) throw new Error(authError(err));
      } else if (!accountMade) {
        const { error: err } = await authClient.signUp.email({
          name: name.trim(),
          email: email.trim(),
          password,
        });
        if (err) throw new Error(authError(err));
        setAccountMade(true);
      }
      const applied = creating
        ? await submitApplication(api, type, join)
        : null;
      const me = await onSignedIn();
      // A page they were sent here from wins. Otherwise admins and restaurant teams go to their dashboard.
      const home = next !== "/" ? next : (homeFor(me) ?? "/");
      const dest = !creating
        ? home
        : type === "customer"
          ? next
          : type === "restaurant"
            ? `/dashboard/${applied.id}`
            : "/account";
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-screen__form">
        <header className="auth-top">
          <Link to="/" aria-label="Forkfly home">
            <Logo size={19} />
          </Link>
          <ThemeToggle />
        </header>

        <div className="auth-card">
          <h1 className="auth-card__title">
            {creating ? "Create your account" : "Welcome back"}
          </h1>
          <p className="auth-card__lead">
            {creating
              ? "Order from local kitchens, run your restaurant, or deliver with Forkfly."
              : "Sign in to order, track deliveries and manage your restaurant."}
          </p>

          <form className="auth-form" onSubmit={submit}>
            {creating && <AccountTypePicker value={type} onChange={setType} />}
            {creating && (
              <label className="field">
                <span>Full name</span>
                <input
                  required
                  autoComplete="name"
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={accountMade}
                  placeholder="Jordan Smith"
                />
              </label>
            )}
            <label className="field">
              <span>Email</span>
              <input
                required
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={accountMade}
                placeholder="you@example.com"
              />
            </label>
            <div className="field">
              <label htmlFor="auth-password">Password</label>
              <span className="auth-password">
                <input
                  required
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  minLength={creating ? 8 : undefined}
                  maxLength={128}
                  autoComplete={creating ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={accountMade}
                  placeholder={creating ? "At least 8 characters" : ""}
                />
                <button
                  type="button"
                  className="auth-password__toggle"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  <Icon name={showPassword ? "eye-off" : "eye"} size={18} />
                </button>
              </span>
            </div>
            {creating && (
              <JoinFields type={type} values={join} onChange={setJoin} />
            )}
            {creating && type !== "customer" && (
              <p className="auth-note">
                <Icon name="shield" size={16} /> We review every{" "}
                {type === "rider" ? "rider" : "restaurant"} before they go live.
                You can still order food while you wait.
              </p>
            )}
            {error && (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="btn btn--block btn--big auth-submit"
              disabled={busy}
            >
              {busy
                ? "One moment…"
                : !creating
                  ? "Sign in"
                  : type === "customer"
                    ? "Create account"
                    : "Create account and apply"}
            </button>
          </form>

          <p className="auth-switch">
            {creating ? "Already have an account?" : "New to Forkfly?"}{" "}
            <Link to={`${creating ? "/signin" : "/signup"}${query}`}>
              {creating ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </div>

        <footer className="auth-foot">
          <Link to="/">← Back to restaurants</Link>
          <span>© {new Date().getFullYear()} Forkfly</span>
        </footer>
      </div>

      <Showcase kind={creating ? type : "customer"} />
    </div>
  );
}

// ---------- The picture side ----------

const PHOTO = (id) => `https://images.unsplash.com/photo-${id}`;
const SHOWCASE = {
  customer: {
    title: "Good food from local kitchens, right to your door.",
    points: [
      `Delivery from ${formatMoney(FEES.deliveryBase)} for the first mile`,
      "Track your courier live on the map",
      `Service fee never more than ${formatMoney(FEES.serviceCap)}`,
    ],
    photos: [
      "1529193591184-b1d58069ecdd",
      "1579871494447-9811cf80d66c",
      "1582878826629-29b7ad1cdc43",
    ],
    card: {
      icon: "bike",
      title: "Your order is on the way",
      meta: "Arriving in 12 min",
      progress: 0.68,
    },
  },
  restaurant: {
    title: "Bring your kitchen to more hungry customers.",
    points: [
      "Accept orders from a live board, with a chime",
      "Edit your menu and mark dishes sold out in a tap",
      "See today’s sales by hour and your top dishes",
    ],
    photos: [
      "1565557623262-b51c2513a641",
      "1513104890138-7c749659a591",
      "1555507036-ab1f4038808a",
    ],
    card: {
      icon: "receipt",
      title: "New order · 3 items",
      meta: "Ready in 15 min · $38.50",
      progress: null,
    },
  },
  rider: {
    title: "Deliver for Forkfly on your own schedule.",
    points: [
      "Keep 100% of your tips",
      "Live GPS straight from your phone",
      "Ride a bicycle, e-bike, scooter or car",
    ],
    photos: [
      "1565299585323-38d6b0865b47",
      "1512621776951-a57141f2eefd",
      "1568901346375-23c9450c58cd",
    ],
    card: {
      icon: "check",
      title: "Delivered",
      meta: "Picked up 18 min ago",
      progress: 1,
    },
  },
};
const DOODLES = [
  "pizza",
  "bowl",
  "cup",
  "burger",
  "taco",
  "leaf",
  "chili",
  "plate",
];

function Showcase({ kind }) {
  const s = SHOWCASE[kind] ?? SHOWCASE.customer;
  return (
    <aside className="auth-showcase" aria-hidden="true">
      <div className="auth-doodles">
        {DOODLES.map((d, i) => (
          <span key={d} className={`auth-doodle auth-doodle--${i + 1}`}>
            <Icon name={d} size={44} strokeWidth={1.4} />
          </span>
        ))}
      </div>

      <div className="auth-showcase__inner">
        <div className="auth-collage">
          {s.photos.map((id, i) => (
            <img
              key={id}
              className={`auth-collage__photo auth-collage__photo--${i + 1}`}
              src={imageUrl(PHOTO(id), i === 0 ? 520 : 320)}
              alt=""
              loading={i ? "lazy" : "eager"}
            />
          ))}
          <div className="auth-live-card">
            <span className="auth-live-card__icon">
              <Icon name={s.card.icon} size={18} />
            </span>
            <span className="auth-live-card__text">
              <strong>{s.card.title}</strong>
              <span>{s.card.meta}</span>
              {s.card.progress != null && (
                <span className="auth-live-card__bar">
                  <span style={{ width: `${s.card.progress * 100}%` }} />
                </span>
              )}
            </span>
          </div>
          <div className="auth-rating-card">
            <Icon name="leaf" size={14} /> Made to order <span>· by local kitchens</span>
          </div>
        </div>

        <h2 className="auth-showcase__title">{s.title}</h2>
        <ul className="auth-points">
          {s.points.map((p) => (
            <li key={p}>
              <span className="auth-points__tick">
                <Icon name="check" size={14} strokeWidth={2.2} />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
