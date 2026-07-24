import { createContext, useCallback, useContext, useRef, useState } from 'react';

/**
 * Lightweight toast system. Replaces window.alert() with non-blocking,
 * themed notifications. Presentation only — callers pass a message + variant.
 */
const ToastContext = createContext({ toast: { show: () => {}, success: () => {}, error: () => {} } });

let counter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const push = useCallback(
    (message, variant, opts = {}) => {
      const id = ++counter;
      setToasts((list) => [...list, { id, message, variant }]);
      timers.current[id] = setTimeout(() => dismiss(id), opts.duration ?? 3800);
      return id;
    },
    [dismiss]
  );

  const toast = {
    show: (m, o) => push(m, 'default', o),
    success: (m, o) => push(m, 'success', o),
    error: (m, o) => push(m, 'error', o),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed z-[100] bottom-4 right-4 flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface shadow-card-hover px-4 py-3 animate-fade-up"
          >
            <span
              aria-hidden="true"
              className={
                t.variant === 'success'
                  ? 'text-status-ok'
                  : t.variant === 'error'
                  ? 'text-status-broken'
                  : 'text-ink-2'
              }
            >
              {t.variant === 'success' ? '✓' : t.variant === 'error' ? '⚠' : '•'}
            </span>
            <p className="text-sm text-ink flex-1 leading-snug">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="text-ink-3 hover:text-ink text-sm leading-none"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext).toast;
