# VDP Studio Design Language — Build Instructions for an LLM

> **How to use this file:** Paste it into a Claude/LLM session as context, then ask the
> model to build UI. It will produce interfaces in the **VDP Studio** design language —
> a light, cool, function-forward system for operational SaaS dashboards. Every hex,
> gradient, and class string below is a **production value**. Copy them verbatim; do not
> paraphrase, round, or "improve" them.

You are building UI in the **VDP Studio** design language. Follow these rules exactly.
When a value is given, use that value — not a near-equivalent.

**Stack assumption:** Tailwind CSS v4 (the `@theme` directive; no `tailwind.config.js`) +
Next.js `next/font`. If the target uses a different framework, still honor every token,
class intent, and rule — emit the equivalent CSS custom properties and utilities.

---

## 0. Non-negotiable rules (read first)

**Always:**
- Reserve the **brand gradient for action only** — logo, hero bands, primary CTAs, active
  accents. It carries *action*, never *status*.
- End the brand gradient in the **bluer Salesforce tone `#0d8fe0`** — that bluer finish is
  the brand signature.
- Use **semantic ok/warn/risk** colors for health/readiness, kept visually separate from
  the brand gradient. Green = ready, amber = attention, red = risk. Always.
- Keep **pink `#ec4899` for the AI entry point only** (Ask-AI pill + floating FAB). Nothing
  else may use pink.
- Use **mono eyebrows** (uppercase, wide-tracked, IBM Plex Mono) above sections/headings,
  and **`tabular-nums`** for every metric.
- Use **hairline `border-line` + `shadow-card`** for resting cards; lift to `shadow-pop`
  on hover.
- **Portal fixed overlays to `document.body`**, and add explicit `print:` neutralizers on
  any gradient surface.

**Never:**
- ❌ A **rainbow** gradient anywhere. The brand ramp is a committed two-tone indigo→blue.
- ❌ The **brand gradient on small chips/pills** or as a status color. Pills are flat tonal
  pairs; status is semantic.
- ❌ **Pink** for general controls, or pink folded into the gradient.
- ❌ **Inter / Roboto / system** fonts for UI. Plus Jakarta Sans is the voice; Plex Mono is
  for data/labels.
- ❌ **Warm / cream** backgrounds. Surfaces stay cool near-white.
- ❌ A `position: fixed` overlay nested under a **`backdrop-blur` ancestor** (e.g. the glass
  nav). A `backdrop-filter` ancestor becomes the containing block and traps the fixed child.
  Portal to `<body>` instead.
- ❌ Letting the gradient hero print as-is. The custom `.bg-gradient-brand` class beats
  `print:bg-none`, so neutralize it to white explicitly in `@media print`.

---

## 1. Philosophy (the intent behind the rules)

VDP Studio is a **single, light, function-forward** system built to *operate, not just
report* — every surface leans toward action (drill-through cards, slide-out assistant,
gradient CTAs) rather than passive display.

1. **Light and cool, never cream.** Surfaces are cool near-whites (`#fbfcff`, `#ffffff`,
   `#fafbff`) over a faint indigo/blue aurora backdrop.
2. **Vibrant, but committed.** Energy comes from *one* two-tone gradient — indigo →
   Salesforce blue — never a rainbow. The gradient carries action.
3. **Pink is a standalone accent.** One hot pink (`#ec4899`) marks the AI entry point and
   nothing else. Pink is never part of the brand gradient.
4. **Honest health signals.** Semantic ok/warn/risk carry readiness meaning, kept distinct
   from the brand gradient.
5. **Function over decoration.** Distinctive type (Plus Jakarta Sans, not Inter), monospaced
   data (IBM Plex Mono), subtle motion (small lifts), hairline-thin chrome.
6. **Two domain accents.** When the product spans two tracks, each gets a reserved tint:
   teal-cyan (D360 / data) and violet (Agentforce / AI). These never bleed into brand/status.

---

## 2. The `@theme` block — emit this first

