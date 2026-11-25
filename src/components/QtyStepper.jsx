import Icon from './Icon.jsx';

// − 2 +  control. At zero it collapses to a single "Add" button.
export default function QtyStepper({ qty, onChange, label, compact = false }) {
  if (qty === 0 && !compact) {
    return (
      <button type="button" className="add-btn" onClick={() => onChange(1)} aria-label={`Add ${label}`}>
        +
      </button>
    );
  }
  return (
    <span className="stepper" role="group" aria-label={`${label} quantity`}>
      <button type="button" onClick={() => onChange(qty - 1)} aria-label={qty === 1 ? `Remove ${label}` : `One less ${label}`}>
        {qty === 1 ? <Icon name="trash" size={16} strokeWidth={2} /> : '−'}
      </button>
      <span aria-live="polite">{qty}</span>
      <button type="button" onClick={() => onChange(qty + 1)} disabled={qty >= 20} aria-label={`One more ${label}`}>
        +
      </button>
    </span>
  );
}
