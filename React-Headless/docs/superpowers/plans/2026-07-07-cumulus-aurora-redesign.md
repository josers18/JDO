# Cumulus Aurora Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat "white boxes" home + Customer 360 UI across all three persona bundles with the dual-mode "Cumulus Aurora" design language, delivered as rebuilt `_shared` Tailwind primitives.

**Architecture:** Extend the Tailwind v4 `@theme` in each bundle's `global.css` with a Cumulus Aurora token scale, bridge the runtime `--wp-*` persona/mode vars (set by `ThemeProvider`) into those tokens, then rebuild the `_shared` primitives (`StatTile`, `Panel`, `EntityRow`, `Meter`, `ScoreRing`, `Eyebrow`, `Pill`, `HeroBand`, `iconMap`) using Tailwind utility classes. Pages recompose against the new primitives. `_shared` is Vite-inlined into every bundle via the `@shared` alias, so one primitive change propagates to Retail/Wealth/Commercial.

**Tech Stack:** React 19, TypeScript, Vite 7, Tailwind CSS v4 (`@tailwindcss/vite`, `@theme` directive), lucide-react, clsx + tailwind-merge, Vitest + Testing Library (jsdom), Fraunces + Hanken Grotesk (Google Fonts / @fontsource).

## Global Constraints

- **API version 67.0**; SFDX bundles; no changes to Apex/GraphQL/data layer — visual layer only.
- **`_shared` is source-only** (no package.json / meta XML); it has **no own test harness** and lives outside each bundle's Vitest `src/` root. All unit tests for `_shared` primitives live under `ReactRetail/src/**` (which resolves `@shared`) and run via ReactRetail's Vitest.
- **Tailwind v4**: no `tailwind.config.js`; tokens are declared in `global.css` `@theme` blocks; utilities are auto-generated. Each bundle has its own `src/styles/global.css` — token changes must be applied to **all four** bundles (`ReactRetail`, `ReactWealth`, `ReactCommercial`, `ReactHeadless`) identically.
- **Depth is mode-independent**: every card = hairline border + `shadow-card` + optional 3px accent bar + hover-lift. Never rely on translucency alone.
- **Gradient carries action only** (hero, primary CTA, active nav). **Status is semantic** (green/amber/red). **Pink `#ec4899` = AI entry point only.**
- **Fonts:** Fraunces (`--font-display`, hero title + big numbers) + Hanken Grotesk (`--font-sans`, all UI/body/eyebrows). No monospace. `tabular-nums` on every metric.
- **Fixed overlays portal to `document.body`**; `print:` neutralize gradient surfaces.
- **Persona accents:** retail teal `#14b8a6` / commercial copper `#d97706` / wealth gold `#c99a2e`, driving gradient + active states + accent washes.
- **Deploy trap:** UIBundle deploys `dist/`, not `src/`. `dist/` must be rebuilt + committed before any deploy or the redesign ships invisibly. (No deploy is part of this plan — build + test only.)
- **Commands** run from a bundle dir: `npm run build` (`tsc -b && vite build`), `npm run test -- run` (single Vitest pass), `npm run lint`.
- Reference: spec `docs/superpowers/specs/2026-07-07-cumulus-aurora-design-language-redesign.md`; validated mockup `output/journey-designs/cumulus-aurora-mockup.html`.

**Path prefix (all paths below are relative to this):**
`force-app/main/default/uiBundles/`

---

## File Structure

