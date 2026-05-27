# Phase 4a — Skeleton + PersonaArchetype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Phase 4 backfill skeleton — new CLI subcommand, orchestrator stub, the `PersonaArchetype` coherence layer, and shared deriver helpers — so that Plans 4b–4d can implement individual derivers against a stable contract.

**Architecture:** Adds `customer_hydration/backfill_accounts.py` (CLI dispatch + orchestrator), `customer_hydration/derivers/_archetype.py` (the dataclass + `build_archetype` function), `_helpers.py` (seeded RNG + picklist picker + money-band utilities), `_pairs.py` (paired-fields list), `_base.py` (Deriver Protocol), and `_registry.py` (deriver enumeration). Wires into existing `cli.py` dispatch table. No derivers yet — Plan 4a alone produces an archetype dict from a fixture record and exits cleanly with `--dry-run`.

**Tech Stack:** Python 3.10+, dataclasses, pytest, hashlib, random.Random, sf CLI v2 (for live smoke).

**Spec:** `docs/superpowers/specs/2026-05-26-phase-4-account-backfill-design.md` §4.1 (PersonaArchetype) and §4.3 (Deriver contract).

---

## File Structure

**New files:**

- `customer_hydration/backfill_accounts.py` — CLI subcommand `backfill-accounts` + orchestrator skeleton (no real bulk upsert in 4a; just query+derive+CSV write)
- `customer_hydration/derivers/__init__.py` — package marker
- `customer_hydration/derivers/_base.py` — `Deriver` Protocol class
- `customer_hydration/derivers/_archetype.py` — `PersonaArchetype` dataclass + `build_archetype(record, rng, life_events)` function
- `customer_hydration/derivers/_helpers.py` — `seeded_rng(account_id)`, `weighted_pick(rng, values, weights)`, `income_band(annual_income)`, `business_size(annual_revenue)`
- `customer_hydration/derivers/_pairs.py` — `PAIRED_FIELDS` constant + `read_paired_value(record, field, partner)`
- `customer_hydration/derivers/_registry.py` — `Registry` class that enumerates derivers and runs them in order
- `tests/test_archetype.py` — ~15 archetype-build tests
- `tests/test_helpers.py` — ~6 helper-function tests
- `tests/test_backfill_skeleton.py` — ~3 CLI dispatch + dry-run smoke tests
- `tests/fixtures/accounts/retail_55yo_affluent.json` — fixture record for archetype tests
- `tests/fixtures/accounts/business_mid_size.json` — fixture record
- `tests/fixtures/accounts/no_birthdate.json` — fixture record (age-from-rng path)

**Modified files:**

- `customer_hydration/cli.py` — register `backfill-accounts` subcommand
- `AGENTS.md` — append Plan 4a to "Plans history" section after the plan completes

**Out of scope for 4a:** Any deriver beyond the protocol stub; coverage rules; bulk upsert; DC refresh trigger; live-org integration.

---

## Task 1: Bootstrap branch + add `derivers/` package skeleton

**Files:**
- Create: `customer_hydration/derivers/__init__.py`

- [ ] **Step 1: Create the feature branch**

```bash
git checkout main
git pull origin main
git checkout -b feat/customer-hydration-phase-4-plan-4a
```

- [ ] **Step 2: Create the derivers package directory**

```bash
mkdir -p customer_hydration/derivers
```

- [ ] **Step 3: Create the package marker**

`customer_hydration/derivers/__init__.py`:

```python
"""Phase 4 derivers — pure functions that compute Account field values from
a PersonaArchetype + raw record. Each deriver owns a small set of fields and
must be deterministic given the same archetype + rng seed.

See docs/superpowers/specs/2026-05-26-phase-4-account-backfill-design.md §4.
"""
```

- [ ] **Step 4: Verify package imports**

```bash
python -c "from customer_hydration import derivers; print('ok')"
```

Expected output: `ok`

- [ ] **Step 5: Commit**

```bash
git add customer_hydration/derivers/__init__.py
git commit -m "feat(customer-hydration): scaffold derivers/ package for Phase 4"
```

---

## Task 2: Write `_helpers.py` test for `seeded_rng`

**Files:**
- Create: `tests/test_helpers.py`

- [ ] **Step 1: Write the failing test**

`tests/test_helpers.py`:

```python
"""Tests for customer_hydration.derivers._helpers."""
from customer_hydration.derivers._helpers import seeded_rng


def test_seeded_rng_returns_random_instance():
    rng = seeded_rng("001xx000000ABC")
    assert hasattr(rng, "random")
    assert hasattr(rng, "gauss")


def test_seeded_rng_is_deterministic():
    """Same account_id must produce identical RNG sequence across calls."""
    rng1 = seeded_rng("001xx000000ABC")
    rng2 = seeded_rng("001xx000000ABC")
    seq1 = [rng1.random() for _ in range(10)]
    seq2 = [rng2.random() for _ in range(10)]
    assert seq1 == seq2


def test_seeded_rng_differs_per_id():
    """Different account_ids produce different sequences (with high probability)."""
    rng1 = seeded_rng("001xx000000ABC")
    rng2 = seeded_rng("001xx000000XYZ")
    seq1 = [rng1.random() for _ in range(5)]
    seq2 = [rng2.random() for _ in range(5)]
    assert seq1 != seq2
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd Customer_Hydration && pytest tests/test_helpers.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'customer_hydration.derivers._helpers'`

- [ ] **Step 3: Write minimal implementation**

`customer_hydration/derivers/_helpers.py`:

```python
"""Shared helpers for derivers — seeded RNG, weighted pickers, value-band utilities."""
from __future__ import annotations

import hashlib
import random
from typing import Sequence


def seeded_rng(account_id: str) -> random.Random:
    """Return a Random instance seeded deterministically from account_id.

    Uses sha256 of the account_id to produce a stable seed so the same input
    yields the same RNG sequence across runs and processes.
    """
    digest = hashlib.sha256(account_id.encode("utf-8")).digest()
    seed = int.from_bytes(digest[:8], "big")
    return random.Random(seed)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_helpers.py -v
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add customer_hydration/derivers/_helpers.py tests/test_helpers.py
git commit -m "feat(customer-hydration): seeded_rng helper for deterministic derivation"
```

---

## Task 3: Add `weighted_pick` helper

**Files:**
- Modify: `customer_hydration/derivers/_helpers.py`
- Modify: `tests/test_helpers.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_helpers.py`:

