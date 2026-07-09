import { Icon } from './iconMap';

export function HeroBand({ eyebrow, title, body, meta }: { eyebrow: string; title: string; body?: string; meta?: string }) {
  return (
    <section
      className="relative overflow-hidden rounded-card border border-line-strong bg-gradient-brand p-7 text-white shadow-card print:bg-none print:text-fg"
      style={{ animation: 'wp-fade-up 0.5s ease both' }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: 'var(--wp-glow)' }} />
      <div className="relative max-w-[760px]">
        <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80 print:text-muted">
          <Icon name="sparkle" size={13} /> {eyebrow}
        </span>
        <h1 className="mt-3 font-display text-[33px] font-semibold leading-[1.15] tracking-tight">{title}</h1>
        {body && <p className="mt-2.5 max-w-[62ch] text-[15px] text-white/90 print:text-ink-700">{body}</p>}
        {meta && <div className="mt-3.5 text-[11.5px] tabular-nums tracking-[0.02em] text-white/80">{meta}</div>}
      </div>
    </section>
  );
}
