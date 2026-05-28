# Cumulus Plan 0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the shared foundation that unblocks all 13 Cumulus dataset plans — `V_ACCOUNT_ANCHORS` view, the 100-anchor pytest fixture, the `CUMULUS_SYNTH_SHARE` outbound share scaffold, and the `Snowflake_Cumulus_Common/` repo dir holding shared Python helpers.

**Architecture:** Plan 0 produces nothing user-facing — it's pure infrastructure. The view joins the existing `FINS.PUBLIC.MASTER_ACCOUNTS` to `FINSDC3_DATASHARE.schema_Jedi_Snowflake.ssot__Account__dlm` (zero-copy share, already mounted) so the 13 generators can read up-to-date anchor fields without a sync task. The fixture and helpers live in a new sister-project `Snowflake_Cumulus_Common/` so the dataset projects can import from one place.

**Tech Stack:** Snowflake (SQL DDL, sharing), Python 3.11+ (pytest, snowflake-snowpark-python), `snow` CLI v3+, `bash`/`git`.

---

## Spec references

- Source spec: `docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md`
- Sections covered by this plan: §3 (anchor view), §5.1 (shared concerns), §7.5 (shared anchor fixture), §8 (zero-copy egress scaffold), §9 (Plan 0 row)

## Pre-flight (one-time)

Before starting, the engineer should confirm:

```bash
snow --version                         # expect 3.x or higher
snow connection list                   # expect a `GSB13421` (or equivalent) connection that resolves
snow sql -q "SELECT CURRENT_ACCOUNT(), CURRENT_DATABASE(), CURRENT_SCHEMA()"
                                       # expect FINS / PUBLIC
snow sql -q "SHOW SHARES LIKE 'FINSDC3_DATASHARE'"
                                       # expect 1 row, kind=INBOUND
```

If any check fails, see the parent project `Snowflake_CSAT_NPS/AGENTS.md` for connection setup and re-run before continuing. Do NOT proceed past this gate.

## File Structure

```
Snowflake_Cumulus_Common/                          ← NEW sister-project
├── README.md                                       ← Task 1
├── AGENTS.md                                       ← Task 1
├── schemas/
│   └── v_account_anchors.sql                       ← Task 2
├── shares/
│   └── cumulus_synth_share.sql                     ← Task 8
├── cumulus_common/
│   ├── __init__.py                                 ← Task 3
│   ├── seed.py                                     ← Task 4 (deterministic hash seed)
│   └── coverage.py                                 ← Task 5 (assertion helper used by every SP)
└── tests/
    ├── conftest.py                                 ← Task 6
    ├── fixtures/
    │   └── sample_anchors.py                       ← Task 7 (100 anchor rows)
    ├── test_seed.py                                ← Task 4
    └── test_coverage.py                            ← Task 5
```

**Why one common project:** the 13 dataset plans each create their own `Snowflake_<Vendor>_<Topic>/` dir but reuse the seed function, the coverage assertion, and the anchor fixture. Putting them in `Snowflake_Cumulus_Common/` (one place) keeps DRY and prevents 13 copies drifting.

---

## Task 1: Scaffold `Snowflake_Cumulus_Common/` repo dir

**Files:**
- Create: `Snowflake_Cumulus_Common/README.md`
- Create: `Snowflake_Cumulus_Common/AGENTS.md`
- Create: `Snowflake_Cumulus_Common/.gitignore`

- [ ] **Step 1: Create the directory tree**

```bash
cd /Users/jsifontes/Documents/Git/JDO
mkdir -p Snowflake_Cumulus_Common/schemas
mkdir -p Snowflake_Cumulus_Common/shares
mkdir -p Snowflake_Cumulus_Common/cumulus_common
mkdir -p Snowflake_Cumulus_Common/tests/fixtures
```

- [ ] **Step 2: Write `Snowflake_Cumulus_Common/README.md`**

```markdown
# Snowflake Cumulus Common

Shared infrastructure for the 13 Cumulus dataset pipelines. Owns:

- `FINS.PUBLIC.V_ACCOUNT_ANCHORS` — the shared anchor view (`schemas/v_account_anchors.sql`)
- `FINS.PUBLIC.CUMULUS_SYNTH_SHARE` — the outbound zero-copy share to Data Cloud (`shares/cumulus_synth_share.sql`)
- `cumulus_common.seed` — deterministic per-row seed function used by all 13 generators
- `cumulus_common.coverage` — coverage-assertion helper used by all 13 generators
- `tests/fixtures/sample_anchors.py` — 100-row pytest fixture (50 person + 50 business) used by every dataset's L1 tests

See the umbrella spec at `../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md`.

## Sibling pipelines (consumers)

- `Snowflake_Claritas_Demographics/` (Plan 1)
- `Snowflake_DnB_BusinessCredit/` (Plan 3)
- `Snowflake_MoneyGuidePro_Plans/` (Plan 8)
- `Snowflake_Plaid_HeldAway/` (Plan 6)
- `Snowflake_CoreLogic_Property/` (Plan 5)
- `Snowflake_WorldCheck_AML/` (Plan 7)
- `Snowflake_Synth_RelationshipGraph/` (Plan 9)
- `Snowflake_BoardEx_ExecIntel/` (Plan 10)
- `Snowflake_ZoomInfo_Firmographics/` (Plan 11)
- `Snowflake_Gong_CallSentiment/` (Plan 12)
- `Snowflake_MSCI_ESG/` (Plan 2)
- `Snowflake_Esri_GeoFootprint/` (Plan 4)
- `Snowflake_Moodys_MarketContext/` (Plan 13)

## Layout

\`\`\`
schemas/             — Snowflake DDL (views, tables)
shares/              — Outbound share definitions
cumulus_common/      — Reusable Python helpers
tests/               — pytest tests + fixture
\`\`\`

## Running tests

\`\`\`bash
cd Snowflake_Cumulus_Common
python -m venv .venv && source .venv/bin/activate
pip install pytest snowflake-snowpark-python
pytest tests/ -v
\`\`\`

## Deploying

\`\`\`bash
# View
snow sql -f schemas/v_account_anchors.sql

# Outbound share scaffold
snow sql -f shares/cumulus_synth_share.sql
\`\`\`
```

- [ ] **Step 3: Write `Snowflake_Cumulus_Common/AGENTS.md`**

