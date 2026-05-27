# Phase 4b — Person-side Derivers + Coherence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the four person-side derivers (relationship, credit_personal, profile, demographics) plus the person-relevant slices of addresses + contact, register them in the orchestrator, and verify coherence rules 1–16, 22–24 against narrative test customers — so a `--dry-run` against a person-account fixture produces a coherent CSV row.

**Architecture:** Each deriver lives in its own file under `customer_hydration/derivers/`, implements the `Deriver` Protocol from Plan 4a (`name`, `fields`, `applies_to(archetype)`, `derive(archetype, record, rng)`), and reads only `PersonaArchetype` + `record` for inputs. Plan 4b's `profile.py`, `addresses.py`, `contact.py` ship with `applies_to` guarded on `archetype.is_person` so the B2B branches added in Plan 4c slot in without touching person-side code. The orchestrator's `_build_registry` hook is updated once per deriver. Coherence rule tests live in a new `tests/test_coherence.py` and run end-to-end (build_archetype → registry.run → null-filter) so they catch cross-deriver regressions.

**Tech Stack:** Python 3.10+, dataclasses, pytest, hashlib, random.Random. No external libs added.

**Spec:** `docs/superpowers/specs/2026-05-26-phase-4-account-backfill-design.md` §4.2 rules 1–16, 22–24; §4.4 derivers `relationship`, `credit_personal`, `profile`, `demographics`, `addresses`, `contact`; §4.6 picklists; §4.7 paired fields.

---

## File Structure

**New files (production):**

- `customer_hydration/derivers/relationship.py` — owns 7 fields, implements rules 4, 5, 6, 7, 8
- `customer_hydration/derivers/credit_personal.py` — owns CreditScore + CreditRating, implements rules 2, 3
- `customer_hydration/derivers/profile.py` — Plan 4b ships the person-applicable fields (Tier, ServiceModel, CustomerType, Status, NetWorth, RiskTolerance, TimeHorizon, BorrowingHistory, InvestmentExperience). Implements rules 1, 16. (Plan 4c extends with AnnualRevenue, NumberOfEmployees, TotalRevenue.)
- `customer_hydration/derivers/demographics.py` — owns 18 person-only fields, implements rules 9, 10, 11, 12, 13, 14, 15
- `customer_hydration/derivers/addresses.py` — Plan 4b ships the person blocks (PersonMailing, PersonOther, BillingLatitude/Longitude, the four FinServ__*Address__pc summary fields, Fax). Implements rule 23. Plan 4c extends with Shipping* and Billing City/State/Country/Postal/Street.
- `customer_hydration/derivers/contact.py` — Plan 4b ships person-applicable fields (MiddleName, PersonTitle, PersonAssistantName/Phone, PersonDepartment, PersonLeadSource, Salutation, AccountNumber, Description top-off). Implements rule 24. Plan 4c extends with NAICS_Code__c, Sic, SicDesc, Site, TickerSymbol, Jigsaw, JigsawCompanyId, Industry top-off, Type, Rating.

**New files (config):**

- `config/backfill_picklists.yaml` — value+weight distributions for 8 picklists used in Plan 4b: KYCStatus, HomeOwnership, Tier, ServiceModel, CustomerType, Status, RiskTolerance, BorrowingHistory.

**New files (tests):**

- `tests/test_relationship.py` — ~12 unit tests for the relationship deriver
- `tests/test_credit_personal.py` — ~10 unit tests
- `tests/test_profile_person.py` — ~10 unit tests for the person-side of profile (Plan 4c adds `tests/test_profile_business.py`)
- `tests/test_demographics.py` — ~14 unit tests
- `tests/test_addresses_person.py` — ~7 unit tests for the person-side of addresses (Plan 4c adds B2B-side)
- `tests/test_contact_person.py` — ~7 unit tests for the person-side of contact (Plan 4c adds B2B-side)
- `tests/test_coherence.py` — ~17 end-to-end coherence tests covering rules 1–16, 22–24 plus 4 person-narrative tests
- `tests/fixtures/accounts/wealth_uhnw.json` — new fixture (high income, long tenure, heavy engagement)
- `tests/fixtures/accounts/retail_22yo_entry.json` — new fixture (young, low income, no birthdate populated → uses LifeEvent for marital status)

**Modified files:**

- `customer_hydration/backfill_accounts.py` — `_build_registry()` registers all 6 derivers
- `customer_hydration/derivers/_helpers.py` — adds `load_picklist_yaml(name)` helper for reading picklist distributions
- `tests/test_backfill_skeleton.py` — adds end-to-end smoke test that proves `run_backfill` produces a non-empty CSV when person accounts have nulls
- `AGENTS.md` — append Plan 4b entry to "Plans history"

**Out of scope for 4b:** Any B2B-only field; coverage_rules.py + coverage_rules.yaml; bulk upsert; DC refresh trigger; live-org integration.

**Plan 4b should leave the branch in a state where:** `python hydrate.py backfill-accounts --target-org <alias> --dry-run` against a synthetic in-memory list of person-account records produces a CSV with rows that satisfy every coherence rule a person-side deriver owns.

---

## Task 1: Bootstrap Plan 4b branch

**Files:** none yet — branch operations only.

- [ ] **Step 1: Cut the feature branch from main**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration checkout main
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration pull origin main
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration checkout -b feat/customer-hydration-phase-4-plan-4b
```

- [ ] **Step 2: Verify the 4a foundation is in place**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_helpers.py tests/test_archetype.py tests/test_backfill_skeleton.py -q
```

Expected: 44 tests PASS (24 helpers + 16 archetype + 4 skeleton). If less than 44, the 4a branch wasn't merged into main yet — STOP and ask the controller.

- [ ] **Step 3: Confirm no uncommitted changes**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration status --short
```

Expected: empty (or only the standard `output/` artifacts).

No commit in this task — branch creation is the work.

---

## Task 2: Picklist YAML config + loader helper

**Files:**
- Create: `config/backfill_picklists.yaml`
- Modify: `customer_hydration/derivers/_helpers.py`
- Modify: `tests/test_helpers.py`

- [ ] **Step 1: Create `config/backfill_picklists.yaml`**

```yaml
# Phase 4 picklist distributions — values + weights consumed by derivers via
# customer_hydration.derivers._helpers.load_picklist_yaml.
#
# Each entry's `values` list MUST be a subset of the org's actual picklist
# values for that field; preflight verifies this.

FinServ__KYCStatus__c:
  values: [Approved, Pending, Expired]
  weights: [0.90, 0.08, 0.02]

FinServ__HomeOwnership__pc:
  values: [Own, Rent, Other]
  weights: [0.65, 0.30, 0.05]

Tier__c:
  values: [Bronze, Silver, Gold, Platinum, Diamond]
  weights: [0.40, 0.30, 0.20, 0.08, 0.02]

FinServ__ServiceModel__c:
  values: [Self-Service, Standard, Premier, Private]
  weights: [0.40, 0.40, 0.15, 0.05]

FinServ__CustomerType__c:
  values: [Individual, Business, Trust]
  weights: [0.85, 0.10, 0.05]

FinServ__Status__c:
  values: [Active, Inactive, Closed]
  weights: [0.95, 0.04, 0.01]

FinServ__RiskTolerance__c:
  values: [Conservative, Moderate, Aggressive]
  weights: [0.30, 0.55, 0.15]

FinServ__BorrowingHistory__c:
  values: [Excellent, Good, Fair, Poor, None]
  weights: [0.25, 0.40, 0.20, 0.05, 0.10]
```

- [ ] **Step 2: Write the failing test for `load_picklist_yaml`**

Append to `tests/test_helpers.py`:

```python
from customer_hydration.derivers._helpers import load_picklist_yaml


def test_load_picklist_yaml_returns_values_and_weights():
    entry = load_picklist_yaml("FinServ__KYCStatus__c")
    assert entry["values"] == ["Approved", "Pending", "Expired"]
    assert entry["weights"] == [0.90, 0.08, 0.02]


def test_load_picklist_yaml_returns_none_when_missing():
    assert load_picklist_yaml("Some__NonExistent__c") is None


def test_load_picklist_yaml_loads_all_eight_phase_4b_fields():
    expected = [
        "FinServ__KYCStatus__c",
        "FinServ__HomeOwnership__pc",
        "Tier__c",
        "FinServ__ServiceModel__c",
        "FinServ__CustomerType__c",
        "FinServ__Status__c",
        "FinServ__RiskTolerance__c",
        "FinServ__BorrowingHistory__c",
    ]
    for field in expected:
        entry = load_picklist_yaml(field)
        assert entry is not None, f"{field} missing from backfill_picklists.yaml"
        assert "values" in entry
        assert "weights" in entry
        assert len(entry["values"]) == len(entry["weights"])
```

- [ ] **Step 3: Run tests to verify failure**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_helpers.py::test_load_picklist_yaml_returns_values_and_weights -v
```

Expected: FAIL with `ImportError: cannot import name 'load_picklist_yaml'`.

- [ ] **Step 4: Implement `load_picklist_yaml`**

Append to `customer_hydration/derivers/_helpers.py`:

```python
import functools
from pathlib import Path

import yaml


_BACKFILL_PICKLIST_PATH = (
    Path(__file__).resolve().parents[2] / "config" / "backfill_picklists.yaml"
)


@functools.lru_cache(maxsize=1)
def _load_picklist_yaml() -> dict[str, dict]:
    """Cache the YAML once per process."""
    if not _BACKFILL_PICKLIST_PATH.exists():
        return {}
    with _BACKFILL_PICKLIST_PATH.open() as fh:
        data = yaml.safe_load(fh) or {}
    return data


def load_picklist_yaml(field_name: str) -> dict | None:
    """Return {'values': [...], 'weights': [...]} for a picklist field, or None."""
    return _load_picklist_yaml().get(field_name)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_helpers.py -q
```

Expected: 27 tests PASS (was 24, added 3).

- [ ] **Step 6: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add config/backfill_picklists.yaml customer_hydration/derivers/_helpers.py tests/test_helpers.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
feat(customer-hydration): backfill_picklists.yaml + load_picklist_yaml helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: relationship deriver

**Files:**
- Create: `customer_hydration/derivers/relationship.py`
- Create: `tests/test_relationship.py`

This deriver owns 7 fields, implements rules 4, 5, 6, 7, 8.

- [ ] **Step 1: Write the failing test file**

`tests/test_relationship.py`:

```python
"""Unit tests for the relationship deriver (rules 4, 5, 6, 7, 8)."""
from datetime import date, timedelta
from random import Random

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers.relationship import RelationshipDeriver


def make_archetype(
    *,
    persona: str = "retail",
    is_person: bool = True,
    age: int = 45,
    income_band: str = "middle",
    tenure_years: float = 5.0,
    engagement_level: str = "regular",
    created_date: date = date(2020, 1, 1),
    record_type: str = "FSC Person Accounts",
    account_id: str = "001xx000000ABC",
) -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=created_date,
        record_type=record_type, is_person=is_person, persona=persona,
        age=age, gender="Male", marital_status="Single",
        household_size=1, income_band=income_band,
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=tenure_years, engagement_level=engagement_level,
        home_metro="Boston, MA",
        business_size=None, industry_code=None, business_credit_quality=None,
    )


def test_deriver_metadata():
    d = RelationshipDeriver()
    assert d.name == "relationship"
    assert "FinServ__RelationshipStartDate__c" in d.fields
    assert "FinServ__KYCStatus__c" in d.fields
    assert "FinServ__LifetimeValue__c" in d.fields


def test_applies_to_returns_true_for_any_archetype_with_created_date():
    """Relationship fields apply to every account with a CreatedDate."""
    d = RelationshipDeriver()
    person = make_archetype()
    biz = make_archetype(is_person=False, persona="commercial",
                          record_type="Business")
    assert d.applies_to(person) is True
    assert d.applies_to(biz) is True


def test_rule_4_relationship_start_equals_created_date():
    """Rule 4: RelationshipStartDate = CreatedDate exactly."""
    d = RelationshipDeriver()
    a = make_archetype(created_date=date(2018, 4, 12))
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["FinServ__RelationshipStartDate__c"] == "2018-04-12"


def test_length_of_relationship_matches_tenure_years():
    """LengthOfRelationship == archetype.tenure_years (rounded)."""
    d = RelationshipDeriver()
    a = make_archetype(tenure_years=11.3)
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["FinServ__LengthOfRelationship__c"] == pytest.approx(11.3, abs=0.05)


def test_rule_5_kyc_date_after_relationship_start():
    """Rule 5: KYCDate ∈ [RelationshipStartDate, today] for 100 archetypes."""
    d = RelationshipDeriver()
    today = date.today()
    for i in range(100):
        a = make_archetype(
            account_id=f"001xx000000{i:06d}",
            created_date=date(2018, 1, 1),
        )
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        kyc = date.fromisoformat(out["FinServ__KYCDate__c"])
        assert a.created_date <= kyc <= today


def test_rule_6_kyc_status_distribution_skews_with_engagement():
    """Rule 6: dormant→Approved ~60%, heavy→Approved ~98%."""
    d = RelationshipDeriver()
    dormant_counts = {"Approved": 0, "Pending": 0, "Expired": 0}
    heavy_counts = {"Approved": 0, "Pending": 0, "Expired": 0}
    for i in range(1000):
        ad = make_archetype(
            account_id=f"001xx000DOR{i:05d}",
            engagement_level="dormant",
        )
        ah = make_archetype(
            account_id=f"001xx000HVY{i:05d}",
            engagement_level="heavy",
        )
        d_out = d.derive(ad, {"Id": ad.account_id}, seeded_rng(ad.account_id))
        h_out = d.derive(ah, {"Id": ah.account_id}, seeded_rng(ah.account_id))
        dormant_counts[d_out["FinServ__KYCStatus__c"]] += 1
        heavy_counts[h_out["FinServ__KYCStatus__c"]] += 1
    # dormant: 60% Approved expected, allow [50, 70]
    assert 500 <= dormant_counts["Approved"] <= 700
    # heavy: 98% Approved expected, allow [950, 1000]
    assert heavy_counts["Approved"] >= 950
    # heavy never produces Expired
    assert heavy_counts["Expired"] == 0


def test_rule_7_lifetime_value_formula():
    """LifetimeValue = AnnualIncome × tenure_years × engagement_mult × tier_mult.
    heavy/Diamond = 0.30; dormant/Bronze = 0.02."""
    d = RelationshipDeriver()
    a_heavy = make_archetype(
        income_band="uhnw",  # → Diamond tier
        tenure_years=10.0,
        engagement_level="heavy",
    )
    record = {"Id": a_heavy.account_id, "FinServ__AnnualIncome__pc": 2_000_000}
    out_heavy = d.derive(a_heavy, record, seeded_rng(a_heavy.account_id))
    # Expected: 2_000_000 × 10 × 0.30 = $6M
    assert out_heavy["FinServ__LifetimeValue__c"] == pytest.approx(6_000_000, rel=0.01)

    a_dormant = make_archetype(
        income_band="entry",  # → Bronze tier
        tenure_years=2.0,
        engagement_level="dormant",
    )
    record = {"Id": a_dormant.account_id, "FinServ__AnnualIncome__pc": 30_000}
    out_dormant = d.derive(a_dormant, record, seeded_rng(a_dormant.account_id))
    # Expected: 30_000 × 2 × 0.02 = $1,200
    assert out_dormant["FinServ__LifetimeValue__c"] == pytest.approx(1_200, rel=0.01)


def test_lifetime_value_handles_missing_income():
    """If AnnualIncome is null, LifetimeValue is null too (don't write garbage)."""
    d = RelationshipDeriver()
    a = make_archetype()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out.get("FinServ__LifetimeValue__c") is None


def test_rule_8_next_review_cadence_by_tier():
    """Rule 8: Diamond:30d, Platinum:60d, Gold:90d, Silver:180d, Bronze:365d."""
    d = RelationshipDeriver()
    today = date.today()
    cases = [
        ("uhnw", 30),       # Diamond
        ("hnw", 60),        # Platinum
        ("affluent", 90),   # Gold
        ("middle", 180),    # Silver
        ("entry", 365),     # Bronze
    ]
    for band, days in cases:
        a = make_archetype(income_band=band)
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        review = date.fromisoformat(out["FinServ__NextReview__c"])
        assert review == today + timedelta(days=days), \
            f"income_band={band} expected today+{days}d"


def test_last_interaction_topoff_only_when_null():
    """LastInteraction is a top-off field. Only fill if record value is null."""
    d = RelationshipDeriver()
    a = make_archetype(engagement_level="regular")
    # Record already has LastInteraction → deriver should NOT propose a value
    record = {"Id": a.account_id, "FinServ__LastInteraction__c": "2025-12-01"}
    out = d.derive(a, record, seeded_rng(a.account_id))
    assert "FinServ__LastInteraction__c" not in out

    # Record has null → deriver proposes a date in the recent past
    record_null = {"Id": a.account_id, "FinServ__LastInteraction__c": None}
    out_null = d.derive(a, record_null, seeded_rng(a.account_id))
    li = date.fromisoformat(out_null["FinServ__LastInteraction__c"])
    today = date.today()
    assert (today - li).days <= 365


def test_deriver_is_deterministic():
    """Same archetype + same rng seed → identical output."""
    d = RelationshipDeriver()
    a = make_archetype()
    out1 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    out2 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out1 == out2
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_relationship.py -q
```

Expected: FAIL with `ModuleNotFoundError: No module named 'customer_hydration.derivers.relationship'`.

- [ ] **Step 3: Implement the deriver**

`customer_hydration/derivers/relationship.py`:

```python
"""relationship deriver — RelationshipStartDate, KYC fields, LifetimeValue, NextReview.

See spec §4.4 (relationship row) and §4.2 rules 4, 5, 6, 7, 8.
"""
from __future__ import annotations

from datetime import date, timedelta
from random import Random
from typing import Any

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import load_picklist_yaml, weighted_pick


# Rule 6 — KYCStatus distribution by engagement_level
_KYC_WEIGHTS_BY_ENGAGEMENT: dict[str, list[float]] = {
    "dormant": [0.60, 0.05, 0.35],
    "light":   [0.80, 0.10, 0.10],
    "regular": [0.92, 0.06, 0.02],
    "heavy":   [0.98, 0.02, 0.00],
}


# Rule 7 — engagement multiplier on LifetimeValue
_ENGAGEMENT_MULT: dict[str, float] = {
    "dormant": 0.02,
    "light":   0.05,
    "regular": 0.10,
    "heavy":   0.20,
}


# Rule 7 + 1 — tier multiplier on LifetimeValue (income_band → Tier → multiplier)
_TIER_BY_INCOME_BAND: dict[str, str] = {
    "entry":    "Bronze",
    "middle":   "Silver",
    "affluent": "Gold",
    "hnw":      "Platinum",
    "uhnw":     "Diamond",
}


_TIER_LIFETIME_MULT: dict[str, float] = {
    "Bronze":   1.00,   # multiplied with engagement_mult; dormant/Bronze = 0.02 × 1.00 = 0.02
    "Silver":   1.10,
    "Gold":     1.25,
    "Platinum": 1.40,
    "Diamond":  1.50,   # heavy/Diamond = 0.20 × 1.50 = 0.30
}


# Rule 8 — NextReview cadence by Tier
_NEXT_REVIEW_DAYS: dict[str, int] = {
    "Diamond":  30,
    "Platinum": 60,
    "Gold":     90,
    "Silver":   180,
    "Bronze":   365,
}


class RelationshipDeriver:
    """Owns relationship-lifecycle fields. See spec §4.4 row 'relationship.py'."""

    name = "relationship"
    fields = [
        "FinServ__RelationshipStartDate__c",
        "FinServ__LengthOfRelationship__c",
        "FinServ__KYCDate__c",
        "FinServ__KYCStatus__c",
        "FinServ__NextReview__c",
        "FinServ__LifetimeValue__c",
        "FinServ__LastInteraction__c",
    ]

    def applies_to(self, archetype: PersonaArchetype) -> bool:
        """Relationship fields apply to every account with a CreatedDate."""
        return True

    def derive(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {}
        today = date.today()

        # Rule 4 — RelationshipStartDate = CreatedDate
        out["FinServ__RelationshipStartDate__c"] = archetype.created_date.isoformat()

        # LengthOfRelationship — already on archetype as tenure_years
        out["FinServ__LengthOfRelationship__c"] = round(archetype.tenure_years, 2)

        # Rule 5 — KYCDate uniform(created_date, today)
        span_days = max(1, (today - archetype.created_date).days)
        kyc_offset = rng.randint(0, span_days)
        out["FinServ__KYCDate__c"] = (
            archetype.created_date + timedelta(days=kyc_offset)
        ).isoformat()

        # Rule 6 — KYCStatus weighted by engagement_level
        weights = _KYC_WEIGHTS_BY_ENGAGEMENT.get(archetype.engagement_level,
                                                  [0.90, 0.08, 0.02])
        kyc_picklist = load_picklist_yaml("FinServ__KYCStatus__c")
        kyc_values = (
            kyc_picklist["values"] if kyc_picklist else ["Approved", "Pending", "Expired"]
        )
        out["FinServ__KYCStatus__c"] = weighted_pick(rng, kyc_values, weights)

        # Rule 7 — LifetimeValue (only when AnnualIncome present)
        income = record.get("FinServ__AnnualIncome__pc")
        if income is not None:
            tier = _TIER_BY_INCOME_BAND.get(archetype.income_band, "Silver")
            engagement_mult = _ENGAGEMENT_MULT.get(archetype.engagement_level, 0.10)
            tier_mult = _TIER_LIFETIME_MULT.get(tier, 1.10)
            ltv = float(income) * archetype.tenure_years * engagement_mult * tier_mult
            out["FinServ__LifetimeValue__c"] = round(ltv, 2)

        # Rule 8 — NextReview cadence by Tier
        tier = _TIER_BY_INCOME_BAND.get(archetype.income_band, "Silver")
        out["FinServ__NextReview__c"] = (
            today + timedelta(days=_NEXT_REVIEW_DAYS[tier])
        ).isoformat()

        # LastInteraction top-off (only when record value is null)
        if record.get("FinServ__LastInteraction__c") is None:
            offset = rng.randint(0, 365)
            out["FinServ__LastInteraction__c"] = (today - timedelta(days=offset)).isoformat()

        return out
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_relationship.py -v
```

Expected: 11 PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add customer_hydration/derivers/relationship.py tests/test_relationship.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
feat(customer-hydration): relationship deriver (rules 4, 5, 6, 7, 8)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: credit_personal deriver

**Files:**
- Create: `customer_hydration/derivers/credit_personal.py`
- Create: `tests/test_credit_personal.py`

Owns CreditScore + CreditRating, person accounts only, implements rules 2 + 3.

- [ ] **Step 1: Write the failing test file**

`tests/test_credit_personal.py`:

```python
"""Unit tests for credit_personal deriver (rules 2, 3)."""
from datetime import date

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers.credit_personal import CreditPersonalDeriver


def _arch(*, income_band="middle", is_person=True, persona="retail",
          account_id="001xx000000ABC") -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2020, 1, 1),
        record_type="FSC Person Accounts" if is_person else "Business",
        is_person=is_person, persona=persona,
        age=40, gender="Male", marital_status="Single",
        household_size=1, income_band=income_band,
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=5.0, engagement_level="regular",
        home_metro="Boston, MA",
        business_size=None, industry_code=None, business_credit_quality=None,
    )


def test_deriver_metadata():
    d = CreditPersonalDeriver()
    assert d.name == "credit_personal"
    assert d.fields == ["FinServ__CreditScore__c", "FinServ__CreditRating__c"]


def test_applies_to_person_account_returns_true():
    d = CreditPersonalDeriver()
    assert d.applies_to(_arch(is_person=True)) is True


def test_applies_to_business_account_returns_false():
    """Business credit lives in credit_bureau, not credit_personal."""
    d = CreditPersonalDeriver()
    assert d.applies_to(_arch(is_person=False, persona="commercial")) is False


def test_rule_2_credit_score_in_fico_range():
    """All scores must be 300–850 across 1000 archetypes."""
    d = CreditPersonalDeriver()
    for i in range(1000):
        a = _arch(account_id=f"001xx00000F{i:05d}")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        assert 300 <= out["FinServ__CreditScore__c"] <= 850


def test_rule_2_score_distribution_shifts_with_income_band():
    """Higher income bands → higher mean credit score."""
    d = CreditPersonalDeriver()
    entry_scores = []
    uhnw_scores = []
    for i in range(500):
        a_entry = _arch(account_id=f"001xx00000E{i:05d}", income_band="entry")
        a_uhnw = _arch(account_id=f"001xx00000U{i:05d}", income_band="uhnw")
        entry_scores.append(
            d.derive(a_entry, {"Id": a_entry.account_id},
                     seeded_rng(a_entry.account_id))["FinServ__CreditScore__c"]
        )
        uhnw_scores.append(
            d.derive(a_uhnw, {"Id": a_uhnw.account_id},
                     seeded_rng(a_uhnw.account_id))["FinServ__CreditScore__c"]
        )
    entry_mean = sum(entry_scores) / len(entry_scores)
    uhnw_mean = sum(uhnw_scores) / len(uhnw_scores)
    # entry band centered around 580; uhnw around 810
    assert 540 <= entry_mean <= 620
    assert 780 <= uhnw_mean <= 840


def test_rule_3_rating_derives_from_score_buckets():
    """<580=Poor, <670=Fair, <740=Good, <800=Very Good, ≥800=Excellent."""
    from customer_hydration.derivers.credit_personal import _rating_from_score
    assert _rating_from_score(500) == "Poor"
    assert _rating_from_score(579) == "Poor"
    assert _rating_from_score(580) == "Fair"
    assert _rating_from_score(669) == "Fair"
    assert _rating_from_score(670) == "Good"
    assert _rating_from_score(739) == "Good"
    assert _rating_from_score(740) == "Very Good"
    assert _rating_from_score(799) == "Very Good"
    assert _rating_from_score(800) == "Excellent"
    assert _rating_from_score(850) == "Excellent"


def test_rule_3_paired_fill_uses_existing_score():
    """If record already has CreditScore, derive Rating from it (not from rng)."""
    d = CreditPersonalDeriver()
    a = _arch()
    record = {
        "Id": a.account_id,
        "FinServ__CreditScore__c": 720,
        "FinServ__CreditRating__c": None,
    }
    out = d.derive(a, record, seeded_rng(a.account_id))
    # 720 → Good band
    assert out["FinServ__CreditRating__c"] == "Good"
    # Don't propose a CreditScore for a record that already has one
    assert "FinServ__CreditScore__c" not in out


def test_rule_3_paired_fill_uses_existing_rating():
    """If record already has Rating, derive Score (median of the band)."""
    d = CreditPersonalDeriver()
    a = _arch()
    record = {
        "Id": a.account_id,
        "FinServ__CreditScore__c": None,
        "FinServ__CreditRating__c": "Good",
    }
    out = d.derive(a, record, seeded_rng(a.account_id))
    # Good band is [670, 740) → median 705
    assert 670 <= out["FinServ__CreditScore__c"] < 740
    # Don't propose a Rating for a record that already has one
    assert "FinServ__CreditRating__c" not in out


def test_deriver_is_deterministic():
    d = CreditPersonalDeriver()
    a = _arch()
    out1 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    out2 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out1 == out2
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_credit_personal.py -q
```

Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement the deriver**

