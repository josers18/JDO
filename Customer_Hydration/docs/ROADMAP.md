# Roadmap

Open work items deferred by the closed phases (1, 2, 3a–3c, 3d, 4, 5, 6, 7).
Each entry has a one-line evidence link to the spec or audit that
documented the deferral. When you pick one up, file a fresh spec under
`docs/superpowers/specs/` and a plan under `docs/superpowers/plans/`,
then cross-link from this file to the new artifacts.

## Phase 6 follow-ups

- **Persona detector update.** `customer_hydration/derivers/_archetype.
  _persona_from_external_id_or_rt` only knows `HYDRATE-{RT,WL,SMB,
  COM,HH}-*` prefixes. Post-rename, every persona resolves to `retail`
  or `unknown` via the RecordType fallback. Phase 1 generators wrote
  the rich persona-aware data at hydration time; reruns don't rewrite
  it (the orchestrator's `delta` filter respects existing values),
  but the detector should still learn the MDMP/MDM convention so
  future generator passes classify correctly.
- **Forward-run prefix.** `customer_hydration/generators/*.py` and
  `augment_phase3.py` may still emit `HYDRATE-*` External_IDs for
  newly-generated rows. Future generator passes should produce
  MDMP/MDM-prefixed IDs to maintain the convention introduced in
  Phase 6.

## Mapping work — DLO → DMO

- **80 unmapped DMO fields on `ssot__Account__dlm`.** No DLO mapping
  points at them; would need new mapping definitions, not a backfill.
  Sample: `Credit_Balance_c__c`, `FinServ_EmailVerified_pc__c`,
  `FinServ_HomePhoneVerified_pc__c`, all `ssot__ContactPoint*Id__c`
  traversal fields, `ssot__CreditLimitAmount__c`,
  `ssot__IsCreditBlocked__c`, `ssot__PrimarySalesContactPointId__c`,
  `ssot__ShippingAddressId__c`. Most of these are SSOT canonical
  "ID-of-X" cross-DMO traversal fields; they should populate from
  side-DMOs, not from `Account_Home`. Evidence:
  [`output/account-dmo-audit-2026-05-27/REPORT.md` § 6](../output/account-dmo-audit-2026-05-27/REPORT.md).
- **`FinServ_ShippingAddress_pc__c` mapping drop.** The mapping points
  at a non-existent compound shadow source field; the discrete
  `Shipping*` fields cover the same data after Phase 5d. The drop was
  deferred because the DC Connect MCP toolkit doesn't expose a
  drop-field-mapping endpoint and end-state with the broken mapping is
  equivalent to the dropped state (DMO field stays NULL either way).
  Evidence:
  [Phase 5 spec § 4.5](superpowers/specs/2026-05-27-phase-5-dmo-backfill-design.md).

## Backfill work

- **Phase 4 50-row batch-failure root cause.** Phase 5c diagnosed that
  `HYDRATE-RT-000001..000050` were missing 6 fields because the very
  first retail batch had NULL `AnnualIncome__pc` that short-circuited
  the archetype's income-band coherence. Phase 5c cleaned up the data
  but didn't fix the root cause. A Phase 4 retro investigation should
  identify why the first batch wrote `Account` rows without populating
  income, and add a regression test to catch this if a future generator
  rewrite reintroduces the bug. Evidence:
  [CHANGELOG 2026-05-27 § Phase 5c](../CHANGELOG.md).
- **9 missing FSC FA fields not deployed in this org.**
  `BankingType`, `OccupationCode__pc`, `AcquisitionDate`, `BusinessType`,
  `BankingPreference`, `OtherInformation`, `SourceofFunds`,
  `SourceofWealth`, `InvestorRiskProfile`. Out of scope for Phase 5;
  would need a metadata deploy of new custom fields before any
  backfill. Evidence:
  [`output/account-dmo-audit-2026-05-27/REPORT.md` § 10](../output/account-dmo-audit-2026-05-27/REPORT.md).

## Segment work

- **Sub-type discovery for FinancialAccount.** The org has no
  Mortgage / HELOC / SBA sub-type field; Phase 3d segments coarsen to
  the live `Loans` bucket + name-string fallback (`text_contains
  ssot__Name__c "HELOC"`). If a future hydration phase populates a
  real sub-type field, the v1.0 spec's tighter clauses slot back in
  as-is. Evidence:
  [Phase 3d v1.1 § 3.2](superpowers/specs/2026-05-27-phase-3d-v1.1-real-dmo-shapes.md).
- **`BusinessAccountId__c` query-eligibility on CampaignMember.** Phase
  3d v1.2 collapsed commercial campaigns + multi-persona newsletter to
  IndividualId-only joins because `BusinessAccountId__c` proved
  non-queryable for these rows. Worth investigating whether this is
  a permission, a field-level security, or an index issue. Evidence:
  [Phase 3d v1.2 § 5](superpowers/specs/2026-05-27-phase-3d-v1.2-numberaggregation-shape.md).
- **`FinServ__CreditScore__c` DMO 70.4% vs CRM 100% mystery.**
  Pre-Phase-5 audit observed the DMO was sparser than CRM for this
  field. Phase 5f stream refresh may or may not have re-converged it;
  re-query post-stream and file a Phase 6 finding if persistent.
  Evidence:
  [Phase 5 spec § 8 Q4](superpowers/specs/2026-05-27-phase-5-dmo-backfill-design.md).

## Activation / publication

- **Activation refresh.** Phase 3d closed cross-DMO segments but did
  not refresh activations. Future phase: trigger activation jobs after
  segment publication. Evidence: Phase 3d v1.0 § 8.
- **Calculated-Insight-driven boolean fields on Account.** Phase 3d
  spec § 8 deferred this; remains open. Use case: precomputed flags
  like `HasMortgage`, `IsHighValue`, etc. Evidence: Phase 3d v1.0 § 8.

## Observability

- **Comprehensive audit CLI subcommand.** Phase 5 plan called for an
  `account-dmo-audit` subcommand wrapping the queries used in the
  hand-built audit. Not built yet; the audit was reproduced by ad-hoc
  SOQL. Worth automating to enable pre/post-deploy diffing without a
  human in the loop. Evidence:
  [Phase 5 plan Task 0](superpowers/plans/2026-05-27-phase-5-dmo-backfill.md).

## When you pick something up

1. Open a fresh spec at `docs/superpowers/specs/<date>-<phase>-<scope>-design.md`.
2. Cross-reference the source evidence link from this file.
3. Add the new spec/plan entries to [`docs/INDEX.md`](INDEX.md).
4. When the work lands, add a CHANGELOG entry under the current month
   with a one-line summary and a link to the spec.
5. Move the entry from this ROADMAP to "Closed" below (or remove if
   it never warranted further documentation).

## Closed

- **2026-05-27 — Phase 6 segment recreate.** All 21 segments DELETE-then-
  POST recreated against the MDM filter (21/21 success, 0 failures) via
  `python hydrate.py create-segments --target-org jdo-uqj0jr --recreate '*' --allow-production`.
  Original block was Salesforce CLI v2.136 redacting `accessToken` in
  `sf org display --json`; fixed by splitting the call to use
  `sf org auth show-access-token` for the bearer.
- **2026-05-27 — Phase 7 `Email__c` "FLS deferral".** Not actionable —
  `Email__c` is a formula field (`calculated=True`, formula
  `PersonContact.Email`). Person rows resolve via the formula
  (PersonEmail is 100%); business rows have no PersonContact and are
  by-design NULL.
