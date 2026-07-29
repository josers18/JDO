# Changelog

All notable changes to **React-Headless** — the Salesforce DX project that ships the three-persona React banking cockpit suite (Retail / Wealth / Commercial) on the Salesforce Multi-Framework UI Bundle feature, plus the `_shared` design + data library and the Apex REST bridges (`DcBridgeRest`, `DcPromptRest`, `AiGenerateRest`, `CrmWriteRest`, `CommandCenterConfigRest`).

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are grouped by date since the project is delivered as rolling demo metadata rather than a released library. Newest entries appear first.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![API v67.0](https://img.shields.io/badge/API-v67.0-1589F0?style=for-the-badge)](sfdx-project.json)
[![Updated](https://img.shields.io/badge/Updated-Jul_29_2026-2EA44F?style=for-the-badge)](https://github.com/josers18/JDO/commits/main)
[![Monorepo CHANGELOG](https://img.shields.io/badge/Monorepo-CHANGELOG-181717?style=for-the-badge&logo=github&logoColor=white)](../CHANGELOG.md)

</div>

---

## [July 2026]

> Entries below from 2026-07-21 onward landed on branch `feat/overall-brand-theme` (PR #33) and deploy to org `jdo-oe0sdd` (and `jdo-0pz8au`, the same org); they are not yet merged to `main`.

### 2026-07-29 — Apple SF Pro typography + dead-webfont cleanup

Reworked app typography to a sans-serif, apple.com-style system stack across all four bundles. Built + deployed to `jdo-0pz8au` (496 components, 0 errors).

#### Changed

- **Switched typography to the Apple SF Pro system stack** for both body and headings — `-apple-system, BlinkMacSystemFont, 'SF Pro Text'/'SF Pro Display', 'Helvetica Neue', Arial, sans-serif`. Set once via the `--font-sans` / `--font-display` tokens in each bundle's `global.css` `@theme` block, so Tailwind regenerates the `font-sans`/`font-display` utilities and every consumer flips without touching call sites. This replaces the previous Fraunces (display) + Hanken Grotesk (body) editorial pairing with one OS-native sans family — no serif, no webfont download, fully CSP-safe, and falls back cleanly to Helvetica Neue / Arial off-Apple. The ACC `headerBlockFontFamily` styleToken and the `AgentPicker` inline `fontFamily` in `AgentforceChat.tsx` were updated to the same stack.

#### Removed

- **Dropped now-dead webfont loads** — the three `@fontsource-variable` imports (Inter / Fraunces / Hanken Grotesk) from each non-headless `app.tsx`, and the CSP-blocked Google Fonts `@import` from `ReactHeadless/global.css`. Removes **39 woff2 files** (Inter ×21, Fraunces ×9, Hanken ×9) from the deployed bundles. `@fontsource/ibm-plex-mono` is retained for `--font-mono`.

### 2026-07-28 — accessibility, Customer-360 nav, and load-state polish

A11y contrast pass, Customer-360 navigation refactor, and load-state motion across the four bundles. Also a net-zero Agentforce fix (a wrong-headed change and its revert).

#### Changed

- **Collapsed the 11-tab Full Customer-360 nav into 5 grouped tabs + a secondary row** (`Full360Tabs.tsx`, `Customer360Page.tsx` across the three persona bundles) — reduces the top-level tab overload while preserving access to every section.
- **WCAG contrast + control-edge + tiny-type fixes across all four bundles** — darkened form-control borders and focus rings to meet 3:1 (`--input` / `--ring` in each `global.css`), promoted sub-legible decorative type, and tightened low-contrast token pairings flagged in the audit.

#### Added

- **Skeleton loaders for Customer-360 phase-2 content + staggered cockpit entry** — new shared `Skeleton` primitive (`_shared/src/components/Skeleton.tsx`, exported from the barrel) and a `wp-fade-up` staggered reveal on cockpit mount, so async panels shimmer in rather than popping.

#### Removed

- **Deleted the dead `Customer360Body` component** (design-audit #11) — 208 lines removed from each persona bundle; the live path renders through `Customer360Page` + `Full360Tabs`.

#### Fixed

- **Agentforce chat FAB re-embed (net-zero).** A change that stopped re-embedding the ACC client on async brand-accent change (`1d3d3ac2`) was reverted (`737abd07`) — the async re-embed is load-bearing: it both re-themes the bubble to the resolved brand color AND is what renders the FAB in the first place. The `agentColor` dep must stay in the embed effect's dependency array.

### 2026-07-28 — frontend-design critique fixes

Fixes from a `frontend-design` review of the live cockpit, applied across all three persona bundles (and the shared QuickView modal). Built + deployed to `jdo-oe0sdd` (437 components, 0 errors).

#### Changed

- **Neutralized the `$0 Wins · 30d` tile** — dropped the `warn` tone so a zero reads as a clean slate rather than an alert (`HomePage.tsx` ×3; `PulseStat`/`PulseCard` only tint `text-warn` when `tone === 'warn'`).
- **Thousands-separated the opportunity count** in the AI brief (`.toLocaleString('en-US')`) — `homeDataReal.ts` ×3.
- **Corrected the "Open 360" descriptor per persona** — Commercial and Wealth were falling back to the literal `'Retail'` segment default (`customerDataReal.ts`); the descriptor chain is `sel.tier ?? sel.subtitle`, `tier` derives from `mergeEnrichment(c360.segment)`, and `segment` defaulted to `'Retail'`. Fixed at the per-persona source; Retail was already correct.
- **Deduped "Your day" life-event signals** on a `client|type|date` key — `homeDataReal.ts` ×3.
- **Sectioned the QuickView AI summary** into labeled subheads and routed each parsed section to its matching tab (Overview / Opportunities / Cases / Activity) instead of a single wall of text on Overview and dead stubs elsewhere — `_shared/src/components/home/QuickViewModal.tsx` (`parseSummary` + `SUMMARY_MARKERS`/`TAB_MARKERS`).
- **Stat grid falls back to a Health tile** when CSAT is absent, so the QuickView tile grid never renders an empty CSAT slot — same shared modal.

#### Added

- **Fraunces Variable wired as the display face** (headings only, via `--font-display`; body stays Hanken Grotesk). Self-hosted `@fontsource-variable/fraunces` woff2 imported in each bundle's `app.tsx` and bundled into `dist/` (App-Domain CSP blocks the Google Fonts CDN). This makes the long-standing "Fraunces + Hanken Grotesk" claim in the README/AGENTS true — the code had been shipping Inter for headings.

### 2026-07-21 → 2026-07-27 — per-user brand theming, display size, and live data wiring

#### Added

- **Per-user brand theming system** — an in-app theming UI lets each user build, name, edit, and activate holistic **brand themes**: a multi-color logo palette (extracted from an uploaded/fetched logo via `paletteExtract`, with complementary-color suggestion), per-element/role color mapping (a role-mapping modal + hex/RGB `ColorInput`), an optional dedicated **AI accent** as a third brand color, agent-bubble and aurora-wash colors, plus always-available fixed **Light/Dark** baseline themes. Themes are org-shared definitions (`Theme_Library__c`); the active choice is **per user** (`Active_Themes__c`, a UserId→themeId map). Client lives in `_shared/src/theme/` (`brandThemes`, `activeBrand`, `applyActiveTheme`, `defaultThemes`, `paletteExtract`) + `_shared/src/data/brandThemeClient.ts`.
- **Per-user app-wide display size** — a font/UI scale preset, stored per user (`Display_Sizes__c`, a UserId→sizeId map) and applied app-wide (`_shared/src/theme/displaySize.ts`).
- **New `CommandCenterConfig__c` fields** backing the above — `Theme_Library__c` (org-shared theme defs), `Active_Themes__c` (per-user active-theme map), `Display_Sizes__c` (per-user display-size map). FLS granted via the `CommandCenterConfigAdmin` permission set.
- **New brand-theming endpoints on `CommandCenterConfigRest`** (same apexrest-bridge constraint as the rest of the app — the App-Domain session only reaches `/services/apexrest/*`): `GET/POST /config/themes`, `POST /config/active-theme`, `POST /config/display-size`, and `GET /config/brand-logo?url=` (server-side logo fetch → base64, since gstatic faviconV2 replaced the now-301'ing google s2 favicon endpoint).
- **Native-mirror Schedule detail modal** (`ScheduleDetailModal`) — Type/Comments/system fields with Mark Complete / Delete / Follow-Up actions (#25).

#### Changed

- **All three cockpits wired to live data end-to-end** and the profile modals (Open 360 / Prep) enriched with live Customer 360.
- **"Open full 360" button now always navigates.**
- **Dark-mode theming fixes** — re-emit structural tokens + `color-scheme` on dark; Agentforce FAB uses a transparent chat container and trims the white card behind the minimized launcher on dark surfaces.

### 2026-07-18 → 2026-07-20 — cockpit brief polish + sidebar-first de-duplication

#### Added

- **Personalized welcome greeting on the cockpit AI brief** — the command-center brief opens with a time-of-day greeting (`Good morning/afternoon/evening, {bankerName}`) ahead of the AI headline, matching the classic hero. (`bankerName` is still a data-layer value, not yet the running Salesforce user.)
- **Right Now card embedded in the brief** — the single most-urgent next action renders as a compact card *inside* the AI brief, side by side with the headline (a conditional `lg:grid-cols-[1fr_340px]` split), plus a "book at a glance" line; it dismisses in place.
- **Portfolio Pulse strip** fills the brief's open space — a slim full-width variant (label on top, narrative + inline metrics) docked at the bottom of the brief column. Its header is a button that opens the pipeline-movement explorer.
- **Leads & Referrals KPI vital** added to the cockpit vitals row; the four headline metrics now open drill-in `DataExplorerModal`s on click (new **leads**, **goals**, and **lifeEvents** explorers alongside opportunities / at-risk / agenda / activity / pipeline-movement).
- **Life events surfaced across the book** — a "Life events across your book" section in the `WorkspacePanel` default state, plus a browsable `lifeEvents` explorer reachable from the CommandRail's Life-events nav (life events are no longer only a per-client 360 signal).
- **`SectionNavRequest` nav bridge** (`WorkspaceSelection`) — removing the cockpit's on-page anchors would have made the CommandRail's schedule / pipeline / life-events / leads / alerts links dead. The rail now scrolls when an anchor exists (classic view) and otherwise raises a nav *intent* the page maps to the matching explorer modal (`NAV_TO_EXPLORER`). Mirrors the existing pinned-account request channel; keeps `HomePage.tsx` byte-identical across the three personas.

#### Changed

- **Pipeline + Open-opportunities KPIs consolidated** into a single Pipeline vital (value + open-opp count as a sub-note), freeing a slot for the Leads & Referrals vital.
- **Portfolio Pulse compacted** — label moved on top, summary and metrics laid out inline, so the strip fits the brief's residual height.
- **Cockpit de-duplicated, sidebar-first.** The four bottom detail boxes (Tasks & schedule / Pipeline / Life events + Alerts / Leads) that re-rendered content already shown in the right panel and supporting band were removed; the classic **Current** view keeps its full-page sections unchanged. The `WorkspacePanel`'s "AI daily brief" eyebrow was dropped (now "Your day"), its top-risk rows gained severity-tinted icon chips, bold client names, the reason each client is flagged, and a click that drives the 360 panel.
- **Classic-view AI brief hero compacted** (padding / font-size / measure) and the redundant "Today · Today" eyebrow removed.

### 2026-07-16 → 2026-07-17 — cockpit command-center redesign

#### Added

- **Two home views — Current list + Cockpit command center** — a top-bar `HomeViewToggle` (state in a `HomeViewProvider`, persisted per persona) flips the banker home between the original stacked list and a new **command-center cockpit** laid out to match the design mockup: a compact AI daily-brief strip, a four-KPI **vitals** row (sparkline tiles), **Priority Queue + Recommended Actions side by side**, a tabbed **customer-360 workspace panel**, and a full-width **supporting band**. Long lists paginate/`useReveal` rather than run off the page.
- **Master-detail workspace panel** (`WorkspacePanel` + `WorkspaceSelection` in `_shared`) — the cockpit's sticky right column. Selecting a client, task, opportunity, or meeting anywhere on the page drives a dynamic brief/detail panel; the rail carries a localStorage-persisted **pinned-accounts** list (`WorkspaceSelectionProvider`, per-persona `storageKey`).
- **Supporting band with drill-in explorers** — the band's five cells (recent activity, pipeline movement, at-risk clients, agenda, opportunities) each open a `DataExplorerModal` (search + filter + table); a row inside an explorer opens a stacked read-only `DetailModal`. Pipeline, life-event, and alert rows on the page open the same detail popup.
- **`buildPriorityQueue` blender** (`_shared/src/data/priorityQueue.ts`) — the Priority Queue is no longer a single-signal feed. The blender merges each persona's signature risk feed (CSAT / D&B credit / held-away balances) with **opportunity-derived** items (cross-sell / renewal / funding, due on `CloseDate`) and **overdue-task-derived** items (escalation / follow-up, due on `ActivityDate`), each carrying a signal-native `dueDate`. `CallItem` gained an optional `dueDate`.

#### Changed

- **Priority Queue card redesigned to match the mockup** (`PriorityQueueCard` in `_shared`) — count-labeled filter chips (All / High / Medium / Low), a Sort control (Priority / Due date), numbered severity-colored rank badges, avatar, "Name — Action" titles with reason subtitles, severity pills, signal-native due labels (Overdue N days / Due today / Due tomorrow / Due in N days), top-item emphasis, and a "View all tasks & alerts →" footer. The number badge, severity pill, and emphasis bar now all resolve from **one** severity→color family (high = risk, medium = warn, low = accent) so the number's color always matches its chip. Sorting by the real `dueDate` interleaves severities ("mixed") instead of clustering by tier.
- **Cockpit polish** — Inter title font on the command-center headings; supporting band lays out five-across via container queries (App-Domain content width is viewport minus the CommandRail) and defaults expanded; `line-strong` column separators + row hover states; the left CommandRail's sections realigned to the actual page-widget anchors.

### 2026-07-15 — in-app Configuration page + self-updating model catalog

#### Added

- **Command-center Configuration page** (`/config` route in each cockpit, `ConfigPage` in `_shared`). An admin picks, per generative AI action (queue rationale, pipeline summary, follow-ups, free-form), which Agentforce Models API model runs it, plus generation parameters. Backed by a new `CommandCenterConfigRest` Apex bridge (`@RestResource /config/*`, + `CommandCenterConfigRestTest`), the `configClient` shared client, and a `configCache` so the home page's next AI action uses the new settings without a reload. Settings are **org-level and shared** — one `CommandCenterConfig__c` singleton (DeveloperName `GLOBAL`), one JSON blob per center — with a `CommandCenterConfigAdmin` permission set granting the field FLS. Each center is independent; saving Retail never touches Wealth. A "Back to command center" button returns to the home route.
- **Self-updating model catalog.** The org exposes no API that *lists* foundation models, so the catalog is discovered by **probing**: `ModelCatalogProbe` (a `Queueable`, `Database.AllowsCallouts`) calls a forward-looking candidate superset (GPT-5.x, Claude 4.x, Gemini 2.x) — a live model returns `Code200`, a retired/unprovisioned one throws — and caches the survivors onto a new `Model_Catalog_Cache__c` field. Newly provisioned models therefore appear the day they go live with no code change. `GET /config/models` serves the cache instantly (stale-while-revalidate): fresh (< 24h) is served as-is; stale/missing serves the last-known list (or a curated fallback) **and** enqueues a background refresh; `?refresh=1` (the "Refresh models" button) forces a fresh probe. Debounced 10 min via `probeStartedAt` so concurrent page loads don't stack billable probe jobs. The `refreshing` flag is threaded Apex → client → a spinning "Checking for new models…" hint.

#### Changed

- **Model catalog refreshed to current models** (GPT-5 / 5-mini / 5-nano, GPT-4.1 / 4.1-mini, Claude 4.5 / 4 / 3.7 Sonnet, Gemini 2.5 / 2.0 Flash, plus GPT-4o / 4o-mini / 4, Claude 3.5 Sonnet / 3 Haiku), each empirically verified against the live org. Notably `…Gemini25Flash` throws but `…Gemini25Flash001` works — the suffix matters.

#### Notes

- **Generation parameters are stored & clamped but not yet applied.** This org's `aiplatform.ModelsAPI` Apex binding accepts only a model name per request — no temperature/max-tokens field — so those round-trip and validate but do not yet reach the model. Model selection per action IS applied.

### 2026-07-14 — banker home AI actions + CRM writes

#### Added

- **Einstein text generation** via a new `AiGenerateRest` Apex bridge (`@RestResource /ai/generate`, + test class) and the `aiGenerateClient` shared client. Generation is **composed-first**: the UI renders a locally-composed draft immediately and only enriches it if the model responds, so a model miss or timeout never blanks the surface. Surfaced through an `AiResultModal` with Regenerate.
- **CRM record writes** via a new `CrmWriteRest` Apex bridge (`@RestResource /crm/*`, + test class) and the `crmWriteClient` shared client. Backs a set of home action modals in `_shared/src/components/home/` — Task, Schedule, Email, Case, Prep, Why, QuickView, and a review-then-create **DraftFollowups** flow.
- **Refetch-after-write.** `useAsyncData` gained `refetch()` — it bumps the fetch generation WITHOUT flipping `loading`, so current data stays on screen during the background re-query. Write modals take an `onSaved` hook (fires only after a successful `crmWrite`, before close; Cancel bypasses it) wired to `refetch`, so a task or meeting created from the page appears without a manual reload.
- **Tasks & Schedule home section** — the banker's open tasks + meetings, book-wide, bucketed **Overdue / Today / Upcoming**, placed right after the AI brief. Created items surface immediately via the refetch loop above.
- **Email recipient auto-fill** — `accountLookup` pulls the recipient straight from the client's Account record (`PersonEmail`, falling back to the primary related Contact), so the banker never types it.
- **Speech** — a `useSpeech` hook over the browser SpeechSynthesis API for reading AI briefs aloud.

#### Fixed

- **Backlog-window starvation in the schedule query.** A single ascending `first: N` Task query over a large overdue backlog returned only the oldest rows, so a task dated today (sorting thousands deep) was never fetched and the Today/Upcoming buckets stayed empty even though the write succeeded. Split into two date-windowed aliased queries — overdue (`lt TODAY`, DESC) + today/future (`gte TODAY`, ASC) — merged and re-bucketed client-side.
- **`DraftFollowupsModal` reseed wiped edits** on parent re-render; **`approveRec` email routing** and the dismiss-after-write ordering corrected.

### 2026-07-09 — Agentforce agent switcher: correct switch mechanism

#### Fixed

- **Agent switching now genuinely re-initializes the conversation.** The in-panel agent picker switches between the org's four employee agents by **re-embedding** the Agentforce Conversation Client (teardown + re-mount, keyed on the active agent id), with one `requestAnimationFrame` between teardown and re-embed so Lightning Out's global component registry settles. Verified live: switching Cumulus Assistant → Data Cloud Agent flips both the panel header AND the greeting ("Hi, I'm Agentforce!…" → "Welcome to Data Cloud Agent!…"), and the choice persists across a refresh.
- **Reverted the in-place `configuration` prop-swap regression** (shipped intra-day): reassigning the mounted frame's `configuration` only relabels the chrome — ACC's inner LWC reads `configuration` once at mount, so the running conversation never switched. The "already registered to another App" console error during re-embed is non-fatal; the fresh session loads regardless.

#### Changed

- Agent-picker chip **docks to the chat panel's top-right edge** when the panel is open (no overlap with the conversation body) and collapses to a small accent dot by the FAB when closed.

### 2026-07-08 — Cumulus Aurora redesign + native chrome + real Agentforce chat

#### Added

- **Cumulus Aurora design language** across all four bundles — a light-mode `:root` token baseline (Fraunces display + Hanken Grotesk body typography), and a set of shared primitives: `ScoreRing`, `StatTile`, `Panel`, `Meter`, `EntityRow`, `HeroBand`, `Eyebrow`, `Pill`, plus a lucide `iconMap` + `Icon` helper. All three cockpits (Retail / Wealth / Commercial) recomposed on the new system.
- **Native Salesforce chrome baked into the React shell** — `AppLauncher` (33-icon waffle), `GlobalSearch` (multi-object), `UserMenu` (Setup / Data Cloud links), and `NotificationBell` (Cases / Opps) as `_shared` components, so each cockpit reads like a first-class in-org app.
- **Real Agentforce chat via the Agentforce Conversation Client (ACC)** on Retail / Wealth / Commercial / Headless — embedded through `@salesforce/agentforce-conversation-client` (Lightning Out 2.0), themed to the Aurora pink AI accent, with a roomier floating panel. Reuses the app's authenticated Salesforce session (no Connected App / OAuth dance).

#### Fixed

- **Waffle nav tiles opened the wrong app.** App Launcher tiles now link by `AppDefinition.DurableId` (the LEX router id), not `DeveloperName`, fixing the "invalid or inaccessible" redirect.
- **Readability on white surfaces** — made light the `:root` token baseline (nothing falls back to dark) and darkened the muted/faint text tokens for WCAG-adequate contrast.

### 2026-07-07 — App Launcher tiles + Dependabot cleanup

#### Added

- **App Launcher tiles for all three apps** (`pages/` + `tabs/`). A UIBundle `CustomApplication` tile can't open the app directly — it lands on `one:noNavItems` because the app renders only at the Salesforce App Domain, which can't be iframed (`frame-ancestors 'self'`) and blocks scripted top-nav out of the LEX tab. Each app now has a Visualforce "launch card" (`<App>Launcher.page`) exposed as a `CustomTab` (`<App>App`); its `target="_top"` button navigates the top window to the App Domain URL — the one browser-sanctioned launch path. Permsets gained matching `pageAccesses` + `tabSettings`.

#### Security

- **Cleared all 60 open Dependabot npm advisories (8 critical, 20 high, 24 medium, 8 low)** via `overrides` across 8 projects. All were transitive: `protobufjs → ^7.6.3` and `esbuild → ^0.28.1` in the four React bundles (protobufjs pulled by the `o11y` telemetry SDK; 2 critical + 5 high); `@babel/core → ^7.29.6` and a scoped `@istanbuljs/load-nyc-config` → `js-yaml ^3.15.0` in the four sibling LWC projects. Runtime `dist/` unaffected — telemetry/build/test deps only; bundles rebuild to identical output hashes.

### 2026-07-07 — live data across all three cockpits + Commercial Company Intel

#### Added

- **Full Customer-360 wired to real org data across all three apps** — the §3b content contract (`full360DataReal.ts`) now fetches accounts / transactions / trades / interactions / cases / CSAT-NPS / opportunities / campaigns / notes from GraphQL + the Data Cloud bridge. All three apps default `core` / `dataCloud` / `agentforce` to real, with per-domain mock fallback via `dataSource.ts`.
- **Live Einstein/Agentforce summaries** — per-section AI briefs via a prompt-flow bridge (`promptClient`), replacing static mock text.
- **CoreLogic Property + MoneyGuidePro plan** on the Commercial 360 (§2 gap closure) — property value / equity / HELOC propensity / risk, and a MoneyGuidePro financial-plan card.
- **Company Intel tab on the Commercial 360** — one tab fusing four corporate signals for business accounts: ZoomInfo firmographics, BoardEx board/governance intel, MSCI ESG profile, and SEC filings. Null-safe with a graceful empty state for non-business accounts. Wired to `CumulusZoomInfoFirmographics__dlm`, `CumulusBoardExExecIntel__dlm`, `CumulusMSCIESG__dlm`, and `SEC_Filings__dlm` via the DC bridge.
- **Book-level Delinquency Watch panel** on the Commercial home dashboard — a `Loan_Delinquencies__dlm` aggregate (delinquent balance + status breakdown). Book-level rather than per-client because the data is not customer-joinable in this org.
- **Design spec + implementation plan** under `docs/superpowers/` for the Commercial Company Intel + Delinquency Watch work.

#### Fixed

- **Stale deployed bundle.** The Company Intel feature commits changed `src/` only; since a UIBundle deploys `dist/` (not `src/`), the committed `ReactCommercial` bundle did not contain the feature. Rebuilt `dist/` so the deployed artifact actually renders Company Intel + Delinquency Watch.

#### Changed

- **`docs/customer-360-inventory-and-gaps.md`** corrected: MSCI ESG is a Commercial corporate-entity signal (not per-holding Wealth); loan delinquency is book-level (not customer-joinable). ZoomInfo / BoardEx / SEC / MSCI / delinquency gaps marked shipped.

### 2026-07-06 — three cockpits live in-org

#### Added

- **Three deployable UI bundles** — `ReactRetail`, `ReactWealth`, `ReactCommercial` — each a standalone Vite build with its own `CustomApplication`, access permission set, and Aurora Glass persona theme (Retail teal, Wealth gold, Commercial copper).
- **`_shared` source library** (non-deployed, inlined via the `@shared` alias): Aurora Glass light-mode theme tokens + `ThemeProvider`, the `executeGraphQL` GraphQL client and `queryDataCloud` Data Cloud client, `useAsyncData`, and the component/chart primitives.
- **`DcBridgeRest` Apex bridge** (`@RestResource /services/apexrest/dc/query`, + test class, 5/5 passing) — runs read-only ANSI SQL against Data Cloud via `ConnectApi.CdpQuery.queryAnsiSqlV2`, since `@AuraEnabled` is uncallable from React.
- **Real-data wiring for ReactRetail's banker home** (`homeDataReal.ts`): live pipeline / open opportunities / open cases (GraphQL), today's schedule (Task + Event), goals (`FinancialGoal`), leads, and a CSAT-ranked "who to call" list (`CSAT_Snowflake__dlm` via the DC bridge, joined to `Account.Name`).
- **`docs/DEPLOYMENT_GUIDE.md`** — runbook for the UIBundle → CustomApplication Lightning-app binding, the App Domain serving URL, and the beta delete-and-redeploy migration.
- **`AGENTS.md`** — project-context primer for AI agents.

#### Fixed

- **In-org rendering blocker.** Apps appeared in the App Launcher but opened blank and redirected to the org default. Root cause: a stale beta-era AppMenuItem plus a missing `<target>CustomApplication</target>` on the bundle metadata. Fix: add the target, keep the `c__` binding, and **delete + redeploy** (a plain redeploy does not clear the stale AppMenuItem). All three now render at `https://storm-16a17dc388fbe6--c.demo.my.salesforce.app/app/c__<Name>`.
- **Home page showing raw account IDs.** GraphQL returns `Id` as a plain string (not `{ value }`-wrapped like every other field); the name-lookup helper keyed on an empty string. Reading `.Id` directly restored real client names.

#### Changed

- Target org re-aliased `jdo-0pz8au` → `jdo-1lrnov` (same org, `storm-16a17dc388fbe6`).
- `README.md` and `CLAUDE.md` refreshed to the multi-bundle reality and the corrected deploy facts.
