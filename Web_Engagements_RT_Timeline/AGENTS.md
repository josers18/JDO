# AGENTS.md — Web_Engagements_RT_Timeline

Context for AI coding agents working on the **Real Time Digital Engagements** Lightning card. Salesforce DX project shipping one LWC bundle (with helper modules) and two Apex controllers.

# Product context

A record-page LWC for **Account** and **Contact** pages that renders a unified timeline of:
- **Web engagements** pulled real-time from a Data Cloud Data Graph via Named Credential callout
- **CRM activity** (Cases, Tasks, Events, VoiceCalls) queried directly from the org

Sources are toggleable from App Builder; the chip bar in the rendered card lets users filter further within the loaded set. Sort order is descending by `occurredAt`, grouped by day. Partial-failure UI: web and CRM loaders run independently and surface their own retry buttons if either fails — by design, not a race condition.

This component lives in the **JDO monorepo**. Sibling `DC_*_LWC` widgets exist but follow a different stylistic / theme pattern (`--wp-*` token system); this widget intentionally does NOT participate in that theme catalog.

# Tech stack

- **Apex** — `with sharing` controllers; `ConnectApi.CdpQuery.querySql` for Unified ID resolution; raw `Http`/`HttpRequest` for the Data Graph callout via Named Credential `Data_Cloud_API`
- **LWC** — single bundle `webEngagementData` with two helper modules: `timelineMappers.js` (pure functions, Jest-tested in isolation) and `sourceConfig.js` (the SOURCE_ORDER and SOURCE_CONFIG contract)
- **Jest** — `__tests__/` directory with `webEngagementData.test.js` (DOM-level coverage for chips, day groups, left-rail color) and `timelineMappers.test.js`
- **CLI:** `sf` v2 only — never `sfdx` (deprecated; the JDO repo's PreToolUse hook will warn)

## API version pinning

Two different API version numbers appear in this project. **Don't conflate them.**

| Location | Value | Reason |
|---|---|---|
| `sfdx-project.json` `sourceApiVersion` AND every `*.cls-meta.xml` / `*.js-meta.xml` `apiVersion` | **66.0** | Aligned to the org (`jdo-fw51xz` runs 66.0). Bumped from 62.0 (project default) and 65.0 (per-artifact) on 2026-05-20 in commit `b077f85` after a clean test pass (28/28 Jest, 39/39 Apex). |
| `DataCloudWebEngagementController.cls` Data Graph callout URL | **v65.0** (`/services/data/v65.0/ssot/data-graphs/...`) | Pinned to v65 because the Data Graph endpoint shape changed between v65 and v66; bumping requires re-validating the response shape against `extractUnifiedIdFromQueryOutput`. **Different concern** from Apex/LWC source API version — this is a REST API route version, not a metadata version. |

The Data Graph URL bump is a separate, future change. It needs: (1) review of v66 Data Graph endpoint response schema, (2) update of `extractUnifiedIdFromQueryOutput` parser if the shape changed, (3) live-org integration test (the Jest tests mock the callout result so they won't catch shape changes).

# Project structure

```
Web_Engagements_RT_Timeline/
├── force-app/main/default/
│   ├── classes/
│   │   ├── CrmTimelineController.cls         ← Cases/Tasks/Events/VoiceCalls SOQL aggregator
│   │   ├── CrmTimelineControllerTest.cls     ← 11+ tests covering each source + clamping + multi-source merge
│   │   ├── DataCloudWebEngagementController.cls   ← Data Graph callout + Unified ID lookup
│   │   └── DataCloudWebEngagementControllerTest.cls   ← HTTP mock + happy/empty/500 paths
│   └── lwc/webEngagementData/
│       ├── webEngagementData.js              ← main bundle (~250 lines)
│       ├── webEngagementData.html            ← chip bar + day groups + retry UI
│       ├── webEngagementData.css             ← Style B card-stream layout
│       ├── webEngagementData.js-meta.xml     ← single targetConfig (RecordPage, Account + Contact)
│       ├── timelineMappers.js                ← pure functions (parse, mergeAndSort, groupByDay)
│       ├── sourceConfig.js                   ← SOURCE_ORDER + SOURCE_CONFIG (icon + chipLabel per source)
│       └── __tests__/                        ← Jest suite (mappers + DOM-level)
├── docs/
│   └── superpowers/                          ← spec-driven design plans & specs (internal)
├── jest.config.js
├── package.json                              ← @salesforce/sfdx-lwc-jest
└── sfdx-project.json
```

# Commands

```bash
# Deploy (single project, scoped)
sf project deploy start --source-dir force-app --wait 10

# Validate-only deploy with tests
sf project deploy validate --source-dir force-app \
  --test-level RunSpecifiedTests \
  --tests CrmTimelineControllerTest DataCloudWebEngagementControllerTest --wait 30

# Run Apex tests against an org
sf apex run test --tests CrmTimelineControllerTest DataCloudWebEngagementControllerTest \
  --result-format human --code-coverage --wait 10

# Run Jest unit tests locally
npm install
npm run test:unit
```

**IMPORTANT:** Use `sf` (CLI v2). The `sfdx` commands are deprecated and the JDO repo guardrail will flag them.

# Architecture

## Two-loader render path

```
connectedCallback → handleRefresh
   ├─ loadWebEngagements (async)            ── independent Promise; surfaces webError separately
   │     └─ DataCloudWebEngagementController.getWebEngagementsWithBackfill   ← LWC calls THIS
   │           ├─ HOT:  getWebEngagementData(accountId, dataGraphName)        ← still callable directly
   │           │         ├─ getUnifiedId via ConnectApi.CdpQuery.querySql   (UnifiedLinkssotAccountAcc__dlm)
   │           │         └─ HTTP GET callout:Data_Cloud_API/services/data/v65.0/ssot/data-graphs/...
   │           │
   │           ├─ COLD: queryWebEngagementsFromDmo(unifiedId, lookbackDays)   ← cold-store backfill
   │           │         └─ ConnectApi.CdpQuery.querySql:
   │           │             SELECT e.* FROM CumulusWeb_Engagements__dlm e
   │           │             INNER JOIN UnifiedLinkssotAccountAcc__dlm l
   │           │               ON e.deviceId__c = l.SourceRecordId__c
   │           │             WHERE l.UnifiedRecordId__c = :unifiedId
   │           │               AND e.dateTime__c >= :since
   │           │
   │           └─ MERGE: dedupe by eventId__c, hot wins on collision; wrap back into the
   │                     `data[0].json_blob__c` envelope so the LWC's parseDataGraphResponse
   │                     consumes the merged stream identically to a hot-only response.
   │
   └─ loadCrmEvents (async, parallel)       ── independent Promise; surfaces crmError separately
         └─ CrmTimelineController.getCrmTimelineEvents
               ├─ Cases  (AccountId | ContactId  WHERE CreatedDate >= since)
               ├─ Tasks  (WhatId   | WhoId      WHERE CreatedDate >= since)
               ├─ Events (WhatId   | WhoId      WHERE StartDateTime >= since)
               └─ VoiceCalls (Database.query — Service Cloud Voice may not be provisioned)
                     │
   merge + sort desc by occurredAt → groupByDay → render
```

Both loaders call `maybeAutoEnableChips` after they finish. The function is **idempotent** (commented inline, lines 190-191 of webEngagementData.js): on the first finish, it auto-enables that source's chips; on the second, it adds any newly-available sources to the existing filter set. The user briefly sees a partial chip set on slow networks — this is the documented partial-failure UX, not a bug.

**Demo-cadence latency:** the hot callout (200-800ms) and the cold ConnectApi.CdpQuery.querySql (100-200ms) typically overlap in execution; the merge adds ~10ms. Net round-trip is `max(hot, cold) + ~10ms`, not their sum. Cold-side failures (e.g., DMO unavailable, IR query timeout) are caught and logged; the response degrades gracefully to hot-only. The LWC sees the same envelope shape either way.

## Hot+cold backfill identity contract

The cold-store JOIN works because **`CumulusWeb_Engagements__dlm.deviceId__c` is the same value as `UnifiedLinkssotAccountAcc__dlm.SourceRecordId__c`** for events that originated from a Salesforce Account record (the link table maps source IDs to unified IDs). Anonymous traffic (events with a device fingerprint not in the link table) is intentionally excluded — those events have no path back to a unified individual and therefore no path back to this Account record page.

If the Identity Resolution schema ever changes — e.g., the link table renames `SourceRecordId__c`, or the engagements DMO renames `deviceId__c` — both column names are referenced in `queryWebEngagementsFromDmo` and `getUnifiedId`. The `@TestVisible queryWebEngagementsFromDmo_mockResult` test seam exists so the SOQL itself doesn't need to be exercised in test context.

## Data contract — Apex DTOs

```apex
TimelineEvent {
  String id, source, sourceLabel, iconName, iconColor;
  Datetime occurredAt;
  String title, subtitle, recordUrl;
  List<DetailField> details;
}
DetailField { String label, value; }
```

Web engagement events follow the same shape; the LWC merges both lists and groups by day client-side.

## `extractUnifiedIdFromQueryOutput` defensive shape

`ConnectApi.CdpQuery.querySql` returns one of two response shapes depending on API version, and within a row, the cell array is keyed as `rowData` OR `row`. The `@TestVisible` `extractUnifiedIdFromQueryOutput` walks the deserialized Map handling both. Don't "simplify" this back to typed property access — the v65 API still surfaces both shapes in different scenarios. Tests: `DataCloudWebEngagementControllerTest` exercises the function with crafted Maps directly (the parent `ConnectApi.CdpQuery.querySql` itself is not mockable via `Test.setMock` in API 65, hence the `testMockUnifiedId` `@TestVisible` test seam at line 14-15 of the controller).

## Per-source SOQL caps

`CrmTimelineController.PER_SOURCE_LIMIT = 200`. Each source query is independently capped. With all four sources enabled, the LWC could receive up to 800 CRM rows + the Data Graph response. Lookback days are clamped: `<1` → default 90, `>365` → 365.

## VoiceCall describe-guard

`queryVoiceCalls` checks `Schema.getGlobalDescribe().containsKey('VoiceCall')` before calling `Database.query` (line 202). Without the guard, the controller fails to compile in orgs where Service Cloud Voice isn't provisioned. The dynamic SOQL avoids the static-compile dependency. Don't promote it to static SOQL.

# Conventions

## Apex
- `with sharing` on both controllers. Never `without sharing`.
- `@AuraEnabled` on every DTO field.
- **Reserved keyword `in`** — Apex parses it as the SOQL IN operator. Never use it as a local variable name.
- **`AuraHandledException` requires both the constructor argument AND `setMessage()`** to surface a custom message to the LWC layer. Without `setMessage()` the JS toast falls back to a generic "Script-thrown exception" string. The other four `DC_*_LWC` controllers in the monorepo use a `buildAuraException(safeMsg)` private helper — this project should converge on the same pattern.
- `@TestVisible private static` on helpers when direct unit coverage matters more than going through the public method (see `extractUnifiedIdFromQueryOutput`, `testMockUnifiedId`).

## LWC
- **LWC1503 — Boolean `@api foo = true;` is a compile error.** Every Boolean `@api` in this project correctly defaults to `false` (or is undeclared with `default="true"` in meta-xml). Don't break the pattern.
- **Plain class fields, no `@track`.** Modern LWC reactivity is automatic on field reassignment.
- **Pure-function helpers** (`timelineMappers.js`, `sourceConfig.js`) keep the bundle's testable surface large. Prefer extending these over adding logic to the LightningElement class.
- **Single `targetConfig`** scoped to RecordPage with `<objects>Account</objects>` and `<objects>Contact</objects>` — different from the prediction siblings (which have three blocks for RecordPage / AppPage / HomePage). Don't add other targets without re-validating the `Schema.SObjectType` guard at line 46 of `CrmTimelineController.cls`.
- **`{...}` text-binding auto-escapes.** Every event field rendered in the template (title, subtitle, sourceLabel, etc.) uses interpolation. Do NOT switch to `lightning-formatted-rich-text`, `innerHTML`, or `lwc:dom="manual"` without a security review — the `decodeEntities` step in `timelineMappers.js` decodes entities back to raw `<` / `>` / `&` characters and the safety today depends on text-binding re-escaping them on render.

## CSS
- This project does **NOT** use the `--wp-*` theme catalog from the `DC_*_LWC` family. It has its own Style B card-stream layout (`webEngagementData.css`). Don't retrofit the prediction theme system without a product-level decision.
- Source colors are hardcoded as Apex hex strings (`#c23934` for Cases, `#04844b` for Tasks, etc. in `CrmTimelineController.cls`). The LWC reads them from the DTO's `iconColor` field. This means the widget can't theme-switch — but centralizing them is out of scope.

## UI conventions (post-revamp polish)
- **Per-source colored chips.** The chip-bar's filter pills inherit their source color from `SOURCE_CONFIG[s].color` via a `--chip-color` CSS custom property set inline by the `availableChips` getter. Off-state uses `color-mix(in srgb, var(--chip-color) 12%, white)` for a tinted background; on-state fills solid with white text. The `All` chip is intentionally neutral (no `--chip-color` set), so its existing accent-blue look stays. If you change a source's hex in `sourceConfig.js`, the chip, the icon, and the event card's left rail all update in lockstep.
- **Title wrapping, no truncation.** `.stream-title-text` uses `overflow-wrap: anywhere` + `word-break: break-word` so long page titles like `Cumulus Point-of-Sale Systems - Cumulus Bank` flow onto a second line rather than getting clipped with an ellipsis. The icon stays top-aligned with the first line via `align-items: flex-start` on `.stream-title`. Don't reintroduce `text-overflow: ellipsis` without verifying the typical title length on a real Account.
- **Metadata sub-row.** `.stream-head` is `flex-direction: column` so the source tag (`WEB`) and the timestamp live on a tight strip below the title, separated by an aria-hidden middot. The metadata strip uses `flex-wrap: wrap` so the date can drop to its own line on extremely narrow cards rather than overflowing.
- **Inter-card divider.** Adjacent `.stream-card` elements within a day group have a 1-px hairline `border-bottom` using `--slds-g-color-border-base-4` (the lightest semantic gray token used elsewhere in this CSS). The `:last-child` rule strips the divider from the final card in each day group — the day-header below provides the visual break.
- **`color-mix(in srgb, ...)`** is the modern CSS API for tinting. Supported in Chrome 111+ / Safari 16.2+ / Firefox 113+, all available in current Lightning Experience. Don't replace with hardcoded RGBA fallbacks unless we have evidence of a browser regression.

## Testing
- 11+ Apex test methods in `CrmTimelineControllerTest` covering each source happy path + multi-source merge + lookback clamping + unsupported-record-id throw.
- `DataCloudWebEngagementControllerTest` covers the HTTP mock (happy / blank / 500) and uses the `testMockUnifiedId` `@TestVisible` seam.
- Jest tests in `__tests__/` cover the timeline mapper pure functions AND the rendered DOM (chip bar, day groups, left-rail color).
- **When adding a new source**: extend `ALLOWED_SOURCES` (Apex line 32-33) AND `SOURCE_ORDER`/`SOURCE_CONFIG` (`sourceConfig.js`) AND add a test in `CrmTimelineControllerTest`.

# Common mistakes

- **"Empty timeline = component is broken" — usually no.** The Data Graph hot cache is real-time and expires after a configurable window (typically minutes-to-hours in demo orgs). When the cache window rolls past the user's recent events, `getWebEngagementData` returns a populated *envelope* (`{"data":[{"json_blob__c":"..."}]}`) but the inner `CumulusWeb_Engagements__dlm` array is empty. The LWC parses this successfully and renders nothing — looks identical to a broken component but is the documented empty state. **Diagnose by running anonymous Apex** against the deployed controller with a real Account Id: `String r = DataCloudWebEngagementController.getWebEngagementData('001...', 'RT_Web_Engagementsv2'); System.debug(r.length() + ' bytes; preview=' + r.left(500));`. A response > 1500 bytes that lacks events inside the inner blob means the hot cache is empty for this user. **The cold-store backfill in `getWebEngagementsWithBackfill` exists exactly to absorb this.** When hot is empty, cold-store events from `CumulusWeb_Engagements__dlm` (joined to `UnifiedLinkssotAccountAcc__dlm` via `deviceId__c = SourceRecordId__c`) populate the timeline up to `lookbackDays`. If both are empty, the user genuinely has no recent engagement.
- **Don't switch the LWC's import back to `getWebEngagementData` (the hot-only method)** — it's kept callable for direct anonymous-Apex diagnostics like the one above, but the production render path must go through `getWebEngagementsWithBackfill` so the cold-store backfill actually runs. Same fix the entire monorepo just adopted: hot cache is for freshness, cold store is for completeness; both required.
- **Dedupe rule on the hot+cold merge: hot wins on `eventId__c` collision.** Cold-store rows only fill gaps where the hot cache has no counterpart. Don't reverse this — hot is the canonical source for events still in the real-time window.
- **`AuraHandledException` without `setMessage()`** — toast falls back to "Script-thrown exception". See the entry guard at `CrmTimelineController.cls:47`.
- **Bumping the API version without re-checking the Data Graph response shape** — `extractUnifiedIdFromQueryOutput` is currently shape-defensive against v65; bumping to a later version requires re-validating both `dataRows`/`data` and `rowData`/`row` keys.
- **Adding a new `<target>`** to the meta-xml without updating the `sot != Account.SObjectType && sot != Contact.SObjectType` guard at `CrmTimelineController.cls:46-50` — the user-facing toast is the only thing that protects against an Opportunity/Lead/etc. record page firing the SOQL queries.
- **Forgetting the VoiceCall describe-guard** — without `Schema.getGlobalDescribe().containsKey('VoiceCall')`, the controller fails to compile in orgs without Service Cloud Voice.
- **Switching the render path to rich text or `lwc:dom="manual"`** — the entity-decode-then-text-bind chain depends on auto-escape; bypassing text binding re-opens the XSS surface.
- **Naming a local variable `in`** — Apex compile error.
- **Boolean `@api foo = true;`** — fails with LWC1503.

# Related docs

- @docs/superpowers/plans/ — spec-driven design plans (internal)
- @docs/superpowers/specs/ — spec docs (internal)
- @../DC_AgentForce_Output_LWC/AGENTS.md — sibling project; reference for `buildAuraException` helper pattern
- @../DC_Prediction_Model_LWC/AGENTS.md — sibling project; documents the `--wp-*` theme system this project intentionally does NOT use