**New `_shared` primitives** (`_shared/src/components/`):
- `Eyebrow.tsx` — uppercase wide-tracked micro-label.
- `Pill.tsx` — status/track/segment tonal pill.
- `ScoreRing.tsx` — SVG progress ring with centered number + caption (fixes the mockup's ring; `inline-grid`).
- `StatTile.tsx` — accent-top-bar KPI card (replaces `KpiTile` usage).
- `Panel.tsx` — hairline card w/ header + count badge + action slot (replaces `GlassCard` usage).
- `EntityRow.tsx` — icon-chip/avatar row with reason + action pill + right slot.
- `Meter.tsx` — semantic-fill progress meter (replaces `ProgressBar` usage).
- `HeroBand.tsx` — AI daily-brief gradient hero.
- `iconMap.tsx` — semantic-key → lucide component map + `<Icon/>` helper.

**Modified:**
- `{ReactRetail,ReactWealth,ReactCommercial,ReactHeadless}/src/styles/global.css` — Cumulus Aurora `@theme` + font load + `--wp-*` bridge + keyframes.
- `_shared/src/theme/tokens.css` — add light/dark structural values the bridge references.
- `_shared/src/theme/ThemeProvider.tsx` — inject persona accent tokens in **both** modes (not dark-only).
- `_shared/src/components/index.ts` — export new primitives.
- `_shared/src/components/{KpiTile,GlassCard,ProgressBar}.tsx` — re-implement as thin wrappers over the new primitives (keep exports for back-compat) OR restyle in place.
- `{ReactRetail,ReactWealth,ReactCommercial}/src/shell/AppShell.tsx` — lucide nav, tokens.
- `{...}/src/home/HomePage.tsx` — recompose against new primitives.
- `{...}/src/personas/customer/*.tsx` — Customer 360 recompose (Retail first).

**Tests** (all under `ReactRetail/src/`, mirroring `@shared` imports):
- `src/shared-primitives/__tests__/*.test.tsx`

---

## Task 1: Tokens + fonts foundation (all four bundles)

**Files:**
- Modify: `ReactRetail/src/styles/global.css`
- Modify: `ReactWealth/src/styles/global.css`
- Modify: `ReactCommercial/src/styles/global.css`
- Modify: `ReactHeadless/src/styles/global.css`
- Modify: `_shared/src/theme/tokens.css`
- Modify: `_shared/src/theme/ThemeProvider.tsx`

**Interfaces:**
- Produces: CSS custom properties + Tailwind utilities available app-wide — `--font-display`, `--font-sans`; color utilities `bg-surface`, `bg-surface-muted`, `border-line`, `border-line-strong`, `text-fg`, `text-muted`, `text-faint`, `bg-accent-bg`, `text-accent`, `border-accent-border`; semantic `text-ok/warn/risk`, `bg-ok-bg/warn-bg/risk-bg`; `shadow-card`, `shadow-pop`; radii `rounded-card` (20px), `rounded-sub` (14px); helper classes `.bg-gradient-brand`, `.text-gradient-accent`, `.bg-surface-glass`; keyframe `wp-fade-up`. All resolve through `--wp-*` runtime vars so `ThemeProvider persona/mode` swaps them live.
- Consumes: nothing (first task).

- [ ] **Step 1: Add the Cumulus Aurora `@theme` + fonts to `ReactRetail/src/styles/global.css`**

Insert immediately after the existing `@import 'tailwindcss';` line (keep all existing shadcn `@theme inline` / `:root` / `.dark` blocks below, untouched):

```css
/* ── Cumulus Aurora fonts ─────────────────────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap');

/* ── Cumulus Aurora token scale (Tailwind v4 auto-generates utilities) ──
   These map to the runtime --wp-* vars injected by ThemeProvider, so
   persona + light/dark swaps propagate without per-component branching. */
@theme {
  --font-sans: 'Hanken Grotesk', ui-sans-serif, system-ui, sans-serif;
  --font-display: 'Fraunces', Georgia, 'Times New Roman', serif;

  --color-bg: var(--wp-surface);
  --color-surface: var(--wp-surface-raised);
  --color-surface-muted: var(--wp-surface-muted);
  --color-fg: var(--wp-text);
  --color-muted: var(--wp-text-muted);
  --color-faint: var(--wp-text-faint);
  --color-line: var(--wp-border);
  --color-line-strong: var(--wp-border-strong);

  --color-accent: var(--wp-accent);
  --color-accent-2: var(--wp-accent-2);
  --color-accent-bg: var(--wp-accent-bg);
  --color-accent-border: var(--wp-accent-border);

  --color-ok: var(--wp-pos);
  --color-ok-bg: var(--wp-pos-bg);
  --color-warn: var(--wp-warn);
  --color-warn-bg: var(--wp-warn-bg);
  --color-risk: var(--wp-neg);
  --color-risk-bg: var(--wp-neg-bg);

  --color-pink: #ec4899;
  --color-pink-soft: #fde7f3;

  --color-track: var(--wp-track);

  --radius-card: 20px;
  --radius-sub: 14px;

  --shadow-card: var(--wp-shadow-sm);
  --shadow-pop: var(--wp-shadow);
}

.bg-gradient-brand { background: var(--wp-gradient); }
.text-gradient-accent {
  background: var(--wp-gradient);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}
.bg-surface-glass {
  background: var(--wp-surface-glass);
  backdrop-filter: saturate(160%) blur(18px);
  -webkit-backdrop-filter: saturate(160%) blur(18px);
}

@keyframes wp-fade-up {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
```

- [ ] **Step 2: Add the missing structural `--wp-*` vars to `_shared/src/theme/tokens.css`**

The bridge references `--wp-surface-muted`, `--wp-accent-2`, `--wp-accent-bg`, `--wp-accent-border`, `--wp-pos-bg`, `--wp-warn-bg`, `--wp-neg-bg`, `--wp-track`. Add them to **both** mode blocks. In the `[data-mode='light']` block add:

```css
  --wp-surface-muted: #fafbff;
  --wp-accent-2: #0ea5e9;
  --wp-accent-bg: color-mix(in srgb, var(--wp-accent) 12%, transparent);
  --wp-accent-border: color-mix(in srgb, var(--wp-accent) 34%, transparent);
  --wp-pos-bg: #e3f7ef;
  --wp-warn-bg: #fdf0dd;
  --wp-neg-bg: #fde8ec;
  --wp-track: #eef1fb;
```

In the `:root, [data-mode='dark']` block add:

```css
  --wp-surface-muted: #0c1220;
  --wp-accent-2: #0ea5e9;
  --wp-accent-bg: color-mix(in srgb, var(--wp-accent) 16%, transparent);
  --wp-accent-border: color-mix(in srgb, var(--wp-accent) 40%, transparent);
  --wp-pos-bg: rgba(52,211,153,0.12);
  --wp-warn-bg: rgba(251,191,36,0.12);
  --wp-neg-bg: rgba(251,113,133,0.12);
  --wp-track: rgba(148,163,184,0.14);
```

- [ ] **Step 3: Fix `ThemeProvider` to inject persona accent in BOTH modes**

In `_shared/src/theme/ThemeProvider.tsx`, replace the dark-only spread (lines ~34-44) so persona accent tokens are always injected (light mode should be persona-themed too, not fixed blue→violet):

```tsx
  const style = {
    fontFamily: 'var(--font-sans)',
    '--wp-accent': theme.accent,
    '--wp-accent-2': theme.accentSoft,
    '--wp-accent-soft': theme.accentSoft,
    '--wp-gradient': theme.gradient,
    '--wp-glow': theme.glow,
  } as CSSProperties;
```

- [ ] **Step 4: Replicate Steps 1's block into the other three bundles**

Copy the exact same insertion from Step 1 into `ReactWealth/src/styles/global.css`, `ReactCommercial/src/styles/global.css`, and `ReactHeadless/src/styles/global.css` (identical content).

- [ ] **Step 5: Verify each bundle builds**

Run (from repo root, one at a time):
```bash
for b in ReactRetail ReactWealth ReactCommercial ReactHeadless; do
  (cd force-app/main/default/uiBundles/$b && npm run build) || echo "FAIL $b";
done
```
Expected: each ends with a Vite `✓ built in …` line, no TS errors, no "FAIL".

- [ ] **Step 6: Commit**

```bash
git add force-app/main/default/uiBundles/*/src/styles/global.css \
        force-app/main/default/uiBundles/_shared/src/theme/tokens.css \
        force-app/main/default/uiBundles/_shared/src/theme/ThemeProvider.tsx
git commit -m "feat(design): Cumulus Aurora token + font foundation across bundles"
```

---

## Task 2: `iconMap` + `Icon` helper (lucide, no emoji)

**Files:**
- Create: `_shared/src/components/iconMap.tsx`
- Modify: `_shared/src/components/index.ts`
- Test: `ReactRetail/src/shared-primitives/__tests__/iconMap.test.tsx`

**Interfaces:**
- Produces: `type IconKey = 'home'|'clients'|'pipeline'|'tasks'|'alerts'|'call'|'meeting'|'task'|'event'|'arrow'|'sparkle'|'search'|'homePurchase'|'newChild'|'jobChange'|'retirement'|'marriage'`; `function Icon(props: { name: IconKey; size?: number; className?: string }): JSX.Element` — renders the mapped lucide icon; falls back to `Circle` for unknown keys.
- Consumes: lucide-react (already a dependency).

- [ ] **Step 1: Write the failing test**

`ReactRetail/src/shared-primitives/__tests__/iconMap.test.tsx`:
```tsx
import { render } from '@testing-library/react';
import { Icon } from '@shared';

describe('Icon', () => {
  it('renders an svg for a known key', () => {
    const { container } = render(<Icon name="pipeline" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('applies the size prop to width/height', () => {
    const { container } = render(<Icon name="call" size={30} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('30');
    expect(svg.getAttribute('height')).toBe('30');
  });

  it('falls back to a circle svg for an unknown key', () => {
    // @ts-expect-error deliberate unknown key
    const { container } = render(<Icon name="nope" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd force-app/main/default/uiBundles/ReactRetail && npm run test -- run src/shared-primitives/__tests__/iconMap.test.tsx`
Expected: FAIL — `Icon` is not exported from `@shared`.

- [ ] **Step 3: Implement `iconMap.tsx`**

`_shared/src/components/iconMap.tsx`:
```tsx
import {
  Home, Users, BarChart3, CheckCircle2, Bell, Phone, Handshake, ListChecks,
  Calendar, ArrowRight, Sparkles, Search, House, Baby, Briefcase, PalmtreeIcon,
  HeartHandshake, Circle, type LucideIcon,
} from 'lucide-react';

export type IconKey =
  | 'home' | 'clients' | 'pipeline' | 'tasks' | 'alerts'
  | 'call' | 'meeting' | 'task' | 'event'
  | 'arrow' | 'sparkle' | 'search'
  | 'homePurchase' | 'newChild' | 'jobChange' | 'retirement' | 'marriage';

const MAP: Record<IconKey, LucideIcon> = {
  home: Home, clients: Users, pipeline: BarChart3, tasks: CheckCircle2, alerts: Bell,
  call: Phone, meeting: Handshake, task: ListChecks, event: Calendar,
  arrow: ArrowRight, sparkle: Sparkles, search: Search,
  homePurchase: House, newChild: Baby, jobChange: Briefcase,
  retirement: PalmtreeIcon, marriage: HeartHandshake,
};

export function Icon({ name, size = 18, className }: { name: IconKey; size?: number; className?: string }) {
  const Cmp = MAP[name] ?? Circle;
  return <Cmp size={size} className={className} aria-hidden="true" />;
}
```

Note: if `PalmtreeIcon` is not an export in the installed lucide-react version, use `Palmtree`. Verify with `node -e "console.log(Object.keys(require('lucide-react')).filter(k=>/Palm/.test(k)))"` from the bundle dir and use whichever name resolves.

- [ ] **Step 4: Export from the barrel**

Add to `_shared/src/components/index.ts`:
```ts
export { Icon, type IconKey } from './iconMap';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd force-app/main/default/uiBundles/ReactRetail && npm run test -- run src/shared-primitives/__tests__/iconMap.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add force-app/main/default/uiBundles/_shared/src/components/iconMap.tsx \
        force-app/main/default/uiBundles/_shared/src/components/index.ts \
        force-app/main/default/uiBundles/ReactRetail/src/shared-primitives/__tests__/iconMap.test.tsx
git commit -m "feat(design): lucide iconMap + Icon helper"
```

---

## Task 3: `Eyebrow` + `Pill` primitives

**Files:**
- Create: `_shared/src/components/Eyebrow.tsx`
- Create: `_shared/src/components/Pill.tsx`
- Modify: `_shared/src/components/index.ts`
- Test: `ReactRetail/src/shared-primitives/__tests__/eyebrow-pill.test.tsx`

**Interfaces:**
- Produces:
  - `function Eyebrow(props: { children: ReactNode; className?: string }): JSX.Element` — renders `<span>` with classes `font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-faint`.
  - `type PillTone = 'ok'|'warn'|'risk'|'neutral'|'accent'`; `function Pill(props: { tone?: PillTone; children: ReactNode; className?: string }): JSX.Element` — tonal pill; tone→classes map: ok=`bg-ok-bg text-ok`, warn=`bg-warn-bg text-warn`, risk=`bg-risk-bg text-risk`, accent=`bg-accent-bg text-accent`, neutral=`bg-track text-muted`.
- Consumes: `clsx` (installed).

- [ ] **Step 1: Write the failing test**

`ReactRetail/src/shared-primitives/__tests__/eyebrow-pill.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { Eyebrow, Pill } from '@shared';

describe('Eyebrow', () => {
  it('renders its text uppercased-by-css and applies tracking class', () => {
    const { container } = render(<Eyebrow>Total VDPs</Eyebrow>);
    const el = screen.getByText('Total VDPs');
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('tracking-[0.14em]');
    expect(el.className).toContain('uppercase');
  });
});

describe('Pill', () => {
  it('maps the risk tone to risk classes', () => {
    render(<Pill tone="risk">needs outreach</Pill>);
    const el = screen.getByText('needs outreach');
    expect(el.className).toContain('bg-risk-bg');
    expect(el.className).toContain('text-risk');
  });
  it('defaults to the neutral tone', () => {
    render(<Pill>unknown</Pill>);
    expect(screen.getByText('unknown').className).toContain('text-muted');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd force-app/main/default/uiBundles/ReactRetail && npm run test -- run src/shared-primitives/__tests__/eyebrow-pill.test.tsx`
Expected: FAIL — `Eyebrow`/`Pill` not exported.

- [ ] **Step 3: Implement `Eyebrow.tsx`**

```tsx
import type { ReactNode } from 'react';
import clsx from 'clsx';

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={clsx('font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-faint', className)}>
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Implement `Pill.tsx`**

```tsx
import type { ReactNode } from 'react';
import clsx from 'clsx';

export type PillTone = 'ok' | 'warn' | 'risk' | 'neutral' | 'accent';

const TONE: Record<PillTone, string> = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  risk: 'bg-risk-bg text-risk',
  accent: 'bg-accent-bg text-accent',
  neutral: 'bg-track text-muted',
};

