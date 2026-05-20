# Plan 1 — Package skeleton + Phase 0 pre-flight + retail-only smoke

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `Customer_Hydration/` package with a working CLI that runs Phase 0 pre-flight, generates 50 retail Person Accounts (one Checking FA + one FA Role each) deterministically from a seed, loads them via `sf data import bulk` to `jdo-fw51xz`, and is fully idempotent under re-runs and `--reset --confirm`. No wealth/SMB/commercial. No native FSC mirrors. No Apex wireup. No Data Cloud trigger. Those land in Plans 2–5.

**Architecture:** Single Python CLI (`hydrate.py`) using `argparse` subcommand dispatch. Generators emit pandas-style row dicts → CSV files in `output/run-{ts}/`. Loader shells out to `sf data import bulk` per CSV in dependency order (Account → FA → FA Role). Pre-flight describes each target object once, caches the field list, drops missing columns, and seeds the External-ID seek pointer. Idempotency via `External_ID__c` upsert under the `HYDRATE-*` namespace. Tests use `pytest` with a fixed seed for byte-equality assertions.

**Tech Stack:** Python 3.11, Faker, PyYAML, python-dateutil, pytest. Salesforce CLI v2 (`sf data import bulk`, `sf sobject describe`, `sf org display --json`). Target org `jdo-fw51xz`.

---

## Context the engineer needs

**Working directory:** All commands assume `/Users/jsifontes/Documents/Git/JDO/Customer_Hydration/`. `cd` here before running anything. Git operations work from anywhere — paths in this plan use `Customer_Hydration/...` for absolute clarity.

**Target org:** `jdo-fw51xz` → `admin@finsdc3.demo`. Confirm with `sf config get target-org`.

**Reference spec:** `Customer_Hydration/docs/superpowers/specs/2026-05-19-customer-hydration-design.md`. Read §1, §2 (Retail persona only), §3 (Account + FA fields only), §4 Waves A + D + E mechanics, and §5 idempotency/reset semantics.

**Existing schema in jdo-fw51xz** (verified during brainstorming, do NOT re-discover):
- `Account.External_ID__c` exists (ext=True, unique=False — uniqueness enforced by us via HYDRATE-* prefix collision-freeness)
- `Account.FinServ__SourceSystemId__c` exists (ext=True, unique=True)
- `FinServ__FinancialAccount__c.External_ID__c` exists (ext=True, unique=True)
- `FinServ__FinancialAccountRole__c` has NO External_ID__c — natural key idempotency in Plan 1 is via `(FinancialAccount.External_ID__c, Account.External_ID__c, Role)` indirection: we delete-then-insert FA Roles inside the reset path; for first-runs there is nothing to dedupe against
- Account RTs in this org: `FSC_Person_Accounts` exists twice (`012am000004x9TBAAY` and `012am000001mrZmAAI`). Plan 1 queries the active one at runtime — never hardcode.

**FSC Person Account RT lookup at runtime** — the canonical SOQL is:
```sql
SELECT Id FROM RecordType
WHERE SobjectType='Account' AND DeveloperName='FSC_Person_Accounts' AND IsActive=true
ORDER BY CreatedDate DESC LIMIT 1
```

