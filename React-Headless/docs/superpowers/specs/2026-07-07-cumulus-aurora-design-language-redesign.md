# Cumulus Aurora — Design-Language Redesign of the React-Headless Cockpits

**Date:** 2026-07-07
**Status:** Design approved; ready for implementation plan
**Scope:** All three persona home pages (Retail / Wealth / Commercial), their embedded
Customer 360 pages, and the `_shared` primitive library — dual-mode (light default),
migrated to Tailwind utility classes.

---

## 1. Problem

The three persona home pages and the Customer 360 render as **flat white boxes**: KPI
tiles are a label + a big number with no hierarchy; "who to call" rows are text plus a
thin colored bar; the hero is a generic gradient; nav uses emoji icons. There is **zero
design signature** and no visual link to the polished JDO widget suite (Goals Cockpit,
Profile Widgets, Horizon).

Root causes:

1. **Mode-dependent depth.** `KpiTile`/`GlassCard` lean on translucency (`--wp-surface-glass`
   + `--wp-glow`) tuned for dark mode. In the light-default app the glass reads as white
   and the glow (`opacity: 0.5`) is invisible, collapsing every card to a plain rectangle.
2. **No design vocabulary.** No mono eyebrows, no `tabular-nums`, no accent rails, no icon
   chips, no drill-through affordances, no committed gradient discipline — none of the DNA
   that makes the LWC widgets feel designed.
3. **Generic tells.** Inter font, emoji icons, uniform white cards.

## 2. Goal

Fuse three proven vocabularies into **one dual-mode design language ("Cumulus Aurora")**
and apply it across the home pages, Customer 360, and shared primitives — so the React
apps feel cutting-edge and unmistakably part of the JDO family.

| Source | What we adopt |
|---|---|
| **VDP Studio** (`docs/DESIGN_LANGUAGE_LLM_ARTIFACT.md`) | Mono eyebrows (uppercase, wide-tracked, IBM Plex Mono); `tabular-nums` on every metric; committed two-tone gradient **for action only**; accent-top-border stat cards; drill-through `›` rows; hairline `border-line` + `shadow-card` → `shadow-pop` on hover; **pink `#ec4899` reserved for the AI entry point only**; teal/violet track accents; portal-to-body for fixed overlays; `print:` neutralizers on gradient surfaces |
| **Goals Cockpit / Profile Widgets** (LWC DNA) | Icon chips (rounded, accent-wash fill); timeline rails with node dots + connector lines; hover-lift (`-translate-y-0.5` + accent border + shadow); count badges; header radial-glow; avatar tiles + tier bars |
| **Aurora Glass** (current `_shared`) | Frosted-glass surfaces + subtle motion as the *signature* (additive, not the only depth cue); persona theming (retail teal / commercial copper / wealth gold); staggered fade-up entrances |

## 3. Decisions (locked)

1. **Direction:** cutting-edge designed feel drawn from the widget suite + VDP elements
   that make design sense. Not a verbatim VDP port and not a light touch — a fusion.
2. **Surface mood:** **dual-mode, light default.** Light "aurora command center" is
   primary; the dark-luxe variant stays working via `ThemeProvider mode="dark"`.
3. **Scope:** home pages **+ Customer 360** + shared primitives.
4. **Icons:** **lucide-react everywhere** (already a dependency). No emoji.
5. **Styling:** **migrate to Tailwind v4 utility classes** (project already runs
   `@tailwindcss/vite`; `clsx` + `tailwind-merge` already installed).

## 4. Non-negotiable rules (from VDP, adapted)

- **Depth is mode-independent.** Every card = hairline border + `shadow-card` + optional
  3px accent-top-bar, and lifts on hover. Glass blur is additive flavor, never the sole
  depth cue. This is the specific fix for the flat-white-box bug.
- **Gradient carries action only** — hero band, primary CTAs, active nav. Never on small
  chips; never as a status color.
- **Status is semantic** — green = ok/ready, amber = attention, red = risk. Kept visually
  distinct from the persona gradient.
- **Pink = AI only** — the Ask-AI pill + Assistant FAB. Nothing else uses pink.
- **Mono eyebrows + `tabular-nums`** — uppercase wide-tracked micro-labels above sections;
  tabular numerals on every metric.
- **Fixed overlays portal to `document.body`** (a `backdrop-blur` ancestor traps
  `position: fixed` children — the glass nav would otherwise break the FAB/drawer).
- **`print:` neutralize** any gradient surface (hero → white with dark text).

## 5. Token architecture

Anchor point: `src/styles/global.css` already opens with `@import 'tailwindcss'` and a
`@theme inline` block (shadcn tokens). `--wp-*` persona/mode vars are injected **at
runtime** by `ThemeProvider` (not statically imported), and must keep doing so.

Plan:

1. **Extend the `@theme` block** with the VDP-derived scale so Tailwind auto-generates the
   utilities: brand ramp (`brand-50…900`), `ink-*`, semantic (`success/warning/danger`
   `-50/-600/-700`), track accents (`track-d360-*`, `track-agentforce-*`), `line` /
   `line-strong`, radii (`sm…2xl`), shadows (`card` / `pop` / `hero`), and the gradient
   helper classes (`.bg-gradient-brand`, `.text-gradient-accent`, `.bg-surface-glass`).