export function Pill({ tone = 'neutral', children, className }: { tone?: PillTone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]',
      TONE[tone], className,
    )}>
      {children}
    </span>
  );
}
```

- [ ] **Step 5: Export from the barrel**

Add to `_shared/src/components/index.ts`:
```ts
export { Eyebrow } from './Eyebrow';
export { Pill, type PillTone } from './Pill';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd force-app/main/default/uiBundles/ReactRetail && npm run test -- run src/shared-primitives/__tests__/eyebrow-pill.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add force-app/main/default/uiBundles/_shared/src/components/Eyebrow.tsx \
        force-app/main/default/uiBundles/_shared/src/components/Pill.tsx \
        force-app/main/default/uiBundles/_shared/src/components/index.ts \
        force-app/main/default/uiBundles/ReactRetail/src/shared-primitives/__tests__/eyebrow-pill.test.tsx
git commit -m "feat(design): Eyebrow + Pill primitives"
```

---

## Task 4: `ScoreRing` primitive (fixes the mockup ring bug)

**Files:**
- Create: `_shared/src/components/ScoreRing.tsx`
- Modify: `_shared/src/components/index.ts`
- Test: `ReactRetail/src/shared-primitives/__tests__/scoreRing.test.tsx`

**Interfaces:**
- Produces: `type RingTone = 'ok'|'warn'|'risk'|'accent'`; `function ScoreRing(props: { value: number; max?: number; tone?: RingTone; caption?: string; size?: number }): JSX.Element` — SVG ring using `inline-grid` container (the mockup fix); exposes `data-testid="score-ring"` on the wrapper and the numeric value as text.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

`ReactRetail/src/shared-primitives/__tests__/scoreRing.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { ScoreRing } from '@shared';