This is the machine-readable core of the system. Paste it into the global stylesheet after
`@import "tailwindcss";`. Adding a token here is the only step to make a color/radius/shadow
available app-wide (Tailwind v4 generates the utilities automatically). If you generate any
UI, **emit this block (or the tokens it implies) before the markup.**

```css
@import "tailwindcss";

@theme {
  /* Brand — VDP Studio indigo (→ Salesforce blue in gradients). */
  --color-brand-50: #ecebff;
  --color-brand-100: #dedcff;
  --color-brand-200: #c7c3ff;
  --color-brand-300: #a9a3ff;
  --color-brand-400: #8b86fa;
  --color-brand-500: #6f6bf5;
  --color-brand-600: #5b5bf6;
  --color-brand-700: #4a44e8;
  --color-brand-800: #3a36c4;
  --color-brand-900: #2f2ba0;

  /* Neutral (text + bg) */
  --color-ink-50: #f9fafb;
  --color-ink-100: #f3f4f6;
  --color-ink-200: #e5e7eb;
  --color-ink-300: #d1d5db;
  --color-ink-400: #9ca3af;
  --color-ink-500: #6b7280;
  --color-ink-600: #4b5563;
  --color-ink-700: #374151;
  --color-ink-800: #1f2937;
  --color-ink-900: #111827;

  /* Semantic shorthands — cool near-white surfaces, no cream. */
  --color-bg: #fbfcff;
  --color-surface: #ffffff;
  --color-surface-muted: #fafbff;
  --color-surface-glass: rgba(251, 252, 255, 0.8);
  --color-fg: #14152a;
  --color-muted: #565976;   /* secondary text */
  --color-faint: #8a8da8;   /* lightest readable text (placeholders/hints) */
  --color-line: #ebedf6;
  --color-line-strong: #d3d6e6;
  --color-accent: #5b5bf6;

  /* Status — semantic (carry readiness meaning; the gradient carries action). */
  --color-success-50: #e3f7ef;
  --color-success-600: #0ea571;
  --color-success-700: #0c8f63;
  --color-warning-50: #fdf0dd;
  --color-warning-600: #d97706;
  --color-warning-700: #b5740a;
  --color-danger-50: #fde8ec;
  --color-danger-600: #e23b54;
  --color-danger-700: #c43b3b;

  /* Track accents — D360 = teal-cyan, Agentforce = violet. */
  --color-track-d360-bg: #def6f8;
  --color-track-d360-fg: #0ea5b5;
  --color-track-agentforce-bg: #f0e9fe;
  --color-track-agentforce-fg: #8b5cf6;

  /* Brand gradient: indigo → Salesforce blue. Two-tone, NOT rainbow. Pink is a
     standalone accent only (see --color-accent-pink), never in the gradient. */
  --gradient-brand:  linear-gradient(105deg, #5b5bf6 0%, #2f6ef0 55%, #0d8fe0 100%);
  --gradient-hero:   linear-gradient(105deg, #5b5bf6 0%, #2f6ef0 55%, #0d8fe0 100%);
  --gradient-accent: linear-gradient(105deg, #5b5bf6 0%, #2f6ef0 55%, #0d8fe0 100%);
  --color-accent-pink: #ec4899;
  --color-accent-pink-soft: #fde7f3;

  /* Backdrop — subtle indigo/blue depth on near-white. */
  --app-backdrop:
    radial-gradient(820px 380px at 100% -12%, rgba(147,51,234,0.07), transparent 62%),
    radial-gradient(720px 360px at -6% -6%, rgba(91,91,246,0.07), transparent 58%),
    #fbfcff;

  /* Typography — Plus Jakarta Sans (UI) + IBM Plex Mono (data). */
  --font-sans: var(--font-jakarta), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-plex-mono), ui-monospace, monospace;

  --radius-sm: 0.5rem;
  --radius-md: 0.625rem;
  --radius-lg: 0.75rem;
  --radius-xl: 0.875rem;
  --radius-2xl: 1rem;

  /* Shadows — soft indigo-tinted depth. */
  --shadow-card: 0 1px 2px rgb(20 21 42 / 0.04), 0 14px 30px -22px rgb(40 30 120 / 0.30);
  --shadow-pop:  0 24px 50px -24px rgb(40 30 120 / 0.34);
  --shadow-hero: 0 24px 60px -20px rgb(47 110 240 / 0.45);
}
```

