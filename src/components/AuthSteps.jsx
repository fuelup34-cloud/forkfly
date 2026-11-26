import { useEffect, useRef, useState } from 'react';
import { authClient } from '../api.js';
import { Link } from '../router.jsx';
import Icon from './Icon.jsx';

const CODE_LENGTH = 6;
const RESEND_AFTER_S = 30;

// Better Auth errors → sentences people can act on.
export function authError(err) {
  if (err?.status === 429) return 'Too many attempts. Please wait a minute and try again.';
  switch (err?.code) {
    case 'INVALID_OTP':
      return 'That code isn’t right. Check the email and try again.';
    case 'OTP_EXPIRED':
      return 'That code has expired. Send a new one below.';
    case 'TOO_MANY_ATTEMPTS':
      return 'Too many wrong codes. Send a new one below.';
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'That email and password don’t match. Check them or reset your password.';
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'There’s already an account with that email. Sign in instead.';
    case 'PASSWORD_TOO_SHORT':
      return 'Use at least 8 characters for your password.';
    default:
      return err?.message || 'That didn’t work. Please try again.';
  }
}

// A countdown before "Send a new code" works again, so people don't flood their inbox.
function useCooldown(initial) {
  const [left, setLeft] = useState(initial);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, () => setLeft(RESEND_AFTER_S)];
}

// Six boxes for a 6-digit code. Typing moves along, Backspace moves back, and pasting
// (or the phone's "from Messages/Mail" suggestion) fills them all.
export function OtpInput({ value, onChange, onComplete, disabled, autoFocus = true }) {
  const refs = useRef([]);
  const digits = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? '');

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const set = (next) => {
    const clean = next.replace(/\D/g, '').slice(0, CODE_LENGTH);
    onChange(clean);
    if (clean.length === CODE_LENGTH) onComplete?.(clean);
    return clean;
  };

  const onInput = (i, raw) => {
    const typed = raw.replace(/\D/g, '');
    if (!typed) return;
    // More than one digit: a paste or autofill, starting here.
    const next = set((value.slice(0, i) + typed).slice(0, CODE_LENGTH));
    refs.current[Math.min(next.length, CODE_LENGTH - 1)]?.focus();
  };

  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[i]) set(value.slice(0, i) + value.slice(i + 1));
      else if (i > 0) {
        set(value.slice(0, i - 1) + value.slice(i));
        refs.current[i - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === 'ArrowRight' && i < CODE_LENGTH - 1) refs.current[i + 1]?.focus();
  };

  return (
    <div className="otp" role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          className={`otp__box ${d ? 'is-filled' : ''}`}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          pattern="[0-9]*"
          maxLength={i === 0 ? CODE_LENGTH : 1}
          aria-label={`Digit ${i + 1}`}
          value={d}
          disabled={disabled}
          onChange={(e) => onInput(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          onPaste={(e) => {
            e.preventDefault();
            const next = set(e.clipboardData.getData('text'));
            refs.current[Math.min(next.length, CODE_LENGTH - 1)]?.focus();
          }}
        />
      ))}
    </div>
  );
}

export function PasswordField({ id, label, value, onChange, autoComplete, placeholder, disabled, hint }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      {label}
      <span className="auth-password">
        <input
          required
          id={id}
          type={show ? 'text' : 'password'}
          minLength={autoComplete === 'new-password' ? 8 : undefined}
          maxLength={128}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
        />
        <button type="button" className="auth-password__toggle" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
          <Icon name={show ? 'eye-off' : 'eye'} size={18} />
        </button>
      </span>
      {hint}
    </div>
  );
}

// ---------- Confirm your email ----------

// Shown after sign-up, or when someone signs in before confirming. A code has already been sent.
// `onVerified` runs once the code is accepted (they're signed in by then).
export function VerifyEmailStep({ email, onVerified, onBack, backLabel = 'Use a different email' }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, restartCooldown] = useCooldown(RESEND_AFTER_S);

  async function verify(otp = code) {
    if (otp.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    const { error: err } = await authClient.emailOtp.verifyEmail({ email, otp });
    if (err) {
      setError(authError(err));
      setCode('');
      setBusy(false);
      return;
    }
    try {
      await onVerified();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function resend() {
    setError('');
    setNotice('');
    restartCooldown();
    const { error: err } = await authClient.emailOtp.sendVerificationOtp({ email, type: 'email-verification' });
    if (err) setError(authError(err));
    else setNotice('We sent a new code. It replaces the old one.');
  }

  return (
    <>
      <span className="auth-badge" aria-hidden="true">
        <Icon name="shield" size={26} />
      </span>
      <h1 className="auth-card__title">Check your email</h1>
      <p className="auth-card__lead">
        We sent a 6-digit code to <strong className="auth-email">{email}</strong>. Enter it below to confirm it’s you.
      </p>
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          verify();
        }}
      >
        <OtpInput value={code} onChange={setCode} onComplete={verify} disabled={busy} />
        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="notice notice--info" role="status">
            {notice}
          </p>
        )}
        <button type="submit" className="btn btn--block btn--big auth-submit" disabled={busy || code.length !== CODE_LENGTH}>
          {busy ? 'Checking…' : 'Confirm email'}
        </button>
      </form>
      <p className="auth-resend">
        Didn’t get it? Check spam, or{' '}
        <button type="button" className="text-btn" onClick={resend} disabled={cooldown > 0}>
          {cooldown > 0 ? `send a new code in ${cooldown}s` : 'send a new code'}
        </button>
        .
      </p>
      {onBack && (
        <p className="auth-switch">
          <button type="button" className="text-btn" onClick={onBack}>
            ← {backLabel}
          </button>
        </p>
      )}
    </>
  );
}