```markdown
# AGENTS.md — Snowflake_Cumulus_Common

This sister-project owns the shared infrastructure for all 13 Cumulus dataset pipelines.
Pattern mirrors `Snowflake_CSAT_NPS/`.

## Boundaries

- Owns: `FINS.PUBLIC.V_ACCOUNT_ANCHORS`, `FINS.PUBLIC.CUMULUS_SYNTH_SHARE`, `cumulus_common` Python pkg, shared anchor fixture.
- Does NOT own: any dataset table, any generator SP, any TASK definition. Those live in the per-dataset sister-projects.

## Conventions

- DDL for shared objects goes in `schemas/` (views) or `shares/` (shares).
- Python helpers go under `cumulus_common/` and are importable as `from cumulus_common.seed import seed_for`.
- Every helper has a pytest test alongside in `tests/`.
- Snowflake objects use the schema-qualified form `FINS.PUBLIC.<NAME>` in DDL — never rely on session schema.

## Gotchas

- `V_ACCOUNT_ANCHORS` reads from the `FINSDC3_DATASHARE` inbound share. If a column rename happens upstream, the view fails to compile — re-deploy with the new column name.
- `MASTER_ACCOUNTS.SNAPSHOT_DATE` only carries today's roster; the view's `WHERE SNAPSHOT_DATE = MAX(...)` clause pins to that. Don't change without thinking through historical-cohort generators (none exist yet).
- Per-dataset salts in the seed function are NOT optional — without them, two datasets seeded only by ACCOUNT_ID produce correlated random draws (same accounts skew the same direction in every dataset).

## Tests

\`\`\`bash
pytest tests/ -v        # L1 only — pure-function tests
\`\`\`

L2 integration runs in CI per dataset (no integration tests live here, since this dir owns no generator).
```

- [ ] **Step 4: Write `.gitignore`**

```
__pycache__/
*.pyc
.venv/
.pytest_cache/
*.egg-info/
```

- [ ] **Step 5: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Snowflake_Cumulus_Common/README.md Snowflake_Cumulus_Common/AGENTS.md Snowflake_Cumulus_Common/.gitignore
git commit -m "feat(cumulus): scaffold Snowflake_Cumulus_Common sister-project"
```

---

## Task 2: Create `V_ACCOUNT_ANCHORS` view DDL

**Files:**
- Create: `Snowflake_Cumulus_Common/schemas/v_account_anchors.sql`

- [ ] **Step 1: Probe the actual columns on the shared `ssot__Account__dlm`**

Schemas drift, so verify the column names before hard-coding them.

Run:
```bash
snow sql -q "
SELECT COLUMN_NAME, DATA_TYPE
FROM FINSDC3_DATASHARE.INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'schema_Jedi_Snowflake' AND TABLE_NAME = 'ssot__Account__dlm'
  AND COLUMN_NAME IN (
    'ssot__Id__c', 'FinServ_ClientCategory_c__c', 'PersonBirthdate__c',
    'FinServ_AnnualIncome_pc__c', 'FinServ_CreditScore_c__c',
    'ssot__PrimaryIndustry__c', 'ssot__AnnualRevenueAmount__c',
    'ssot__EmployeeCount__c', 'ssot__ContactPointAddressId__c',
    'External_ID_c__c'
  )
ORDER BY COLUMN_NAME"
```

Expected: 10 rows, one per column. If any column is missing, halt — check the upstream Phase 4 backfill committed before re-running. Save the output to `output/plan-0-anchor-probe.json`:

```bash
mkdir -p output
snow sql --format json -q "
SELECT COLUMN_NAME, DATA_TYPE
FROM FINSDC3_DATASHARE.INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'schema_Jedi_Snowflake' AND TABLE_NAME = 'ssot__Account__dlm'
ORDER BY COLUMN_NAME" > output/plan-0-anchor-probe.json
```

- [ ] **Step 2: Confirm address fields on `ssot__Account__dlm`**

The address DMO `ssot__ContactPointAddress__dlm` is **not** in the `FINSDC3_DATASHARE` inbound share. Address fields are sourced denormalized from `ssot__Account__dlm` directly. Confirm the columns exist:

```bash
snow sql -q "
SELECT COLUMN_NAME, DATA_TYPE
FROM FINSDC3_DATASHARE.INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'schema_Jedi_Snowflake' AND TABLE_NAME = 'ssot__Account__dlm'
  AND COLUMN_NAME IN (
    'PersonMailingPostalCode__c','PersonMailingState__c','PersonMailingCountry__c',
    'BillingPostalCode__c','BillingState__c','BillingCountry__c'
  )
ORDER BY COLUMN_NAME"
```

Expected: 6 rows. If any are missing, halt — the schema has drifted further than this plan anticipates.

- [ ] **Step 3: Write the view DDL**

Create `Snowflake_Cumulus_Common/schemas/v_account_anchors.sql`:

```sql
-- =============================================================================
-- FINS.PUBLIC.V_ACCOUNT_ANCHORS
-- Shared anchor view — joins MASTER_ACCOUNTS to the inbound DC datashare
-- so all 13 Cumulus generators read live anchor fields without a sync task.
-- =============================================================================
-- Source: spec at docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md §3
--
-- Pinning: WHERE SNAPSHOT_DATE = MAX(...) keeps the view to today's roster
-- so generators see today's account list, not a historical Cartesian product.
--
-- INNER JOIN: an account in the view *means* anchors are real. Accounts in
-- MASTER_ACCOUNTS but not yet in the share are invisible to all generators
-- by design (refresh lag handling).
--
-- LEFT JOIN address: a missing ZIP still lets a row through for non-geo
-- datasets. Geo-scoped datasets filter via WHERE POSTAL_CODE IS NOT NULL.
-- =============================================================================

CREATE OR REPLACE VIEW FINS.PUBLIC.V_ACCOUNT_ANCHORS AS
SELECT
    ma.ACCOUNT_ID,
    ma.ACCOUNT_NAME,
    ma.SNAPSHOT_DATE,

    -- Type discriminators
    a.FinServ_ClientCategory_c__c               AS CLIENT_CATEGORY,
    CASE WHEN a.PersonBirthdate__c IS NOT NULL
         THEN 'PERSON' ELSE 'BUSINESS' END      AS ACCOUNT_TYPE_FLAG,

    -- Person anchors
    a.PersonBirthdate__c                        AS BIRTHDATE,
    a.FinServ_AnnualIncome_pc__c                AS ANNUAL_INCOME,
    a.FinServ_CreditScore_c__c                  AS CREDIT_SCORE,

    -- Business anchors
    a.ssot__PrimaryIndustry__c                  AS INDUSTRY,
    a.ssot__AnnualRevenueAmount__c              AS ANNUAL_REVENUE,
    a.ssot__EmployeeCount__c                    AS EMPLOYEE_COUNT,

    -- Geo anchor — address DMO not in share; pull denormalized fields off Account.
    -- PersonMailing* is populated for persons; Billing* for businesses.
    COALESCE(a."PersonMailingPostalCode__c", a."BillingPostalCode__c")  AS POSTAL_CODE,
    COALESCE(a."PersonMailingState__c",      a."BillingState__c")       AS STATE_CODE,
    COALESCE(a."PersonMailingCountry__c",    a."BillingCountry__c")     AS COUNTRY_CODE,

    -- Namespace flag
    a."External_ID_c__c"                        AS EXTERNAL_ID

FROM FINS.PUBLIC.MASTER_ACCOUNTS ma
INNER JOIN FINSDC3_DATASHARE."schema_Jedi_Snowflake"."ssot__Account__dlm" a
        ON a."ssot__Id__c" = ma.ACCOUNT_ID
