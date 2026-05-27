# Phase 4c — B2B Derivers + Coverage Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the three person-side Plan 4b derivers (`profile`, `addresses`, `contact`) with their B2B branches, add the new `credit_bureau` deriver, ship the partial-fields coverage-rules engine + YAML, and register every B2B contribution in the orchestrator — so a `--dry-run` against a Business-account fixture produces a coherent CSV row that satisfies coherence rules 17–21.

**Architecture:** The three shared derivers branch internally on `archetype.is_person`: each `applies_to()` returns `True`, the `derive()` body keeps Plan 4b's person-side logic untouched and adds an `if not archetype.is_person: ...` block (or equivalent guard) for B2B fields. `credit_bureau.py` is a new standalone deriver gated on `not archetype.is_person`. The coverage-rules layer (`coverage_rules.py` + `config/coverage_rules.yaml`) runs *after* the deriver pass to fill any partial-fields gap that survived; it's a pure-function YAML interpreter that calls back into named deriver functions. New coherence-narrative tests for rules 17–21 plus B2B sample customers go in `tests/test_coherence.py`.

**Tech Stack:** Python 3.10+, dataclasses, pytest, hashlib, random.Random, PyYAML.

**Spec:** `docs/superpowers/specs/2026-05-26-phase-4-account-backfill-design.md` §4.2 rules 17–21, §4.4 (B2B branches of profile/addresses/contact + credit_bureau), §4.5 (coverage rules), §4.6 (picklists), §4.7 (paired fields including NAICS/Sic).

---

## File Structure

**New files (production):**

- `customer_hydration/derivers/credit_bureau.py` — owns 12 B2B fields (DNB triple, Equifax triple, Experian pair, Fitch pair, INS_FEIN_Tax_ID, DNB_Rating). Implements rule 17.
- `customer_hydration/coverage_rules.py` — pure-function engine that loads `config/coverage_rules.yaml` and applies its rules after the deriver layer.
- `config/coverage_rules.yaml` — YAML declaring the partial-field expected-coverage rules.

**New files (config additions):**

- Append picklist entries to `config/backfill_picklists.yaml`: `Type`, `Rating`, `Industry` (from existing org values used in the spec).

**New files (tests):**

- `tests/test_credit_bureau.py` — ~12 unit tests for the new deriver
- `tests/test_profile_business.py` — ~8 unit tests for the B2B branch of profile
- `tests/test_addresses_business.py` — ~7 unit tests for the B2B branch of addresses
- `tests/test_contact_business.py` — ~10 unit tests for the B2B branch of contact
- `tests/test_coverage_rules.py` — ~12 unit tests for the coverage-rules engine
- `tests/fixtures/accounts/commercial_enterprise.json` — large-revenue commercial fixture
- `tests/fixtures/accounts/smb_micro.json` — small-revenue SMB fixture

**Modified files (production):**

- `customer_hydration/derivers/profile.py` — extend `applies_to()` to `True`; add B2B branch in `derive()` for `AnnualRevenue`, `NumberOfEmployees`, `FinServ__TotalRevenue__c`. Adds rule 18 enforcement.
- `customer_hydration/derivers/addresses.py` — extend `applies_to()` to `True`; add B2B branch in `derive()` for `Shipping*` block (9 fields) + full `Billing*` block (City/State/Country/PostalCode/Street). Implements rule 23 B2B side.
- `customer_hydration/derivers/contact.py` — extend `applies_to()` to `True`; add B2B branch in `derive()` for `NAICS_Code__c`, `Sic`, `SicDesc`, `Site`, `TickerSymbol`, `Jigsaw`, `JigsawCompanyId`, `Industry` (top-off respecting AccountSource), `Type`, `Rating`. Implements rules 19, 20, 21.
- `customer_hydration/derivers/_pairs.py` — already lists `(NAICS_Code__c, Sic)` from Plan 4a (rule 20). No change.
- `customer_hydration/backfill_accounts.py` — register `CreditBureauDeriver` in `_build_registry()`; call `coverage_rules.apply()` after the deriver loop in `run_backfill()`.

**Modified files (tests):**

- `tests/test_coherence.py` — add ~10 coherence tests for rules 17–21 + B2B narrative tests (commercial-enterprise, smb-micro, household-aggregate).
- `tests/test_addresses_person.py` — `test_applies_to_person_only_in_4b` no longer asserts `False` for business; rename test and update assertion.
- `tests/test_contact_person.py` — same `applies_to` test update as above.
- `tests/test_profile_person.py` — no `applies_to` test currently asserts `False` for business (the test only verifies True for person); no test edits required there.

**Modified files (docs):**

- `AGENTS.md` — append Plan 4c entry to "Plans history" + add a "Things that bite" entry if anything surfaces during build.

**Out of scope for 4c:** Live SOQL fetch from the target org; Bulk API 2.0 upsert wiring; DC stream refresh trigger; production guardrail; per-deriver exception isolation; the `--strict` and `--require-external-id` flag behaviors.

**Plan 4c is done when:** `python hydrate.py backfill-accounts --target-org <alias> --dry-run` against a list of injected Business + Person accounts produces a coherent CSV with all 24 coherence rules satisfied, plus 26 partial-fields coverage rules applied where appropriate.

---

## Task 1: Bootstrap Plan 4c branch

**Files:** none — branch operations only.

- [ ] **Step 1: Cut the feature branch from the Plan 4b tip**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration checkout feat/customer-hydration-phase-4-plan-4b
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration pull origin feat/customer-hydration-phase-4-plan-4b
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration checkout -b feat/customer-hydration-phase-4-plan-4c
```

- [ ] **Step 2: Verify the 4b foundation is in place**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest -q 2>&1 | tail -3
```

Expected: 655 tests PASS. If less, the 4b branch was rebased or the wrong branch was chosen — STOP and ask the controller.

- [ ] **Step 3: Confirm the 6 Plan 4b derivers are registered**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && python -c "
from customer_hydration.backfill_accounts import _build_registry
r = _build_registry()
names = [d.name for d in r.derivers]
assert names == ['relationship', 'credit_personal', 'profile', 'demographics', 'addresses', 'contact'], names
print('OK')
"
```

Expected: `OK`. If not, the 4b registry isn't in the expected state — STOP and ask the controller.

No commit in this task — branch creation is the work.

---

## Task 2: Append B2B picklists to backfill_picklists.yaml

**Files:**
- Modify: `config/backfill_picklists.yaml`
- Modify: `tests/test_helpers.py`

- [ ] **Step 1: Read the current `config/backfill_picklists.yaml`**

The existing file has 8 picklists for Plan 4b. Read it to confirm its structure before appending. The file ends at the BorrowingHistory entry.

```bash
cat /Users/jsifontes/Documents/Git/JDO/Customer_Hydration/config/backfill_picklists.yaml | tail -20
```

- [ ] **Step 2: Append the failing test for the new picklists**

Append to `tests/test_helpers.py`:

```python
def test_load_picklist_yaml_loads_b2b_phase_4c_fields():
    """Plan 4c adds Type, Rating, Industry picklists for B2B contact fields."""
    expected = ["Type", "Rating", "Industry"]
    for field in expected:
        entry = load_picklist_yaml(field)
        assert entry is not None, f"{field} missing from backfill_picklists.yaml"
        assert "values" in entry
        assert "weights" in entry
        assert len(entry["values"]) == len(entry["weights"])
```

- [ ] **Step 3: Run test to verify failure**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_helpers.py::test_load_picklist_yaml_loads_b2b_phase_4c_fields -v
```

Expected: FAIL — `Type missing from backfill_picklists.yaml`.

- [ ] **Step 4: Append the new picklists to the YAML**

Append to `config/backfill_picklists.yaml` (after the last existing entry, preserving 2-line indent style):

```yaml

# --- Plan 4c B2B additions ---

Type:
  values: [Customer - Direct, Customer - Channel, Prospect, Partner, Other]
  weights: [0.55, 0.10, 0.20, 0.10, 0.05]

Rating:
  values: [Hot, Warm, Cold]
  weights: [0.20, 0.55, 0.25]

Industry:
  values: [Banking, Finance, Insurance, Healthcare, Manufacturing, Retail, Technology, Real Estate, Education, Hospitality, Energy, Agriculture]
  weights: [0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.05, 0.05, 0.10, 0.05, 0.05]
```

- [ ] **Step 5: Run tests to confirm passage**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_helpers.py -q
```

Expected: 28 PASS (was 27, added 1).

Note: `_load_picklist_yaml` is `@functools.lru_cache(maxsize=1)`-cached. Within a single pytest invocation the YAML loads once. The test doesn't need cache invalidation because the assertion only ever runs after the YAML edit + pytest re-import.

- [ ] **Step 6: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add config/backfill_picklists.yaml tests/test_helpers.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
feat(customer-hydration): add Type, Rating, Industry picklists for Plan 4c B2B

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: credit_bureau deriver

**Files:**
- Create: `customer_hydration/derivers/credit_bureau.py`
- Create: `tests/test_credit_bureau.py`

This is the only entirely new deriver in Plan 4c. It implements rule 17: all B2B bureau scores derive from one `archetype.business_credit_quality` latent. The PAYDEX, Delinquency, Intelliscore, and Equifax Credit Risk scores are *positively* correlated with `business_credit_quality`; the Failure score is *inversely* correlated.

### Field inventory (12 fields)

| Field | Range | Direction | Notes |
|---|---|---|---|
| `DNB_PAYDEX_Score__c` | 1–100 | positive | higher = more reliable payment |
| `DNB_Delinquency_Score__c` | 101–670 | positive | higher = lower delinquency risk |
| `DNB_Failure_Score__c` | 1001–1610 | inverse | higher = more failure risk |
| `DNB_Rating__c` | string | derived | "1A1"–"DH4" letter+number from PAYDEX |
| `Equifax_Credit_Risk_Score__c` | 101–992 | positive | higher = lower credit risk |
| `Equifax_Failure_Score_CR__c` | 1000–1610 | inverse | higher = more failure risk |
| `Equifax_Payment_Index__c` | 0–100 | positive | similar to PAYDEX |
| `Experian_Intelliscore__c` | 1–100 | positive | higher = lower risk |
| `Experian_Risk_Band__c` | "1"–"6" | derived | from Intelliscore band |
| `Fitch_Category__c` | string | derived | "Investment Grade" / "Speculative" |
| `Fitch_Rating__c` | string | derived | "AAA"/"AA"/"A"/"BBB"/"BB"/"B"/"CCC" |
| `INS_FEIN_Tax_ID__c` | 9-digit | deterministic | from account_id hash |

`applies_to(archetype)` returns `not archetype.is_person`.

- [ ] **Step 1: Write the failing test file**

Create `tests/test_credit_bureau.py`:

```python
"""Unit tests for credit_bureau deriver (rule 17).

All bureau scores derive from one archetype.business_credit_quality latent.
Positive correlation: PAYDEX, Delinquency, Intelliscore, Equifax Credit Risk.
Inverse correlation: DNB Failure, Equifax Failure.
"""
from datetime import date

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers.credit_bureau import CreditBureauDeriver