### Base layer + gradient helper classes (emit alongside the theme)

```css
@layer base {
  html, body {
    padding: 0; margin: 0;
    font-family: var(--font-sans);
    color: var(--color-fg);
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  body {
    background: var(--app-backdrop);
    background-attachment: fixed;
    min-height: 100vh;
  }
  a { color: var(--color-accent); }
  a:hover { text-decoration: underline; }
}

.bg-gradient-brand { background: var(--gradient-brand); }   /* logo + nav glyphs */
.bg-gradient-hero  { background: var(--gradient-hero); }    /* welcome/exec hero */

.text-gradient-accent {
  background: var(--gradient-accent);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}

.bg-surface-glass {                                          /* sticky nav/toolbars */
  background: var(--color-surface-glass);
  backdrop-filter: saturate(180%) blur(14px);
  -webkit-backdrop-filter: saturate(180%) blur(14px);
}
```

### Print neutralization (required on any gradient hero)

```css
@media print {
  body { background: #ffffff !important; }
  header, footer { display: none !important; }
  [data-print-hide] { display: none !important; }
  main { max-width: none !important; padding: 0 !important; margin: 0 !important; }
  #report section, #report article, #report header { break-inside: avoid; }
  #report .bg-gradient-brand {
    background: #ffffff !important;
    color: var(--color-fg) !important;
    padding: 0 0 1rem !important;
    border-bottom: 1px solid var(--color-line) !important;
  }
  #report .shadow-card, #report .shadow-lg, #report .shadow-pop { box-shadow: none !important; }
}
```
Hero child text carries `print:` dark classes (eyebrow flips `text-white/85`→`print:text-muted`,
body `text-white/90`→`print:text-ink-700`) so it reads once the band turns white.

---

## 3. Token reference (roles — use to pick the right token)

**Brand (indigo→SF blue).** `brand-50` active-nav bg / hover wash · `brand-300` hover
border on cards · `brand-500` list markers, focus ring, gradient-start anchor · `brand-600`
primary brand / `--color-accent` / default links · `brand-700` active-nav text, labels,
link text · `brand-900` deepest brand text on light.

**Ink / neutrals.** `ink-100` hover bg, meter track, inline-code bg · `ink-300` idle arrows,
thinking dots · `ink-400` placeholder text · `ink-500` tertiary text, chevrons · `ink-600`
neutral badge text · `ink-700` body text in lists/prose · `ink-900` strongest headings,
logo wordmark, bold lead-ins.

**Surfaces & lines.** `bg #fbfcff` app base · `surface #ffffff` card/panel/drawer ·
`surface-muted #fafbff` card header bands, composer footer · `surface-glass` sticky-nav glass
(with `backdrop-blur`) · `fg #14152a` primary text · `muted #565976` secondary text ·
`faint #8a8da8` lightest readable (eyebrows, hints) · `line #ebedf6` hairline borders ·
`line-strong #d3d6e6` emphasized dividers.

**Semantic.** Badges use **`-50` bg + `-600` text**; meters use **`-600` bar + `-700` text**.
`success` = ready/ok · `warning` = draft/attention · `danger` = risk/error.

**Track accents (reserved).** `track-d360-*` teal-cyan (Data 360 / data) ·
`track-agentforce-*` violet (Agentforce / AI). Never reuse for brand/status.

**Pink.** `accent-pink #ec4899` AI entry point only · `accent-pink-soft #fde7f3` rare soft wash.

**Radii.** `lg 0.75rem` nav links, drawer glyph · `xl 0.875rem` composer, sub-cards ·
`2xl 1rem` cards/panels/hero. **Shadows.** `card` resting · `pop` hover/dropdown/drawer ·
`hero` hero-band glow.

---

## 4. Typography

Two fonts, loaded via `next/font/google` and exposed as CSS variables.

