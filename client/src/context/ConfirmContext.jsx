import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/**
 * Promise-based confirmation dialog. Replaces window.confirm() with a themed,
 * accessible modal while preserving the exact same call shape:
 *
 *   const ok = await confirm({ title, body, confirmLabel, danger });
 *   if (!ok) return;
 *
 * No delete/mutation logic changes — only the confirmation UI.
 */
const ConfirmContext = createContext({ confirm: async () => false });

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolver = useRef(null);

  const settle = useCallback((value) => {
    setState(null);
    if (resolver.current) {
      resolver.current(value);
      resolver.current = null;
    }
  }, []);

  const confirm = useCallback((opts = {}) => {
    setState({
      title: opts.title || 'Are you sure?',
      body: opts.body || '',
      confirmLabel: opts.confirmLabel || 'Confirm',
      cancelLabel: opts.cancelLabel || 'Cancel',
      danger: opts.danger ?? false,
    });
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e) => {
      if (e.key === 'Escape') settle(false);
      if (e.key === 'Enter') settle(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, settle]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => settle(false)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={state.title}
            className="relative w-full max-w-sm rounded-2xl border border-line bg-surface shadow-card-hover p-6 animate-fade-up"
          >
            <h2 className="font-serif text-xl text-ink mb-2">{state.title}</h2>
            {state.body && <p className="text-sm text-ink-2 mb-6 leading-relaxed">{state.body}</p>}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => settle(false)}
                className="px-4 py-2 text-sm font-semibold border border-line rounded-lg text-ink-2 hover:text-ink hover:bg-surface-2 transition"
              >
                {state.cancelLabel}
              </button>
              <button
                autoFocus
                onClick={() => settle(true)}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
                  state.danger
                    ? 'bg-status-broken text-white hover:opacity-90'
                    : 'bg-brand text-brand-fg hover:bg-brand-hover'
                }`}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext).confirm;