```python
import pytest
from customer_hydration.derivers._helpers import weighted_pick


def test_weighted_pick_returns_value_from_list():
    rng = seeded_rng("test_pick_1")
    result = weighted_pick(rng, ["A", "B", "C"], [0.5, 0.3, 0.2])
    assert result in ("A", "B", "C")


def test_weighted_pick_is_deterministic():
    rng1 = seeded_rng("test_pick_2")
    rng2 = seeded_rng("test_pick_2")
    r1 = weighted_pick(rng1, ["X", "Y", "Z"], [0.1, 0.5, 0.4])
    r2 = weighted_pick(rng2, ["X", "Y", "Z"], [0.1, 0.5, 0.4])
    assert r1 == r2


def test_weighted_pick_respects_weights_at_scale():
    """Heavily-weighted value should dominate across many draws."""
    rng = seeded_rng("test_pick_3")
    counts = {"A": 0, "B": 0}
    for _ in range(1000):
        result = weighted_pick(rng, ["A", "B"], [0.95, 0.05])
        counts[result] += 1
    assert counts["A"] > 800   # ~950 expected, allow generous slack
    assert counts["B"] < 200   # ~50 expected


def test_weighted_pick_rejects_mismatched_lengths():
    rng = seeded_rng("test_pick_4")
    with pytest.raises(ValueError):
        weighted_pick(rng, ["A", "B"], [0.5, 0.3, 0.2])


def test_weighted_pick_rejects_empty():
    rng = seeded_rng("test_pick_5")
    with pytest.raises(ValueError):
        weighted_pick(rng, [], [])
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_helpers.py::test_weighted_pick_returns_value_from_list -v
```

Expected: FAIL with `ImportError: cannot import name 'weighted_pick'`

- [ ] **Step 3: Add the implementation**

Append to `customer_hydration/derivers/_helpers.py`:

```python
def weighted_pick(rng: random.Random, values: Sequence[str], weights: Sequence[float]) -> str:
    """Pick one value from `values` with probability proportional to `weights`.

    Both lists must be the same length and non-empty. Weights need not sum to 1.0;
    they're normalized internally.
    """
    if not values or not weights:
        raise ValueError("weighted_pick requires non-empty values and weights")
    if len(values) != len(weights):
        raise ValueError(
            f"weighted_pick: values has {len(values)} items but weights has {len(weights)}"
        )
    return rng.choices(list(values), weights=list(weights), k=1)[0]
```

- [ ] **Step 4: Run all helper tests**

```bash
pytest tests/test_helpers.py -v
```

Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add customer_hydration/derivers/_helpers.py tests/test_helpers.py
git commit -m "feat(customer-hydration): weighted_pick helper for picklist distributions"
```

---

## Task 4: Add `income_band` and `business_size` helpers

**Files:**
- Modify: `customer_hydration/derivers/_helpers.py`
- Modify: `tests/test_helpers.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_helpers.py`:

```python
from customer_hydration.derivers._helpers import income_band, business_size


def test_income_band_thresholds():
    """Spec §4.1 step 4: entry < $50k, middle < $150k, affluent < $400k, hnw < $1M, uhnw ≥ $1M."""
    assert income_band(25_000) == "entry"
    assert income_band(49_999) == "entry"
    assert income_band(50_000) == "middle"
    assert income_band(80_000) == "middle"
    assert income_band(149_999) == "middle"
    assert income_band(150_000) == "affluent"
    assert income_band(250_000) == "affluent"
    assert income_band(399_999) == "affluent"
    assert income_band(400_000) == "hnw"
    assert income_band(750_000) == "hnw"
    assert income_band(999_999) == "hnw"
    assert income_band(1_000_000) == "uhnw"
    assert income_band(50_000_000) == "uhnw"


def test_income_band_handles_none():
    """Missing income → entry (most conservative band)."""
    assert income_band(None) == "entry"


def test_business_size_thresholds():
    """Spec §4.1 step 4: micro < $1M, small < $10M, mid < $100M, large < $1B, enterprise ≥ $1B."""
    assert business_size(50_000) == "micro"
    assert business_size(999_999) == "micro"
    assert business_size(1_000_000) == "small"
    assert business_size(9_999_999) == "small"
    assert business_size(10_000_000) == "mid"
    assert business_size(99_999_999) == "mid"
    assert business_size(100_000_000) == "large"
    assert business_size(999_999_999) == "large"
    assert business_size(1_000_000_000) == "enterprise"
    assert business_size(50_000_000_000) == "enterprise"


def test_business_size_handles_none():
    assert business_size(None) == "micro"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_helpers.py::test_income_band_thresholds -v
```

Expected: FAIL with `ImportError: cannot import name 'income_band'`

- [ ] **Step 3: Add the implementation**

Append to `customer_hydration/derivers/_helpers.py`:

```python
def income_band(annual_income: float | None) -> str:
    """Return income band name from AnnualIncome.

    Bands per spec §4.1:
      entry    < $50k
      middle   < $150k
      affluent < $400k
      hnw      < $1M
      uhnw     ≥ $1M
    Missing income falls back to 'entry' (most conservative).
    """
    if annual_income is None:
        return "entry"
    if annual_income < 50_000:
        return "entry"
    if annual_income < 150_000:
        return "middle"
    if annual_income < 400_000:
        return "affluent"
    if annual_income < 1_000_000:
        return "hnw"
    return "uhnw"


def business_size(annual_revenue: float | None) -> str:
    """Return business size band from AnnualRevenue.

    Bands per spec §4.1:
      micro      < $1M
      small      < $10M
      mid        < $100M
      large      < $1B
      enterprise ≥ $1B
    """
    if annual_revenue is None:
        return "micro"
    if annual_revenue < 1_000_000:
        return "micro"
    if annual_revenue < 10_000_000:
        return "small"
    if annual_revenue < 100_000_000:
        return "mid"
    if annual_revenue < 1_000_000_000:
        return "large"
    return "enterprise"
```

- [ ] **Step 4: Run all helper tests**

```bash
pytest tests/test_helpers.py -v
```

Expected: 13 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add customer_hydration/derivers/_helpers.py tests/test_helpers.py
git commit -m "feat(customer-hydration): income_band and business_size band helpers"
```

---

## Task 5: Define `Deriver` Protocol

**Files:**
- Create: `customer_hydration/derivers/_base.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_helpers.py`:

```python
from customer_hydration.derivers._base import Deriver


def test_deriver_protocol_imports():
    """Sanity: the Protocol class is importable."""
    assert Deriver is not None
    assert hasattr(Deriver, "name") or "name" in Deriver.__annotations__
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_helpers.py::test_deriver_protocol_imports -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'customer_hydration.derivers._base'`

- [ ] **Step 3: Write the implementation**

`customer_hydration/derivers/_base.py`:

```python
"""Deriver Protocol — the contract every deriver in Phase 4 implements.

See spec §4.3.
"""
from __future__ import annotations

from random import Random
from typing import Any, Protocol, runtime_checkable

from customer_hydration.derivers._archetype import PersonaArchetype


@runtime_checkable
class Deriver(Protocol):
    """A pure function that derives a subset of Account fields from an archetype.

    Implementations:
      - relationship.RelationshipDeriver
      - credit_personal.CreditPersonalDeriver
      - credit_bureau.CreditBureauDeriver
      - profile.ProfileDeriver
      - demographics.DemographicsDeriver
      - addresses.AddressesDeriver
      - contact.ContactDeriver
    """

    name: str
    fields: list[str]

    def applies_to(self, archetype: PersonaArchetype) -> bool:
        """Return False if this deriver shouldn't run for this archetype."""
        ...

    def derive(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        """Return desired field values. Caller null-filters and upserts."""
        ...
```

