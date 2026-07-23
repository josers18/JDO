# Brand Theming System — Implementation Plan

**Date:** 2026-07-22
**Spec:** [2026-07-22-brand-theming-system-design.md](../specs/2026-07-22-brand-theming-system-design.md)
**Branch:** `feat/schedule-modal-native` (PR #25) — worktree `.worktrees/react-headless-agentforce`
**Deploy target:** `jdo-oe0sdd` (API v67 deploy / v62 graphql)

Paste a site URL → one Apex favicon callout returns the logo → client canvas-quantizes a suggested palette → user refines + names it → saved to an org-shared library → each user picks one **active** theme (persisted per Salesforce `UserId`) → `ThemeProvider` re-skins every React surface via `--wp-*` CSS vars.

## Locked contracts (from codebase scout)

- **Apex** `CommandCenterConfigRest` (`@RestResource urlMapping='/config/*'`): ONE `@HttpGet read()` + ONE `@HttpPost save()`. New endpoints branch inside them on `req.requestURI.endsWith('/suffix')` (mirror the `/models` branch). Helpers: `ensureResponse()`, `writeRaw(res,code,map)`, `writeError(res,code,msg)`, `loadSingleton()` / `loadOrNewSingleton()`, `sanitize()`, `clampDouble/Int()`. Singleton `Name='GLOBAL'`. **New fields MUST be added to `loadSingleton()`'s SELECT** or they hydrate null.
- **Apex test** `CommandCenterConfigRestTest`: hand-builds `RestContext` via `doGet(uri)` / `doPost(body)` helpers, calls static methods directly, asserts on `res.statusCode` + `JSON.deserializeUntyped(res.responseBody)`. No mock exists yet; raw-HTTP brand-logo gets a new `HttpCalloutMock`.
- **Client** `_shared/src/data/configClient.ts`: `createDataSDK()` from `@salesforce/platform-sdk`, `sdk.fetch.bind(sdk)`, all endpoints `/services/apexrest/config/*`, uniform `if (!res.ok) throw new Error(json?.error ?? ...)`, re-export block in `data/index.ts`.
- **Theme** `theme/ThemeProvider.tsx`: injects `--wp-accent`=accent, `--wp-accent-2`=`--wp-accent-soft`=accentSoft, `--wp-gradient`, `--wp-glow` via inline `style` on the wrapper div. `PersonaTheme` = `{key,label,tagline,accent,accentSoft,gradient,glow}`. No independent `accent2`.
- **ConfigPage** `components/config/ConfigPage.tsx`: sections are `<GlassCard title index={N}>` separated by `<div className="h-5"/>`; inputs from `../home/fields` (`Field`, `TextInput` — `type="color"` works, no dedicated picker). Save footer at bottom.
- **Logo sites:** `_shared/CommandRail.tsx` (~L118, hardcoded conic-gradient chip, takes no theme prop) and per-bundle `shell/AppShell.tsx` (~L76, `background: var(--wp-gradient)` chip).
- **Field template:** `objects/CommandCenterConfig__c/fields/Retail_Config__c.field-meta.xml` (LongTextArea, `<length>` + `<visibleLines>`). **RSS template:** `remoteSiteSettings/CommandCenter_OrgSelf.remoteSite-meta.xml`.

## Favicon service decision

**Google S2** — `https://www.google.com/s2/favicons?domain=<host>&sz=128`. Returns a 128px PNG (largest usable, no API key). RSS host: `https://www.google.com`. Documented in the RSS description.

## Data model

Two new LongTextArea fields on `CommandCenterConfig__c` (`Name='GLOBAL'`):
- `Theme_Library__c` (131072) — JSON array of `BrandTheme`.
- `Active_Themes__c` (32768) — JSON map `{ userId: themeId }`.

Both added to `loadSingleton()`'s SELECT.

```ts
interface BrandTheme {
  id: string; name: string; sourceUrl: string;
  logoBase64: string | null; logoContentType: string;
  accent: string; accentSoft: string; // #rrggbb — the ONLY color state persisted
}
```

**Design decision D1 — gradient/glow are DERIVED, never stored.** `buildGradient(accent)` / `buildGlow(accent)` compute the CSS at apply time, so `accent` is the single validated source of truth. This deliberately closes a CSS-injection surface: were `gradient`/`glow` stored as raw strings in the org-shared `Theme_Library__c`, they would reach `style={{'--wp-gradient': …}}` unsanitized (A4's `sanitizeTheme()` only hex-validates `#rrggbb`). Storing only hex-validated colors means nothing untrusted ever lands in a CSS var.

---

## Tasks (TDD, bite-sized)

### Layer A — Apex + metadata (independent; disjoint file set)

**A1. Fields** — create `Theme_Library__c.field-meta.xml` (length 131072, visibleLines 12) and `Active_Themes__c.field-meta.xml` (length 32768, visibleLines 6), cloning the Retail_Config template.

**A2. RemoteSiteSetting** — `remoteSiteSettings/CommandCenter_GoogleFavicon.remoteSite-meta.xml`, url `https://www.google.com`, description documenting the favicon-only purpose.

**A3. Apex test first (`CommandCenterConfigRestTest`)** — add:
- `brandLogoSuccess`: `Test.setMock(HttpCalloutMock.class, fake PNG bytes)`, `doGet('/services/apexrest/config/brand-logo?url=acmebank.com')` → 200, `logoBase64` non-null, `logoContentType` startsWith `image/`.
- `brandLogoFailureReturnsNull`: mock non-200 → 200 response with `logoBase64 == null` (never a 500).
- `themesUpsertReadDelete`: POST `/config/themes` op=upsert → GET `/config/themes` returns it → POST op=delete → gone.
- `themeSanitizeRejectsBadHex`: upsert with `accent:'#zzz'` → coerced to safe default.
- `activeThemePerUser`: POST `/config/active-theme {themeId}`, GET `/config/themes` returns `activeThemeId` for running user; assert map keyed by `UserInfo.getUserId()`.
- `activeThemeFallbackWhenDeleted`: active id points at deleted theme → GET returns `activeThemeId:null` (or id absent from library).
- Add `HttpCalloutMock` inner/standalone test class returning configurable status + body Blob + Content-Type header.

**A4. Apex impl (`CommandCenterConfigRest`)** — make A3 pass:
- Add `Theme_Library__c`, `Active_Themes__c` to `loadSingleton()` SELECT.
- `read()`: branch `/brand-logo` (normalize `?url=` to host, `Http.send` Google S2 with `!Test.isRunningTest()` NOT needed since mock intercepts; wrap in try/catch → `{logoBase64:null}` on any failure/non-200/oversize>32KB; base64 via `EncodingUtil.base64Encode(res.getBodyAsBlob())`). Branch `/themes` (return `{themes:[...], activeThemeId}` — resolve active for `UserInfo.getUserId()`, null if id not in library).
- `save()`: branch `/themes` (`{op:'upsert'|'delete', theme?, id?}`; `sanitizeTheme()` KEEPS ONLY the whitelisted fields `{id,name,sourceUrl,logoBase64,logoContentType,accent,accentSoft}` — any inbound `gradient`/`glow` is dropped (D1); hex-validates `accent`/`accentSoft` via regex `^#[0-9a-fA-F]{6}$`→default, caps `logoBase64` length ≤ 32000, caps library ≤ 50; upsert-by-id or delete-by-id; persist array JSON). Branch `/active-theme` (`{themeId}`; write per-user map keyed by `UserInfo.getUserId()`; persist).
- New helpers `loadThemes()`, `persistThemes(json)`, `loadActiveMap()`, `persistActiveMap(json)` mirroring `persist()`'s load-or-new + `upsert`.

### Layer B — client data + theme (independent of A; disjoint from C)

**B1. `theme/brandThemes.ts`** — `BrandTheme` type (colors = `accent`/`accentSoft` ONLY), `buildGradient(accent)` (`linear-gradient(135deg, accent, accentSoft)` style matching persona gradients), `buildGlow(accent)` (`radial-gradient(...)`), `brandThemeToVars(theme): CSSProperties` → the `--wp-*` set with `--wp-gradient`/`--wp-glow` computed via `buildGradient(theme.accent)`/`buildGlow(theme.accent)` (D1 — never read a stored gradient/glow), plus `resolveActiveTheme(themes, activeThemeId): BrandTheme | null` (null when id missing/absent → caller falls back to persona). **Vitest** `__tests__/brandThemes.test.ts`: mapping produces expected keys; both `--wp-accent-2` and `--wp-accent-soft` = accentSoft; `--wp-gradient` contains the accent; `resolveActiveTheme` returns null for an unknown id.

**B2. `theme/paletteExtract.ts`** — pure `extractPalette(pixels: Uint8ClampedArray): {accent; accentSoft}` via frequency-bucket quantization; ignore near-transparent (a<16), near-white (all>240), near-black (all<16); dominant → accent, second/lightened → accentSoft; empty → default `{'#14b8a6','#5eead4'}`. **Vitest**: solid-color array → that color; all-transparent → default; two-color → dominant.

**B3. `theme/activeBrand.ts`** — module-level `activeBrand` + `Set` listeners; `setBrandOverride`, `getBrandOverride`, `useBrandOverride()` via `useSyncExternalStore`. `BrandOverride = { accent: string; accentSoft: string; logoBase64: string | null }` (the applied subset — the two validated colors that feed `brandThemeToVars` plus the logo the chip reads; NOT the full `PersonaTheme`, since `logoBase64` isn't a persona field and gradient/glow are derived).

**B4. `theme/ThemeProvider.tsx` edit** — `const override = useBrandOverride();` then when `override` is set, override the accent tokens and RE-DERIVE the rest: `accent: override.accent, accentSoft: override.accentSoft, gradient: buildGradient(override.accent), glow: buildGlow(override.accent)` merged over `base` (the `PersonaTheme`); when absent, `theme = base` unchanged. The injected `style` block is already keyed off `theme.accent/.accentSoft/.gradient/.glow`, so no other edit is needed. One-file change (plus the `buildGradient`/`buildGlow` import from `./brandThemes`). Export new symbols from `theme/index.ts`.

**B5. `data/brandThemeClient.ts`** — `fetchBrandLogo(url)`, `listThemes()`, `saveTheme(theme)`, `deleteTheme(id)`, `setActiveTheme(id)` mirroring configClient's sdkFetch pattern. Re-export block in `data/index.ts`. **Vitest** `__tests__/brandThemeClient.test.ts`: mock `sdk.fetch`, assert URL/method/body + `!res.ok` throw path.

**B6. `theme/applyActiveTheme.ts`** (helper) — `applyActiveThemeOnLoad()`: `listThemes()` → if `activeThemeId` matches a library theme, `setBrandOverride(brandThemeToVars-source)`; on any failure, no-op (persona default stays). Called once from each app root's effect. **Vitest**: fallback when id missing → no override set.

### Layer C — UI (depends on B)

**C1. `components/config/BrandThemeSection.tsx`** — `<GlassCard title="Brand theme" index={index}>` with: URL `TextInput` + "Extract" `Button variant="ai"` (calls `fetchBrandLogo`, renders logo `<img>` from data-URL, runs `extractPalette` off a canvas, pre-fills pickers); two `TextInput type="color"` (accent, accentSoft) in a `Field`, with a live read-only gradient/glow swatch rendered via `buildGradient(accent)`/`buildGlow(accent)` so the user previews the derived look without storing it; name input; "Save theme" `Button variant="accent"` (`saveTheme`); saved-theme list with Apply (`setActiveTheme` + `setBrandOverride` for instant preview) / Delete (`deleteTheme`); active theme highlighted (`Pill tone="accent"`). Error banner when logo fetch returns null ("add manually or continue with colors only"). `useToast` for save/apply feedback.

**C2. `ConfigPage.tsx` mount** — after the last `<GlassCard>`, add `<div className="h-5"/>` then `<BrandThemeSection index={2} />`, before the save footer. Export `BrandThemeSection` from `components/index.ts`.

### Layer D — logo render (optional, depends on B)

**D1.** In per-bundle `shell/AppShell.tsx` brand chip: if `getBrandOverride()?.logoBase64` (thread via `useBrandOverride`), render `<img src={dataURL} className="... rounded-[9]">` instead of the gradient `<span>`; else unchanged. (CommandRail is lower priority — takes no theme prop; skip unless quick.) Keep "Cumulus" text; a brand `name` could replace it later (YAGNI for now).

### Layer E — integration + verify

**E1.** Wire `applyActiveThemeOnLoad()` into each app root effect (Retail/Wealth/Commercial/Headless-C360) where `ThemeProvider` wraps the tree — render persona default first, swap on resolve (flash-to-brand acceptable per spec).

**E2. Build** all 4 bundles (`npm run build` each) — dist/ is what deploys.

**E3. Deploy** Apex + fields + RSS + 4 dist/ to `jdo-oe0sdd`; capture `--json`, read status/numberComponentErrors.

**E4. Test gate:** run `CommandCenterConfigRestTest` live (all pass); run vitest across bundles (all pass).

**E5. Live verify:** ConfigPage → paste real brand URL → logo + suggested palette → save → set active → confirm `--wp-accent` + chip change across a cockpit and C360 → confirm a second user is unaffected (per-user isolation).

## Execution order

- **A ∥ B** in parallel (disjoint file sets, no shared barrels: A=classes+objects+rss; B=data/+theme/).
- **C** after B (imports B's exports).
- **D** after B (optional).
- **E** after A+C: integration wiring, build, deploy, verify.

## Constraints (from memory)

- UIBundle deploys `dist/` — rebuild before deploy ([[feedback-uibundle-dist-rebuild-trap]]).
- `_shared` source-only; new Tailwind classes covered by existing `@source '../../../_shared/src'` ([[feedback-tailwind-v4-shared-source-detection]]).
- Shared app-shell/config stays byte-identical across personas where shared.
- Exactly ONE RemoteSiteSetting (favicon host).
- CRM/config writes only via `/services/apexrest/*`.
- `clampDouble` goes through `String.valueOf` first ([[feedback-jdo-apex-decimal-double-trap]]).
