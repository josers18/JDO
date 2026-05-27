# Phase 4d — Live SOQL + Bulk Upsert + DC Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Plan 4a–4c skeleton into a real production pipeline — live SOQL fetch from the target org, Bulk API 2.0 upsert via External_ID__c, DC stream refresh trigger, production guardrail, per-deriver exception isolation, and the deferred CLI filter flags (`--persona`, `--record-type`, `--limit`, `--require-external-id`, `--strict`) — so `python hydrate.py backfill-accounts --target-org jdo-uqj0jr` actually fills the 101 empty Account fields end-to-end.

**Architecture:** A new `customer_hydration/backfill/` sub-package houses the live-org integration: `query.py` builds and runs the chunked SOQL fetch via `SfRunner.query`, `upsert.py` wraps `loader._legacy.bulk_upsert` for sparse-CSV semantics, `dc_refresh.py` resolves credentials via `phase5.data_cloud.get_org_session` and triggers the Account stream, and `production_guard.py` blocks runs against known prod org ids. The orchestrator (`backfill_accounts.run_backfill`) becomes the conductor: pre-flight describe → SOQL fetch → derive loop wrapped in try/except → bulk upsert → DC refresh → manifest. Per-deriver exception isolation goes in `Registry.run` itself so coverage_rules and downstream code keep running even if one deriver crashes.

**Tech Stack:** Python 3.10+, `sf` CLI v2 (already used by SfRunner + bulk_upsert), Bulk API 2.0 via `sf data upsert bulk`, Connect REST API v62 for DC stream trigger.

**Spec:** `docs/superpowers/specs/2026-05-26-phase-4-account-backfill-design.md` §5 (data flow), §6 (error handling, exit codes), §4.8 (CLI flags).

---

## File Structure

**New files (production):**

- `customer_hydration/backfill/__init__.py` — package marker
- `customer_hydration/backfill/query.py` — chunked SOQL fetch + life-event batch query + persona/RT filter clause builder
- `customer_hydration/backfill/upsert.py` — sparse-CSV builder (LF, sorted columns, External_ID__c first) + wrapper around `loader._legacy.bulk_upsert`
- `customer_hydration/backfill/dc_refresh.py` — Account stream refresh trigger using `phase5.data_cloud` primitives
- `customer_hydration/backfill/production_guard.py` — known-prod-org-id list + guard check
- `customer_hydration/backfill/exit_codes.py` — `OK=0, BULK_PARTIAL_FAILURE=2, BULK_HARD_FAILURE=3, SCHEMA_PICKLIST_DRIFT=4, PRODUCTION_GUARD=5` constants

**New files (tests):**

- `tests/test_backfill_query.py` — ~10 unit tests for SOQL builder + chunking
- `tests/test_backfill_upsert.py` — ~8 unit tests for sparse-CSV builder (column ordering, escaping, blank cells)
- `tests/test_backfill_dc_refresh.py` — ~6 unit tests for refresh trigger (412 handling, 404 graceful skip)
- `tests/test_backfill_production_guard.py` — ~4 unit tests for guard
- `tests/test_backfill_exception_isolation.py` — ~5 unit tests proving Registry.run survives one bad deriver
- `tests/test_backfill_e2e_live.py` — 1 live-org smoke test gated by `RUN_LIVE_TESTS=1` env var

**Modified files (production):**

- `customer_hydration/derivers/_registry.py` — wrap `derive` calls in try/except per deriver; track `errors: list[dict]` on Registry instance
- `customer_hydration/backfill_accounts.py` — replace the in-memory `records=None` short-circuit with live SOQL fetch; wire bulk_upsert (unless --dry-run); wire DC refresh (unless --skip-refresh-stream); enforce production guard; honor --persona/--record-type/--limit/--require-external-id/--strict flags; use `csv.DictWriter` for proper escaping; emit per-field fill counts to manifest
- `customer_hydration/cli.py` — no changes (flags already registered in Plan 4a; `--persona`, `--record-type`, `--limit`, `--require-external-id`, `--strict` get passed through args)

**Modified files (tests):**

- `tests/test_backfill_skeleton.py` — update existing fixtures-injected smoke tests to assert the new manifest fields (per_field_fill_counts, per_persona_counts, errors) without breaking
- `tests/test_backfill_accounts.py` — NEW (this is the integration test file from spec §7.4); ~12 mocked-org integration tests covering --dry-run, filters, schema drift, picklist drift, bulk partial failure, DC 412, production guard, manifest assertions

**Modified files (docs):**

- `AGENTS.md` — append Plan 4d entry to "Plans history"; add 1–2 "Things that bite" entries from any live-run findings
- `README.md` — update the Phase status badge and add a Phase 4 quick-start section

**Not in scope for 4d:**

- Multi-org backfill (`--target-org A,B,C`) — single-org only
- Resumability via checkpoint (`--offset`, manifest checkpoint resume) — single-shot
- Apex post-load batch alternative — Python-only
- The 2 fields not in CRM Account schema (`Equifax_Failure_Score_c__c`, `SfdcOrganizationId__c`) — flagged in spec §9, deferred to v1.1
- The `--report-only` mode (re-run audit + emit post-backfill REPORT.md) — flagged in spec §9, deferred to v1.1

**Plan 4d is done when:** `python hydrate.py backfill-accounts --target-org jdo-uqj0jr` runs end-to-end without `--dry-run`, populates the 101 empty fields across all 36,222 accounts via Bulk API 2.0, triggers the Account DC stream refresh, exits rc=0 (or rc=2 with the `dc-stream-full-refresh-via-ui` skill invocation printed if the stream is UPSERT-mode), and writes a manifest with all fields from spec §6.5.

---

## Task 1: Bootstrap Plan 4d branch

**Files:** none — branch operations only.

- [ ] **Step 1: Cut the feature branch from the Plan 4c tip**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration checkout feat/customer-hydration-phase-4-plan-4c
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration pull origin feat/customer-hydration-phase-4-plan-4c
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration checkout -b feat/customer-hydration-phase-4-plan-4d
```

- [ ] **Step 2: Verify the 4c foundation is in place**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest -q 2>&1 | tail -3
```

Expected: 718 tests PASS. If less, the wrong branch was chosen — STOP and ask the controller.

- [ ] **Step 3: Confirm the 7 derivers are registered**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && python -c "
from customer_hydration.backfill_accounts import _build_registry
r = _build_registry()
names = [d.name for d in r.derivers]
expected = ['relationship', 'credit_personal', 'credit_bureau', 'profile', 'demographics', 'addresses', 'contact']
assert names == expected, names
print('OK')
"
```

Expected: `OK`. If not, the 4c registry isn't in the expected state — STOP.

No commit in this task — branch creation is the work.

---

## Task 2: Exit codes + production guard

**Files:**
- Create: `customer_hydration/backfill/__init__.py`
- Create: `customer_hydration/backfill/exit_codes.py`
- Create: `customer_hydration/backfill/production_guard.py`
- Create: `tests/test_backfill_production_guard.py`

- [ ] **Step 1: Create the package marker**

`/Users/jsifontes/Documents/Git/JDO/Customer_Hydration/customer_hydration/backfill/__init__.py`:

```python
"""Phase 4d live-org integration helpers — SOQL fetch, Bulk upsert,
DC refresh, production guard, exception-isolation policy.

See docs/superpowers/specs/2026-05-26-phase-4-account-backfill-design.md §5–6.
"""
```

- [ ] **Step 2: Create the exit codes module**

`/Users/jsifontes/Documents/Git/JDO/Customer_Hydration/customer_hydration/backfill/exit_codes.py`:

```python
"""Phase 4d exit codes (spec §6.1).

Importable constants so tests + orchestrator agree on numeric meaning.
"""
from __future__ import annotations

OK: int = 0
BULK_PARTIAL_FAILURE: int = 2  # > 1% per-row failures, or DC stream returned 412
BULK_HARD_FAILURE: int = 3
SCHEMA_PICKLIST_DRIFT: int = 4
PRODUCTION_GUARD: int = 5
```

- [ ] **Step 3: Write the failing tests for production_guard**

`/Users/jsifontes/Documents/Git/JDO/Customer_Hydration/tests/test_backfill_production_guard.py`:

```python
"""Tests for the Phase 4d production guard (spec §6.1, §6.2 row 'Production-org guardrail tripped')."""
import pytest

from customer_hydration.backfill.production_guard import (
    KNOWN_PRODUCTION_ORG_IDS,
    is_production_org,
    enforce_production_guard,
)


def test_known_production_ids_is_a_frozenset_of_15char_ids():
    """The known-prod list is a frozenset so accidental mutation is a TypeError."""
    assert isinstance(KNOWN_PRODUCTION_ORG_IDS, frozenset)
    for org_id in KNOWN_PRODUCTION_ORG_IDS:
        assert len(org_id) == 15, f"{org_id!r} is not a 15-char SF org id"


def test_is_production_org_returns_true_for_known_prod():
    """If an org id is in the known-prod list, is_production_org returns True."""
    if not KNOWN_PRODUCTION_ORG_IDS:
        pytest.skip("KNOWN_PRODUCTION_ORG_IDS is empty (no prod orgs registered yet)")
    sample = next(iter(KNOWN_PRODUCTION_ORG_IDS))
    assert is_production_org(sample) is True


def test_is_production_org_returns_false_for_demo_org():
    """jdo-uqj0jr's id is 00Dam00000Uo32qE — not on the prod list."""
    assert is_production_org("00Dam00000Uo32qE") is False


def test_enforce_raises_when_prod_and_not_allowed():
    """If org is prod and --allow-production not set, raise PermissionError."""
    if not KNOWN_PRODUCTION_ORG_IDS:
        pytest.skip("no prod orgs registered")
    sample = next(iter(KNOWN_PRODUCTION_ORG_IDS))
    with pytest.raises(PermissionError):
        enforce_production_guard(sample, allow_production=False)