describe('ScoreRing', () => {
  it('renders the value number and caption', () => {
    render(<ScoreRing value={79} caption="CSAT/NPS" tone="risk" />);
    expect(screen.getByText('79')).toBeInTheDocument();
    expect(screen.getByText('CSAT/NPS')).toBeInTheDocument();
  });
  it('uses an inline-grid wrapper so the svg + number align', () => {
    render(<ScoreRing value={50} />);
    const wrap = screen.getByTestId('score-ring');
    expect(wrap.className).toContain('inline-grid');
  });
  it('computes dashoffset from value/max (half full → half offset)', () => {
    const { container } = render(<ScoreRing value={50} max={100} size={46} />);
    const fill = container.querySelector('[data-ring-fill]') as SVGCircleElement;
    const dash = Number(fill.getAttribute('stroke-dasharray'));
    const off = Number(fill.getAttribute('stroke-dashoffset'));
    expect(off).toBeCloseTo(dash / 2, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd force-app/main/default/uiBundles/ReactRetail && npm run test -- run src/shared-primitives/__tests__/scoreRing.test.tsx`
Expected: FAIL — `ScoreRing` not exported.

- [ ] **Step 3: Implement `ScoreRing.tsx`**

```tsx
import clsx from 'clsx';

export type RingTone = 'ok' | 'warn' | 'risk' | 'accent';

const STROKE: Record<RingTone, string> = {
  ok: 'var(--wp-pos)', warn: 'var(--wp-warn)', risk: 'var(--wp-neg)', accent: 'var(--wp-accent)',
};
const TEXT: Record<RingTone, string> = {
  ok: 'text-ok', warn: 'text-warn', risk: 'text-risk', accent: 'text-accent',
};

export function ScoreRing({
  value, max = 100, tone = 'accent', caption, size = 46,
}: { value: number; max?: number; tone?: RingTone; caption?: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  const offset = circ * (1 - pct);
  const c = size / 2;

  return (
    <span className="text-center">
      <span data-testid="score-ring" className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', gridArea: '1/1' }}>
          <circle cx={c} cy={c} r={r} fill="none" strokeWidth={5} stroke="var(--wp-track)" />
          <circle
            data-ring-fill
            cx={c} cy={c} r={r} fill="none" strokeWidth={5} strokeLinecap="round"
            stroke={STROKE[tone]} strokeDasharray={circ} strokeDashoffset={offset}
          />
        </svg>
        <span className={clsx('tabular-nums font-semibold text-[13px]', TEXT[tone])} style={{ gridArea: '1/1' }}>
          {value}
        </span>
      </span>
      {caption && <span className="block text-[8.5px] uppercase tracking-[0.06em] text-faint mt-1">{caption}</span>}
    </span>
  );
}
```

- [ ] **Step 4: Export from the barrel**

Add to `_shared/src/components/index.ts`:
```ts
export { ScoreRing, type RingTone } from './ScoreRing';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd force-app/main/default/uiBundles/ReactRetail && npm run test -- run src/shared-primitives/__tests__/scoreRing.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add force-app/main/default/uiBundles/_shared/src/components/ScoreRing.tsx \
        force-app/main/default/uiBundles/_shared/src/components/index.ts \
        force-app/main/default/uiBundles/ReactRetail/src/shared-primitives/__tests__/scoreRing.test.tsx
git commit -m "feat(design): ScoreRing primitive (inline-grid, fixes ring distortion)"
```

---

## Task 5: `StatTile` primitive (replaces flat KpiTile)

**Files:**
- Create: `_shared/src/components/StatTile.tsx`
- Modify: `_shared/src/components/index.ts`
- Test: `ReactRetail/src/shared-primitives/__tests__/statTile.test.tsx`

**Interfaces:**
- Produces: `type StatTone = 'accent'|'risk'`; `function StatTile(props: { label: string; value: number; format?: ValueFormat; deltaPct?: number; trend?: number[]; tone?: StatTone; index?: number }): JSX.Element` — accent-top-bar card; big count-up value in `font-display tabular-nums`; semantic delta chip; optional `Sparkline`. Value carries `data-testid="stat-value"`.
- Consumes: `useCountUp` (existing), `formatValue`/`ValueFormat` (existing), `Sparkline` (existing), `Eyebrow` (Task 3).

- [ ] **Step 1: Write the failing test**

`ReactRetail/src/shared-primitives/__tests__/statTile.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { StatTile } from '@shared';

describe('StatTile', () => {
  it('renders the label as an eyebrow', () => {
    render(<StatTile label="Pipeline" value={20.3} format="plain" />);
    expect(screen.getByText('Pipeline')).toBeInTheDocument();
  });
  it('renders a positive delta chip with an up marker', () => {
    render(<StatTile label="Pipeline" value={100} deltaPct={0.042} />);
    expect(screen.getByText(/4\.2%/)).toBeInTheDocument();
    expect(screen.getByText(/▲/)).toBeInTheDocument();
  });
  it('applies the display font + tabular-nums to the value', () => {
    render(<StatTile label="X" value={5} />);
    const v = screen.getByTestId('stat-value');
    expect(v.className).toContain('font-display');
    expect(v.className).toContain('tabular-nums');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd force-app/main/default/uiBundles/ReactRetail && npm run test -- run src/shared-primitives/__tests__/statTile.test.tsx`
Expected: FAIL — `StatTile` not exported.

- [ ] **Step 3: Implement `StatTile.tsx`**

```tsx
import clsx from 'clsx';
import { useCountUp } from './useCountUp';
import { formatValue, type ValueFormat } from './format';
import { Sparkline } from './Sparkline';
import { Eyebrow } from './Eyebrow';

export type StatTone = 'accent' | 'risk';

export function StatTile({
  label, value, format = 'number', deltaPct, trend, tone = 'accent', index = 0,
}: {
  label: string; value: number; format?: ValueFormat; deltaPct?: number;
  trend?: number[]; tone?: StatTone; index?: number;
}) {
  const display = useCountUp(value);
  const up = (deltaPct ?? 0) >= 0;
  return (
    <div
      className="relative overflow-hidden rounded-sub border border-line bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-pop hover:border-accent-border"
      style={{ animation: `wp-fade-up 0.5s ease ${index * 0.05}s both` }}
    >
      <span aria-hidden="true" className={clsx('absolute inset-x-0 top-0 h-[3px] opacity-95', tone === 'risk' ? 'bg-risk' : 'bg-gradient-brand')} />
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-3 flex items-baseline gap-2">
        <span data-testid="stat-value" className={clsx('font-display tabular-nums text-[31px] font-semibold leading-none tracking-tight', tone === 'risk' && 'text-risk')}>
          {formatValue(display, format)}
        </span>
        {deltaPct != null && (
          <span className={clsx('tabular-nums text-[11px] font-bold', up ? 'text-ok' : 'text-risk')}>
            {up ? '▲' : '▼'} {Math.abs(deltaPct * 100).toFixed(1)}%
          </span>
        )}
      </div>
      {trend && trend.length > 0 && <div className="mt-2.5"><Sparkline points={trend} width={150} height={34} /></div>}
    </div>
  );
}
```

- [ ] **Step 4: Export from the barrel**

Add to `_shared/src/components/index.ts`:
```ts
export { StatTile, type StatTone } from './StatTile';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd force-app/main/default/uiBundles/ReactRetail && npm run test -- run src/shared-primitives/__tests__/statTile.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add force-app/main/default/uiBundles/_shared/src/components/StatTile.tsx \
        force-app/main/default/uiBundles/_shared/src/components/index.ts \
        force-app/main/default/uiBundles/ReactRetail/src/shared-primitives/__tests__/statTile.test.tsx
git commit -m "feat(design): StatTile primitive (accent bar, display serif, delta chip)"
```

---

## Task 6: `Panel` + `Meter` primitives

**Files:**
- Create: `_shared/src/components/Panel.tsx`
- Create: `_shared/src/components/Meter.tsx`
- Modify: `_shared/src/components/index.ts`
- Test: `ReactRetail/src/shared-primitives/__tests__/panel-meter.test.tsx`

**Interfaces:**
- Produces:
  - `function Panel(props: { title?: string; count?: number; hint?: string; action?: ReactNode; accentRail?: boolean; index?: number; className?: string; children: ReactNode }): JSX.Element` — hairline card w/ optional header (Eyebrow title + count badge + hint/action) and optional 3px left accent rail.
  - `function Meter(props: { label: string; value: number; caption?: string }): JSX.Element` — semantic-fill bar: `value >= 1` → `bg-ok`; `value >= 0.5` → `bg-gradient-brand`; else `bg-warn`. Caption right-aligned in `tabular-nums`. Fill element carries `data-testid="meter-fill"` and `data-fill-kind` of `ok|brand|warn`.
- Consumes: `Eyebrow` (Task 3).

- [ ] **Step 1: Write the failing test**

`ReactRetail/src/shared-primitives/__tests__/panel-meter.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { Panel, Meter } from '@shared';

describe('Panel', () => {
  it('renders title, count badge and hint', () => {
    render(<Panel title="Pipeline" count={12} hint="AI-ranked"><div>body</div></Panel>);
    expect(screen.getByText('Pipeline')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('AI-ranked')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });
});

describe('Meter', () => {
  it('uses ok fill at/above 100%', () => {
    render(<Meter label="Estate" value={1} caption="$1.5M / $1.5M" />);
    expect(screen.getByTestId('meter-fill').getAttribute('data-fill-kind')).toBe('ok');
  });
  it('uses brand fill between 50% and 100%', () => {
    render(<Meter label="Retire" value={0.97} caption="x" />);
    expect(screen.getByTestId('meter-fill').getAttribute('data-fill-kind')).toBe('brand');
  });
  it('uses warn fill below 50%', () => {
    render(<Meter label="Vacation" value={0.32} caption="x" />);
    expect(screen.getByTestId('meter-fill').getAttribute('data-fill-kind')).toBe('warn');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd force-app/main/default/uiBundles/ReactRetail && npm run test -- run src/shared-primitives/__tests__/panel-meter.test.tsx`
Expected: FAIL — `Panel`/`Meter` not exported.

- [ ] **Step 3: Implement `Panel.tsx`**

```tsx
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Eyebrow } from './Eyebrow';

export function Panel({
  title, count, hint, action, accentRail, index = 0, className, children,
}: {
  title?: string; count?: number; hint?: string; action?: ReactNode;
  accentRail?: boolean; index?: number; className?: string; children: ReactNode;
}) {
  return (
    <section
      className={clsx('overflow-hidden rounded-card border border-line bg-surface shadow-card', accentRail && 'border-l-[3px] border-l-accent', className)}
      style={{ animation: `wp-fade-up 0.5s ease ${index * 0.06}s both` }}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3.5">
          <span className="flex items-center">
            {title && <Eyebrow className="!text-muted !tracking-[0.13em]">{title}</Eyebrow>}
            {count != null && <span className="ml-2 rounded-full bg-track px-2 py-0.5 text-[10px] font-semibold text-muted tabular-nums">{count}</span>}
          </span>
          {hint && <span className="text-[10px] uppercase tracking-[0.08em] text-faint">{hint}</span>}
          {action}
        </header>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}
```

- [ ] **Step 4: Implement `Meter.tsx`**

```tsx
import clsx from 'clsx';

export function Meter({ label, value, caption }: { label: string; value: number; caption?: string }) {
  const pct = Math.max(0, Math.min(1, value));
  const kind = value >= 1 ? 'ok' : value >= 0.5 ? 'brand' : 'warn';
  const fill = kind === 'ok' ? 'bg-ok' : kind === 'brand' ? 'bg-gradient-brand' : 'bg-warn';
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-fg">{label}</span>
        {caption && <span className="tabular-nums text-[11px] font-semibold text-muted">{caption}</span>}
      </div>
      <div className="h-[7px] overflow-hidden rounded-full bg-track">
        <div data-testid="meter-fill" data-fill-kind={kind} className={clsx('h-full rounded-full', fill)} style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Export from the barrel**

Add to `_shared/src/components/index.ts`:
```ts
export { Panel } from './Panel';
export { Meter } from './Meter';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd force-app/main/default/uiBundles/ReactRetail && npm run test -- run src/shared-primitives/__tests__/panel-meter.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add force-app/main/default/uiBundles/_shared/src/components/Panel.tsx \
        force-app/main/default/uiBundles/_shared/src/components/Meter.tsx \
        force-app/main/default/uiBundles/_shared/src/components/index.ts \
        force-app/main/default/uiBundles/ReactRetail/src/shared-primitives/__tests__/panel-meter.test.tsx
git commit -m "feat(design): Panel + Meter primitives"
```

---

## Task 7: `EntityRow` + `HeroBand` primitives

**Files:**
- Create: `_shared/src/components/EntityRow.tsx`
- Create: `_shared/src/components/HeroBand.tsx`
- Modify: `_shared/src/components/index.ts`
- Test: `ReactRetail/src/shared-primitives/__tests__/entityRow-hero.test.tsx`

**Interfaces:**
- Produces:
  - `function EntityRow(props: { avatar?: string; iconName?: IconKey; title: string; badge?: string; reason?: string; action?: string; right?: ReactNode; onClick?: () => void; index?: number }): JSX.Element` — button row; leading chip is `avatar` initials OR `Icon`; drill affordance; optional `action` pill w/ arrow; `right` slot (e.g. a `ScoreRing`). Root is a `<button>` (role button) with `data-testid="entity-row"`.
  - `function HeroBand(props: { eyebrow: string; title: string; body?: string; meta?: string }): JSX.Element` — gradient hero w/ sparkle eyebrow, `font-display` title, radial glow overlay, `print:` neutralized (`print:bg-none print:text-fg`).
- Consumes: `Icon`/`IconKey` (Task 2), `Eyebrow` (Task 3).

- [ ] **Step 1: Write the failing test**

`ReactRetail/src/shared-primitives/__tests__/entityRow-hero.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntityRow, HeroBand } from '@shared';

describe('EntityRow', () => {
  it('renders title, reason and action, and fires onClick', async () => {
    const onClick = vi.fn();
    render(<EntityRow avatar="CH" title="Cooper Household" badge="Retail" reason="CSAT dropped" action="Outreach" onClick={onClick} />);
    expect(screen.getByText('Cooper Household')).toBeInTheDocument();
    expect(screen.getByText('CSAT dropped')).toBeInTheDocument();
    expect(screen.getByText(/Outreach/)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('entity-row'));
    expect(onClick).toHaveBeenCalledOnce();
  });
  it('renders initials chip from the avatar prop', () => {
    render(<EntityRow avatar="JP" title="Jaime Parsons" />);
    expect(screen.getByText('JP')).toBeInTheDocument();
  });
});

describe('HeroBand', () => {
  it('renders eyebrow, title and body', () => {
    render(<HeroBand eyebrow="Today · AI Daily Brief" title="Good morning, Alex" body="8 clients flagged." meta="AI confidence 87%" />);
    expect(screen.getByText('Today · AI Daily Brief')).toBeInTheDocument();
    expect(screen.getByText('Good morning, Alex')).toBeInTheDocument();
    expect(screen.getByText('8 clients flagged.')).toBeInTheDocument();
    expect(screen.getByText('AI confidence 87%')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd force-app/main/default/uiBundles/ReactRetail && npm run test -- run src/shared-primitives/__tests__/entityRow-hero.test.tsx`
Expected: FAIL — `EntityRow`/`HeroBand` not exported.

- [ ] **Step 3: Implement `EntityRow.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Icon, type IconKey } from './iconMap';

export function EntityRow({
  avatar, iconName, title, badge, reason, action, right, onClick, index = 0,
}: {
  avatar?: string; iconName?: IconKey; title: string; badge?: string;
  reason?: string; action?: string; right?: ReactNode; onClick?: () => void; index?: number;
}) {
  return (
    <button
      type="button"
      data-testid="entity-row"
      onClick={onClick}
      className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-sub border border-line bg-surface-muted px-3.5 py-3 text-left transition hover:-translate-y-0.5 hover:border-accent-border hover:shadow-card"
      style={{ animation: `wp-fade-up 0.4s ease ${index * 0.05}s both` }}
    >
      <span className="grid h-10 w-10 flex-none place-items-center rounded-[11px] border border-accent-border bg-accent-bg text-[13px] font-semibold text-accent">
        {avatar ? avatar : iconName ? <Icon name={iconName} size={18} /> : null}
      </span>
      <span className="min-w-0">
        <span className="flex items-baseline gap-2">
          <b className="truncate text-[14.5px] font-extrabold tracking-tight">{title}</b>
          {badge && <span className="text-[10px] uppercase tracking-[0.08em] text-faint">{badge}</span>}
        </span>
        {reason && <span className="mt-0.5 block text-[12.5px] text-muted">{reason}</span>}
        {action && (
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-accent-border bg-accent-bg px-2.5 py-0.5 text-[11.5px] font-bold text-accent">
            <Icon name="arrow" size={12} /> {action}
          </span>
        )}
      </span>
      {right}
    </button>
  );
}
```

- [ ] **Step 4: Implement `HeroBand.tsx`**

```tsx
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
```

- [ ] **Step 5: Export from the barrel**

Add to `_shared/src/components/index.ts`:
```ts
export { EntityRow } from './EntityRow';
export { HeroBand } from './HeroBand';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd force-app/main/default/uiBundles/ReactRetail && npm run test -- run src/shared-primitives/__tests__/entityRow-hero.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add force-app/main/default/uiBundles/_shared/src/components/EntityRow.tsx \
        force-app/main/default/uiBundles/_shared/src/components/HeroBand.tsx \
        force-app/main/default/uiBundles/_shared/src/components/index.ts \
        force-app/main/default/uiBundles/ReactRetail/src/shared-primitives/__tests__/entityRow-hero.test.tsx
git commit -m "feat(design): EntityRow + HeroBand primitives"
```

---

## Task 8: Recompose `AppShell` (lucide nav, glass chrome) — all 3 personas

**Files:**
- Modify: `ReactRetail/src/shell/AppShell.tsx`
- Modify: `ReactWealth/src/shell/AppShell.tsx`
- Modify: `ReactCommercial/src/shell/AppShell.tsx`
- Modify: `ReactRetail/src/home/HomeLayout.tsx` (+ Wealth/Commercial equivalents) — change `NavItem.icon` values from emoji to `IconKey` strings.
- Test: `ReactRetail/src/shared-primitives/__tests__/appShell.test.tsx`

**Interfaces:**
- Consumes: `Icon`/`IconKey` (Task 2). Changes `NavItem.icon` type from `string` to `IconKey`.
- Produces: restyled shell; `NavItem = { id: string; label: string; icon: IconKey; active?: boolean; onClick?: () => void }`.

- [ ] **Step 1: Write the failing test**

`ReactRetail/src/shared-primitives/__tests__/appShell.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { AppShell } from '../../shell/AppShell';

describe('AppShell', () => {
  it('renders nav labels as lucide icon buttons (no emoji glyphs)', () => {
    render(
      <AppShell title="Command Center" nav={[{ id: 'home', label: 'Home', icon: 'home', active: true }]}>
        <div>content</div>
      </AppShell>,
    );
    expect(screen.getByText('Command Center')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
    // active nav button present + contains an svg (lucide), not an emoji text node
    const homeBtn = screen.getByTitle('Home');
    expect(homeBtn.querySelector('svg')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd force-app/main/default/uiBundles/ReactRetail && npm run test -- run src/shared-primitives/__tests__/appShell.test.tsx`
Expected: FAIL — nav currently renders `item.icon` as an emoji text node; no `svg` present.

- [ ] **Step 3: Update `NavItem` + nav rendering in `ReactRetail/src/shell/AppShell.tsx`**

Change the interface and the nav `<span>` that renders the icon. Replace:
```tsx
export interface NavItem {
  id: string;
  label: string;
  icon: string;
  active?: boolean;
  onClick?: () => void;
}
```
with:
```tsx
import { Icon, type IconKey } from '@shared';

export interface NavItem {
  id: string;
  label: string;
  icon: IconKey;
  active?: boolean;
  onClick?: () => void;
}
```
And replace the emoji-rendering span (currently `<span … >{item.icon}</span>`) with:
```tsx
<span aria-hidden="true" className="grid w-5 flex-none place-items-center">
  <Icon name={item.icon} size={18} />
</span>
```
Also replace the top-bar emoji glyphs (`⌕`, `✦`, `🔔`) with `<Icon name="search" .../>`, `<Icon name="sparkle" .../>`, `<Icon name="alerts" .../>` respectively, and the Agentforce button styling to the pink AI treatment: `background: 'var(--color-pink)'`, `color: '#fff'`, border none (pink = AI entry point).

- [ ] **Step 4: Update `HomeLayout.tsx` nav icon values (Retail)**

In `ReactRetail/src/home/HomeLayout.tsx`, change the `nav` array `icon:` values from emoji to `IconKey` strings: `'⌂'`→`'home'`, `'👥'`→`'clients'`, `'📊'`→`'pipeline'`, `'✓'`→`'tasks'`, `'🔔'`→`'alerts'`.

- [ ] **Step 5: Replicate Steps 3-4 for Wealth + Commercial**

Apply the identical `AppShell.tsx` edits and `HomeLayout.tsx` icon-value edits to `ReactWealth` and `ReactCommercial`.

- [ ] **Step 6: Run test + build to verify**

Run: `cd force-app/main/default/uiBundles/ReactRetail && npm run test -- run src/shared-primitives/__tests__/appShell.test.tsx && npm run build`
Expected: test PASS; build `✓ built`.
Then build Wealth + Commercial: `for b in ReactWealth ReactCommercial; do (cd force-app/main/default/uiBundles/$b && npm run build) || echo FAIL $b; done`
Expected: no FAIL.

- [ ] **Step 7: Commit**

```bash
git add force-app/main/default/uiBundles/{ReactRetail,ReactWealth,ReactCommercial}/src/shell/AppShell.tsx \
        force-app/main/default/uiBundles/{ReactRetail,ReactWealth,ReactCommercial}/src/home/HomeLayout.tsx \
        force-app/main/default/uiBundles/ReactRetail/src/shared-primitives/__tests__/appShell.test.tsx
git commit -m "feat(design): lucide nav + pink AI button in AppShell (3 personas)"
```

---

## Task 9: Recompose Retail `HomePage` against new primitives

**Files:**
- Modify: `ReactRetail/src/home/HomePage.tsx`
- Test: `ReactRetail/src/home/__tests__/homePage.test.tsx`

**Interfaces:**
- Consumes: `HeroBand`, `StatTile`, `Panel`, `EntityRow`, `Meter`, `ScoreRing`, `Pill`, `Icon` (Tasks 2-7), plus existing `useAsyncData`, `DataTable`, `formatValue`, home types + `fetchHomeDashboard` (unchanged).
- Produces: redesigned Retail home; behavior (data, navigation to `/client/:id`) unchanged.

- [ ] **Step 1: Write the failing test**

`ReactRetail/src/home/__tests__/homePage.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import HomePage from '../HomePage';

describe('HomePage (Cumulus Aurora)', () => {
  it('renders the AI hero, a stat strip and the who-to-call panel after load', async () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    await waitFor(() => expect(screen.queryByText(/Loading your book/)).not.toBeInTheDocument());
    // hero eyebrow
    expect(screen.getByText(/AI Daily Brief/i)).toBeInTheDocument();
    // who-to-call panel title
    expect(screen.getByText(/Who to call today/i)).toBeInTheDocument();
    // at least one stat value rendered in display font
    expect(screen.getAllByTestId('stat-value').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd force-app/main/default/uiBundles/ReactRetail && npm run test -- run src/home/__tests__/homePage.test.tsx`
Expected: FAIL — no `stat-value` testids (still old `KpiTile`), or hero text differs.

- [ ] **Step 3: Rewrite `HomePage.tsx` body using the new primitives**

Replace the inline-styled hero with `<HeroBand eyebrow={`${data.dateLabel} · AI Daily Brief`} title={`Good morning, ${data.bankerName} — ${data.aiBriefHeadline}.`} body={data.aiBrief} meta={`AI confidence ${data.confidencePct}% · ${data.dataSourceCount} data sources`} />`.
Replace the KPI strip `KpiTile` map with `StatTile` (pass `tone="risk"` for the CSAT/at-risk KPI — detect by `k.key` or a `risk` flag on the KPI; if the type has no such flag, treat `k.key === 'atRisk'` as risk, else accent).
Replace `GlassCard` usages with `Panel` (pass `title`, `count`, `hint`, `action`).
Replace each who-to-call `<button>` with `<EntityRow avatar={initials(c.clientName)} title={c.clientName} badge={c.segment} reason={c.reason} action={c.action} onClick={() => openClient(c.clientId)} right={<ScoreRing value={Math.round(c.score*100)} tone={c.severity === 'high' ? 'risk' : c.severity === 'medium' ? 'warn' : 'accent'} caption={c.source} />} index={i} />`. Add a local `initials(name: string)` helper returning up to 2 uppercase initials.
Replace `ProgressBar` in goals with `<Meter label={g.name} value={g.current / g.target} caption={`${formatValue(g.current, g.format)} / ${formatValue(g.target, g.format)}`} />`.
Replace schedule list markup with a timeline rail using `<Icon name={s.kind} .../>` (map `s.kind` values call/meeting/task/event to those IconKeys).
Replace life-event `<button>`s with `<EntityRow iconName={lifeEventIcon(e.icon)} title={e.event} badge={e.when} reason={e.clientName} action={e.opportunity} onClick={() => openClient(e.clientId)} />` where `lifeEventIcon` maps the existing emoji/kind to an `IconKey`.
Keep `DataTable` for Pipeline + Leads, wrapped in `Panel`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd force-app/main/default/uiBundles/ReactRetail && npm run test -- run src/home/__tests__/homePage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full bundle test + build + lint**

Run: `cd force-app/main/default/uiBundles/ReactRetail && npm run test -- run && npm run build && npm run lint`
Expected: all tests PASS; build `✓ built`; lint clean (fix any unused old imports like `GlassCard`, `KpiTile`, `ProgressBar` if now unused).

- [ ] **Step 6: Visual check (manual)**

Run: `cd force-app/main/default/uiBundles/ReactRetail && npm run dev` — open the served URL, confirm hero/stat strip/who-to-call/score rings/timeline/meters/life events render in the Aurora light theme, hover-lift works, no console errors. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add force-app/main/default/uiBundles/ReactRetail/src/home/HomePage.tsx \
        force-app/main/default/uiBundles/ReactRetail/src/home/__tests__/homePage.test.tsx
git commit -m "feat(design): recompose Retail home in Cumulus Aurora"
```

---

## Task 10: Apply the redesigned `HomePage` to Wealth + Commercial

**Files:**
- Modify: `ReactWealth/src/home/HomePage.tsx`
- Modify: `ReactCommercial/src/home/HomePage.tsx`
- Test: `ReactRetail/src/home/__tests__/homePage.test.tsx` already covers the shared shape; add a light smoke test per bundle only if the composition differs.

**Interfaces:**
- Consumes: same primitives as Task 9. Wealth/Commercial `HomePage` share the structure; differences are persona theme (already handled by `ThemeProvider` in their `HomeLayout`) and any persona-specific copy/columns.

- [ ] **Step 1: Diff the three HomePages**

Run: `diff <(sed -n '1,60p' force-app/main/default/uiBundles/ReactWealth/src/home/HomePage.tsx) <(sed -n '1,60p' force-app/main/default/uiBundles/ReactRetail/src/home/HomePage.tsx.orig 2>/dev/null) ; echo '---'; ls force-app/main/default/uiBundles/ReactCommercial/src/home/`
Determine whether Wealth/Commercial HomePages are structurally identical to Retail's pre-redesign version. If identical, port the Task 9 composition verbatim (adjusting only persona copy). If they diverge, apply the same primitive swaps (`HeroBand`/`StatTile`/`Panel`/`EntityRow`/`Meter`/`ScoreRing`) to their existing structure.

- [ ] **Step 2: Rewrite `ReactWealth/src/home/HomePage.tsx`**

Apply the identical primitive swaps from Task 9 Step 3 to the Wealth HomePage, preserving any Wealth-specific fields/labels present in its `homeTypes.ts`/`homeData.ts`.

- [ ] **Step 3: Rewrite `ReactCommercial/src/home/HomePage.tsx`**

Same, for Commercial.

- [ ] **Step 4: Build + test both bundles**

Run:
```bash
for b in ReactWealth ReactCommercial; do
  (cd force-app/main/default/uiBundles/$b && npm run test -- run && npm run build && npm run lint) || echo "FAIL $b";
done
```
Expected: no FAIL.

- [ ] **Step 5: Visual check both (manual)**

`npm run dev` in each; confirm persona theme (Wealth gold, Commercial copper) drives the gradient/accents and the redesign renders. Stop servers.

- [ ] **Step 6: Commit**

```bash
git add force-app/main/default/uiBundles/{ReactWealth,ReactCommercial}/src/home/HomePage.tsx
git commit -m "feat(design): apply Cumulus Aurora home to Wealth + Commercial"
```

---

## Task 11: Recompose Customer 360 (Retail, then port)

**Files:**
- Modify: `ReactRetail/src/personas/customer/Customer360Page.tsx`
- Modify: `ReactRetail/src/personas/customer/ClientIdentityRail.tsx`
- Modify: `ReactRetail/src/personas/customer/HighlightStrip.tsx`
- Modify: `ReactRetail/src/personas/customer/Full360Tabs.tsx`
- Modify: `ReactRetail/src/personas/customer/ContextSidebar.tsx`
- Modify: `ReactRetail/src/personas/customer/AgentforceSummaryCard.tsx`
- Then port the same to `ReactWealth` + `ReactCommercial` equivalents.
- Test: `ReactRetail/src/personas/customer/__tests__/customer360.test.tsx`

**Interfaces:**
- Consumes: `Panel`, `StatTile`, `Eyebrow`, `Pill`, `Icon`, `ScoreRing` (Tasks 2-7); existing data fetchers unchanged.
- Produces: restyled 3-column Customer 360; behavior (tab switching, data) unchanged.

- [ ] **Step 1: Write the failing test**

`ReactRetail/src/personas/customer/__tests__/customer360.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import Customer360Page from '../Customer360Page';

describe('Customer360Page (Cumulus Aurora)', () => {
  it('renders identity, headline and highlight stats after load', async () => {
    render(
      <MemoryRouter initialEntries={['/client/001am00000qvjsAAAQ']}>
        <Routes><Route path="/client/:id" element={<Customer360Page />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.queryByText(/Loading customer 360/)).not.toBeInTheDocument());
    expect(screen.getAllByTestId('stat-value').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd force-app/main/default/uiBundles/ReactRetail && npm run test -- run src/personas/customer/__tests__/customer360.test.tsx`
Expected: FAIL — highlight strip not yet `StatTile`-based (no `stat-value`).

- [ ] **Step 3: Restyle `HighlightStrip.tsx` → `StatTile`s**

Replace its inline highlight cards with `StatTile` (map each highlight's label/value/format; use `tone="risk"` where the highlight denotes risk).

- [ ] **Step 4: Restyle `ClientIdentityRail.tsx`**

Apply the Profile-Widget DNA: avatar tile (rounded, accent-wash), name in `font-display`, tier `Pill`, meta rows with `Eyebrow` labels. Wrap in `Panel` (the page already wraps it, so keep it plain or switch the page wrapper to `Panel`).

- [ ] **Step 5: Restyle `Full360Tabs.tsx` tab bar + `ContextSidebar.tsx` + `AgentforceSummaryCard.tsx`**

Tab bar: underline-active with `text-accent` + `border-b-2 border-accent` on the active tab, `text-muted` inactive. ContextSidebar panels → `Panel`. AgentforceSummaryCard → pink AI framing (pink accent border/icon, `Icon name="sparkle"`), consistent with "pink = AI".

- [ ] **Step 6: Recompose `Customer360Page.tsx`**

Swap the headline block to use `Eyebrow` + `font-display` h1; wrap the three columns' cards in `Panel`; keep the 3-column grid.

- [ ] **Step 7: Run test + full bundle verify**

Run: `cd force-app/main/default/uiBundles/ReactRetail && npm run test -- run && npm run build && npm run lint`
Expected: all PASS; `✓ built`; lint clean.

- [ ] **Step 8: Visual check (manual)**

`npm run dev`, navigate to `/client/001am00000qvjsAAAQ`, confirm the 3-column 360 renders in Aurora, tab switching works, AI card reads as pink. Stop server.

- [ ] **Step 9: Port to Wealth + Commercial**

Apply identical edits to the corresponding `ReactWealth`/`ReactCommercial` `personas/customer/*` files. Build + lint both:
```bash
for b in ReactWealth ReactCommercial; do (cd force-app/main/default/uiBundles/$b && npm run build && npm run lint) || echo FAIL $b; done
```
Expected: no FAIL.

- [ ] **Step 10: Commit**

```bash
git add force-app/main/default/uiBundles/{ReactRetail,ReactWealth,ReactCommercial}/src/personas/customer/*.tsx \
        force-app/main/default/uiBundles/ReactRetail/src/personas/customer/__tests__/customer360.test.tsx
git commit -m "feat(design): recompose Customer 360 in Cumulus Aurora (3 personas)"
```

---

## Task 12: Retire/wrap legacy primitives + final sweep

**Files:**
- Modify: `_shared/src/components/KpiTile.tsx`, `GlassCard.tsx`, `ProgressBar.tsx` (thin wrappers OR deletion if no remaining consumers)
- Modify: `_shared/src/components/index.ts`
- Modify: `ReactRetail/src/pages/Home.tsx` (+ Wealth/Commercial) — the dead stock stubs.

**Interfaces:**
- Consumes: everything prior.
- Produces: no dangling references to retired primitives; no dead stock scaffold.

- [ ] **Step 1: Find remaining consumers of legacy primitives**

Run: `grep -rn "KpiTile\|GlassCard\|ProgressBar" force-app/main/default/uiBundles/*/src --include=*.tsx | grep -v "__tests__" | grep -v "_shared/src/components/index.ts"`
Expected: a list. For each remaining consumer, either migrate it to the new primitive or, if it's an intentional back-compat surface, keep a wrapper.

- [ ] **Step 2: Convert `GlassCard`/`KpiTile`/`ProgressBar` to thin wrappers (if still referenced)**

If any consumer remains, re-implement each legacy component as a wrapper delegating to `Panel`/`StatTile`/`Meter` respectively (preserving their existing prop signatures) so nothing breaks. If `grep` shows zero non-test consumers, delete the three files and remove their exports from `index.ts`.

- [ ] **Step 3: Replace dead stock `pages/Home.tsx` stubs**

The routed home is `home/HomePage.tsx`; `pages/Home.tsx` is unrouted scaffold. Either delete `pages/Home.tsx` in all three bundles (confirm `routes.tsx` does not import it — it imports `home/HomePage`), or replace its body with a redirect to `/`. Prefer deletion; update any stray import.

- [ ] **Step 4: Full verify across all bundles**

Run:
```bash
for b in ReactRetail ReactWealth ReactCommercial ReactHeadless; do
  echo "== $b =="; (cd force-app/main/default/uiBundles/$b && npm run test -- run && npm run build && npm run lint) || echo "FAIL $b";
done
```
Expected: no FAIL anywhere; ReactRetail runs the full primitive test suite green.

- [ ] **Step 5: Commit**

```bash
git add -A force-app/main/default/uiBundles
git commit -m "chore(design): retire legacy primitives + remove dead stock stubs"
```

---

## Task 13: Rebuild + commit `dist/` (deploy-readiness)

**Files:**
- Modify: `{ReactRetail,ReactWealth,ReactCommercial,ReactHeadless}/dist/**` (build artifacts)

**Interfaces:** none — this makes the redesign deployable (UIBundle ships `dist/`, not `src/`).

- [ ] **Step 1: Clean rebuild every bundle**

Run:
```bash
for b in ReactRetail ReactWealth ReactCommercial ReactHeadless; do
  (cd force-app/main/default/uiBundles/$b && npm run build) || echo "FAIL $b";
done
```
Expected: each `✓ built`, no FAIL.

- [ ] **Step 2: Confirm new design shipped into dist (spot-check)**

Run: `grep -rl "Hanken Grotesk\|Fraunces" force-app/main/default/uiBundles/ReactRetail/dist | head`
Expected: at least one built CSS/JS asset references the new fonts — proves `dist/` reflects the redesign (guards against the known "src changed, dist stale" trap).

- [ ] **Step 3: Commit dist artifacts**

```bash
git add force-app/main/default/uiBundles/*/dist
git commit -m "build(design): rebuild dist/ for Cumulus Aurora redesign"
```

---

## Self-Review Notes

- **Spec coverage:** tokens+fonts (T1) · dual-mode bridge (T1 §2-3) · lucide/no-emoji (T2,T8) · StatTile fixes flat KPI (T5) · Panel/Meter/EntityRow/HeroBand/ScoreRing (T4,6,7) · eyebrows+tabular-nums (T3,5) · pink=AI (T8,T11) · gradient=action + semantic status (T5,6, HeroBand) · homes ×3 (T9,10) · Customer 360 ×3 (T11) · AppShell (T8) · dist rebuild trap (T13). All spec sections mapped.
- **Ring bug** from the mockup explicitly fixed in T4 (`inline-grid`, tested).
- **Test locus:** all `_shared` unit tests live under `ReactRetail/src/**` per the Global Constraint (no `_shared` harness).
- **Type consistency:** `IconKey` (T2) consumed by `EntityRow`/`AppShell`/`Icon` (T7,8); `ValueFormat` reused from existing `format.ts`; `NavItem.icon` widened string→`IconKey` in T8.
- **Verification realism:** pure-CSS/token changes verified by `build` + manual `dev` visual check (steps flagged "manual"); component logic (delta sign, meter fill kind, ring dashoffset, icon resolution, onClick) covered by Vitest.
