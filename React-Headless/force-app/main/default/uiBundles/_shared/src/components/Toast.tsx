import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  title: string;
  sub?: string;
}

interface ToastApi {
  /** Push a toast. Auto-dismisses after ~3.2s. */
  toast: (title: string, sub?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Cross-bundle toast system. Wrap a surface in `<ToastProvider>` and call
 * `useToast().toast(title, sub?)` from anywhere below it. Renders a fixed
 * bottom-center stack.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((title: string, sub?: string) => {
    const id = ++idRef.current;
    setItems(list => [...list, { id, title, sub }]);
    setTimeout(() => {
      setItems(list => list.filter(t => t.id !== id));
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[200] flex -translate-x-1/2 flex-col items-center gap-2.5">
        {items.map(t => (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-[420px] items-center gap-3 rounded-[13px] border border-accent-border bg-surface-glass px-[18px] py-3 shadow-pop backdrop-blur"
            style={{ animation: 'wp-fade-up 0.3s cubic-bezier(0.2,0.8,0.2,1) both' }}
          >
            <span className="grid h-6 w-6 flex-none place-items-center rounded-[7px] bg-accent-bg text-[13px] text-accent">✓</span>
            <div className="min-w-0">
              <b className="text-[13.5px] font-semibold text-fg">{t.title}</b>
              {t.sub && <div className="font-mono text-[10.5px] text-muted">{t.sub}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
