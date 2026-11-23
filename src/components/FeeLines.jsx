import { FEES, formatMoney } from '../../shared/core.js';

// Every fee, spelled out, with why it's there.
export default function FeeLines({ pricing, km }) {
  const rows = [
    ['Items', pricing.subtotal, 'Same prices as in the restaurant.'],
    ['Delivery', pricing.delivery, km != null ? `${km} km. ${formatMoney(FEES.deliveryBase)} covers the first ${FEES.includedKm} km.` : null],
    ['Service fee', pricing.service, `${FEES.serviceRate * 100}% of items, never more than ${formatMoney(FEES.serviceCap)}.`],
  ];
  if (pricing.smallOrder) rows.push(['Small order fee', pricing.smallOrder, `Only on orders under ${formatMoney(FEES.smallOrderUnder)}.`]);
  if (pricing.tip) rows.push(['Courier tip', pricing.tip, 'All of it goes to your courier.']);

  return (
    <dl className="fees">
      {rows.map(([label, value, hint]) => (
        <div key={label} className="fees__row">
          <dt>
            {label}
            {hint && <small>{hint}</small>}
          </dt>
          <dd>{formatMoney(value)}</dd>
        </div>
      ))}
      <div className="fees__row fees__total">
        <dt>Total</dt>
        <dd>{formatMoney(pricing.total)}</dd>
      </div>
    </dl>
  );
}
