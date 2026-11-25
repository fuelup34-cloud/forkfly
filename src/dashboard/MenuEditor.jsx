import { useEffect, useMemo, useRef, useState } from 'react';
import { formatMoney } from '../../shared/core.js';
import { dash, forgetRestaurantCache } from '../api.js';
import { imageUrl } from '../images.js';
import Icon from '../components/Icon.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import PhotoField from './PhotoField.jsx';
import { SearchBox, StatTile, Tabs, count } from '../ui/kit.jsx';

const EMPTY = { name: '', description: '', category: '', price: '', image: null, popular: false, veg: false, spicy: false };

// "14.5" -> 1450. null if it isn't a sensible US price.
function toCents(text) {
  const clean = String(text).replace(/[$,\s]/g, '');
  if (!/^\d{1,4}(\.\d{0,2})?$/.test(clean)) return null;
  return Math.round(parseFloat(clean) * 100);
}

export default function MenuEditor({ restaurant }) {
  const owner = restaurant.role === 'owner';
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [show, setShow] = useState('all');
  const [editing, setEditing] = useState(null); // an item, or EMPTY for a new one

  useEffect(() => {
    dash
      .menu(restaurant.id)
      .then(setItems)
      .catch((err) => setError(err.message));
  }, [restaurant.id]);

  const categories = useMemo(() => [...new Set((items ?? []).map((i) => i.category))], [items]);
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map();
    for (const i of items ?? []) {
      if (q && !`${i.name} ${i.description} ${i.category}`.toLowerCase().includes(q)) continue;
      if ((show === 'available' && !i.available) || (show === 'sold-out' && i.available)) continue;
      if (!map.has(i.category)) map.set(i.category, []);
      map.get(i.category).push(i);
    }
    return [...map];
  }, [items, query, show]);

  const replace = (item) => {
    forgetRestaurantCache();
    setItems((list) => {
      const exists = list.some((i) => i.id === item.id);
      return exists ? list.map((i) => (i.id === item.id ? item : i)) : [...list, item];
    });
  };

  async function toggle(item) {
    // Show the change at once; put it back if the server says no.
    replace({ ...item, available: !item.available });
    try {
      replace(await dash.updateItem(restaurant.id, item.id, { available: !item.available }));
    } catch (err) {
      replace(item);
      setError(err.message);
    }
  }

  const soldOut = (items ?? []).filter((i) => !i.available).length;

  return (
    <div className="menu-editor">
      {items && items.length > 0 && (
        <dl className="stat-row dash-stats">
          <StatTile label="Dishes" value={count(items.length)} hint={`in ${categories.length} ${categories.length === 1 ? 'category' : 'categories'}`} />
          <StatTile label="Available now" value={count(items.length - soldOut)} />
          <StatTile label="Sold out" value={count(soldOut)} hint={soldOut ? 'switch back on when restocked' : 'everything’s on'} />
          <StatTile label="With a photo" value={count(items.filter((i) => i.image).length)} hint="photos sell more" />
        </dl>
      )}
      <div className="toolbar-row dash-toolbar">
        <Tabs
          value={show}
          onChange={setShow}
          tabs={[
            ['all', 'All', items?.length ?? null],
            ['available', 'Available', items ? items.length - soldOut : null],
            ['sold-out', 'Sold out', items ? soldOut : null],
          ]}
        />
        <SearchBox value={query} onChange={setQuery} placeholder="Search your menu" />
        {owner && (
          <button type="button" className="btn" onClick={() => setEditing(EMPTY)}>
            Add item
          </button>
        )}
      </div>
      {!owner && <p className="notice">You can mark items sold out. Only the owner can edit the menu.</p>}
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}

      {items && items.length === 0 && (
        <div className="dash-empty">
          <Icon name="plate" size={40} className="empty__icon" />
          <h2>Add your first dish</h2>
          <p className="muted">Customers can find you once your menu has at least one item. Clear photos sell more.</p>
          {owner && (
            <button type="button" className="btn" onClick={() => setEditing(EMPTY)}>
              Add item
            </button>
          )}
        </div>
      )}

      {grouped.map(([cat, list]) => (
        <section key={cat} className="dash-card menu-group">
          <h2 className="dash-card__title">
            {cat} <span className="muted small">{list.length}</span>
          </h2>
          <ul className="menu-rows">
            {list.map((item) => (
              <li key={item.id} className={`menu-row ${item.available ? '' : 'is-off'}`}>
                <span className="menu-row__thumb">{item.image ? <img src={imageUrl(item.image, 96)} alt="" loading="lazy" /> : <Icon name="plate" size={20} />}</span>
                <div className="menu-row__text">
                  <strong>
                    {item.name}
                    {!item.available && <span className="badge badge--bad">Sold out</span>}
                  </strong>
                  {item.description && <span className="muted small menu-row__desc">{item.description}</span>}
                </div>
                <span className="menu-row__price">{formatMoney(item.price)}</span>
                <label className="switch" title={item.available ? 'Available' : 'Sold out'}>
                  <input type="checkbox" checked={item.available} onChange={() => toggle(item)} />
                  <span className="switch__track" aria-hidden="true" />
                  <span className="visually-hidden">{item.name} available</span>
                </label>
                {owner && (
                  <button type="button" className="text-btn" onClick={() => setEditing(item)}>
                    Edit
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {items && items.length > 0 && grouped.length === 0 && (
        <div className="dash-empty">
          <Icon name={show === 'sold-out' ? 'plate' : 'search'} size={32} className="muted" />
          <strong>{show === 'sold-out' && !query ? 'Nothing is sold out' : 'No dishes match'}</strong>
        </div>
      )}

      {editing && (
        <ItemSheet
          key={editing.id ?? 'new'}
          restaurantId={restaurant.id}
          item={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={(item) => {
            replace(item);
            setEditing(null);
          }}
          onDeleted={(id) => {
            forgetRestaurantCache();
            setItems((list) => list.filter((i) => i.id !== id));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ItemSheet({ restaurantId, item, categories, onClose, onSaved, onDeleted }) {
  const isNew = !item.id;
  const ref = useRef(null);
  const [form, setForm] = useState(() => ({ ...EMPTY, ...item, price: item.price != null && item.price !== '' ? (item.price / 100).toFixed(2) : '' }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialog, ask] = useConfirm();
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  useEffect(() => {
    const d = ref.current;
    d.showModal();
    return () => d.open && d.close();
  }, []);

  async function save(e) {
    e.preventDefault();
    const price = toCents(form.price);
    if (price == null) return setError('Enter a price like 12.50.');
    setBusy(true);
    setError('');
    const body = {
      name: form.name,
      description: form.description,
      category: form.category,
      price,
      image: form.image,
      popular: form.popular,
      veg: form.veg,
      spicy: form.spicy,
    };
    try {
      onSaved(isNew ? await dash.addItem(restaurantId, body) : await dash.updateItem(restaurantId, item.id, body));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await ask({ title: `Delete ${item.name}?`, body: 'It disappears from your menu. Past orders keep it.', confirm: 'Delete', danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      await dash.deleteItem(restaurantId, item.id);
      onDeleted(item.id);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="item-sheet-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      {dialog}
      <form className="sheet__body" onSubmit={save}>
        <div className="sheet__head">
          <h2 id="item-sheet-title" className="sheet__title">
            {isNew ? 'New item' : 'Edit item'}
          </h2>
          <button type="button" className="sheet__close" onClick={onClose} aria-label="Close" disabled={busy}>
            ×
          </button>
        </div>
        <PhotoField label="Photo" value={form.image} onChange={(image) => setForm((f) => ({ ...f, image }))} maxSide={1200} hint="Square or landscape. Show the real dish." />
        <label className="field">
          <span>Name</span>
          <input required maxLength={80} value={form.name} onChange={set('name')} autoFocus={isNew} />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea rows={3} maxLength={300} value={form.description} onChange={set('description')} placeholder="What’s in it, and what makes it good" />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Price</span>
            <span className="input-prefix">
              <span aria-hidden="true">$</span>
              <input required inputMode="decimal" value={form.price} onChange={set('price')} placeholder="0.00" />
            </span>
          </label>
          <label className="field">
            <span>Category</span>
            <input required maxLength={40} list="menu-categories" value={form.category} onChange={set('category')} placeholder="e.g. Mains" />
            <datalist id="menu-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        </div>
        <fieldset className="checks">
          <legend>Labels</legend>
          {[
            ['popular', 'Popular'],
            ['veg', 'Vegetarian'],
            ['spicy', 'Spicy'],
          ].map(([key, label]) => (
            <label key={key} className="check">
              <input type="checkbox" checked={form[key]} onChange={set(key)} />
              {label}
            </label>
          ))}
        </fieldset>
        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
        <div className="sheet__actions">
          {!isNew && (
            <button type="button" className="btn btn--ghost sheet__danger" onClick={remove} disabled={busy}>
              Delete
            </button>
          )}
          <button type="button" className="btn btn--outline" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Add to menu' : 'Save'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
