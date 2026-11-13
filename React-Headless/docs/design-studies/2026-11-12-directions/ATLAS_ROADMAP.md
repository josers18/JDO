# Atlas — persona roadmap and current status

November 13, 2026. Atlas is the selected direction. Retail, Wealth and Commercial remain independent banker workspaces; shared source plumbing is preserved.

| Workstream | Completed now | Remaining implementation |
|---|---|---|
| Retail design gap closure | Milestones 0–5 implemented/tested in the standalone mock; Milestone 6 migration contracts, action mapping, capability re-audit and acceptance plan documented. | Live React migration, scope/privacy/authorization and source-state work, real write/AI/settings acceptance and authorized release. Production implementation has not started under this documentation task. |
| Wealth | Independent advisor/capital/review/execution modules over fresh strict-owner captures; source and identity checkpoints pushed. | Persona journeys, re-audit/migration contracts and fresh-review corrections verified. Live React/SDK integration and authenticated acceptance remain in the separate production plan. |
| Commercial | Independent company/credit/treasury/deal/execution modules, fresh owner/provider evidence and source checkpoint pushed. Raw disputed delinquency interpretation remains labeled. | Persona journeys, re-audit/migration contracts and fresh-review corrections verified. Live React/SDK integration and authenticated acceptance remain in the separate production plan. |

## Shared shell preservation

The user explicitly added preservation of View As, global search, waffle, alerts/tasks and the avatar/admin shortcuts. [Shell parity contract](ATLAS_SHELL_PARITY.md) maps current production source, exact endpoints, actor-versus-owner semantics, and local preview acceptance. Production clients and Apex remain unchanged. The new controls are shared Atlas chrome; Retail page content remains held.

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

## Completed mock verification

100 selector/source checks and12 browser suites pass, including the existing five Retail suites, two persona primary journeys, Commercial extended states, shared integration/admin shell,108 cross-persona layouts and14 final-review regression journeys. Browser suites report no errors or runtime write requests. Source queries are dated read-only captures, not live runtime acceptance.

- [Wealth build / migration handoff](WEALTH_BUILD.md)
- [Commercial build / migration handoff](COMMERCIAL_BUILD_MILESTONE.md)
- [Shared shell preservation](ATLAS_SHELL_PARITY.md)
- [Checkpoint and final review log](ATLAS_BUILD_LOG.md)

## Next workstream

1. Review the linked planning artifacts as one preservation record. Keep production gates pending and resolve source-semantic/security/receipt issues explicitly.
2. Wealth and Commercial mock foundations and feature builds are now complete within declared capture bounds. Their separate production plans retain actual SDK/GraphQL/Data Cloud/Apex and shared-shell contracts; no live migration is started by the mock checkpoint.
3. Start Retail production implementation only as the separate workstream defined in T0–T7. Shared-client changes must preserve/test other personas; isolated test deployment is not production activation.

The original audit inventories remain dated evidence. The subsequent mock build uses new bounded read-only source captures and local browser checks. No production UI Bundle/Apex code, bank action, deployment or merge is included. Production acceptance remains pending.