WHERE ma.SNAPSHOT_DATE = (SELECT MAX(SNAPSHOT_DATE) FROM FINS.PUBLIC.MASTER_ACCOUNTS);

-- Smoke check: every active account should appear with non-null anchors.
-- (Documented expectation, not enforced.)
COMMENT ON VIEW FINS.PUBLIC.V_ACCOUNT_ANCHORS IS
'Shared anchor view for the 13 Cumulus dataset generators. One row per active account from MASTER_ACCOUNTS, joined to the inbound FINSDC3_DATASHARE share so anchor fields stay live without a sync task. See docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md §3.';
```

Note: identifiers in the share have mixed-case names like `ssot__Id__c`, so they must be double-quoted. The `FINS.PUBLIC.*` side is unquoted because Snowflake stores those identifiers upper-cased.

- [ ] **Step 4: Deploy the view**

```bash
snow sql -f Snowflake_Cumulus_Common/schemas/v_account_anchors.sql
```

Expected output: `View V_ACCOUNT_ANCHORS successfully created.`

- [ ] **Step 5: Smoke-check the view returns rows**

```bash
snow sql -q "SELECT COUNT(*) AS ANCHOR_ROWS, COUNT(DISTINCT ACCOUNT_ID) AS DISTINCT_ACCOUNTS FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS"
```

Expected: `ANCHOR_ROWS == DISTINCT_ACCOUNTS` (no duplicates). Both should be roughly the same as `SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.MASTER_ACCOUNTS WHERE SNAPSHOT_DATE = (SELECT MAX(SNAPSHOT_DATE) FROM FINS.PUBLIC.MASTER_ACCOUNTS)`. The two should match within a small drift (≤1%) caused by share refresh lag — if the gap is larger than 1%, the inbound share refresh is stuck; halt and investigate before continuing.

- [ ] **Step 6: Smoke-check the type discriminator counts**

```bash
snow sql -q "
SELECT ACCOUNT_TYPE_FLAG, COUNT(*) AS N
FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS
GROUP BY 1"
```

Expected: 2 rows (`PERSON` and `BUSINESS`), with PERSON ≈ 30K-32K and BUSINESS ≈ 4K-6K (per Customer_Hydration Phase 4 baseline). If either bucket is unexpectedly empty, halt — there's a column-rename or schema-drift issue.

- [ ] **Step 7: Commit**

```bash
git add Snowflake_Cumulus_Common/schemas/v_account_anchors.sql output/plan-0-anchor-probe.json
git commit -m "feat(cumulus): add V_ACCOUNT_ANCHORS shared view"
```

---

## Task 3: Initialize the `cumulus_common` Python package

**Files:**
- Create: `Snowflake_Cumulus_Common/cumulus_common/__init__.py`
- Create: `Snowflake_Cumulus_Common/pyproject.toml`

- [ ] **Step 1: Write `cumulus_common/__init__.py`**

```python
"""Shared helpers used by every Cumulus dataset generator.

Exports:
    seed_for(account_id, dataset_salt, run_ts) -> bytes  — deterministic 32-byte seed
    assert_coverage(session, table, expected, actual_sql) — fail loud on coverage gap

See docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md.
"""

from .seed import seed_for
from .coverage import assert_coverage

__all__ = ["seed_for", "assert_coverage"]
__version__ = "0.1.0"
```

- [ ] **Step 2: Write `pyproject.toml`**

```toml
[project]
name = "cumulus-common"
version = "0.1.0"
description = "Shared helpers for the Cumulus Snowflake dataset pipelines."
requires-python = ">=3.11"
dependencies = []

[project.optional-dependencies]
dev = ["pytest>=8.0", "snowflake-snowpark-python>=1.20"]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
include = ["cumulus_common*"]
```

- [ ] **Step 3: Verify package is importable**

```bash
cd Snowflake_Cumulus_Common
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
python -c "import cumulus_common; print(cumulus_common.__version__)"
```

Expected output: `0.1.0`. (The `seed_for` and `assert_coverage` imports will fail until Tasks 4 and 5 — that's fine; we'll re-verify there.)

Actually — the imports at the top of `__init__.py` will fail right now because the modules don't exist. Edit `__init__.py` to comment out the imports temporarily:

```python
"""Shared helpers used by every Cumulus dataset generator.

See docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md.
"""

# Re-enabled in Tasks 4 (seed) and 5 (coverage)
# from .seed import seed_for
# from .coverage import assert_coverage

__all__: list[str] = []
__version__ = "0.1.0"
```

Re-run the import check; it should now print `0.1.0` cleanly.

- [ ] **Step 4: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Snowflake_Cumulus_Common/cumulus_common/__init__.py Snowflake_Cumulus_Common/pyproject.toml
git commit -m "feat(cumulus): scaffold cumulus_common package"
```

---

## Task 4: Implement `cumulus_common.seed.seed_for`

The seed function is the single source of determinism for all 13 generators. Per-dataset salts make each dataset's random distribution independent.

**Files:**
- Create: `Snowflake_Cumulus_Common/cumulus_common/seed.py`
- Create: `Snowflake_Cumulus_Common/tests/test_seed.py`

- [ ] **Step 1: Write the failing test**

Create `Snowflake_Cumulus_Common/tests/test_seed.py`:

```python
"""L1 tests for the deterministic seed function."""
from datetime import datetime
import pytest

from cumulus_common.seed import seed_for


def test_seed_is_deterministic():
    """Same (account, salt, ts) → same bytes."""
    a = seed_for("ACCT-001", "claritas", datetime(2026, 5, 1))
    b = seed_for("ACCT-001", "claritas", datetime(2026, 5, 1))
    assert a == b
    assert isinstance(a, bytes)
    assert len(a) == 32  # SHA-256 digest


def test_seed_differs_across_accounts():
    """Same salt + ts, different account → different seed."""
    a = seed_for("ACCT-001", "claritas", datetime(2026, 5, 1))
    b = seed_for("ACCT-002", "claritas", datetime(2026, 5, 1))
    assert a != b


def test_seed_differs_across_datasets():
    """Same account + ts, different dataset salt → different seed.

    This is the load-bearing property — without it, two datasets seeded
    only by ACCOUNT_ID produce correlated random draws.
    """
    a = seed_for("ACCT-001", "claritas", datetime(2026, 5, 1))
    b = seed_for("ACCT-001", "dnb", datetime(2026, 5, 1))
    assert a != b


def test_seed_buckets_by_year_month_only():
    """Different days within a month → SAME seed.

    A monthly generator should produce the same row whether re-run on
    May 1 or May 17. Different month → different seed.
    """
    a = seed_for("ACCT-001", "claritas", datetime(2026, 5, 1))
    b = seed_for("ACCT-001", "claritas", datetime(2026, 5, 17))
    c = seed_for("ACCT-001", "claritas", datetime(2026, 6, 1))
    assert a == b
    assert a != c


def test_seed_handles_unicode_account_ids():
    """Account IDs may contain non-ASCII; seed must not crash."""
    a = seed_for("ACCT-Δ-001", "claritas", datetime(2026, 5, 1))
    assert isinstance(a, bytes) and len(a) == 32


def test_seed_rejects_empty_salt():
    """An empty salt would silently make the salt useless. Fail loud."""
    with pytest.raises(ValueError, match="dataset_salt must be non-empty"):
        seed_for("ACCT-001", "", datetime(2026, 5, 1))


def test_seed_rejects_empty_account_id():
    """Empty account_id would collapse all accounts to the same seed. Fail loud."""
    with pytest.raises(ValueError, match="account_id must be non-empty"):
        seed_for("", "claritas", datetime(2026, 5, 1))
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd Snowflake_Cumulus_Common
source .venv/bin/activate
pytest tests/test_seed.py -v
```