- [ ] **Step 4: Run test to verify it passes**

The test imports `Deriver` from `_base`, which imports `PersonaArchetype` from `_archetype` — that module doesn't exist yet. Expected: FAIL with `ModuleNotFoundError: No module named 'customer_hydration.derivers._archetype'`. We'll create it in the next task; for now, write a minimal stub so the import works:

`customer_hydration/derivers/_archetype.py` (stub — will be replaced in Task 6):

```python
"""Stub for PersonaArchetype — full implementation in Task 6."""
from dataclasses import dataclass


@dataclass(frozen=True)
class PersonaArchetype:
    """Stub. Real fields added in Task 6."""
    account_id: str
```

- [ ] **Step 5: Run test to verify it now passes**

```bash
pytest tests/test_helpers.py::test_deriver_protocol_imports -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add customer_hydration/derivers/_base.py customer_hydration/derivers/_archetype.py tests/test_helpers.py
git commit -m "feat(customer-hydration): Deriver Protocol + archetype stub"
```

---

## Task 6: Write archetype tests for anchor reads (no rng path)

**Files:**
- Create: `tests/fixtures/accounts/retail_55yo_affluent.json`
- Create: `tests/fixtures/accounts/business_mid_size.json`
- Create: `tests/test_archetype.py`

- [ ] **Step 1: Create the retail fixture**

`tests/fixtures/accounts/retail_55yo_affluent.json`:

```json
{
  "Id": "001xx000000RTL01",
  "External_ID__c": "HYDRATE-RTL-000001",
  "RecordType.Name": "FSC Person Accounts",
  "IsPersonAccount": true,
  "CreatedDate": "2018-04-12T10:00:00Z",
  "PersonBirthdate": "1971-08-23",
  "PersonGender": "Female",
  "FinServ__MaritalStatus__pc": "Married",
  "FinServ__NumberOfDependents__pc": 2,
  "FinServ__AnnualIncome__pc": 250000,
  "AnnualRevenue": null,
  "FinServ__LastInteraction__c": "2026-05-12",
  "Industry": null
}
```

- [ ] **Step 2: Create the business fixture**

`tests/fixtures/accounts/business_mid_size.json`:

```json
{
  "Id": "001xx000000BIZ01",
  "External_ID__c": "HYDRATE-COM-000001",
  "RecordType.Name": "Business",
  "IsPersonAccount": false,
  "CreatedDate": "2017-01-15T10:00:00Z",
  "PersonBirthdate": null,
  "PersonGender": null,
  "FinServ__MaritalStatus__pc": null,
  "FinServ__NumberOfDependents__pc": null,
  "FinServ__AnnualIncome__pc": null,
  "AnnualRevenue": 50000000,
  "FinServ__LastInteraction__c": "2026-04-01",
  "Industry": "Banking"
}
```

- [ ] **Step 3: Write the failing tests**

`tests/test_archetype.py`:

```python
"""Tests for build_archetype — the coherence layer (spec §4.1)."""
import json
from datetime import date
from pathlib import Path

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype, build_archetype
from customer_hydration.derivers._helpers import seeded_rng

FIXTURES = Path(__file__).parent / "fixtures" / "accounts"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text())


def test_persona_archetype_is_frozen_dataclass():
    """Archetype must be immutable so derivers can't mutate it accidentally."""
    a = PersonaArchetype(
        account_id="001xx000000ABC",
        created_date=date(2020, 1, 1),
        record_type="FSC Person Accounts",
        is_person=True,
        persona="retail",
        age=45,
        gender="Male",
        marital_status="Single",
        household_size=1,
        income_band="middle",
        credit_quality=0.7,
        net_worth_multiple=2.5,
        tenure_years=5.0,
        engagement_level="regular",
        home_metro="Boston, MA",
        business_size=None,
        industry_code=None,
        business_credit_quality=None,
    )
    with pytest.raises(Exception):  # FrozenInstanceError
        a.age = 99


def test_build_archetype_reads_anchors_from_record():
    record = load_fixture("retail_55yo_affluent")
    rng = seeded_rng(record["Id"])
    a = build_archetype(record, rng, life_events=[])

    assert a.account_id == "001xx000000RTL01"
    assert a.created_date == date(2018, 4, 12)
    assert a.record_type == "FSC Person Accounts"
    assert a.is_person is True
    assert a.persona == "retail"


def test_build_archetype_age_from_birthdate():
    """When PersonBirthdate is present, age is computed deterministically."""
    record = load_fixture("retail_55yo_affluent")
    rng = seeded_rng(record["Id"])
    a = build_archetype(record, rng, life_events=[])
    # 1971-08-23 → age 54 as of 2026-05-26 (today varies in real run; pin via reference_date if needed)
    assert 54 <= a.age <= 55


def test_build_archetype_marital_status_from_existing_field():
    record = load_fixture("retail_55yo_affluent")
    rng = seeded_rng(record["Id"])
    a = build_archetype(record, rng, life_events=[])
    assert a.marital_status == "Married"


def test_build_archetype_household_size_includes_self_plus_dependents():
    """Spec rule 11: household_size = 1 + max(NumberOfDependents, marital_implied)."""
    record = load_fixture("retail_55yo_affluent")
    rng = seeded_rng(record["Id"])
    a = build_archetype(record, rng, life_events=[])
    # NumberOfDependents=2 → household_size=3
    assert a.household_size == 3


def test_build_archetype_income_band_for_retail():
    record = load_fixture("retail_55yo_affluent")
    rng = seeded_rng(record["Id"])
    a = build_archetype(record, rng, life_events=[])
    # AnnualIncome=$250k → affluent band
    assert a.income_band == "affluent"


def test_build_archetype_business_branch():
    """Business accounts get business_size + industry_code; person fields are defaults."""
    record = load_fixture("business_mid_size")
    rng = seeded_rng(record["Id"])
    a = build_archetype(record, rng, life_events=[])

    assert a.is_person is False
    assert a.persona == "commercial"
    assert a.business_size == "mid"
    assert a.industry_code is not None  # 'Banking' → some NAICS code
    assert a.business_credit_quality is not None
    assert 0.0 <= a.business_credit_quality <= 1.0
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
pytest tests/test_archetype.py -v
```

Expected: FAIL with `cannot import name 'build_archetype'` and missing PersonaArchetype fields.

- [ ] **Step 5: Replace `_archetype.py` with the full dataclass + builder**

`customer_hydration/derivers/_archetype.py`:

```python
"""PersonaArchetype — the coherence layer (spec §4.1).

A small set of latent variables computed once per Account from existing-data
anchors. All derivers consume the archetype, making cross-field coherence
structural rather than test-enforced.
"""
from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from datetime import date, datetime
from random import Random
from typing import Any

from customer_hydration.derivers._helpers import (
    business_size as compute_business_size,
)
from customer_hydration.derivers._helpers import (
    income_band as compute_income_band,
)


# 50-metro pool keyed off account_id hash (spec §4.1 step 8)
US_METROS: list[tuple[str, str]] = [
    ("New York", "NY"), ("Los Angeles", "CA"), ("Chicago", "IL"),
    ("Houston", "TX"), ("Phoenix", "AZ"), ("Philadelphia", "PA"),
    ("San Antonio", "TX"), ("San Diego", "CA"), ("Dallas", "TX"),
    ("San Jose", "CA"), ("Austin", "TX"), ("Jacksonville", "FL"),
    ("Fort Worth", "TX"), ("Columbus", "OH"), ("Charlotte", "NC"),
    ("San Francisco", "CA"), ("Indianapolis", "IN"), ("Seattle", "WA"),
    ("Denver", "CO"), ("Washington", "DC"), ("Boston", "MA"),
    ("El Paso", "TX"), ("Nashville", "TN"), ("Detroit", "MI"),
    ("Oklahoma City", "OK"), ("Portland", "OR"), ("Las Vegas", "NV"),
    ("Memphis", "TN"), ("Louisville", "KY"), ("Baltimore", "MD"),
    ("Milwaukee", "WI"), ("Albuquerque", "NM"), ("Tucson", "AZ"),
    ("Fresno", "CA"), ("Sacramento", "CA"), ("Mesa", "AZ"),
    ("Kansas City", "MO"), ("Atlanta", "GA"), ("Long Beach", "CA"),
    ("Colorado Springs", "CO"), ("Raleigh", "NC"), ("Miami", "FL"),
    ("Virginia Beach", "VA"), ("Omaha", "NE"), ("Oakland", "CA"),
    ("Minneapolis", "MN"), ("Tulsa", "OK"), ("Arlington", "TX"),
    ("New Orleans", "LA"), ("Wichita", "KS"),
]


# Industry → NAICS lookup (subset; expand in Plan 4c if needed)
INDUSTRY_TO_NAICS: dict[str, str] = {
    "Banking": "522110",
    "Finance": "523000",
    "Insurance": "524113",
    "Healthcare": "621111",
    "Manufacturing": "336111",
    "Retail": "452210",
    "Technology": "541512",
    "Real Estate": "531210",
    "Education": "611110",
    "Hospitality": "721110",
    "Energy": "211120",
    "Agriculture": "111110",
}


@dataclass(frozen=True)
class PersonaArchetype:
    """The coherence layer. See spec §4.1 for field semantics."""

    # Anchors
    account_id: str
    created_date: date
    record_type: str
    is_person: bool
    persona: str

    # Person latents
    age: int
    gender: str
    marital_status: str
    household_size: int

    # Financial latents
    income_band: str
    credit_quality: float
    net_worth_multiple: float

    # Relationship latents
    tenure_years: float
    engagement_level: str

    # Geographic
    home_metro: str

    # Business latents (None on person accounts)
    business_size: str | None
    industry_code: str | None
    business_credit_quality: float | None


def _persona_from_external_id_or_rt(record: dict) -> str:
    """Map External_ID__c prefix or RecordType.Name to one of:
    retail | wealth | smb | commercial | household | unknown.
    """
    ext_id = record.get("External_ID__c") or ""
    if ext_id.startswith("HYDRATE-RTL-"):
        return "retail"
    if ext_id.startswith("HYDRATE-WLT-"):
        return "wealth"
    if ext_id.startswith("HYDRATE-SMB-"):
        return "smb"
    if ext_id.startswith("HYDRATE-COM-"):
        return "commercial"
    if ext_id.startswith("HYDRATE-HH-"):
        return "household"

    rt = record.get("RecordType.Name") or ""
    is_person = bool(record.get("IsPersonAccount"))
    if is_person:
        return "retail"
    if rt in ("Business", "Entity", "Partner"):
        return "commercial"
    if rt == "Household":
        return "household"
    return "unknown"


def _parse_date(value: Any) -> date | None:
    """Parse a date from SOQL response (ISO string or already-date)."""
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        # Handles 'YYYY-MM-DD' and 'YYYY-MM-DDTHH:MM:SSZ'
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    raise ValueError(f"Cannot parse date from {value!r}")


def _age_from_birthdate(birthdate: date | None, today: date) -> int | None:
    if birthdate is None:
        return None
    years = today.year - birthdate.year
    if (today.month, today.day) < (birthdate.month, birthdate.day):
        years -= 1
    return years


def _engagement_from_last_interaction(last_interaction: date | None, today: date) -> str | None:
    """heavy < 30d, regular < 90d, light < 365d, dormant ≥ 365d."""
    if last_interaction is None:
        return None
    days = (today - last_interaction).days
    if days < 30:
        return "heavy"
    if days < 90:
        return "regular"
    if days < 365:
        return "light"
    return "dormant"


def _net_worth_multiple_from_age(age: int) -> float:
    """Rough wealth-by-life-stage curve (spec §4.1 step 6)."""
    if age < 25:
        return 0.5
    if age < 35:
        return 1.5
    if age < 50:
        return 4.0
    if age < 65:
        return 8.0
    return 10.0


def _income_band_score(band: str) -> float:
    """Map income band to 0–1 score for credit_quality computation."""
    return {"entry": 0.2, "middle": 0.5, "affluent": 0.7, "hnw": 0.85, "uhnw": 0.95}.get(band, 0.5)


def _tenure_score(years: float) -> float:
    """Saturating tenure score: 0y → 0, 5y → 0.5, 10y+ → 1.0."""
    return min(1.0, years / 10.0)


def _age_score(age: int) -> float:
    """Saturating age score: 25 → 0, 60 → 1."""
    return min(1.0, max(0.0, (age - 25) / 35.0))


def _pick_metro(account_id: str) -> str:
    """Deterministic metro pick from US_METROS keyed off account_id hash."""
    digest = hashlib.sha256(account_id.encode("utf-8")).digest()
    idx = int.from_bytes(digest[:4], "big") % len(US_METROS)
    city, state = US_METROS[idx]
    return f"{city}, {state}"


def build_archetype(
    record: dict,
    rng: Random,
    life_events: list[dict] | None = None,
    *,
    today: date | None = None,
) -> PersonaArchetype:
    """Build a PersonaArchetype from a raw SOQL record + Phase 3c LifeEvents.

    See spec §4.1 for the 11-step construction.
    """
    today = today or date.today()
    life_events = life_events or []

    # 1. Anchors
    account_id = record["Id"]
    created_date = _parse_date(record.get("CreatedDate")) or today
    record_type = record.get("RecordType.Name") or ""
    is_person = bool(record.get("IsPersonAccount"))
    persona = _persona_from_external_id_or_rt(record)

    # 2. Person anchors (when present)
    birthdate = _parse_date(record.get("PersonBirthdate"))
    age_anchor = _age_from_birthdate(birthdate, today)
    age = age_anchor if age_anchor is not None else 30 + rng.randint(0, 30)

    gender = record.get("PersonGender") or rng.choice(["Male", "Female"])
    marital_status = record.get("FinServ__MaritalStatus__pc") or "Single"

    # 3. tenure_years
    tenure_years = (today - created_date).days / 365.25

    # 4. income_band (also drives B2B branch)
    annual_income = record.get("FinServ__AnnualIncome__pc")
    annual_revenue = record.get("AnnualRevenue")
    if is_person:
        ib = compute_income_band(annual_income)
    else:
        # B2B accounts use revenue band, mapped onto the same 5-tier scale
        bs = compute_business_size(annual_revenue)
        ib = {"micro": "entry", "small": "middle", "mid": "affluent",
              "large": "hnw", "enterprise": "uhnw"}[bs]

    # 5. credit_quality
    cq = (
        0.4
        + 0.4 * _income_band_score(ib)
        + 0.1 * _tenure_score(tenure_years)
        + 0.1 * _age_score(age)
        + rng.gauss(0, 0.08)
    )
    credit_quality = max(0.0, min(1.0, cq))

    # 6. net_worth_multiple
    net_worth_multiple = _net_worth_multiple_from_age(age)

    # 7. engagement_level
    last_interaction = _parse_date(record.get("FinServ__LastInteraction__c"))
    engagement = _engagement_from_last_interaction(last_interaction, today)
    if engagement is None:
        engagement = rng.choices(
            ["dormant", "light", "regular", "heavy"],
            weights=[0.10, 0.25, 0.40, 0.25],
            k=1,
        )[0]

    # 8. home_metro
    home_metro = _pick_metro(account_id)

    # 9. household_size (person accounts only)
    if is_person:
        dependents = record.get("FinServ__NumberOfDependents__pc") or 0
        marital_bump = 1 if marital_status in ("Married",) else 0
        household_size = 1 + max(int(dependents), marital_bump)
    else:
        household_size = 0

    # 10. Business latents
    if is_person:
        bsize: str | None = None
        industry_code: str | None = None
        bcq: float | None = None
    else:
        bsize = compute_business_size(annual_revenue)
        industry = record.get("Industry")
        industry_code = INDUSTRY_TO_NAICS.get(industry or "") if industry else None
        if industry_code is None:
            # Seeded fallback: pick from catalog
            keys = list(INDUSTRY_TO_NAICS.values())
            digest = hashlib.sha256(account_id.encode("utf-8")).digest()
            industry_code = keys[int.from_bytes(digest[4:8], "big") % len(keys)]
        bcq = max(
            0.0,
            min(
                1.0,
                0.4
                + 0.5 * _income_band_score(ib)
                + 0.1 * _tenure_score(tenure_years)
                + rng.gauss(0, 0.08),
            ),
        )

    return PersonaArchetype(
        account_id=account_id,
        created_date=created_date,
        record_type=record_type,
        is_person=is_person,
        persona=persona,
        age=age,
        gender=gender,
        marital_status=marital_status,
        household_size=household_size,
        income_band=ib,
        credit_quality=credit_quality,
        net_worth_multiple=net_worth_multiple,
        tenure_years=tenure_years,
        engagement_level=engagement,
        home_metro=home_metro,
        business_size=bsize,
        industry_code=industry_code,
        business_credit_quality=bcq,
    )
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pytest tests/test_archetype.py -v
```