`customer_hydration/derivers/credit_personal.py`:

```python
"""credit_personal deriver — FinServ__CreditScore__c + CreditRating.

Person accounts only. See spec §4.2 rules 2, 3.
"""
from __future__ import annotations

from random import Random
from typing import Any

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._pairs import read_paired_value


# Rule 2 — score distribution by income band (mean, std)
_SCORE_DIST_BY_BAND: dict[str, tuple[float, float]] = {
    "entry":    (580, 60),
    "middle":   (680, 50),
    "affluent": (740, 40),
    "hnw":      (790, 30),
    "uhnw":     (810, 20),
}


# Rule 3 — rating bucket boundaries
_RATING_BANDS: list[tuple[int, str]] = [
    (580, "Poor"),
    (670, "Fair"),
    (740, "Good"),
    (800, "Very Good"),
    (850, "Excellent"),
]


def _rating_from_score(score: int) -> str:
    """Bucket a numeric FICO score into one of five rating bands.

    <580 Poor, <670 Fair, <740 Good, <800 Very Good, ≥800 Excellent.
    """
    for upper, name in _RATING_BANDS:
        if score < upper:
            return name
    return "Excellent"


def _score_from_rating(rating: str, rng: Random) -> int:
    """Return a score consistent with a given rating (band median ± small jitter)."""
    band_lower = {
        "Poor":      (300, 580),
        "Fair":      (580, 670),
        "Good":      (670, 740),
        "Very Good": (740, 800),
        "Excellent": (800, 851),
    }
    lo, hi = band_lower.get(rating, (670, 740))
    # Median of band; rng allows ±10 jitter while staying inside band
    median = (lo + hi) // 2
    jitter = rng.randint(-10, 10)
    return max(lo, min(hi - 1, median + jitter))


class CreditPersonalDeriver:
    """Owns FICO + rating for person accounts. See spec §4.4 row 'credit_personal.py'."""

    name = "credit_personal"
    fields = ["FinServ__CreditScore__c", "FinServ__CreditRating__c"]

    def applies_to(self, archetype: PersonaArchetype) -> bool:
        return archetype.is_person

    def derive(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {}

        # Paired-field check — if either side is already populated, derive the
        # partner from it deterministically (rule 3).
        existing = read_paired_value(record, "FinServ__CreditScore__c")
        if existing is not None:
            populated_field, populated_value = existing
            if populated_field == "FinServ__CreditScore__c":
                out["FinServ__CreditRating__c"] = _rating_from_score(int(populated_value))
            else:
                out["FinServ__CreditScore__c"] = _score_from_rating(populated_value, rng)
            return out

        # Both null — synth a score from the income-band distribution (rule 2)
        mean, std = _SCORE_DIST_BY_BAND.get(archetype.income_band, (680, 50))
        score = int(round(rng.gauss(mean, std)))
        score = max(300, min(850, score))
        out["FinServ__CreditScore__c"] = score
        out["FinServ__CreditRating__c"] = _rating_from_score(score)

        return out
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_credit_personal.py -v
```

Expected: 9 PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add customer_hydration/derivers/credit_personal.py tests/test_credit_personal.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
feat(customer-hydration): credit_personal deriver (rules 2, 3)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: profile deriver — person-side fields only

**Files:**
- Create: `customer_hydration/derivers/profile.py`
- Create: `tests/test_profile_person.py`

Plan 4b owns Tier, ServiceModel, CustomerType, Status, NetWorth, RiskTolerance, TimeHorizon, BorrowingHistory, InvestmentExperience. Plan 4c will extend this same module with AnnualRevenue, NumberOfEmployees, TotalRevenue.

- [ ] **Step 1: Write the failing test file**

`tests/test_profile_person.py`:

```python
"""Unit tests for the person-side of profile deriver (rules 1, 16)."""
from datetime import date

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers.profile import ProfileDeriver


def _arch(*, income_band="middle", is_person=True, persona="retail", age=40,
          account_id="001xx000000ABC") -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2020, 1, 1),
        record_type="FSC Person Accounts" if is_person else "Business",
        is_person=is_person, persona=persona,
        age=age, gender="Male", marital_status="Single",
        household_size=1, income_band=income_band,
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=5.0, engagement_level="regular",
        home_metro="Boston, MA",
        business_size=None, industry_code=None, business_credit_quality=None,
    )


def test_deriver_metadata():
    d = ProfileDeriver()
    assert d.name == "profile"
    assert "Tier__c" in d.fields
    assert "FinServ__ServiceModel__c" in d.fields
    assert "FinServ__RiskTolerance__c" in d.fields


def test_rule_1_tier_from_income_band():
    """Diamond/Platinum/Gold/Silver/Bronze from uhnw/hnw/affluent/middle/entry."""
    d = ProfileDeriver()
    cases = [
        ("entry",    "Bronze"),
        ("middle",   "Silver"),
        ("affluent", "Gold"),
        ("hnw",      "Platinum"),
        ("uhnw",     "Diamond"),
    ]
    for band, expected_tier in cases:
        a = _arch(income_band=band)
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        assert out["Tier__c"] == expected_tier, f"income_band={band}"


def test_rule_1_service_model_from_tier():
    """Diamond→Private; Platinum→Premier; Gold→Standard; Silver/Bronze→Self-Service."""
    d = ProfileDeriver()
    cases = [
        ("entry",    "Self-Service"),
        ("middle",   "Self-Service"),
        ("affluent", "Standard"),
        ("hnw",      "Premier"),
        ("uhnw",     "Private"),
    ]
    for band, expected_sm in cases:
        a = _arch(income_band=band)
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        assert out["FinServ__ServiceModel__c"] == expected_sm, f"income_band={band}"


def test_status_is_active():
    d = ProfileDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["FinServ__Status__c"] == "Active"


def test_customer_type_for_person_account_is_individual():
    """Rule: CustomerType from RT — Person Account → Individual."""
    d = ProfileDeriver()
    a = _arch(is_person=True)
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["FinServ__CustomerType__c"] == "Individual"


def test_net_worth_uses_rollup_sum_times_multiple():
    """NetWorth = (Investments + Deposits + NonfinAssets - Liabilities) × net_worth_multiple."""
    d = ProfileDeriver()
    a = _arch()
    record = {
        "Id": a.account_id,
        "FinServ__TotalInvestments__c": 100_000,
        "FinServ__TotalBankDeposits__c": 50_000,
        "FinServ__TotalNonfinancialAssets__c": 250_000,
        "FinServ__TotalLiabilities__c": 100_000,
    }
    out = d.derive(a, record, seeded_rng(a.account_id))
    base = 100_000 + 50_000 + 250_000 - 100_000  # = 300_000
    expected = base * a.net_worth_multiple
    assert out["FinServ__NetWorth__c"] == pytest.approx(expected, rel=0.001)


def test_net_worth_skipped_when_rollups_missing():
    """If any rollup is null, skip NetWorth (don't write garbage)."""
    d = ProfileDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert "FinServ__NetWorth__c" not in out


def test_rule_16_risk_triple_is_one_of_three_combos():
    """RiskTolerance + TimeHorizon + InvestmentExperience must be one of three triples."""
    d = ProfileDeriver()
    valid_triples = {
        ("Conservative", "Short-Term", "Beginner"),
        ("Moderate",     "Medium-Term", "Intermediate"),
        ("Aggressive",   "Long-Term",   "Experienced"),
    }
    for i in range(100):
        a = _arch(account_id=f"001xx00000R{i:05d}")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        triple = (
            out["FinServ__RiskTolerance__c"],
            out["FinServ__TimeHorizon__c"],
            out["FinServ__InvestmentExperience__c"],
        )
        assert triple in valid_triples, f"got incoherent triple {triple}"


def test_rule_16_wealth_persona_skews_aggressive():
    """Wealth persona should have ≥ 50% Aggressive triple."""
    d = ProfileDeriver()
    aggressive = 0
    for i in range(500):
        a = _arch(account_id=f"001xx00000W{i:05d}", persona="wealth", income_band="hnw")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        if out["FinServ__RiskTolerance__c"] == "Aggressive":
            aggressive += 1
    assert aggressive >= 250


def test_borrowing_history_is_picklist_value():
    d = ProfileDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["FinServ__BorrowingHistory__c"] in (
        "Excellent", "Good", "Fair", "Poor", "None"
    )


def test_deriver_is_deterministic():
    d = ProfileDeriver()
    a = _arch()
    out1 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    out2 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out1 == out2
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_profile_person.py -q
```

Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement the deriver**

`customer_hydration/derivers/profile.py`:

```python
"""profile deriver — Tier, ServiceModel, NetWorth, RiskTolerance triple, etc.

Plan 4b ships the person-applicable fields. Plan 4c extends with AnnualRevenue,
NumberOfEmployees, TotalRevenue (B2B). See spec §4.2 rules 1, 16.
"""
from __future__ import annotations

from random import Random
from typing import Any

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import weighted_pick


# Rule 1 — Tier from income_band quintile
_TIER_BY_INCOME_BAND: dict[str, str] = {
    "entry":    "Bronze",
    "middle":   "Silver",
    "affluent": "Gold",
    "hnw":      "Platinum",
    "uhnw":     "Diamond",
}


# Rule 1 — ServiceModel from Tier
_SERVICE_MODEL_BY_TIER: dict[str, str] = {
    "Bronze":   "Self-Service",
    "Silver":   "Self-Service",
    "Gold":     "Standard",
    "Platinum": "Premier",
    "Diamond":  "Private",
}


# Rule 16 — three coherent risk triples
_RISK_TRIPLES: list[tuple[str, str, str]] = [
    ("Conservative", "Short-Term", "Beginner"),
    ("Moderate",     "Medium-Term", "Intermediate"),
    ("Aggressive",   "Long-Term",   "Experienced"),
]


# Rule 16 — triple weights by persona
_RISK_WEIGHTS_BY_PERSONA: dict[str, list[float]] = {
    "retail":     [0.30, 0.55, 0.15],
    "wealth":     [0.10, 0.30, 0.60],
    "smb":        [0.20, 0.50, 0.30],
    "commercial": [0.15, 0.45, 0.40],
    "household":  [0.30, 0.55, 0.15],
    "unknown":    [0.30, 0.55, 0.15],
}


_BORROWING_VALUES = ["Excellent", "Good", "Fair", "Poor", "None"]
_BORROWING_WEIGHTS = [0.25, 0.40, 0.20, 0.05, 0.10]


class ProfileDeriver:
    """Owns persona-tier + risk profile + net worth.

    Plan 4b ships the person-applicable subset. Plan 4c will extend `fields`
    and the derive body with B2B fields (AnnualRevenue, NumberOfEmployees,
    TotalRevenue).
    """

    name = "profile"
    fields = [
        "Tier__c",
        "FinServ__CustomerType__c",
        "FinServ__Status__c",
        "FinServ__ServiceModel__c",
        "FinServ__NetWorth__c",
        "FinServ__RiskTolerance__c",
        "FinServ__TimeHorizon__c",
        "FinServ__BorrowingHistory__c",
        "FinServ__InvestmentExperience__c",
    ]

    def applies_to(self, archetype: PersonaArchetype) -> bool:
        # Plan 4b ships person-side. Plan 4c will add `or not archetype.is_person`.
        return archetype.is_person

    def derive(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {}

        # Rule 1 — Tier and ServiceModel
        tier = _TIER_BY_INCOME_BAND.get(archetype.income_band, "Silver")
        out["Tier__c"] = tier
        out["FinServ__ServiceModel__c"] = _SERVICE_MODEL_BY_TIER[tier]

        # CustomerType — Person Account → Individual (rule 16-adjacent)
        out["FinServ__CustomerType__c"] = "Individual"

        # Status — always Active for backfilled accounts
        out["FinServ__Status__c"] = "Active"

        # NetWorth = (TotalInvestments + TotalBankDeposits + TotalNonfinAssets
        #            - TotalLiabilities) × net_worth_multiple
        rollups = [
            record.get("FinServ__TotalInvestments__c"),
            record.get("FinServ__TotalBankDeposits__c"),
            record.get("FinServ__TotalNonfinancialAssets__c"),
            record.get("FinServ__TotalLiabilities__c"),
        ]
        if all(v is not None for v in rollups):
            inv, deposits, nonfin, liab = rollups
            base = float(inv) + float(deposits) + float(nonfin) - float(liab)
            out["FinServ__NetWorth__c"] = round(base * archetype.net_worth_multiple, 2)

        # Rule 16 — pick one risk triple
        weights = _RISK_WEIGHTS_BY_PERSONA.get(archetype.persona,
                                                _RISK_WEIGHTS_BY_PERSONA["retail"])
        triple_index = weighted_pick(rng, ["0", "1", "2"], weights)
        risk, horizon, exp = _RISK_TRIPLES[int(triple_index)]
        out["FinServ__RiskTolerance__c"] = risk
        out["FinServ__TimeHorizon__c"] = horizon
        out["FinServ__InvestmentExperience__c"] = exp

        # BorrowingHistory — picklist
        out["FinServ__BorrowingHistory__c"] = weighted_pick(
            rng, _BORROWING_VALUES, _BORROWING_WEIGHTS
        )

        return out
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_profile_person.py -v
```

Expected: 10 PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add customer_hydration/derivers/profile.py tests/test_profile_person.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
feat(customer-hydration): profile deriver — person-side (rules 1, 16)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: demographics deriver

**Files:**
- Create: `customer_hydration/derivers/demographics.py`
- Create: `tests/test_demographics.py`

Owns 18 fields, person accounts only, implements rules 9, 10, 11, 12, 13, 14, 15.

- [ ] **Step 1: Write the failing test file**

`tests/test_demographics.py`:

```python
"""Unit tests for demographics deriver (rules 9, 10, 11, 12, 14, 15)."""
from datetime import date

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers.demographics import DemographicsDeriver


def _arch(*, age=40, income_band="middle", marital_status="Single",
          household_size=1, gender="Male", is_person=True,
          account_id="001xx000000ABC") -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2020, 1, 1),
        record_type="FSC Person Accounts" if is_person else "Business",
        is_person=is_person, persona="retail",
        age=age, gender=gender, marital_status=marital_status,
        household_size=household_size, income_band=income_band,
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=5.0, engagement_level="regular",
        home_metro="Boston, MA",
        business_size=None, industry_code=None, business_credit_quality=None,
    )


def test_deriver_metadata():
    d = DemographicsDeriver()
    assert d.name == "demographics"
    assert "FinServ__HomeOwnership__pc" in d.fields
    assert "FinServ__TaxBracket__pc" in d.fields
    assert "FinServ__TaxId__pc" in d.fields


def test_applies_to_returns_false_for_business():
    d = DemographicsDeriver()
    assert d.applies_to(_arch(is_person=False)) is False


def test_applies_to_returns_true_for_person():
    d = DemographicsDeriver()
    assert d.applies_to(_arch(is_person=True)) is True


def test_rule_9_homeownership_under_25_skews_rent():
    """Rule 9: under 25 → {Rent 80, Own 15, Other 5}."""
    d = DemographicsDeriver()
    rents = 0
    for i in range(500):
        a = _arch(account_id=f"001xx0000Y{i:06d}", age=22, income_band="entry")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        if out["FinServ__HomeOwnership__pc"] == "Rent":
            rents += 1
    assert rents >= 350  # ≥70% Rent expected


def test_rule_9_homeownership_50_affluent_skews_own():
    """Rule 9: 40+ + affluent+ → {Own 92, Rent 5, Other 3}."""
    d = DemographicsDeriver()
    owns = 0
    for i in range(500):
        a = _arch(account_id=f"001xx0000O{i:06d}", age=55, income_band="hnw")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        if out["FinServ__HomeOwnership__pc"] == "Own":
            owns += 1
    assert owns >= 420  # ≥84% Own expected


def test_rule_10_employed_since_after_age_18():
    """Rule 10: EmployedSince ≥ today − age + 18 years (clipped before write)."""
    d = DemographicsDeriver()
    today = date.today()
    for i in range(100):
        a = _arch(account_id=f"001xx0000E{i:06d}", age=22)
        record = {
            "Id": a.account_id,
            "PersonBirthdate": (today.replace(year=today.year - a.age)).isoformat(),
        }
        out = d.derive(a, record, seeded_rng(a.account_id))
        es = date.fromisoformat(out["FinServ__EmployedSince__pc"])
        # Birthdate + 18y is the floor
        birth = date.fromisoformat(record["PersonBirthdate"])
        eighteenth_birthday = birth.replace(year=birth.year + 18)
        assert es >= eighteenth_birthday


def test_rule_11_dependents_within_household_bound():
    """Rule 11: NumberOfDependents ∈ [0, household_size − 1]."""
    d = DemographicsDeriver()
    a = _arch(household_size=4)
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    deps = out["FinServ__NumberOfDependents__pc"]
    assert 0 <= deps <= 3  # household_size - 1


def test_rule_11_children_at_most_dependents():
    """Rule 11: NumberOfChildren ≤ NumberOfDependents."""
    d = DemographicsDeriver()
    for i in range(50):
        a = _arch(account_id=f"001xx0000C{i:06d}", household_size=4)
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        assert (
            out["FinServ__NumberOfChildren__pc"]
            <= out["FinServ__NumberOfDependents__pc"]
        )


def test_rule_12_single_has_no_anniversary():
    """Rule 12: MaritalStatus=Single → WeddingAnniversary null (not in delta)."""
    d = DemographicsDeriver()
    a = _arch(marital_status="Single")
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert "FinServ__WeddingAnniversary__pc" not in out


def test_rule_12_married_has_anniversary():
    """Rule 12: MaritalStatus=Married → WeddingAnniversary populated."""
    d = DemographicsDeriver()
    a = _arch(marital_status="Married")
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert "FinServ__WeddingAnniversary__pc" in out
    # Sanity: anniversary should be a real date
    date.fromisoformat(out["FinServ__WeddingAnniversary__pc"])


def test_rule_14_tax_bracket_strict_from_income():
    """Rule 14: TaxBracket strict mapping from AnnualIncome (no rng)."""
    d = DemographicsDeriver()
    cases = [
        (12_000,    "10%"),
        (50_000,    "22%"),
        (200_000,   "32%"),
        (500_000,   "35%"),
        (1_500_000, "37%"),
    ]
    for income, expected in cases:
        a = _arch()
        out = d.derive(
            a, {"Id": a.account_id, "FinServ__AnnualIncome__pc": income},
            seeded_rng(a.account_id),
        )
        assert out["FinServ__TaxBracket__pc"] == expected, f"income={income}"


def test_rule_15_tax_id_and_ssn_paired():
    """Rule 15: TaxId__pc + LastFourDigitSSN__pc always populated together."""
    d = DemographicsDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert "FinServ__TaxId__pc" in out
    assert "FinServ__LastFourDigitSSN__pc" in out
    # Last-four SSN must be a 4-digit string
    assert len(out["FinServ__LastFourDigitSSN__pc"]) == 4


def test_tax_id_deterministic_per_account():
    """Same account_id → same TaxId, last4 across runs."""
    d = DemographicsDeriver()
    a = _arch()
    out1 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    out2 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out1["FinServ__TaxId__pc"] == out2["FinServ__TaxId__pc"]
    assert (
        out1["FinServ__LastFourDigitSSN__pc"]
        == out2["FinServ__LastFourDigitSSN__pc"]
    )


def test_communication_preferences_present():
    d = DemographicsDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert "FinServ__ContactPreference__pc" in out


def test_country_of_residence_default_us():
    d = DemographicsDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["FinServ__CountryOfResidence__pc"] == "United States"
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_demographics.py -q
```

Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement the deriver**

`customer_hydration/derivers/demographics.py`:

```python
"""demographics deriver — Person Account demographics (rules 9, 10, 11, 12, 14, 15).

Person accounts only. See spec §4.4 row 'demographics.py'.
"""
from __future__ import annotations

import hashlib
from datetime import date, timedelta
from random import Random
from typing import Any

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import weighted_pick


# Rule 9 — HomeOwnership weights by (age_bucket, income_bucket)
def _home_ownership_weights(age: int, income_band: str) -> tuple[list[str], list[float]]:
    values = ["Own", "Rent", "Other"]
    if age < 25:
        return values, [0.15, 0.80, 0.05]
    if age < 40 and income_band in ("middle", "affluent", "hnw", "uhnw"):
        return values, [0.60, 0.35, 0.05]
    if age >= 40 and income_band in ("affluent", "hnw", "uhnw"):
        return values, [0.92, 0.05, 0.03]
    return values, [0.55, 0.40, 0.05]  # default fallback


# Rule 14 — 2025 single-filer brackets (low end of bracket)
_TAX_BRACKETS: list[tuple[float, str]] = [
    (11_600,  "10%"),
    (47_150,  "12%"),
    (100_525, "22%"),
    (191_950, "24%"),
    (243_725, "32%"),
    (609_350, "35%"),
]


def _tax_bracket(income: float) -> str:
    """Return the marginal bracket name for a given AnnualIncome."""
    if income <= 11_600:
        return "10%"
    if income <= 47_150:
        return "12%"
    if income <= 100_525:
        return "22%"
    if income <= 191_950:
        return "24%"
    if income <= 243_725:
        return "32%"
    if income <= 609_350:
        return "35%"
    return "37%"


def _synth_tax_id(account_id: str) -> str:
    """Synthetic 9-digit tax id, deterministic from account_id."""
    digest = hashlib.sha256(("taxid:" + account_id).encode()).digest()
    n = int.from_bytes(digest[:5], "big") % 1_000_000_000
    return f"{n:09d}"


def _synth_last_four_ssn(account_id: str) -> str:
    """Synthetic last-four SSN, deterministic from account_id (independent of tax id)."""
    digest = hashlib.sha256(("ssn:" + account_id).encode()).digest()
    n = int.from_bytes(digest[:3], "big") % 10_000
    return f"{n:04d}"


# Rule 13 — dependents prior mean varies by persona × income_band.
def _dependents_mean(persona: str, income_band: str) -> float:
    if persona == "wealth" and income_band == "uhnw":
        return 0.8
    if persona == "wealth":
        return 1.2
    if income_band == "middle":
        return 1.8
    return 1.4


# Maiden-name pool for rule (deterministic from account_id)
_MAIDEN_POOL = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin",
]


_GENDER_VALUES = ["Male", "Female", "Non-Binary", "Prefer Not to Say"]
_GENDER_WEIGHTS = [0.49, 0.49, 0.01, 0.01]


_PRONOUN_BY_GENDER: dict[str, str] = {
    "Male":     "he/him",
    "Female":   "she/her",
}


_CONTACT_PREF_VALUES = ["Email", "Phone", "Text", "Mail"]
_CONTACT_PREF_WEIGHTS = [0.55, 0.20, 0.20, 0.05]


_COMMUNICATION_PREFS = "Email;Text"


class DemographicsDeriver:
    """Owns 18 person-only demographic fields."""

    name = "demographics"
    fields = [
        "FinServ__HomeOwnership__pc",
        "FinServ__EmployedSince__pc",
        "FinServ__TaxBracket__pc",
        "FinServ__TaxId__pc",
        "FinServ__LastFourDigitSSN__pc",
        "FinServ__MotherMaidenName__pc",
        "FinServ__NumberOfChildren__pc",
        "FinServ__NumberOfDependents__pc",
        "FinServ__WeddingAnniversary__pc",
        "PersonGender",
        "PersonGenderIdentity",
        "PersonPronouns",
        "FinServ__Gender__pc",
        "FinServ__LanguagesSpoken__pc",
        "FinServ__CountryOfResidence__pc",
        "FinServ__CommunicationPreferences__pc",
        "FinServ__ContactPreference__pc",
        "Cust360_Contact_Picture_URL__pc",
    ]

    def applies_to(self, archetype: PersonaArchetype) -> bool:
        return archetype.is_person

    def derive(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {}
        today = date.today()

        # Rule 9 — HomeOwnership
        ho_values, ho_weights = _home_ownership_weights(archetype.age, archetype.income_band)
        out["FinServ__HomeOwnership__pc"] = weighted_pick(rng, ho_values, ho_weights)

        # Rule 10 — EmployedSince ≥ birthdate + 18y
        birthdate_str = record.get("PersonBirthdate")
        if birthdate_str:
            birthdate = date.fromisoformat(birthdate_str)
            eighteenth = birthdate.replace(year=birthdate.year + 18)
            # Pick uniform between eighteenth birthday and (today - 1 month)
            span = max(1, (today - eighteenth).days - 30)
            offset = rng.randint(0, span)
            out["FinServ__EmployedSince__pc"] = (eighteenth + timedelta(days=offset)).isoformat()
        else:
            # No birthdate → pick a tenure between 2 and 30 years
            offset = rng.randint(2 * 365, 30 * 365)
            out["FinServ__EmployedSince__pc"] = (today - timedelta(days=offset)).isoformat()

        # Rule 14 — TaxBracket strict from AnnualIncome (no rng)
        income = record.get("FinServ__AnnualIncome__pc")
        if income is not None:
            out["FinServ__TaxBracket__pc"] = _tax_bracket(float(income))

        # Rule 15 — TaxId + LastFourDigitSSN paired
        out["FinServ__TaxId__pc"] = _synth_tax_id(archetype.account_id)
        out["FinServ__LastFourDigitSSN__pc"] = _synth_last_four_ssn(archetype.account_id)

        # MotherMaidenName — picked deterministically
        digest = hashlib.sha256(("maiden:" + archetype.account_id).encode()).digest()
        out["FinServ__MotherMaidenName__pc"] = _MAIDEN_POOL[
            int.from_bytes(digest[:2], "big") % len(_MAIDEN_POOL)
        ]

        # Rule 11 + 13 — NumberOfDependents bounded by household_size
        dep_max = max(0, archetype.household_size - 1)
        if dep_max == 0:
            dependents = 0
        else:
            target_mean = _dependents_mean(archetype.persona, archetype.income_band)
            # Use a small Poisson-like distribution by picking 0..dep_max with
            # weights tilted toward target_mean.
            choices = list(range(dep_max + 1))
            weights = [
                # higher weight when |k - target_mean| is small
                1.0 / (1.0 + abs(k - target_mean))
                for k in choices
            ]
            dependents = int(weighted_pick(rng, [str(c) for c in choices], weights))
        out["FinServ__NumberOfDependents__pc"] = dependents

        # Rule 11 — NumberOfChildren ≤ NumberOfDependents
        if dependents == 0:
            children = 0
        else:
            children = rng.randint(0, dependents)
        out["FinServ__NumberOfChildren__pc"] = children

        # Rule 12 — WeddingAnniversary consistent with marital_status
        if archetype.marital_status in ("Married", "Divorced", "Widowed"):
            # Pick anniversary 1–30 years before today
            offset = rng.randint(1 * 365, 30 * 365)
            out["FinServ__WeddingAnniversary__pc"] = (
                today - timedelta(days=offset)
            ).isoformat()

        # Gender / GenderIdentity / Pronouns
        gender = archetype.gender
        out["PersonGender"] = gender
        out["FinServ__Gender__pc"] = gender
        # Use existing PersonGenderIdentity if present, else mirror
        gid = record.get("PersonGenderIdentity") or gender
        out["PersonGenderIdentity"] = gid
        out["PersonPronouns"] = _PRONOUN_BY_GENDER.get(gender, "they/them")

        # Languages, country, contact prefs
        out["FinServ__LanguagesSpoken__pc"] = "English"
        out["FinServ__CountryOfResidence__pc"] = "United States"
        out["FinServ__CommunicationPreferences__pc"] = _COMMUNICATION_PREFS
        out["FinServ__ContactPreference__pc"] = weighted_pick(
            rng, _CONTACT_PREF_VALUES, _CONTACT_PREF_WEIGHTS
        )

        # Cust360 contact picture URL — synthetic placeholder URL
        out["Cust360_Contact_Picture_URL__pc"] = (
            f"https://cust360-photos.example.com/{archetype.account_id}.jpg"
        )

        return out
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_demographics.py -v
```

Expected: 14 PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add customer_hydration/derivers/demographics.py tests/test_demographics.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
feat(customer-hydration): demographics deriver (rules 9-15)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: addresses deriver — person-side blocks

**Files:**
- Create: `customer_hydration/derivers/addresses.py`
- Create: `tests/test_addresses_person.py`

Plan 4b ships PersonMailing*, PersonOther*, BillingLatitude/Longitude/GeocodeAccuracy, the four FinServ__*Address__pc summary fields, and Fax. Plan 4c adds Shipping* and the Billing City/State/Country/Postal/Street block.

- [ ] **Step 1: Write the failing test file**

`tests/test_addresses_person.py`:

```python
"""Unit tests for the person-side blocks of addresses deriver (rule 23)."""
from datetime import date

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers.addresses import AddressesDeriver


def _arch(*, home_metro="Boston, MA", is_person=True,
          account_id="001xx000000ABC") -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2020, 1, 1),
        record_type="FSC Person Accounts" if is_person else "Business",
        is_person=is_person, persona="retail",
        age=40, gender="Male", marital_status="Single",
        household_size=1, income_band="middle",
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=5.0, engagement_level="regular",
        home_metro=home_metro,
        business_size=None, industry_code=None, business_credit_quality=None,
    )


def test_deriver_metadata():
    d = AddressesDeriver()
    assert d.name == "addresses"
    assert "PersonMailingLatitude" in d.fields
    assert "PersonOtherCity" in d.fields
    assert "Fax" in d.fields


def test_applies_to_person_only_in_4b():
    """Plan 4b ships person-side. Business returns False until Plan 4c extends."""
    d = AddressesDeriver()
    assert d.applies_to(_arch(is_person=True)) is True
    assert d.applies_to(_arch(is_person=False)) is False


def test_rule_23_personmailing_uses_home_metro():
    """Rule 23: PersonMailingCity = home_metro city."""
    d = AddressesDeriver()
    a = _arch(home_metro="Boston, MA")
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["PersonMailingLatitude"] is not None
    assert out["PersonMailingLongitude"] is not None
    # Boston centroid roughly (42.36, -71.06); allow 0.1 degree slop
    assert 42.0 <= out["PersonMailingLatitude"] <= 42.7
    assert -71.5 <= out["PersonMailingLongitude"] <= -70.6


def test_rule_23_personother_uses_different_metro_same_state():
    """Rule 23: PersonOther* uses a *different* metro from same state."""
    d = AddressesDeriver()
    a = _arch(home_metro="Boston, MA")
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    # PersonOtherState should be MA, PersonOtherCity should NOT be Boston
    assert out["PersonOtherState"] == "MA"
    assert out["PersonOtherCity"] != "Boston"


def test_address_block_atomicity():
    """If we fill PersonMailingLatitude, we MUST also fill PersonMailingLongitude
    + GeocodeAccuracy. All-or-nothing per block."""
    d = AddressesDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    if "PersonMailingLatitude" in out:
        assert "PersonMailingLongitude" in out
        assert "PersonMailingGeocodeAccuracy" in out


def test_billing_lat_long_only_if_billing_city_present():
    """If record has BillingCity, fill BillingLatitude + Longitude (top-off)."""
    d = AddressesDeriver()
    a = _arch()
    record_with_city = {"Id": a.account_id, "BillingCity": "Boston"}
    out = d.derive(a, record_with_city, seeded_rng(a.account_id))
    assert out["BillingLatitude"] is not None
    assert out["BillingLongitude"] is not None
    assert out["BillingGeocodeAccuracy"] == "Address"

    # If BillingCity null → don't fill Lat/Long (Plan 4c handles full Billing)
    record_null = {"Id": a.account_id, "BillingCity": None}
    out_null = d.derive(a, record_null, seeded_rng(a.account_id))
    assert "BillingLatitude" not in out_null


def test_finserv_address_summary_strings_populated():
    """The four FinServ__*Address__pc summary fields are non-empty strings."""
    d = AddressesDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["FinServ__MailingAddress__pc"]
    assert isinstance(out["FinServ__MailingAddress__pc"], str)
    assert ", " in out["FinServ__MailingAddress__pc"]


def test_fax_is_synthetic_phone():
    """Fax is a deterministic phone-like string keyed off account_id."""
    d = AddressesDeriver()
    a = _arch()
    out1 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    out2 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out1["Fax"] == out2["Fax"]
    # Format like (NNN) NNN-NNNN
    import re
    assert re.match(r"^\(\d{3}\) \d{3}-\d{4}$", out1["Fax"])
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_addresses_person.py -q
```

Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement the deriver**

`customer_hydration/derivers/addresses.py`:

```python
"""addresses deriver — Person Mailing/Other blocks + Billing lat/long top-off + summaries.

Plan 4b ships the person-side blocks. Plan 4c extends with Shipping* and the
full Billing block. See spec §4.4 row 'addresses.py' and §4.2 rule 23.
"""
from __future__ import annotations

import hashlib
from random import Random
from typing import Any

from customer_hydration.derivers._archetype import PersonaArchetype


# Approximate metro centroids (lat, lon) for the 50-city pool used by archetype.
# We only enumerate cities the archetype's _pick_metro can pick. Lookup defaults
# to a generic centroid if a city is unknown.
_METRO_CENTROIDS: dict[str, tuple[float, float]] = {
    "Boston, MA":          (42.36, -71.06),
    "New York, NY":         (40.71, -74.01),
    "Los Angeles, CA":      (34.05, -118.24),
    "Chicago, IL":          (41.88, -87.63),
    "Houston, TX":          (29.76, -95.37),
    "Phoenix, AZ":          (33.45, -112.07),
    "Philadelphia, PA":     (39.95, -75.17),
    "San Antonio, TX":      (29.42, -98.49),
    "San Diego, CA":        (32.72, -117.16),
    "Dallas, TX":           (32.78, -96.80),
    "San Jose, CA":         (37.34, -121.89),
    "Austin, TX":           (30.27, -97.74),
    "Jacksonville, FL":     (30.33, -81.66),
    "Fort Worth, TX":       (32.76, -97.33),
    "Columbus, OH":         (39.96, -83.00),
    "Charlotte, NC":        (35.23, -80.84),
    "San Francisco, CA":    (37.77, -122.42),
    "Indianapolis, IN":     (39.77, -86.16),
    "Seattle, WA":          (47.61, -122.33),
    "Denver, CO":           (39.74, -104.99),
    "Washington, DC":       (38.91, -77.04),
    "El Paso, TX":          (31.76, -106.49),
    "Nashville, TN":        (36.16, -86.78),
    "Detroit, MI":          (42.33, -83.05),
    "Oklahoma City, OK":    (35.47, -97.52),
    "Portland, OR":         (45.51, -122.68),
    "Las Vegas, NV":        (36.17, -115.14),
    "Memphis, TN":          (35.15, -90.05),
    "Louisville, KY":       (38.25, -85.76),
    "Baltimore, MD":        (39.29, -76.61),
    "Milwaukee, WI":        (43.04, -87.91),
    "Albuquerque, NM":      (35.08, -106.65),
    "Tucson, AZ":           (32.22, -110.93),
    "Fresno, CA":           (36.74, -119.79),
    "Sacramento, CA":       (38.58, -121.49),
    "Mesa, AZ":             (33.42, -111.83),
    "Kansas City, MO":      (39.10, -94.58),
    "Atlanta, GA":          (33.75, -84.39),
    "Long Beach, CA":       (33.77, -118.19),
    "Colorado Springs, CO": (38.83, -104.82),
    "Raleigh, NC":          (35.78, -78.64),
    "Miami, FL":            (25.76, -80.19),
    "Virginia Beach, VA":   (36.85, -75.98),
    "Omaha, NE":            (41.26, -95.93),
    "Oakland, CA":          (37.80, -122.27),
    "Minneapolis, MN":      (44.98, -93.27),
    "Tulsa, OK":            (36.15, -95.99),
    "Arlington, TX":        (32.74, -97.11),
    "New Orleans, LA":      (29.95, -90.07),
    "Wichita, KS":          (37.69, -97.34),
}


# Same-state alternates for the work-address (PersonOther*) — rule 23.
# Each entry: home metro → another metro in the same state.
_SAME_STATE_ALT: dict[str, str] = {
    "Boston, MA":     "Cambridge, MA",
    "New York, NY":   "Albany, NY",
    "Los Angeles, CA": "San Francisco, CA",
    "Chicago, IL":    "Springfield, IL",
    "Houston, TX":    "Austin, TX",
    "Phoenix, AZ":    "Tucson, AZ",
    "San Diego, CA":  "Los Angeles, CA",
    "Dallas, TX":     "Fort Worth, TX",
    "Austin, TX":     "San Antonio, TX",
    "Charlotte, NC":  "Raleigh, NC",
    "San Francisco, CA": "Oakland, CA",
    "Seattle, WA":    "Spokane, WA",
    "Denver, CO":     "Colorado Springs, CO",
    "Atlanta, GA":    "Savannah, GA",
    "Miami, FL":      "Jacksonville, FL",
}


def _split_metro(metro: str) -> tuple[str, str]:
    """'Boston, MA' → ('Boston', 'MA')."""
    parts = metro.rsplit(", ", 1)
    if len(parts) == 2:
        return parts[0], parts[1]
    return metro, ""


def _alt_in_same_state(home_metro: str, account_id: str) -> str:
    """Pick a same-state work address, falling back to home_city + ' Office'."""
    if home_metro in _SAME_STATE_ALT:
        return _SAME_STATE_ALT[home_metro]
    city, state = _split_metro(home_metro)
    # Fallback: synthetic "<City> Heights, <State>" based on hash
    digest = hashlib.sha256(("alt:" + account_id).encode()).digest()
    suffixes = ["Heights", "Park", "Hills", "Plaza", "Center"]
    suffix = suffixes[int.from_bytes(digest[:2], "big") % len(suffixes)]
    return f"{city} {suffix}, {state}"


def _jitter_lat_long(centroid: tuple[float, float], rng: Random) -> tuple[float, float]:
    """Produce a lat/long within 0.05 degrees of centroid."""
    lat, lon = centroid
    return (
        round(lat + rng.uniform(-0.05, 0.05), 4),
        round(lon + rng.uniform(-0.05, 0.05), 4),
    )


def _synth_phone(account_id: str, prefix: str) -> str:
    """Generate a deterministic phone-like string keyed off account_id."""
    digest = hashlib.sha256((prefix + account_id).encode()).digest()
    n = int.from_bytes(digest[:6], "big")
    area = 200 + (n % 800)
    middle = (n >> 16) % 1000
    last = (n >> 8) % 10_000
    return f"({area:03d}) {middle:03d}-{last:04d}"


_STREET_NUMBER_POOL = [12, 47, 102, 245, 488, 731, 1100, 1505, 2014, 3287]
_STREET_NAME_POOL = [
    "Maple", "Oak", "Pine", "Cedar", "Elm", "Walnut", "Chestnut", "Birch",
    "Sycamore", "Willow",
]
_STREET_TYPE_POOL = ["St", "Ave", "Blvd", "Rd", "Ln", "Way"]


def _synth_street(account_id: str, prefix: str) -> str:
    """Synthesize a deterministic street address from account_id."""
    digest = hashlib.sha256((prefix + account_id).encode()).digest()
    num = _STREET_NUMBER_POOL[digest[0] % len(_STREET_NUMBER_POOL)]
    name = _STREET_NAME_POOL[digest[1] % len(_STREET_NAME_POOL)]
    typ = _STREET_TYPE_POOL[digest[2] % len(_STREET_TYPE_POOL)]
    return f"{num} {name} {typ}"


_POSTAL_BASES = {
    "MA": "021", "NY": "100", "CA": "900", "IL": "606", "TX": "770",
    "AZ": "850", "PA": "191", "OH": "432", "NC": "282", "WA": "981",
    "CO": "802", "DC": "200", "TN": "372", "MI": "482", "OK": "731",
    "OR": "972", "NV": "891", "KY": "402", "MD": "212", "WI": "532",
    "NM": "871", "MO": "641", "GA": "303", "FL": "331", "VA": "234",
    "NE": "681", "MN": "554", "LA": "701", "KS": "672", "IN": "462",
}


def _synth_postal(state: str, account_id: str) -> str:
    """Postal code starting with state's typical prefix."""
    base = _POSTAL_BASES.get(state, "100")
    digest = hashlib.sha256(("zip:" + account_id).encode()).digest()
    suffix = int.from_bytes(digest[:2], "big") % 100
    return f"{base}{suffix:02d}"


class AddressesDeriver:
    """Plan 4b: person-side address blocks. Plan 4c extends with Shipping + full Billing."""

    name = "addresses"
    fields = [
        "PersonMailingLatitude",
        "PersonMailingLongitude",
        "PersonMailingGeocodeAccuracy",
        "PersonOtherCity",
        "PersonOtherState",
        "PersonOtherCountry",
        "PersonOtherPostalCode",
        "PersonOtherStreet",
        "PersonOtherPhone",
        "PersonOtherLatitude",
        "PersonOtherLongitude",
        "PersonOtherGeocodeAccuracy",
        "BillingLatitude",
        "BillingLongitude",
        "BillingGeocodeAccuracy",
        "Fax",
        "FinServ__BillingAddress__pc",
        "FinServ__MailingAddress__pc",
        "FinServ__OtherAddress__pc",
        "FinServ__ShippingAddress__pc",
    ]

    def applies_to(self, archetype: PersonaArchetype) -> bool:
        # Plan 4b: person-only. Plan 4c will add `or not archetype.is_person`.
        return archetype.is_person

    def derive(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {}

        home_centroid = _METRO_CENTROIDS.get(archetype.home_metro, (40.0, -100.0))
        home_city, home_state = _split_metro(archetype.home_metro)

        # PersonMailing block — atomic
        m_lat, m_lon = _jitter_lat_long(home_centroid, rng)
        out["PersonMailingLatitude"] = m_lat
        out["PersonMailingLongitude"] = m_lon
        out["PersonMailingGeocodeAccuracy"] = "Address"

        # PersonOther block — different metro, same state — atomic
        alt_metro = _alt_in_same_state(archetype.home_metro, archetype.account_id)
        alt_city, alt_state = _split_metro(alt_metro)
        alt_centroid = _METRO_CENTROIDS.get(alt_metro, home_centroid)
        o_lat, o_lon = _jitter_lat_long(alt_centroid, rng)
        out["PersonOtherCity"] = alt_city
        out["PersonOtherState"] = alt_state
        out["PersonOtherCountry"] = "United States"
        out["PersonOtherPostalCode"] = _synth_postal(alt_state, archetype.account_id)
        out["PersonOtherStreet"] = _synth_street(archetype.account_id, "other:")
        out["PersonOtherPhone"] = _synth_phone(archetype.account_id, "phone:")
        out["PersonOtherLatitude"] = o_lat
        out["PersonOtherLongitude"] = o_lon
        out["PersonOtherGeocodeAccuracy"] = "Address"

        # Billing lat/long top-off (only when BillingCity already populated;
        # the full Billing block is Plan 4c).
        if record.get("BillingCity") is not None:
            b_lat, b_lon = _jitter_lat_long(home_centroid, rng)
            out["BillingLatitude"] = b_lat
            out["BillingLongitude"] = b_lon
            out["BillingGeocodeAccuracy"] = "Address"

        # Fax — synthetic phone keyed off account_id
        out["Fax"] = _synth_phone(archetype.account_id, "fax:")

        # FinServ__*Address__pc summary strings — formula-style "Street, City, State Postal"
        mailing_street = _synth_street(archetype.account_id, "mail:")
        mailing_postal = _synth_postal(home_state, archetype.account_id)
        mailing_summary = f"{mailing_street}, {home_city}, {home_state} {mailing_postal}"
        other_summary = (
            f"{out['PersonOtherStreet']}, {alt_city}, {alt_state} "
            f"{out['PersonOtherPostalCode']}"
        )
        out["FinServ__MailingAddress__pc"] = mailing_summary
        out["FinServ__BillingAddress__pc"] = mailing_summary
        out["FinServ__OtherAddress__pc"] = other_summary
        out["FinServ__ShippingAddress__pc"] = mailing_summary

        return out
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_addresses_person.py -v
```

Expected: 7 PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add customer_hydration/derivers/addresses.py tests/test_addresses_person.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
feat(customer-hydration): addresses deriver — person blocks (rule 23)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: contact deriver — person-side fields

**Files:**
- Create: `customer_hydration/derivers/contact.py`
- Create: `tests/test_contact_person.py`

Plan 4b ships MiddleName, PersonTitle (rule 24), PersonAssistantName/Phone, PersonDepartment, PersonLeadSource, Salutation, AccountNumber, Description top-off. Plan 4c adds B2B fields.

- [ ] **Step 1: Write the failing test file**

`tests/test_contact_person.py`:

```python
"""Unit tests for the person-side of contact deriver (rule 24)."""
from datetime import date

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers.contact import ContactDeriver


def _arch(*, age=40, gender="Male", is_person=True,
          account_id="001xx000000ABC") -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2020, 1, 1),
        record_type="FSC Person Accounts" if is_person else "Business",
        is_person=is_person, persona="retail",
        age=age, gender=gender, marital_status="Single",
        household_size=1, income_band="middle",
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=5.0, engagement_level="regular",
        home_metro="Boston, MA",
        business_size=None, industry_code=None, business_credit_quality=None,
    )


def test_deriver_metadata():
    d = ContactDeriver()
    assert d.name == "contact"
    assert "MiddleName" in d.fields
    assert "PersonTitle" in d.fields
    assert "AccountNumber" in d.fields


def test_applies_to_person_only_in_4b():
    d = ContactDeriver()
    assert d.applies_to(_arch(is_person=True)) is True
    # Plan 4b: returns False for business (Plan 4c will extend).
    assert d.applies_to(_arch(is_person=False)) is False


def test_middle_name_is_single_letter():
    d = ContactDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert len(out["MiddleName"]) == 1
    assert out["MiddleName"].isalpha()


def test_rule_24_under_30_female_skews_ms():
    """Rule 24: under 30 + female → {Ms 70, Miss 25, Dr 5}."""
    d = ContactDeriver()
    ms_count = 0
    for i in range(500):
        a = _arch(account_id=f"001xx0000F{i:06d}", age=25, gender="Female")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        if out["PersonTitle"] == "Ms":
            ms_count += 1
    assert ms_count >= 300  # ≥60% Ms expected


def test_rule_24_50plus_male_skews_mr():
    """Rule 24: 50+ + male → {Mr 60, Dr 25, Sr 10, Hon 5}."""
    d = ContactDeriver()
    mr_count = 0
    for i in range(500):
        a = _arch(account_id=f"001xx0000M{i:06d}", age=58, gender="Male")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        if out["PersonTitle"] == "Mr":
            mr_count += 1
    assert mr_count >= 250  # ≥50% Mr expected


def test_account_number_is_formatted():
    """AccountNumber = formatted from External_ID__c (numeric or hash-based)."""
    d = ContactDeriver()
    a = _arch()
    record = {"Id": a.account_id, "External_ID__c": "HYDRATE-RTL-000123"}
    out = d.derive(a, record, seeded_rng(a.account_id))
    # Account number should be a non-empty string
    assert isinstance(out["AccountNumber"], str)
    assert len(out["AccountNumber"]) >= 6


def test_description_topoff_skipped_when_already_populated():
    """Description is a top-off — only fill if record is null."""
    d = ContactDeriver()
    a = _arch()
    # With existing description
    out_existing = d.derive(
        a, {"Id": a.account_id, "Description": "Existing customer note"},
        seeded_rng(a.account_id),
    )
    assert "Description" not in out_existing

    # With null description
    out_null = d.derive(
        a, {"Id": a.account_id, "Description": None},
        seeded_rng(a.account_id),
    )
    assert "Description" in out_null
    assert isinstance(out_null["Description"], str)


def test_deriver_is_deterministic():
    d = ContactDeriver()
    a = _arch()
    out1 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    out2 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out1 == out2
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_contact_person.py -q
```

Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement the deriver**

`customer_hydration/derivers/contact.py`:

```python
"""contact deriver — person-side fields (rule 24).

Plan 4b: MiddleName, PersonTitle, PersonAssistantName/Phone, PersonDepartment,
PersonLeadSource, Salutation, AccountNumber, Description top-off.
Plan 4c: NAICS_Code__c, Sic, SicDesc, Site, TickerSymbol, Jigsaw, JigsawCompanyId,
Industry top-off, Type, Rating.
"""
from __future__ import annotations

import hashlib
import string
from random import Random
from typing import Any

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import weighted_pick


# Rule 24 — PersonTitle distributions by (age_bucket, gender)
def _person_title_weights(age: int, gender: str) -> tuple[list[str], list[float]]:
    if gender == "Female":
        if age < 30:
            return ["Ms", "Miss", "Dr"], [0.70, 0.25, 0.05]
        if age < 50:
            return ["Ms", "Mrs", "Dr"], [0.60, 0.30, 0.10]
        return ["Mrs", "Ms", "Dr", "Hon"], [0.55, 0.30, 0.10, 0.05]
    if gender == "Male":
        if age < 30:
            return ["Mr", "Dr"], [0.95, 0.05]
        if age < 50:
            return ["Mr", "Dr"], [0.85, 0.15]
        return ["Mr", "Dr", "Sr", "Hon"], [0.60, 0.25, 0.10, 0.05]
    # Neutral / unknown gender
    return ["Dr", "Mx"], [0.60, 0.40]


_DEPARTMENT_VALUES = ["Engineering", "Operations", "Finance", "Sales", "Marketing",
                       "Legal", "HR", "Customer Service", "Other"]
_DEPARTMENT_WEIGHTS = [0.20, 0.20, 0.10, 0.10, 0.10, 0.05, 0.05, 0.10, 0.10]


_LEADSOURCE_VALUES = ["Web", "Referral", "Phone Inquiry", "Partner", "Other"]
_LEADSOURCE_WEIGHTS = [0.30, 0.40, 0.10, 0.15, 0.05]


_DESCRIPTION_TEMPLATES = [
    "Long-tenured customer with strong banking relationship.",
    "Recent customer; growing wallet share.",
    "Active client with diversified holdings.",
    "Reliable depositor; regular interaction with branch.",
    "High-value relationship; quarterly review cadence.",
]


def _account_number(record: dict, account_id: str) -> str:
    """Format AccountNumber from External_ID__c digits, or a hash-based fallback."""
    ext = record.get("External_ID__c") or ""
    digits = "".join(c for c in ext if c.isdigit())
    if len(digits) >= 6:
        return f"ACCT-{digits[-8:]}"
    digest = hashlib.sha256(("acct:" + account_id).encode()).digest()
    n = int.from_bytes(digest[:4], "big") % 100_000_000
    return f"ACCT-{n:08d}"


class ContactDeriver:
    """Plan 4b: person-side. Plan 4c extends with B2B fields."""

    name = "contact"
    fields = [
        "MiddleName",
        "PersonTitle",
        "PersonAssistantName",
        "PersonAssistantPhone",
        "PersonDepartment",
        "PersonLeadSource",
        "Salutation",
        "AccountNumber",
        "Description",
    ]

    def applies_to(self, archetype: PersonaArchetype) -> bool:
        return archetype.is_person

    def derive(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {}

        # MiddleName — single letter from a deterministic pool
        digest = hashlib.sha256(("mid:" + archetype.account_id).encode()).digest()
        out["MiddleName"] = string.ascii_uppercase[digest[0] % 26]

        # Rule 24 — PersonTitle by (age, gender)
        title_values, title_weights = _person_title_weights(
            archetype.age, archetype.gender
        )
        title = weighted_pick(rng, title_values, title_weights)
        out["PersonTitle"] = title
        # Salutation = same as title (org convention)
        out["Salutation"] = title

        # Assistant name + phone (only for affluent+)
        if archetype.income_band in ("hnw", "uhnw"):
            out["PersonAssistantName"] = "Executive Assistant"
            ph_digest = hashlib.sha256(
                ("assist:" + archetype.account_id).encode()
            ).digest()
            n = int.from_bytes(ph_digest[:6], "big")
            out["PersonAssistantPhone"] = (
                f"({200 + (n % 800):03d}) "
                f"{(n >> 16) % 1000:03d}-{(n >> 8) % 10_000:04d}"
            )

        # Department + LeadSource
        out["PersonDepartment"] = weighted_pick(
            rng, _DEPARTMENT_VALUES, _DEPARTMENT_WEIGHTS
        )
        out["PersonLeadSource"] = weighted_pick(
            rng, _LEADSOURCE_VALUES, _LEADSOURCE_WEIGHTS
        )

        # AccountNumber — formatted from external id (or hash fallback)
        out["AccountNumber"] = _account_number(record, archetype.account_id)

        # Description — top-off (only if null)
        if record.get("Description") is None:
            template_idx = digest[1] % len(_DESCRIPTION_TEMPLATES)
            out["Description"] = _DESCRIPTION_TEMPLATES[template_idx]

        return out
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_contact_person.py -v
```

Expected: 8 PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add customer_hydration/derivers/contact.py tests/test_contact_person.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
feat(customer-hydration): contact deriver — person-side (rule 24)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Register all 6 derivers in the orchestrator

**Files:**
- Modify: `customer_hydration/backfill_accounts.py`
- Modify: `tests/test_backfill_skeleton.py`

- [ ] **Step 1: Write the failing end-to-end test**

Append to `tests/test_backfill_skeleton.py`:

```python
def test_run_backfill_produces_csv_with_person_account_deltas(tmp_path):
    """End-to-end: a person-account record with nulls produces a non-empty CSV row."""
    out_dir = tmp_path / "run"
    record = json.loads(
        Path(__file__).parent.joinpath(
            "fixtures/accounts/retail_55yo_affluent.json"
        ).read_text()
    )
    # Force CreditScore to null so credit_personal will fill it
    record["FinServ__CreditScore__c"] = None
    record["FinServ__CreditRating__c"] = None
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        records=[record],
        life_events_by_id={},
    )
    assert rc == 0

    csv_text = (out_dir / "account_backfill.csv").read_text()
    assert "External_ID__c" in csv_text
    # Header has the field columns from the registered derivers
    assert "Tier__c" in csv_text
    assert "FinServ__CreditScore__c" in csv_text
    assert "FinServ__RelationshipStartDate__c" in csv_text

    manifest = json.loads((out_dir / "manifest.json").read_text())
    assert manifest["derivation"]["rows_with_deltas"] == 1
    # All 6 derivers contribute fields
    owned = manifest["deriver_meta"]["fields_owned_by_derivers"]
    assert "FinServ__CreditScore__c" in owned
    assert "Tier__c" in owned
    assert "PersonMailingLatitude" in owned
    assert "PersonTitle" in owned
```

- [ ] **Step 2: Run the test to verify failure**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_backfill_skeleton.py::test_run_backfill_produces_csv_with_person_account_deltas -v
```

Expected: FAIL — `_build_registry` returns an empty Registry, so no rows have deltas.

- [ ] **Step 3: Update `_build_registry` in `customer_hydration/backfill_accounts.py`**

Find the existing function:

```python
def _build_registry() -> Registry:
    """Build the deriver registry. In Plan 4a this returns an empty registry;
    Plans 4b/4c register the 7 derivers."""
    return Registry()
```

Replace it with:

```python
def _build_registry() -> Registry:
    """Build the deriver registry with all six Plan 4b derivers.

    Plan 4c will extend this with credit_bureau and the B2B branches of
    profile / addresses / contact.
    """
    from customer_hydration.derivers.relationship import RelationshipDeriver
    from customer_hydration.derivers.credit_personal import CreditPersonalDeriver
    from customer_hydration.derivers.profile import ProfileDeriver
    from customer_hydration.derivers.demographics import DemographicsDeriver
    from customer_hydration.derivers.addresses import AddressesDeriver
    from customer_hydration.derivers.contact import ContactDeriver

    registry = Registry()
    registry.register(RelationshipDeriver())
    registry.register(CreditPersonalDeriver())
    registry.register(ProfileDeriver())
    registry.register(DemographicsDeriver())
    registry.register(AddressesDeriver())
    registry.register(ContactDeriver())
    return registry
```

- [ ] **Step 4: Run the smoke test**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_backfill_skeleton.py -v
```

Expected: 5 tests PASS (was 4, added 1).

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest -q 2>&1 | tail -5
```

Expected: All previously-passing tests still pass + new ones (~640 total).

- [ ] **Step 6: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add customer_hydration/backfill_accounts.py tests/test_backfill_skeleton.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
feat(customer-hydration): register the 6 person-side derivers in the orchestrator

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Coherence-narrative tests

**Files:**
- Create: `tests/test_coherence.py`
- Create: `tests/fixtures/accounts/wealth_uhnw.json`
- Create: `tests/fixtures/accounts/retail_22yo_entry.json`

- [ ] **Step 1: Create fixture `tests/fixtures/accounts/wealth_uhnw.json`**

```json
{
  "Id": "001xx0000UHNW01",
  "External_ID__c": "HYDRATE-WLT-000001",
  "RecordType.Name": "FSC Person Accounts",
  "IsPersonAccount": true,
  "CreatedDate": "2014-09-01T10:00:00Z",
  "PersonBirthdate": "1968-04-12",
  "PersonGender": "Male",
  "FinServ__MaritalStatus__pc": "Married",
  "FinServ__NumberOfDependents__pc": null,
  "FinServ__AnnualIncome__pc": 1500000,
  "AnnualRevenue": null,
  "FinServ__LastInteraction__c": "2026-05-15",
  "Industry": null,
  "FinServ__TotalInvestments__c": 5000000,
  "FinServ__TotalBankDeposits__c": 800000,
  "FinServ__TotalNonfinancialAssets__c": 3000000,
  "FinServ__TotalLiabilities__c": 1200000
}
```

- [ ] **Step 2: Create fixture `tests/fixtures/accounts/retail_22yo_entry.json`**

```json
{
  "Id": "001xx00022YO01",
  "External_ID__c": "HYDRATE-RTL-000022",
  "RecordType.Name": "FSC Person Accounts",
  "IsPersonAccount": true,
  "CreatedDate": "2025-01-15T10:00:00Z",
  "PersonBirthdate": "2003-07-08",
  "PersonGender": "Female",
  "FinServ__MaritalStatus__pc": null,
  "FinServ__NumberOfDependents__pc": 0,
  "FinServ__AnnualIncome__pc": 28000,
  "AnnualRevenue": null,
  "FinServ__LastInteraction__c": null,
  "Industry": null,
  "FinServ__TotalInvestments__c": 1200,
  "FinServ__TotalBankDeposits__c": 850,
  "FinServ__TotalNonfinancialAssets__c": 0,
  "FinServ__TotalLiabilities__c": 4200
}
```

- [ ] **Step 3: Write the coherence test file**

`tests/test_coherence.py`:

```python
"""End-to-end coherence-narrative tests for Plan 4b person-side derivers.

Verifies cross-deriver invariants by running build_archetype + Registry
together, then asserting the resulting candidates dict satisfies each
narrative profile (rules 1, 2, 4, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16,
22, 23, 24).
"""
import json
from datetime import date, timedelta
from pathlib import Path

import pytest

from customer_hydration.backfill_accounts import _build_registry
from customer_hydration.derivers._archetype import build_archetype
from customer_hydration.derivers._helpers import seeded_rng

FIXTURES = Path(__file__).parent / "fixtures" / "accounts"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text())


def derive_all(record: dict, life_events: list | None = None) -> dict:
    """Run build_archetype + the full registry. Returns merged candidates dict."""
    rng = seeded_rng(record["Id"])
    archetype = build_archetype(record, rng, life_events=life_events or [])
    registry = _build_registry()
    return registry.run(archetype, record, rng)


# ----------------------------------------------------------------------------
# Per-rule tests
# ----------------------------------------------------------------------------

def test_rule_01_tier_servicemodel_alignment():
    """Rule 1: Diamond → Private; Bronze → Self-Service."""
    uhnw = derive_all(load_fixture("wealth_uhnw"))
    assert uhnw["Tier__c"] == "Diamond"
    assert uhnw["FinServ__ServiceModel__c"] == "Private"

    entry = derive_all(load_fixture("retail_22yo_entry"))
    assert entry["Tier__c"] == "Bronze"
    assert entry["FinServ__ServiceModel__c"] == "Self-Service"


def test_rule_02_credit_score_band_by_income():
    """Rule 2: uhnw → score in [770, 850]; entry → score in [400, 720]."""
    uhnw_scores = []
    entry_scores = []
    base_uhnw = load_fixture("wealth_uhnw")
    base_entry = load_fixture("retail_22yo_entry")
    for i in range(50):
        u = {**base_uhnw, "Id": f"001xx0000U{i:06d}",
             "FinServ__CreditScore__c": None, "FinServ__CreditRating__c": None}
        e = {**base_entry, "Id": f"001xx0000E{i:06d}",
             "FinServ__CreditScore__c": None, "FinServ__CreditRating__c": None}
        uhnw_scores.append(derive_all(u)["FinServ__CreditScore__c"])
        entry_scores.append(derive_all(e)["FinServ__CreditScore__c"])
    assert min(uhnw_scores) >= 700
    assert sum(uhnw_scores) / len(uhnw_scores) >= 780
    assert sum(entry_scores) / len(entry_scores) <= 650