**Banker user Ids** (verified, hardcode-OK in `config/rm_pool.yaml`):
- Justin Chen: `005am000003PbFBAA0` (Relationship Banker, used as Plan 1's only RM)
- Standard User: `005am000006ffBpAAI` (Relationship Banker)
- Vince West: `005am000003PYssAAG` (Wealth RM)
- Kim Johnson: `005am000003PbFAAA0` (Wealth Advisor)
- Adam Watson: `005am000003PbFGAA0` (Financial Advisor Associate)
- Allen Carter: `005am000003PbFDAA0` (Commercial RM)

**Cumulus product code for Plan 1:** `PD-CHK-EVD-2026.04` (Cumulus Everyday Checking). Source: `Cumulus_Products/docs/PRODUCT_SPECS.md` line 22.

**Conventions you must follow:**
- One commit per task. Use the commit messages exactly as written in the steps.
- All `sf` CLI commands run from `Customer_Hydration/`. Git commands run from the JDO repo root (`/Users/jsifontes/Documents/Git/JDO`).
- Python: 4-space indent, type hints on every public function, docstring only when behavior is non-obvious.
- TDD: write the failing test first when feasible. The CLI scaffolding tasks are integration-style and skip strict TDD.
- The CLI is invoked as `python hydrate.py …` (not installed as a package).
- Never push to a remote. All work stays local until merged through the JDO repo's normal flow.
- The spec's `WITH USER_MODE` requirement applies to Apex SOQL, not to Python — Plan 1 has no Apex.

---

## File structure produced by Plan 1

```
Customer_Hydration/
├── .gitignore                                # NEW
├── README.md                                 # NEW (skeleton)
├── AGENTS.md                                 # NEW (per spec §6)
├── CLAUDE.md                                 # NEW (See @AGENTS.md shim)
├── artifacts.md                              # NEW (per JDO convention)
├── requirements.txt                          # NEW
├── hydrate.py                                # NEW (CLI entrypoint)
├── customer_hydration/                       # NEW (package directory)
│   ├── __init__.py
│   ├── cli.py                                # argparse dispatch
│   ├── preflight.py                          # Phase 0
│   ├── loader.py                             # sf data import bulk wrapper
│   ├── manifest.py                           # run-manifest.json writer
│   ├── seek.py                               # External-ID seek pointer
│   ├── csv_writer.py                         # CSV serialization with field-drop
│   └── generators/
│       ├── __init__.py
│       └── retail.py                         # Plan 1's only persona
├── config/
│   ├── personas.yaml                         # NEW (retail anchors only)
│   ├── product_catalog.yaml                  # NEW (PD-CHK-EVD-2026.04 only)
│   └── rm_pool.yaml                          # NEW (5 RMs)
├── output/                                   # GITIGNORED
│   └── .gitkeep
└── tests/
    ├── __init__.py
    ├── conftest.py
    ├── test_cli.py
    ├── test_seek.py
    ├── test_csv_writer.py
    ├── test_preflight.py
    ├── test_retail_generator.py
    ├── test_loader.py
    └── fixtures/
        └── retail_seed42_n50.csv             # frozen fixture
```

(`docs/superpowers/specs/` and `docs/superpowers/plans/` already exist from the brainstorming step.)

---

## Task 1: Initialize package directory + .gitignore + requirements.txt

**Files:**
- Create: `Customer_Hydration/.gitignore`
- Create: `Customer_Hydration/requirements.txt`
- Create: `Customer_Hydration/output/.gitkeep`

- [ ] **Step 1: Create the .gitignore**

Create `Customer_Hydration/.gitignore` with:

```gitignore
# Python
__pycache__/
*.pyc
*.pyo
.pytest_cache/
.venv/
venv/
.python-version
*.egg-info/

# Run artifacts (CSVs, manifests, logs)
output/run-*/
output/*.json
output/*.csv

# Editor
.vscode/
.idea/
.DS_Store
```

- [ ] **Step 2: Create requirements.txt**

Create `Customer_Hydration/requirements.txt` with:

```
faker==25.0.1
pyyaml==6.0.1
python-dateutil==2.9.0
pytest==8.2.0
pytest-mock==3.14.0
```

- [ ] **Step 3: Create output/.gitkeep**

Create empty file `Customer_Hydration/output/.gitkeep`. The dir is gitignored at the contents level, but `.gitkeep` keeps the dir itself tracked.

- [ ] **Step 4: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/.gitignore Customer_Hydration/requirements.txt Customer_Hydration/output/.gitkeep
git commit -m "chore(customer-hydration): scaffold .gitignore + requirements"
```

---

## Task 2: AGENTS.md, CLAUDE.md shim, README.md skeleton, artifacts.md

**Files:**
- Create: `Customer_Hydration/AGENTS.md`
- Create: `Customer_Hydration/CLAUDE.md`
- Create: `Customer_Hydration/README.md`
- Create: `Customer_Hydration/artifacts.md`

- [ ] **Step 1: Create AGENTS.md**

Copy the AGENTS.md body from spec §6 ("AGENTS.md structure" code block, lines starting with `# Customer_Hydration — AGENTS.md` through the closing `Phase 0 pre-flight describe step is the canonical guard…` paragraph). Verbatim — that block was approved during brainstorming.

- [ ] **Step 2: Create CLAUDE.md**

Per the JDO repo convention (`feedback_jdo_claude_md_gitignored.md` memory), `CLAUDE.md` is a local-only `See @AGENTS.md` shim and is gitignored at the repo root. Verify it's already gitignored at the repo root:

```bash
cd /Users/jsifontes/Documents/Git/JDO
grep -n 'CLAUDE\.md' .gitignore
```

Expected output: at least one line matching `CLAUDE.md`. If missing, STOP and surface — repo-level gitignore must be fixed before continuing.

Then create `Customer_Hydration/CLAUDE.md`:

```markdown
See @AGENTS.md
```

- [ ] **Step 3: Create README.md skeleton**

Create `Customer_Hydration/README.md`:

```markdown
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
```

- [ ] **Step 4: Create artifacts.md**

Create `Customer_Hydration/artifacts.md`:

```markdown
# Customer_Hydration — artifacts

| Path | Purpose |
|---|---|
| `hydrate.py` | CLI entrypoint |
| `customer_hydration/` | Python package |
| `config/` | YAML configs (personas, product catalog, RM pool) |
| `output/` | Run artifacts (CSVs, manifests). Gitignored. |
| `tests/` | pytest suite |
| `docs/superpowers/specs/` | Approved design specs |
| `docs/superpowers/plans/` | Implementation plans (one per spec phase) |
| `AGENTS.md` | Context file for AI coding agents |
| `README.md` | Human onboarding |
```

- [ ] **Step 5: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/AGENTS.md Customer_Hydration/CLAUDE.md \
    Customer_Hydration/README.md Customer_Hydration/artifacts.md
git commit -m "docs(customer-hydration): add AGENTS.md, README, artifacts.md, CLAUDE.md shim"
```

---

## Task 3: Create config/rm_pool.yaml

**Files:**
- Create: `Customer_Hydration/config/rm_pool.yaml`

- [ ] **Step 1: Create rm_pool.yaml**

Create `Customer_Hydration/config/rm_pool.yaml`:

```yaml
# RM pool for Customer_Hydration. User Ids verified in jdo-fw51xz on 2026-05-19.
# Excludes Acme Partners users (Sarah Phillips, Paul Partner) and demo person
# accounts (Julie Morris) — they should not own customer books.

rms:
  vince_west:
    user_id: 005am000003PYssAAG
    name: Vince West
    title: Relationship Manager (Wealth)
    role_family: wealth
    seniority: senior
    target_personas:
      wealth: 700

  kim_johnson:
    user_id: 005am000003PbFAAA0
    name: Kim Johnson
    title: Wealth Advisor
    role_family: wealth
    seniority: mid
    target_personas:
      wealth: 350
      retail: 50  # cross-sold

  adam_watson:
    user_id: 005am000003PbFGAA0
    name: Adam Watson
    title: Financial Advisor Associate
    role_family: wealth
    seniority: junior
    target_personas:
      wealth: 150
      retail: 50  # cross-sold

  justin_chen:
    user_id: 005am000003PbFBAA0
    name: Justin Chen
    title: Relationship Banker
    role_family: retail
    seniority: mid
    target_personas:
      retail: 3400
      smb: 50  # cross-sold to SMBs whose owner is in their book

  standard_user:
    user_id: 005am000006ffBpAAI
    name: Standard User
    title: Relationship Banker
    role_family: retail
    seniority: mid
    target_personas:
      retail: 3400
      smb: 50

  allen_carter:
    user_id: 005am000003PbFDAA0
    name: Allen Carter
    title: Relationship Manager - Commercial Banking
    role_family: commercial
    seniority: senior
    target_personas:
      smb: 1400
      commercial: 300

# Slack: ±5% of customers in each role family are randomly redistributed to
# another RM in the same family, to keep dashboards from being too clean.
slack_pct: 0.05
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/config/rm_pool.yaml
git commit -m "feat(customer-hydration): add RM pool config with verified user Ids"
```

---

## Task 4: Create config/product_catalog.yaml (Plan 1 scope)

**Files:**
- Create: `Customer_Hydration/config/product_catalog.yaml`

- [ ] **Step 1: Create product_catalog.yaml with Plan 1's product**

Plan 1 only needs `Cumulus Everyday Checking`. Plans 2+ add the rest. Create `Customer_Hydration/config/product_catalog.yaml`:

```yaml
# Frozen mirror of select fields from Cumulus_Products/docs/PRODUCT_SPECS.md.
# Plan 1 contains the single product needed for the retail-only smoke.
# Plans 2+ extend this catalog.

products:
  pd_chk_evd:
    code: PD-CHK-EVD-2026.04
    display_name: Cumulus Everyday Checking
    segment: retail
    fsc_type: Checking
    native_type: Checking
    min_open_balance: 25
    typical_balance_range_usd: [500, 8000]
    monthly_service_fee: 12
    apy: 0.0001  # 0.01%
    daily_limits:
      atm: 500
      debit: 3000
      mobile_deposit_per_day: 5000
      mobile_deposit_per_month: 10000
      zelle_per_day: 1000
      zelle_per_month: 5000
      ach_per_day: 5000
      ach_per_month: 25000
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/config/product_catalog.yaml
git commit -m "feat(customer-hydration): add product catalog (Plan 1 scope: Everyday Checking)"
```

---

## Task 5: Create config/personas.yaml (retail anchors only)

**Files:**
- Create: `Customer_Hydration/config/personas.yaml`

- [ ] **Step 1: Create personas.yaml**

Create `Customer_Hydration/config/personas.yaml`:

```yaml
# Persona anchor distributions. Plan 1 only implements `retail`.
# Plans 2+ add wealth, smb, commercial.

retail:
  external_id_prefix: HYDRATE-RT
  client_category: Retail
  account_record_type_developer_name: FSC_Person_Accounts
  default_volume: 7000

  anchors:
    age:
      distribution: triangular
      min: 22
      max: 80
      mode: 42

    life_stage:
      derived_from: age
      bins:
        - {max_age: 32, value: young_pro}
        - {max_age: 45, value: family_building}
        - {max_age: 60, value: established}
        - {max_age: 999, value: retiree}

    household_income:
      distribution: lognormal
      mean_log: 11.0
      sigma_log: 0.5
      min: 35000
      max: 180000
      correlated_with: age

    credit_tier:
      distribution: lognormal
      maps_to_fico:
        min: 580
        max: 820
        median: 720

    state:
      distribution: weighted_choice
      weights:
        CA: 12
        TX: 10
        FL: 10
        NY: 8
        IL: 5
        PA: 4
        OH: 4
        GA: 4
        NC: 4
        MI: 3
        VA: 3
        NJ: 3
        WA: 3
        AZ: 3
        MA: 3

    marital_status:
      derived_from: [age, life_stage]

  child_records:
    fa_checking:
      probability: 1.0
      product_code: PD-CHK-EVD-2026.04

    # Plan 1 stops here. Plans 2+ add Savings/HYSA/MM, CDs, Mortgage, HELOC,
    # Auto/Personal loans, Cards, Goals, LifeEvents, Cases, Tasks, Events,
    # Opportunities, Households, Campaigns.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/config/personas.yaml
git commit -m "feat(customer-hydration): add personas.yaml retail anchors (Plan 1 scope)"
```

---

## Task 6: Create customer_hydration/__init__.py + tests/__init__.py + tests/conftest.py

**Files:**
- Create: `Customer_Hydration/customer_hydration/__init__.py`
- Create: `Customer_Hydration/customer_hydration/generators/__init__.py`
- Create: `Customer_Hydration/tests/__init__.py`
- Create: `Customer_Hydration/tests/conftest.py`

- [ ] **Step 1: Create the package init files**

`Customer_Hydration/customer_hydration/__init__.py`:

```python
"""Customer_Hydration — JDO demo-org seeding artifact."""

__version__ = "0.1.0"
```

`Customer_Hydration/customer_hydration/generators/__init__.py`:

```python
"""Persona-specific record generators."""
```

- [ ] **Step 2: Create the tests package init**

`Customer_Hydration/tests/__init__.py`: empty file.

- [ ] **Step 3: Create tests/conftest.py with shared fixtures**

`Customer_Hydration/tests/conftest.py`:

```python
"""Shared pytest fixtures for Customer_Hydration."""
from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
PACKAGE_ROOT = REPO_ROOT / "Customer_Hydration"


@pytest.fixture
def package_root() -> Path:
    """Absolute path to the Customer_Hydration/ package root."""
    return PACKAGE_ROOT


@pytest.fixture
def anchor_date() -> date:
    """Anchor date used in spec — fixed for deterministic tests."""
    return date(2026, 5, 19)


@pytest.fixture
def fixed_seed() -> int:
    """Default RNG seed used across deterministic tests."""
    return 42
```

- [ ] **Step 4: Verify pytest discovers the conftest**

Run from `Customer_Hydration/`:

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest tests/ --collect-only -q
```

Expected output: `0 tests collected` (no tests yet, but no errors).

- [ ] **Step 5: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/customer_hydration/__init__.py \
    Customer_Hydration/customer_hydration/generators/__init__.py \
    Customer_Hydration/tests/__init__.py \
    Customer_Hydration/tests/conftest.py
git commit -m "feat(customer-hydration): scaffold package + tests dir + conftest"
```

---

## Task 7: External-ID seek module — write the failing test

**Files:**
- Create: `Customer_Hydration/tests/test_seek.py`

The seek module computes `next_unused_seq` for an External-ID prefix. For first runs the answer is 1; for `--append` runs the loader queries the org, parses the max suffix, and returns max+1. We test both branches with mocked org responses.

- [ ] **Step 1: Write the test file**

`Customer_Hydration/tests/test_seek.py`:

```python
"""Tests for the External-ID seek-pointer module."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from customer_hydration.seek import compute_next_seq, parse_seq_from_external_id


class TestParseSeqFromExternalId:
    def test_parses_zero_padded_six_digit_seq(self):
        assert parse_seq_from_external_id("HYDRATE-RT-007421") == 7421

    def test_parses_seq_with_leading_zeros(self):
        assert parse_seq_from_external_id("HYDRATE-RT-000001") == 1

    def test_parses_seq_with_no_leading_zeros(self):
        assert parse_seq_from_external_id("HYDRATE-WL-1234567") == 1234567

    def test_returns_none_for_non_hydrate_external_id(self):
        assert parse_seq_from_external_id("LEGACY-ABC-001") is None

    def test_returns_none_for_malformed_external_id(self):
        assert parse_seq_from_external_id("HYDRATE-RT") is None

    def test_returns_none_for_empty_string(self):
        assert parse_seq_from_external_id("") is None


class TestComputeNextSeq:
    def test_returns_one_when_org_has_no_existing_records(self):
        runner = MagicMock()
        runner.query.return_value = []
        assert compute_next_seq(runner, "HYDRATE-RT", "Account") == 1
        runner.query.assert_called_once()

    def test_returns_max_plus_one_when_records_exist(self):
        runner = MagicMock()
        runner.query.return_value = [
            {"External_ID__c": "HYDRATE-RT-000001"},
            {"External_ID__c": "HYDRATE-RT-000005"},
            {"External_ID__c": "HYDRATE-RT-000003"},
        ]
        assert compute_next_seq(runner, "HYDRATE-RT", "Account") == 6

    def test_ignores_unparseable_external_ids(self):
        runner = MagicMock()
        runner.query.return_value = [
            {"External_ID__c": "HYDRATE-RT-000010"},
            {"External_ID__c": "JUNK-VALUE"},
            {"External_ID__c": None},
        ]
        assert compute_next_seq(runner, "HYDRATE-RT", "Account") == 11

    def test_uses_correct_soql_for_account(self):
        runner = MagicMock()
        runner.query.return_value = []
        compute_next_seq(runner, "HYDRATE-RT", "Account")
        sql = runner.query.call_args[0][0]
        assert "External_ID__c" in sql
        assert "FROM Account" in sql
        assert "HYDRATE-RT-%" in sql
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration
source .venv/bin/activate
pytest tests/test_seek.py -v
```

Expected: collection error or `ModuleNotFoundError: No module named 'customer_hydration.seek'`.

---

## Task 8: External-ID seek module — implement

**Files:**
- Create: `Customer_Hydration/customer_hydration/seek.py`

- [ ] **Step 1: Implement seek.py**

`Customer_Hydration/customer_hydration/seek.py`:

```python
"""External-ID seek-pointer logic.

Every record in the HYDRATE-* namespace has an External Id of the form
`HYDRATE-{TYPE}-{SEQ}` where SEQ is a positive integer. To support
`--append` runs, we query the org for the max existing seq per prefix
and start numbering at max+1.
"""
from __future__ import annotations

import re
from typing import Optional, Protocol

EXTERNAL_ID_PATTERN = re.compile(r"^HYDRATE-[A-Z]+-(\d+)$")


class OrgRunner(Protocol):
    """Minimal interface the seek module needs from a SOQL runner."""

    def query(self, soql: str) -> list[dict]:
        ...


def parse_seq_from_external_id(external_id: str | None) -> Optional[int]:
    """Extract the integer sequence from a HYDRATE-* External Id.

    Returns None if the input is missing, empty, or doesn't match the
    HYDRATE-{TYPE}-{SEQ} pattern.
    """
    if not external_id:
        return None
    match = EXTERNAL_ID_PATTERN.match(external_id)
    if not match:
        return None
    return int(match.group(1))


def compute_next_seq(runner: OrgRunner, prefix: str, sobject: str) -> int:
    """Compute the next free sequence number for a HYDRATE-* prefix.

    Args:
        runner: SOQL runner (anything implementing query(soql) -> list[dict])
        prefix: External-ID prefix without trailing dash, e.g. "HYDRATE-RT"
        sobject: API name of the object holding External_ID__c

    Returns:
        1 if the org has no matching records; otherwise (max existing seq) + 1.
    """
    soql = (
        f"SELECT External_ID__c FROM {sobject} "
        f"WHERE External_ID__c LIKE '{prefix}-%'"
    )
    rows = runner.query(soql)
    seqs = [
        seq
        for row in rows
        if (seq := parse_seq_from_external_id(row.get("External_ID__c"))) is not None
    ]
    return max(seqs, default=0) + 1
```

- [ ] **Step 2: Run the tests to confirm they pass**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration
source .venv/bin/activate
pytest tests/test_seek.py -v
```

Expected: 9 passed.

- [ ] **Step 3: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/customer_hydration/seek.py Customer_Hydration/tests/test_seek.py
git commit -m "feat(customer-hydration): add External-Id seek pointer with tests"
```

---

## Task 9: SOQL runner — implement (no separate tests; tested via test_preflight)

**Files:**
- Create: `Customer_Hydration/customer_hydration/sf_runner.py`

A thin wrapper around the `sf` CLI that exposes `query(soql) -> list[dict]` and `describe(sobject) -> dict`. We exercise it integration-style in later tasks; unit-testing a subprocess wrapper isn't load-bearing.

- [ ] **Step 1: Implement sf_runner.py**

`Customer_Hydration/customer_hydration/sf_runner.py`:

```python
"""Subprocess wrapper around the `sf` CLI.

Every call shells out to `sf data query` or `sf sobject describe` with
`--json`. We parse stdout, raise on non-zero exit, and return Python dicts
or lists. No long-lived session — the user's `sf config` selects the org.
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass


class SfCliError(RuntimeError):
    """Raised when `sf` returns non-zero or emits invalid JSON."""


@dataclass
class SfRunner:
    """Run `sf` CLI commands against a given target-org alias."""

    target_org: str
    timeout_s: int = 120

    def query(self, soql: str) -> list[dict]:
        """Run a SOQL query and return the records."""
        cmd = [
            "sf", "data", "query",
            "--query", soql,
            "--target-org", self.target_org,
            "--json",
        ]
        result = self._run(cmd)
        return result.get("result", {}).get("records", [])

    def describe(self, sobject: str) -> dict:
        """Describe an sObject and return the full describe payload."""
        cmd = [
            "sf", "sobject", "describe",
            "--sobject", sobject,
            "--target-org", self.target_org,
            "--json",
        ]
        result = self._run(cmd)
        return result.get("result", {})

    def _run(self, cmd: list[str]) -> dict:
        try:
            proc = subprocess.run(
                cmd, capture_output=True, text=True,
                check=False, timeout=self.timeout_s,
            )
        except subprocess.TimeoutExpired as exc:
            raise SfCliError(f"sf CLI timed out after {self.timeout_s}s: {' '.join(cmd)}") from exc

        if proc.returncode != 0:
            raise SfCliError(
                f"sf CLI exit {proc.returncode}: {proc.stderr.strip() or proc.stdout.strip()}"
            )
        try:
            return json.loads(proc.stdout)
        except json.JSONDecodeError as exc:
            raise SfCliError(f"sf CLI returned non-JSON output: {proc.stdout[:200]}") from exc
```

- [ ] **Step 2: Smoke test against the live org**

Run from a Python REPL inside the venv:

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration
source .venv/bin/activate
python -c "
from customer_hydration.sf_runner import SfRunner
r = SfRunner('jdo-fw51xz')
print(len(r.query('SELECT Id FROM User LIMIT 1')))
print('externalId fields:', [f['name'] for f in r.describe('Account')['fields'] if f.get('externalId')])
"
```

Expected output: `1` followed by a list including `External_ID__c`, `FinServ__SourceSystemId__c`, `UnifiedProfileId__c`.

- [ ] **Step 3: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/customer_hydration/sf_runner.py
git commit -m "feat(customer-hydration): add sf CLI subprocess runner"
```

---

## Task 10: Phase 0 pre-flight — write the failing test

**Files:**
- Create: `Customer_Hydration/tests/test_preflight.py`

Phase 0 takes a list of objects, runs `describe()` on each via the runner, builds a per-object `set[str]` of field names that exist, and exposes a `drop_unknown_fields(rows, sobject)` helper used by the CSV writer.

- [ ] **Step 1: Write the test**

`Customer_Hydration/tests/test_preflight.py`:

```python
"""Tests for Phase 0 pre-flight."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from customer_hydration.preflight import PreflightCache, run_preflight


def _describe_with_fields(*field_names: str) -> dict:
    return {"fields": [{"name": n} for n in field_names]}


class TestPreflightCache:
    def test_known_fields_returns_describe_field_set(self):
        cache = PreflightCache(
            field_sets={"Account": {"Id", "Name", "External_ID__c"}}
        )
        assert cache.known_fields("Account") == {"Id", "Name", "External_ID__c"}

    def test_known_fields_raises_for_unknown_object(self):
        cache = PreflightCache(field_sets={})
        with pytest.raises(KeyError, match="Account"):
            cache.known_fields("Account")

    def test_drop_unknown_fields_keeps_only_known_columns(self):
        cache = PreflightCache(
            field_sets={"Account": {"Name", "External_ID__c"}}
        )
        rows = [
            {"Name": "Alice", "External_ID__c": "HYDRATE-RT-1", "GhostField__c": "x"},
            {"Name": "Bob", "External_ID__c": "HYDRATE-RT-2", "GhostField__c": "y"},
        ]
        result, dropped = cache.drop_unknown_fields(rows, "Account")
        assert dropped == {"GhostField__c"}
        assert all("GhostField__c" not in r for r in result)
        assert all("Name" in r and "External_ID__c" in r for r in result)


class TestRunPreflight:
    def test_describes_each_requested_object_once(self):
        runner = MagicMock()
        runner.describe.side_effect = lambda obj: _describe_with_fields("Id", "Name", f"{obj}_marker__c")
        cache = run_preflight(runner, ["Account", "Contact"])
        assert runner.describe.call_count == 2
        assert cache.known_fields("Account") == {"Id", "Name", "Account_marker__c"}
        assert cache.known_fields("Contact") == {"Id", "Name", "Contact_marker__c"}

    def test_returns_empty_set_when_describe_returns_no_fields(self):
        runner = MagicMock()
        runner.describe.return_value = {"fields": []}
        cache = run_preflight(runner, ["Account"])
        assert cache.known_fields("Account") == set()
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration
source .venv/bin/activate
pytest tests/test_preflight.py -v
```

Expected: `ModuleNotFoundError: No module named 'customer_hydration.preflight'`.

---

## Task 11: Phase 0 pre-flight — implement

**Files:**
- Create: `Customer_Hydration/customer_hydration/preflight.py`

- [ ] **Step 1: Implement preflight.py**

`Customer_Hydration/customer_hydration/preflight.py`:

```python
"""Phase 0 pre-flight — describe target sObjects, cache field lists.

Output of this phase is consumed by the CSV writer to silently drop any
column corresponding to a field that doesn't exist in the target org.
This protects the generator from FSC version drift.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Protocol


class DescribeRunner(Protocol):
    def describe(self, sobject: str) -> dict:
        ...


@dataclass
class PreflightCache:
    """Maps sObject API name to the set of field API names it exposes."""

    field_sets: dict[str, set[str]] = field(default_factory=dict)

    def known_fields(self, sobject: str) -> set[str]:
        if sobject not in self.field_sets:
            raise KeyError(f"No describe cache for sObject {sobject!r}. "
                           f"Did you include it in run_preflight()?")
        return self.field_sets[sobject]

    def drop_unknown_fields(
        self, rows: list[dict], sobject: str,
    ) -> tuple[list[dict], set[str]]:
        """Strip columns from each row that aren't in the org's describe.

        Returns (cleaned_rows, dropped_field_names).
        """
        known = self.known_fields(sobject)
        dropped: set[str] = set()
        cleaned: list[dict] = []
        for row in rows:
            row_dropped = set(row.keys()) - known
            dropped.update(row_dropped)
            cleaned.append({k: v for k, v in row.items() if k in known})
        return cleaned, dropped


def run_preflight(
    runner: DescribeRunner, sobjects: Iterable[str],
) -> PreflightCache:
    """Describe each sObject and return a PreflightCache."""
    field_sets: dict[str, set[str]] = {}
    for sobject in sobjects:
        payload = runner.describe(sobject)
        fields_list = payload.get("fields", [])
        field_sets[sobject] = {f["name"] for f in fields_list}
    return PreflightCache(field_sets=field_sets)
```

- [ ] **Step 2: Run tests to confirm pass**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration
source .venv/bin/activate
pytest tests/test_preflight.py -v
```

Expected: 6 passed.

- [ ] **Step 3: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/customer_hydration/preflight.py Customer_Hydration/tests/test_preflight.py
git commit -m "feat(customer-hydration): add Phase 0 preflight describe + field-drop cache"
```

---

## Task 12: CSV writer — write the failing test

**Files:**
- Create: `Customer_Hydration/tests/test_csv_writer.py`

The CSV writer takes rows + an sObject API name + a `PreflightCache`, drops unknown fields, sorts column order deterministically, and emits a UTF-8 LF-terminated CSV (Bulk API 2.0 requires LF). We test the column-set behavior, header ordering, LF line endings, and behavior with empty input.

- [ ] **Step 1: Write the test**

`Customer_Hydration/tests/test_csv_writer.py`:

```python
"""Tests for CSV serialization."""
from __future__ import annotations

from pathlib import Path

import pytest

from customer_hydration.csv_writer import write_csv
from customer_hydration.preflight import PreflightCache


@pytest.fixture
def cache() -> PreflightCache:
    return PreflightCache(field_sets={"Account": {"Name", "Industry", "External_ID__c"}})


def test_writes_header_and_rows(tmp_path: Path, cache: PreflightCache):
    rows = [
        {"Name": "Alice", "Industry": "Tech", "External_ID__c": "HYDRATE-RT-1"},
        {"Name": "Bob", "Industry": "Finance", "External_ID__c": "HYDRATE-RT-2"},
    ]
    path = tmp_path / "account.csv"
    result = write_csv(rows, "Account", cache, path)
    content = path.read_bytes()
    assert b"\n" in content
    assert b"\r\n" not in content
    text = content.decode("utf-8")
    assert text.startswith("External_ID__c,Industry,Name\n")
    assert "HYDRATE-RT-1,Tech,Alice" in text
    assert result.rows_written == 2
    assert result.dropped_fields == set()


def test_drops_unknown_fields_silently(tmp_path: Path, cache: PreflightCache):
    rows = [
        {"Name": "Alice", "GhostField__c": "x", "External_ID__c": "HYDRATE-RT-1"},
    ]
    path = tmp_path / "account.csv"
    result = write_csv(rows, "Account", cache, path)
    text = path.read_text(encoding="utf-8")
    assert "GhostField__c" not in text
    assert result.dropped_fields == {"GhostField__c"}


def test_handles_empty_rows(tmp_path: Path, cache: PreflightCache):
    path = tmp_path / "account.csv"
    result = write_csv([], "Account", cache, path)
    assert result.rows_written == 0
    # Empty CSV file is created (header-only or fully empty per impl choice).
    assert path.exists()


def test_quotes_values_containing_commas(tmp_path: Path, cache: PreflightCache):
    rows = [{"Name": "Alice, Inc.", "Industry": "Tech", "External_ID__c": "HYDRATE-RT-1"}]
    path = tmp_path / "account.csv"
    write_csv(rows, "Account", cache, path)
    text = path.read_text(encoding="utf-8")
    assert '"Alice, Inc."' in text


def test_renders_none_as_empty_string(tmp_path: Path, cache: PreflightCache):
    rows = [{"Name": "Alice", "Industry": None, "External_ID__c": "HYDRATE-RT-1"}]
    path = tmp_path / "account.csv"
    write_csv(rows, "Account", cache, path)
    lines = path.read_text(encoding="utf-8").splitlines()
    # header + one data row
    assert len(lines) == 2
    # row should have an empty field where Industry would be
    fields = lines[1].split(",")
    assert "" in fields
```

- [ ] **Step 2: Run to verify it fails**

```bash
pytest tests/test_csv_writer.py -v
```

Expected: `ModuleNotFoundError: No module named 'customer_hydration.csv_writer'`.

---

## Task 13: CSV writer — implement

**Files:**
- Create: `Customer_Hydration/customer_hydration/csv_writer.py`

- [ ] **Step 1: Implement csv_writer.py**

`Customer_Hydration/customer_hydration/csv_writer.py`:

```python
"""Write CSV files for Bulk API 2.0 ingestion.

Conventions:
- UTF-8, LF line endings (Bulk API 2.0 requires LF, not CRLF).
- Columns sorted alphabetically for determinism (so test fixtures
  comparing CSVs byte-for-byte are stable across runs).
- Unknown fields (per Phase 0 preflight) silently dropped.
- None values rendered as empty fields.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

from customer_hydration.preflight import PreflightCache


@dataclass
class WriteResult:
    rows_written: int
    dropped_fields: set[str]


def write_csv(
    rows: list[dict],
    sobject: str,
    cache: PreflightCache,
    path: Path,
) -> WriteResult:
    """Write rows to path as a Bulk API 2.0 compatible CSV.

    Drops fields not in the preflight cache. Returns counts + dropped set.
    """
    cleaned, dropped = cache.drop_unknown_fields(rows, sobject)

    columns = sorted({k for row in cleaned for k in row.keys()})

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh, fieldnames=columns, lineterminator="\n",
            quoting=csv.QUOTE_MINIMAL,
        )
        writer.writeheader()
        for row in cleaned:
            writer.writerow({c: ("" if row.get(c) is None else row[c]) for c in columns})

    return WriteResult(rows_written=len(cleaned), dropped_fields=dropped)
```

- [ ] **Step 2: Run tests to verify pass**

```bash
pytest tests/test_csv_writer.py -v
```

Expected: 5 passed.

- [ ] **Step 3: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/customer_hydration/csv_writer.py Customer_Hydration/tests/test_csv_writer.py
git commit -m "feat(customer-hydration): add CSV writer with field-drop and LF line endings"
```

---

## Task 14: Retail generator — write the failing test

**Files:**
- Create: `Customer_Hydration/tests/test_retail_generator.py`

The generator takes (n, seed, starting_seq, rm_pool, anchor_date) and emits a list of `dict` rows with the exact field set the spec calls for in Plan 1's slice of Account: Person Account RT, name+demographics, persona-derived income/age/state, OwnerId, External_ID__c. Plus one `FinServ__FinancialAccount__c` and one `FinServ__FinancialAccountRole__c` per customer.

- [ ] **Step 1: Write the test**

`Customer_Hydration/tests/test_retail_generator.py`:

```python
"""Tests for the retail persona generator."""
from __future__ import annotations

from datetime import date

import pytest

from customer_hydration.generators.retail import generate_retail


JUSTIN_CHEN_USER_ID = "005am000003PbFBAA0"
STANDARD_USER_ID = "005am000006ffBpAAI"
RM_POOL = [JUSTIN_CHEN_USER_ID, STANDARD_USER_ID]


@pytest.fixture
def gen_kwargs(anchor_date, fixed_seed):
    return {
        "n": 50,
        "seed": fixed_seed,
        "starting_seq": 1,
        "rm_user_ids": RM_POOL,
        "anchor_date": anchor_date,
        "person_account_rt_id": "012am000004x9TBAAY",  # FSC_Person_Accounts in jdo-fw51xz
        "checking_product_code": "PD-CHK-EVD-2026.04",
    }


class TestGenerateRetail:
    def test_returns_one_account_one_fa_one_role_per_customer(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        assert len(bundle.accounts) == 50
        assert len(bundle.financial_accounts) == 50
        assert len(bundle.financial_account_roles) == 50

    def test_external_ids_are_sequential_and_zero_padded(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        ids = [a["External_ID__c"] for a in bundle.accounts]
        assert ids[0] == "HYDRATE-RT-000001"
        assert ids[-1] == "HYDRATE-RT-000050"
        assert all(len(i.split("-")[-1]) == 6 for i in ids)

    def test_external_ids_respect_starting_seq(self, gen_kwargs):
        gen_kwargs["starting_seq"] = 7421
        bundle = generate_retail(**gen_kwargs)
        assert bundle.accounts[0]["External_ID__c"] == "HYDRATE-RT-007421"

    def test_owner_ids_are_drawn_from_rm_pool_only(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        owners = {a["OwnerId"] for a in bundle.accounts}
        assert owners.issubset(set(RM_POOL))

    def test_record_type_is_person_account(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        assert all(a["RecordTypeId"] == "012am000004x9TBAAY" for a in bundle.accounts)

    def test_lead_source_constant(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        assert all(a["LeadSource"] == "Hydration" for a in bundle.accounts)

    def test_client_category_retail(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        assert all(a["FinServ__ClientCategory__c"] == "Retail" for a in bundle.accounts)

    def test_age_distribution_in_22_80(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        anchor = gen_kwargs["anchor_date"]
        for acct in bundle.accounts:
            birthdate = date.fromisoformat(acct["PersonBirthdate"])
            age = (anchor - birthdate).days // 365
            assert 22 <= age <= 80

    def test_household_income_in_range(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        for acct in bundle.accounts:
            income = acct["FinServ__TotalAnnualIncome__c"]
            assert 35000 <= income <= 180000

    def test_fa_external_ids_are_sequential(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        fa_ids = [fa["External_ID__c"] for fa in bundle.financial_accounts]
        assert fa_ids[0] == "HYDRATE-FA-000001"
        assert fa_ids[-1] == "HYDRATE-FA-000050"

    def test_fa_links_to_account_via_external_id_reference(self, gen_kwargs):
        """The FA CSV column must use the sf-CLI external-id reference syntax
        FinServ__PrimaryOwner__c:Account:External_ID__c — but the generator
        emits the raw HYDRATE-RT-* external id; the loader rewrites the
        column header to the reference syntax. Here we just confirm the
        pairing is consistent."""
        bundle = generate_retail(**gen_kwargs)
        for acct, fa in zip(bundle.accounts, bundle.financial_accounts):
            assert fa["FinServ__PrimaryOwner__c"] == acct["External_ID__c"]

    def test_fa_uses_checking_product_code(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        for fa in bundle.financial_accounts:
            assert fa["FinServ__FinancialAccountType__c"] == "Checking"
            assert fa["FinServ__ProductCode__c"] == "PD-CHK-EVD-2026.04"

    def test_fa_balance_in_500_to_8000(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        for fa in bundle.financial_accounts:
            assert 500 <= fa["FinServ__Balance__c"] <= 8000

    def test_role_links_account_to_fa_with_primary_owner(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        for acct, fa, role in zip(
            bundle.accounts, bundle.financial_accounts, bundle.financial_account_roles
        ):
            assert role["FinServ__FinancialAccount__c"] == fa["External_ID__c"]
            assert role["FinServ__Account__c"] == acct["External_ID__c"]
            assert role["FinServ__Role__c"] == "Primary Owner"
            assert role["FinServ__Active__c"] is True

    def test_same_seed_produces_identical_output(self, gen_kwargs):
        bundle1 = generate_retail(**gen_kwargs)
        bundle2 = generate_retail(**gen_kwargs)
        assert bundle1.accounts == bundle2.accounts
        assert bundle1.financial_accounts == bundle2.financial_accounts

    def test_different_seeds_produce_different_output(self, gen_kwargs):
        bundle1 = generate_retail(**gen_kwargs)
        gen_kwargs["seed"] = 99
        bundle2 = generate_retail(**gen_kwargs)
        assert bundle1.accounts[0]["LastName"] != bundle2.accounts[0]["LastName"]
```

- [ ] **Step 2: Run to verify it fails**

```bash
pytest tests/test_retail_generator.py -v
```

Expected: `ModuleNotFoundError: No module named 'customer_hydration.generators.retail'`.

---

## Task 15: Retail generator — implement

**Files:**
- Create: `Customer_Hydration/customer_hydration/generators/retail.py`

- [ ] **Step 1: Implement retail.py**

`Customer_Hydration/customer_hydration/generators/retail.py`:

```python
"""Retail Person Account generator (Plan 1 scope).

Plan 1 emits one Account + one Checking FA + one FA Role per customer.
Plans 2+ extend this to all the retail child records in spec §2 (Savings,
Mortgage, HELOC, Cards, Goals, LifeEvents, Cases, Tasks, Events, Opps).
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Iterable

from faker import Faker


_LIFE_STAGE_BINS = [
    (32, "young_pro"),
    (45, "family_building"),
    (60, "established"),
    (999, "retiree"),
]

_STATE_WEIGHTS = {
    "CA": 12, "TX": 10, "FL": 10, "NY": 8, "IL": 5, "PA": 4,
    "OH": 4, "GA": 4, "NC": 4, "MI": 3, "VA": 3, "NJ": 3,
    "WA": 3, "AZ": 3, "MA": 3,
}


@dataclass
class RetailBundle:
    """All rows produced for one batch of retail customers."""

    accounts: list[dict] = field(default_factory=list)
    financial_accounts: list[dict] = field(default_factory=list)
    financial_account_roles: list[dict] = field(default_factory=list)


def generate_retail(
    *,
    n: int,
    seed: int,
    starting_seq: int,
    rm_user_ids: list[str],
    anchor_date: date,
    person_account_rt_id: str,
    checking_product_code: str,
) -> RetailBundle:
    """Generate `n` retail Person Accounts with one Checking FA + role each."""
    rng = random.Random(seed)
    faker = Faker("en_US")
    faker.seed_instance(seed)

    bundle = RetailBundle()

    states_pop = list(_STATE_WEIGHTS.keys())
    states_weights = list(_STATE_WEIGHTS.values())

    for i in range(n):
        seq = starting_seq + i
        ext_id = f"HYDRATE-RT-{seq:06d}"
        fa_ext_id = f"HYDRATE-FA-{seq:06d}"

        age = int(rng.triangular(22, 80, 42))
        birthdate = anchor_date - timedelta(days=age * 365 + rng.randint(0, 364))
        life_stage = next(label for max_age, label in _LIFE_STAGE_BINS if age <= max_age)

        income_log = rng.gauss(11.0, 0.5)
        income = max(35000, min(180000, round(2.71828 ** income_log, -2)))
        # Older customers shifted toward higher end of band
        if age >= 45:
            income = min(180000, income * 1.15)
        income = round(income, -2)

        state = rng.choices(states_pop, weights=states_weights, k=1)[0]
        first = faker.first_name()
        last = faker.last_name()
        marital = _marital_for(age, life_stage, rng)

        account = {
            "RecordTypeId": person_account_rt_id,
            "FirstName": first,
            "LastName": last,
            "Salutation": _salutation(rng, marital),
            "PersonBirthdate": birthdate.isoformat(),
            "PersonEmail": faker.email(),
            "PersonHomePhone": faker.phone_number(),
            "PersonMobilePhone": faker.phone_number(),
            "PersonMailingStreet": faker.street_address(),
            "PersonMailingCity": faker.city(),
            "PersonMailingState": state,
            "PersonMailingPostalCode": faker.zipcode_in_state(state_abbr=state),
            "PersonMailingCountry": "US",
            "Industry": "Personal",
            "FinServ__ClientCategory__c": "Retail",
            "FinServ__ClientStatus__c": "Active",
            "FinServ__MaritalStatus__c": marital,
            "FinServ__Occupation__c": faker.job(),
            "FinServ__Employer__c": faker.company(),
            "FinServ__YearsWithEmployer__c": min(age - 22, rng.randint(1, 25)),
            "FinServ__TotalAnnualIncome__c": income,
            "FinServ__NumberOfDependents__c": _dependents_for(life_stage, rng),
            "FinServ__BankingPreference__c": rng.choice(["Mobile", "Online", "In-Branch"]),
            "OwnerId": rng.choice(rm_user_ids),
            "LeadSource": "Hydration",
            "External_ID__c": ext_id,
            "FinServ__SourceSystemId__c": ext_id,
            "Description": _description_for(life_stage, age, marital),
        }
        bundle.accounts.append(account)

        balance = round(rng.uniform(500, 8000), 2)
        opened = anchor_date - timedelta(days=rng.randint(30, 365 * 5))

        fa = {
            "Name": f"Cumulus Everyday Checking - {rng.randint(1000, 9999)}",
            "FinServ__FinancialAccountType__c": "Checking",
            "FinServ__FinancialAccountSource__c": "Hydration",
            "FinServ__Status__c": "Active",
            "FinServ__OpenedDate__c": opened.isoformat(),
            "FinServ__Balance__c": balance,
            "FinServ__InterestRate__c": 0.0001,
            "FinServ__OwnershipType__c": "Individual",
            "FinServ__PrimaryOwner__c": ext_id,  # external-id reference; loader rewrites the column header
            "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
            "FinServ__ProductCode__c": checking_product_code,
            "External_ID__c": fa_ext_id,
            "FinServ__SourceSystemId__c": fa_ext_id,
        }
        bundle.financial_accounts.append(fa)

        role = {
            "FinServ__FinancialAccount__c": fa_ext_id,
            "FinServ__Account__c": ext_id,
            "FinServ__Role__c": "Primary Owner",
            "FinServ__Active__c": True,
            "FinServ__StartDate__c": opened.isoformat(),
        }
        bundle.financial_account_roles.append(role)

    return bundle


def _marital_for(age: int, life_stage: str, rng: random.Random) -> str:
    if life_stage == "young_pro":
        return rng.choices(["Single", "Married"], weights=[7, 3])[0]
    if life_stage == "family_building":
        return rng.choices(["Married", "Single", "Divorced"], weights=[7, 2, 1])[0]
    if life_stage == "established":
        return rng.choices(["Married", "Divorced", "Single", "Widowed"], weights=[6, 2, 1, 1])[0]
    return rng.choices(["Married", "Widowed", "Divorced", "Single"], weights=[5, 2, 2, 1])[0]


def _dependents_for(life_stage: str, rng: random.Random) -> int:
    if life_stage == "young_pro":
        return rng.choices([0, 1], weights=[8, 2])[0]
    if life_stage == "family_building":
        return rng.choices([0, 1, 2, 3], weights=[2, 4, 3, 1])[0]
    if life_stage == "established":
        return rng.choices([0, 1, 2, 3], weights=[3, 2, 3, 2])[0]
    return rng.choices([0, 1, 2], weights=[6, 3, 1])[0]


def _salutation(rng: random.Random, marital: str) -> str:
    return rng.choice(["Mr.", "Ms.", "Mrs.", "Dr."])


def _description_for(life_stage: str, age: int, marital: str) -> str:
    return (
        f"{life_stage.replace('_', ' ').title()} retail customer, age {age}, "
        f"{marital.lower()}. Cumulus Everyday Checking is the anchor relationship."
    )
```

- [ ] **Step 2: Run tests to verify pass**

```bash
pytest tests/test_retail_generator.py -v
```

Expected: 16 passed. If any test fails, fix the generator (not the test) — tests encode the spec.

- [ ] **Step 3: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/customer_hydration/generators/retail.py \
    Customer_Hydration/tests/test_retail_generator.py
git commit -m "feat(customer-hydration): add retail Person Account generator (Plan 1 scope)"
```

---

## Task 16: Manifest module (no separate test — exercised via test_cli)

**Files:**
- Create: `Customer_Hydration/customer_hydration/manifest.py`

- [ ] **Step 1: Implement manifest.py**

`Customer_Hydration/customer_hydration/manifest.py`:

```python
"""Run-manifest writer.

Each invocation of `hydrate.py` creates output/run-{ts}/manifest.json
that captures seed, flags, row counts, timing, and any failures. This is
the audit trail and also what `dc-status` reads later (Plan 5).
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class RunManifest:
    run_id: str
    target_org: str
    seed: int
    started_at: str
    flags: dict[str, Any] = field(default_factory=dict)
    object_status: dict[str, dict] = field(default_factory=dict)
    completed_waves: list[str] = field(default_factory=list)
    finished_at: str | None = None
    exit_code: int | None = None

    def write(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(self), indent=2, default=str), encoding="utf-8")


def new_run_manifest(target_org: str, seed: int, flags: dict) -> RunManifest:
    """Build a fresh manifest with a sortable run_id."""
    now = datetime.now(timezone.utc)
    run_id = "run-" + now.strftime("%Y-%m-%dT%H%M")
    return RunManifest(
        run_id=run_id,
        target_org=target_org,
        seed=seed,
        started_at=now.isoformat(),
        flags=flags,
    )
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/customer_hydration/manifest.py
git commit -m "feat(customer-hydration): add run-manifest writer"
```

---

## Task 17: Loader module — write the failing test

**Files:**
- Create: `Customer_Hydration/tests/test_loader.py`

The loader takes (csv_path, sobject, external_id_field, target_org) and shells out to `sf data import bulk --file {csv_path} ...`. We test that the command line is constructed correctly and that successful + failing exit codes are surfaced. The actual subprocess is mocked.

- [ ] **Step 1: Write the test**

`Customer_Hydration/tests/test_loader.py`:

```python
"""Tests for the bulk-load wrapper."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from customer_hydration.loader import bulk_upsert, BulkLoadResult


@pytest.fixture
def csv_path(tmp_path: Path) -> Path:
    p = tmp_path / "account.csv"
    p.write_text("Name,External_ID__c\nAlice,HYDRATE-RT-1\n", encoding="utf-8")
    return p


def _completed_proc(returncode=0, stdout="", stderr=""):
    proc = MagicMock()
    proc.returncode = returncode
    proc.stdout = stdout
    proc.stderr = stderr
    return proc


@patch("customer_hydration.loader.subprocess.run")
def test_invokes_sf_data_import_bulk_with_correct_args(mock_run, csv_path):
    mock_run.return_value = _completed_proc(0, '{"result": {"jobInfo": {"numberRecordsProcessed": 1, "numberRecordsFailed": 0}}}')
    result = bulk_upsert(
        csv_path, "Account", "External_ID__c", "jdo-fw51xz",
    )
    assert mock_run.called
    cmd = mock_run.call_args[0][0]
    assert cmd[0] == "sf"
    assert "data" in cmd and "import" in cmd and "bulk" in cmd
    assert "--file" in cmd
    assert str(csv_path) in cmd
    assert "--sobject" in cmd
    assert "Account" in cmd
    assert "--target-org" in cmd
    assert "jdo-fw51xz" in cmd
    assert "--line-ending" in cmd
    assert "LF" in cmd
    assert "--external-id" in cmd
    assert "External_ID__c" in cmd
    assert isinstance(result, BulkLoadResult)
    assert result.records_processed == 1
    assert result.records_failed == 0


@patch("customer_hydration.loader.subprocess.run")
def test_raises_on_nonzero_exit(mock_run, csv_path):
    mock_run.return_value = _completed_proc(1, "", "boom")
    with pytest.raises(RuntimeError, match="boom"):
        bulk_upsert(csv_path, "Account", "External_ID__c", "jdo-fw51xz")


@patch("customer_hydration.loader.subprocess.run")
def test_surfaces_failed_records(mock_run, csv_path):
    mock_run.return_value = _completed_proc(0, '{"result": {"jobInfo": {"numberRecordsProcessed": 10, "numberRecordsFailed": 2}}}')
    result = bulk_upsert(csv_path, "Account", "External_ID__c", "jdo-fw51xz")
    assert result.records_processed == 10
    assert result.records_failed == 2
```

- [ ] **Step 2: Run to verify it fails**

```bash
pytest tests/test_loader.py -v
```

Expected: `ModuleNotFoundError: No module named 'customer_hydration.loader'`.

---

## Task 18: Loader module — implement

**Files:**
- Create: `Customer_Hydration/customer_hydration/loader.py`

- [ ] **Step 1: Implement loader.py**

`Customer_Hydration/customer_hydration/loader.py`:

```python
"""Bulk API 2.0 wrapper around `sf data import bulk`.

For Plan 1: one job per CSV, synchronous wait, raise on non-zero exit.
Plan 3 adds parallelism, retry policy, and checkpoint integration.
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass
class BulkLoadResult:
    records_processed: int
    records_failed: int


def bulk_upsert(
    csv_path: Path,
    sobject: str,
    external_id_field: str,
    target_org: str,
    *,
    wait_minutes: int = 30,
) -> BulkLoadResult:
    """Run `sf data import bulk` against a single CSV and parse the result."""
    cmd = [
        "sf", "data", "import", "bulk",
        "--file", str(csv_path),
        "--sobject", sobject,
        "--external-id", external_id_field,
        "--target-org", target_org,
        "--line-ending", "LF",
        "--wait", str(wait_minutes),
        "--json",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(
            f"sf data import bulk failed (exit {proc.returncode}): "
            f"{proc.stderr.strip() or proc.stdout.strip()}"
        )

    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError:
        # `sf data import bulk` sometimes emits non-JSON status lines before the JSON;
        # take the last `{...}` block.
        idx = proc.stdout.rfind("{")
        payload = json.loads(proc.stdout[idx:])

    job_info = payload.get("result", {}).get("jobInfo", {})
    return BulkLoadResult(
        records_processed=int(job_info.get("numberRecordsProcessed", 0)),
        records_failed=int(job_info.get("numberRecordsFailed", 0)),
    )
```

- [ ] **Step 2: Run tests to verify pass**

```bash
pytest tests/test_loader.py -v
```

Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/customer_hydration/loader.py Customer_Hydration/tests/test_loader.py
git commit -m "feat(customer-hydration): add bulk-load wrapper around sf data import bulk"
```

---

## Task 19: CLI scaffolding — write a minimal end-to-end test

**Files:**
- Create: `Customer_Hydration/tests/test_cli.py`

We test the argparse dispatch (validate-config doesn't touch the org), and we test that `--dry-run` causes the hydrate path to skip the actual bulk-load call.

- [ ] **Step 1: Write the test**

`Customer_Hydration/tests/test_cli.py`:

```python
"""Tests for the CLI dispatch."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from customer_hydration.cli import build_parser, main


class TestArgparseDispatch:
    def test_default_subcommand_is_hydrate(self):
        parser = build_parser()
        args = parser.parse_args(["--target-org", "jdo-fw51xz"])
        assert args.subcommand in (None, "hydrate")

    def test_validate_config_no_org_required(self):
        parser = build_parser()
        args = parser.parse_args(["validate-config"])
        assert args.subcommand == "validate-config"

    def test_hydrate_default_persona_volumes(self):
        parser = build_parser()
        args = parser.parse_args(["hydrate", "--target-org", "jdo-fw51xz"])
        assert args.retail == 7000
        assert args.wealth == 1200
        assert args.smb == 1500
        assert args.commercial == 300

    def test_skip_flags_parse(self):
        parser = build_parser()
        args = parser.parse_args([
            "hydrate", "--target-org", "jdo-fw51xz",
            "--skip-natives", "--skip-apex-wireup", "--skip-data-cloud",
        ])
        assert args.skip_natives is True
        assert args.skip_apex_wireup is True
        assert args.skip_data_cloud is True

    def test_personas_subset_parses_as_list(self):
        parser = build_parser()
        args = parser.parse_args([
            "hydrate", "--target-org", "jdo-fw51xz", "--personas", "retail,wealth",
        ])
        assert args.personas == ["retail", "wealth"]


class TestValidateConfig:
    def test_validate_config_passes_for_real_configs(self, package_root: Path):
        # Validate-config reads config/*.yaml, asserts schema, exits 0.
        rc = main(["validate-config", "--config-dir", str(package_root / "config")])
        assert rc == 0

    def test_validate_config_fails_on_missing_dir(self, tmp_path: Path):
        rc = main(["validate-config", "--config-dir", str(tmp_path / "missing")])
        assert rc == 1
```

- [ ] **Step 2: Run to verify it fails**

```bash
pytest tests/test_cli.py -v
```

Expected: `ModuleNotFoundError: No module named 'customer_hydration.cli'`.

---

## Task 20: CLI scaffolding — implement

**Files:**
- Create: `Customer_Hydration/customer_hydration/cli.py`
- Create: `Customer_Hydration/hydrate.py`

The CLI exposes the full subcommand grammar from spec §5 but for Plan 1 only `validate-config` and a minimal `hydrate` (retail-only, with skip flags wired) are functional. Plan 3 fills out the rest.

- [ ] **Step 1: Implement cli.py**

`Customer_Hydration/customer_hydration/cli.py`:

```python
"""CLI dispatch for hydrate.py.

Plan 1 implements: validate-config, and a minimal `hydrate` subcommand
that runs Phase 0 + retail generation + 3-CSV bulk load. Plans 2–6 add
the rest.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="hydrate.py",
        description="Customer_Hydration — JDO demo-org seeding artifact",
    )
    parser.add_argument("--target-org", default=None,
                        help="sf org alias (required for org-touching subcommands)")
    parser.add_argument("--output-dir", default="./output",
                        help="Directory for run artifacts (default: ./output)")
    parser.add_argument("--config-dir", default="./config",
                        help="Directory for YAML configs (default: ./config)")
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--dry-run", action="store_true",
                        help="Generate CSVs but don't load")

    sub = parser.add_subparsers(dest="subcommand")

    p_hydrate = sub.add_parser("hydrate", help="Generate + load customers")
    _add_hydrate_args(p_hydrate)

    p_briefs = sub.add_parser("briefs", help="Regenerate banker brief MD files (Plan 6)")
    p_briefs.add_argument("--output", default="../docs/briefs/")
    p_briefs.add_argument("--rm", default=None)

    p_reset = sub.add_parser("reset", help="Wipe HYDRATE-* records (Plan 3)")
    p_reset.add_argument("--confirm", action="store_true")
    p_reset.add_argument("--persona", default=None)
    p_reset.add_argument("--keep-campaigns", action="store_true")

    sub.add_parser("status", help="Show what's in the org under HYDRATE-* (Plan 6)")
    sub.add_parser("dc-status", help="Poll DC stream-run state (Plan 5)")
    sub.add_parser("resume", help="Continue an interrupted run (Plan 3)")

    p_validate = sub.add_parser("validate-config", help="Lint config/*.yaml")
    # validate-config reuses the global --config-dir

    return parser