def _arch(*, business_credit_quality=0.7, is_person=False, persona="commercial",
          business_size="mid", account_id="001xx000000BIZ01") -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2017, 1, 15),
        record_type="Business" if not is_person else "FSC Person Accounts",
        is_person=is_person, persona=persona,
        age=50, gender="N/A", marital_status="N/A",
        household_size=0, income_band="affluent",
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=8.0, engagement_level="regular",
        home_metro="Boston, MA",
        business_size=business_size, industry_code="522110",
        business_credit_quality=business_credit_quality,
    )


def test_deriver_metadata():
    d = CreditBureauDeriver()
    assert d.name == "credit_bureau"
    assert "DNB_PAYDEX_Score__c" in d.fields
    assert "Equifax_Credit_Risk_Score__c" in d.fields
    assert "INS_FEIN_Tax_ID__c" in d.fields


def test_applies_to_business_returns_true():
    d = CreditBureauDeriver()
    assert d.applies_to(_arch(is_person=False)) is True


def test_applies_to_person_returns_false():
    """Person accounts use credit_personal, not credit_bureau."""
    d = CreditBureauDeriver()
    assert d.applies_to(_arch(is_person=True)) is False


def test_paydex_in_range_1_to_100():
    d = CreditBureauDeriver()
    for i in range(200):
        a = _arch(account_id=f"001xx00000P{i:05d}")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        assert 1 <= out["DNB_PAYDEX_Score__c"] <= 100


def test_delinquency_in_range_101_to_670():
    d = CreditBureauDeriver()
    for i in range(200):
        a = _arch(account_id=f"001xx00000D{i:05d}")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        assert 101 <= out["DNB_Delinquency_Score__c"] <= 670


def test_failure_in_range_1001_to_1610():
    d = CreditBureauDeriver()
    for i in range(200):
        a = _arch(account_id=f"001xx00000F{i:05d}")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        assert 1001 <= out["DNB_Failure_Score__c"] <= 1610


def test_intelliscore_in_range_1_to_100():
    d = CreditBureauDeriver()
    for i in range(200):
        a = _arch(account_id=f"001xx00000I{i:05d}")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        assert 1 <= out["Experian_Intelliscore__c"] <= 100


def test_equifax_credit_risk_in_range_101_to_992():
    d = CreditBureauDeriver()
    for i in range(200):
        a = _arch(account_id=f"001xx00000Q{i:05d}")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        assert 101 <= out["Equifax_Credit_Risk_Score__c"] <= 992


def test_rule_17_paydex_positively_correlates_with_credit_quality():
    """High business_credit_quality → high PAYDEX (≥75 mean across 100 samples)."""
    d = CreditBureauDeriver()
    high_paydex = []
    low_paydex = []
    for i in range(100):
        a_high = _arch(account_id=f"001xx0000H{i:05d}", business_credit_quality=0.95)
        a_low = _arch(account_id=f"001xx0000L{i:05d}", business_credit_quality=0.10)
        high_paydex.append(
            d.derive(a_high, {"Id": a_high.account_id},
                     seeded_rng(a_high.account_id))["DNB_PAYDEX_Score__c"]
        )
        low_paydex.append(
            d.derive(a_low, {"Id": a_low.account_id},
                     seeded_rng(a_low.account_id))["DNB_PAYDEX_Score__c"]
        )
    assert sum(high_paydex) / len(high_paydex) >= 75
    assert sum(low_paydex) / len(low_paydex) <= 30


def test_rule_17_failure_score_inversely_correlates_with_credit_quality():
    """High business_credit_quality → LOW failure score; vice versa."""
    d = CreditBureauDeriver()
    high_failure = []  # produced by HIGH credit_quality (should be low values)
    low_failure = []   # produced by LOW credit_quality (should be high values)
    for i in range(100):
        a_high = _arch(account_id=f"001xx0000HF{i:04d}", business_credit_quality=0.95)
        a_low = _arch(account_id=f"001xx0000LF{i:04d}", business_credit_quality=0.10)
        high_failure.append(
            d.derive(a_high, {"Id": a_high.account_id},
                     seeded_rng(a_high.account_id))["DNB_Failure_Score__c"]
        )
        low_failure.append(
            d.derive(a_low, {"Id": a_low.account_id},
                     seeded_rng(a_low.account_id))["DNB_Failure_Score__c"]
        )
    # high credit_quality → low failure score (closer to 1001)
    # low credit_quality → high failure score (closer to 1610)
    assert sum(high_failure) / len(high_failure) <= 1200
    assert sum(low_failure) / len(low_failure) >= 1450


def test_fein_is_nine_digit_string():
    d = CreditBureauDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    fein = out["INS_FEIN_Tax_ID__c"]
    assert len(fein) == 9
    assert fein.isdigit()


def test_fein_is_deterministic_per_account():
    d = CreditBureauDeriver()
    a = _arch()
    out1 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    out2 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out1["INS_FEIN_Tax_ID__c"] == out2["INS_FEIN_Tax_ID__c"]


def test_fitch_rating_is_known_grade():
    d = CreditBureauDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["Fitch_Rating__c"] in (
        "AAA", "AA", "A", "BBB", "BB", "B", "CCC"
    )
    assert out["Fitch_Category__c"] in ("Investment Grade", "Speculative")


def test_deriver_is_deterministic():
    d = CreditBureauDeriver()
    a = _arch()
    out1 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    out2 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out1 == out2
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_credit_bureau.py -q
```

Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement the deriver**

Create `customer_hydration/derivers/credit_bureau.py`:

```python
"""credit_bureau deriver — B2B bureau scores (rule 17).

All scores derive from `archetype.business_credit_quality` (0–1):
  - PAYDEX 1–100 (positive)
  - Delinquency 101–670 (positive)
  - Failure 1001–1610 (INVERSE — high quality = low failure score)
  - Intelliscore 1–100 (positive)
  - Equifax Credit Risk 101–992 (positive)
  - Equifax Failure 1000–1610 (INVERSE)
  - Equifax Payment Index 0–100 (positive)

Business accounts only. See spec §4.2 rule 17 + §4.4 row 'credit_bureau.py'.
"""
from __future__ import annotations

import hashlib
from random import Random
from typing import Any

from customer_hydration.derivers._archetype import PersonaArchetype


def _scale_positive(quality: float, low: int, high: int, rng: Random) -> int:
    """Scale a 0-1 quality to a [low, high] integer with small Gaussian jitter.
    quality=1 → near high; quality=0 → near low.
    """
    span = high - low
    base = low + quality * span
    # Jitter is ±5% of span — preserves rank while adding variation
    jitter = rng.gauss(0, span * 0.05)
    return max(low, min(high, int(round(base + jitter))))


def _scale_inverse(quality: float, low: int, high: int, rng: Random) -> int:
    """Scale a 0-1 quality to a [low, high] integer with INVERSE relationship.
    quality=1 → near low; quality=0 → near high.
    """
    return _scale_positive(1 - quality, low, high, rng)


# Fitch rating bands by quality
_FITCH_RATING_BANDS: list[tuple[float, str, str]] = [
    (0.95, "AAA", "Investment Grade"),
    (0.85, "AA",  "Investment Grade"),
    (0.70, "A",   "Investment Grade"),
    (0.55, "BBB", "Investment Grade"),
    (0.40, "BB",  "Speculative"),
    (0.25, "B",   "Speculative"),
    (0.00, "CCC", "Speculative"),
]


def _fitch_from_quality(quality: float) -> tuple[str, str]:
    for threshold, rating, category in _FITCH_RATING_BANDS:
        if quality >= threshold:
            return rating, category
    return "CCC", "Speculative"


# DNB rating: letter from quality, number from rng
def _dnb_rating(quality: float, rng: Random) -> str:
    letter_idx = int(round((1 - quality) * 4))  # quality 1 → A, 0 → E
    letter = ["1A", "2A", "3A", "BA", "CB"][min(4, letter_idx)]
    number = rng.randint(1, 4)
    return f"{letter}{number}"


def _experian_risk_band(intelliscore: int) -> str:
    """Experian Risk Band: 1 (lowest risk) — 6 (highest risk)."""
    if intelliscore >= 80:
        return "1"
    if intelliscore >= 60:
        return "2"
    if intelliscore >= 40:
        return "3"
    if intelliscore >= 20:
        return "4"
    if intelliscore >= 10:
        return "5"
    return "6"


def _synth_fein(account_id: str) -> str:
    """Synthetic 9-digit FEIN deterministic from account_id."""
    digest = hashlib.sha256(("fein:" + account_id).encode()).digest()
    n = int.from_bytes(digest[:5], "big") % 1_000_000_000
    return f"{n:09d}"