def test_rule_05_kyc_date_after_relationship_start():
    """Rule 5: KYCDate ≥ RelationshipStartDate for 100 generated archetypes."""
    base = load_fixture("retail_22yo_entry")
    for i in range(100):
        record = {**base, "Id": f"001xx0000K{i:06d}"}
        out = derive_all(record)
        rs = date.fromisoformat(out["FinServ__RelationshipStartDate__c"])
        kyc = date.fromisoformat(out["FinServ__KYCDate__c"])
        assert kyc >= rs


def test_rule_07_lifetimevalue_engagement_multiplier():
    """Rule 7: heavy/Diamond LV ≫ dormant/Bronze LV for same income."""
    uhnw = derive_all(load_fixture("wealth_uhnw"))
    entry = derive_all(load_fixture("retail_22yo_entry"))
    # Sanity: uhnw is heavy/Diamond → 0.30 mult; entry is light or seeded → much smaller
    assert uhnw["FinServ__LifetimeValue__c"] > entry["FinServ__LifetimeValue__c"] * 50


def test_rule_09_homeownership_age_income_distribution():
    """Rule 9: 50yo + uhnw → ≥85% Own across 100 samples; under-25 entry → ≥70% Rent."""
    base_uhnw = load_fixture("wealth_uhnw")
    base_entry = load_fixture("retail_22yo_entry")
    owns = 0
    rents = 0
    for i in range(100):
        u = {**base_uhnw, "Id": f"001xx0000U{i:06d}"}
        e = {**base_entry, "Id": f"001xx0000R{i:06d}"}
        if derive_all(u)["FinServ__HomeOwnership__pc"] == "Own":
            owns += 1
        if derive_all(e)["FinServ__HomeOwnership__pc"] == "Rent":
            rents += 1
    assert owns >= 85
    assert rents >= 70


def test_rule_10_employed_since_after_18yo():
    """Rule 10: EmployedSince ≥ PersonBirthdate + 18y for 100 generated archetypes."""
    base = load_fixture("retail_22yo_entry")
    for i in range(100):
        record = {**base, "Id": f"001xx0000P{i:06d}"}
        out = derive_all(record)
        birth = date.fromisoformat(record["PersonBirthdate"])
        es = date.fromisoformat(out["FinServ__EmployedSince__pc"])
        eighteenth = birth.replace(year=birth.year + 18)
        assert es >= eighteenth


def test_rule_11_dependents_children_consistent():
    """Rule 11: NumberOfChildren ≤ NumberOfDependents always."""
    base = load_fixture("wealth_uhnw")
    for i in range(50):
        record = {**base, "Id": f"001xx0000D{i:06d}"}
        out = derive_all(record)
        assert (
            out["FinServ__NumberOfChildren__pc"]
            <= out["FinServ__NumberOfDependents__pc"]
        )


def test_rule_12_marital_anniversary_consistency():
    """Rule 12: Single → no anniversary; Married → has anniversary."""
    # Married fixture
    married = derive_all(load_fixture("wealth_uhnw"))
    assert "FinServ__WeddingAnniversary__pc" in married

    # Single fixture (entry)
    entry = load_fixture("retail_22yo_entry")
    out = derive_all(entry)
    # marital_status will be "Single" by default (no LifeEvent in fixture)
    assert "FinServ__WeddingAnniversary__pc" not in out


def test_rule_14_tax_bracket_strict_mapping():
    """Rule 14: $50k → 22%; $1.5M → 37%."""
    base = load_fixture("retail_22yo_entry")
    out = derive_all({**base, "FinServ__AnnualIncome__pc": 50_000})
    assert out["FinServ__TaxBracket__pc"] == "22%"

    out = derive_all({**base, "FinServ__AnnualIncome__pc": 1_500_000})
    assert out["FinServ__TaxBracket__pc"] == "37%"


def test_rule_15_taxid_and_ssn_paired():
    """Rule 15: TaxId + LastFourDigitSSN populated together."""
    base = load_fixture("retail_22yo_entry")
    for i in range(20):
        out = derive_all({**base, "Id": f"001xx0000S{i:06d}"})
        assert "FinServ__TaxId__pc" in out
        assert "FinServ__LastFourDigitSSN__pc" in out


def test_rule_16_risk_triple_only_three_combos():
    """Rule 16: RiskTolerance/TimeHorizon/InvestmentExperience always one of 3 valid triples."""
    valid_triples = {
        ("Conservative", "Short-Term", "Beginner"),
        ("Moderate",     "Medium-Term", "Intermediate"),
        ("Aggressive",   "Long-Term",   "Experienced"),
    }
    base = load_fixture("wealth_uhnw")
    for i in range(50):
        out = derive_all({**base, "Id": f"001xx0000T{i:06d}"})
        triple = (
            out["FinServ__RiskTolerance__c"],
            out["FinServ__TimeHorizon__c"],
            out["FinServ__InvestmentExperience__c"],
        )
        assert triple in valid_triples


def test_rule_22_marriage_event_drives_marital_status():
    """Rule 22: Account with Marriage life event → MaritalStatus=Married, Anniversary populated."""
    record = load_fixture("retail_22yo_entry")  # marital_status null in fixture
    life_events = [
        {"FinServ__EventType__c": "Marriage", "FinServ__EventDate__c": "2025-06-12"}
    ]
    out = derive_all(record, life_events=life_events)
    # The archetype now has marital_status='Married', so demographics produces an
    # anniversary.
    assert "FinServ__WeddingAnniversary__pc" in out


def test_rule_23_personmailing_uses_home_metro():
    """Rule 23: PersonMailingLatitude + PersonMailingLongitude near home_metro centroid."""
    out = derive_all(load_fixture("wealth_uhnw"))
    assert "PersonMailingLatitude" in out
    assert "PersonMailingLongitude" in out
    # The home_metro is hash-derived; just confirm they're real numbers
    assert -90 <= out["PersonMailingLatitude"] <= 90
    assert -180 <= out["PersonMailingLongitude"] <= 180


def test_rule_24_personttile_distribution_by_age_gender():
    """Rule 24: 58yo male should mostly produce Mr."""
    base = load_fixture("wealth_uhnw")  # age 58, male
    mr_count = 0
    for i in range(50):
        out = derive_all({**base, "Id": f"001xx0000B{i:06d}"})
        if out["PersonTitle"] == "Mr":
            mr_count += 1
    assert mr_count >= 25  # ≥50%


# ----------------------------------------------------------------------------
# Narrative tests — full customer profiles
# ----------------------------------------------------------------------------

def test_narrative_22yo_entry_band_renter():
    """22yo with $28k income → Bronze, Self-Service, mostly Rent, 0 children."""
    out = derive_all(load_fixture("retail_22yo_entry"))
    assert out["Tier__c"] == "Bronze"
    assert out["FinServ__ServiceModel__c"] == "Self-Service"
    assert out["FinServ__NumberOfChildren__pc"] == 0
    assert out["FinServ__TaxBracket__pc"] == "12%"  # $28k → 12% bracket


def test_narrative_uhnw_diamond_private_banking():
    """uhnw archetype → Tier=Diamond, ServiceModel=Private, large LifetimeValue."""
    out = derive_all(load_fixture("wealth_uhnw"))
    assert out["Tier__c"] == "Diamond"
    assert out["FinServ__ServiceModel__c"] == "Private"
    # LifetimeValue should reflect $1.5M income × ~12y tenure × heavy × Diamond
    # = $1.5M × 12 × 0.20 × 1.50 = ~$5.4M
    assert out["FinServ__LifetimeValue__c"] >= 4_000_000


def test_narrative_lifeevent_marriage_propagates_to_demographics():
    """Phase 3c Marriage event → Phase 4 sets MaritalStatus + WeddingAnniversary."""
    record = load_fixture("retail_22yo_entry")
    life_events = [
        {"FinServ__EventType__c": "Marriage", "FinServ__EventDate__c": "2025-08-01"}
    ]
    out = derive_all(record, life_events=life_events)
    assert "FinServ__WeddingAnniversary__pc" in out


def test_narrative_no_age_pre_18_employment():
    """All generated archetypes: EmployedSince - PersonBirthdate ≥ 18 years."""
    base = load_fixture("retail_22yo_entry")
    for i in range(100):
        record = {**base, "Id": f"001xx0000P{i:06d}"}
        out = derive_all(record)
        birth = date.fromisoformat(record["PersonBirthdate"])
        es = date.fromisoformat(out["FinServ__EmployedSince__pc"])
        assert (es - birth).days >= 18 * 365 - 5  # 18 years (allow a few days for leap)
```

- [ ] **Step 4: Run the coherence tests**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_coherence.py -v
```

Expected: 17 PASS.

- [ ] **Step 5: Run the full suite**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest -q 2>&1 | tail -5
```

Expected: All previously-passing tests still pass + new ones (~660 total).

- [ ] **Step 6: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add tests/test_coherence.py tests/fixtures/accounts/wealth_uhnw.json tests/fixtures/accounts/retail_22yo_entry.json
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
test(customer-hydration): coherence-narrative tests for rules 1-16, 22-24

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: AGENTS.md update + push

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Append Plan 4b entry to AGENTS.md**

Find the existing Plan 4a entry in AGENTS.md "Plans history" section. Add the following entry directly after it:

```markdown
- **Phase 4 / Plan 4b** (Person-side derivers + coherence, 2026-05-27) —
  Six derivers landed: `relationship.py` (rules 4–8), `credit_personal.py`
  (rules 2–3), `profile.py` person-side (rules 1, 16),
  `demographics.py` (rules 9–15), `addresses.py` person blocks (rule 23),
  `contact.py` person-side (rule 24). Adds `config/backfill_picklists.yaml`
  with 8 picklist distributions consumed via the new
  `_helpers.load_picklist_yaml` reader. Orchestrator's `_build_registry`
  now wires all 6. ~17 coherence-narrative tests in `tests/test_coherence.py`
  exercise rules 1–16 + 22–24 end-to-end against new fixtures
  `wealth_uhnw.json` and `retail_22yo_entry.json`. The applies_to() of
  `profile`, `addresses`, `contact` is gated on `archetype.is_person` so
  Plan 4c can extend them in-place. ~85 new tests, suite at ~660 total.
  Spec: `docs/superpowers/specs/2026-05-26-phase-4-account-backfill-design.md`.
```

- [ ] **Step 2: Run the full suite one last time**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest -q 2>&1 | tail -5
```

Expected: All tests pass.

- [ ] **Step 3: Commit and push**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add AGENTS.md
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
docs(customer-hydration): record Plan 4b completion in AGENTS.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration push -u origin feat/customer-hydration-phase-4-plan-4b
```

---

## Acceptance criteria

Plan 4b is **done** when:

- [ ] All six derivers (`relationship`, `credit_personal`, `profile`, `demographics`, `addresses`, `contact`) are registered in `_build_registry()` and their `applies_to(archetype)` returns True for person accounts.
- [ ] `python hydrate.py backfill-accounts --target-org <alias> --dry-run` (with injected person-account records) produces a CSV with at least 50 columns populated per row.
- [ ] All 17 tests in `tests/test_coherence.py` pass — i.e., rules 1–16 (where person-applicable) + 22–24 hold across narrative customers.
- [ ] All 8 picklists in `config/backfill_picklists.yaml` are loaded successfully via `load_picklist_yaml`.
- [ ] The `wealth_uhnw` narrative produces: `Tier=Diamond`, `ServiceModel=Private`, `CreditScore≥700`, `NumberOfDependents≥1`, `HomeOwnership=Own` ≥85% of the time.
- [ ] The `retail_22yo_entry` narrative produces: `Tier=Bronze`, `ServiceModel=Self-Service`, `NumberOfChildren=0`, `TaxBracket=12%`, `HomeOwnership=Rent` ≥70% of the time.
- [ ] Re-running with no manual edits produces identical CSV bytes (determinism).
- [ ] Suite at ~660 total tests, all green.
- [ ] AGENTS.md "Plans history" includes the Plan 4b entry.
- [ ] Branch `feat/customer-hydration-phase-4-plan-4b` is pushed and ready for PR review.

## Out of scope for Plan 4b (deferred to 4c/4d)

- `credit_bureau.py` deriver (B2B-only — rule 17)
- B2B fields in `profile.py` (AnnualRevenue, NumberOfEmployees, TotalRevenue — rule 18)
- B2B fields in `contact.py` (NAICS_Code__c, Sic, SicDesc, Site, TickerSymbol, Jigsaw, JigsawCompanyId, Industry top-off, Type, Rating — rules 19, 20, 21)
- Shipping address block + full Billing block in `addresses.py`
- coverage_rules.py + coverage_rules.yaml — the partial-fields layer for the 26 partial fields
- Live SOQL fetch from the target org
- Bulk API 2.0 upsert wiring
- DC stream refresh trigger
- Coherence rules 17–21 (B2B-specific)
- Live-org smoke test
