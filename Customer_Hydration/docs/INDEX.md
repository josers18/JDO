# Customer_Hydration documentation

This index is the front door to every artifact in `Customer_Hydration/docs/`.
Read in the order below the first time through; jump straight to a
specific page once you know what you're looking for.

## Reading order for new contributors

1. [README.md](../README.md) — what the package is and the Quick Start
2. [ARCHITECTURE.md](ARCHITECTURE.md) — pipeline phases, wave dependencies, ID resolver, fieldmap
3. [PERSONA_PROFILES.md](PERSONA_PROFILES.md) — what defines each customer persona
4. [DATA_MODEL.md](DATA_MODEL.md) — every Salesforce object the generator touches
5. [HOW_TO.md](HOW_TO.md) — CLI cookbook with worked scenarios
6. [IDEMPOTENCY.md](IDEMPOTENCY.md) — re-run / append / reset contracts
7. [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — common failure modes and recovery
8. [ROADMAP.md](ROADMAP.md) — open work items deferred from closed phases
9. [`../CHANGELOG.md`](../CHANGELOG.md) — rolling record of phased deliveries

## Reference materials

### Specs

- [Phase 1 design](superpowers/specs/2026-05-19-customer-hydration-design.md) — the source-of-truth for the original generator + loader pipeline
- [Phase 2 — streams and segments](superpowers/specs/2026-05-22-phase-2-streams-and-segments-design.md) — DC stream refresh CLI + segment provisioning YAML
- [Phase 3d v1.0 — cross-DMO segments](superpowers/specs/2026-05-27-phase-3d-cross-dmo-segments-design.md) — `related_to` rule type for segment YAML
- [Phase 3d v1.1 — real DMO shapes](superpowers/specs/2026-05-27-phase-3d-v1.1-real-dmo-shapes.md) — live-evidence amendments to v1.0 (resolved Campaign IDs, IndividualId join paths)
- [Phase 3d v1.2 — NumberAggregation envelope](superpowers/specs/2026-05-27-phase-3d-v1.2-numberaggregation-shape.md) — v62 cross-DMO JSON envelope correction
- [Phase 4 — Account field backfill](superpowers/specs/2026-05-26-phase-4-account-backfill-design.md) — 7 derivers + coverage rules + Bulk API 2.0 upsert
- [Phase 4 v1.1 — live-org retro](superpowers/specs/2026-05-27-phase-4-v1.1-live-org-retro.md) — five hotfix waves driven by first live-org runs
- [Phase 5 — DMO backfill (cohort-aware)](superpowers/specs/2026-05-27-phase-5-dmo-backfill-design.md) — closes 56 of 64 gap fields per FSC unification rule

### Plans

Implementation plans, one per spec phase. Each plan is a checklist of
tasks delivered in a single git branch.

- [Plan 1 — Skeleton + Phase 0 + retail smoke](superpowers/plans/2026-05-19-plan-1-skeleton-and-smoke.md)
- [Plan 2 — Personas + activity + fieldmap correction](superpowers/plans/2026-05-20-plan-2-personas-and-activity.md)
- [Plan 3 — Multi-wave loader + reset + resume](superpowers/plans/2026-05-20-plan-3-multi-wave-loader.md)
- [Plan 4 — Native FSC mirrors (Wave F + G)](superpowers/plans/2026-05-20-plan-4-native-lineage.md)
- [Plan 5 — Apex wireup + Data Cloud stream refresh](superpowers/plans/2026-05-21-plan-5-apex-wireup-and-data-cloud.md)
- [Plan 6 — Verification briefs + docs + repo updates](superpowers/plans/2026-05-21-plan-6-verification-briefs-docs.md)
- [Phase 2 — streams + segments](superpowers/plans/2026-05-22-phase-2-streams-and-segments.md)
- [Phase 4a — skeleton + archetype](superpowers/plans/2026-05-26-phase-4a-skeleton-and-archetype.md)
- [Phase 4b — person derivers + coherence](superpowers/plans/2026-05-27-phase-4b-person-derivers-and-coherence.md)
- [Phase 4c — B2B derivers + coverage rules](superpowers/plans/2026-05-27-phase-4c-b2b-derivers-and-coverage-rules.md)
- [Phase 4d — live SOQL + Bulk upsert + DC refresh](superpowers/plans/2026-05-27-phase-4d-live-soql-bulk-upsert-and-dc-refresh.md)
- [Phase 3d — cross-DMO segments](superpowers/plans/2026-05-27-phase-3d-cross-dmo-segments.md)
- [Phase 5 — DMO backfill](superpowers/plans/2026-05-27-phase-5-dmo-backfill.md)

### Audit artifacts

- [Account audit 2026-05-26](../output/account-audit-2026-05-26/REPORT.md) — Phase 4 baseline (538 fields, persona-coherent gap analysis)
- [Phase 4 post-backfill verification](../output/account-audit-2026-05-26/POST_BACKFILL_VERIFICATION.md) — pre/post metrics for the 7-deriver run
- [Account DMO audit 2026-05-27](../output/account-dmo-audit-2026-05-27/REPORT.md) — Phase 5 baseline (cohort-aware, 64 fields, 6 gap classes)
- [Phase 7 update CSVs 2026-05-27](../output/phase7-2026-05-27/) — biz parity + person `__pc` shadow CSVs loaded via `sf data update bulk`

### AI agent context

- [AGENTS.md](../AGENTS.md) — context an AI coding agent needs to make changes safely
- [CLAUDE.md](../CLAUDE.md) — `See @AGENTS.md` shim, ignored at the repo root per JDO convention

## Banker briefs

Per-banker portfolio briefs, generated from live SOQL after every
hydration run via `python hydrate.py briefs --target-org <alias>`.

- [BANKER_BRIEFS.md](BANKER_BRIEFS.md) — index page with summary table
- [briefs/](briefs/) — one Markdown file per banker
  - [vince-west.md](briefs/vince-west.md) — Wealth RM (700 wealth clients)
  - [kim-johnson.md](briefs/kim-johnson.md) — Wealth Advisor (~400 mixed)
  - [adam-watson.md](briefs/adam-watson.md) — Financial Advisor Associate (~200 mixed)
  - [justin-chen.md](briefs/justin-chen.md) — Relationship Banker (~3,450 retail-heavy)
  - [standard-user.md](briefs/standard-user.md) — Relationship Banker (~3,450 retail-heavy)
  - [allen-carter.md](briefs/allen-carter.md) — Commercial RM (1,700 SMB+Commercial)

## Quick map

| If you want to … | Read |
|---|---|
| Understand the pipeline at a glance | [ARCHITECTURE.md §Pipeline](ARCHITECTURE.md#pipeline-phases) |
| See the wave-dependency table | [ARCHITECTURE.md §Wave dependencies](ARCHITECTURE.md#wave-dependencies) |
| Look up a CLI flag | [HOW_TO.md §Flags](HOW_TO.md#flag-reference) |
| Check what an External-ID prefix means | [IDEMPOTENCY.md §Namespace](IDEMPOTENCY.md#external-id-namespace) |
| Add a 5th persona | [PERSONA_PROFILES.md §Extending](PERSONA_PROFILES.md#extending-with-a-new-persona) |
| Diagnose a Bulk job failure | [TROUBLESHOOTING.md §Bulk failures](TROUBLESHOOTING.md#1-bulk-job-failures) |
| Refresh DC streams without re-loading | [HOW_TO.md §Just refresh DC streams](HOW_TO.md#scenario-7--just-refresh-data-cloud-streams) |