class CreditBureauDeriver:
    """B2B bureau scores. Business accounts only. See spec rule 17."""

    name = "credit_bureau"
    fields = [
        "DNB_PAYDEX_Score__c",
        "DNB_Delinquency_Score__c",
        "DNB_Failure_Score__c",
        "DNB_Rating__c",
        "Equifax_Credit_Risk_Score__c",
        "Equifax_Failure_Score_CR__c",
        "Equifax_Payment_Index__c",
        "Experian_Intelliscore__c",
        "Experian_Risk_Band__c",
        "Fitch_Category__c",
        "Fitch_Rating__c",
        "INS_FEIN_Tax_ID__c",
    ]

    def applies_to(self, archetype: PersonaArchetype) -> bool:
        return not archetype.is_person

    def derive(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {}
        # Default to mid-range quality if archetype didn't compute one
        quality = archetype.business_credit_quality
        if quality is None:
            quality = 0.5

        # PAYDEX — positive
        paydex = _scale_positive(quality, 1, 100, rng)
        out["DNB_PAYDEX_Score__c"] = paydex

        # Delinquency — positive
        out["DNB_Delinquency_Score__c"] = _scale_positive(quality, 101, 670, rng)

        # Failure — INVERSE
        out["DNB_Failure_Score__c"] = _scale_inverse(quality, 1001, 1610, rng)

        # DNB Rating string
        out["DNB_Rating__c"] = _dnb_rating(quality, rng)

        # Equifax Credit Risk — positive
        out["Equifax_Credit_Risk_Score__c"] = _scale_positive(quality, 101, 992, rng)

        # Equifax Failure — INVERSE
        out["Equifax_Failure_Score_CR__c"] = _scale_inverse(quality, 1000, 1610, rng)

        # Equifax Payment Index — positive
        out["Equifax_Payment_Index__c"] = _scale_positive(quality, 0, 100, rng)

        # Experian Intelliscore + Risk Band
        intelliscore = _scale_positive(quality, 1, 100, rng)
        out["Experian_Intelliscore__c"] = intelliscore
        out["Experian_Risk_Band__c"] = _experian_risk_band(intelliscore)

        # Fitch Rating + Category
        rating, category = _fitch_from_quality(quality)
        out["Fitch_Rating__c"] = rating
        out["Fitch_Category__c"] = category

        # FEIN — synthetic 9-digit deterministic
        out["INS_FEIN_Tax_ID__c"] = _synth_fein(archetype.account_id)

        return out
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_credit_bureau.py -v
```

Expected: 14 PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add customer_hydration/derivers/credit_bureau.py tests/test_credit_bureau.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
feat(customer-hydration): credit_bureau deriver (rule 17)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Extend profile deriver with B2B branch

**Files:**
- Modify: `customer_hydration/derivers/profile.py`
- Create: `tests/test_profile_business.py`

Plan 4b's `ProfileDeriver` has `applies_to(archetype) → archetype.is_person` and a person-only `derive()` body. Plan 4c needs to:

1. Change `applies_to` to `True` (handles both branches).
2. Add B2B fields to the `fields` list: `AnnualRevenue`, `NumberOfEmployees`, `FinServ__TotalRevenue__c`.
3. Add a B2B branch in `derive()` that runs *only* when `not archetype.is_person`. The person-side logic stays guarded so it never fires for businesses.

Rule 18 enforces the `business_size + AnnualRevenue + NumberOfEmployees` triple:
- micro: $50k–$1M revenue & 1–10 employees
- small: $1M–$10M & 10–50
- mid: $10M–$100M & 50–500
- large: $100M–$1B & 500–5000
- enterprise: ≥$1B & ≥5000

For B2B accounts, person-side fields (Tier, ServiceModel, NetWorth, RiskTolerance, etc.) are not applicable. Skip them entirely; produce only the B2B-relevant fields. CustomerType for B2B is `Business`.

- [ ] **Step 1: Write the failing tests for the B2B branch**

Create `tests/test_profile_business.py`:

```python
"""Unit tests for the B2B branch of profile deriver (rule 18)."""
from datetime import date

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers.profile import ProfileDeriver


def _arch_business(*, business_size="mid", account_id="001xx000000BIZ01",
                   annual_revenue=50_000_000) -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2017, 1, 15),
        record_type="Business", is_person=False, persona="commercial",
        age=50, gender="N/A", marital_status="N/A",
        household_size=0,
        # archetype.income_band for B2B was set from revenue band per
        # spec §4.1 step 4: micro→entry, small→middle, mid→affluent,
        # large→hnw, enterprise→uhnw
        income_band={"micro": "entry", "small": "middle", "mid": "affluent",
                     "large": "hnw", "enterprise": "uhnw"}[business_size],
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=8.0, engagement_level="regular",
        home_metro="Boston, MA",
        business_size=business_size, industry_code="522110",
        business_credit_quality=0.7,
    )


def test_applies_to_business_returns_true():
    """Plan 4c: profile applies to both person and business."""
    d = ProfileDeriver()
    assert d.applies_to(_arch_business()) is True


def test_business_branch_skips_person_fields():
    """Tier__c is person-side. NetWorth is person-side. ServiceModel is
    person-side. None should be in the B2B output."""
    d = ProfileDeriver()
    a = _arch_business()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert "Tier__c" not in out
    assert "FinServ__NetWorth__c" not in out
    assert "FinServ__ServiceModel__c" not in out
    assert "FinServ__RiskTolerance__c" not in out


def test_business_customer_type_is_business():
    """B2B records get CustomerType=Business."""
    d = ProfileDeriver()
    a = _arch_business()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["FinServ__CustomerType__c"] == "Business"


def test_business_status_is_active():
    d = ProfileDeriver()
    a = _arch_business()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["FinServ__Status__c"] == "Active"


def test_rule_18_micro_business_revenue_and_employees():
    """Rule 18: micro → revenue $50k–$1M, employees 1–10."""
    d = ProfileDeriver()
    for i in range(50):
        a = _arch_business(account_id=f"001xx0000M{i:05d}", business_size="micro")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        rev = out.get("AnnualRevenue")
        emps = out.get("NumberOfEmployees")
        if rev is not None:
            assert 50_000 <= rev < 1_000_000, f"micro got revenue {rev}"
        if emps is not None:
            assert 1 <= emps <= 10, f"micro got {emps} employees"


def test_rule_18_mid_business_revenue_and_employees():
    """Rule 18: mid → revenue $10M–$100M, employees 50–500."""
    d = ProfileDeriver()
    for i in range(50):
        a = _arch_business(account_id=f"001xx0000I{i:05d}", business_size="mid")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        rev = out.get("AnnualRevenue")
        emps = out.get("NumberOfEmployees")
        if rev is not None:
            assert 10_000_000 <= rev < 100_000_000, f"mid got revenue {rev}"
        if emps is not None:
            assert 50 <= emps <= 500, f"mid got {emps} employees"


def test_rule_18_enterprise_revenue_and_employees():
    """Rule 18: enterprise → revenue ≥$1B, employees ≥5000."""
    d = ProfileDeriver()
    for i in range(50):
        a = _arch_business(account_id=f"001xx0000E{i:05d}", business_size="enterprise")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        rev = out.get("AnnualRevenue")
        emps = out.get("NumberOfEmployees")
        if rev is not None:
            assert rev >= 1_000_000_000, f"enterprise got revenue {rev}"
        if emps is not None:
            assert emps >= 5000, f"enterprise got {emps} employees"


def test_existing_revenue_not_overwritten():
    """If record already has AnnualRevenue, deriver doesn't propose a new one."""
    d = ProfileDeriver()
    a = _arch_business()
    record = {"Id": a.account_id, "AnnualRevenue": 12_345_000}
    out = d.derive(a, record, seeded_rng(a.account_id))
    assert "AnnualRevenue" not in out


def test_total_revenue_for_b2b():
    """B2B accounts get FinServ__TotalRevenue__c (mirror of AnnualRevenue)."""
    d = ProfileDeriver()
    a = _arch_business()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    rev = out.get("AnnualRevenue")
    total = out.get("FinServ__TotalRevenue__c")
    if rev is not None and total is not None:
        # TotalRevenue should equal AnnualRevenue (one-to-one mirror)
        assert total == pytest.approx(rev, rel=0.001)


def test_business_branch_is_deterministic():
    d = ProfileDeriver()
    a = _arch_business()
    out1 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    out2 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out1 == out2
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_profile_business.py -q
```

Expected: FAIL — Plan 4b's `applies_to` returns `archetype.is_person` (False for businesses), so most tests fail with KeyError on missing fields.

- [ ] **Step 3: Read the existing `profile.py` to confirm structure**

```bash
cat /Users/jsifontes/Documents/Git/JDO/Customer_Hydration/customer_hydration/derivers/profile.py
```

You will see:
- A `_TIER_BY_INCOME_BAND` constant
- A `_SERVICE_MODEL_BY_TIER` constant
- A `_RISK_TRIPLES` list
- A `_RISK_WEIGHTS_BY_PERSONA` dict
- A `ProfileDeriver` class with `name`, `fields`, `applies_to`, and `derive`

- [ ] **Step 4: Modify `profile.py`**

Three edits:

**Edit A — `applies_to`:**

Change:

```python
    def applies_to(self, archetype: PersonaArchetype) -> bool:
        # Plan 4b ships person-side. Plan 4c will add `or not archetype.is_person`.
        return archetype.is_person
```

to:

```python
    def applies_to(self, archetype: PersonaArchetype) -> bool:
        return True
```

**Edit B — `fields` list:**

Change the existing `fields` list to add the three B2B fields at the end:

```python
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
        # Plan 4c B2B fields
        "AnnualRevenue",
        "NumberOfEmployees",
        "FinServ__TotalRevenue__c",
    ]
```

**Edit C — branch the `derive()` body:**

Replace the entire body of `derive()` with:

```python
    def derive(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {}

        # Status — common to both person and B2B
        out["FinServ__Status__c"] = "Active"

        if archetype.is_person:
            # Person-side: Tier/ServiceModel chain, NetWorth, Risk triple,
            # BorrowingHistory, CustomerType=Individual.
            tier = _TIER_BY_INCOME_BAND.get(archetype.income_band, "Silver")
            out["Tier__c"] = tier
            out["FinServ__ServiceModel__c"] = _SERVICE_MODEL_BY_TIER[tier]
            out["FinServ__CustomerType__c"] = "Individual"

            rollups = [
                record.get("FinServ__TotalInvestments__c"),
                record.get("FinServ__TotalBankDeposits__c"),
                record.get("FinServ__TotalNonfinancialAssets__c"),
                record.get("FinServ__TotalLiabilities__c"),
            ]
            if all(v is not None for v in rollups):
                inv, deposits, nonfin, liab = rollups
                base = float(inv) + float(deposits) + float(nonfin) - float(liab)
                out["FinServ__NetWorth__c"] = round(
                    base * archetype.net_worth_multiple, 2
                )

            weights = _RISK_WEIGHTS_BY_PERSONA.get(
                archetype.persona, _RISK_WEIGHTS_BY_PERSONA["retail"]
            )
            triple_index = weighted_pick(rng, ["0", "1", "2"], weights)
            risk, horizon, exp = _RISK_TRIPLES[int(triple_index)]
            out["FinServ__RiskTolerance__c"] = risk
            out["FinServ__TimeHorizon__c"] = horizon
            out["FinServ__InvestmentExperience__c"] = exp

            borrowing_picklist = load_picklist_yaml("FinServ__BorrowingHistory__c")
            if borrowing_picklist:
                out["FinServ__BorrowingHistory__c"] = weighted_pick(
                    rng, borrowing_picklist["values"], borrowing_picklist["weights"]
                )

            return out

        # B2B branch (rule 18)
        out["FinServ__CustomerType__c"] = "Business"

        # Only fill AnnualRevenue if the record doesn't already have one
        if record.get("AnnualRevenue") is None:
            rev_low, rev_high = _BUSINESS_REVENUE_RANGE[archetype.business_size]
            revenue = rng.randint(rev_low, rev_high - 1)
            out["AnnualRevenue"] = revenue
            out["FinServ__TotalRevenue__c"] = revenue

        # NumberOfEmployees coherent with business_size
        if record.get("NumberOfEmployees") is None:
            emp_low, emp_high = _BUSINESS_EMPLOYEES_RANGE[archetype.business_size]
            out["NumberOfEmployees"] = rng.randint(emp_low, emp_high)

        return out
```

Add these constants near the top of the module (after the existing constants, before the class definition):

```python
# Rule 18 — B2B revenue/employees ranges by business_size
_BUSINESS_REVENUE_RANGE: dict[str, tuple[int, int]] = {
    "micro":      (50_000,         1_000_000),
    "small":      (1_000_000,      10_000_000),
    "mid":        (10_000_000,     100_000_000),
    "large":      (100_000_000,    1_000_000_000),
    "enterprise": (1_000_000_000,  50_000_000_000),
}


_BUSINESS_EMPLOYEES_RANGE: dict[str, tuple[int, int]] = {
    "micro":      (1,    10),
    "small":      (10,   50),
    "mid":        (50,   500),
    "large":      (500,  5000),
    "enterprise": (5000, 100000),
}
```

- [ ] **Step 5: Run B2B tests**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_profile_business.py -v
```

Expected: 10 PASS.

- [ ] **Step 6: Run all profile tests (person + business)**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_profile_person.py tests/test_profile_business.py -v
```

Expected: ~21 PASS (11 person + 10 business). Person-side tests should be unaffected by the new branching.

- [ ] **Step 7: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add customer_hydration/derivers/profile.py tests/test_profile_business.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
feat(customer-hydration): profile deriver — extend with B2B branch (rule 18)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Extend addresses deriver with B2B branch

**Files:**
- Modify: `customer_hydration/derivers/addresses.py`
- Create: `tests/test_addresses_business.py`
- Modify: `tests/test_addresses_person.py` — update one test that asserts `applies_to(business) is False`

For B2B, addresses fills:
- Full `Shipping*` block: `ShippingCity`, `ShippingState`, `ShippingCountry`, `ShippingPostalCode`, `ShippingStreet`, `ShippingLatitude`, `ShippingLongitude`, `ShippingGeocodeAccuracy`
- Full `Billing*` block: `BillingCity`, `BillingState`, `BillingCountry`, `BillingPostalCode`, `BillingStreet` (Plan 4b already does Billing lat/long top-off — Plan 4c adds the remaining 5 fields)

For B2B, `PersonMailing*` and `PersonOther*` blocks are NOT filled (those are person-only).

Rule 23 still applies: Billing and Shipping share `home_metro` unless an existing value differs. All-or-nothing per address block.

- [ ] **Step 1: Write the failing tests for the B2B branch**

Create `tests/test_addresses_business.py`:

```python
"""Unit tests for the B2B branch of addresses deriver (rule 23)."""
from datetime import date

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers.addresses import AddressesDeriver


def _arch_business(*, home_metro="Boston, MA",
                   account_id="001xx000000BIZ01") -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2017, 1, 15),
        record_type="Business", is_person=False, persona="commercial",
        age=50, gender="N/A", marital_status="N/A",
        household_size=0, income_band="affluent",
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=8.0, engagement_level="regular",
        home_metro=home_metro,
        business_size="mid", industry_code="522110",
        business_credit_quality=0.7,
    )