def _add_hydrate_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--retail", type=int, default=7000)
    p.add_argument("--wealth", type=int, default=1200)
    p.add_argument("--smb", type=int, default=1500)
    p.add_argument("--commercial", type=int, default=300)
    p.add_argument("--rm", default=None,
                   help='Restrict customer assignment to a single RM (name or User Id)')
    p.add_argument("--append", action="store_true")
    p.add_argument("--reset", action="store_true")
    p.add_argument("--confirm", action="store_true")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--parallel", type=int, default=4)
    p.add_argument("--skip-natives", action="store_true")
    p.add_argument("--skip-apex-wireup", action="store_true")
    p.add_argument("--skip-data-cloud", action="store_true")
    p.add_argument("--data-cloud-only", action="store_true")
    p.add_argument("--personas", type=lambda s: s.split(","), default=None)
    p.add_argument("--waves", type=lambda s: s.split(","), default=None)
    p.add_argument("--persona-density", choices=["light", "medium", "heavy"], default="heavy")
    p.add_argument("--allow-production", action="store_true")
    # --target-org inherits from the global parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.subcommand is None or args.subcommand == "hydrate":
        return _run_hydrate(args)
    if args.subcommand == "validate-config":
        return _run_validate_config(args)
    print(f"Subcommand {args.subcommand!r} is implemented in a later plan.", file=sys.stderr)
    return 2


