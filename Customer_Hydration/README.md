# Customer_Hydration

Reusable CLI artifact that hydrates the JDO demo org with realistic Cumulus
Bank customer data — Retail, Wealth, Small Business, and Commercial — across
role-aligned RMs, with full FSC party-model linking and dual-lineage coverage
(legacy `FinServ__*` + native FSC standard objects).

> **Status:** Plan 1 (skeleton + Phase 0 + retail-only smoke). Plans 2–6 add
> the remaining personas, native FSC mirrors, Apex post-load wireup, Data
> Cloud stream refresh, and banker briefs.

## Quick start

```bash
cd Customer_Hydration
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python hydrate.py hydrate --target-org jdo-fw51xz \
    --retail 50 --personas retail \
    --skip-natives --skip-apex-wireup --skip-data-cloud \
    --allow-production
```

## Documentation

- `docs/superpowers/specs/` — design specs
- `docs/superpowers/plans/` — implementation plans (one per spec phase)
- `AGENTS.md` — context for AI coding agents

## Plan 1 status — Skeleton + Phase 0 + retail-only smoke

Plan 1 is **complete** when:

- [x] Package structure scaffolded (configs, generators dir, tests, docs, AGENTS.md)
- [x] Phase 0 pre-flight describes target objects and caches field lists; missing fields are silently dropped from CSVs (FSC version drift protection)
- [x] External-Id seek pointer correctly handles empty + populated namespaces
- [x] CSV writer emits LF-terminated, sorted-column UTF-8 (Bulk API 2.0 compatible)
- [x] Retail generator produces deterministic Account + FA + FA Role per seed
- [x] Bulk loader wraps `sf data import bulk` with `--line-ending LF` and `--external-id`
- [x] CLI dispatch supports `validate-config` and a minimal `hydrate` for retail-only
- [x] End-to-end smoke load: 50 retail customers + 50 Checking FAs land in `jdo-fw51xz`,
      OwnerId distributed across Justin Chen and Standard User
- [x] `--append` advances the seek pointer correctly (Account + FA upsert idempotently)
- [ ] FA Role idempotency — see "Known Plan 1 warts" below; deferred to Plan 3

### How to run the Plan 1 smoke

```bash
cd Customer_Hydration
source .venv/bin/activate

# Production guard requires --allow-production for non-sandbox demo orgs like jdo-fw51xz.
python hydrate.py hydrate --target-org jdo-fw51xz \
    --retail 50 --personas retail \
    --skip-natives --skip-apex-wireup --skip-data-cloud \
    --allow-production
```

Verify with:
```bash
sf data query --target-org jdo-fw51xz \
    --query "SELECT COUNT() FROM Account WHERE External_ID__c LIKE 'HYDRATE-RT-%'"
```

### Known Plan 1 warts (deferred to later plans)

1. **FA Role rows duplicate on re-run.** `FinServ__FinancialAccountRole__c` has no
   `External_ID__c` field in this org's FSC version, so bulk-upsert behaves as
   bulk-insert and a re-invocation of the loader produces a second set of identical
   role rows. **Plan 3** addresses this with natural-key dedupe — query existing
   `(FinancialAccountId, RelatedAccountId, Role)` tuples before insert.
2. **12 Account/FA fields silently dropped by Phase 0.** The retail generator emits
   fields the org's FSC version doesn't define (`FinServ__BankingPreference__c`,
   `FinServ__OpenedDate__c` (org has `FinServ__OpenDate__c`), `FinServ__OwnershipType__c`
   (org has `FinServ__Ownership__c`), `FinServ__ProductCode__c`, etc.). Drops are
   safe — the load still succeeds — but records land thinner than the spec promised.
   **Plan 2** corrects field-name mappings to the org's actual FSC schema as part of
   the broader retail-density work.
3. **`hydrate` subcommand explicit.** The plan's example invocations omit the
   subcommand (`python hydrate.py --retail 50 ...`); argparse requires
   `python hydrate.py hydrate --retail 50 ...`. The README's Quick Start snippet
   in this file is correct.

**Out of scope (Plans 2–6):**
- Wealth, SMB, Commercial personas
- All other retail child records (Savings, Mortgage, HELOC, Cards, Goals, LifeEvents,
  Cases, Tasks, Events, Opportunities, Households, Campaigns)
- Native FSC mirror objects (FinancialAccount, FinancialAccountParty, etc.)
- Apex post-load wireup (Group Builder rollups)
- Data Cloud stream refresh (Phase 5.5)
- `reset` / `dc-status` / `briefs` subcommands
- AGENTS.md + per-banker briefs (Plan 6)
- Top-level repo README / CHANGELOG / docs/INDEX updates (Task 25 below; Plan 6 expands)
