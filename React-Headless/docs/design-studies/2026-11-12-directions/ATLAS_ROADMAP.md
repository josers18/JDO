# Atlas — persona roadmap and current status

November 13, 2026. Atlas is the selected direction. Retail, Wealth and Commercial remain independent banker workspaces; shared source plumbing is preserved.

| Workstream | Completed now | Remaining implementation |
|---|---|---|
| Retail design gap closure | Milestones 0–5 implemented/tested in the standalone mock; Milestone 6 migration contracts, action mapping, capability re-audit and acceptance plan documented. | Live React migration, scope/privacy/authorization and source-state work, real write/AI/settings acceptance and authorized release. Production implementation has not started under this documentation task. |
| Wealth | Current-source/Atlas gap analysis, 28-surface local browser inventory and a persona-specific milestone plan. | All planned mock gap-closure implementation milestones. No new Wealth UI or live integration is claimed by the audit. |
| Commercial | Current-source/Atlas gap analysis, 44-surface local browser inventory and a persona-specific milestone plan. | All planned mock gap-closure implementation milestones, including resolution/labeling of source-semantic ambiguities. No new Commercial UI or live integration is claimed by the audit. |

## Retail handoff

- [Migration contract](RETAIL_MIGRATION_CONTRACT.md): exact identity/book/assignment semantics, route and Back state, source lifecycle, private workspace ownership and shell/config/AI preservation.
- [Action contract](RETAIL_ACTION_CONTRACT.md): actual supported CRM fields, create/update/delete differences, local-only/read-only controls and confirmed-write/refetch behavior.
- [Production acceptance register](RETAIL_PRODUCTION_ACCEPTANCE.md): RA01–RA21; all production gates pending until implementation and authorized environment evidence exist.
- [Production implementation plan](../../superpowers/plans/2026-11-13-retail-atlas-production-migration.md): T0–T7, incremental opt-in renderer, retained Current/Cockpit layouts, source/action work, isolated test-org validation and separately authorized release.
- [Completed mock implementation plan and logs](../../superpowers/plans/2026-11-12-retail-atlas-gap-closure.md).

The mock's 52 selector checks and five browser suites establish captured/local-proposal behavior. They are not authenticated production acceptance. Source limits still include create/update field differences, explicit org identity needs, source failure/fallback behavior, receipt/retry ambiguity, source metric semantics and separate Data Cloud access validation. These are tracked, not silently inherited as verified behavior.

## Wealth handoff

- [Wealth gap analysis](WEALTH_GAP_ANALYSIS.md): W01–W15, advisor-specific agenda, review risk/due/stale context, capital/held-away and concentration depth, acquisition, trading context and coherent household execution.
- [Wealth gap-closure plan](../../superpowers/plans/2026-11-13-wealth-atlas-gap-closure.md): bounded source checkpoint, exact-household/product continuity, advisor/review work, capital/acquisition, Intelligence/trading and execution depth, then its own migration-readiness contract.

Keep the household review desk, capital-path composition and review folio as the Wealth signature. Internal horizontal household/product scrolling is a documented gap even where the page has no horizontal overflow. Existing beneficiary/team capabilities must be established from real contracts before adding them; their absence is not automatically lost parity.

## Commercial handoff

- [Commercial gap analysis](COMMERCIAL_GAP_ANALYSIS.md): C01–C16, company/product/deal continuity, credit/payment triage, market defense/development, corporate intelligence, treasury growth, owner-Wealth handoffs and company execution.
- [Commercial gap-closure plan](../../superpowers/plans/2026-11-13-commercial-atlas-gap-closure.md): source metric checkpoint, exact-company foundation, credit-first Today, source/company intelligence, treasury/acquisition, coherent execution, then migration readiness.

Keep the company command desk, treasury lanes and deal room. Cameron's existing Company Intel is partial coverage to preserve/enrich, not a missing capability. The delinquency-predictor direction differs between inspected home/customer source presentations; verify semantics before using new risk colors. Facility/covenant/team/borrowing-base features without established contracts remain separate future scope.

## Recommended sequence

1. Review the linked planning artifacts as one preservation record. Keep production gates pending and resolve source-semantic/security/receipt issues explicitly.
2. Wealth and Commercial can implement their exact-record mock foundations in parallel, with owned persona modules and coordinated edits to shared study dispatch files. Each milestone retains capture bounds, tests, logs and a commit checkpoint.
3. Start Retail production implementation only as the separate workstream defined in T0–T7. Shared-client changes must preserve/test other personas; isolated test deployment is not production activation.

All source/browser audit evidence is dated. This work did not query an org, modify runtime app code, execute a bank action, deploy or merge a release. The audit inventories are local untracked artifacts, while these contracts/plans are the reviewable committed handoff.