| Font | CSS var | Role |
|---|---|---|
| **Plus Jakarta Sans** | `--font-jakarta` → `--font-sans` | All UI, body, headings |
| **IBM Plex Mono** | `--font-plex-mono` → `--font-mono` | Data, tabular numerals, eyebrow labels, meta chips, pills |

```tsx
// app/layout.tsx
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from 'next/font/google';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'], weight: ['400','500','600','700','800'],
  variable: '--font-jakarta', display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'], weight: ['400','500','600'],
  variable: '--font-plex-mono', display: 'swap',
});
// On <html>:  className={`${jakarta.variable} ${plexMono.variable}`}
```

**Weight scale:** 400 body · 500 medium (badges) · 600 semibold (nav links, labels) ·
700 bold (card titles, sub-headings) · 800 extrabold (big numbers, page/hero titles, logo).

**The eyebrow (signature element)** — mono, uppercase, wide-tracked micro-label above a
heading or section:

```html
<!-- faint stat-card eyebrow -->
<div class="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">Total VDPs</div>
<!-- brand-tinted section eyebrow (wider tracking) -->
<div class="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-600">Executive summary</div>
<!-- hero eyebrow over the gradient band (white, widest tracking) -->
<span class="font-mono text-[11px] uppercase tracking-[0.18em] text-white/85">Value Delivery Plan · FY27 · Strategic</span>
```

Metrics always use `tabular-nums`:
```html
<div class="text-4xl font-extrabold tabular-nums leading-none tracking-tight text-fg">142</div>
```

---

## 5. Component patterns (use these class strings verbatim)

### Card / section shell (foundation)
```html
<div class="rounded-2xl border border-line bg-surface p-5 shadow-card">…</div>
<!-- left accent border variant (sidebar/secondary cards) -->
<div class="rounded-2xl border border-line bg-surface p-5 shadow-card
            [border-left:3px_solid_var(--color-track-agentforce-fg)]">…</div>
```

### Accent-top-border stat card
3px top-bar + mono eyebrow + big tabular number + sub-line + optional drill-through `→`.
Accent map: indigo→`bg-gradient-brand`, af→`bg-track-agentforce-fg`, d360→`bg-track-d360-fg`,
pink→`bg-accent-pink`, warn→`bg-warning-600`, risk→`bg-danger-600`, ok→`bg-success-600`.
```html
<a href="/…" class="group relative block overflow-hidden rounded-2xl border border-line bg-surface p-5
          shadow-card no-underline transition hover:no-underline hover:shadow-pop">
  <span aria-hidden class="absolute inset-x-0 top-0 h-[3px] bg-gradient-brand opacity-90"></span>
  <div class="flex items-start justify-between gap-2">
    <div class="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">Total VDPs</div>
    <span aria-hidden class="text-sm leading-none text-muted transition group-hover:translate-x-0.5 group-hover:text-brand-700">→</span>
  </div>
  <div class="mt-2.5 text-4xl font-extrabold tabular-nums leading-none tracking-tight text-fg">142</div>
  <div class="mt-2 text-xs text-muted">across 38 companies</div>
</a>
<!-- 4-up strip wrapper -->
<section class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">…</section>
```

### Gradient hero header band
```html
<div class="overflow-hidden rounded-2xl border border-line shadow-card
            print:rounded-none print:border-0 print:shadow-none">
  <div class="bg-gradient-brand px-7 py-7 text-white print:bg-none print:px-0 print:text-fg">
    <div class="flex items-center gap-2.5">
      <span class="font-mono text-[11px] uppercase tracking-[0.18em] text-white/85 print:text-muted">
        Value Delivery Plan · FY27 · Strategic
      </span>
    </div>
    <h1 class="m-0 mt-2.5 text-3xl font-extrabold tracking-tight">Acme Corp</h1>
    <p class="mt-3 max-w-[60ch] text-sm leading-relaxed text-white/90 print:text-ink-700">…</p>
  </div>
  <div class="space-y-7 bg-surface px-7 py-7 print:px-0">…</div>
</div>
```