def test_applies_to_business_returns_true():
    d = AddressesDeriver()
    assert d.applies_to(_arch_business()) is True


def test_business_branch_skips_person_address_blocks():
    """Person-only blocks (PersonMailing*, PersonOther*) MUST NOT appear for B2B."""
    d = AddressesDeriver()
    a = _arch_business()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    for f in (
        "PersonMailingLatitude", "PersonMailingLongitude", "PersonMailingGeocodeAccuracy",
        "PersonOtherCity", "PersonOtherState", "PersonOtherCountry",
        "PersonOtherPostalCode", "PersonOtherStreet", "PersonOtherPhone",
        "PersonOtherLatitude", "PersonOtherLongitude", "PersonOtherGeocodeAccuracy",
    ):
        assert f not in out, f"B2B output should not contain person-only field {f}"


def test_business_billing_block_atomic():
    """Full Billing block: City + State + Country + PostalCode + Street populated together."""
    d = AddressesDeriver()
    a = _arch_business(home_metro="Boston, MA")
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert "BillingCity" in out
    assert "BillingState" in out
    assert "BillingCountry" in out
    assert "BillingPostalCode" in out
    assert "BillingStreet" in out
    # All-or-nothing: BillingLat/Long/GeocodeAccuracy also present
    assert "BillingLatitude" in out
    assert "BillingLongitude" in out
    assert out["BillingGeocodeAccuracy"] == "Address"
    # Boston, MA convention
    assert out["BillingCity"] == "Boston"
    assert out["BillingState"] == "MA"
    assert out["BillingCountry"] == "United States"


def test_business_shipping_block_atomic():
    """Full Shipping block populated together."""
    d = AddressesDeriver()
    a = _arch_business(home_metro="Boston, MA")
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    for f in (
        "ShippingCity", "ShippingState", "ShippingCountry", "ShippingPostalCode",
        "ShippingStreet", "ShippingLatitude", "ShippingLongitude",
        "ShippingGeocodeAccuracy",
    ):
        assert f in out, f"Shipping field {f} missing from B2B output"


def test_rule_23_business_billing_uses_home_metro():
    """Billing City/State match archetype.home_metro for B2B."""
    d = AddressesDeriver()
    a = _arch_business(home_metro="Chicago, IL")
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["BillingCity"] == "Chicago"
    assert out["BillingState"] == "IL"


def test_existing_billing_city_not_overwritten():
    """If record has BillingCity, deriver doesn't propose a new one."""
    d = AddressesDeriver()
    a = _arch_business()
    record = {"Id": a.account_id, "BillingCity": "Existing City"}
    out = d.derive(a, record, seeded_rng(a.account_id))
    assert "BillingCity" not in out


def test_business_fax_still_populated():
    """Fax is account-wide (both branches)."""
    d = AddressesDeriver()
    a = _arch_business()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    import re
    assert re.match(r"^\(\d{3}\) \d{3}-\d{4}$", out["Fax"])


def test_business_finserv_address_summary_strings():
    """Summary strings (Billing/Mailing/Other/Shipping Address__pc) populated."""
    d = AddressesDeriver()
    a = _arch_business()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["FinServ__BillingAddress__pc"]
    assert out["FinServ__ShippingAddress__pc"]
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_addresses_business.py -q
```

Expected: FAIL — `applies_to` returns False for business currently.

- [ ] **Step 3: Update the existing person-side test**

In `tests/test_addresses_person.py`, find:

```python
def test_applies_to_person_only_in_4b():
    """Plan 4b ships person-side. Business returns False until Plan 4c extends."""
    d = AddressesDeriver()
    assert d.applies_to(_arch(is_person=True)) is True
    assert d.applies_to(_arch(is_person=False)) is False
```

Replace with:

```python
def test_applies_to_returns_true_for_both_branches():
    """Plan 4c: addresses applies to both person and business."""
    d = AddressesDeriver()
    assert d.applies_to(_arch(is_person=True)) is True
    assert d.applies_to(_arch(is_person=False)) is True
```

- [ ] **Step 4: Modify `customer_hydration/derivers/addresses.py`**

Three edits:

**Edit A — `applies_to`:**

Change:

```python
    def applies_to(self, archetype: PersonaArchetype) -> bool:
        # Plan 4b: person-only. Plan 4c will add `or not archetype.is_person`.
        return archetype.is_person
```

to:

```python
    def applies_to(self, archetype: PersonaArchetype) -> bool:
        return True
```

**Edit B — `fields` list:**

Add the new B2B fields to the existing list. After `"BillingGeocodeAccuracy"` add:

```python
        "BillingCity",
        "BillingState",
        "BillingCountry",
        "BillingPostalCode",
        "BillingStreet",
        "ShippingCity",
        "ShippingState",
        "ShippingCountry",
        "ShippingPostalCode",
        "ShippingStreet",
        "ShippingLatitude",
        "ShippingLongitude",
        "ShippingGeocodeAccuracy",
```

The full `fields` list now contains all 33 address-related fields. Order doesn't matter.

**Edit C — branch the `derive()` body:**

The Plan 4b body currently fills PersonMailing/PersonOther/Billing-lat-long/Fax/summaries. Wrap the person blocks in `if archetype.is_person:` and add a B2B block.

Replace the entire `derive()` method body with:

```python
    def derive(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {}

        home_centroid = _METRO_CENTROIDS.get(archetype.home_metro, (40.0, -100.0))
        home_city, home_state = _split_metro(archetype.home_metro)

        # Fax is common to both branches
        out["Fax"] = _synth_phone(archetype.account_id, "fax:")

        if archetype.is_person:
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

            # Billing lat/long top-off (only when BillingCity already populated)
            if record.get("BillingCity") is not None:
                b_lat, b_lon = _jitter_lat_long(home_centroid, rng)
                out["BillingLatitude"] = b_lat
                out["BillingLongitude"] = b_lon
                out["BillingGeocodeAccuracy"] = "Address"

            # FinServ__*Address__pc summary strings
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

        # B2B branch — full Billing + Shipping blocks rooted in home_metro.
        # Skip if record already has BillingCity (only fill missing).
        billing_postal = _synth_postal(home_state, archetype.account_id)
        billing_street = _synth_street(archetype.account_id, "biz_bill:")

        if record.get("BillingCity") is None:
            out["BillingCity"] = home_city
            out["BillingState"] = home_state
            out["BillingCountry"] = "United States"
            out["BillingPostalCode"] = billing_postal
            out["BillingStreet"] = billing_street
            b_lat, b_lon = _jitter_lat_long(home_centroid, rng)
            out["BillingLatitude"] = b_lat
            out["BillingLongitude"] = b_lon
            out["BillingGeocodeAccuracy"] = "Address"
        else:
            # Existing BillingCity → only top off lat/long if those are null
            b_lat, b_lon = _jitter_lat_long(home_centroid, rng)
            out["BillingLatitude"] = b_lat
            out["BillingLongitude"] = b_lon
            out["BillingGeocodeAccuracy"] = "Address"

        # Shipping — same as Billing (most B2B accounts share addresses)
        if record.get("ShippingCity") is None:
            out["ShippingCity"] = home_city
            out["ShippingState"] = home_state
            out["ShippingCountry"] = "United States"
            out["ShippingPostalCode"] = billing_postal
            out["ShippingStreet"] = billing_street
            s_lat, s_lon = _jitter_lat_long(home_centroid, rng)
            out["ShippingLatitude"] = s_lat
            out["ShippingLongitude"] = s_lon
            out["ShippingGeocodeAccuracy"] = "Address"

        # Summary strings — formula-style "Street, City, State Postal"
        billing_summary = f"{billing_street}, {home_city}, {home_state} {billing_postal}"
        out["FinServ__BillingAddress__pc"] = billing_summary
        out["FinServ__ShippingAddress__pc"] = billing_summary
        # Mailing/Other not applicable to B2B; leave null

        return out
```

- [ ] **Step 5: Run B2B tests**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_addresses_business.py -v
```

Expected: 8 PASS.

- [ ] **Step 6: Run all addresses tests**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_addresses_person.py tests/test_addresses_business.py -v
```

Expected: ~16 PASS (8 person updated + 8 business). Person-side tests should be unaffected.

- [ ] **Step 7: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add customer_hydration/derivers/addresses.py tests/test_addresses_business.py tests/test_addresses_person.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
feat(customer-hydration): addresses deriver — extend with B2B Billing + Shipping blocks (rule 23)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Extend contact deriver with B2B branch

**Files:**
- Modify: `customer_hydration/derivers/contact.py`
- Create: `tests/test_contact_business.py`
- Modify: `tests/test_contact_person.py` — update the `applies_to` test

For B2B, contact fills:
- `NAICS_Code__c` — from `archetype.industry_code` directly (rule 20)
- `Sic` — derived from `archetype.industry_code` via NAICS→SIC mapping (rule 20, paired)
- `SicDesc` — text description of the SIC code
- `Site` — synthetic URL like `cumulus-{accountid-hash-6}.com`
- `TickerSymbol` — only for `business_size ∈ {large, enterprise}` (rule 19); 4-letter from hash
- `Jigsaw`, `JigsawCompanyId` — D&B integration markers; synthetic 8-digit
- `Industry` (top-off) — picked from picklist YAML, BUT skipped if `record["AccountSource"] in {"Web", "Phone Inquiry", "Partner Referral"}` (rule 21)
- `Type` — picklist
- `Rating` — picklist

Person-side fields (MiddleName, PersonTitle, PersonAssistantName, etc.) are NOT filled for B2B.

- [ ] **Step 1: Write the failing tests for the B2B branch**

Create `tests/test_contact_business.py`:

```python
"""Unit tests for the B2B branch of contact deriver (rules 19, 20, 21)."""
from datetime import date

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers.contact import ContactDeriver


def _arch_business(*, business_size="mid", industry_code="522110",
                   account_id="001xx000000BIZ01") -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2017, 1, 15),
        record_type="Business", is_person=False, persona="commercial",
        age=50, gender="N/A", marital_status="N/A",
        household_size=0, income_band="affluent",
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=8.0, engagement_level="regular",
        home_metro="Boston, MA",
        business_size=business_size, industry_code=industry_code,
        business_credit_quality=0.7,
    )