Expected: 7 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add customer_hydration/derivers/_archetype.py tests/test_archetype.py tests/fixtures/accounts/
git commit -m "feat(customer-hydration): PersonaArchetype dataclass + build_archetype anchors"
```

---

## Task 7: Test rng-fallback paths in archetype

**Files:**
- Create: `tests/fixtures/accounts/no_birthdate.json`
- Modify: `tests/test_archetype.py`

- [ ] **Step 1: Create the fixture**

`tests/fixtures/accounts/no_birthdate.json`:

```json
{
  "Id": "001xx000000NOA01",
  "External_ID__c": "HYDRATE-RTL-000999",
  "RecordType.Name": "FSC Person Accounts",
  "IsPersonAccount": true,
  "CreatedDate": "2024-09-15T10:00:00Z",
  "PersonBirthdate": null,
  "PersonGender": null,
  "FinServ__MaritalStatus__pc": null,
  "FinServ__NumberOfDependents__pc": null,
  "FinServ__AnnualIncome__pc": 75000,
  "AnnualRevenue": null,
  "FinServ__LastInteraction__c": null,
  "Industry": null
}
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/test_archetype.py`:

```python
def test_age_seeded_when_birthdate_missing():
    """Same Id with no birthdate produces same age across runs (deterministic rng)."""
    record = load_fixture("no_birthdate")
    rng1 = seeded_rng(record["Id"])
    rng2 = seeded_rng(record["Id"])
    a1 = build_archetype(record, rng1, life_events=[])
    a2 = build_archetype(record, rng2, life_events=[])
    assert a1.age == a2.age
    assert 30 <= a1.age <= 60


def test_engagement_seeded_when_last_interaction_missing():
    record = load_fixture("no_birthdate")
    rng = seeded_rng(record["Id"])
    a = build_archetype(record, rng, life_events=[])
    assert a.engagement_level in ("dormant", "light", "regular", "heavy")


def test_persona_unknown_when_no_prefix_or_rt():
    """RT not matching any known persona → 'unknown'."""
    record = {
        "Id": "001xx00000UNK001",
        "External_ID__c": None,
        "RecordType.Name": "Some Custom Type",
        "IsPersonAccount": False,
        "CreatedDate": "2020-01-01T00:00:00Z",
    }
    rng = seeded_rng(record["Id"])
    a = build_archetype(record, rng, life_events=[])
    assert a.persona == "unknown"


def test_home_metro_deterministic_per_id():
    """Same Id → same metro across calls (spec rule 23)."""
    record = load_fixture("retail_55yo_affluent")
    rng1 = seeded_rng(record["Id"])
    rng2 = seeded_rng(record["Id"])
    a1 = build_archetype(record, rng1, life_events=[])
    a2 = build_archetype(record, rng2, life_events=[])
    assert a1.home_metro == a2.home_metro


def test_credit_quality_in_zero_one_range():
    """Boundary check across 100 fixtures with varied seeds."""
    base = load_fixture("retail_55yo_affluent")
    for i in range(100):
        record = {**base, "Id": f"001xx00000{i:06d}"}
        rng = seeded_rng(record["Id"])
        a = build_archetype(record, rng, life_events=[])
        assert 0.0 <= a.credit_quality <= 1.0


def test_business_branch_has_no_person_demographics():
    """Business accounts: household_size=0, gender from rng (not used by derivers)."""
    record = load_fixture("business_mid_size")
    rng = seeded_rng(record["Id"])
    a = build_archetype(record, rng, life_events=[])
    assert a.is_person is False
    assert a.household_size == 0
```

- [ ] **Step 3: Run tests to verify they pass (build_archetype already supports these paths)**

```bash
pytest tests/test_archetype.py -v
```

Expected: 13 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/accounts/no_birthdate.json tests/test_archetype.py
git commit -m "test(customer-hydration): rng-fallback and edge cases for build_archetype"
```

---

## Task 8: Test LifeEvent integration (spec rule 22)

**Files:**
- Modify: `tests/test_archetype.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_archetype.py`:

