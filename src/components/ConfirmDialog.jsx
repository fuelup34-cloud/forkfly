import { useCallback, useEffect, useRef, useState } from 'react';

// A styled replacement for window.confirm.
//   const [dialog, ask] = useConfirm();
//   if (await ask({ title, body, confirm: 'Remove', danger: true })) …
//   …and render {dialog} somewhere in the component.
export function useConfirm() {
  const [request, setRequest] = useState(null);
  const ask = useCallback((opts) => new Promise((resolve) => setRequest({ ...opts, resolve })), []);
  const close = (answer) => {
    request?.resolve(answer);
    setRequest(null);
  };
  const dialog = request ? <ConfirmDialog {...request} onClose={close} /> : null;
  return [dialog, ask];
}

function ConfirmDialog({ title, body, confirm = 'Confirm', cancel = 'Cancel', danger = false, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    d.showModal();
    return () => d.open && d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet sheet--small"
      onCancel={(e) => {
        e.preventDefault();
        onClose(false);
      }}
      onClick={(e) => e.target === ref.current && onClose(false)}
    >
      <div className="sheet__body">
        <h2 className="sheet__title">{title}</h2>
        {body && <p className="muted">{body}</p>}
        <div className="sheet__actions">
          <button type="button" className="btn btn--outline" onClick={() => onClose(false)}>
            {cancel}
          </button>
          <button type="button" className={`btn ${danger ? 'btn--danger' : ''}`} onClick={() => onClose(true)} autoFocus>
            {confirm}
          </button>
        </div>
      </div>
    </dialog>
  );
}