def test_enforce_passes_when_prod_and_allowed():
    """If org is prod but --allow-production set, do not raise."""
    if not KNOWN_PRODUCTION_ORG_IDS:
        pytest.skip("no prod orgs registered")
    sample = next(iter(KNOWN_PRODUCTION_ORG_IDS))
    enforce_production_guard(sample, allow_production=True)  # should not raise


def test_enforce_passes_for_non_prod_org():
    """Non-prod org should never raise regardless of allow_production."""
    enforce_production_guard("00Dam00000Uo32qE", allow_production=False)
    enforce_production_guard("00Dam00000Uo32qE", allow_production=True)
```

- [ ] **Step 4: Run tests → expected FAIL**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_backfill_production_guard.py -q
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 5: Implement the production guard**

`/Users/jsifontes/Documents/Git/JDO/Customer_Hydration/customer_hydration/backfill/production_guard.py`:

```python
"""Production-org guardrail (spec §6.2).

KNOWN_PRODUCTION_ORG_IDS is a frozenset of 15-char SF org ids that the
package considers production. Any caller running against one of these MUST
pass --allow-production. The list is empty by default — operators add their
own org ids here as the package is deployed across organizations.

The 18-char id form is normalized to 15 chars by truncation (the last 3
chars are a checksum and don't change membership semantics).
"""
from __future__ import annotations


# Operators: add 15-char SF org ids here that should be considered production.
# Empty by default — JDO's demo orgs (jdo-uqj0jr, jdo-fw51xz) are sandboxes
# and never need to be on this list.
KNOWN_PRODUCTION_ORG_IDS: frozenset[str] = frozenset()


def _normalize_org_id(org_id: str) -> str:
    """Trim 18-char ids down to 15 (the last 3 chars are a case-folding checksum)."""
    return org_id[:15]


def is_production_org(org_id: str) -> bool:
    """Return True if org_id matches a known production org."""
    return _normalize_org_id(org_id) in KNOWN_PRODUCTION_ORG_IDS


def enforce_production_guard(org_id: str, *, allow_production: bool) -> None:
    """Raise PermissionError if org is prod and allow_production is False.

    Caller (the orchestrator) catches PermissionError and exits with rc=5.
    """
    if is_production_org(org_id) and not allow_production:
        raise PermissionError(
            f"Org {org_id} is on the known-production list. "
            f"Pass --allow-production to override."
        )
```

- [ ] **Step 6: Run tests → expected PASS**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_backfill_production_guard.py -v
```

Expected: 5 PASS (with 3 of them skipping if KNOWN_PRODUCTION_ORG_IDS is empty, which is the v1 default).

- [ ] **Step 7: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add customer_hydration/backfill/__init__.py customer_hydration/backfill/exit_codes.py customer_hydration/backfill/production_guard.py tests/test_backfill_production_guard.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
feat(customer-hydration): backfill/ package + exit codes + production guard

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Per-deriver exception isolation in Registry

**Files:**
- Modify: `customer_hydration/derivers/_registry.py`
- Create: `tests/test_backfill_exception_isolation.py`

The current `Registry.run` calls each deriver's `derive` with no try/except. A bug in one deriver crashes the entire run. Plan 4d wraps each call so other derivers continue, and surfaces the failures via a new `errors` attribute.

- [ ] **Step 1: Write the failing tests**

`/Users/jsifontes/Documents/Git/JDO/Customer_Hydration/tests/test_backfill_exception_isolation.py`:

```python
"""Tests for per-deriver exception isolation (spec §6.2 row 'Deriver raises exception')."""
from datetime import date

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers._registry import Registry


def _arch() -> PersonaArchetype:
    return PersonaArchetype(
        account_id="001xx000000ABC", created_date=date(2020, 1, 1),
        record_type="FSC Person Accounts", is_person=True, persona="retail",
        age=40, gender="Male", marital_status="Single",
        household_size=1, income_band="middle",
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=5.0, engagement_level="regular",
        home_metro="Boston, MA",
        business_size=None, industry_code=None, business_credit_quality=None,
    )


class _GoodDeriver:
    name = "good"
    fields = ["GoodField__c"]

    def applies_to(self, archetype):
        return True

    def derive(self, archetype, record, rng):
        return {"GoodField__c": "good"}


class _BadDeriver:
    name = "bad"
    fields = ["BadField__c"]

    def applies_to(self, archetype):
        return True

    def derive(self, archetype, record, rng):
        raise ValueError("simulated deriver crash")


def test_one_bad_deriver_does_not_block_good_derivers():
    """Registry.run continues past a bad deriver and still produces good output."""
    r = Registry()
    r.register(_BadDeriver())
    r.register(_GoodDeriver())
    out = r.run(_arch(), {"Id": "001xx"}, seeded_rng("001xx"))
    # The good deriver's output is still in the candidates dict
    assert out.get("GoodField__c") == "good"
    # The bad deriver did NOT add anything
    assert "BadField__c" not in out


def test_registry_records_errors_per_deriver():
    """Bad deriver failures are captured on registry.errors."""
    r = Registry()
    r.register(_BadDeriver())
    r.register(_GoodDeriver())
    out = r.run(_arch(), {"Id": "001xx"}, seeded_rng("001xx"))
    # Errors list has one entry for the bad deriver
    errors = r.errors
    assert len(errors) == 1
    assert errors[0]["deriver"] == "bad"
    assert errors[0]["account_id"] == "001xx000000ABC"
    assert "ValueError" in errors[0]["exception"]


def test_errors_clear_between_runs():
    """Registry.errors should not accumulate across rows. Resets on each run() call."""
    r = Registry()
    r.register(_BadDeriver())
    r.run(_arch(), {"Id": "001xx0001"}, seeded_rng("a"))
    assert len(r.errors) == 1
    r.run(_arch(), {"Id": "001xx0002"}, seeded_rng("b"))
    # After the second run, errors list should reflect the second run only
    assert len(r.errors) == 1
    assert r.errors[0]["account_id"] == "001xx000000ABC"  # archetype's id


def test_no_errors_when_all_derivers_succeed():
    """Healthy derivers leave registry.errors empty."""
    r = Registry()
    r.register(_GoodDeriver())
    r.run(_arch(), {"Id": "001xx"}, seeded_rng("001xx"))
    assert r.errors == []


def test_applies_to_exception_also_isolated():
    """A bug in applies_to (not just derive) should also be caught."""
    r = Registry()

    class _BrokenAppliesTo:
        name = "broken"
        fields = ["X"]

        def applies_to(self, archetype):
            raise RuntimeError("applies_to crashed")

        def derive(self, archetype, record, rng):
            return {"X": 1}

    r.register(_BrokenAppliesTo())
    r.register(_GoodDeriver())
    out = r.run(_arch(), {"Id": "001xx"}, seeded_rng("001xx"))
    # GoodDeriver still ran
    assert out.get("GoodField__c") == "good"
    # The broken deriver's failure was captured
    assert any(e["deriver"] == "broken" for e in r.errors)
```

- [ ] **Step 2: Run → expected FAIL**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_backfill_exception_isolation.py -q
```

Expected: FAIL — Registry doesn't have `.errors` and doesn't catch exceptions.

- [ ] **Step 3: Read the existing Registry**

```bash
cat /Users/jsifontes/Documents/Git/JDO/Customer_Hydration/customer_hydration/derivers/_registry.py
```

- [ ] **Step 4: Modify _registry.py to add try/except + errors list**

Replace the entire content of `/Users/jsifontes/Documents/Git/JDO/Customer_Hydration/customer_hydration/derivers/_registry.py` with:

```python
"""Deriver registry — enumerates derivers and runs them per record.

Plan 4d: per-deriver exception isolation. If a deriver raises during
applies_to() or derive(), the failure is logged to registry.errors and the
loop continues with the next deriver. The orchestrator surfaces these in
the manifest.
"""
from __future__ import annotations

import logging
import traceback
from random import Random
from typing import Any

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._base import Deriver

logger = logging.getLogger(__name__)