2. **Bridge persona tokens.** Map the brand/accent tokens to the runtime `--wp-*` vars
   (e.g. `--color-brand-600: var(--wp-accent)`, `--gradient-brand: var(--wp-gradient)`),
   so `ThemeProvider persona=… mode=…` still swaps persona accent + light/dark live while
   components reference clean utilities.
3. **Typography.** Load **Plus Jakarta Sans** (UI) + **IBM Plex Mono** (eyebrows, metrics,
   meta chips) and set `--font-sans` / `--font-mono`. Replaces Inter — the single biggest
   "designed" upgrade. (Prefer `@fontsource` packages for offline/CI determinism; Google
   `@import` acceptable fallback.)
4. **Dark mode.** The dark-luxe values (deep ink shell, glass-that-reads-as-glass, glowing
   rails) live in the `[data-mode='dark']` token set; utilities reference bridged tokens so
   both modes work with **no per-component branching**.

## 6. Signature components (`_shared/src`, rebuilt in Tailwind)

Highest leverage: `_shared` is Vite-inlined into all three bundles via `@shared`, so
rebuilding these primitives once propagates everywhere.

- **`StatTile`** (replaces flat `KpiTile`) — 3px persona-accent top-bar; mono eyebrow;
  big `tabular-nums` count-up value; semantic delta chip (▲/▼); optional sparkline;
  hover-lift. *This is the core fix for the flat KPI boxes.*
- **`Panel`** (replaces `GlassCard`) — hairline border + `shadow-card`; mono-uppercase
  header with optional count badge + action slot; additive glass blur; left-accent-rail
  variant for secondary panels.
- **`EntityRow`** — who-to-call / life-event / lead row: leading **icon chip or avatar**
  (accent-wash fill); name + segment pill; reason line; drill-through `›`; right-side
  **score ring** (small gauge) replacing bare red text.
- **`Meter` / `ProgressBar`** — semantic fill (green ≥100% · brand ≥50% · amber below);
  mono readout right-aligned. Matches Goals Cockpit.
- **`Eyebrow`**, **`Pill`** (status / track / segment tonal pairs), **`MetaChip`**
  (mono, ring border) — small primitives used throughout.
- **`HeroBand`** — AI daily brief: mono eyebrow, committed persona gradient, radial-glow
  overlay, `print:` neutralizer, lucide sparkle icon.
- **`AskAIPill` / `AssistantFAB`** — pink; portalled to `document.body`.
- **`iconMap`** — maps semantic string keys (call/meeting/task/event, life-event kinds,
  nav ids) to lucide components, so data files stay string-keyed and emoji-free.

Existing charts (`Sparkline`, `Gauge`, `HealthRing`, `DonutChart`, `Timeline`, etc.) are
retained and restyled to reference the new tokens.

## 7. Page compositions

- **Home (all 3 personas, same structure, persona-themed):** `HeroBand` → 5-up `StatTile`
  strip → split: "Who to call" (`EntityRow` list w/ score rings) + Schedule (timeline
  rail w/ lucide icons) & Goals (`Meter`s) → Life-events grid (icon-chip cards) →
  Pipeline table + Alerts (semantic dots) + Leads.
- **Customer 360:** keep the 3-column layout; restyle identity rail (avatar tile + tier
  bar, from Profile Widget); highlight strip → `StatTile`s; tab bar → underline-active
  with persona accent; context sidebar → `Panel`; `AgentforceSummaryCard` with pink AI
  framing.
- **AppShell:** lucide nav icons (no emoji); glass sticky top bar; active nav =
  `bg-brand-50 text-brand-700` (persona-tinted).

## 8. Motion (from VDP motion table)

Card hover lift (`transition hover:shadow-pop hover:-translate-y-0.5`); arrow nudge
(`group-hover:translate-x-0.5`); drawer slide (`transition-transform duration-300 ease-out`);
backdrop fade; staggered fade-up entrance (`wp-fade-up`, `index * 0.06s`); focus-within
ring (`focus-within:ring-2 focus-within:ring-brand-500/30`). Subtle, physical, never bouncy
on brand surfaces.

## 9. Build sequence

1. Tokens + fonts in `global.css` (extend `@theme`, bridge `--wp-*`, load Jakarta + Plex
   Mono). Verify `ThemeProvider` still swaps persona/mode.
2. Rebuild `_shared` primitives (`StatTile`, `Panel`, `EntityRow`, `Meter`, `Eyebrow`,
   `Pill`, `MetaChip`, `HeroBand`, `AskAIPill`/`FAB`, `iconMap`); restyle retained charts.
3. Compose **Retail** home + Customer 360 as the reference implementation.
4. Apply to **Wealth** and **Commercial** (structure identical; persona theme differs).
5. Restyle `AppShell` (lucide nav, glass top bar).

## 10. Testing & deploy

- Per bundle: `npm run build` (`tsc -b && vite build`) and `npm run test -- run` green.
- Visual check via `npm run dev` in both light and dark modes, all three personas.
- Accessibility: focus-visible rings, `aria-hidden` on decorative glyphs, color-contrast
  on semantic pills in both modes.
- **Deploy trap:** the UIBundle deploys `dist/`, not `src/`. **Rebuild `dist/` and commit
  it** before deploy, or the redesign ships invisibly (documented prior incident).

## 11. Out of scope / YAGNI

- No new data sources, GraphQL operations, or Apex changes — visual layer only.
- No new routes or navigation targets beyond restyling the existing nav.
- No net-new chart types; restyle existing ones only.
