import { useEffect, useRef, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js/pure';
import { formatMoney } from '../../shared/core.js';
import { api } from '../api.js';
import Icon from './Icon.jsx';

// Stripe.js is only fetched (from js.stripe.com, as Stripe requires) once someone reaches payment.
let stripePromise = null;
const getStripe = (key) => (stripePromise ??= loadStripe(key));

// The card form matches the site's colours and light/dark theme.
function appearance() {
  const css = getComputedStyle(document.documentElement);
  const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const dark = document.documentElement.dataset.theme === 'dark';
  return {
    theme: dark ? 'night' : 'stripe',
    variables: {
      colorPrimary: v('--accent', '#047857'),
      colorBackground: v('--surface', dark ? '#1c1c1e' : '#ffffff'),
      colorText: v('--text', dark ? '#f5f5f5' : '#111111'),
      colorDanger: v('--danger', '#dc2626'),
      fontFamily: getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif',
      borderRadius: '12px',
      spacingUnit: '4px',
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Turn a paid payment into the order. Retries briefly while Stripe finishes processing.
async function completeWithRetry(checkoutId) {
  for (let i = 0; ; i++) {
    try {
      return await api.completeCheckout(checkoutId);
    } catch (err) {
      if ((err.status === 402 || err.status === 504) && i < 8) {
        await sleep(1500);
        continue;
      }
      throw err;
    }
  }
}

// Step 2 of checkout: Stripe's Payment Element for a payment the server already started
// (`checkout` = { checkoutId, clientSecret, amount }). Calls `onPaid(order)` once the order exists.
export default function PaymentStep({ publishableKey, checkout, onPaid, onBack }) {
  const mountRef = useRef(null);
  const stripeRef = useRef(null);
  const elementsRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const testMode = publishableKey.startsWith('pk_test_');

  useEffect(() => {
    let cancelled = false;
    let element;
    setReady(false);
    getStripe(publishableKey)
      .then((stripe) => {
        if (cancelled) return;
        if (!stripe) throw new Error('Couldn’t load the payment form. Check your connection and try again.');
        stripeRef.current = stripe;
        const elements = stripe.elements({ clientSecret: checkout.clientSecret, appearance: appearance() });
        elementsRef.current = elements;
        element = elements.create('payment', { layout: 'tabs', wallets: { link: 'never' } });
        element.on('ready', () => !cancelled && setReady(true));
        element.on('change', (e) => !cancelled && setComplete(e.complete));
        element.on('loaderror', (e) => !cancelled && setError(e.error?.message ?? 'Couldn’t load the payment form.'));
        element.mount(mountRef.current);
      })
      .catch((err) => {
        stripePromise = null; // let a later try load it again
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
      element?.destroy();
    };
  }, [publishableKey, checkout.clientSecret]);

  async function pay() {
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements) return;
    setBusy(true);
    setError('');
    const { error: err, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      // Only used by payment methods that leave the page; checkout allows none, but Stripe requires it.
      confirmParams: { return_url: `${location.origin}/orders` },
    });
    if (err) {
      // Card declined, wrong CVC and so on: Stripe's message says what to fix.
      setError(err.type === 'card_error' || err.type === 'validation_error' ? err.message : 'The payment didn’t go through. You haven’t been charged. Please try again.');
      setBusy(false);
      return;
    }
    if (paymentIntent && paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'processing') {
      setError('The payment wasn’t completed. You haven’t been charged.');
      setBusy(false);
      return;
    }
    try {
      onPaid(await completeWithRetry(checkout.checkoutId));
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <section className="pay-step" aria-labelledby="pay-title">
      <div className="pay-step__head">
        <h3 id="pay-title">
          <Icon name="shield" size={18} /> Payment
        </h3>
        <button type="button" className="text-btn small" onClick={onBack} disabled={busy}>
          Change order
        </button>
      </div>
      {testMode && (
        <p className="pay-step__test">
          <strong>Test mode.</strong> Use card <span className="mono-text">4242 4242 4242 4242</span>, any future date and any CVC.
        </p>
      )}
      <div ref={mountRef} className={`pay-step__element ${ready ? '' : 'is-loading'}`} />
      {!ready && !error && <p className="muted small">Loading secure payment form…</p>}
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn btn--block btn--big" onClick={pay} disabled={!ready || !complete || busy}>
        {busy ? 'Paying…' : `Pay ${formatMoney(checkout.amount)}`}
      </button>
      <p className="muted small center pay-step__fine">
        <Icon name="shield" size={14} /> Payments are processed by Stripe. Forkfly never sees your card number. If the restaurant can’t take your order, you’re refunded automatically.
      </p>
    </section>
  );
}