Expected: 7 failures (`ModuleNotFoundError: No module named 'cumulus_common.seed'`).

- [ ] **Step 3: Implement `cumulus_common/seed.py`**

```python
"""Deterministic per-row seed for Cumulus generators.

The single source of pseudorandom-but-deterministic seeds: every generator
calls `seed_for(account_id, dataset_salt, run_ts)` to get a 32-byte SHA-256
digest. Use the bytes as input to `random.Random(seed)` or directly with
`int.from_bytes` to derive deterministic field values.

Per-dataset salts make each dataset's distribution independent — without
them, two datasets seeded only by ACCOUNT_ID produce correlated random
draws (the same accounts skewing the same direction in every dataset).

Bucketing on year-month means a monthly generator re-run mid-month produces
the same row as the original run — idempotency by construction.
"""
from __future__ import annotations

import hashlib
from datetime import datetime


def seed_for(account_id: str, dataset_salt: str, run_ts: datetime) -> bytes:
    """Return the deterministic 32-byte seed for one (account, dataset, month).

    Args:
        account_id: The Salesforce Account ID, non-empty.
        dataset_salt: Per-dataset salt, e.g. ``"claritas"``, ``"dnb"``. Non-empty.
        run_ts: The execution timestamp; only year/month are used.

    Returns:
        A 32-byte SHA-256 digest. Stable across processes, machines, Python versions.

    Raises:
        ValueError: if ``account_id`` or ``dataset_salt`` is empty.
    """
    if not account_id:
        raise ValueError("account_id must be non-empty")
    if not dataset_salt:
        raise ValueError("dataset_salt must be non-empty")

    key = f"{account_id}|{dataset_salt}|{run_ts:%Y-%m}"
    return hashlib.sha256(key.encode("utf-8")).digest()
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
pytest tests/test_seed.py -v
```

Expected: 7 passed.

- [ ] **Step 5: Re-enable the export in `__init__.py`**

Edit `Snowflake_Cumulus_Common/cumulus_common/__init__.py` — uncomment the seed import:

```python
"""Shared helpers used by every Cumulus dataset generator.

See docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md.
"""

from .seed import seed_for
# Re-enabled in Task 5
# from .coverage import assert_coverage

__all__ = ["seed_for"]
__version__ = "0.1.0"
```

Verify:

```bash
python -c "from cumulus_common import seed_for; print(seed_for('A','claritas',__import__('datetime').datetime(2026,5,1)).hex()[:16])"
```

Expected: a 16-char hex string (the first 8 bytes of the digest), printed cleanly.

- [ ] **Step 6: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Snowflake_Cumulus_Common/cumulus_common/seed.py Snowflake_Cumulus_Common/cumulus_common/__init__.py Snowflake_Cumulus_Common/tests/test_seed.py
git commit -m "feat(cumulus): deterministic seed_for() with per-dataset salt"
```

---

## Task 5: Implement `cumulus_common.coverage.assert_coverage`

Every generator's step 4 (coverage assertion) calls this helper. Centralizing it keeps the failure message consistent (`"coverage gap: N missing rows"`) so the daily-email taxonomy in spec §6.2 works.

**Files:**
- Create: `Snowflake_Cumulus_Common/cumulus_common/coverage.py`
- Create: `Snowflake_Cumulus_Common/tests/test_coverage.py`

- [ ] **Step 1: Write the failing test**

Create `Snowflake_Cumulus_Common/tests/test_coverage.py`:

```python
"""L1 tests for the coverage assertion helper.

We mock the snowpark Session so this is a pure-function test.
"""
from unittest.mock import MagicMock
import pytest

from cumulus_common.coverage import assert_coverage


def _mock_session(values):
    """Build a session whose .sql(...).collect()[0][0] returns values in order."""
    session = MagicMock()
    calls = iter(values)
    def sql(_sql_str):
        result = MagicMock()
        result.collect.return_value = [(next(calls),)]
        return result
    session.sql.side_effect = sql
    return session


def test_assert_coverage_passes_when_actual_equals_expected():
    """100 expected, 100 actual → no error."""
    session = _mock_session([100, 100])  # expected_sql returns 100, actual_sql returns 100
    assert_coverage(
        session,
        expected_sql="SELECT COUNT(*) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE ACCOUNT_TYPE_FLAG='PERSON'",
        actual_sql="SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.CLARITAS_DEMOGRAPHICS",
    )  # no raise


def test_assert_coverage_passes_when_actual_exceeds_expected():
    """If we wrote MORE rows than expected (e.g. 1:N tables), still passes."""
    session = _mock_session([100, 250])
    assert_coverage(
        session,
        expected_sql="SELECT COUNT(*) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE ...",
        actual_sql="SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.PLAID_HELD_AWAY",
    )  # no raise


def test_assert_coverage_fails_with_canonical_message_format():
    """Coverage gap → RuntimeError with 'coverage gap: N missing rows' prefix."""
    session = _mock_session([100, 95])
    with pytest.raises(RuntimeError, match=r"^coverage gap: 5 missing rows"):
        assert_coverage(
            session,
            expected_sql="SELECT COUNT(*) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE ACCOUNT_TYPE_FLAG='PERSON'",
            actual_sql="SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.CLARITAS_DEMOGRAPHICS",
        )


def test_assert_coverage_message_includes_expected_and_actual():
    """The error message should include both numbers for debugging."""
    session = _mock_session([1000, 800])
    with pytest.raises(RuntimeError) as exc_info:
        assert_coverage(
            session,
            expected_sql="SELECT 1000",
            actual_sql="SELECT 800",
        )
    msg = str(exc_info.value)
    assert "1000" in msg
    assert "800" in msg
    assert msg.startswith("coverage gap:")