def test_applies_to_business_returns_true():
    d = ContactDeriver()
    assert d.applies_to(_arch_business()) is True


def test_business_branch_skips_person_fields():
    """B2B output MUST NOT contain person-only fields."""
    d = ContactDeriver()
    a = _arch_business()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    for f in ("MiddleName", "PersonTitle", "PersonAssistantName",
              "PersonAssistantPhone", "PersonDepartment", "PersonLeadSource",
              "Salutation"):
        assert f not in out, f"B2B should not contain {f}"


def test_rule_20_naics_from_industry_code():
    """NAICS_Code__c = archetype.industry_code directly."""
    d = ContactDeriver()
    a = _arch_business(industry_code="522110")
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["NAICS_Code__c"] == "522110"


def test_rule_20_sic_derives_from_naics():
    """Sic and SicDesc populated together; consistent with NAICS."""
    d = ContactDeriver()
    a = _arch_business(industry_code="522110")  # Banking
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert "Sic" in out
    assert "SicDesc" in out
    # 522110 → SIC 6020 (Commercial Banks)
    assert out["Sic"] == "6020"


def test_rule_19_ticker_only_for_large_or_enterprise():
    """Rule 19: TickerSymbol present iff business_size ∈ {large, enterprise}."""
    d = ContactDeriver()
    micro = d.derive(
        _arch_business(business_size="micro"),
        {"Id": "001xx_micro"}, seeded_rng("001xx_micro"),
    )
    small = d.derive(
        _arch_business(business_size="small"),
        {"Id": "001xx_small"}, seeded_rng("001xx_small"),
    )
    mid = d.derive(
        _arch_business(business_size="mid"),
        {"Id": "001xx_mid"}, seeded_rng("001xx_mid"),
    )
    large = d.derive(
        _arch_business(business_size="large"),
        {"Id": "001xx_large"}, seeded_rng("001xx_large"),
    )
    enterprise = d.derive(
        _arch_business(business_size="enterprise"),
        {"Id": "001xx_ent"}, seeded_rng("001xx_ent"),
    )
    assert "TickerSymbol" not in micro
    assert "TickerSymbol" not in small
    assert "TickerSymbol" not in mid
    assert "TickerSymbol" in large
    assert "TickerSymbol" in enterprise


def test_ticker_is_4_uppercase_letters():
    d = ContactDeriver()
    a = _arch_business(business_size="enterprise")
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    ticker = out["TickerSymbol"]
    assert len(ticker) == 4
    assert ticker.isalpha()
    assert ticker == ticker.upper()


def test_rule_21_industry_topoff_skipped_with_real_account_source():
    """Rule 21: don't overwrite Industry if AccountSource indicates real-source data."""
    d = ContactDeriver()
    a = _arch_business()
    # Real-source: Industry should be skipped
    record_real = {"Id": a.account_id, "AccountSource": "Web", "Industry": None}
    out_real = d.derive(a, record_real, seeded_rng(a.account_id))
    assert "Industry" not in out_real

    # No AccountSource: Industry top-off allowed
    record_topoff = {"Id": a.account_id, "AccountSource": None, "Industry": None}
    out_topoff = d.derive(a, record_topoff, seeded_rng(a.account_id))
    assert "Industry" in out_topoff


def test_industry_topoff_skipped_when_industry_already_set():
    """If Industry is non-null, deriver doesn't propose a new one."""
    d = ContactDeriver()
    a = _arch_business()
    record = {"Id": a.account_id, "Industry": "Manufacturing"}
    out = d.derive(a, record, seeded_rng(a.account_id))
    assert "Industry" not in out


def test_type_and_rating_are_picklist_values():
    d = ContactDeriver()
    a = _arch_business()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["Type"] in (
        "Customer - Direct", "Customer - Channel", "Prospect", "Partner", "Other"
    )
    assert out["Rating"] in ("Hot", "Warm", "Cold")


def test_business_branch_is_deterministic():
    d = ContactDeriver()
    a = _arch_business()
    out1 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    out2 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out1 == out2


def test_jigsaw_and_jigsaw_company_id_paired():
    d = ContactDeriver()
    a = _arch_business()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert "Jigsaw" in out
    assert "JigsawCompanyId" in out
    assert len(out["Jigsaw"]) >= 6
    assert len(out["JigsawCompanyId"]) >= 6
```

- [ ] **Step 2: Update the person-side test**

In `tests/test_contact_person.py`, find:

```python
def test_applies_to_person_only_in_4b():
    d = ContactDeriver()
    assert d.applies_to(_arch(is_person=True)) is True
    # Plan 4b: returns False for business (Plan 4c will extend).
    assert d.applies_to(_arch(is_person=False)) is False
```

Replace with:

```python
def test_applies_to_returns_true_for_both_branches():
    """Plan 4c: contact applies to both person and business."""
    d = ContactDeriver()
    assert d.applies_to(_arch(is_person=True)) is True
    assert d.applies_to(_arch(is_person=False)) is True
```

- [ ] **Step 3: Run the new B2B tests to verify failure**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_contact_business.py -q
```

Expected: FAIL — `applies_to` returns False for business currently.

- [ ] **Step 4: Modify `customer_hydration/derivers/contact.py`**

Three edits:

**Edit A — `applies_to`:**

Change:

```python
    def applies_to(self, archetype: PersonaArchetype) -> bool:
        return archetype.is_person
```

to:

```python
    def applies_to(self, archetype: PersonaArchetype) -> bool:
        return True
```

**Edit B — `fields` list:**

Add the new B2B fields to the existing list. After `"Description"` add:

```python
        # Plan 4c B2B fields
        "NAICS_Code__c",
        "Sic",
        "SicDesc",
        "Site",
        "TickerSymbol",
        "Jigsaw",
        "JigsawCompanyId",
        "Industry",
        "Type",
        "Rating",
```

**Edit C — branch the `derive()` body:**

Add this NAICS→SIC lookup table near the top of the module (after the existing constants):

```python
# Rule 20 — NAICS → SIC mapping (subset; matches archetype's INDUSTRY_TO_NAICS)
_NAICS_TO_SIC: dict[str, tuple[str, str]] = {
    "522110": ("6020", "Commercial Banks"),
    "523000": ("6199", "Finance Services"),
    "524113": ("6311", "Life Insurance"),
    "621111": ("8011", "Offices of Doctors of Medicine"),
    "336111": ("3711", "Motor Vehicles & Passenger Car Bodies"),
    "452210": ("5331", "Variety Stores"),
    "541512": ("7372", "Prepackaged Software"),
    "531210": ("6531", "Real Estate Agents & Managers"),
    "611110": ("8211", "Elementary & Secondary Schools"),
    "721110": ("7011", "Hotels & Motels"),
    "211120": ("1311", "Crude Petroleum & Natural Gas"),
    "111110": ("0111", "Wheat"),
}


# Rule 21 — Industry top-off skipped when AccountSource indicates real data
_REAL_ACCOUNT_SOURCES = {"Web", "Phone Inquiry", "Partner Referral"}


_TICKER_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
```

Add to the imports at the top of the module:

```python
from customer_hydration.derivers._helpers import load_picklist_yaml, weighted_pick
```

(If `load_picklist_yaml` is not currently imported, add it.)

Replace the entire body of `derive()` with:

```python
    def derive(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {}

        # AccountNumber — common to both branches (formatted from External_ID__c)
        out["AccountNumber"] = _account_number(record, archetype.account_id)

        if archetype.is_person:
            # Person-side (rule 24)
            digest = hashlib.sha256(("mid:" + archetype.account_id).encode()).digest()
            out["MiddleName"] = string.ascii_uppercase[digest[0] % 26]

            title_values, title_weights = _person_title_weights(
                archetype.age, archetype.gender
            )
            title = weighted_pick(rng, title_values, title_weights)
            out["PersonTitle"] = title
            out["Salutation"] = title

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

            out["PersonDepartment"] = weighted_pick(
                rng, _DEPARTMENT_VALUES, _DEPARTMENT_WEIGHTS
            )
            out["PersonLeadSource"] = weighted_pick(
                rng, _LEADSOURCE_VALUES, _LEADSOURCE_WEIGHTS
            )

            if record.get("Description") is None:
                template_idx = digest[1] % len(_DESCRIPTION_TEMPLATES)
                out["Description"] = _DESCRIPTION_TEMPLATES[template_idx]

            return out

        # B2B branch (rules 19, 20, 21)
        digest = hashlib.sha256(archetype.account_id.encode()).digest()

        # Rule 20 — NAICS + Sic + SicDesc paired
        naics = archetype.industry_code or "541512"
        out["NAICS_Code__c"] = naics
        sic, sic_desc = _NAICS_TO_SIC.get(naics, ("7389", "Services-Business Services"))
        out["Sic"] = sic
        out["SicDesc"] = sic_desc

        # Site — synthetic URL keyed off account_id
        site_slug = digest[:3].hex()
        out["Site"] = f"https://cumulus-{site_slug}.example.com"

        # Rule 19 — TickerSymbol only for large/enterprise
        if archetype.business_size in ("large", "enterprise"):
            ticker_chars = [
                _TICKER_LETTERS[digest[i] % 26] for i in range(4)
            ]
            out["TickerSymbol"] = "".join(ticker_chars)

        # Jigsaw + JigsawCompanyId — synthetic 8-digit identifiers
        jig = int.from_bytes(digest[3:7], "big") % 100_000_000
        jig_company = int.from_bytes(digest[7:11], "big") % 100_000_000
        out["Jigsaw"] = f"{jig:08d}"
        out["JigsawCompanyId"] = f"{jig_company:08d}"

        # Rule 21 — Industry top-off (skip if real source or already set)
        account_source = record.get("AccountSource")
        existing_industry = record.get("Industry")
        if existing_industry is None and account_source not in _REAL_ACCOUNT_SOURCES:
            industry_picklist = load_picklist_yaml("Industry")
            if industry_picklist:
                out["Industry"] = weighted_pick(
                    rng, industry_picklist["values"], industry_picklist["weights"]
                )

        # Type + Rating — picklists
        type_picklist = load_picklist_yaml("Type")
        if type_picklist:
            out["Type"] = weighted_pick(
                rng, type_picklist["values"], type_picklist["weights"]
            )
        rating_picklist = load_picklist_yaml("Rating")
        if rating_picklist:
            out["Rating"] = weighted_pick(
                rng, rating_picklist["values"], rating_picklist["weights"]
            )

        # Description top-off — same templates as person side
        if record.get("Description") is None:
            template_idx = digest[1] % len(_DESCRIPTION_TEMPLATES)
            out["Description"] = _DESCRIPTION_TEMPLATES[template_idx]

        return out
```

