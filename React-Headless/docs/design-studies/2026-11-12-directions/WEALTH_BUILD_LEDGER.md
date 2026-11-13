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
- Native source query capture in progress. No source values are manually supplied.

## Milestones

0. Source checkpoint: in progress.
1. Identity/product continuity: core implemented; UI/browser pending.
2. Advisor agenda/reviews: pending.
3. Capital/acquisition: pending.
4. Intelligence/trading: pending.
5. Execution/folio: pending.
6. Re-audit/migration: pending. Runtime acceptance remains future work.