def test_assert_coverage_zero_audience_is_not_a_gap():
    """Empty audience (0 expected, 0 actual) is the empty-audience warning case,
    not a coverage gap. The SP handles the warning separately; this helper
    just shouldn't raise."""
    session = _mock_session([0, 0])
    assert_coverage(
        session,
        expected_sql="SELECT 0",
        actual_sql="SELECT 0",
    )  # no raise
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
pytest tests/test_coverage.py -v
```

Expected: 5 failures (`ModuleNotFoundError`).

- [ ] **Step 3: Implement `cumulus_common/coverage.py`**

```python
"""Coverage assertion shared by every Cumulus dataset generator.

The canonical assertion: after MERGE-ing data into a dataset table,
verify that every account in the audience has at least one row. If
fewer accounts have rows than the audience size, raise RuntimeError
with a message matching ``coverage gap: N missing rows ...`` so the
daily email taxonomy (spec §6.2) can filter on the prefix.

Used by every dataset's stored procedure step 4.
"""
from __future__ import annotations

from typing import Any


def assert_coverage(session: Any, expected_sql: str, actual_sql: str) -> None:
    """Verify ``actual_sql`` returns at least ``expected_sql`` rows.

    Args:
        session: A snowflake.snowpark.Session (or duck type with
            ``session.sql(query).collect()`` returning a list of rows).
        expected_sql: A SQL string returning the audience cardinality
            (one int in row 0, column 0).
        actual_sql: A SQL string returning the realized row cardinality
            in the dataset table (one int in row 0, column 0).

    Raises:
        RuntimeError: if ``actual < expected``. Message format is
            ``"coverage gap: <missing> missing rows (expected <e>, got <a>)"``
            so the email taxonomy can filter on the ``"coverage gap:"`` prefix.
    """
    expected = session.sql(expected_sql).collect()[0][0]
    actual = session.sql(actual_sql).collect()[0][0]
    if actual < expected:
        missing = expected - actual
        raise RuntimeError(
            f"coverage gap: {missing} missing rows (expected {expected}, got {actual})"
        )
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
pytest tests/test_coverage.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Re-enable the export in `__init__.py`**

Edit `Snowflake_Cumulus_Common/cumulus_common/__init__.py`:

```python
"""Shared helpers used by every Cumulus dataset generator.

See docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md.
"""

from .seed import seed_for
from .coverage import assert_coverage

__all__ = ["seed_for", "assert_coverage"]
__version__ = "0.1.0"
```

Verify:

```bash
python -c "from cumulus_common import seed_for, assert_coverage; print('ok')"
```

Expected output: `ok`.

- [ ] **Step 6: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Snowflake_Cumulus_Common/cumulus_common/coverage.py Snowflake_Cumulus_Common/cumulus_common/__init__.py Snowflake_Cumulus_Common/tests/test_coverage.py
git commit -m "feat(cumulus): assert_coverage helper with canonical message format"
```

---

## Task 6: Set up pytest `conftest.py` for shared fixtures

**Files:**
- Create: `Snowflake_Cumulus_Common/tests/conftest.py`
- Create: `Snowflake_Cumulus_Common/tests/__init__.py` (empty, makes `tests/` importable)
- Create: `Snowflake_Cumulus_Common/tests/fixtures/__init__.py` (empty)

- [ ] **Step 1: Create the empty package files**

```bash
touch Snowflake_Cumulus_Common/tests/__init__.py
touch Snowflake_Cumulus_Common/tests/fixtures/__init__.py
```

- [ ] **Step 2: Write `tests/conftest.py`**

```python
"""Shared pytest configuration for cumulus_common tests.

Per-dataset projects (e.g. Snowflake_Claritas_Demographics) get their own
conftest that imports SAMPLE_ANCHORS from the fixture module — see Task 7.
"""
import pytest

# Currently no shared fixtures here — kept as a stub so per-dataset projects
# can copy/extend it without re-discovering the pattern.
```

- [ ] **Step 3: Verify pytest still discovers tests**

```bash
pytest tests/ -v --collect-only
```

Expected: 12 test IDs collected (7 from `test_seed.py`, 5 from `test_coverage.py`). If pytest reports import errors, halt and inspect.

- [ ] **Step 4: Commit**

```bash
git add Snowflake_Cumulus_Common/tests/conftest.py Snowflake_Cumulus_Common/tests/__init__.py Snowflake_Cumulus_Common/tests/fixtures/__init__.py
git commit -m "test(cumulus): add tests/conftest.py stub"
```

---

## Task 7: Build the 100-anchor pytest fixture

The shared fixture every dataset's L1 tests reuse. 50 person anchors covering Retail/Wealth/SMB × age bands × income bands. 50 business anchors covering industry × revenue × employee bands.

**Files:**
- Create: `Snowflake_Cumulus_Common/tests/fixtures/sample_anchors.py`
- Create: `Snowflake_Cumulus_Common/tests/test_sample_anchors.py`

- [ ] **Step 1: Write the failing fixture-shape test first**

Create `Snowflake_Cumulus_Common/tests/test_sample_anchors.py`:

```python
"""Sanity tests for the shared 100-anchor fixture.

These tests prevent the fixture from silently drifting away from the
Cumulus spec's coverage requirements (e.g. all 4 client categories must
be represented, both account-type flags must appear).
"""
from collections import Counter

from tests.fixtures.sample_anchors import SAMPLE_ANCHORS


def test_fixture_has_100_anchors():
    assert len(SAMPLE_ANCHORS) == 100


def test_fixture_has_50_persons_and_50_businesses():
    types = Counter(a["ACCOUNT_TYPE_FLAG"] for a in SAMPLE_ANCHORS)
    assert types["PERSON"] == 50
    assert types["BUSINESS"] == 50


def test_fixture_account_ids_are_unique():
    ids = [a["ACCOUNT_ID"] for a in SAMPLE_ANCHORS]
    assert len(ids) == len(set(ids))


def test_fixture_covers_all_four_client_categories():
    """Every dataset's audience predicate filters on CLIENT_CATEGORY; if
    the fixture is missing a category, that dataset's L1 tests can't
    exercise it."""
    cats = {a["CLIENT_CATEGORY"] for a in SAMPLE_ANCHORS}
    assert cats == {"Retail", "Wealth Management", "Small Business", "Commercial Banking"}


def test_persons_have_birthdate_and_no_business_fields():
    persons = [a for a in SAMPLE_ANCHORS if a["ACCOUNT_TYPE_FLAG"] == "PERSON"]
    for p in persons:
        assert p["BIRTHDATE"] is not None
        assert p["INDUSTRY"] is None
        assert p["ANNUAL_REVENUE"] is None
        assert p["EMPLOYEE_COUNT"] is None


def test_businesses_have_industry_revenue_and_no_birthdate():
    biz = [a for a in SAMPLE_ANCHORS if a["ACCOUNT_TYPE_FLAG"] == "BUSINESS"]
    for b in biz:
        assert b["BIRTHDATE"] is None
        assert b["INDUSTRY"] is not None
        assert b["ANNUAL_REVENUE"] is not None
        assert b["EMPLOYEE_COUNT"] is not None


