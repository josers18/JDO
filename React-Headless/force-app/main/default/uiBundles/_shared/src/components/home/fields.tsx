import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import type { LookupHit } from '../../data/lookupSearch';

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

/**
 * Type-ahead reference lookup (native "Assigned To" / "Related To" pattern).
 * Debounces the caller's async `search`, lists hits inline (not in a portal, so
 * it never clips against the modal's scroll box), and reports the chosen
 * {id,name} up. A cleared box reports {id:'', name:''} so the caller can tell
 * "unchanged" (never touched) from "explicitly cleared".
 */
export function LookupField({
  value,
  onChange,
  search,
  placeholder,
  disabled,
}: {
  value: LookupHit;
  onChange: (hit: LookupHit) => void;
  search: (term: string) => Promise<LookupHit[]>;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [term, setTerm] = useState(value.name);
  const [hits, setHits] = useState<LookupHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Keep the visible text in sync when the caller reseeds (row switch / clear).
  useEffect(() => { setTerm(value.name); }, [value.id, value.name]);

  // Debounced search on the typed term.
  useEffect(() => {
    if (!open) return;
    const q = term.trim();
    if (q.length < 2) { setHits([]); return; }
    let cancelled = false;
    setLoading(true);
    const h = setTimeout(async () => {
      const results = await search(q);
      if (!cancelled) { setHits(results); setLoading(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(h); };
  }, [term, open, search]);

  // Close the result list on an outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = (hit: LookupHit) => {
    onChange(hit);
    setTerm(hit.name);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2">
        <input
          className={clsx(CONTROL, 'flex-1')}
          value={term}
          placeholder={placeholder}
          disabled={disabled}
          onChange={e => {
            setTerm(e.target.value);
            setOpen(true);
            if (e.target.value.trim() === '') onChange({ id: '', name: '' });
          }}
          onFocus={() => setOpen(true)}
        />
        {value.id && !disabled && (
          <button
            type="button"
            aria-label="Clear"
            className="grid h-7 w-7 flex-none place-items-center rounded-[8px] text-[13px] text-muted transition hover:bg-surface-muted hover:text-fg"
            onClick={() => { onChange({ id: '', name: '' }); setTerm(''); setHits([]); }}
          >
            ✕
          </button>
        )}
      </div>
      {open && term.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 max-h-[180px] w-full overflow-y-auto rounded-[11px] border border-line-strong bg-surface shadow-pop">
          {loading && <div className="px-3.5 py-2 font-mono text-[11px] text-faint">Searching…</div>}
          {!loading && hits.length === 0 && (
            <div className="px-3.5 py-2 font-mono text-[11px] text-faint">No matches</div>
          )}
          {hits.map(h => (
            <button
              key={h.id}
              type="button"
              className="block w-full truncate px-3.5 py-2 text-left text-[13px] text-fg transition hover:bg-surface-muted"
              onClick={() => pick(h)}
            >
              {h.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
