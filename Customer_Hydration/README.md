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
python hydrate.py --retail 50 --personas retail --skip-natives \
    --skip-apex-wireup --skip-data-cloud --target-org jdo-fw51xz
```

## Documentation

- `docs/superpowers/specs/` — design specs
- `docs/superpowers/plans/` — implementation plans (one per spec phase)
- `AGENTS.md` — context for AI coding agents