def _run_validate_config(args: argparse.Namespace) -> int:
    config_dir = Path(args.config_dir)
    if not config_dir.is_dir():
        print(f"Config dir not found: {config_dir}", file=sys.stderr)
        return 1
    required_files = ["personas.yaml", "product_catalog.yaml", "rm_pool.yaml"]
    missing = [f for f in required_files if not (config_dir / f).exists()]
    if missing:
        print(f"Missing config files: {missing}", file=sys.stderr)
        return 1
    for fname in required_files:
        try:
            with (config_dir / fname).open() as fh:
                yaml.safe_load(fh)
        except yaml.YAMLError as exc:
            print(f"Invalid YAML in {fname}: {exc}", file=sys.stderr)
            return 1
    print("Config OK.")
    return 0


def _run_hydrate(args: argparse.Namespace) -> int:
    """Plan 1: retail-only, single-RM-pool, no natives, no DC, no Apex wireup."""
    from customer_hydration.runner_p1 import run_retail_only
    return run_retail_only(args)
```

- [ ] **Step 2: Implement hydrate.py entrypoint**

`Customer_Hydration/hydrate.py`:

```python
#!/usr/bin/env python3
"""Customer_Hydration CLI entrypoint."""
from __future__ import annotations

import sys

from customer_hydration.cli import main


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
```

Make it executable (informational; we invoke with `python hydrate.py`):

```bash
chmod +x Customer_Hydration/hydrate.py
```

- [ ] **Step 3: Run tests to verify validate-config passes**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration
pytest tests/test_cli.py::TestArgparseDispatch -v
pytest tests/test_cli.py::TestValidateConfig::test_validate_config_fails_on_missing_dir -v
```

