import { useEffect, useState } from 'react';
import { adminApi } from './adminApi.js';
import { PageHead } from './AdminApp.jsx';
import { Avatar, Loading, SaveBar, money, percent } from '../ui/kit.jsx';

export default function Settings({ me }) {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    adminApi.settings().then((s) => {
      setSaved(s);
      setForm(s);
    });
  }, []);

  if (!form)
    return (
      <>
        <PageHead title="Settings" />
        <Loading />
      </>
    );

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const set = (path, value) =>
    setForm((f) => {
      const next = structuredClone(f);
      const keys = path.split('.');
      keys.slice(0, -1).reduce((o, k) => o[k], next)[keys.at(-1)] = value;
      return next;
    });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    const s = await adminApi.saveSettings(form);
    setSaved(s);
    setForm(s);
    setBusy(false);
    setNote('Settings saved.');
  }

  return (
    <form className="settings dash-settings" onSubmit={save}>
      <PageHead title="Settings" subtitle="How Forkfly runs: fees, pay, and who can manage it." />

      <section className="dash-card">
        <h2 className="dash-card__title">Ordering</h2>
        <label className="setting-switch">
          <span>
            <strong>Accept orders on Forkfly</strong>
            <span className="muted small">Turn off to pause every restaurant at once, for an outage or bad weather.</span>
          </span>
          <span className="switch switch--big">
            <input type="checkbox" checked={form.orderingOpen} onChange={(e) => set('orderingOpen', e.target.checked)} />
            <span className="switch__track" aria-hidden="true" />
          </span>
        </label>
        {!form.orderingOpen && <p className="notice notice--warn">Customers will see “Forkfly is paused right now” and can’t check out.</p>}
        <div className="field-row">
          <Money label="Minimum order" value={form.minOrder} onChange={(v) => set('minOrder', v)} />
          <label className="field">
            <span>Delivery radius</span>
            <div className="input-prefix input-suffix">
              <input type="number" min={1} max={25} step={0.5} value={form.maxRadiusMiles} onChange={(e) => set('maxRadiusMiles', Number(e.target.value))} />
              <span>miles</span>
            </div>
          </label>
        </div>
      </section>

      <section className="dash-card">
        <h2 className="dash-card__title">Customer fees</h2>
        <div className="field-row field-row--3">
          <Money label="Delivery, first mile" value={form.fees.deliveryBase} onChange={(v) => set('fees.deliveryBase', v)} />
          <Money label="Each extra mile" value={form.fees.perExtraMile} onChange={(v) => set('fees.perExtraMile', v)} />
          <Money label="Delivery fee cap" value={form.fees.deliveryCap} onChange={(v) => set('fees.deliveryCap', v)} />
          <Percent label="Service fee" value={form.fees.serviceRate} onChange={(v) => set('fees.serviceRate', v)} />
          <Money label="Service fee cap" value={form.fees.serviceCap} onChange={(v) => set('fees.serviceCap', v)} />
          <span />
          <Money label="Small order under" value={form.fees.smallOrderUnder} onChange={(v) => set('fees.smallOrderUnder', v)} />
          <Money label="Small order fee" value={form.fees.smallOrderFee} onChange={(v) => set('fees.smallOrderFee', v)} />
        </div>
        <FeeExample fees={form.fees} />
      </section>

      <section className="dash-card">
        <h2 className="dash-card__title">Restaurants</h2>
        <div className="field-row">
          <Percent label="Default commission for new partners" value={form.commission} onChange={(v) => set('commission', v)} />
          <span />
        </div>
        <p className="muted small">Changes apply to restaurants approved from now on. Set a different rate for one restaurant on its page.</p>
      </section>

      <section className="dash-card">
        <h2 className="dash-card__title">Riders</h2>
        <div className="field-row">
          <Money label="Pay per delivery" value={form.riderPayBase} onChange={(v) => set('riderPayBase', v)} />
          <Money label="Plus per mile" value={form.riderPayPerMile} onChange={(v) => set('riderPayPerMile', v)} />
        </div>
        <p className="muted small">Riders keep 100% of tips. A 2-mile delivery pays {money(form.riderPayBase + 2 * form.riderPayPerMile)} before tips.</p>
        <label className="setting-switch">
          <span>
            <strong>Approve rider applications automatically</strong>
            <span className="muted small">Otherwise each application waits for an admin under Riders → Applications.</span>
          </span>
          <span className="switch">
            <input type="checkbox" checked={form.autoApproveRiders} onChange={(e) => set('autoApproveRiders', e.target.checked)} />
            <span className="switch__track" aria-hidden="true" />
          </span>
        </label>
      </section>

      <section className="dash-card">
        <h2 className="dash-card__title">Email me when</h2>
        <fieldset className="checks checks--column" aria-label="Email notifications">
          {[
            ['newRestaurant', 'A restaurant applies'],
            ['newRider', 'A rider applies'],
            ['refundRequests', 'A customer asks for a refund'],
            ['dailySummary', 'Daily summary, every morning at 8 am'],
          ].map(([key, label]) => (
            <label key={key} className="check">
              <input type="checkbox" checked={form.notifications[key]} onChange={(e) => set(`notifications.${key}`, e.target.checked)} />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="field-row">
          <label className="field">
            <span>Support email shown to customers</span>
            <input type="email" required value={form.supportEmail} onChange={(e) => set('supportEmail', e.target.value)} />
          </label>
          <span />
        </div>
      </section>

      <Admins admins={form.admins} me={me} onChange={(admins) => set('admins', admins)} />

      <SaveBar dirty={dirty} busy={busy} note={note} onDiscard={() => setForm(saved)} />
    </form>
  );
}

function Money({ label, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-prefix">
        <span>$</span>
        <input type="number" min={0} step={0.01} value={(value / 100).toFixed(2)} onChange={(e) => onChange(Math.round(Number(e.target.value) * 100))} />
      </div>
    </label>
  );
}

function Percent({ label, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-prefix input-suffix">
        <input type="number" min={0} max={50} step={0.5} value={+(value * 100).toFixed(2)} onChange={(e) => onChange(Number(e.target.value) / 100)} />
        <span>%</span>
      </div>
    </label>
  );
}

// What a typical order would pay with these fees, so a change is easy to sanity-check.
function FeeExample({ fees }) {
  const examples = [
    ['$8 order, 1 mile', 800, 1],
    ['$25 order, 2 miles', 2500, 2],
    ['$60 order, 4 miles', 6000, 4],
  ].map(([label, subtotal, miles]) => {
    const delivery = Math.min(fees.deliveryCap, fees.deliveryBase + Math.max(0, miles - 1) * fees.perExtraMile);
    const service = Math.min(fees.serviceCap, Math.round(subtotal * fees.serviceRate));
    const small = subtotal < fees.smallOrderUnder ? fees.smallOrderFee : 0;
    return { label, delivery, service, small, total: delivery + service + small };
  });
  return (
    <div className="fee-example">
      <p className="small">
        <strong>What customers pay in fees</strong> <span className="muted">(service fee {percent(fees.serviceRate)})</span>
      </p>
      <ul>
        {examples.map((x) => (
          <li key={x.label}>
            <span className="muted">{x.label}</span>
            <strong>{money(x.total)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Admins({ admins, me, onChange }) {
  const [email, setEmail] = useState('');
  function add(e) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean || admins.some((a) => a.email === clean)) return;
    onChange([...admins, { name: clean.split('@')[0], email: clean, role: 'Invited' }]);
    setEmail('');
  }
  return (
    <section className="dash-card">
      <h2 className="dash-card__title">Admin team</h2>
      <p className="muted small">Admins can see every order and approve, suspend or change any restaurant, rider or customer.</p>
      <ul className="team">
        {admins.map((a) => {
          const isMe = a.email === me.user.email;
          return (
            <li key={a.email}>
              <Avatar name={a.name} />
              <span className="team__text">
                <strong>
                  {a.name} {isMe && <span className="muted small">(you)</span>}
                </strong>
                <span className="muted small">
                  {a.email} · {a.role}
                </span>
              </span>
              {!isMe && a.role !== 'Owner' && (
                <button type="button" className="text-btn small text-btn--danger" onClick={() => onChange(admins.filter((x) => x.email !== a.email))}>
                  Remove
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="team__add team__add--2">
        <label className="field">
          <span>Invite an admin</span>
          <input type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add(e)} />
        </label>
        <button type="button" className="btn btn--outline" onClick={add}>
          Invite
        </button>
      </div>
    </section>
  );
}