// ---------- Forgot password ----------

// Email → code + new password → signed in. The first step never says whether the email has an
// account, so nobody can use it to find out who's on Forkfly.
export function ForgotPasswordCard({ initialEmail = '', onDone, signInHref }) {
  const [step, setStep] = useState('email'); // email | reset
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, restartCooldown] = useCooldown(0);

  async function sendCode(e) {
    e?.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const { error: err } = await authClient.emailOtp.requestPasswordReset({ email: email.trim() });
    setBusy(false);
    if (err) return setError(authError(err));
    restartCooldown();
    if (step === 'reset') setNotice('We sent a new code. It replaces the old one.');
    setStep('reset');
  }

  async function reset(e) {
    e.preventDefault();
    if (code.length !== CODE_LENGTH) return setError('Enter the 6-digit code from the email.');
    setBusy(true);
    setError('');
    setNotice('');
    const { error: err } = await authClient.emailOtp.resetPassword({ email: email.trim(), otp: code, password });
    if (err) {
      setError(authError(err));
      if (err.code === 'INVALID_OTP' || err.code === 'OTP_EXPIRED' || err.code === 'TOO_MANY_ATTEMPTS') setCode('');
      setBusy(false);
      return;
    }
    // Reset worked: sign straight in with the new password.
    const { error: signInErr } = await authClient.signIn.email({ email: email.trim(), password });
    try {
      await onDone({ signedIn: !signInErr });
    } catch (e2) {
      setError(e2.message);
      setBusy(false);
    }
  }

  if (step === 'email')
    return (
      <>
        <span className="auth-badge" aria-hidden="true">
          <Icon name="shield" size={26} />
        </span>
        <h1 className="auth-card__title">Forgot your password?</h1>
        <p className="auth-card__lead">Enter the email you signed up with and we’ll send you a code to choose a new one.</p>
        <form className="auth-form" onSubmit={sendCode}>
          <label className="field">
            <span>Email</span>
            <input required type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
          </label>
          {error && (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn--block btn--big auth-submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset code'}
          </button>
        </form>
        <p className="auth-switch">
          Remembered it? <Link to={signInHref}>Back to sign in</Link>
        </p>
      </>
    );

  return (
    <>
      <span className="auth-badge" aria-hidden="true">
        <Icon name="shield" size={26} />
      </span>
      <h1 className="auth-card__title">Choose a new password</h1>
      <p className="auth-card__lead">
        If <strong className="auth-email">{email.trim()}</strong> has a Forkfly account, we’ve sent it a 6-digit code. Enter it with your new password.
      </p>
      <form className="auth-form" onSubmit={reset}>
        <div className="field">
          <span>Code from the email</span>
          <OtpInput value={code} onChange={setCode} disabled={busy} />
        </div>
        <PasswordField
          id="new-password"
          label={<label htmlFor="new-password">New password</label>}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          disabled={busy}
          hint={<span className="auth-hint">You’ll be signed out on your other devices.</span>}
        />
        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="notice notice--info" role="status">
            {notice}
          </p>
        )}
        <button type="submit" className="btn btn--block btn--big auth-submit" disabled={busy}>
          {busy ? 'One moment…' : 'Reset password and sign in'}
        </button>
      </form>
      <p className="auth-resend">
        No code?{' '}
        <button type="button" className="text-btn" onClick={() => sendCode()} disabled={busy || cooldown > 0}>
          {cooldown > 0 ? `Send another in ${cooldown}s` : 'Send another'}
        </button>{' '}
        or{' '}
        <button
          type="button"
          className="text-btn"
          onClick={() => {
            setStep('email');
            setCode('');
            setError('');
            setNotice('');
          }}
        >
          use a different email
        </button>
        .
      </p>
    </>
  );
}
