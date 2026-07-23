# Brand Theming System — Design

**Date:** 2026-07-22
**Status:** Approved (brainstorm) — ready for implementation plan
**Surface:** React UI bundles (Retail / Commercial / Wealth cockpits + C360), Config page
**Related:** [command-center-config-design](2026-07-14-command-center-config-design.md), [cumulus-aurora-design-language-redesign](2026-07-07-cumulus-aurora-design-language-redesign.md)

## Goal

Let a user paste a site URL in the Config page, auto-extract that brand's logo and a suggested color palette, refine it by hand, and save it as a **named theme**. Themes live in an org-shared library; each user picks one **active** theme that persists server-side (per Salesforce user) and re-skins every React surface — the three cockpits and the C360 page — so the whole app can be demoed "as Acme Bank."

## Why this is feasible

The codebase already has the two halves:

- **Config system** — `ConfigPage.tsx` + `CommandCenterConfigRest` Apex (`@RestResource urlMapping='/config/*'`), storing a JSON blob per center in a singleton `CommandCenterConfig__c`. A theme is just more JSON in that record.
- **Theme system** — `PERSONA_THEMES` (`accent`, `accentSoft`, `gradient`, `glow`) injected as `--wp-accent` / `--wp-gradient` / `--wp-glow` CSS custom properties by `ThemeProvider`. An extracted theme produces the same shape and rides the same vars.

**Hard platform constraint:** the bundle runs in the App Domain and can only `fetch()` `/services/apexrest/*` — it cannot fetch an arbitrary external URL from the browser (CSP/CORS), and Apex callouts require a Remote Site Setting per host (no wildcard). Therefore all external fetching is funneled through **one** Apex endpoint hitting **one** fixed favicon service (one Remote Site Setting). Color extraction happens client-side from the returned logo bytes, so no per-domain setup and no external color API.

## Decisions locked in brainstorming

| Question | Decision |
|---|---|
| Extraction source | **Favicon logo + editable auto-palette.** Apex fetches the favicon from one fixed icon service; client canvas-quantizes it into a *suggested* palette, pre-filled into editable color pickers. |
| Full brand palette concern | Extraction yields a **starting** palette only; the user always refines every color by hand before saving. Favicon is the logo source, not the authoritative color source. |
| Storage model | **Named theme library** — an org-shared array of themes in the config JSON blob. Build up a library over time; apply one later. |
| Active-theme persistence | **Server-side per user** — active `themeId` keyed by Salesforce `UserId`. Follows the user across tabs/refresh/devices; no collision when a different user logs in on the same machine. The library stays org-shared. |
| Override behavior | **Override accent + logo, keep structure.** Active theme replaces the accent vars, gradient, glow, and logo across all surfaces; each cockpit's dark/light structural palette and layout stay. Built-in personas are the fallback. |
| Logo storage | **Base64 data-URL in the theme JSON.** Self-contained, instant render, no CORS. Favicons are small (a few KB). |
| C360 surface | Part of the same React bundles (`src/personas/customer/full360*`), same App-Domain origin — "carries across surfaces" just means every surface reads the active theme on load. No cross-origin problem. |

## Architecture & data flow

```
Config page: user pastes "acmebank.com"
      │
      ▼
[1] GET /config/brand-logo?url=acmebank.com
      Apex → ONE fixed favicon service (one Remote Site Setting)
      → { logoBase64, contentType } | { logoBase64: null } on failure
      │
      ▼
[2] Client renders logo, canvas-quantizes → suggested { accent, accentSoft }
      pre-filled into color pickers
      │
      ▼
[3] User refines colors, names the theme, Save
      │
      ▼
[4] POST /config/themes  → append/update in org-shared library (JSON)
      │
      ▼
[5] User picks active theme → POST /config/active-theme { themeId } (keyed by UserId)
      │
      ▼
[6] Every surface reads active theme on load; ThemeProvider injects
      --wp-accent / --wp-accent-2 / --wp-accent-soft / --wp-gradient / --wp-glow
      + logo → brand look everywhere
```

**Two distinct pieces of state:**

- **Theme library** — org-shared: `[{ id, name, sourceUrl, logoBase64, accent, accentSoft, gradient, glow }]`.
- **Active selection** — per-user map `{ userId: themeId }`, so two demoers on the same org see different active brands.

## Data model

New fields on the existing `CommandCenterConfig__c` singleton (no new object):

- `Theme_Library__c` — LongTextArea (131072). JSON array of `BrandTheme`.
- `Active_Themes__c` — LongTextArea (32768). JSON map `{ userId: themeId }`.

`BrandTheme` (TypeScript + serialized JSON):

```ts
interface BrandTheme {
  id: string;            // client-generated stable id
  name: string;          // display name, e.g. "Acme Bank"
  sourceUrl: string;     // the URL it was extracted from
  logoBase64: string | null; // data-URL body (no prefix) or null
  logoContentType: string;   // e.g. "image/png"
  accent: string;        // #rrggbb
  accentSoft: string;    // #rrggbb
  gradient: string;      // CSS linear-gradient(...) built from accent
  glow: string;          // CSS radial-gradient(...) built from accent
}
```

## Components & files

### New Apex (extend `CommandCenterConfigRest`, URI-suffix dispatch like `/models`)

