import { VEHICLES } from '../../shared/core.js';
import Icon from './Icon.jsx';

// The three kinds of account. Restaurants and riders are reviewed before they go live.
export const ACCOUNT_TYPES = [
  { id: 'customer', icon: 'bag', title: 'Order food', body: 'Browse restaurants and get delivery.' },
  { id: 'restaurant', icon: 'store', title: 'Run a restaurant', body: 'Sell on Forkfly and manage your orders.' },
  { id: 'rider', icon: 'bike', title: 'Deliver', body: 'Ride for Forkfly and partner restaurants.' },
];

export const EMPTY_JOIN = { restaurantName: '', cuisine: '', vehicle: 'Bicycle', phone: '' };

export function AccountTypePicker({ value, onChange, types = ACCOUNT_TYPES }) {
  return (
    <fieldset className="type-pick">
      <legend>How will you use Forkfly?</legend>
      <div className="type-pick__grid">
        {types.map((t) => (
          <label key={t.id} className={`type-pick__option ${value === t.id ? 'is-active' : ''}`}>
            <input type="radio" name="account-type" value={t.id} checked={value === t.id} onChange={() => onChange(t.id)} />
            <Icon name={t.icon} size={22} />
            <strong>{t.title}</strong>
            <span className="muted small">{t.body}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// The extra details a restaurant partner or rider gives when joining.
export function JoinFields({ type, values, onChange }) {
  const set = (key) => (e) => onChange({ ...values, [key]: e.target.value });
  if (type === 'restaurant')
    return (
      <>
        <label className="field">
          <span>Restaurant name</span>
          <input required minLength={2} maxLength={60} autoComplete="organization" value={values.restaurantName} onChange={set('restaurantName')} />
        </label>
        <label className="field">
          <span>Cuisine</span>
          <input required minLength={2} maxLength={30} placeholder="e.g. Thai, Burgers, Bakery" value={values.cuisine} onChange={set('cuisine')} />
        </label>
        <label className="field">
          <span>Restaurant phone</span>
          <input required type="tel" autoComplete="tel" inputMode="tel" maxLength={20} pattern="\+?[0-9 ()\-]{7,20}" value={values.phone} onChange={set('phone')} />
        </label>
      </>
    );
  if (type === 'rider')
    return (
      <>
        <label className="field">
          <span>How you’ll deliver</span>
          <select value={values.vehicle} onChange={set('vehicle')}>
            {VEHICLES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Phone number</span>
          <input required type="tel" autoComplete="tel" inputMode="tel" maxLength={20} pattern="\+?[0-9 ()\-]{7,20}" value={values.phone} onChange={set('phone')} />
        </label>
      </>
    );
  return null;
}

export function submitApplication(api, type, values) {
  if (type === 'restaurant') return api.applyRestaurant({ name: values.restaurantName.trim(), cuisine: values.cuisine.trim(), phone: values.phone.trim() });
  if (type === 'rider') return api.applyRider({ vehicle: values.vehicle, phone: values.phone.trim() });
  return Promise.resolve();
}
