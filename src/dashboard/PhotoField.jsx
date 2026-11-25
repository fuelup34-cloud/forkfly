import { useRef, useState } from 'react';
import { imageUrl, uploadPhoto } from '../images.js';
import Icon from '../components/Icon.jsx';

// Pick, preview, replace or remove a photo. Uploads straight away and hands back its URL.
export default function PhotoField({ value, onChange, label, hint, wide = false, maxSide = 1600, disabled = false }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      onChange(await uploadPhoto(file, maxSide));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`photo-field ${wide ? 'photo-field--wide' : ''}`}>
      <span className="photo-field__label">{label}</span>
      <div className="photo-field__row">
        <button type="button" className="photo-field__preview" onClick={() => input.current.click()} disabled={disabled || busy} aria-label={value ? `Replace ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}>
          {value ? <img src={imageUrl(value, wide ? 640 : 240)} alt="" /> : <Icon name="plate" size={28} />}
          {busy && <span className="photo-field__busy">Uploading…</span>}
        </button>
        <div className="photo-field__side">
          {!disabled && (
            <div className="photo-field__buttons">
              <button type="button" className="btn btn--outline btn--sm" onClick={() => input.current.click()} disabled={busy}>
                {value ? 'Replace' : 'Upload photo'}
              </button>
              {value && (
                <button type="button" className="text-btn" onClick={() => onChange(null)} disabled={busy}>
                  Remove
                </button>
              )}
            </div>
          )}
          {hint && <p className="muted small">{hint}</p>}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden onChange={pick} />
    </div>
  );
}