### Pills (status / track / segment)
Status = `-50` bg + `-600` text; tracks = reserved track tints; segments = tonal pairs.
```html
<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-warning-50 text-warning-600">Draft</span>
<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-brand-50 text-brand-600">In review</span>
<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-success-50 text-success-600">Delivered</span>
<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-ink-100 text-ink-600">Unknown</span>
<!-- track pills -->
<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-track-d360-bg text-track-d360-fg">Data 360 · 4</span>
<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-track-agentforce-bg text-track-agentforce-fg">Agentforce · 2</span>
<!-- segment (tonal; neutral fallback for admin slugs) -->
<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-violet-100 text-violet-700">Strategic</span>
<!-- enterprise→bg-blue-100/text-blue-700 · commercial→bg-emerald-100/text-emerald-700 · fallback→bg-ink-100/text-ink-700 · unsegmented→bg-ink-50/text-ink-500 -->
```
Sizing: `sm` = `px-2 py-0.5 text-[11px]` (row metadata) · `md` = `px-2.5 py-0.5 text-xs` (headers/cards).

Meta chip (mono, ring border):
```html
<span class="rounded-md bg-surface px-2 py-0.5 font-mono text-[11px] font-medium text-muted ring-1 ring-line">Priority: P1</span>
```

### Drill-through link row (`›` affordance)
```html
<a href="/…" class="group flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2
          no-underline shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50/40">
  <span class="min-w-0 flex-1">
    <span class="block truncate text-sm font-semibold text-ink-900">Label</span>
    <span class="block truncate text-[11px] text-muted">detail</span>
  </span>
  <span aria-hidden class="shrink-0 text-ink-300 transition-colors group-hover:text-brand-600">›</span>
</a>
```

### Meter / progress bar
Track `bg-ink-100`; fill by readiness (`bg-success-600` ≥100% · `bg-brand-600` ≥50% · `bg-warning-600` below); mono readout right.
```html
<div class="flex items-center gap-3">
  <span class="w-32 shrink-0 text-xs text-muted">Sections</span>
  <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
    <div class="h-full rounded-full bg-brand-600" style="width: 75%"></div>
  </div>
  <span class="w-12 text-right font-mono text-[11px] font-semibold text-brand-600">3/4</span>
</div>
```

### Buttons
```html
<!-- Primary: gradient CTA -->
<button class="inline-flex items-center rounded-lg bg-gradient-brand px-4 py-2 text-sm font-bold text-white shadow-lg">Sign up</button>
<!-- Ghost / neutral -->
<button class="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100">Sign in</button>
<!-- AI accent pill (pink — the ONLY pink control) -->
<button class="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent-pink px-3 text-white shadow-sm transition hover:brightness-105">Ask AI</button>
<!-- Icon submit (small, gradient) -->
<button class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand text-white shadow-lg transition-opacity disabled:opacity-40">…</button>
```

### Right-side slide-out drawer
Portal to `document.body`. Body scroll locked while open; Escape + backdrop-click close.
```html
<div class="fixed inset-0 z-[60] bg-ink-900/30 backdrop-blur-[2px] transition-opacity duration-200 opacity-100"></div>
<aside role="dialog" aria-modal="true"
       class="fixed right-0 top-0 z-[61] flex h-screen w-full flex-col bg-surface shadow-pop
              transition-transform duration-300 ease-out sm:w-[min(620px,30vw)] sm:min-w-[480px] translate-x-0">
  <div class="flex items-center gap-3 border-b border-line px-5 py-4">…header…</div>
  <div class="flex-1 overflow-y-auto px-4 py-4">…body…</div>
  <form class="border-t border-line bg-surface-muted/40 px-4 py-3">…composer…</form>
</aside>
<!-- composer input group (focus ring = brand-500) -->
<div class="flex items-end gap-2 rounded-xl border border-line bg-surface px-3 py-2 shadow-card
            focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/30">…</div>
<!-- floating launcher FAB (pink, bottom-right) -->
<button class="fixed bottom-6 right-6 z-[55] inline-flex h-14 w-14 items-center justify-center rounded-full
               bg-accent-pink text-white shadow-pop ring-4 ring-accent-pink/20 transition hover:scale-105 hover:brightness-105 print:hidden">…</button>
```