```python
def test_lifeevent_marriage_sets_married():
    """Recent Marriage life event → archetype.marital_status='Married' (rule 22)."""
    record = load_fixture("no_birthdate")  # marital_status=null in fixture
    rng = seeded_rng(record["Id"])
    life_events = [
        {
            "FinServ__EventType__c": "Marriage",
            "FinServ__EventDate__c": "2025-06-12",
        }
    ]
    a = build_archetype(record, rng, life_events=life_events)
    assert a.marital_status == "Married"


def test_lifeevent_marriage_does_not_overwrite_existing_status():
    """If MaritalStatus already populated, life event doesn't override (fill-nulls-only)."""
    record = load_fixture("retail_55yo_affluent")  # marital_status='Married' already
    rng = seeded_rng(record["Id"])
    life_events = [
        {"FinServ__EventType__c": "Divorce", "FinServ__EventDate__c": "2026-01-15"}
    ]
    a = build_archetype(record, rng, life_events=life_events)
    # Existing 'Married' wins because it's already populated
    assert a.marital_status == "Married"


def test_lifeevent_no_match_leaves_defaults():
    """Unrelated life event types don't change archetype."""
    record = load_fixture("no_birthdate")
    rng = seeded_rng(record["Id"])
    life_events = [
        {"FinServ__EventType__c": "Job Change", "FinServ__EventDate__c": "2025-06-01"}
    ]
    a = build_archetype(record, rng, life_events=life_events)
    # marital_status stays at default 'Single'
    assert a.marital_status == "Single"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_archetype.py::test_lifeevent_marriage_sets_married -v
```

Expected: FAIL — current `build_archetype` ignores life_events.

- [ ] **Step 3: Add LifeEvent integration to `build_archetype`**

In `customer_hydration/derivers/_archetype.py`, after step 2 (Person anchors) and before step 3, add:

```python
    # 2b. LifeEvent integration (spec rule 22) — fills nulls only, never overwrites
    LIFE_EVENT_MARITAL_MAP = {
        "Marriage": "Married",
        "Divorce": "Divorced",
        "Death of Spouse": "Widowed",
    }
    if marital_status == "Single":  # only override the default
        for event in life_events:
            event_type = event.get("FinServ__EventType__c")
            if event_type in LIFE_EVENT_MARITAL_MAP and \
               record.get("FinServ__MaritalStatus__pc") is None:
                marital_status = LIFE_EVENT_MARITAL_MAP[event_type]
                break
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_archetype.py -v
```

Expected: 16 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add customer_hydration/derivers/_archetype.py tests/test_archetype.py
git commit -m "feat(customer-hydration): LifeEvent → archetype marital_status integration"
```

---

## Task 9: Define `_pairs.py` with paired-fields list

**Files:**
- Create: `customer_hydration/derivers/_pairs.py`
- Modify: `tests/test_helpers.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_helpers.py`:

```python
from customer_hydration.derivers._pairs import PAIRED_FIELDS, paired_partner


def test_paired_fields_is_list_of_tuples():
    assert isinstance(PAIRED_FIELDS, list)
    for pair in PAIRED_FIELDS:
        assert isinstance(pair, tuple)
        assert len(pair) == 2


def test_paired_fields_contains_credit_pair():
    assert ("FinServ__CreditScore__c", "FinServ__CreditRating__c") in PAIRED_FIELDS


def test_paired_partner_returns_other_field():
    assert paired_partner("FinServ__CreditScore__c") == "FinServ__CreditRating__c"
    assert paired_partner("FinServ__CreditRating__c") == "FinServ__CreditScore__c"


def test_paired_partner_returns_none_when_not_paired():
    assert paired_partner("Industry") is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_helpers.py::test_paired_fields_is_list_of_tuples -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'customer_hydration.derivers._pairs'`

- [ ] **Step 3: Write the implementation**

`customer_hydration/derivers/_pairs.py`:

```python
"""Paired-fields list — fields that must derive consistently together (spec §4.7).

When one half of a pair is non-null, the deriver reads the existing value and
produces the partner field from it deterministically rather than re-rolling
from rng. This prevents inconsistencies like CreditScore=750 + Rating=Excellent.
"""
from __future__ import annotations

PAIRED_FIELDS: list[tuple[str, str]] = [
    ("FinServ__CreditScore__c", "FinServ__CreditRating__c"),
    ("FinServ__RiskTolerance__c", "FinServ__TimeHorizon__c"),
    ("FinServ__RiskTolerance__c", "FinServ__InvestmentExperience__c"),
    ("Tier__c", "FinServ__ServiceModel__c"),
    ("FinServ__CustomerType__c", "FinServ__ClientCategory__c"),
    ("FinServ__RelationshipStartDate__c", "FinServ__LengthOfRelationship__c"),
    ("FinServ__TaxId__pc", "FinServ__LastFourDigitSSN__pc"),
    ("NAICS_Code__c", "Sic"),
]


def paired_partner(field_name: str) -> str | None:
    """Return the partner field for a given field, or None if not paired."""
    for a, b in PAIRED_FIELDS:
        if field_name == a:
            return b
        if field_name == b:
            return a
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_helpers.py -v
```

Expected: All helper tests pass (now ~17 total).

- [ ] **Step 5: Commit**

```bash
git add customer_hydration/derivers/_pairs.py tests/test_helpers.py
git commit -m "feat(customer-hydration): PAIRED_FIELDS list + paired_partner lookup"
```

---

## Task 10: Define `_registry.py` with empty Registry

**Files:**
- Create: `customer_hydration/derivers/_registry.py`
- Modify: `tests/test_helpers.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_helpers.py`:

```python
from customer_hydration.derivers._registry import Registry


def test_registry_starts_empty():
    r = Registry()
    assert r.derivers == []


def test_registry_register_and_run():
    r = Registry()

    class FakeDeriver:
        name = "fake"
        fields = ["X"]

        def applies_to(self, archetype):
            return True

        def derive(self, archetype, record, rng):
            return {"X": 1}

    r.register(FakeDeriver())
    archetype = PersonaArchetype(
        account_id="001x", created_date=date(2020, 1, 1),
        record_type="x", is_person=True, persona="retail",
        age=30, gender="Male", marital_status="Single", household_size=1,
        income_band="middle", credit_quality=0.5, net_worth_multiple=1.0,
        tenure_years=5.0, engagement_level="regular", home_metro="X, Y",
        business_size=None, industry_code=None, business_credit_quality=None,
    )
    rng = seeded_rng("001x")
    out = r.run(archetype, {"Id": "001x"}, rng)
    assert out == {"X": 1}


def test_registry_skips_non_applicable_deriver():
    r = Registry()

    class SkipDeriver:
        name = "skip"
        fields = ["Y"]

        def applies_to(self, archetype):
            return False

        def derive(self, archetype, record, rng):
            return {"Y": 2}

    r.register(SkipDeriver())
    archetype = PersonaArchetype(
        account_id="001x", created_date=date(2020, 1, 1),
        record_type="x", is_person=True, persona="retail",
        age=30, gender="Male", marital_status="Single", household_size=1,
        income_band="middle", credit_quality=0.5, net_worth_multiple=1.0,
        tenure_years=5.0, engagement_level="regular", home_metro="X, Y",
        business_size=None, industry_code=None, business_credit_quality=None,
    )
    rng = seeded_rng("001x")
    out = r.run(archetype, {"Id": "001x"}, rng)
    assert out == {}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_helpers.py::test_registry_starts_empty -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'customer_hydration.derivers._registry'`

- [ ] **Step 3: Write the implementation**

`customer_hydration/derivers/_registry.py`:

```python
"""Deriver registry — enumerates derivers and runs them per record."""
from __future__ import annotations

