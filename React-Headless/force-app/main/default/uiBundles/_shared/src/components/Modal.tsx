import { useEffect, type ReactNode } from 'react';
import clsx from 'clsx';

/**
 * Lightweight shared modal primitive — a fixed backdrop + centered panel.
 * Escape and backdrop-click close it; body scroll is locked while open. Built
 * on plain React + token utilities (NOT the bundle-local shadcn dialog, which
 * cannot be imported from _shared). Persona-agnostic; the icon chip tone picks
 * teal ("you act") or violet ("AI acts").
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  tone = 'ai',
  footer,
  wide = false,
  size,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  tone?: 'ai' | 'accent';
  footer?: ReactNode;
  /** Legacy 720px width flag; prefer `size`. `size` wins when both are set. */
  wide?: boolean;
  /** Panel width. 'sm'=600, 'md'=720, 'xl'=980 (data explorers). */
  size?: 'sm' | 'md' | 'xl';
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4 backdrop-blur-sm"
      style={{ background: 'rgba(15,20,40,0.5)' }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          // Single flex-column panel capped to the viewport: header/footer stay
          // pinned (flex-none) and only the body scrolls. This avoids the
          // two-competing-scroll-containers trap where a tall content list made
          // the panel exceed the viewport, pushed the header off-screen, and
          // left the wheel driving only an inner region with no way back up.
          'flex max-h-[90vh] w-full flex-col overflow-hidden rounded-card border border-line-strong bg-surface shadow-pop',
          (size ?? (wide ? 'md' : 'sm')) === 'xl' ? 'max-w-[980px]' : (size ?? (wide ? 'md' : 'sm')) === 'md' ? 'max-w-[720px]' : 'max-w-[600px]',
        )}
        style={{ animation: 'wp-fade-up 0.26s cubic-bezier(0.2,0.8,0.2,1) both' }}
      >
        <header className="flex flex-none items-start gap-3.5 border-b border-line px-6 py-5">
          {icon && (
            <span
              className={clsx(
                'grid h-10 w-10 flex-none place-items-center rounded-[12px] text-[17px]',
                tone === 'accent' ? 'bg-accent-bg text-accent' : 'bg-ai-bg text-ai',
              )}
            >
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="font-display text-[20px] font-medium leading-tight">{title}</h3>
            {subtitle && <div className="mt-0.5 text-[12.5px] text-muted">{subtitle}</div>}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="ml-auto grid h-8 w-8 flex-none place-items-center rounded-[9px] text-[16px] text-muted transition hover:bg-surface-muted hover:text-fg"
          >
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <footer className="flex flex-none items-center gap-2.5 border-t border-line bg-surface-muted px-6 py-4">{footer}</footer>
        )}
      </div>
    </div>
  );
}

/** The "writes to Salesforce" note rendered at the left of a write-modal footer. */
export function CrmNote({ children }: { children: ReactNode }) {
  return (
    <span className="flex flex-1 items-center gap-1.5 font-mono text-[10px] tracking-[0.04em] text-faint">
      <span className="text-accent">⛁</span>
      {children}
    </span>
  );
}