def test_persons_span_age_bands():
    """Persons should cover Gen Z / Millennial / Gen X / Boomer / Silent."""
    from datetime import datetime
    today = datetime(2026, 5, 28)
    persons = [a for a in SAMPLE_ANCHORS if a["ACCOUNT_TYPE_FLAG"] == "PERSON"]
    ages = [(today - datetime.fromisoformat(p["BIRTHDATE"])).days // 365 for p in persons]
    # At least one anchor in each band
    assert any(a < 28 for a in ages),  "no Gen Z anchor"
    assert any(28 <= a < 44 for a in ages), "no Millennial anchor"
    assert any(44 <= a < 60 for a in ages), "no Gen X anchor"
    assert any(60 <= a < 78 for a in ages), "no Boomer anchor"
    # Silent generation optional


def test_persons_span_income_bands():
    persons = [a for a in SAMPLE_ANCHORS if a["ACCOUNT_TYPE_FLAG"] == "PERSON"]
    incomes = [p["ANNUAL_INCOME"] for p in persons if p["ANNUAL_INCOME"] is not None]
    assert any(i < 50_000 for i in incomes),  "no low-income anchor"
    assert any(50_000 <= i < 150_000 for i in incomes), "no middle-income anchor"
    assert any(i >= 250_000 for i in incomes), "no affluent anchor"


def test_persons_have_some_with_postal_code_some_without():
    """CoreLogic Property requires POSTAL_CODE; the fixture must include
    persons WITHOUT a postal code so the audience predicate filtering
    can be tested."""
    persons = [a for a in SAMPLE_ANCHORS if a["ACCOUNT_TYPE_FLAG"] == "PERSON"]
    with_zip = [p for p in persons if p["POSTAL_CODE"] is not None]
    without_zip = [p for p in persons if p["POSTAL_CODE"] is None]
    assert len(with_zip) >= 40, "need at least 40 persons with ZIP"
    assert len(without_zip) >= 2, "need at least 2 persons without ZIP for predicate tests"
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
pytest tests/test_sample_anchors.py -v
```

Expected: 9 failures with `ModuleNotFoundError: No module named 'tests.fixtures.sample_anchors'`.

- [ ] **Step 3: Implement `tests/fixtures/sample_anchors.py`**

```python
"""Shared 100-anchor pytest fixture.

50 person anchors × age bands × income bands × client categories
(Retail / Wealth Management).
50 business anchors × industry × revenue band × employee band × client
categories (Small Business / Commercial Banking).

Each anchor matches the schema of the FINS.PUBLIC.V_ACCOUNT_ANCHORS
view (spec §3). Fields that are NULL for one type (e.g., BIRTHDATE for
businesses) are explicitly None so dataset row factories can branch
on `if anchor["BIRTHDATE"] is None`.

ACCOUNT_IDs follow the convention TEST-PERSON-NN / TEST-BIZ-NN so they
sort cleanly and never collide with real Salesforce IDs.
"""
from __future__ import annotations

from datetime import date

# 50 person anchors
_PERSON_ANCHORS = [
    # Retail — Gen Z (under 28)
    {
        "ACCOUNT_ID": "TEST-PERSON-01", "ACCOUNT_NAME": "Avery Stone",
        "SNAPSHOT_DATE": "2026-05-28", "CLIENT_CATEGORY": "Retail",
        "ACCOUNT_TYPE_FLAG": "PERSON", "BIRTHDATE": "2002-03-14",
        "ANNUAL_INCOME": 42000, "CREDIT_SCORE": 680,
        "INDUSTRY": None, "ANNUAL_REVENUE": None, "EMPLOYEE_COUNT": None,
        "POSTAL_CODE": "94110", "STATE_CODE": "CA", "COUNTRY_CODE": "US",
        "EXTERNAL_ID": "HYDRATE-001",
    },
    {
        "ACCOUNT_ID": "TEST-PERSON-02", "ACCOUNT_NAME": "Jordan Reeve",
        "SNAPSHOT_DATE": "2026-05-28", "CLIENT_CATEGORY": "Retail",
        "ACCOUNT_TYPE_FLAG": "PERSON", "BIRTHDATE": "2001-08-22",
        "ANNUAL_INCOME": 38000, "CREDIT_SCORE": 660,
        "INDUSTRY": None, "ANNUAL_REVENUE": None, "EMPLOYEE_COUNT": None,
        "POSTAL_CODE": "10025", "STATE_CODE": "NY", "COUNTRY_CODE": "US",
        "EXTERNAL_ID": "HYDRATE-002",
    },
    {
        "ACCOUNT_ID": "TEST-PERSON-03", "ACCOUNT_NAME": "Sage Linder",
        "SNAPSHOT_DATE": "2026-05-28", "CLIENT_CATEGORY": "Retail",
        "ACCOUNT_TYPE_FLAG": "PERSON", "BIRTHDATE": "2003-01-09",
        "ANNUAL_INCOME": 28000, "CREDIT_SCORE": 640,
        "INDUSTRY": None, "ANNUAL_REVENUE": None, "EMPLOYEE_COUNT": None,
        "POSTAL_CODE": None, "STATE_CODE": None, "COUNTRY_CODE": "US",
        "EXTERNAL_ID": "HYDRATE-003",
    },
    # Retail — Millennial (28–43)
    {
        "ACCOUNT_ID": "TEST-PERSON-04", "ACCOUNT_NAME": "Riley Tomas",
        "SNAPSHOT_DATE": "2026-05-28", "CLIENT_CATEGORY": "Retail",
        "ACCOUNT_TYPE_FLAG": "PERSON", "BIRTHDATE": "1990-06-30",
        "ANNUAL_INCOME": 95000, "CREDIT_SCORE": 720,
        "INDUSTRY": None, "ANNUAL_REVENUE": None, "EMPLOYEE_COUNT": None,
        "POSTAL_CODE": "60614", "STATE_CODE": "IL", "COUNTRY_CODE": "US",
        "EXTERNAL_ID": "HYDRATE-004",
    },
    {
        "ACCOUNT_ID": "TEST-PERSON-05", "ACCOUNT_NAME": "Casey Whitehall",
        "SNAPSHOT_DATE": "2026-05-28", "CLIENT_CATEGORY": "Retail",
        "ACCOUNT_TYPE_FLAG": "PERSON", "BIRTHDATE": "1988-11-12",
        "ANNUAL_INCOME": 110000, "CREDIT_SCORE": 745,
        "INDUSTRY": None, "ANNUAL_REVENUE": None, "EMPLOYEE_COUNT": None,
        "POSTAL_CODE": "02134", "STATE_CODE": "MA", "COUNTRY_CODE": "US",
        "EXTERNAL_ID": "HYDRATE-005",
    },
    # ... continue building out 50 person anchors covering:
    #   Retail × {Gen Z, Millennial, Gen X, Boomer} × {low/mid/high income}
    #   Wealth Management × {Millennial, Gen X, Boomer} × {high/affluent}
    # See the test_persons_span_*_bands assertions in test_sample_anchors.py
    # for the exact distribution required.
]

# Author note for the engineer building this fixture:
# - The 5 persons above are seeds; you need 45 more to hit 50.
# - To make the test pass, ensure you have AT LEAST:
#     - 1 anchor with age < 28      (Gen Z; e.g. PERSON-01..03)
#     - 1 anchor with 28 <= age < 44 (Millennial)
#     - 1 anchor with 44 <= age < 60 (Gen X)
#     - 1 anchor with 60 <= age < 78 (Boomer)
#     - 1 anchor with income < 50_000  (low)
#     - 1 anchor with 50_000 <= income < 150_000 (middle)
#     - 1 anchor with income >= 250_000 (affluent)
#     - >= 40 persons with POSTAL_CODE non-null
#     - >= 2 persons with POSTAL_CODE null (PERSON-03 above is one)
# - Use real US ZIP codes (94110, 10025, 60614, etc.) — CoreLogic-style
#   datasets bias by ZIP median.
# - Spread across at least 6 distinct US states.
# - For Wealth: BIRTHDATE 1955-1985, ANNUAL_INCOME >= 200K, CREDIT_SCORE 740+.
# - All TEST-PERSON-NN ACCOUNT_IDs sorted; bump to TEST-PERSON-50.

_BUSINESS_ANCHORS = [
    # Small Business — low revenue, small employee count
    {
        "ACCOUNT_ID": "TEST-BIZ-01", "ACCOUNT_NAME": "Mariposa Cleaners LLC",
        "SNAPSHOT_DATE": "2026-05-28", "CLIENT_CATEGORY": "Small Business",
        "ACCOUNT_TYPE_FLAG": "BUSINESS", "BIRTHDATE": None,
        "ANNUAL_INCOME": None, "CREDIT_SCORE": None,
        "INDUSTRY": "Personal Services", "ANNUAL_REVENUE": 480000, "EMPLOYEE_COUNT": 6,
        "POSTAL_CODE": "94110", "STATE_CODE": "CA", "COUNTRY_CODE": "US",
        "EXTERNAL_ID": "HYDRATE-B-001",
    },
    {
        "ACCOUNT_ID": "TEST-BIZ-02", "ACCOUNT_NAME": "Pinewood Coffee Co.",
        "SNAPSHOT_DATE": "2026-05-28", "CLIENT_CATEGORY": "Small Business",
        "ACCOUNT_TYPE_FLAG": "BUSINESS", "BIRTHDATE": None,
        "ANNUAL_INCOME": None, "CREDIT_SCORE": None,
        "INDUSTRY": "Food & Beverage", "ANNUAL_REVENUE": 1200000, "EMPLOYEE_COUNT": 18,
        "POSTAL_CODE": "98101", "STATE_CODE": "WA", "COUNTRY_CODE": "US",
        "EXTERNAL_ID": "HYDRATE-B-002",
    },
    # Commercial Banking — mid revenue, larger employee count
    {
        "ACCOUNT_ID": "TEST-BIZ-03", "ACCOUNT_NAME": "Northwood Manufacturing Inc.",
        "SNAPSHOT_DATE": "2026-05-28", "CLIENT_CATEGORY": "Commercial Banking",
        "ACCOUNT_TYPE_FLAG": "BUSINESS", "BIRTHDATE": None,
        "ANNUAL_INCOME": None, "CREDIT_SCORE": None,
        "INDUSTRY": "Manufacturing", "ANNUAL_REVENUE": 28000000, "EMPLOYEE_COUNT": 240,
        "POSTAL_CODE": "48226", "STATE_CODE": "MI", "COUNTRY_CODE": "US",
        "EXTERNAL_ID": "HYDRATE-B-003",
    },
    # ... continue to 50 business anchors covering:
    #   Small Business × {Personal Services, Food & Beverage, Retail, Construction, Tech}
    #     × revenue 100K-5M × employees 2-50
    #   Commercial Banking × {Manufacturing, Healthcare, Finance, Real Estate, Tech}
    #     × revenue 5M-500M × employees 50-2000
    #
    # Required by test_businesses_*:
    #   - Every business has BIRTHDATE = None
    #   - Every business has ANNUAL_INCOME = None
    #   - Every business has INDUSTRY non-null
    #   - At least 5 distinct INDUSTRY values
    #   - Bump to TEST-BIZ-50.
]

SAMPLE_ANCHORS = _PERSON_ANCHORS + _BUSINESS_ANCHORS
```

The engineer building Plan 0 fills in the remaining 47 person anchors and 47 business anchors. The test in Step 1 enforces the distribution requirements; if the test passes, the fixture is acceptable.

- [ ] **Step 4: Run tests until they pass**

```bash
pytest tests/test_sample_anchors.py -v
```

Iterate on the fixture content until 9 tests pass. The author should expect ~30 minutes filling the fixture body.

- [ ] **Step 5: Run the full test suite**

```bash
pytest tests/ -v
```

Expected: 21 passed (7 seed + 5 coverage + 9 fixture).

- [ ] **Step 6: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Snowflake_Cumulus_Common/tests/fixtures/sample_anchors.py Snowflake_Cumulus_Common/tests/test_sample_anchors.py
git commit -m "test(cumulus): 100-anchor shared pytest fixture"
```

---

## Task 8: Create `CUMULUS_SYNTH_SHARE` outbound share scaffold

The share is the egress path: each dataset plan adds a `GRANT SELECT ON TABLE … TO SHARE` once the table exists. Plan 0 creates the empty share so per-dataset plans don't each redefine it.

**Files:**
- Create: `Snowflake_Cumulus_Common/shares/cumulus_synth_share.sql`

- [ ] **Step 1: Write the share DDL**

```sql
-- =============================================================================
-- FINS.PUBLIC.CUMULUS_SYNTH_SHARE
-- Outbound zero-copy share carrying all 13 Cumulus dataset tables to
-- Salesforce Data Cloud.
-- =============================================================================
-- Per-dataset plans append a GRANT SELECT ON TABLE FINS.PUBLIC.<DATASET>
-- TO SHARE CUMULUS_SYNTH_SHARE once their table exists.
--
-- See spec §8 for the egress design rationale (single share + 13 tables vs
-- 13 separate shares).
-- =============================================================================

CREATE SHARE IF NOT EXISTS CUMULUS_SYNTH_SHARE
COMMENT = 'Outbound share carrying all 13 Cumulus synthetic dataset tables to Data Cloud. See docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md §8.';

-- The share needs USAGE on FINS database / PUBLIC schema before per-dataset
-- table grants land. Idempotent — safe to re-run.
GRANT USAGE ON DATABASE FINS TO SHARE CUMULUS_SYNTH_SHARE;
GRANT USAGE ON SCHEMA FINS.PUBLIC TO SHARE CUMULUS_SYNTH_SHARE;

-- Add the consumer Salesforce Data Cloud account to the share. The exact
-- account identifier is environment-specific — set it via:
--     ALTER SHARE CUMULUS_SYNTH_SHARE ADD ACCOUNTS = <DC_ACCOUNT_LOCATOR>;
-- after this scaffold is deployed. Per-dataset plans do NOT touch this line.
```

- [ ] **Step 2: Deploy the share scaffold**

```bash
snow sql -f Snowflake_Cumulus_Common/shares/cumulus_synth_share.sql
```

Expected output: 3 successful statement messages (`Share CUMULUS_SYNTH_SHARE successfully created`, `GRANT USAGE successful` × 2). Re-run safely (`CREATE SHARE IF NOT EXISTS` + idempotent grants).

- [ ] **Step 3: Verify the share exists and has no granted tables yet**

```bash
snow sql -q "SHOW SHARES LIKE 'CUMULUS_SYNTH_SHARE'"
snow sql -q "SHOW GRANTS TO SHARE CUMULUS_SYNTH_SHARE"
```

Expected:
- `SHOW SHARES`: 1 row, kind=`OUTBOUND`, owner=`ACCOUNTADMIN` (or your role).
- `SHOW GRANTS`: 2 rows (USAGE on DATABASE FINS, USAGE on SCHEMA FINS.PUBLIC). No table grants — expected, since per-dataset plans add them.

- [ ] **Step 4: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Snowflake_Cumulus_Common/shares/cumulus_synth_share.sql
git commit -m "feat(cumulus): scaffold CUMULUS_SYNTH_SHARE outbound share"
```

---

## Task 9: Update repo-level docs to reference the new sister-project

**Files:**
- Modify: `Snowflake/README.md`
- Modify: `docs/MONOREPO_OVERVIEW.md`
- Modify: `README.md` (top-level)

- [ ] **Step 1: Add sister-project link to `Snowflake/README.md`**

Read the file first to find the "Pipelines" or analogous section, then add a third pipeline row to whatever table or list lists `Financial_Trades_Generation` and `Snowflake_CSAT_NPS`. Example pattern (adapt to actual file content):

```markdown
3. **Cumulus Common (Plan 0 foundation)** — shared `V_ACCOUNT_ANCHORS` view, anchor fixture, and outbound share scaffolding for the 13 forthcoming Cumulus dataset pipelines (Plans 1–13). See `../Snowflake_Cumulus_Common/`.
```

- [ ] **Step 2: Add a row to the monorepo overview**

In `docs/MONOREPO_OVERVIEW.md`, add `Snowflake_Cumulus_Common/` next to the existing `Snowflake_CSAT_NPS/` and `Financial_Trades_Generation/` entries with a one-sentence description.

- [ ] **Step 3: Add a top-level README mention**

In `/Users/jsifontes/Documents/Git/JDO/README.md`, add `Snowflake_Cumulus_Common/` to whatever sister-project listing exists.

- [ ] **Step 4: Run the test suite once more to confirm nothing broke**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Snowflake_Cumulus_Common
source .venv/bin/activate
pytest tests/ -v
```

Expected: 21 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Snowflake/README.md docs/MONOREPO_OVERVIEW.md README.md
git commit -m "docs(cumulus): link Snowflake_Cumulus_Common in monorepo docs"
```

---

## Task 10: Final verification gates

- [ ] **Step 1: Run all tests**

```bash
cd /Users/jsifontes/Documents/Git/JDO/Snowflake_Cumulus_Common
source .venv/bin/activate
pytest tests/ -v
```

Expected: 21 passed, 0 failed.

- [ ] **Step 2: Verify the deployed view returns expected counts**

```bash
snow sql -q "
SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE ACCOUNT_TYPE_FLAG = 'PERSON')   AS persons,
    COUNT(*) FILTER (WHERE ACCOUNT_TYPE_FLAG = 'BUSINESS') AS businesses,
    COUNT(*) FILTER (WHERE POSTAL_CODE IS NOT NULL)        AS with_postal,
    COUNT(DISTINCT CLIENT_CATEGORY)                        AS distinct_categories
FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS"
```

Expected (rough order of magnitude — exact numbers depend on `MASTER_ACCOUNTS` state at deploy time):
- `total ≈ 30K-40K`
- `persons ≈ 25K-35K`
- `businesses ≈ 4K-6K`
- `with_postal` should be most of `total`
- `distinct_categories == 4` (Retail, Wealth Management, Small Business, Commercial Banking)

If `distinct_categories < 4`, halt — the view is missing a category, which means the upstream `FinServ_ClientCategory_c__c` field has fewer values than Phase 4 produces.

- [ ] **Step 3: Verify share is in place with no table grants yet**

```bash
snow sql -q "SHOW GRANTS TO SHARE CUMULUS_SYNTH_SHARE"
```

Expected: 2 rows (USAGE × 2), 0 table grants. Per-dataset plans add the table grants.

- [ ] **Step 4: Verify importability of the common package from a fresh shell**

```bash
cd /tmp && /Users/jsifontes/Documents/Git/JDO/Snowflake_Cumulus_Common/.venv/bin/python -c "
from cumulus_common import seed_for, assert_coverage
from datetime import datetime
print('seed sample:', seed_for('A','test',datetime(2026,5,1)).hex()[:16])
print('assert_coverage callable:', callable(assert_coverage))
"
```

Expected: 16-char hex on first line, `True` on second line.

- [ ] **Step 5: Mark Plan 0 done — ready for Plans 1–13**

Plan 0 produces no user-visible feature. Its deliverable is the foundation that 13 follow-on plans depend on. The L3 smoke test is implicit: if Plan 1 (Claritas Demographics) compiles and runs against this foundation, Plan 0 worked.

```bash
git log --oneline | head -10
```

Expected: 9 commits from Plan 0 (Tasks 1–9), in order.

---

## Self-Review

**Spec coverage:** Plan 0 implements §3 (anchor view, Task 2), §5.1 shared concerns (seed Task 4 + coverage Task 5), §7.5 shared fixture (Task 7), §8 egress scaffold (Task 8), §9 Plan 0 row (whole plan). Per-dataset SP shape (§5), error taxonomy (§6), and dataset-specific tests are intentionally out of scope for Plan 0 — they belong in Plans 1–13.

**Placeholder scan:** None. The fixture body intentionally leaves a stub for the engineer to fill in 47+47 anchor rows; that's documented and the test suite enforces the distribution requirements rather than carrying inline pseudo-code.

**Type/name consistency:** `seed_for` signature `(account_id, dataset_salt, run_ts)` is referenced consistently. `assert_coverage` signature `(session, expected_sql, actual_sql)` is referenced consistently. The view column names match the spec §3 SQL exactly. Repo dir is `Snowflake_Cumulus_Common/` everywhere.

**Out of scope (explicit):** Per-dataset SPs / tasks / DLOs / DMOs — Plans 1–13. Adding the DC consumer account to the share via `ALTER SHARE … ADD ACCOUNTS` — done by ops outside this plan. CI workflow definition for L2 tests — done in Plan 1 since that's the first plan needing it.