- `GET /config/brand-logo?url=<site>` — normalize the URL to a host, call the one fixed favicon service via a Remote Site Setting, return `{ logoBase64, contentType }`. Any failure (non-image, oversize, callout error) → `{ logoBase64: null }` (never a 500 that blocks the flow).
- `GET /config/themes` — return `{ themes: BrandTheme[], activeThemeId: string | null }` (active resolved for the running `UserId`).
- `POST /config/themes` — body `{ op: 'upsert' | 'delete', theme?, id? }`. Sanitize: hex-validate colors, cap `logoBase64` length, cap library count.
- `POST /config/active-theme` — body `{ themeId: string | null }`; write to the per-user map keyed by `UserInfo.getUserId()`.

Sanitization mirrors the existing `sanitize()` / `clampDouble()` allowlist discipline.

### New client (`_shared/src`)

- `data/brandThemeClient.ts` — `fetchBrandLogo(url)`, `listThemes()`, `saveTheme(theme)`, `deleteTheme(id)`, `setActiveTheme(id)`. Same apexrest-bridge pattern as `configClient.ts`.
- `theme/paletteExtract.ts` — pure `extractPalette(pixels: Uint8ClampedArray): { accent: string; accentSoft: string }` via frequency-bucket / median-cut quantization, ignoring near-transparent and near-white/near-black pixels. Unit-testable with fabricated arrays.
- `theme/brandThemes.ts` — `BrandTheme` type, `brandThemeToVars(theme): CSSProperties` mapping onto the `--wp-*` set, `buildGradient(accent)` / `buildGlow(accent)` helpers.
- `components/config/BrandThemeSection.tsx` — URL input → "Extract" → logo preview + auto-filled pickers → name + Save; plus the saved-theme library list (apply / delete).

### Modified

- `theme/ThemeProvider.tsx` — accept optional `brandOverride?: BrandTheme`; when present its vars win over `PERSONA_THEMES[persona]`. When absent, behavior is unchanged.
- App roots (`AppShell` / entry, ×4 personas incl. `ReactHeadless`) — read the active theme on mount (via `brandThemeClient`), pass it as `brandOverride`. Logo consumers read `theme.logoBase64`. **Load order:** render with the persona default first, then swap in the fetched brand override once it resolves (a brief flash to brand is acceptable; blocking initial paint on the config round-trip is not). The override applies purely through CSS vars, so the swap is a re-render, not a remount.
- `components/config/ConfigPage.tsx` — mount `<BrandThemeSection>` as a new `GlassCard`.

### New metadata

- One `RemoteSiteSetting` for the favicon service host (e.g. DuckDuckGo `icons.duckduckgo.com` or Google `www.google.com/s2/favicons`). Named-decision: pick the service that returns the largest usable icon without an API key; document the choice in the RSS description.

## Error handling

- Logo fetch fails / non-image / oversized → `{ logoBase64: null }`; UI shows "couldn't fetch logo — add manually or continue with colors only" and the theme can still be built from colors.
- Palette extraction fails (tiny/transparent/monochrome icon) → neutral default palette; pickers stay editable.
- Malformed hex on save → Apex sanitize coerces to a safe default (mirrors `clampDouble`).
- Active `themeId` references a deleted theme → fall back to the built-in persona theme; never a broken render.
- `sessionStorage`/`fetch` unavailable → active theme silently stays at persona default (matches existing `HomeView` degradation).

## Testing

**Apex (`CommandCenterConfigRestTest`):**
- brand-logo success + failure via `HttpCalloutMock` (image bytes → base64; non-200 → null).
- theme CRUD round-trip (upsert, update-in-place, delete).
- sanitize rejects bad hex and oversized base64; library count cap enforced.
- active-theme per-user isolation (user A's active ≠ user B's).
- deleted-theme active fallback.

**Vitest:**
- `extractPalette` on fabricated `ImageData` — solid color → that color; multi-color → dominant non-neutral; all-transparent → default.
- `brandThemeToVars` mapping produces the expected `--wp-*` keys.
- active-theme fallback logic when id is missing from the library.

**Live:**
- deploy; extract a real brand URL; save; set active; verify `--wp-accent` and the logo change across a cockpit and the C360 page; verify a second user is unaffected.

## Global constraints

- UIBundle deploys `dist/` — `npm run build` each of the 4 bundles before deploy or the feature ships invisibly.
- `_shared` is source-only, inlined via the `@shared` alias at build; classes used only in `_shared` need `@source` coverage (see Tailwind v4 note in project memory).
- Shared app-shell / config code stays byte-identical across the personas where it is shared; per-persona divergence only where it already exists.
- Exactly **one** Remote Site Setting, for the favicon host only. No arbitrary-domain callout.
- Deploy target: `jdo-oe0sdd`, API v67 (deploy) / v62 (graphql). Apex writes reach the bundle only through `/services/apexrest/*`.
- Feature branch continues on PR #25 (`feat/schedule-modal-native`) unless a new branch is requested.

## Out of scope (YAGNI)

- Fetching the actual site HTML / manifest for declared brand colors (arbitrary-domain callout; rejected in brainstorming).
- External brand/color APIs (rejected — external dependency + off-platform URL).
- Static Resource / ContentVersion logo hosting (base64 chosen; favicons are small).
- Full per-persona replacement or an additive 4th theme slot (override-accent-keep-structure chosen).
- Cross-origin propagation to non-React LWC surfaces (all current surfaces are the same-origin React bundles).
