# Changelog

All notable changes to **Web_Engagements_RT_Timeline** — the Salesforce DX project that ships the `webEngagementData` LWC, the `DataCloudWebEngagementController` + `CrmTimelineController` Apex classes, and their tests.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are grouped by date since the project is delivered as rolling demo metadata rather than a released library. Newest entries appear first.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![API v66.0](https://img.shields.io/badge/API-v66.0-1589F0?style=for-the-badge)](sfdx-project.json)
[![Updated](https://img.shields.io/badge/Updated-Jun_1_2026-2EA44F?style=for-the-badge)](https://github.com/josers18/JDO/commits/main)
[![Monorepo CHANGELOG](https://img.shields.io/badge/Monorepo-CHANGELOG-181717?style=for-the-badge&logo=github&logoColor=white)](../CHANGELOG.md)

</div>

---

## [2026-06-01] — runtime lookback dropdown + empty-state gate fix

### Added

- **Runtime lookback dropdown** in the card header — `lightning-combobox` with five preset windows (`30 / 60 / 90 / 180 / 365 days`) sitting to the left of the refresh button. Lets end users widen or narrow the timeline window per session without an admin round-trip to App Builder. Module-scope `LOOKBACK_OPTIONS` (stringified for combobox value-equality) and `LOOKBACK_VALUES` (numeric mirror) are aligned with `MAX_LOOKBACK_DAYS` / `COLD_MAX_LOOKBACK_DAYS` in the two Apex controllers.
- **`_currentLookback` runtime state field** + **`currentLookback` (string) and `effectiveLookbackDays` (int) getters** — internal override that keeps the `@api lookbackDays` seed untouched. Both getters fall back to `lookbackDays` clamped into `LOOKBACK_VALUES` when the user hasn't picked anything; an unsupported config (e.g. a stale `45`) clamps up to `90` so the dropdown only ever shows real presets.
- **`handleLookbackChange` handler** — clears `webEvents`, `crmEvents`, and `activeSourceFilters` before re-firing both Apex calls, so partial-failure banners and chip state from the previous window don't bleed into the new one.
- **`.header-actions` + `.lookback-select` CSS** — flex row that keeps the combobox aligned with the refresh button and width-constrained to 8.5rem so the dropdown doesn't push refresh off the right edge on narrow placements.

### Changed

- **Empty-state gate renamed `isFullyLoadedAndEmpty` → `isWebLoadedAndEmpty`** with a relaxed condition: the **No recent engagements found.** fallback now fires as soon as `!loadingWeb && !hasAnyEvents`, regardless of CRM state. The previous `!loadingWeb && !loadingCrm && !hasAnyEvents` rule produced a fully blank card body whenever CRM was hung or slow — the italic *Loading CRM activity...* chip below the fallback already communicates CRM is in flight, so excluding it from the gate is correct.
- **Both Apex callers (`getWebEngagementsWithBackfill` and `getCrmTimelineEvents`)** now read `lookbackDays` from `effectiveLookbackDays` instead of `this.lookbackDays`. The dropdown and the server queries can never disagree.
- **`connectedCallback` no longer eagerly seeds `_currentLookback`** — when the LWC sits inside a Lightning tab that activates late, `@api` properties may not be hydrated by the time `connectedCallback` runs. Reading `lookbackDays` lazily inside the getter avoids that race.

### Fixed

- **"Card header + empty body, no fallback"** — the original symptom on the Omega, Inc. record page in `jdo-uqj0jr`. Two contributing factors: (1) the FlexiPage `FINS_PersonAccount_Retail_Banking_Starter` had `lookbackDays=60` cached but the field wasn't visible in App Builder so the seed value couldn't be edited, (2) the empty-state gate was suppressed during the brief window where `loadingWeb=false` and `loadingCrm=true`. The runtime dropdown closes the first; the gate rename closes the second.

### Documentation

- **README.md** — new "Runtime lookback override" subsection under App Builder properties; "Multi-source timeline" lookback paragraph references the dropdown; API-version posture table corrected from `62.0 / 65.0` to `66.0 / 66.0` (the bump landed in `b077f85` / `046d12e` on 2026-05-20 but the README hadn't caught up); Data Graph callout URL pin called out as a separate concern from metadata API version.
- **AGENTS.md** — new "Runtime lookback override" + "Empty-state gating" sections under Architecture; new "Common mistakes" entry for the FlexiPage `lookbackDays` configuration trap (the Omega story).
- **artifacts.md** — JS role bullet bumped from `~250 lines` / `11 reactive getters` to `~290 lines` / `13 reactive getters`; HTML role bullet now mentions the lookback combobox and `isWebLoadedAndEmpty` gate; CSS role bullet now mentions `.header-actions` and `.lookback-select`.
- **CHANGELOG.md** — created (this file).

---

## [2026-05-19 → 2026-05-20] — cold-store DMO backfill + UI polish + family-wide harden sweep

### Added

- **Cold-store DMO backfill** (commits [`33a944f`](https://github.com/josers18/JDO/commit/33a944f) → [`8b858f5`](https://github.com/josers18/JDO/commit/8b858f5)) — new `@AuraEnabled getWebEngagementsWithBackfill(accountId, dataGraphName, lookbackDays)` orchestrates the existing hot Data Graph callout AND a cold-store query against `CumulusWeb_Engagements__dlm` via `ConnectApi.CdpQuery.querySql`, JOINed to `UnifiedLinkssotAccountAcc__dlm` on `deviceId__c = SourceRecordId__c` filtered by `UnifiedRecordId__c` and `dateTime__c >= since`. Merge dedupes by `eventId__c` with hot-wins-on-collision; the response wraps back into the same `data[0].json_blob__c` envelope shape the LWC's `parseDataGraphResponse` already consumes, so no LWC mapper changes were needed. Cold-side failures are non-fatal — caught and logged via `System.debug(WARN)` so the response degrades to hot-only.
- **`@TestVisible` test seams** — `testMockColdEvents`, `testMockHotResponse` (added to the existing `testMockUnifiedId`); plus 11 new merge-logic tests bringing the Apex total from 28 → 39, all passing.
- **`buildAuraException` helper** — `CrmTimelineController` joins the family-wide pattern: every `AuraHandledException` now goes through one place that sets BOTH the constructor message AND `setMessage()` so the LWC toast surfaces the message text instead of "Script-thrown exception". Mirrors the helpers in `DC_Prediction_Model_LWC`, `DC_Multiclass_Prediction_LWC`, `DC_Query_to_Table_LWC`, and `DC_AgentForce_Output_LWC`.
- **First `AGENTS.md`** — full project context primer covering architecture, identity contract, demo-cadence latency, conventions, testing, common mistakes.

### Changed

- **API version bumps** ([`b077f85`](https://github.com/josers18/JDO/commit/b077f85)) — `sfdx-project.json` `sourceApiVersion` 62.0 → 66.0; every `*.cls-meta.xml` and `*.js-meta.xml` `apiVersion` 65.0 → 66.0. Aligned to the org runtime after a clean test pass (28/28 Jest, 39/39 Apex). The Data Graph callout URL stays at `v65.0` — different concern (REST route version, not metadata version).
- **AGENTS.md API-version cross-references corrected** ([`046d12e`](https://github.com/josers18/JDO/commit/046d12e)) — table reflected the post-bump state.
- **UI polish** ([`1ebf504`](https://github.com/josers18/JDO/commit/1ebf504) → [`928d1e8`](https://github.com/josers18/JDO/commit/928d1e8)):
  - Long page titles now wrap (`overflow-wrap: anywhere` + `word-break: break-word`) instead of truncating with ellipsis. Icon stays top-aligned with the first line via `align-items: flex-start`.
  - Event-card metadata (source tag · timestamp) moved to its own sub-row beneath the title with `flex-direction: column` on `.stream-head`. Decorative middot is `aria-hidden` in the template.
  - Faint hairline `border-bottom` between adjacent cards in the same day group, dropped on `:last-child` so the day-header provides the natural visual break.
  - Per-source colored chip filters via `--chip-color` CSS custom property + `color-mix(in srgb, ...)` tinting (off-state = 12% tint background with full-color text/border, on-state = solid source-color fill with white text). `SOURCE_CONFIG[s].color` is the single source of truth — chip, icon, and left-rail colors update in lockstep.

### Fixed

- **Pre-existing entry-guard latent bug** — `CrmTimelineController`'s `recordId.getSObjectType()` validation threw an `AuraHandledException` with no `setMessage()`, so the LWC toast would have shown "Script-thrown exception" if a non-Account/Contact record page ever placed the component. Standardized via the new `buildAuraException` helper. Caught alongside the same fix landing in `DC_BusinessProfileWidget` and `DC_PersonProfileWidget`.

### Documentation

- **README.md** ([`6c35b89`](https://github.com/josers18/JDO/commit/6c35b89)) — refreshed to reflect cold-store backfill, UI polish, and review/harden sweep.
- **AGENTS.md** — added with hot+cold backfill identity contract, demo-cadence latency guarantee, and full conventions section.

---

## [2026-05-17 → 2026-05-18] — full revamp (Plans 1+2+3) + merge to main

Three sequential implementation plans landed as ~45 commits and were merged to `main` via fast-forward.

### Added

- **Plan 1 — Hardening** ([`5e1a25d`](https://github.com/josers18/JDO/commit/5e1a25d) → [`7bce524`](https://github.com/josers18/JDO/commit/7bce524))
  - `DataCloudWebEngagementControllerTest` with 17 Apex tests, ~83% coverage.
  - `@TestVisible static String testMockUnifiedId` seam to bypass un-mockable `ConnectApi.CdpQuery.querySql`.
  - `@TestVisible extractUnifiedIdFromQueryOutput(Map<String,Object>)` parser helper extracted from `getUnifiedId`.
  - Documented API version posture (sfdx-project 62.0 / meta-XML 65.0 / org runtime 66.0).
- **Plan 2 — Configurability** ([`3f4ed8c`](https://github.com/josers18/JDO/commit/3f4ed8c) → [`d0c8849`](https://github.com/josers18/JDO/commit/d0c8849))
  - 5 App Builder properties: `dcDataGraphName` (LWC1107 escape from `dataGraphName`), `cardTitle`, `cardTitleLink`, `feedHeight`, `autoSize`.
  - Apex `getWebEngagementData` gained a `dataGraphName` parameter with `String.isBlank` fallback to the existing `RT_Web_Engagementsv2` constant.
  - `@salesforce/sfdx-lwc-jest` scaffolded (first Jest setup in this project); 6 DOM-level tests for `feedStyle` + `headerTitleIsLink` getters.
  - `.forceignore` excludes `__tests__/` from deploys.
- **Plan 3 — Multi-source timeline** ([`ac7bea3`](https://github.com/josers18/JDO/commit/ac7bea3) → [`6758ca9`](https://github.com/josers18/JDO/commit/6758ca9))
  - New `CrmTimelineController` with whitelisted sources, bound SOQL, per-source `LIMIT 200`, `Comparator<TimelineEvent>` sort, and `Schema.getGlobalDescribe`-gated `VoiceCall` query (10 Apex tests, ~78% coverage).
  - Two helper LWC modules: `sourceConfig.js` (registry) + `timelineMappers.js` (`parseDataGraphResponse` + `mergeAndSort` + `groupByDay`, 18 Jest tests).
  - 5 more App Builder properties: `showCases`, `showTasks`, `showEvents`, `showVoiceCalls`, `lookbackDays`.
  - **Style B card stream** UI replacing the SLDS timeline: chip-bar filters, day-group headers, source-colored left rails, expand-on-click detail panels, partial-failure retry banners.
  - Promise A (Data Graph) and Promise B (CRM) fire in parallel; Data Graph never blocks on CRM.

### Changed

- **Hardcoded Cumulus Bank demo URL** removed from the card title (now blank — admins paste a URL via the `cardTitleLink` property to restore the link behavior).
- **Title-derivation logic re-wired** — the mapper return previously used `baseTitle` instead of `finalTitle`, making the status suffix and "Login - Home" override effectively dead code. Now correctly threaded through.

### Fixed

- **`const finalTitle` reassignment** in `webEngagementData.js` — was declared `const` then reassigned for the `'Your Dashboard'` branch (would have thrown `TypeError`). Now `let`.
- **Missing semicolon in icon switch** — the `cancel_app` case was missing the trailing semicolon on `icon = 'standard:cancel_checkout'` before `break`.
- **LWC1107 reserved-word escape** — App Builder property renamed `dataGraphName` → `dcDataGraphName` to dodge LWC's reserved-word list.

### Documentation

- **README.md** — full rewrite documenting the multi-source architecture, source colors, partial-failure UX, and Dependabot disposition.
- **docs/superpowers/specs/2026-05-17-revamp-design.md** — design spec covering the three-plan implementation strategy.
- **docs/superpowers/plans/2026-05-17-{hardening,configurability,multi-source}.md** — three plan files, one per phase.

**Final state on `main`** ([`ed3d69f`](https://github.com/josers18/JDO/commit/ed3d69f)): 28 Apex tests + 28 Jest tests, all passing; live-deployed to `admin@finsdc3.demo`.

---

## [2026-05-15] — initial retrieve

### Added

- **`webEngagementData` LWC** + **`DataCloudWebEngagementController` Apex** — retrieved from the source org as the starting baseline. Renders the `RT_Web_Engagementsv2` Data Graph as an SLDS expandable timeline on Account / Contact record pages; resolves Salesforce ID → Data Cloud Unified ID via `UnifiedLinkssotAccountAcc__dlm` and live-fetches the graph through `callout:Data_Cloud_API`.

---

## Project conventions

- **Newest entries first.** Each entry is a dated H2 — single date or `YYYY-MM-DD → YYYY-MM-DD` range for multi-day work.
- **Sub-sections follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/):** Added / Changed / Fixed / Documentation. Skip any sub-section with no entries.
- **Commit refs** use shortened SHAs in backticks linked to GitHub: `` [`abc1234`](https://github.com/josers18/JDO/commit/abc1234) ``.
- **Shipped entries are immutable.** New work lands as a NEW dated entry; we don't retroactively edit prior entries.
- **Cross-references** to the monorepo CHANGELOG via the badge above and the `Monorepo CHANGELOG` link.
