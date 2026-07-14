import type { ReactNode } from 'react';
import clsx from 'clsx';

/** Shared form-field chrome for the write modals (mono label + token input). */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{label}</span>
      {children}
    </label>
  );
}

export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3.5">{children}</div>;
}

const CONTROL =
  'w-full rounded-[11px] border border-line bg-bg px-3.5 py-2.5 text-[13.5px] text-fg outline-none focus:border-accent-border';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(CONTROL, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx(CONTROL, 'min-h-[120px] resize-y leading-relaxed', props.className)} />;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx(CONTROL, props.className)} />;
}

/** Read-only label/value row for the modal's System Information section.
 *  Mirrors Field's mono label; renders nothing when the value is empty. */
export function DisplayRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div className="mb-3">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-faint">{label}</span>
      <span className="text-[13px] text-fg">{value}</span>
    </div>
  );
}

/** Inline "generating…" line with a violet spinner (AI work in progress). */
export function GenLine({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5 font-mono text-[12px] text-ai">
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 rounded-full border-2 border-ai-border border-t-ai"
        style={{ animation: 'wp-spin 0.7s linear infinite' }}
      />
      {children}
    </div>
  );
}

/** A small labeled fact tile used in prep sheets and the 360 quick view. */
export function FactTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[11px] border border-line bg-bg px-3.5 py-3">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-faint">{label}</span>
      <b className="text-[15px] font-semibold">{value}</b>
    </div>
  );
}

/** A prep-sheet block: violet-marked mono heading + body. */
export function PrepBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <h5 className="mb-2.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        <span className="text-ai">✦</span>
        {title}
      </h5>
      {children}
    </div>
  );
}