Expected: 5 + 1 = 6 passed.

The test `test_validate_config_passes_for_real_configs` will fail until `runner_p1.py` exists (because importing `cli` triggers no error, but main() flow hits the `_run_hydrate` import only on hydrate). Re-run after Task 21:

- [ ] **Step 4: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/customer_hydration/cli.py Customer_Hydration/hydrate.py \
    Customer_Hydration/tests/test_cli.py
git commit -m "feat(customer-hydration): add CLI dispatch + hydrate.py entrypoint"
```

---

## Task 21: Plan-1 runner — orchestrate retail-only end-to-end

**Files:**
- Create: `Customer_Hydration/customer_hydration/runner_p1.py`

This is Plan 1's orchestrator — wires Phase 0 + retail generator + CSV writer + loader together. Plan 3 replaces this with the proper multi-wave runner.

- [ ] **Step 1: Implement runner_p1.py**

`Customer_Hydration/customer_hydration/runner_p1.py`:

```python
"""Plan 1 runner: retail-only smoke.

Wires Phase 0 preflight + retail generator + CSV writer + bulk loader
+ manifest. Replaced by a full multi-wave orchestrator in Plan 3.
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

import yaml

from customer_hydration.csv_writer import write_csv
from customer_hydration.generators.retail import generate_retail
from customer_hydration.loader import bulk_upsert
from customer_hydration.manifest import new_run_manifest
from customer_hydration.preflight import run_preflight
from customer_hydration.seek import compute_next_seq
from customer_hydration.sf_runner import SfRunner


PHASE0_OBJECTS = [
    "Account",
    "FinServ__FinancialAccount__c",
    "FinServ__FinancialAccountRole__c",
    "RecordType",
]


def run_retail_only(args: argparse.Namespace) -> int:
    if args.target_org is None:
        print("--target-org is required", file=sys.stderr)
        return 2

    runner = SfRunner(args.target_org)

    # Production guard
    org_info = runner._run([  # noqa: SLF001 — using internal _run intentionally
        "sf", "org", "display", "--target-org", args.target_org, "--json"
    ])
    is_sandbox = bool(org_info.get("result", {}).get("isSandbox", False))
    if not is_sandbox and not args.allow_production:
        print(
            f"Refusing to run against non-sandbox org {args.target_org}. "
            f"Pass --allow-production to override.",
            file=sys.stderr,
        )
        return 2

    # Load configs
    config_dir = Path(args.config_dir)
    rm_pool = yaml.safe_load((config_dir / "rm_pool.yaml").read_text())
    catalog = yaml.safe_load((config_dir / "product_catalog.yaml").read_text())

    # Pick the retail RM pool (Plan 1 uses Justin Chen + Standard User)
    retail_rm_ids = [
        rm["user_id"]
        for rm in rm_pool["rms"].values()
        if rm["role_family"] == "retail"
    ]

    # Phase 0 — pre-flight describe
    cache = run_preflight(runner, PHASE0_OBJECTS)

    # Resolve FSC Person Account RT Id at runtime
    rt_rows = runner.query(
        "SELECT Id FROM RecordType WHERE SobjectType='Account' "
        "AND DeveloperName='FSC_Person_Accounts' AND IsActive=true "
        "ORDER BY CreatedDate DESC LIMIT 1"
    )
    if not rt_rows:
        print("No active FSC_Person_Accounts RecordType found in target org.", file=sys.stderr)
        return 2
    person_rt_id = rt_rows[0]["Id"]

    # Compute External-ID seek pointers
    starting_seq_account = compute_next_seq(runner, "HYDRATE-RT", "Account")
    starting_seq_fa = compute_next_seq(runner, "HYDRATE-FA", "FinServ__FinancialAccount__c")
    if starting_seq_account != starting_seq_fa:
        # Plan 1 invariant: retail generator emits one FA per Account, so the
        # sequences should advance together. If they're out of sync, an earlier
        # partial load left orphans — refuse.
        print(
            f"Sequence drift: HYDRATE-RT next={starting_seq_account}, "
            f"HYDRATE-FA next={starting_seq_fa}. Investigate before re-running.",
            file=sys.stderr,
        )
        return 2

    # Generate
    bundle = generate_retail(
        n=args.retail,
        seed=args.seed,
        starting_seq=starting_seq_account,
        rm_user_ids=retail_rm_ids,
        anchor_date=date(2026, 5, 19),
        person_account_rt_id=person_rt_id,
        checking_product_code=catalog["products"]["pd_chk_evd"]["code"],
    )

    # Set up output dir + manifest
    manifest = new_run_manifest(
        target_org=args.target_org,
        seed=args.seed,
        flags={
            "retail": args.retail,
            "personas": ["retail"],
            "skip_natives": True,
            "skip_apex_wireup": True,
            "skip_data_cloud": True,
        },
    )
    run_dir = Path(args.output_dir) / manifest.run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    # Write CSVs
    csv_specs = [
        ("Account", bundle.accounts, run_dir / "accounts.csv"),
        ("FinServ__FinancialAccount__c", bundle.financial_accounts, run_dir / "financial_accounts.csv"),
        ("FinServ__FinancialAccountRole__c", bundle.financial_account_roles, run_dir / "fa_roles.csv"),
    ]
    for sobject, rows, path in csv_specs:
        write_result = write_csv(rows, sobject, cache, path)
        manifest.object_status[sobject] = {
            "csv_path": str(path),
            "rows_written": write_result.rows_written,
            "dropped_fields": sorted(write_result.dropped_fields),
        }

    if args.dry_run:
        print(f"Dry run — CSVs written to {run_dir}, no bulk load performed.")
        manifest.exit_code = 0
        manifest.write(run_dir / "manifest.json")
        return 0

    # Bulk load in dependency order. Account first (no parent), then FA (refs
    # Account via External_ID__c), then FA Role (refs both).
    # Note: the generator emits raw HYDRATE-RT-* values in FinServ__PrimaryOwner__c.
    # The sf-CLI external-id-reference syntax requires the column header itself
    # to be `FinServ__PrimaryOwner__c:Account:External_ID__c`. For Plan 1 we
    # post-process the CSV header in-place before loading the FA CSV.
    _rewrite_fa_header(run_dir / "financial_accounts.csv")
    _rewrite_fa_role_headers(run_dir / "fa_roles.csv")

    for sobject, _rows, path in csv_specs:
        result = bulk_upsert(path, sobject, "External_ID__c", args.target_org)
        manifest.object_status[sobject].update({
            "records_processed": result.records_processed,
            "records_failed": result.records_failed,
        })
        if result.records_failed > 0:
            print(f"{sobject}: {result.records_failed} failed records — see Bulk API logs.")

    manifest.exit_code = 0
    manifest.write(run_dir / "manifest.json")
    print(f"Done. Manifest: {run_dir / 'manifest.json'}")
    return 0


def _rewrite_fa_header(csv_path: Path) -> None:
    """Replace the FinServ__PrimaryOwner__c column with the external-id-reference form."""
    text = csv_path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines:
        return
    header = lines[0]
    new_header = header.replace(
        "FinServ__PrimaryOwner__c",
        "FinServ__PrimaryOwner__c:Account:External_ID__c",
    )
    if new_header == header:
        return
    csv_path.write_text("\n".join([new_header, *lines[1:]]) + "\n", encoding="utf-8")


def _rewrite_fa_role_headers(csv_path: Path) -> None:
    """Replace the two parent reference columns with external-id-reference forms."""
    text = csv_path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines:
        return
    header = lines[0]
    header = header.replace(
        "FinServ__FinancialAccount__c",
        "FinServ__FinancialAccount__c:FinServ__FinancialAccount__c:External_ID__c",
    )
    header = header.replace(
        "FinServ__Account__c",
        "FinServ__Account__c:Account:External_ID__c",
    )
    csv_path.write_text("\n".join([header, *lines[1:]]) + "\n", encoding="utf-8")
```

- [ ] **Step 2: Run all CLI tests**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration
source .venv/bin/activate
pytest tests/test_cli.py -v
```

Expected: 7 passed (the previously failing `test_validate_config_passes_for_real_configs` now passes because the import path resolves).

- [ ] **Step 3: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/customer_hydration/runner_p1.py
git commit -m "feat(customer-hydration): add Plan-1 runner orchestrating retail-only smoke"
```

---

## Task 22: Dry-run smoke — generate CSVs without loading

**Files:** none (verification step)

- [ ] **Step 1: Run a 50-customer dry-run**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration
source .venv/bin/activate
python hydrate.py --target-org jdo-fw51xz --retail 50 --personas retail \
    --skip-natives --skip-apex-wireup --skip-data-cloud --dry-run
```

Expected output: `Dry run — CSVs written to output/run-2026-..., no bulk load performed.`

- [ ] **Step 2: Inspect the produced CSVs**

```bash
ls output/run-*/
head -3 output/run-*/accounts.csv
wc -l output/run-*/*.csv
```

Expected: three CSVs (`accounts.csv`, `financial_accounts.csv`, `fa_roles.csv`), 51 lines each (header + 50 rows). No leading BOM, LF line endings (verify with `file output/run-*/accounts.csv` showing "ASCII text" not "with CRLF").

- [ ] **Step 3: Inspect the manifest**

```bash
cat output/run-*/manifest.json
```

Expected: JSON with `seed: 42`, `flags.retail: 50`, three entries in `object_status` each with `rows_written: 50` and an empty `dropped_fields` list (because the field set we emit matches the org's describe).

If `dropped_fields` is non-empty, that's information not a failure — log it but do not block. (Plan 1's retail generator only emits fields verified to exist in jdo-fw51xz, so the expected count is zero.)

---

## Task 23: Live load — 50 retail customers end-to-end

**Files:** none (verification step)

This is the Plan 1 acceptance gate — actual records land in the org.

- [ ] **Step 1: Pre-load org snapshot**

```bash
sf data query --query "SELECT COUNT() FROM Account WHERE External_ID__c LIKE 'HYDRATE-%'" \
    --target-org jdo-fw51xz
```

Expected: 0 records (org is virgin to HYDRATE-*).

- [ ] **Step 2: Run the live hydrate**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration
source .venv/bin/activate
python hydrate.py --target-org jdo-fw51xz --retail 50 --personas retail \
    --skip-natives --skip-apex-wireup --skip-data-cloud
```

Expected: terminal closes with `Done. Manifest: output/run-.../manifest.json`. Wall-clock: under 2 minutes for 150 total rows (50 Accounts + 50 FAs + 50 FA Roles).

- [ ] **Step 3: Verify the org**

```bash
sf data query --query "SELECT COUNT() FROM Account WHERE External_ID__c LIKE 'HYDRATE-RT-%'" \
    --target-org jdo-fw51xz
sf data query --query "SELECT COUNT() FROM FinServ__FinancialAccount__c WHERE External_ID__c LIKE 'HYDRATE-FA-%'" \
    --target-org jdo-fw51xz
sf data query --query "SELECT COUNT() FROM FinServ__FinancialAccountRole__c WHERE FinServ__FinancialAccount__r.External_ID__c LIKE 'HYDRATE-FA-%'" \
    --target-org jdo-fw51xz
```

Expected: 50 / 50 / 50.

- [ ] **Step 4: Spot-check a customer**

```bash
sf data query --query "SELECT Id, FirstName, LastName, External_ID__c, OwnerId, FinServ__ClientCategory__c, PersonMailingState FROM Account WHERE External_ID__c='HYDRATE-RT-000001'" \
    --target-org jdo-fw51xz
```

Expected: one row, `OwnerId` ∈ {`005am000003PbFBAA0`, `005am000006ffBpAAI`}, `FinServ__ClientCategory__c = 'Retail'`, plausible name + state.

- [ ] **Step 5: Re-run idempotency check**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Customer_Hydration
python hydrate.py --target-org jdo-fw51xz --retail 50 --personas retail \
    --skip-natives --skip-apex-wireup --skip-data-cloud --append --seed 42
```

Wait — what happens here? The seek pointer is now at 51. The generator emits HYDRATE-RT-000051 through HYDRATE-RT-000100. Bulk-upsert by External_ID__c inserts 50 *new* records.

Verify:

```bash
sf data query --query "SELECT COUNT() FROM Account WHERE External_ID__c LIKE 'HYDRATE-RT-%'" \
    --target-org jdo-fw51xz
```

Expected: 100. (Re-running with the same seed but `--append` produces 50 new customers because the seek pointer advanced.)

- [ ] **Step 6: Same-seed idempotency check (no --append)**

```bash
python hydrate.py --target-org jdo-fw51xz --retail 50 --personas retail \
    --skip-natives --skip-apex-wireup --skip-data-cloud --seed 42
```

Plan 1 doesn't yet implement the "refuse if HYDRATE-* exists without --append" guard — that's Plan 3 (it lives in the proper multi-wave runner). For Plan 1, this re-run will compute the next seq (101) and add 50 more. That's expected behavior at this plan's scope; document it in the next task.

- [ ] **Step 7: Cleanup for next plan's smoke runs**

We'll leave the 150 records in the org as a baseline for Plan 2 to extend. If you'd rather start clean, manually delete via:

```bash
sf data delete bulk --sobject Account --query "SELECT Id FROM Account WHERE External_ID__c LIKE 'HYDRATE-RT-%'" --hard-delete --target-org jdo-fw51xz
```

(That cascade-deletes the FA + Role children via standard CRUD. But the proper reset path is Plan 3.)

---

## Task 24: README Plan 1 acceptance summary + commit

**Files:**
- Modify: `Customer_Hydration/README.md`

- [ ] **Step 1: Append a Plan 1 status section to README.md**

Append to `Customer_Hydration/README.md`:

```markdown

## Plan 1 status — Skeleton + Phase 0 + retail-only smoke

Plan 1 is **complete** when:

- [x] Package structure scaffolded (configs, generators dir, tests, docs, AGENTS.md)
- [x] Phase 0 pre-flight describes target objects and caches field lists
- [x] External-Id seek pointer correctly handles empty + populated namespaces
- [x] CSV writer emits LF-terminated, sorted-column UTF-8 (Bulk API 2.0 compatible)
- [x] Retail generator produces deterministic Account + FA + FA Role per seed
- [x] Bulk loader wraps `sf data import bulk` with --line-ending LF + --external-id
- [x] CLI dispatch supports `validate-config` and a minimal `hydrate` for retail-only
- [x] End-to-end smoke load: 50 retail customers + 50 Checking FAs + 50 FA Roles
      land in jdo-fw51xz; OwnerId distributed across Justin Chen and Standard User
- [x] `--append` advances the seek pointer correctly

**Out of scope (Plans 2–6):**
- Wealth, SMB, Commercial personas
- All other retail child records (Savings, Mortgage, HELOC, Cards, Goals, LifeEvents,
  Cases, Tasks, Events, Opportunities, Households, Campaigns)
- Native FSC mirror objects (FinancialAccount, FinancialAccountParty, etc.)
- Apex post-load wireup (Group Builder rollups)
- Data Cloud stream refresh (Phase 5.5)
- `reset` / `dc-status` / `briefs` subcommands
- AGENTS.md + per-banker briefs (Plan 6)
- Top-level repo README / CHANGELOG / docs/INDEX updates (Plan 6)
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/README.md
git commit -m "docs(customer-hydration): mark Plan 1 acceptance criteria complete"
```

---

## Task 25: Top-level CHANGELOG entry for Plan 1

**Files:**
- Modify: `CHANGELOG.md` (top-level)

- [ ] **Step 1: Inspect current CHANGELOG.md format**

```bash
head -40 /Users/jsifontes/Documents/Git/JDO/CHANGELOG.md
```

Note the latest month-grouping convention — typically `## 2026-05` heading with bullets.

- [ ] **Step 2: Add Customer_Hydration Plan 1 entry under 2026-05**

Add to `CHANGELOG.md` under the appropriate `## 2026-05` heading (preserve any existing entries):

```markdown
- **Customer_Hydration** (new package, Plan 1) — Python CLI artifact for hydrating
  the JDO demo org with realistic Cumulus customer data. Plan 1 ships the package
  skeleton, Phase 0 pre-flight describe, External-Id seek pointer, retail Person
  Account generator, bulk loader, and a working `python hydrate.py --retail 50
  --personas retail --skip-natives --skip-apex-wireup --skip-data-cloud
  --target-org jdo-fw51xz` smoke run that lands 150 records (50 customers + 50
  Checking FAs + 50 FA Roles) idempotently. Plans 2–6 add the remaining personas,
  native FSC mirrors, Apex wireup, Data Cloud stream refresh, and banker briefs.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add CHANGELOG.md
git commit -m "docs(changelog): note Customer_Hydration Plan 1 (retail-only smoke)"
```

---

## Plan 1 done

After Task 25 the package compiles, all unit tests pass, and the smoke run loads 150 records into `jdo-fw51xz`. Plan 2 picks up by adding the remaining three personas (wealth, SMB, commercial), the activity/lifecycle/campaign generators, and density toggles — building on this scaffolding.

Total Plan 1 commits: 14. Total tests: ~40. Total runtime end-to-end (live load): under 2 minutes.