from random import Random
from typing import Any

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._base import Deriver


class Registry:
    """Holds an ordered list of derivers and runs them in registration order.

    Each deriver's output is merged into the candidates dict; later derivers
    can overwrite earlier values (rare; should not happen given disjoint
    field ownership).
    """

    def __init__(self) -> None:
        self.derivers: list[Deriver] = []

    def register(self, deriver: Deriver) -> None:
        self.derivers.append(deriver)

    def run(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        """Run all applicable derivers and return merged candidates dict."""
        candidates: dict[str, Any] = {}
        for d in self.derivers:
            if d.applies_to(archetype):
                candidates.update(d.derive(archetype, record, rng))
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

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_helpers.py -v
```

Expected: All 20 helper tests PASS.

- [ ] **Step 5: Commit**

```bash
git add customer_hydration/derivers/_registry.py tests/test_helpers.py
git commit -m "feat(customer-hydration): Registry for ordered deriver execution"
```

---

## Task 11: Write `backfill_accounts.py` skeleton (no-deriver dry-run)

**Files:**
- Create: `customer_hydration/backfill_accounts.py`
- Create: `tests/test_backfill_skeleton.py`

- [ ] **Step 1: Write the failing test**

`tests/test_backfill_skeleton.py`:

```python
"""Smoke tests for the Phase 4 backfill_accounts skeleton (no derivers yet)."""
import json
from pathlib import Path

import pytest

from customer_hydration import backfill_accounts


def test_run_backfill_returns_zero_on_empty_input(tmp_path):
    """With no records, run_backfill produces an empty CSV and exits rc=0."""
    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        records=[],            # injected for testing
        life_events_by_id={},  # injected for testing
    )
    assert rc == 0
    assert (out_dir / "manifest.json").exists()


def test_run_backfill_builds_archetype_per_record(tmp_path):
    """With one record, run_backfill builds an archetype but writes empty CSV
    (no derivers registered yet)."""
    out_dir = tmp_path / "run"
    record = json.loads(
        Path(__file__).parent.joinpath("fixtures/accounts/retail_55yo_affluent.json").read_text()
    )
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        records=[record],
        life_events_by_id={},
    )
    assert rc == 0
    manifest = json.loads((out_dir / "manifest.json").read_text())
    assert manifest["query"]["rows_queried"] == 1
    # No derivers registered → no deltas
    assert manifest["derivation"]["rows_with_deltas"] == 0


def test_run_backfill_dry_run_skips_bulk_upsert(tmp_path):
    """--dry-run mode never calls the loader."""
    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        records=[],
        life_events_by_id={},
    )
    assert rc == 0
    # No bulk_job log file in dry-run mode
    assert not (out_dir / "bulk_job.log").exists()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_backfill_skeleton.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'customer_hydration.backfill_accounts'`

- [ ] **Step 3: Write the implementation**

`customer_hydration/backfill_accounts.py`:

```python
"""Phase 4 backfill orchestrator.

Reads existing Account records, builds a PersonaArchetype per record, runs
the deriver registry, null-filters the candidates, writes a sparse CSV, and
(unless --dry-run) bulk-upserts via External_ID__c. Optionally triggers the
Account DC stream refresh after upsert.

In Plan 4a, only the skeleton is implemented — no derivers registered, no
bulk upsert, no DC refresh. Plans 4b–4d add those capabilities.

See spec docs/superpowers/specs/2026-05-26-phase-4-account-backfill-design.md.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from customer_hydration.derivers._archetype import build_archetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers._registry import Registry


def _build_registry() -> Registry:
    """Build the deriver registry. In Plan 4a this returns an empty registry;
    Plans 4b/4c register the 7 derivers."""
    return Registry()


def run_backfill(
    *,
    target_org: str,
    output_dir: Path,
    dry_run: bool = False,
    records: list[dict] | None = None,
    life_events_by_id: dict[str, list[dict]] | None = None,
) -> int:
    """Run the Phase 4 backfill against the given records.

    Args:
        target_org: SF org alias (used by Plan 4d to issue real SOQL).
        output_dir: Where to write manifest, CSV, and logs.
        dry_run: If True, skip the bulk upsert and DC refresh steps.
        records: Pre-fetched Account records. In Plan 4a, callers always inject
                 these (no live SOQL yet). In Plan 4d the orchestrator will
                 fetch from the org when records is None.
        life_events_by_id: Map of account Id → list of LifeEvent dicts.

    Returns:
        Exit code (0 on success).
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    records = records or []
    life_events_by_id = life_events_by_id or {}

    registry = _build_registry()
    rows_with_deltas = 0
    rows_skipped_already_full = 0
    output_buffer: list[dict[str, Any]] = []

    started_at = datetime.now(timezone.utc).isoformat()

    for record in records:
        rng = seeded_rng(record["Id"])
        archetype = build_archetype(
            record,
            rng,
            life_events=life_events_by_id.get(record["Id"], []),
        )
        candidates = registry.run(archetype, record, rng)
        delta = {f: v for f, v in candidates.items() if record.get(f) is None}
        if not delta:
            rows_skipped_already_full += 1
            continue
        rows_with_deltas += 1
        output_buffer.append(
            {
                "External_ID__c": record.get("External_ID__c") or f"BACKFILL-{record['Id']}",
                **delta,
            }
        )

    # Write CSV (always; sparse is OK)
    csv_path = output_dir / "account_backfill.csv"
    if output_buffer:
        all_cols = sorted({k for row in output_buffer for k in row.keys()})
        lines = [",".join(all_cols)]
        for row in output_buffer:
            lines.append(",".join(str(row.get(c, "")) for c in all_cols))
        csv_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    else:
        csv_path.write_text("External_ID__c\n", encoding="utf-8")

    completed_at = datetime.now(timezone.utc).isoformat()

    manifest = {
        "run_id": output_dir.name,
        "target_org": target_org,
        "started_at": started_at,
        "completed_at": completed_at,
        "rc": 0,
        "phase_0": {"fields_owned_by_derivers": registry.all_owned_fields()},
        "query": {
            "rows_queried": len(records),
            "filter": {"persona": None, "record_type": None},
        },
        "derivation": {
            "rows_with_deltas": rows_with_deltas,
            "rows_skipped_already_full": rows_skipped_already_full,
            "rows_skipped_no_external_id": 0,
            "rows_with_deriver_errors": 0,
            "per_field_fill_counts": {},
            "per_persona_counts": {},
        },
        "bulk_load": None if dry_run else {"status": "not_implemented_in_4a"},
        "dc_refresh": None,
        "errors": [],
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    return 0
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_backfill_skeleton.py -v
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add customer_hydration/backfill_accounts.py tests/test_backfill_skeleton.py
git commit -m "feat(customer-hydration): backfill_accounts orchestrator skeleton"
```

---

## Task 12: Wire `backfill-accounts` subcommand into `cli.py`

**Files:**
- Modify: `customer_hydration/cli.py`
- Modify: `tests/test_backfill_skeleton.py`

- [ ] **Step 1: Read the current `cli.py` to find the dispatch table**

```bash
grep -n "subparsers\|add_parser\|def main\|def cli" customer_hydration/cli.py | head -30
```

(This identifies the existing argparse pattern. The subcommand registration block is what we'll modify.)

- [ ] **Step 2: Write the failing test**

Append to `tests/test_backfill_skeleton.py`:

```python
import subprocess
import sys


def test_cli_backfill_accounts_subcommand_registered():
    """`hydrate.py backfill-accounts --help` must exit 0 and mention the subcommand."""
    result = subprocess.run(
        [sys.executable, "hydrate.py", "backfill-accounts", "--help"],
        capture_output=True,
        text=True,
        cwd=Path(__file__).resolve().parents[1],  # repo root
    )
    assert result.returncode == 0, f"stderr: {result.stderr}"
    assert "backfill-accounts" in result.stdout or "--target-org" in result.stdout
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd Customer_Hydration && pytest tests/test_backfill_skeleton.py::test_cli_backfill_accounts_subcommand_registered -v
```

Expected: FAIL — argparse exits non-zero because subcommand doesn't exist.

- [ ] **Step 4: Add subcommand registration to `cli.py`**

Locate the existing subparser block in `customer_hydration/cli.py` (it'll have `add_parser("hydrate", ...)`, `add_parser("dc-status", ...)`, `add_parser("refresh-streams", ...)`, etc.). Add the following block alongside them:

```python
    # Phase 4 — Account backfill
    p_backfill = subparsers.add_parser(
        "backfill-accounts",
        help="Fill empty Account fields across the target org (Phase 4)",
    )
    p_backfill.add_argument("--target-org", required=True, help="SF org alias")
    p_backfill.add_argument(
        "--persona",
        help="Comma-separated persona filter (retail,wealth,smb,commercial,household)",
    )
    p_backfill.add_argument(
        "--record-type",
        help="Comma-separated RecordType.Name filter",
    )
    p_backfill.add_argument(
        "--limit",
        type=int,
        help="Process at most N records (testing aid)",
    )
    p_backfill.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute diff and write CSV but skip bulk upsert + DC refresh",
    )
    p_backfill.add_argument(
        "--skip-refresh-stream",
        action="store_true",
        help="Skip the post-load DC stream refresh trigger",
    )
    p_backfill.add_argument(
        "--strict",
        action="store_true",
        help="Any non-zero per-row failure exits rc=2 (regardless of threshold)",
    )
    p_backfill.add_argument(
        "--require-external-id",
        action="store_true",
        help="Skip rows missing External_ID__c instead of stamping BACKFILL-<Id>",
    )
    p_backfill.add_argument(
        "--allow-production",
        action="store_true",
        help="Required to run against an org with a production-org id",
    )