class Registry:
    """Holds an ordered list of derivers and runs them in registration order.

    Each deriver's output is merged into the candidates dict; later derivers
    can overwrite earlier values (rare; should not happen given disjoint
    field ownership).

    Plan 4d: each call resets ``self.errors`` and accumulates one entry
    per deriver that raises during ``applies_to`` or ``derive``.
    """

    def __init__(self) -> None:
        self.derivers: list[Deriver] = []
        self.errors: list[dict] = []

    def register(self, deriver: Deriver) -> None:
        self.derivers.append(deriver)

    def run(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        """Run all applicable derivers; return merged candidates dict.

        Resets ``self.errors`` at the start of each call. A deriver that
        raises is captured in ``self.errors`` and skipped — the loop
        continues with the next deriver.
        """
        self.errors = []
        candidates: dict[str, Any] = {}
        for d in self.derivers:
            try:
                if not d.applies_to(archetype):
                    continue
                candidates.update(d.derive(archetype, record, rng))
            except Exception as exc:  # noqa: BLE001
                self.errors.append({
                    "deriver": getattr(d, "name", repr(d)),
                    "account_id": archetype.account_id,
                    "exception": f"{type(exc).__name__}: {exc}",
                    "traceback": traceback.format_exc(),
                })
                logger.warning(
                    "Registry: deriver %r raised on account %s: %s",
                    getattr(d, "name", d), archetype.account_id, exc,
                )
        return candidates

    def all_owned_fields(self) -> list[str]:
        """Flat list of every field any registered deriver owns."""
        seen: set[str] = set()
        ordered: list[str] = []
        for d in self.derivers:
            for f in d.fields:
                if f not in seen:
                    seen.add(f)
                    ordered.append(f)
        return ordered
```

- [ ] **Step 5: Run isolation tests → expected PASS**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_backfill_exception_isolation.py -v
```

Expected: 5 PASS.

- [ ] **Step 6: Run the FULL suite — must not regress the 718 existing tests**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest -q 2>&1 | tail -3
```

Expected: ~723 PASS (718 + 5 new). The exception-isolation change is purely additive — existing healthy derivers still get their output merged.

- [ ] **Step 7: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add customer_hydration/derivers/_registry.py tests/test_backfill_exception_isolation.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
feat(customer-hydration): per-deriver exception isolation in Registry.run

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: SOQL fetch + chunking + filter clause builder

**Files:**
- Create: `customer_hydration/backfill/query.py`
- Create: `tests/test_backfill_query.py`

The query module owns three responsibilities: (1) build the SELECT clause from registry fields + the read-only inputs the archetype needs, (2) build the WHERE clause from --persona / --record-type filters, (3) chunk the SOQL fetch into 2,000-row pages. Spec §5.1 step T2 specifies SOQL (not Bulk Query) because Bulk Query has column-count limits Bulk 2.0 doesn't.

- [ ] **Step 1: Write the failing tests**

`/Users/jsifontes/Documents/Git/JDO/Customer_Hydration/tests/test_backfill_query.py`:

```python
"""Tests for the Phase 4d SOQL query builder + chunked fetch (spec §5.1)."""
from unittest.mock import MagicMock, call

import pytest

from customer_hydration.backfill.query import (
    PERSONA_PREFIX_MAP,
    build_select_clause,
    build_where_clause,
    fetch_account_chunks,
)


def test_build_select_includes_owned_fields_plus_anchors():
    """SELECT must include owned-by-deriver fields PLUS read-only anchors
    (CreatedDate, RecordType.Name, IsPersonAccount, External_ID__c, Id, AnnualIncome,
    AnnualRevenue, Industry, AccountSource, FinServ__Total* rollups, BillingCity,
    ShippingCity, Description, PersonBirthdate, PersonGender, PersonGenderIdentity,
    FinServ__MaritalStatus__pc, FinServ__NumberOfDependents__pc,
    FinServ__LastInteraction__c)."""
    owned = ["FinServ__CreditScore__c", "Tier__c"]
    soql_select = build_select_clause(owned)
    # Required anchors
    assert "Id" in soql_select
    assert "External_ID__c" in soql_select
    assert "RecordType.Name" in soql_select
    assert "IsPersonAccount" in soql_select
    assert "CreatedDate" in soql_select
    assert "FinServ__AnnualIncome__pc" in soql_select
    assert "AnnualRevenue" in soql_select
    assert "PersonBirthdate" in soql_select
    # Owned fields
    assert "FinServ__CreditScore__c" in soql_select
    assert "Tier__c" in soql_select


def test_build_select_deduplicates():
    """If owned list and anchors overlap (rare but possible), no duplicate columns."""
    owned = ["Id", "FinServ__CreditScore__c"]  # Id is already an anchor
    soql_select = build_select_clause(owned)
    # Count occurrences of "Id," (with the trailing comma to disambiguate)
    fields = [f.strip() for f in soql_select.split(",")]
    assert fields.count("Id") == 1


def test_build_where_no_filters_returns_empty_string():
    assert build_where_clause(persona=None, record_type=None) == ""


def test_build_where_persona_uses_external_id_prefix():
    """--persona retail → WHERE External_ID__c LIKE 'HYDRATE-RTL-%'."""
    where = build_where_clause(persona="retail", record_type=None)
    assert "External_ID__c LIKE 'HYDRATE-RTL-%'" in where


def test_build_where_multiple_personas():
    """--persona retail,wealth → both prefixes joined with OR."""
    where = build_where_clause(persona="retail,wealth", record_type=None)
    assert "HYDRATE-RTL-" in where
    assert "HYDRATE-WLT-" in where
    assert " OR " in where


def test_build_where_record_type_filter():
    """--record-type Business → WHERE RecordType.Name = 'Business'."""
    where = build_where_clause(persona=None, record_type="Business")
    assert "RecordType.Name = 'Business'" in where


def test_build_where_record_type_multiple():
    """--record-type Business,Household → Name IN ('Business', 'Household')."""
    where = build_where_clause(persona=None, record_type="Business,Household")
    assert "RecordType.Name IN" in where
    assert "Business" in where
    assert "Household" in where


def test_build_where_combines_persona_and_record_type_with_and():
    where = build_where_clause(persona="retail", record_type="FSC Person Accounts")
    assert "External_ID__c LIKE 'HYDRATE-RTL-%'" in where
    assert "RecordType.Name" in where
    assert " AND " in where


def test_persona_prefix_map_covers_known_personas():
    """All 5 hydration personas have External_ID__c prefixes."""
    assert PERSONA_PREFIX_MAP["retail"] == "HYDRATE-RTL-"
    assert PERSONA_PREFIX_MAP["wealth"] == "HYDRATE-WLT-"
    assert PERSONA_PREFIX_MAP["smb"] == "HYDRATE-SMB-"
    assert PERSONA_PREFIX_MAP["commercial"] == "HYDRATE-COM-"
    assert PERSONA_PREFIX_MAP["household"] == "HYDRATE-HH-"


def test_fetch_account_chunks_yields_lists_of_dicts():
    """fetch_account_chunks paginates via SfRunner.query and yields chunks."""
    sf_runner = MagicMock()
    # Simulate two chunks: first 2000 records, second 500 records
    sf_runner.query.side_effect = [
        [{"Id": f"001xx{i:06d}"} for i in range(2000)],
        [{"Id": f"001xx{i:06d}"} for i in range(2000, 2500)],
    ]
    chunks = list(fetch_account_chunks(
        sf_runner, owned_fields=["Tier__c"],
        persona=None, record_type=None,
        chunk_size=2000, limit=None,
    ))
    assert len(chunks) == 2
    assert len(chunks[0]) == 2000
    assert len(chunks[1]) == 500


def test_fetch_account_chunks_respects_limit():
    """If --limit 100, fetch only one chunk of 100 records max."""
    sf_runner = MagicMock()
    sf_runner.query.return_value = [{"Id": f"001xx{i:06d}"} for i in range(100)]
    chunks = list(fetch_account_chunks(
        sf_runner, owned_fields=["Tier__c"],
        persona=None, record_type=None,
        chunk_size=2000, limit=100,
    ))
    assert len(chunks) == 1
    assert len(chunks[0]) == 100
    # The SOQL passed to query must have LIMIT 100 in it
    assert "LIMIT 100" in sf_runner.query.call_args_list[0][0][0]
```

- [ ] **Step 2: Run → expected FAIL**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_backfill_query.py -q
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement query.py**

`/Users/jsifontes/Documents/Git/JDO/Customer_Hydration/customer_hydration/backfill/query.py`:

```python
"""Phase 4d SOQL query builder + chunked fetch.

Builds the SELECT clause (owned-by-deriver fields + read-only anchors),
the WHERE clause (--persona, --record-type filters), and yields chunks
of 2,000-row SOQL pages via SfRunner.query.

Why SOQL not Bulk Query: spec §5.1 — Bulk Query has column-count limits
Bulk 2.0 (the upsert side) doesn't, so SOQL is the only path that fits
~110 columns of fetch.
"""
from __future__ import annotations

from typing import Iterable, Iterator


# Read-only anchors the archetype + derivers need but don't write.
# Order doesn't matter — the SELECT builder dedupes against owned_fields.
_REQUIRED_ANCHORS: list[str] = [
    "Id",
    "External_ID__c",
    "RecordType.Name",
    "IsPersonAccount",
    "CreatedDate",
    "FinServ__AnnualIncome__pc",
    "AnnualRevenue",
    "Industry",
    "AccountSource",
    "PersonBirthdate",
    "PersonGender",
    "PersonGenderIdentity",
    "FinServ__MaritalStatus__pc",
    "FinServ__NumberOfDependents__pc",
    "FinServ__LastInteraction__c",
    "BillingCity",
    "ShippingCity",
    "NumberOfEmployees",
    "Description",
    "FinServ__TotalInvestments__c",
    "FinServ__TotalBankDeposits__c",
    "FinServ__TotalNonfinancialAssets__c",
    "FinServ__TotalLiabilities__c",
    "FinServ__CreditScore__c",
    "FinServ__CreditRating__c",
]


# CLI --persona value → External_ID__c prefix.
PERSONA_PREFIX_MAP: dict[str, str] = {
    "retail":     "HYDRATE-RTL-",
    "wealth":     "HYDRATE-WLT-",
    "smb":        "HYDRATE-SMB-",
    "commercial": "HYDRATE-COM-",
    "household":  "HYDRATE-HH-",
}


def build_select_clause(owned_fields: list[str]) -> str:
    """Build the comma-separated SELECT field list. Dedupes against anchors.

    Returns just the field list, not the full 'SELECT ... FROM' — the caller
    composes that with the FROM Account clause + WHERE/LIMIT.
    """
    seen: set[str] = set()
    ordered: list[str] = []
    for f in (*_REQUIRED_ANCHORS, *owned_fields):
        if f not in seen:
            seen.add(f)
            ordered.append(f)
    return ", ".join(ordered)


def build_where_clause(persona: str | None, record_type: str | None) -> str:
    """Build the WHERE clause body (without the leading 'WHERE ').

    Returns an empty string when neither filter is set. Caller checks for
    truthiness before splicing in 'WHERE '.
    """
    parts: list[str] = []

    if persona:
        prefixes = []
        for p in persona.split(","):
            p = p.strip().lower()
            prefix = PERSONA_PREFIX_MAP.get(p)
            if prefix:
                prefixes.append(prefix)
        if prefixes:
            ors = " OR ".join(f"External_ID__c LIKE '{p}%'" for p in prefixes)
            parts.append(f"({ors})")

    if record_type:
        rts = [r.strip() for r in record_type.split(",") if r.strip()]
        if len(rts) == 1:
            parts.append(f"RecordType.Name = '{rts[0]}'")
        elif len(rts) > 1:
            joined = ", ".join(f"'{r}'" for r in rts)
            parts.append(f"RecordType.Name IN ({joined})")

    return " AND ".join(parts)


def fetch_account_chunks(
    sf_runner,
    *,
    owned_fields: list[str],
    persona: str | None,
    record_type: str | None,
    chunk_size: int = 2000,
    limit: int | None = None,
) -> Iterator[list[dict]]:
    """Yield successive chunks of Account records.

    Each chunk is up to chunk_size records. If --limit is set, the total
    yielded record count is capped at limit (single chunk if limit <= chunk_size).

    Pagination: spec §5.1 calls for OFFSET-based paging. SF SOQL OFFSET is
    capped at 2,000 — for full-org runs we use OrderBy(Id) + last-Id-as-cursor
    (keyset pagination). For Plan 4d v1 we use LIMIT alone, accepting that
    the org-side cap is 50,000 rows per query. If --limit is None, we issue
    multiple queries with `WHERE Id > 'previous_max'` to walk the full set.
    """
    select_clause = build_select_clause(owned_fields)
    where_body = build_where_clause(persona, record_type)
    where_prefix = f" WHERE {where_body}" if where_body else ""

    if limit is not None:
        # Single-shot path: fetch up to `limit` records, no pagination loop.
        page_size = min(limit, chunk_size)
        soql = (
            f"SELECT {select_clause} FROM Account{where_prefix} "
            f"ORDER BY Id LIMIT {page_size}"
        )
        # NB: the caller's mock asserts the literal "LIMIT 100" substring.
        records = sf_runner.query(soql)
        if records:
            yield records
        return

    # No limit → keyset-paginate by Id ascending until the page is short.
    last_id: str | None = None
    yielded = 0
    while True:
        cursor = f" AND Id > '{last_id}'" if last_id else ""
        if not where_prefix and last_id:
            cursor = f" WHERE Id > '{last_id}'"
        soql = (
            f"SELECT {select_clause} FROM Account{where_prefix}{cursor} "
            f"ORDER BY Id LIMIT {chunk_size}"
        )
        records = sf_runner.query(soql)
        if not records:
            return
        yield records
        yielded += len(records)
        if len(records) < chunk_size:
            return
        last_id = records[-1]["Id"]
```

- [ ] **Step 4: Run query tests → expected PASS**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_backfill_query.py -v
```

Expected: 11 PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add customer_hydration/backfill/query.py tests/test_backfill_query.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
feat(customer-hydration): SOQL query builder + chunked fetch + filter clauses

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Sparse-CSV builder + bulk_upsert wrapper

**Files:**
- Create: `customer_hydration/backfill/upsert.py`
- Create: `tests/test_backfill_upsert.py`

Plan 4a's orchestrator hand-rolled the CSV with a sorted column list and `","`.join — that doesn't escape commas/quotes/newlines, and `External_ID__c` ends up wherever it sorts alphabetically. Plan 4d uses `csv.DictWriter` with proper escaping AND forces `External_ID__c` to position 0.

- [ ] **Step 1: Write the failing tests**

`/Users/jsifontes/Documents/Git/JDO/Customer_Hydration/tests/test_backfill_upsert.py`:

```python
"""Tests for the Phase 4d sparse-CSV builder and bulk_upsert wrapper."""
import csv
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from customer_hydration.backfill.upsert import (
    write_sparse_csv,
    upsert_to_org,
    PARTIAL_FAILURE_THRESHOLD_PCT,
)


def test_write_sparse_csv_external_id_is_first_column(tmp_path):
    """External_ID__c MUST be column 0 regardless of alphabetical position."""
    rows = [
        {"External_ID__c": "HYDRATE-RTL-001", "Tier__c": "Bronze", "AnnualRevenue": 0},
    ]
    out = tmp_path / "out.csv"
    write_sparse_csv(out, rows)
    with out.open() as fh:
        header = fh.readline().strip().split(",")
    assert header[0] == "External_ID__c"


def test_write_sparse_csv_remaining_columns_sorted(tmp_path):
    """Non-external-id columns are sorted alphabetically for determinism."""
    rows = [
        {"External_ID__c": "X1", "Tier__c": "Bronze", "AnnualRevenue": 0,
         "FinServ__CreditScore__c": 700},
    ]
    out = tmp_path / "out.csv"
    write_sparse_csv(out, rows)
    with out.open() as fh:
        header = fh.readline().strip().split(",")
    assert header == ["External_ID__c", "AnnualRevenue", "FinServ__CreditScore__c", "Tier__c"]


def test_write_sparse_csv_blank_cells_for_missing_keys(tmp_path):
    """Sparse rows: cells absent in a row's dict come out as empty strings."""
    rows = [
        {"External_ID__c": "X1", "Tier__c": "Bronze"},
        {"External_ID__c": "X2", "FinServ__CreditScore__c": 700},
    ]
    out = tmp_path / "out.csv"
    write_sparse_csv(out, rows)
    with out.open() as fh:
        reader = csv.DictReader(fh)
        records = list(reader)
    # First row has Tier but not CreditScore
    assert records[0]["Tier__c"] == "Bronze"
    assert records[0]["FinServ__CreditScore__c"] == ""
    # Second row has CreditScore but not Tier
    assert records[1]["Tier__c"] == ""
    assert records[1]["FinServ__CreditScore__c"] == "700"


def test_write_sparse_csv_escapes_commas_in_values(tmp_path):
    """Values containing commas (Description text) must be properly escaped."""
    rows = [{
        "External_ID__c": "X1",
        "Description": "A, B, and C are clients",
    }]
    out = tmp_path / "out.csv"
    write_sparse_csv(out, rows)
    with out.open() as fh:
        reader = csv.DictReader(fh)
        records = list(reader)
    assert records[0]["Description"] == "A, B, and C are clients"


def test_write_sparse_csv_lf_line_endings(tmp_path):
    """Bulk API 2.0 requires LF, not CRLF (AGENTS.md note 4)."""
    rows = [{"External_ID__c": "X1", "Tier__c": "Bronze"}]
    out = tmp_path / "out.csv"
    write_sparse_csv(out, rows)
    raw = out.read_bytes()
    assert b"\r\n" not in raw
    assert raw.endswith(b"\n")


def test_write_sparse_csv_handles_empty_rows(tmp_path):
    """Empty input: writes a header-only file with just External_ID__c."""
    out = tmp_path / "out.csv"
    write_sparse_csv(out, [])
    text = out.read_text()
    assert text.strip() == "External_ID__c"


def test_partial_failure_threshold_is_one_percent():
    """Spec §6.1: failedRowPct > 1% → rc=2."""
    assert PARTIAL_FAILURE_THRESHOLD_PCT == 1.0


def test_upsert_to_org_invokes_bulk_upsert_and_returns_result(tmp_path):
    """The wrapper calls loader._legacy.bulk_upsert and returns the result."""
    csv_path = tmp_path / "out.csv"
    csv_path.write_text("External_ID__c,Tier__c\nX1,Bronze\n")

    # Patch loader._legacy.bulk_upsert to a stub that returns a fake BulkLoadResult-like.
    fake_result = MagicMock()
    fake_result.records_processed = 1
    fake_result.records_failed = 0

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            "customer_hydration.backfill.upsert._bulk_upsert",
            lambda **kwargs: fake_result,
        )
        result = upsert_to_org(
            csv_path=csv_path,
            target_org="mock",
            sobject="Account",
            external_id_field="External_ID__c",
        )
    assert result is fake_result
```

- [ ] **Step 2: Run → expected FAIL**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_backfill_upsert.py -q
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement upsert.py**

`/Users/jsifontes/Documents/Git/JDO/Customer_Hydration/customer_hydration/backfill/upsert.py`:

```python
"""Phase 4d sparse-CSV builder + bulk_upsert wrapper.

The sparse-CSV builder forces External_ID__c to column 0 (so demos and
manifests are readable) and uses csv.DictWriter for proper escaping. The
bulk_upsert wrapper just calls into the existing loader._legacy module.
"""
from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

from customer_hydration.loader._legacy import bulk_upsert as _bulk_upsert


PARTIAL_FAILURE_THRESHOLD_PCT: float = 1.0  # > this % failed rows → rc=2 (spec §6.1)


def write_sparse_csv(csv_path: Path, rows: list[dict[str, Any]]) -> None:
    """Write a sparse CSV with External_ID__c first, remaining columns sorted.

    LF line endings (Bulk API 2.0 requirement, AGENTS.md note 4).
    Properly escaped via csv.DictWriter.
    Empty rows produces a header-only file with just External_ID__c.
    """
    csv_path = Path(csv_path)
    csv_path.parent.mkdir(parents=True, exist_ok=True)

    if not rows:
        # Header-only file
        with csv_path.open("w", encoding="utf-8", newline="\n") as fh:
            fh.write("External_ID__c\n")
        return

    # Collect all columns across rows; force External_ID__c to position 0.
    all_cols = set()
    for row in rows:
        all_cols.update(row.keys())
    all_cols.discard("External_ID__c")
    columns = ["External_ID__c", *sorted(all_cols)]

    # Write with explicit LF newline (Bulk API 2.0 requires it; csv.DictWriter
    # honors the file's newline= setting).
    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh, fieldnames=columns, lineterminator="\n", extrasaction="ignore"
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def upsert_to_org(
    *,
    csv_path: Path,
    target_org: str,
    sobject: str = "Account",
    external_id_field: str = "External_ID__c",
    wait_minutes: int = 30,
):
    """Wrapper around loader._legacy.bulk_upsert. Returns its BulkLoadResult."""
    return _bulk_upsert(
        csv_path=csv_path,
        sobject=sobject,
        external_id_field=external_id_field,
        target_org=target_org,
        wait_minutes=wait_minutes,
    )
```

- [ ] **Step 4: Run upsert tests → expected PASS**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_backfill_upsert.py -v
```

Expected: 8 PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add customer_hydration/backfill/upsert.py tests/test_backfill_upsert.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
feat(customer-hydration): sparse-CSV builder (External_ID__c first) + bulk_upsert wrapper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: DC stream refresh trigger

**Files:**
- Create: `customer_hydration/backfill/dc_refresh.py`
- Create: `tests/test_backfill_dc_refresh.py`

The DC refresh module wraps `phase5.data_cloud.trigger_stream_refresh` with the Plan 4d-specific contract: resolve the org's `(instance_url, access_token)` once, trigger the configured Account stream, return `(status_str, run_id_or_None, ui_fallback_message_or_None)`. The HTTP-412 case (UPSERT-mode stream) doesn't fail the run — it returns a status that the orchestrator emits in stderr alongside the `dc-stream-full-refresh-via-ui` skill invocation.

- [ ] **Step 1: Write the failing tests**

`/Users/jsifontes/Documents/Git/JDO/Customer_Hydration/tests/test_backfill_dc_refresh.py`:

```python
"""Tests for the Phase 4d DC stream refresh trigger (spec §6.2 row 'DC stream is refreshMode UPSERT')."""
from unittest.mock import MagicMock, patch

import pytest

from customer_hydration.backfill.dc_refresh import (
    DEFAULT_ACCOUNT_STREAM_NAME,
    refresh_account_stream,
)


def test_default_account_stream_name():
    """Sane default that operators can override via --account-stream flag if needed."""
    assert DEFAULT_ACCOUNT_STREAM_NAME == "Account_jdo"


@patch("customer_hydration.backfill.dc_refresh.get_org_session")
@patch("customer_hydration.backfill.dc_refresh.trigger_stream_refresh")
def test_refresh_account_stream_calls_trigger_with_resolved_creds(
    mock_trigger, mock_get_session,
):
    mock_get_session.return_value = ("https://example.my.salesforce.com", "TOKEN_X")
    mock_trigger.return_value = (True, "07Lxx00000004XY", None)
    status, run_id, fallback = refresh_account_stream(
        target_org="mock", stream_name="Account_jdo",
    )
    assert status == "Triggered"
    assert run_id == "07Lxx00000004XY"
    assert fallback is None
    mock_trigger.assert_called_once_with(
        "https://example.my.salesforce.com", "TOKEN_X", "Account_jdo",
    )


@patch("customer_hydration.backfill.dc_refresh.get_org_session")
@patch("customer_hydration.backfill.dc_refresh.trigger_stream_refresh")
def test_refresh_account_stream_412_returns_ui_fallback_message(
    mock_trigger, mock_get_session,
):
    """HTTP 412 from actions/run → status='PolicySkipped' + fallback message."""
    mock_get_session.return_value = ("https://example.my.salesforce.com", "TOKEN_X")
    mock_trigger.return_value = (
        False, None,
        "412 Precondition Failed: stream is in UPSERT refresh mode",
    )
    status, run_id, fallback = refresh_account_stream(
        target_org="mock", stream_name="Account_jdo",
    )
    assert status == "PolicySkipped"
    assert run_id is None
    assert "dc-stream-full-refresh-via-ui" in fallback


@patch("customer_hydration.backfill.dc_refresh.get_org_session")
@patch("customer_hydration.backfill.dc_refresh.trigger_stream_refresh")
def test_refresh_account_stream_404_returns_skipped(
    mock_trigger, mock_get_session,
):
    """Stream not found → status='Skipped' + nudge in fallback message."""
    mock_get_session.return_value = ("https://example.my.salesforce.com", "TOKEN_X")
    mock_trigger.return_value = (False, None, "404 Not Found")
    status, run_id, fallback = refresh_account_stream(
        target_org="mock", stream_name="DoesNotExist",
    )
    assert status == "Skipped"
    assert run_id is None
    assert "DoesNotExist" in fallback


@patch("customer_hydration.backfill.dc_refresh.get_org_session")
def test_refresh_account_stream_session_error_returns_skipped(mock_get_session):
    """If get_org_session raises, refresh is skipped — don't fail the run."""
    mock_get_session.side_effect = RuntimeError("sf org display failed")
    status, run_id, fallback = refresh_account_stream(
        target_org="mock", stream_name="Account_jdo",
    )
    assert status == "Skipped"
    assert run_id is None
    assert "sf org display failed" in fallback


@patch("customer_hydration.backfill.dc_refresh.get_org_session")
@patch("customer_hydration.backfill.dc_refresh.trigger_stream_refresh")
def test_refresh_account_stream_other_failure_returns_failed(
    mock_trigger, mock_get_session,
):
    """500 or other non-policy failure → status='Failed'."""
    mock_get_session.return_value = ("https://example.my.salesforce.com", "TOKEN_X")
    mock_trigger.return_value = (False, None, "500 Internal Server Error")
    status, run_id, fallback = refresh_account_stream(
        target_org="mock", stream_name="Account_jdo",
    )
    assert status == "Failed"
    assert run_id is None
    assert "500" in fallback
```

- [ ] **Step 2: Run → expected FAIL**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_backfill_dc_refresh.py -q
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement dc_refresh.py**

`/Users/jsifontes/Documents/Git/JDO/Customer_Hydration/customer_hydration/backfill/dc_refresh.py`:

```python
"""Phase 4d DC stream refresh trigger.

Wraps phase5.data_cloud primitives with the Plan 4d-specific contract:
return (status, run_id, fallback_message) so the orchestrator can emit
the right manifest entry + a follow-up nudge when the stream is in
UPSERT refresh mode (spec §6.2 row 'DC stream is refreshMode UPSERT').
"""
from __future__ import annotations

import logging

from customer_hydration.phase5.data_cloud import (
    get_org_session,
    trigger_stream_refresh,
)

logger = logging.getLogger(__name__)


# Default stream name. Operators can override via the orchestrator argument.
# Matches the SalesforceDotCom-typed Account stream the JDO demo orgs ship.
DEFAULT_ACCOUNT_STREAM_NAME: str = "Account_jdo"


_UI_FALLBACK_HINT = (
    "Stream {stream!r} returned HTTP 412 — it is in UPSERT refresh mode and "
    "REST cannot trigger a one-shot full refresh. Run the playwright fallback: "
    "skill `dc-stream-full-refresh-via-ui` (see AGENTS.md note 18)."
)


def refresh_account_stream(
    *,
    target_org: str,
    stream_name: str = DEFAULT_ACCOUNT_STREAM_NAME,
) -> tuple[str, str | None, str | None]:
    """Trigger the Account stream refresh. Returns (status, run_id, fallback_message).

    status is one of:
      - 'Triggered'      — REST trigger succeeded
      - 'PolicySkipped'  — stream is UPSERT-mode (412); fallback_message guides the operator
      - 'Skipped'        — stream not found or auth resolution failed
      - 'Failed'         — other non-policy failure (5xx, network, etc.)

    fallback_message is None on success; otherwise a human-readable hint.

    Never raises — all errors are returned as Skipped/Failed. The orchestrator
    decides whether to surface them as warnings (rc=0) or partial-failure (rc=2).
    """
    try:
        instance_url, access_token = get_org_session(target_org)
    except Exception as exc:  # noqa: BLE001
        logger.warning("DC refresh skipped — cannot resolve org session: %s", exc)
        return ("Skipped", None, f"sf org display failed: {exc}")

    success, run_id, error = trigger_stream_refresh(
        instance_url, access_token, stream_name,
    )
    if success:
        return ("Triggered", run_id, None)

    err_text = error or ""
    if "412" in err_text or "UPSERT" in err_text.upper():
        return (
            "PolicySkipped",
            None,
            _UI_FALLBACK_HINT.format(stream=stream_name),
        )
    if "404" in err_text or "not found" in err_text.lower():
        return (
            "Skipped",
            None,
            f"Stream {stream_name!r} not found in org: {err_text}",
        )
    return ("Failed", None, err_text)
```

- [ ] **Step 4: Run dc_refresh tests → expected PASS**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_backfill_dc_refresh.py -v
```

Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add customer_hydration/backfill/dc_refresh.py tests/test_backfill_dc_refresh.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
feat(customer-hydration): DC stream refresh trigger with UI-fallback nudge

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wire live SOQL + bulk upsert + DC refresh into the orchestrator

**Files:**
- Modify: `customer_hydration/backfill_accounts.py`
- Modify: `tests/test_backfill_skeleton.py`
- Create: `tests/test_backfill_accounts.py` — integration tests

The orchestrator gets a substantial rewrite: replace the in-memory `records=None` short-circuit with a live SOQL fetch, wire the new bulk_upsert + dc_refresh + production_guard, honor the CLI flags, switch the CSV writer to use `write_sparse_csv`, and emit the full manifest schema.

The integration test file is new — it tests the orchestrator end-to-end with mocked SfRunner / bulk_upsert / dc_refresh. Spec §7.4 calls for these.

- [ ] **Step 1: Read the existing orchestrator**

```bash
cat /Users/jsifontes/Documents/Git/JDO/Customer_Hydration/customer_hydration/backfill_accounts.py
```

- [ ] **Step 2: Write the failing integration tests**

Create `/Users/jsifontes/Documents/Git/JDO/Customer_Hydration/tests/test_backfill_accounts.py`:

```python
"""Phase 4d integration tests — orchestrator + loader/refresh wiring (spec §7.4)."""
import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from customer_hydration import backfill_accounts


def _fixture_record(account_id="001xx0000RTL01") -> dict:
    return {
        "Id": account_id,
        "External_ID__c": "HYDRATE-RTL-000001",
        "RecordType.Name": "FSC Person Accounts",
        "IsPersonAccount": True,
        "CreatedDate": "2018-04-12T10:00:00Z",
        "PersonBirthdate": "1971-08-23",
        "PersonGender": "Female",
        "FinServ__MaritalStatus__pc": "Married",
        "FinServ__NumberOfDependents__pc": 2,
        "FinServ__AnnualIncome__pc": 250000,
        "AnnualRevenue": None,
        "FinServ__LastInteraction__c": "2026-05-12",
        "Industry": None,
    }


def test_dry_run_skips_bulk_upsert_and_dc_refresh(tmp_path):
    """--dry-run mode: write CSV + manifest, don't call loader or DC refresh."""
    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        records=[_fixture_record()],
        life_events_by_id={},
    )
    assert rc == 0
    assert (out_dir / "account_backfill.csv").exists()
    assert (out_dir / "manifest.json").exists()
    manifest = json.loads((out_dir / "manifest.json").read_text())
    # Bulk and DC sections are None / absent in dry-run
    assert manifest["bulk_load"] is None
    assert manifest["dc_refresh"] is None


@patch("customer_hydration.backfill_accounts.upsert_to_org")
@patch("customer_hydration.backfill_accounts.refresh_account_stream")
def test_full_run_calls_bulk_upsert_and_refresh(
    mock_refresh, mock_upsert, tmp_path,
):
    """Non-dry-run: bulk_upsert called once, dc_refresh called once."""
    fake_bulk = MagicMock()
    fake_bulk.records_processed = 1
    fake_bulk.records_failed = 0
    mock_upsert.return_value = fake_bulk
    mock_refresh.return_value = ("Triggered", "07Lxx00004XY", None)

    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=False,
        records=[_fixture_record()],
        life_events_by_id={},
    )
    assert rc == 0
    assert mock_upsert.call_count == 1
    assert mock_refresh.call_count == 1
    manifest = json.loads((out_dir / "manifest.json").read_text())
    assert manifest["bulk_load"]["rows_processed"] == 1
    assert manifest["dc_refresh"]["status"] == "Triggered"


@patch("customer_hydration.backfill_accounts.upsert_to_org")
@patch("customer_hydration.backfill_accounts.refresh_account_stream")
def test_skip_refresh_stream_flag(mock_refresh, mock_upsert, tmp_path):
    """--skip-refresh-stream: bulk_upsert called, dc_refresh NOT called."""
    fake_bulk = MagicMock()
    fake_bulk.records_processed = 1
    fake_bulk.records_failed = 0
    mock_upsert.return_value = fake_bulk

    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=False,
        skip_refresh_stream=True,
        records=[_fixture_record()],
        life_events_by_id={},
    )
    assert rc == 0
    assert mock_upsert.call_count == 1
    assert mock_refresh.call_count == 0


@patch("customer_hydration.backfill_accounts.upsert_to_org")
@patch("customer_hydration.backfill_accounts.refresh_account_stream")
def test_bulk_partial_failure_above_threshold_returns_rc_2(
    mock_refresh, mock_upsert, tmp_path,
):
    """If bulk_upsert reports >1% failed rows → exit rc=2."""
    fake_bulk = MagicMock()
    fake_bulk.records_processed = 100
    fake_bulk.records_failed = 5  # 5% failed > 1% threshold
    mock_upsert.return_value = fake_bulk
    mock_refresh.return_value = ("Triggered", "07Lxx", None)

    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=False,
        records=[_fixture_record(account_id=f"001xx{i:08d}") for i in range(100)],
        life_events_by_id={},
    )
    assert rc == 2


@patch("customer_hydration.backfill_accounts.upsert_to_org")
@patch("customer_hydration.backfill_accounts.refresh_account_stream")
def test_strict_mode_treats_any_failure_as_rc_2(
    mock_refresh, mock_upsert, tmp_path,
):
    """--strict: even 1 failed row out of 100 (1%) → rc=2."""
    fake_bulk = MagicMock()
    fake_bulk.records_processed = 100
    fake_bulk.records_failed = 1  # 1% — at threshold but not over
    mock_upsert.return_value = fake_bulk
    mock_refresh.return_value = ("Triggered", "07Lxx", None)

    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=False,
        strict=True,
        records=[_fixture_record(account_id=f"001xx{i:08d}") for i in range(100)],
        life_events_by_id={},
    )
    assert rc == 2


@patch("customer_hydration.backfill_accounts.upsert_to_org")
@patch("customer_hydration.backfill_accounts.refresh_account_stream")
def test_dc_refresh_policy_skipped_does_not_fail_run(
    mock_refresh, mock_upsert, tmp_path,
):
    """DC stream returns PolicySkipped → manifest captures it, rc still 0."""
    fake_bulk = MagicMock()
    fake_bulk.records_processed = 1
    fake_bulk.records_failed = 0
    mock_upsert.return_value = fake_bulk
    mock_refresh.return_value = (
        "PolicySkipped", None,
        "Stream is in UPSERT refresh mode — use dc-stream-full-refresh-via-ui",
    )

    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=False,
        records=[_fixture_record()],
        life_events_by_id={},
    )
    assert rc == 0
    manifest = json.loads((out_dir / "manifest.json").read_text())
    assert manifest["dc_refresh"]["status"] == "PolicySkipped"
    assert "dc-stream-full-refresh-via-ui" in manifest["dc_refresh"]["fallback_message"]


def test_require_external_id_skips_rows_without_one(tmp_path):
    """--require-external-id: records missing External_ID__c are skipped, not BACKFILL-stamped."""
    record_no_ext = _fixture_record()
    del record_no_ext["External_ID__c"]
    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        require_external_id=True,
        records=[record_no_ext],
        life_events_by_id={},
    )
    assert rc == 0
    manifest = json.loads((out_dir / "manifest.json").read_text())
    assert manifest["derivation"]["rows_skipped_no_external_id"] == 1
    assert manifest["derivation"]["rows_with_deltas"] == 0


def test_persona_filter_passes_to_query(tmp_path):
    """When records=None and --persona retail set, the SOQL query uses HYDRATE-RTL- prefix."""
    sf_runner = MagicMock()
    sf_runner.query.return_value = []  # empty result set, just want to verify the SOQL
    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        persona="retail",
        sf_runner=sf_runner,  # injected for testing
        records=None,
        life_events_by_id=None,
    )
    assert rc == 0
    # The first call's first positional arg is the SOQL string
    soql = sf_runner.query.call_args_list[0][0][0]
    assert "HYDRATE-RTL-" in soql


def test_record_type_filter_passes_to_query(tmp_path):
    """--record-type Business → SOQL contains the RT clause."""
    sf_runner = MagicMock()
    sf_runner.query.return_value = []
    out_dir = tmp_path / "run"
    backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        record_type="Business",
        sf_runner=sf_runner,
        records=None,
        life_events_by_id=None,
    )
    soql = sf_runner.query.call_args_list[0][0][0]
    assert "RecordType.Name" in soql
    assert "Business" in soql


def test_limit_caps_query_size(tmp_path):
    """--limit 50 → SOQL contains LIMIT 50."""
    sf_runner = MagicMock()
    sf_runner.query.return_value = []
    out_dir = tmp_path / "run"
    backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        limit=50,
        sf_runner=sf_runner,
        records=None,
        life_events_by_id=None,
    )
    soql = sf_runner.query.call_args_list[0][0][0]
    assert "LIMIT 50" in soql


def test_per_field_fill_counts_in_manifest(tmp_path):
    """Manifest's derivation.per_field_fill_counts records each field's count."""
    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        records=[_fixture_record()],
        life_events_by_id={},
    )
    assert rc == 0
    manifest = json.loads((out_dir / "manifest.json").read_text())
    counts = manifest["derivation"]["per_field_fill_counts"]
    # At least Tier__c and CreditScore should appear (deriver-produced)
    assert counts.get("Tier__c", 0) >= 1
    assert counts.get("FinServ__CreditScore__c", 0) >= 1


def test_per_persona_counts_in_manifest(tmp_path):
    """Manifest's derivation.per_persona_counts records the count per persona."""
    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        records=[_fixture_record()],
        life_events_by_id={},
    )
    assert rc == 0
    manifest = json.loads((out_dir / "manifest.json").read_text())
    counts = manifest["derivation"]["per_persona_counts"]
    assert counts.get("retail", 0) == 1
```

- [ ] **Step 3: Run integration tests → expected FAIL**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_backfill_accounts.py -q
```

Expected: most tests FAIL — the orchestrator doesn't yet wire bulk_upsert / refresh_account_stream / new flags / new manifest fields.

- [ ] **Step 4: Rewrite the orchestrator**

Replace the entire content of `/Users/jsifontes/Documents/Git/JDO/Customer_Hydration/customer_hydration/backfill_accounts.py` with:

```python
"""Phase 4 backfill orchestrator.

Reads existing Account records, builds a PersonaArchetype per record, runs
the deriver registry (with per-deriver exception isolation), runs the
coverage-rules pass, null-filters, writes a sparse CSV, and (unless --dry-run)
bulk-upserts via External_ID__c and triggers the Account DC stream refresh.

Spec: docs/superpowers/specs/2026-05-26-phase-4-account-backfill-design.md
"""
from __future__ import annotations

import json
import logging
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from customer_hydration.backfill.dc_refresh import refresh_account_stream
from customer_hydration.backfill.exit_codes import (
    OK,
    BULK_HARD_FAILURE,
    BULK_PARTIAL_FAILURE,
    PRODUCTION_GUARD,
)
from customer_hydration.backfill.production_guard import enforce_production_guard
from customer_hydration.backfill.query import fetch_account_chunks
from customer_hydration.backfill.upsert import (
    PARTIAL_FAILURE_THRESHOLD_PCT,
    upsert_to_org,
    write_sparse_csv,
)
from customer_hydration.coverage_rules import apply_coverage_rules
from customer_hydration.derivers._archetype import build_archetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers._registry import Registry
from customer_hydration.sf_runner import SfRunner

logger = logging.getLogger(__name__)


def _build_registry() -> Registry:
    """Build the deriver registry with all seven derivers.

    Plan 4b: relationship, credit_personal, profile (person), demographics,
             addresses (person), contact (person).
    Plan 4c: credit_bureau (B2B). The Plan 4b derivers also got B2B branches
             added in Plan 4c, so they apply to both.
    """
    from customer_hydration.derivers.relationship import RelationshipDeriver
    from customer_hydration.derivers.credit_personal import CreditPersonalDeriver
    from customer_hydration.derivers.credit_bureau import CreditBureauDeriver
    from customer_hydration.derivers.profile import ProfileDeriver
    from customer_hydration.derivers.demographics import DemographicsDeriver
    from customer_hydration.derivers.addresses import AddressesDeriver
    from customer_hydration.derivers.contact import ContactDeriver

    registry = Registry()
    registry.register(RelationshipDeriver())
    registry.register(CreditPersonalDeriver())
    registry.register(CreditBureauDeriver())
    registry.register(ProfileDeriver())
    registry.register(DemographicsDeriver())
    registry.register(AddressesDeriver())
    registry.register(ContactDeriver())
    return registry


def _resolve_org_id(target_org: str) -> str | None:
    """Look up the org id for a target alias via `sf org display`. None on failure."""
    import subprocess
    try:
        proc = subprocess.run(
            ["sf", "org", "display", "--target-org", target_org, "--json"],
            capture_output=True, text=True, check=False, timeout=30,
        )
        if proc.returncode != 0:
            return None
        payload = json.loads(proc.stdout)
        return payload.get("result", {}).get("id")
    except Exception:  # noqa: BLE001
        return None


def run_backfill(
    *,
    target_org: str,
    output_dir: Path,
    dry_run: bool = False,
    persona: str | None = None,
    record_type: str | None = None,
    limit: int | None = None,
    skip_refresh_stream: bool = False,
    strict: bool = False,
    require_external_id: bool = False,
    allow_production: bool = False,
    records: list[dict] | None = None,
    life_events_by_id: dict[str, list[dict]] | None = None,
    sf_runner=None,
    account_stream_name: str | None = None,
) -> int:
    """Run the Phase 4 backfill against the target org.

    Returns an exit code from customer_hydration.backfill.exit_codes.

    When `records` is provided, the function uses them and never calls SOQL.
    When `records` is None, the function fetches via `sf_runner.query` (or a
    new SfRunner instance if `sf_runner` is None).
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    started_at = datetime.now(timezone.utc).isoformat()

    # Production guard
    org_id = _resolve_org_id(target_org)
    if org_id:
        try:
            enforce_production_guard(org_id, allow_production=allow_production)
        except PermissionError as exc:
            _write_manifest(
                output_dir, target_org=target_org, started_at=started_at,
                rc=PRODUCTION_GUARD, errors=[str(exc)],
            )
            return PRODUCTION_GUARD

    registry = _build_registry()

    # Fetch records (live SOQL) or use injected
    if records is None:
        runner = sf_runner or SfRunner(target_org=target_org)
        all_chunks: list[list[dict]] = list(fetch_account_chunks(
            runner,
            owned_fields=registry.all_owned_fields(),
            persona=persona,
            record_type=record_type,
            chunk_size=2000,
            limit=limit,
        ))
        records = [r for chunk in all_chunks for r in chunk]
    if life_events_by_id is None:
        life_events_by_id = {}

    # Derive
    rows_with_deltas = 0
    rows_skipped_already_full = 0
    rows_skipped_no_external_id = 0
    rows_with_deriver_errors = 0
    per_field_counts: Counter = Counter()
    per_persona_counts: Counter = Counter()
    output_buffer: list[dict[str, Any]] = []
    derivation_errors: list[dict] = []

    for record in records:
        rng = seeded_rng(record["Id"])
        archetype = build_archetype(
            record, rng,
            life_events=life_events_by_id.get(record["Id"], []),
        )
        candidates = registry.run(archetype, record, rng)
        if registry.errors:
            rows_with_deriver_errors += 1
            derivation_errors.extend(registry.errors)

        delta = {f: v for f, v in candidates.items() if record.get(f) is None}
        apply_coverage_rules(archetype, record, delta, registry, rng)

        if require_external_id and not record.get("External_ID__c"):
            rows_skipped_no_external_id += 1
            continue

        if not delta:
            rows_skipped_already_full += 1
            continue

        rows_with_deltas += 1
        per_persona_counts[archetype.persona] += 1
        for fname in delta:
            per_field_counts[fname] += 1

        output_buffer.append({
            "External_ID__c": record.get("External_ID__c") or f"BACKFILL-{record['Id']}",
            **delta,
        })

    # Write CSV (sparse, External_ID__c first, LF, properly escaped)
    csv_path = output_dir / "account_backfill.csv"
    write_sparse_csv(csv_path, output_buffer)

    # Bulk upsert (unless dry run)
    bulk_section: dict | None = None
    rc = OK
    if not dry_run and output_buffer:
        try:
            bulk_result = upsert_to_org(
                csv_path=csv_path, target_org=target_org,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("Bulk upsert raised")
            bulk_section = {"status": "Error", "error": str(exc)}
            rc = BULK_HARD_FAILURE
        else:
            processed = getattr(bulk_result, "records_processed", 0) or 0
            failed = getattr(bulk_result, "records_failed", 0) or 0
            failed_pct = (100.0 * failed / processed) if processed else 0.0
            bulk_section = {
                "status": "OK" if failed == 0 else "PartialFailure",
                "rows_processed": processed,
                "rows_failed": failed,
                "failed_pct": round(failed_pct, 3),
            }
            if strict and failed > 0:
                rc = BULK_PARTIAL_FAILURE
            elif failed_pct > PARTIAL_FAILURE_THRESHOLD_PCT:
                rc = BULK_PARTIAL_FAILURE

    # DC refresh (unless dry run or skipped)
    dc_section: dict | None = None
    if not dry_run and not skip_refresh_stream:
        stream_name = account_stream_name or None
        kwargs = {"target_org": target_org}
        if stream_name:
            kwargs["stream_name"] = stream_name
        status, run_id, fallback = refresh_account_stream(**kwargs)
        dc_section = {
            "status": status,
            "run_id": run_id,
            "fallback_message": fallback,
        }
        # PolicySkipped does NOT fail the run — it's expected when the stream
        # is configured for UPSERT refresh mode (AGENTS.md note 18).

    # Manifest
    completed_at = datetime.now(timezone.utc).isoformat()
    manifest = {
        "run_id": output_dir.name,
        "target_org": target_org,
        "started_at": started_at,
        "completed_at": completed_at,
        "rc": rc,
        "deriver_meta": {
            "fields_owned_by_derivers": registry.all_owned_fields(),
        },
        "query": {
            "rows_queried": len(records),
            "filter": {"persona": persona, "record_type": record_type, "limit": limit},
        },
        "derivation": {
            "rows_with_deltas": rows_with_deltas,
            "rows_skipped_already_full": rows_skipped_already_full,
            "rows_skipped_no_external_id": rows_skipped_no_external_id,
            "rows_with_deriver_errors": rows_with_deriver_errors,
            "per_field_fill_counts": dict(per_field_counts),
            "per_persona_counts": dict(per_persona_counts),
        },
        "bulk_load": bulk_section,
        "dc_refresh": dc_section,
        "errors": derivation_errors,
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    return rc


def _write_manifest(
    output_dir: Path,
    *,
    target_org: str,
    started_at: str,
    rc: int,
    errors: list[str],
) -> None:
    """Write a minimal manifest for early-exit paths (e.g., production guard)."""
    completed_at = datetime.now(timezone.utc).isoformat()
    manifest = {
        "run_id": output_dir.name,
        "target_org": target_org,
        "started_at": started_at,
        "completed_at": completed_at,
        "rc": rc,
        "errors": errors,
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
```

- [ ] **Step 5: Update tests/test_backfill_skeleton.py for the new manifest schema**

The existing test `test_run_backfill_returns_zero_on_empty_input` expects `manifest.json` to exist. The new orchestrator still writes it. But Plan 4a's tests assert `manifest["query"]["rows_queried"] == 0` for the empty-input case — and the new orchestrator preserves that.

Open `/Users/jsifontes/Documents/Git/JDO/Customer_Hydration/tests/test_backfill_skeleton.py` and verify it still passes. If any assertion references the old `bulk_load` or `dc_refresh` shape, update it.

The most likely test that needs an update is `test_run_backfill_dry_run_skips_bulk_upsert` — verify it asserts on `bulk_load is None` (which the new orchestrator produces in dry-run) rather than on a specific stub like `{"status": "not_implemented_in_4a"}` (the Plan 4a placeholder). If you find such a stale assertion, change it to:

```python
    assert manifest["bulk_load"] is None
```

(The new orchestrator emits None for dry-run instead of the Plan 4a stub.)

- [ ] **Step 6: Update the CLI dispatch in cli.py to pass new flags through**

Find the `if args.subcommand == "backfill-accounts":` dispatch block in `/Users/jsifontes/Documents/Git/JDO/Customer_Hydration/customer_hydration/cli.py` (added in Plan 4a). It currently passes only target_org, output_dir, dry_run. Update it to pass through all the new flags:

```python
    if args.subcommand == "backfill-accounts":
        from customer_hydration.backfill_accounts import run_backfill
        from datetime import datetime
        ts = datetime.now().strftime("%Y-%m-%dT%H%M")
        out_dir = Path(args.output_dir) / f"backfill-accounts-{ts}"
        return run_backfill(
            target_org=args.target_org,
            output_dir=out_dir,
            dry_run=args.dry_run,
            persona=getattr(args, "persona", None),
            record_type=getattr(args, "record_type", None),
            limit=getattr(args, "limit", None),
            skip_refresh_stream=getattr(args, "skip_refresh_stream", False),
            strict=getattr(args, "strict", False),
            require_external_id=getattr(args, "require_external_id", False),
            allow_production=getattr(args, "allow_production", False),
            records=None,
            life_events_by_id=None,
        )
```

- [ ] **Step 7: Run integration tests**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_backfill_accounts.py -v
```

Expected: 12 PASS.

- [ ] **Step 8: Run the FULL suite — must not regress the 723 existing tests**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest -q 2>&1 | tail -3
```

Expected: ~735 PASS (723 + 12 new). If the existing skeleton tests fail because they rely on the old manifest shape, update those assertions to match the new schema.

- [ ] **Step 9: Verify CLI parses cleanly**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && python hydrate.py backfill-accounts --help
```

Expected: shows the help text with all 11 flags (8 backfill-specific + 3 inherited globals).

- [ ] **Step 10: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add customer_hydration/backfill_accounts.py customer_hydration/cli.py tests/test_backfill_accounts.py tests/test_backfill_skeleton.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
feat(customer-hydration): wire live SOQL + bulk upsert + DC refresh + production guard

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Live-org smoke test (gated)

**Files:**
- Create: `tests/test_backfill_e2e_live.py`

This test only runs when `RUN_LIVE_TESTS=1` is set in the environment. CI must not run it. Two manual checks: (1) `--dry-run` against the real org parses describe + SOQL without crashing; (2) `--limit 5` actually upserts 5 rows + triggers the DC stream refresh.

- [ ] **Step 1: Write the live-smoke test file**

`/Users/jsifontes/Documents/Git/JDO/Customer_Hydration/tests/test_backfill_e2e_live.py`:

```python
"""Live-org end-to-end smoke test for Phase 4d.

Gated by RUN_LIVE_TESTS=1 — CI does not run this file.

Run manually with:
    RUN_LIVE_TESTS=1 pytest tests/test_backfill_e2e_live.py -v -s
"""
import json
import os
from pathlib import Path

import pytest

from customer_hydration import backfill_accounts


pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_LIVE_TESTS") != "1",
    reason="set RUN_LIVE_TESTS=1 to run live-org smoke",
)


LIVE_ORG = os.environ.get("LIVE_TEST_ORG", "jdo-uqj0jr")


def test_live_dry_run_describe_and_query_parse(tmp_path):
    """Dry-run with --limit 5 against the real org. Proves describe + SOQL work."""
    out_dir = tmp_path / "live_dry_run"
    rc = backfill_accounts.run_backfill(
        target_org=LIVE_ORG,
        output_dir=out_dir,
        dry_run=True,
        limit=5,
    )
    assert rc == 0, f"dry-run returned rc={rc}"
    manifest = json.loads((out_dir / "manifest.json").read_text())
    assert manifest["query"]["rows_queried"] >= 1, manifest


def test_live_apply_with_limit_5_round_trips(tmp_path):
    """--limit 5 against the real org. Bulk upserts + triggers DC refresh."""
    out_dir = tmp_path / "live_apply"
    rc = backfill_accounts.run_backfill(
        target_org=LIVE_ORG,
        output_dir=out_dir,
        dry_run=False,
        limit=5,
        skip_refresh_stream=False,
    )
    # Acceptable outcomes: rc=0 (clean) or rc=2 (DC stream PolicySkipped).
    assert rc in (0, 2), f"unexpected rc={rc}"
    manifest = json.loads((out_dir / "manifest.json").read_text())
    assert manifest["bulk_load"]["rows_processed"] >= 1
    assert manifest["dc_refresh"] is not None
```

- [ ] **Step 2: Run with the env var unset → expected SKIP**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_backfill_e2e_live.py -v
```

Expected: 2 SKIP.

- [ ] **Step 3: Run the full suite — should still be ~735 + 2 skipped = ~737 collected**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest -q 2>&1 | tail -3
```

Expected: ~735 PASS, 2 SKIPPED.

- [ ] **Step 4: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add tests/test_backfill_e2e_live.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
test(customer-hydration): live-org smoke test gated by RUN_LIVE_TESTS env var

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: AGENTS.md + README update + push

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`

- [ ] **Step 1: Append Plan 4d entry to AGENTS.md**

Find the existing Plan 4c entry in the "Plans history" section. Add the following entry directly after it:

```markdown
- **Phase 4 / Plan 4d** (Live SOQL + Bulk upsert + DC refresh, 2026-05-27) —
  New `customer_hydration/backfill/` sub-package with `query.py` (chunked
  SOQL fetch + persona/RT filter clause builder, keyset-paginated by Id),
  `upsert.py` (sparse-CSV builder using `csv.DictWriter`, External_ID__c
  forced to column 0, LF endings, proper comma escaping; wraps
  `loader._legacy.bulk_upsert`), `dc_refresh.py` (resolves auth via
  `phase5.data_cloud.get_org_session`, classifies refresh outcomes as
  Triggered / PolicySkipped / Skipped / Failed, prints
  `dc-stream-full-refresh-via-ui` skill nudge on 412),
  `production_guard.py` (frozenset of known-prod 15-char ids;
  `enforce_production_guard` raises PermissionError → rc=5),
  `exit_codes.py`. Per-deriver exception isolation added to
  `Registry.run` — bad derivers fail in place and accumulate to
  `registry.errors`, the rest of the registry continues. Orchestrator
  `backfill_accounts.run_backfill` rewritten end-to-end: live SOQL via
  injected SfRunner (chunked at 2000), all 5 deferred CLI flags wired
  (`--persona`, `--record-type`, `--limit`, `--require-external-id`,
  `--strict`), Bulk API 2.0 upsert via the wrapper (rc=2 when
  failed_pct > 1.0% or `--strict` and any failure), DC refresh trigger
  with PolicySkipped non-fatal (rc=0), full manifest schema with
  `per_field_fill_counts`, `per_persona_counts`, `errors`. New tests:
  test_backfill_query (11), test_backfill_upsert (8),
  test_backfill_dc_refresh (6), test_backfill_production_guard (5),
  test_backfill_exception_isolation (5), test_backfill_accounts (12),
  test_backfill_e2e_live (2 SKIPPED unless `RUN_LIVE_TESTS=1`).
  Suite: 735 tests PASS + 2 SKIPPED. Spec:
  `docs/superpowers/specs/2026-05-26-phase-4-account-backfill-design.md`.
```

- [ ] **Step 2: Update README.md**

Locate the status badges section near the top of `/Users/jsifontes/Documents/Git/JDO/Customer_Hydration/README.md`. Update the `Phase` badge from whatever 4a/4b/4c left it at to:

```
![Phase](https://img.shields.io/badge/phase-4d%20complete-brightgreen)
![Tests](https://img.shields.io/badge/tests-735%20passing-brightgreen)
```

If the README has a "Status" paragraph below the badges, update it to mention Plan 4d:

```
> **Status (2026-05-27):** Phases 1, 2, and 3a–3c complete. Phase 4 (Account
> field backfill) Plans 4a–4d complete and pushed for review — 7 derivers
> across the 24 coherence rules, coverage-rules engine, live SOQL + Bulk
> API 2.0 upsert + DC stream refresh trigger + production guard. Suite at
> 735 tests, all green.
```

(Adjust the date/wording to match what's there.)

- [ ] **Step 3: Run the full suite one last time**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest -q 2>&1 | tail -3
```

Expected: ~735 PASS, 2 SKIPPED.

- [ ] **Step 4: Commit and push**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add AGENTS.md README.md
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
docs(customer-hydration): record Plan 4d completion in AGENTS.md + README

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration push -u origin feat/customer-hydration-phase-4-plan-4d
```

---

## Acceptance criteria

Plan 4d is **done** when:

- [ ] `python hydrate.py backfill-accounts --target-org jdo-uqj0jr --dry-run --limit 5` runs to completion against the real org with rc=0 and writes a manifest with `query.rows_queried >= 1`.
- [ ] `python hydrate.py backfill-accounts --target-org jdo-uqj0jr --limit 5` (full apply) round-trips: SOQL fetch + bulk upsert + DC refresh trigger. rc=0 (or rc=2 with PolicySkipped DC status).
- [ ] All 24 coherence rules continue to hold (regression check via `pytest tests/test_coherence.py`).
- [ ] All 5 deferred CLI flags work (`--persona`, `--record-type`, `--limit`, `--require-external-id`, `--strict`); each has at least one integration test.
- [ ] Production guard refuses to run against any org id in `KNOWN_PRODUCTION_ORG_IDS` without `--allow-production`; exits rc=5 before any SOQL is issued.
- [ ] One bad deriver (raising any exception in `applies_to` or `derive`) does NOT crash the run; it surfaces in `manifest.errors` and the other derivers complete.
- [ ] CSV output: `External_ID__c` is column 0, remaining columns alphabetically sorted, LF endings, comma/quote/newline escaping correct (verified by `csv.DictReader` round-trip test).
- [ ] Bulk-failed-row threshold: failed_pct > 1.0% → rc=2; with `--strict`, any failure → rc=2.
- [ ] DC refresh PolicySkipped (UPSERT-mode stream) does NOT fail the run; manifest captures the `dc-stream-full-refresh-via-ui` skill nudge.
- [ ] Suite: ~735 PASS + 2 SKIPPED (live tests skipped without env var). No regressions in any prior plan.
- [ ] AGENTS.md "Plans history" includes the Plan 4d entry.
- [ ] README.md status badges + status paragraph updated to reflect Plan 4d completion.
- [ ] Branch `feat/customer-hydration-phase-4-plan-4d` is pushed and ready for PR review.

## Out of scope for Plan 4d (deferred to v1.1)

- Multi-org backfill (`--target-org A,B,C`) — single-org only in v1
- Resumability via checkpoint (`--offset`, manifest-based resume after crash) — single-shot in v1
- Apex post-load batch alternative — Python-only in v1
- The 2 fields not on CRM Account (`Equifax_Failure_Score_c__c`, `SfdcOrganizationId__c`)
- The `--report-only` mode (re-run audit + emit post-backfill REPORT.md)
- Per-deriver retry on transient failures (currently any deriver exception → record skipped for that deriver)