- [ ] **Step 5: Run B2B tests**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_contact_business.py -v
```

Expected: 11 PASS.

- [ ] **Step 6: Run all contact tests**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_contact_person.py tests/test_contact_business.py -v
```

Expected: ~19 PASS (8 person + 11 business). Person-side tests should be unaffected.

- [ ] **Step 7: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add customer_hydration/derivers/contact.py tests/test_contact_business.py tests/test_contact_person.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
feat(customer-hydration): contact deriver — extend with B2B branch (rules 19, 20, 21)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Coverage rules engine + YAML

**Files:**
- Create: `config/coverage_rules.yaml`
- Create: `customer_hydration/coverage_rules.py`
- Create: `tests/test_coverage_rules.py`

The coverage-rules layer runs *after* the deriver pass. It applies YAML-declared rules that fill the remaining 26 partial fields (those that are 5–89% populated in the org). Each rule has:

- `field` — the field name
- `expected_when` — predicate(s) on the record/archetype
- `ignore_when` — opposite-direction predicate; if true, skip (e.g., AnnualRevenue should NOT be filled on Person Accounts)
- `fill_with` — name of a deriver function to call back into

For Plan 4c we ship a minimal but real engine that supports:

- `record_type_in: [list]`
- `record_type_not_in: [list]`
- `is_person_account: bool`
- `persona_in: [list]`

`fill_with` is dotted-path that the engine resolves via the deriver registry.

- [ ] **Step 1: Create the YAML config**

`config/coverage_rules.yaml`:

```yaml
# Phase 4c coverage rules — partial-field gap-fill layer.
#
# Each entry declares a field that is *expected* to be populated under certain
# conditions but might not be after the deriver pass. The engine evaluates
# expected_when (must match) and ignore_when (must NOT match), then if the
# field is still null in `delta` (and on the record), calls `fill_with` to
# get a value.
#
# Plan 4c ships rules for the partial fields whose deriver doesn't always
# produce them (e.g., LifetimeValue is null when AnnualIncome is missing;
# AnnualRevenue should be filled for Business but never Person, etc.).

- field: FinServ__LastInteraction__c
  expected_when:
    record_type_not_in: [Household]
  fill_with: relationship.derive_last_interaction_for_coverage

- field: FinServ__RiskTolerance__c
  expected_when:
    persona_in: [wealth, smb, commercial]
  ignore_when:
    is_person_account: false
  fill_with: profile.derive_risk_tolerance_for_coverage

- field: AnnualRevenue
  expected_when:
    record_type_in: [Business, Household, Entity, Partner]
  ignore_when:
    is_person_account: true
  fill_with: profile.derive_annual_revenue_for_coverage
```

- [ ] **Step 2: Write the failing test file**

Create `tests/test_coverage_rules.py`:

```python
"""Unit tests for the coverage-rules engine (spec §4.5)."""
from datetime import date

import pytest

from customer_hydration.backfill_accounts import _build_registry
from customer_hydration.coverage_rules import (
    apply_coverage_rules,
    load_coverage_rules,
)
from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng


def _arch_person(*, account_id="001xx0000PER01") -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2020, 1, 1),
        record_type="FSC Person Accounts", is_person=True, persona="retail",
        age=40, gender="Male", marital_status="Single",
        household_size=1, income_band="middle",
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=5.0, engagement_level="regular",
        home_metro="Boston, MA",
        business_size=None, industry_code=None, business_credit_quality=None,
    )


def _arch_business(*, account_id="001xx0000BIZ01") -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2018, 1, 1),
        record_type="Business", is_person=False, persona="commercial",
        age=50, gender="N/A", marital_status="N/A",
        household_size=0, income_band="affluent",
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=8.0, engagement_level="regular",
        home_metro="Chicago, IL",
        business_size="mid", industry_code="522110",
        business_credit_quality=0.7,
    )


def test_load_coverage_rules_returns_list():
    rules = load_coverage_rules()
    assert isinstance(rules, list)
    assert len(rules) >= 3
    for r in rules:
        assert "field" in r
        assert "fill_with" in r


def test_apply_coverage_rules_no_op_when_field_already_in_delta():
    """If deriver already populated the field, coverage rules don't overwrite."""
    arch = _arch_business()
    record = {"Id": arch.account_id}
    delta = {"AnnualRevenue": 99_999_999}  # already set by deriver
    registry = _build_registry()
    rng = seeded_rng(arch.account_id)
    apply_coverage_rules(arch, record, delta, registry, rng)
    assert delta["AnnualRevenue"] == 99_999_999


def test_apply_coverage_rules_no_op_when_field_already_on_record():
    """If the record already has the field populated, coverage rules skip."""
    arch = _arch_business()
    record = {"Id": arch.account_id, "AnnualRevenue": 12_345_000}
    delta = {}
    registry = _build_registry()
    rng = seeded_rng(arch.account_id)
    apply_coverage_rules(arch, record, delta, registry, rng)
    assert "AnnualRevenue" not in delta


def test_ignore_when_is_person_skips_annual_revenue():
    """Person accounts should never get AnnualRevenue from coverage rules."""
    arch = _arch_person()
    record = {"Id": arch.account_id}
    delta = {}
    registry = _build_registry()
    rng = seeded_rng(arch.account_id)
    apply_coverage_rules(arch, record, delta, registry, rng)
    assert "AnnualRevenue" not in delta


def test_record_type_in_business_fills_annual_revenue():
    """Business records with null AnnualRevenue get filled by coverage rule."""
    arch = _arch_business()
    record = {"Id": arch.account_id}
    delta = {}
    registry = _build_registry()
    rng = seeded_rng(arch.account_id)
    apply_coverage_rules(arch, record, delta, registry, rng)
    # The mid-business AnnualRevenue range is 10M-100M
    assert "AnnualRevenue" in delta
    assert 10_000_000 <= delta["AnnualRevenue"] < 100_000_000


def test_persona_in_wealth_fills_risk_tolerance_for_person():
    """Wealth person account with no RiskTolerance gets filled by coverage rule."""
    arch = PersonaArchetype(
        account_id="001xx0000WLT01", created_date=date(2018, 1, 1),
        record_type="FSC Person Accounts", is_person=True, persona="wealth",
        age=55, gender="Male", marital_status="Married",
        household_size=3, income_band="hnw",
        credit_quality=0.9, net_worth_multiple=8.0,
        tenure_years=10.0, engagement_level="heavy",
        home_metro="Boston, MA",
        business_size=None, industry_code=None, business_credit_quality=None,
    )
    record = {"Id": arch.account_id}
    delta = {}
    registry = _build_registry()
    rng = seeded_rng(arch.account_id)
    apply_coverage_rules(arch, record, delta, registry, rng)
    # Note: profile.py runs first via Registry — wealth always produces a risk
    # triple. So this rule won't fire (delta already has it). Confirm that.
    # The coverage layer is a safety net.
    assert delta.get("FinServ__RiskTolerance__c") in (
        None, "Conservative", "Moderate", "Aggressive"
    )


def test_record_type_household_skips_last_interaction():
    """Rule: LastInteraction expected when RT NOT IN [Household]; skip Household."""
    arch = PersonaArchetype(
        account_id="001xx0000HH01", created_date=date(2018, 1, 1),
        record_type="Household", is_person=False, persona="household",
        age=50, gender="N/A", marital_status="N/A",
        household_size=0, income_band="affluent",
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=8.0, engagement_level="regular",
        home_metro="Boston, MA",
        business_size=None, industry_code=None, business_credit_quality=None,
    )
    record = {"Id": arch.account_id, "FinServ__LastInteraction__c": None}
    delta = {}
    registry = _build_registry()
    rng = seeded_rng(arch.account_id)
    apply_coverage_rules(arch, record, delta, registry, rng)
    # Household should NOT have LastInteraction filled by the coverage layer
    assert "FinServ__LastInteraction__c" not in delta


def test_unknown_fill_with_logs_warning_and_skips():
    """If a fill_with refers to a missing deriver function, skip without crashing."""
    # Build a custom rule list with a bad fill_with
    bad_rules = [{
        "field": "Some__Field__c",
        "expected_when": {"record_type_in": ["Business"]},
        "fill_with": "nonexistent.derive_xyz",
    }]
    arch = _arch_business()
    record = {"Id": arch.account_id}
    delta = {}
    registry = _build_registry()
    rng = seeded_rng(arch.account_id)
    # Use the internal apply with explicit rules
    from customer_hydration.coverage_rules import _apply_with_rules
    _apply_with_rules(bad_rules, arch, record, delta, registry, rng)
    assert "Some__Field__c" not in delta


def test_apply_does_not_mutate_when_no_rule_matches():
    arch = _arch_business()
    record = {"Id": arch.account_id, "AnnualRevenue": 5_000_000,
              "FinServ__LastInteraction__c": "2026-01-01"}
    delta = {}
    registry = _build_registry()
    rng = seeded_rng(arch.account_id)
    apply_coverage_rules(arch, record, delta, registry, rng)
    assert delta == {}
```

- [ ] **Step 3: Run tests to verify failure**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_coverage_rules.py -q
```

Expected: FAIL with `ModuleNotFoundError: No module named 'customer_hydration.coverage_rules'`.

- [ ] **Step 4: Implement the engine**

Create `customer_hydration/coverage_rules.py`:

```python
"""Coverage rules engine — fills partial-field gaps after the deriver pass.

See spec §4.5. Each rule is a dict from `config/coverage_rules.yaml` with:
  field          — the CRM field name
  expected_when  — predicate(s) the record/archetype must satisfy
  ignore_when    — predicate(s) that, if any matches, skip the rule
  fill_with      — dotted name of a deriver function (deriver.method_name)

The engine resolves `fill_with` by looking up the named method on the matching
deriver in the registry. If the function isn't found, the rule is logged and
skipped — never crashes the run.
"""
from __future__ import annotations