```

And in the dispatch block (where `if args.command == "hydrate": ...` lives), add:

```python
    if args.command == "backfill-accounts":
        from customer_hydration.backfill_accounts import run_backfill
        from pathlib import Path
        from datetime import datetime
        ts = datetime.now().strftime("%Y-%m-%dT%H%M")
        out_dir = Path(f"output/backfill-accounts-{ts}")
        return run_backfill(
            target_org=args.target_org,
            output_dir=out_dir,
            dry_run=args.dry_run,
            records=None,         # Plan 4d wires live SOQL fetch here
            life_events_by_id=None,
        )
```

(Adapt the exact dispatch pattern to match the existing `cli.py` style — if the file uses a dict-of-handlers, add the entry; if it uses an `if/elif` chain, add the elif.)

- [ ] **Step 5: Run tests to verify it passes**

```bash
pytest tests/test_backfill_skeleton.py -v
```

Expected: 4 tests PASS.

- [ ] **Step 6: Verify the CLI works manually**

```bash
python hydrate.py backfill-accounts --help
```

Expected output: shows the `backfill-accounts` help with all flags.

- [ ] **Step 7: Commit**

```bash
git add customer_hydration/cli.py tests/test_backfill_skeleton.py
git commit -m "feat(customer-hydration): wire backfill-accounts subcommand into hydrate.py"
```

---

## Task 13: Run the full test suite + AGENTS.md update

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Run the entire test suite**

```bash
cd Customer_Hydration && pytest -v 2>&1 | tail -30
```

Expected: All tests pass — previous 527 + ~20 new ones from Plan 4a.

- [ ] **Step 2: Append Plan 4a entry to AGENTS.md "Plans history"**

Edit `AGENTS.md`. Find the "Plans history" section. After the Phase 2 entry, add:

```markdown
- **Phase 4 / Plan 4a** (Skeleton + PersonaArchetype, 2026-05-26) —
  `customer_hydration/derivers/` package with `_archetype.py`,
  `_helpers.py`, `_pairs.py`, `_base.py`, `_registry.py`. Stubbed
  orchestrator `customer_hydration/backfill_accounts.py` with `--dry-run`
  CLI subcommand registered. ~20 new tests covering archetype anchor reads,
  rng-fallback paths, LifeEvent integration, paired-fields lookup, and
  Registry semantics. No derivers yet — Plans 4b–4d add the 7 derivers,
  coverage rules, bulk upsert, and DC refresh. Spec:
  `docs/superpowers/specs/2026-05-26-phase-4-account-backfill-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs(customer-hydration): record Plan 4a completion in AGENTS.md"
```

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feat/customer-hydration-phase-4-plan-4a
```

---

## Acceptance criteria

Plan 4a is **done** when:

- [ ] `python hydrate.py backfill-accounts --help` shows the new subcommand and all 8 flags.
- [ ] `python hydrate.py backfill-accounts --target-org jdo-uqj0jr --dry-run --limit 1` runs to completion (will hit the live-SOQL gap from Plan 4d when run for real, but the CLI parses cleanly and writes a manifest with `rows_queried: 0`).
- [ ] `pytest tests/test_archetype.py tests/test_helpers.py tests/test_backfill_skeleton.py` is all green.
- [ ] All 538 → ~558 tests in the full suite pass (`pytest -v`).
- [ ] AGENTS.md "Plans history" includes the Plan 4a entry.
- [ ] Branch `feat/customer-hydration-phase-4-plan-4a` is pushed and ready for PR review.

## Out of scope for Plan 4a (deferred to 4b/4c/4d)

- Any of the 7 derivers (relationship, credit_personal, credit_bureau, profile, demographics, addresses, contact)
- coverage_rules.py + coverage_rules.yaml
- backfill_picklists.yaml
- Live SOQL fetch from the target org
- Bulk API 2.0 upsert wiring
- DC stream refresh trigger
- Coherence-narrative tests (depend on derivers existing)
- Live-org smoke test