### Sticky top nav (glass) + links + avatar
```html
<header class="sticky top-0 z-40 h-16 border-b border-line bg-surface-glass backdrop-blur-xl">
  <div class="mx-auto flex h-full max-w-7xl items-center gap-7 px-4 sm:px-6">
    <span class="inline-grid h-[27px] w-[27px] place-items-center rounded-lg bg-gradient-brand
                 font-mono text-[10px] font-semibold text-white shadow-lg">VDP</span>
    <span class="text-base font-extrabold tracking-tight text-ink-900">VDP&nbsp;Studio</span>
    <!-- … nav … -->
  </div>
</header>
```
Nav link — base `inline-flex items-center px-3 py-2 rounded-lg text-[13.5px] font-semibold transition-colors` ·
active `bg-brand-50 text-brand-700` · inactive `text-muted hover:bg-ink-100/50 hover:text-ink-900`.

Avatar pill + dropdown:
```html
<button class="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-1.5 py-1 text-sm hover:bg-ink-100 transition-colors">
  <span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-brand font-mono text-[11px] font-semibold text-white">JS</span>
</button>
<div role="menu" class="absolute right-0 mt-2 w-64 rounded-lg border border-line bg-surface shadow-pop z-50 overflow-hidden">…</div>
```

### Favicon / external icon
```html
<img src="https://www.google.com/s2/favicons?sz=64&domain=acme.com" width="16" height="16"
     loading="lazy" decoding="async" class="inline-block shrink-0 rounded border border-line bg-surface" />
```

### AI prose (rendered markdown, trusted server-side LLM output)
```text
text-[15px] leading-7 text-ink-700
[&_h2]:mt-5 [&_h2]:mb-1.5 [&_h2]:text-base [&_h2]:font-extrabold [&_h2]:tracking-tight [&_h2]:text-fg
[&_p]:my-2.5 [&_strong]:font-bold [&_strong]:text-ink-900
[&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5
[&_li]:marker:text-brand-500 [&_li_strong]:text-ink-900
```

---

## 6. Layout conventions

- **Page shell:** `<div class="mx-auto max-w-7xl px-4 sm:px-6">…</div>`
- **Sticky chrome:** top nav is `h-16` (64px), `z-40`.
- **Section rhythm:** `space-y-5`/`space-y-6`/`space-y-7` between major blocks; `gap-3.5`
  between stat tiles; `mt-2.5` between an eyebrow and its content.
- **Report + sidebar grid:** `grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px] print:block`
  (weighted variant: `lg:grid-cols-[1.5fr_1fr]`).
- **Stat strips:** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`. **Inner lists:** `grid-cols-1 sm:grid-cols-2`.
- **Responsive stacking:** start single-column, expand at `sm:`/`lg:`. Always put `min-w-0`
  (or `minmax(0,1fr)`) on flex/grid children holding truncating text.

---

## 7. Motion

Subtle and physical — small lifts, short durations, never bouncy on brand surfaces.

| Pattern | Classes |
|---|---|
| Card hover lift | `transition hover:shadow-pop` (often `hover:-translate-y-0.5`) |
| Arrow nudge | `transition group-hover:translate-x-0.5 group-hover:text-brand-700` |
| Drawer slide | `transition-transform duration-300 ease-out` + `translate-x-0`/`translate-x-full` |
| Backdrop fade | `transition-opacity duration-200` + `opacity-100`/`opacity-0` |
| Nav / color hovers | `transition-colors` |
| FAB | `transition hover:scale-105 hover:brightness-105` |
| Accent-pill hover | `transition hover:brightness-105` |
| Focus-within ring | `focus-within:ring-2 focus-within:ring-brand-500/30` |
| Loading dots | `animate-bounce` + staggered `[animation-delay:-0.3s/-0.15s]` |
| Listening pulse | `animate-ping` |

---

*Source of truth: `docs/design-system/VDP-STUDIO-DESIGN-SYSTEM.md` in the `vdp-app` repo.
This artifact restates that system as build instructions; if the two disagree, the source
doc (extracted from production `app/globals.css` + `app/layout.tsx`) wins.*
