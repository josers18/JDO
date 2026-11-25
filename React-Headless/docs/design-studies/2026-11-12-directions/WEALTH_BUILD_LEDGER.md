# Wealth Atlas implementation ledger

November 13, 2026. Standalone mock only. Retail is held. Production UI bundles, Apex and CRM records remain outside this implementation.

## Design ruling

Atlas uses ink `#2c2c52`, iris `#5548ad`, lavender `#e9e7f8`, paper `#ffffff`, muted `#68677c`, warning `#a24c36`. Native system typography preserves the readable Atlas scale. The organizing idea is an advisor's review folio: agenda → selected household → evidence → proposed commitment. A compact review calendar and genuine holdings exposure give the desk its visual character. Secondary worklists remain dense and left aligned, with searchable vertical selections rather than horizontal customer ribbons.

Ruling: build focused `wealth-core.js` and `wealth-atlas.js` modules instead of separate modules for every lens. This keeps all Wealth interactions behind one persona-gated facade while preserving a pure, independently tested identity layer. It costs some file length but avoids duplicate state and event handlers.

Ruling: source envelopes use strict owner filters and refuse org-wide fallback. Successful-empty, unavailable, zero and null remain distinct. Native source aggregates stay independent of visible sample rows.

Ruling: all writes are local proposals. Provider review dates, trade executions, marketing touches and graph edges are never translated into booked meetings, funds received, permission to contact or completed CRM outcomes.

## Evidence gates

- Verified org `00Dam00000Uo32qEAB`, Cumulus Financial Services, via read-only Organization SOQL.
- Verified Wealth owner `005am000003PbCLAA0`, Jose Sifontes, via read-only User SOQL; matches existing Wealth fixture owner.
- Initial Account directory query returned the SQL-limited 301 rows. It is explicitly a sample, not a full-book count. Duplicate household names occur in the actual source and must remain separate IDs.
- Source/identity tests observed failing before implementation (missing core module), then six passing: strict scope, duplicate names/source precedence, provenance invalidation, plan/date thresholds, position denominator and exact-key history.
- The declared 83-envelope native capture is complete. Source values were read through the connected service; none were supplied to decorate a mock.

## Milestones

0. Source checkpoint: captured/verified; source checkpoint committed and later expanded with declared bounds.
1. Identity/product continuity: implemented and source/browser tested.
2. Advisor agenda/reviews: native replay and source-correct review actions implemented/tested.
3. Capital/acquisition: seven products, bounded coverage/movers, broad-versus-investable assets and exact introductions implemented/tested.
4. Intelligence/trading: native evidence/trading and same-source 360 handoffs implemented/tested.
5. Execution/folio: source activities, exact-plan goals, Contact-linked milestones and private proposals implemented/tested.
6. Re-audit/migration: action/migration/acceptance contracts and an unstarted production plan documented. Production runtime acceptance remains pending.

## Build handoff and validation

- Source checkpoint committed by parent as `1f0f7572a` on the existing authorized design branch. Source counts were subsequently extended; the canonical module now retains83 envelopes.
- Consolidated module dependencies: `wealth-capture-data.js` → `wealth-core.js` → `wealth-atlas.js`; CSS `wealth-atlas.css`. Shared registration/dispatch stays with root.
- 18 pure tests pass: nine exact-source/core boundaries and nine actual-capture/native-parser/queue/weekly/cross-customer contracts. Native replay resolves every requested native SQL envelope and never calls an org.
- Extended browser suite passes: two customers/products/history, known ownership, reviewed blank Opportunity Amount, exact product/source draft, header Review local drafts and reassignment invalidation, goal actual0/reload, Lead annual revenue0, original Event UTC round-trip/source target-owner retention, original-Event proposal exclusion, private folio isolation, directory search, Intelligence Back/reload and1512/1280/1024/768/390px page overflow checks. No unexpected browser writes/errors.
- Observed red→green corrections include core module/rules, wrong native campaign-fetch argument order, same-month history precedence, native code ownership mapping, serialized provenance, header-drafts routing, inline folio save, and a source Event calendar initially defaulting to a month with no captured Events.
- Corrected a test assumption: Anika has no CRM plan/goals in the successful capture; two plans/four goals are Julie's. Anika's provider Draft remains separate. No data was invented to satisfy the test.

Ruling: preserve the native source layer by replaying the checked-out production functions against strict captured envelopes, rather than hand-reimplementing their weights/calculations in the design. The mock adapter uses exact Account identity inside native name-based dedupe and restores display names afterward. Account-owned capture boundaries remain strict. This is explicit migration work for production, not an assertion of current deployed behavior.

Ruling: actual source records are historical. Recorded Events only cover July–September2026; calendars default to a month containing actual records and label them on-file, not upcoming. November review dates belong to a separate provider source and only produce proposed meetings.

Ruling: full authenticated/stale/denied/uncertain-write acceptance belongs to the separate production plan. Visible captures never use fabricated New/liquidity/mover/booking examples to fill a successful-empty feed. Boundary tests use minimal synthetic IDs only to test pure selection rules; displayed records/metrics are source captures.

## Final review ownership

Feature code and all tests transferred to root; the child edits only handoff documentation from this point. Root is closing fresh-review findings with observed red→green regressions: plan-source routing, future outside-mover identity, sparse-customer signal continuity, existing grid Opportunity suppression, current-customer goal-plan scope, life-event source edit reachability, Task delete and source Task/Event shared entrypoints. Parent also owns final cross-persona checks, commits/push, and their evidence. Milestones are not represented as production-complete merely because the future contract exists.

Current mock stage: source/identity, agenda/reviews, capital/acquisition, Intelligence/trading and folio/execution feature surfaces implemented; final root review corrections implemented and targeted regressions green; final branch checkpoint is recorded in ATLAS_BUILD_LOG.md. Migration/action/acceptance documents and a wholly unstarted future production plan are written. Runtime acceptance remains pending by design.

## Coordinator final correction pass

The fresh reviewer’s four important defects and the source-floor handoff checks now have targeted regressions. The initial browser run reproduced ten failures; the corrected run passes those paths plus exact Contact creation, explicit Event retargeting, actual warm-introduction reassignment and separate broad outside-asset summaries. Pure guards cover stale introduction targets and exact source aliases/known grid opportunities. All 83 SQL/SOQL envelopes were exported from the canonical source module after the final supplement. Authenticated production gates stay pending.
