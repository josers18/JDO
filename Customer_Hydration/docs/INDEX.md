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

## Reference materials

### Specs

- [Phase 1 design](superpowers/specs/2026-05-19-customer-hydration-design.md) — the source-of-truth for everything in this package

### Plans

Implementation plans, one per spec phase. Each plan is a checklist of
tasks delivered in a single git branch.

- [Plan 1 — Skeleton + Phase 0 + retail smoke](superpowers/plans/2026-05-19-plan-1-skeleton-and-smoke.md)
- [Plan 2 — Personas + activity + fieldmap correction](superpowers/plans/2026-05-20-plan-2-personas-and-activity.md)
- [Plan 3 — Multi-wave loader + reset + resume](superpowers/plans/2026-05-20-plan-3-multi-wave-loader.md)
- [Plan 4 — Native FSC mirrors (Wave F + G)](superpowers/plans/2026-05-20-plan-4-native-lineage.md)
- [Plan 5 — Apex wireup + Data Cloud stream refresh](superpowers/plans/2026-05-21-plan-5-apex-wireup-and-data-cloud.md)
- [Plan 6 — Verification briefs + docs + repo updates](superpowers/plans/2026-05-21-plan-6-verification-briefs-docs.md)

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
