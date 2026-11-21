import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Modal } from '@shared';

export const cash = (value: number | string | null | undefined) => value == null || value === '' || !Number.isFinite(Number(value)) ? '—'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(Number(value));
export const day = (value?: string | null) => value && !Number.isNaN(Date.parse(value))
  ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
  : 'Date unavailable';
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();

export function useLive<T>(read: () => Promise<T>, key: string) {
  const [state, setState] = useState<{ key: string; value?: T; error?: string }>({ key });
  useEffect(() => {
    let active = true;
    void read().then(
      value => { if (active) setState({ key, value }); },
      () => { if (active) setState({ key, error: 'The Salesforce source is unavailable.' }); },
    );
    return () => { active = false; };
    // The key records the scope and query inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const current = state.key === key ? state : { key };
  return { ...current, pending: current.value === undefined && current.error === undefined };
}

export function Pending({ state, children }: { state: { pending: boolean; error?: string }; children: ReactNode }) {
  return state.pending ? <p role="status">Loading live data…</p> : state.error ? <p role="alert">{state.error}</p> : children;
}
export const CommercialOwner = createContext('');
export function Heading({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  const owner = useContext(CommercialOwner);
  return <header className="page-heading"><div><p className="scope-line">{owner && `${owner} · `}Commercial banking</p><h1>{title}</h1><p>{children}</p></div>{action && <div className="heading-actions">{action}</div>}</header>;
}
export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="ca-panel"><header><h2>{title}</h2>{action}</header>{children}</section>;
}
export function Badge({ children }: { children: ReactNode }) {
  return <span className="ca-badge">{children}</span>;
}
export function Button({ onClick, children, style = 'secondary' }: { onClick: () => void; children: ReactNode; style?: string }) {
  return <button type="button" className={style} onClick={onClick}>{children}</button>;
}
export function RouteLink({ to, children, style = 'text-button' }: { to: string; children: ReactNode; style?: string }) {
  return <Link to={to} className={style}>{children}</Link>;
}
export function Tabs<T extends string>({ choices, value, onChange }: { choices: readonly (readonly [T, string])[]; value: T; onChange: (value: T) => void }) {
  return <div className="ca-switch" role="group">{choices.map(([id, title]) =>
    <button type="button" key={id} aria-pressed={id === value} onClick={() => onChange(id)}>{title}</button>)}</div>;
}
export function Inspect({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <Modal open onClose={onClose} title={title}><div className="ca-root ca-inspector">{children}</div></Modal>;
}
