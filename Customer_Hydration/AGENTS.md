# AGENTS.md — Customer_Hydration

Context for AI coding agents working on the **JDO demo-org customer hydration generator** — a planned Python CLI artifact that will hydrate the JDO demo org with ~10,000 realistic Cumulus Bank customers across Retail, Wealth, Small Business, and Commercial segments.

## Status: design-only (no implementation yet)

As of 2026-05-20, this project contains **specs only**. The Phase 1 design was approved through brainstorming on 2026-05-19 and is awaiting user review of the written spec before implementation begins. **Do not start implementing without explicit user approval** — the spec calls for one more review cycle before invoking the planning skill.

The canonical spec document is:

- @docs/superpowers/specs/2026-05-19-customer-hydration-design.md — full Phase 1 design (project structure, generator architecture, CSV → Bulk API → post-load wireup pipeline, persona distribution rules, idempotency contract, scope rules)

# Product context

The artifact will be a **reusable Python CLI** that:

- Generates ~10,000 realistic customers (Retail / Wealth / Small Business / Commercial)
- Distributes them across the org's 5 internal banker users with full FSC party-model linking
- Provides dual coverage of legacy `FinServ__*` objects AND native FSC standard objects
- Is **re-invokable forever** — append more customers, reset and regenerate, or scope to a single RM, without manual cleanup or duplicate records

**Phase 1 scope (this design):** Org-side hydration of customers, accounts, products, activity, lifecycle, campaigns, and households.

**Phase 2 (separate spec, not yet authored):** Data Cloud DLO/DMO mapping, Identity Resolution, Calculated Insights, Segments, Activations, and `FinancialAccountTransaction` ingestion.

# Tech stack (planned)

- **Python 3.11+** with Faker, PyYAML, python-dateutil, simple-salesforce
- **Salesforce CLI v2** (`sf data import bulk`, `sf apex run`, `sf sobject describe`)
- **One anonymous-Apex post-load wireup script** (Phase 5 of the pipeline)
- **One custom field deployed via DX**: `FinServ__BusinessMilestone__c.External_ID__c` (the only `force-app/` artifact)

**Target org for Phase 1:** `jdo-fw51xz` → `admin@finsdc3.demo`. Generator is org-portable via Phase 0 pre-flight describe.

# Project structure (planned, per the spec)

```
Customer_Hydration/                           ← top-level DX package, mirrors Financial_Trades_Generation/
├── README.md                                 ← what it does, prereqs, hello-world
├── AGENTS.md                                 ← this file
├── CLAUDE.md                                 ← `See @AGENTS.md` shim, gitignored
├── artifacts.md                              ← per-monorepo-convention file inventory
├── .gitignore                                ← output/, *.pyc, .venv, etc.
├── hydrate.py                                ← CLI entrypoint with subcommands
├── requirements.txt                          ← faker, pyyaml, python-dateutil, simple-salesforce
├── config/
│   ├── personas.yaml                         ← distribution rules + density toggles
│   ├── product_catalog.yaml                  ← frozen mirror of Cumulus PRODUCT_SPECS.md SKUs
│   ├── rm_pool.yaml                          ← 5 internal banker User Ids + caseload weights
│   └── holding_universe.yaml                 ← ~200-ticker investment universe for wealth holdings
├── generators/
│   ├── retail.py · wealth.py · smb.py · commercial.py
│   ├── households.py · activity.py · lifecycle.py · campaigns.py · natives.py
├── output/                                   ← CSVs and run artifacts (GITIGNORED)
│   └── run-{ts}/                             ← one timestamped dir per run
├── apex/
│   └── post_load_wireup.apex                 ← Phase 5 anonymous-Apex script
├── force-app/                                ← DX project for the one new field
└── docs/
    └── superpowers/
        ├── specs/                            ← design specs (this directory)
        └── plans/                            ← implementation plans (after spec approval)
```

# Why a top-level package (not nested)

The spec considered three placements and chose top-level deliberately:

- **Inside `FSC_Audit_Utilities/`** — rejected: that project's concern is *correcting* existing data via Apex utilities, not *seeding* fresh data. Different concern, different lifecycle.
- **Inside `Cumulus_Products/`** — rejected: that project is currently Python-only and breaks the "each top-level folder is a DX package" convention. Layering a DX package on top of a non-DX folder would be a worse precedent than adding a new top-level folder.
- **Top-level `Customer_Hydration/`** — chosen: mirrors the structure of `Financial_Trades_Generation/` (also Python-heavy with declarative config). Re-uses the existing top-level convention without overloading any sibling.

# Sibling references

This project's structure is intentionally cross-referenced with two siblings — read those AGENTS.md files when implementing:

- **`Financial_Trades_Generation/`** — closest sibling in shape (Python-heavy + declarative config + scheduled / on-demand entry points). The directory layout and CLI conventions should mirror.
- **`Cumulus_Products/`** — provides the canonical product catalog (`docs/PRODUCT_SPECS.md`). The `config/product_catalog.yaml` here will be a frozen mirror of those SKUs; when product specs change there, sync the YAML here.
- **`FSC_Audit_Utilities/`** — provides the architectural rules for FSC data (`AGENTS.md` § Architectural rules — three FA-shaped stores, parity-batch pattern, idempotency markers, FLS gotcha). The post-load Apex script must respect those conventions.

# Implementation order (when work begins)

The spec defines six phases. Don't reorder without re-reading:

0. **Pre-flight describe** — verify all referenced fields exist in the target org
1. **Account skeleton + smoke test** — minimal CSV generation + Bulk API import for one Retail customer
2. **Population scaling** — 10K-customer generation across all four segments
3. **Id resolution + native mirror** — link generated records to FSC standards via `FscParityBatch`
4. **Activity + lifecycle + campaigns** — calendar-aware Cases, Tasks, Events, Opportunities, LifeEvents
5. **Anonymous-Apex post-load wireup** — Household ACR creation, Person Account name backfill, etc.

# Implementation conventions (when work begins)

The following conventions are codified in the spec and **should be inherited from siblings**:

- **Idempotency markers**: every generator's CSV header must include an external-ID column that the Bulk API uses for upsert behavior. Pattern matches FSC_Audit_Utilities `IsSeeded*__c` markers.
- **Owner rotation**: 5 internal bankers from `config/rm_pool.yaml`, weighted by caseload. Same shape as the FSC_Audit_Utilities engagement-seed owner rotation (which uses 7 owners).
- **No FLS bypass**: same lesson as FSC_Audit_Utilities — newly-deployed custom fields default to no FLS. The one new field (`FinServ__BusinessMilestone__c.External_ID__c`) must extend a permission set with FLS for the running user.
- **Anchor date**: 2026-05-19 (today as of spec authoring). All calendar-aware activity shapes anchor to this date and ratchet forward as the demo date moves.

# Common mistakes (to avoid when implementation begins)

- **Starting implementation without spec approval.** The status line at the top of the spec is load-bearing. Wait for explicit user direction before invoking the planning skill or writing code.
- **Folding into a sibling project.** The placement decision is documented in the spec's §1; don't relocate without reading that section.
- **Drifting `config/product_catalog.yaml` from `Cumulus_Products/docs/PRODUCT_SPECS.md`.** When product specs change, sync the YAML in the same change.
- **Treating the `force-app/` directory as a full DX package** — it's only there for the single `External_ID__c` field deployment. Don't add unrelated metadata.
- **Generating customers that bypass the Phase 0 describe.** The describe is the org-portability mechanism — without it, the generator silently breaks on orgs with different field shapes.

# Related docs

- @docs/superpowers/specs/2026-05-19-customer-hydration-design.md — Phase 1 design spec (the source of truth)
- @docs/superpowers/plans/2026-05-19-plan-1-skeleton-and-smoke.md — early plan draft for Phase 1
- @../Financial_Trades_Generation/AGENTS.md — sibling Python+config artifact; closest structural reference
- @../Cumulus_Products/AGENTS.md — sibling content asset; product catalog source
- @../FSC_Audit_Utilities/AGENTS.md — sibling FSC project; architectural rules (three FA stores, parity-batch pattern, idempotency markers, FLS gotcha) the post-load script must respect