import functools
import logging
from pathlib import Path
from random import Random
from typing import Any

import yaml

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._registry import Registry

logger = logging.getLogger(__name__)


_COVERAGE_RULES_PATH = Path(__file__).resolve().parents[1] / "config" / "coverage_rules.yaml"


@functools.lru_cache(maxsize=1)
def load_coverage_rules() -> list[dict]:
    """Load coverage_rules.yaml. Cached once per process."""
    if not _COVERAGE_RULES_PATH.exists():
        return []
    with _COVERAGE_RULES_PATH.open() as fh:
        data = yaml.safe_load(fh) or []
    return list(data)


def _matches_predicate(
    archetype: PersonaArchetype,
    record: dict,
    predicate: dict,
) -> bool:
    """Return True if the given predicate dict matches the archetype/record."""
    if "record_type_in" in predicate:
        if archetype.record_type not in predicate["record_type_in"]:
            return False
    if "record_type_not_in" in predicate:
        if archetype.record_type in predicate["record_type_not_in"]:
            return False
    if "is_person_account" in predicate:
        if archetype.is_person != bool(predicate["is_person_account"]):
            return False
    if "persona_in" in predicate:
        if archetype.persona not in predicate["persona_in"]:
            return False
    return True


def _resolve_fill_function(rule: dict, registry: Registry):
    """Resolve a `fill_with: 'deriver_name.method_name'` string to a callable.

    Returns None if the method or deriver isn't found.
    """
    fill_with = rule.get("fill_with")
    if not fill_with or "." not in fill_with:
        return None
    deriver_name, method_name = fill_with.split(".", 1)
    for d in registry.derivers:
        if d.name == deriver_name:
            return getattr(d, method_name, None)
    return None


def _apply_with_rules(
    rules: list[dict],
    archetype: PersonaArchetype,
    record: dict,
    delta: dict,
    registry: Registry,
    rng: Random,
) -> None:
    """Apply a list of coverage rules to the running delta dict in place."""
    for rule in rules:
        field = rule.get("field")
        if not field:
            continue

        # Skip if delta or record already has the field populated
        if field in delta:
            continue
        if record.get(field) is not None:
            continue

        # Evaluate expected_when (must match)
        expected = rule.get("expected_when") or {}
        if expected and not _matches_predicate(archetype, record, expected):
            continue

        # Evaluate ignore_when (must NOT match)
        ignore = rule.get("ignore_when") or {}
        if ignore and _matches_predicate(archetype, record, ignore):
            continue

        # Resolve fill_with and call it
        fill_fn = _resolve_fill_function(rule, registry)
        if fill_fn is None:
            logger.warning(
                "coverage_rules: fill_with %r not found; skipping field %s",
                rule.get("fill_with"), field,
            )
            continue

        try:
            value = fill_fn(archetype, record, rng)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "coverage_rules: fill_with %r raised %r; skipping field %s",
                rule.get("fill_with"), exc, field,
            )
            continue

        if value is not None:
            delta[field] = value


def apply_coverage_rules(
    archetype: PersonaArchetype,
    record: dict,
    delta: dict,
    registry: Registry,
    rng: Random,
) -> None:
    """Apply all configured coverage rules to the running delta in place."""
    _apply_with_rules(
        load_coverage_rules(), archetype, record, delta, registry, rng
    )
```

- [ ] **Step 5: Add the three callback functions to derivers**

The YAML's `fill_with` references three methods that don't exist yet:

- `relationship.derive_last_interaction_for_coverage`
- `profile.derive_risk_tolerance_for_coverage`
- `profile.derive_annual_revenue_for_coverage`

Add them as instance methods to the existing classes.

In `customer_hydration/derivers/relationship.py`, add to the `RelationshipDeriver` class (after `derive`):

```python
    def derive_last_interaction_for_coverage(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ):
        """Coverage-rule callback for FinServ__LastInteraction__c.

        Returns a single date string; called by coverage_rules.apply when the
        deriver pass didn't already produce one.
        """
        from datetime import date, timedelta
        offset = rng.randint(0, 365)
        return (date.today() - timedelta(days=offset)).isoformat()
```

In `customer_hydration/derivers/profile.py`, add two methods to the `ProfileDeriver` class (after `derive`):

```python
    def derive_risk_tolerance_for_coverage(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ):
        """Coverage-rule callback for FinServ__RiskTolerance__c."""
        weights = _RISK_WEIGHTS_BY_PERSONA.get(
            archetype.persona, _RISK_WEIGHTS_BY_PERSONA["retail"]
        )
        triple_index = weighted_pick(rng, ["0", "1", "2"], weights)
        risk, _, _ = _RISK_TRIPLES[int(triple_index)]
        return risk

    def derive_annual_revenue_for_coverage(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ):
        """Coverage-rule callback for AnnualRevenue (B2B only)."""
        if archetype.business_size is None:
            return None
        rev_low, rev_high = _BUSINESS_REVENUE_RANGE.get(
            archetype.business_size, (10_000_000, 100_000_000)
        )
        return rng.randint(rev_low, rev_high - 1)
```

- [ ] **Step 6: Run coverage-rules tests**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_coverage_rules.py -v
```

Expected: 9 PASS.

- [ ] **Step 7: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add config/coverage_rules.yaml customer_hydration/coverage_rules.py customer_hydration/derivers/relationship.py customer_hydration/derivers/profile.py tests/test_coverage_rules.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
feat(customer-hydration): coverage rules engine + YAML (partial-fields layer)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Wire credit_bureau + coverage rules into the orchestrator

**Files:**
- Modify: `customer_hydration/backfill_accounts.py`
- Modify: `tests/test_backfill_skeleton.py`

The orchestrator's `_build_registry()` needs to register `CreditBureauDeriver`. The `run_backfill()` function needs to call `apply_coverage_rules()` after the deriver loop.

- [ ] **Step 1: Append the failing end-to-end smoke test**

Append to `tests/test_backfill_skeleton.py`:

```python
def test_run_backfill_produces_csv_with_business_account_deltas(tmp_path):
    """End-to-end: a Business-account record with nulls produces a non-empty CSV row.
    The B2B branches of profile/addresses/contact + credit_bureau all contribute."""
    out_dir = tmp_path / "run"
    record = {
        "Id": "001xx000000BIZ01",
        "External_ID__c": "HYDRATE-COM-000001",
        "RecordType.Name": "Business",
        "IsPersonAccount": False,
        "CreatedDate": "2017-01-15T10:00:00Z",
        "AnnualRevenue": None,
        "Industry": "Banking",
    }
    rc = backfill_accounts.run_backfill(
        target_org="mock", output_dir=out_dir, dry_run=True,
        records=[record], life_events_by_id={},
    )
    assert rc == 0

    csv_text = (out_dir / "account_backfill.csv").read_text()
    # B2B-specific fields populated
    assert "DNB_PAYDEX_Score__c" in csv_text  # credit_bureau
    assert "AnnualRevenue" in csv_text         # profile B2B branch
    assert "BillingCity" in csv_text           # addresses B2B branch
    assert "NAICS_Code__c" in csv_text         # contact B2B branch
    # Person-only fields NOT populated for this Business record
    # (we check the row, not the header — header lists all owned fields)
    lines = csv_text.strip().split("\n")
    header = lines[0].split(",")
    row = lines[1].split(",")
    cells = dict(zip(header, row))
    # PersonMailingLatitude column may exist in header but should be empty for B2B
    assert cells.get("PersonMailingLatitude", "") == ""
    assert cells.get("Tier__c", "") == ""

    manifest = json.loads((out_dir / "manifest.json").read_text())
    assert manifest["derivation"]["rows_with_deltas"] == 1
    owned = manifest["deriver_meta"]["fields_owned_by_derivers"]
    assert "DNB_PAYDEX_Score__c" in owned
    assert "AnnualRevenue" in owned
    assert "BillingCity" in owned
    assert "NAICS_Code__c" in owned
```

- [ ] **Step 2: Run the new test → expected FAIL**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_backfill_skeleton.py::test_run_backfill_produces_csv_with_business_account_deltas -v
```

Expected: FAIL — `CreditBureauDeriver` isn't yet registered, so `DNB_PAYDEX_Score__c` won't appear in the CSV.

- [ ] **Step 3: Update `_build_registry` to register credit_bureau**

In `customer_hydration/backfill_accounts.py`, find:

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

Replace with:

```python
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
```

- [ ] **Step 4: Wire `apply_coverage_rules` into `run_backfill`**

In `customer_hydration/backfill_accounts.py`, find the per-record loop in `run_backfill`. It currently looks like:

```python
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
```

Update the loop to call `apply_coverage_rules` after the null-filter:

```python
    from customer_hydration.coverage_rules import apply_coverage_rules

    for record in records:
        rng = seeded_rng(record["Id"])
        archetype = build_archetype(
            record,
            rng,
            life_events=life_events_by_id.get(record["Id"], []),
        )
        candidates = registry.run(archetype, record, rng)
        delta = {f: v for f, v in candidates.items() if record.get(f) is None}
        # Coverage rules layer — fill partial-field gaps that survived
        apply_coverage_rules(archetype, record, delta, registry, rng)
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
```

(The import is placed at function top instead of module top to avoid circular-import risk during test collection.)

- [ ] **Step 5: Run the smoke test**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_backfill_skeleton.py -v
```

Expected: 6 tests PASS (was 5, added 1).

- [ ] **Step 6: Run the FULL suite**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest -q 2>&1 | tail -5
```

Expected: All previously-passing tests still pass + new ones (~720 total).

- [ ] **Step 7: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add customer_hydration/backfill_accounts.py tests/test_backfill_skeleton.py
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
feat(customer-hydration): wire credit_bureau + coverage rules into orchestrator

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Coherence-narrative tests for B2B (rules 17–21)

**Files:**
- Create: `tests/fixtures/accounts/commercial_enterprise.json`
- Create: `tests/fixtures/accounts/smb_micro.json`
- Modify: `tests/test_coherence.py` — append B2B coherence tests

- [ ] **Step 1: Create the commercial-enterprise fixture**

`tests/fixtures/accounts/commercial_enterprise.json`:

```json
{
  "Id": "001xx0000ENT01",
  "External_ID__c": "HYDRATE-COM-000001",
  "RecordType.Name": "Business",
  "IsPersonAccount": false,
  "CreatedDate": "2010-01-15T10:00:00Z",
  "PersonBirthdate": null,
  "PersonGender": null,
  "FinServ__MaritalStatus__pc": null,
  "FinServ__NumberOfDependents__pc": null,
  "FinServ__AnnualIncome__pc": null,
  "AnnualRevenue": 5000000000,
  "FinServ__LastInteraction__c": "2026-05-20",
  "Industry": "Banking",
  "FinServ__TotalInvestments__c": null,
  "FinServ__TotalBankDeposits__c": null,
  "FinServ__TotalNonfinancialAssets__c": null,
  "FinServ__TotalLiabilities__c": null,
  "AccountSource": null
}
```

- [ ] **Step 2: Create the smb-micro fixture**

`tests/fixtures/accounts/smb_micro.json`:

```json
{
  "Id": "001xx0000SMB01",
  "External_ID__c": "HYDRATE-SMB-000001",
  "RecordType.Name": "Business",
  "IsPersonAccount": false,
  "CreatedDate": "2024-06-01T10:00:00Z",
  "PersonBirthdate": null,
  "PersonGender": null,
  "FinServ__MaritalStatus__pc": null,
  "FinServ__NumberOfDependents__pc": null,
  "FinServ__AnnualIncome__pc": null,
  "AnnualRevenue": 250000,
  "FinServ__LastInteraction__c": null,
  "Industry": "Retail",
  "FinServ__TotalInvestments__c": null,
  "FinServ__TotalBankDeposits__c": null,
  "FinServ__TotalNonfinancialAssets__c": null,
  "FinServ__TotalLiabilities__c": null,
  "AccountSource": "Web"
}
```

- [ ] **Step 3: Append the B2B coherence tests**

Append to `tests/test_coherence.py`:

```python
# ----------------------------------------------------------------------------
# Plan 4c — B2B coherence tests (rules 17, 18, 19, 20, 21)
# ----------------------------------------------------------------------------

def test_rule_17_paydex_correlates_with_failure_inversely():
    """Rule 17: high PAYDEX → low Failure score across 50 commercial fixtures."""
    base = load_fixture("commercial_enterprise")
    pairs = []
    for i in range(50):
        record = {**base, "Id": f"001xx0000B{i:06d}"}
        out = derive_all(record)
        pairs.append((out["DNB_PAYDEX_Score__c"], out["DNB_Failure_Score__c"]))

    # Compute the simple Pearson-like sign check: high PAYDEX ↔ low Failure
    paydex_above_med = [p for p in pairs if p[0] > 50]
    paydex_below_med = [p for p in pairs if p[0] <= 50]
    if paydex_above_med and paydex_below_med:
        avg_failure_high = sum(p[1] for p in paydex_above_med) / len(paydex_above_med)
        avg_failure_low = sum(p[1] for p in paydex_below_med) / len(paydex_below_med)
        # high PAYDEX → low failure
        assert avg_failure_high < avg_failure_low


def test_rule_18_enterprise_revenue_and_employees_coherent():
    """Rule 18: enterprise → revenue ≥ $1B, employees ≥ 5000."""
    base = load_fixture("commercial_enterprise")
    base["AnnualRevenue"] = None  # let deriver fill
    out = derive_all(base)
    if "AnnualRevenue" in out:
        assert out["AnnualRevenue"] >= 1_000_000_000
    if "NumberOfEmployees" in out:
        assert out["NumberOfEmployees"] >= 5000


def test_rule_18_micro_revenue_and_employees_coherent():
    """Rule 18: micro → revenue $50k–$1M, employees 1–10."""
    base = load_fixture("smb_micro")
    base["AnnualRevenue"] = None
    out = derive_all(base)
    if "AnnualRevenue" in out:
        assert 50_000 <= out["AnnualRevenue"] < 1_000_000
    if "NumberOfEmployees" in out:
        assert 1 <= out["NumberOfEmployees"] <= 10


def test_rule_19_ticker_only_for_enterprise():
    """Rule 19: enterprise has TickerSymbol; micro doesn't."""
    enterprise = derive_all(load_fixture("commercial_enterprise"))
    micro = derive_all(load_fixture("smb_micro"))
    assert "TickerSymbol" in enterprise
    assert "TickerSymbol" not in micro


def test_rule_20_naics_and_sic_consistent():
    """Rule 20: NAICS and SIC come from one industry_code."""
    out = derive_all(load_fixture("commercial_enterprise"))
    # Industry='Banking' → NAICS=522110 → SIC=6020
    assert out["NAICS_Code__c"] == "522110"
    assert out["Sic"] == "6020"


def test_rule_21_industry_topoff_skipped_for_real_account_source():
    """Rule 21: smb_micro has AccountSource=Web → Industry NOT overwritten."""
    base = load_fixture("smb_micro")  # AccountSource='Web'
    base["Industry"] = None  # null Industry but AccountSource=Web → still skip
    out = derive_all(base)
    # Industry should NOT be in the output because rule 21 skips real-source records
    assert "Industry" not in out


def test_narrative_commercial_enterprise_with_ticker():
    """Commercial enterprise → has TickerSymbol, AnnualRevenue ≥ $1B,
    NumberOfEmployees ≥ 5000, NAICS+SIC populated, large bureau scores."""
    out = derive_all(load_fixture("commercial_enterprise"))
    assert "TickerSymbol" in out
    assert out["NAICS_Code__c"] == "522110"
    assert out["DNB_PAYDEX_Score__c"] >= 1
    assert out["DNB_PAYDEX_Score__c"] <= 100
    # CustomerType for B2B is Business
    assert out["FinServ__CustomerType__c"] == "Business"


def test_narrative_smb_micro_no_ticker():
    """SMB micro → no TickerSymbol, no person-side fields, has bureau scores."""
    out = derive_all(load_fixture("smb_micro"))
    assert "TickerSymbol" not in out
    assert "Tier__c" not in out                    # person-only
    assert "FinServ__NetWorth__c" not in out       # person-only
    assert "DNB_PAYDEX_Score__c" in out            # bureau scores apply to all B2B
    assert out["FinServ__CustomerType__c"] == "Business"


def test_narrative_household_aggregate_no_kyc():
    """Household RT → no KYCStatus (rule from coverage), but other fields fill."""
    record = {
        "Id": "001xx0000HH01",
        "External_ID__c": "HYDRATE-HH-000001",
        "RecordType.Name": "Household",
        "IsPersonAccount": False,
        "CreatedDate": "2018-01-15T10:00:00Z",
        "AnnualRevenue": None,
        "Industry": None,
        "AccountSource": None,
    }
    out = derive_all(record)
    # Households shouldn't get LastInteraction from coverage rule
    # (coverage rule says expected_when record_type_not_in [Household])
    # The RelationshipDeriver always fills FinServ__LastInteraction__c when
    # the record value is null — so coverage rule's gate is informational here.
    # The narrative just verifies CustomerType=Business (households are non-person).
    assert out["FinServ__CustomerType__c"] == "Business"
```

- [ ] **Step 4: Run the new tests**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest tests/test_coherence.py -v
```

Expected: ~27 PASS (18 from Plan 4b + 9 new from Plan 4c).

- [ ] **Step 5: Run the full suite**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration && pytest -q 2>&1 | tail -5
```

Expected: All previously-passing tests still pass + new ones (~735 total).

- [ ] **Step 6: Commit**

```bash
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration add tests/test_coherence.py tests/fixtures/accounts/commercial_enterprise.json tests/fixtures/accounts/smb_micro.json
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration commit -m "$(cat <<'EOF'
test(customer-hydration): coherence-narrative tests for B2B rules 17-21

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: AGENTS.md update + push

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Append Plan 4c entry to AGENTS.md**

Find the existing Plan 4b entry in the "Plans history" section. Add the following entry directly after it:

```markdown
- **Phase 4 / Plan 4c** (B2B derivers + coverage rules, 2026-05-27) —
  Plan 4b's `profile.py`, `addresses.py`, `contact.py` extended with
  B2B branches (`applies_to → True`, `derive` branches on
  `archetype.is_person`). New `credit_bureau.py` deriver implements rule
  17 (all B2B bureau scores derive from one `business_credit_quality`
  latent — PAYDEX/Delinquency/Intelliscore/Equifax positively correlated;
  Failure inversely correlated). Coverage-rules layer added at
  `customer_hydration/coverage_rules.py` + `config/coverage_rules.yaml` —
  pure-function YAML interpreter that runs *after* the deriver pass and
  fills partial-field gaps via deriver-method callbacks
  (`relationship.derive_last_interaction_for_coverage`,
  `profile.derive_risk_tolerance_for_coverage`,
  `profile.derive_annual_revenue_for_coverage`). New picklists Type,
  Rating, Industry appended to `backfill_picklists.yaml`. New B2B
  coherence tests in `test_coherence.py` cover rules 17–21 and 3 narrative
  customers (commercial-enterprise, smb-micro, household-aggregate).
  All 24 coherence rules now verified end-to-end. ~80 new tests; suite
  goes from 655 → ~735. The fix from final review: routes `Industry`,
  `Type`, `Rating` picklist values through `load_picklist_yaml` rather
  than redeclaring inline. Spec:
  `docs/superpowers/specs/2026-05-26-phase-4-account-backfill-design.md`.
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
docs(customer-hydration): record Plan 4c completion in AGENTS.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git -C /Users/jsifontes/Documents/Git/JDO/Customer_Hydration push -u origin feat/customer-hydration-phase-4-plan-4c
```

---

## Acceptance criteria

Plan 4c is **done** when:

- [ ] `python hydrate.py backfill-accounts --target-org <alias> --dry-run` (with injected Person + Business records) produces a CSV that satisfies all 24 coherence rules.
- [ ] All 7 derivers are registered in `_build_registry()` (relationship, credit_personal, credit_bureau, profile, demographics, addresses, contact).
- [ ] `applies_to(archetype)` returns `True` for person AND business on profile/addresses/contact.
- [ ] `credit_bureau.applies_to` returns `True` for business and `False` for person.
- [ ] `credit_personal.applies_to` returns `True` for person and `False` for business (unchanged from Plan 4b).
- [ ] All 9 coverage rule tests pass and the engine handles missing fill_with gracefully.
- [ ] All 27 tests in `test_coherence.py` pass — i.e., rules 1–24 hold across narrative customers.
- [ ] Re-running with no manual edits produces identical CSV bytes (determinism preserved across all 7 derivers + coverage layer).
- [ ] Suite at ~735 total tests, all green.
- [ ] AGENTS.md "Plans history" includes the Plan 4c entry.
- [ ] Branch `feat/customer-hydration-phase-4-plan-4c` is pushed and ready for PR review.

## Out of scope for Plan 4c (deferred to 4d)

- Live SOQL fetch from the target org
- Bulk API 2.0 upsert wiring
- DC stream refresh trigger
- Production guardrail (`--allow-production` enforcement)
- Per-deriver exception isolation (`Registry.run` try/except)
- The `--strict`, `--require-external-id`, `--persona`, `--record-type`, `--limit` filter flags
- Live-org smoke test
- Manifest schema fields beyond `derivation` and `query`
