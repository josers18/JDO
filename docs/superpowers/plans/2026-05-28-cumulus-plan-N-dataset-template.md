# Cumulus Plan-N Dataset Template

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** This is the **template** every per-dataset plan (Plans 1–13) instantiates. Each dataset plan is a copy of this file with `<<DATASET>>` and similar placeholders replaced. The structure does not vary across datasets — only the audience predicate, row factory, and table schema do.

**Architecture:** A single Snowpark Python stored procedure reads from `FINS.PUBLIC.V_ACCOUNT_ANCHORS` (Plan 0), builds deterministic rows via `cumulus_common.seed_for`, MERGEs into a per-dataset table, asserts coverage via `cumulus_common.assert_coverage`, and logs to `FINS.PUBLIC.TASK_EXECUTION_LOG`. A scheduled Snowflake TASK calls the SP via the existing `SP_RUN_WITH_RETRY` wrapper. The table is granted to `CUMULUS_SYNTH_SHARE` for DC egress.

**Tech Stack:** Snowflake (SQL DDL, Snowpark Python SPs, TASKs, shares), Python 3.11+ (pytest, snowflake-snowpark-python), `snow` CLI v3+.

---

## How to use this template

1. **Pick the dataset row from the spec §4 table** — note your dataset's mimics-vendor, table name, repo dir, DMO name, cadence, audience predicate, coverage check rule.
2. **Substitute the placeholders** below. They are listed in §0 below for `Find/Replace`.
3. **Save the result** as `docs/superpowers/plans/YYYY-MM-DD-cumulus-plan-<N>-<dataset-slug>.md`.
4. **Implement task-by-task** as written. Each task is 2–5 minutes.

## §0 — Placeholders to substitute

| Placeholder | Example value | Where it appears |
|---|---|---|
| `<<PLAN_N>>` | `1` | plan title, commit messages |
| `<<DATASET_SLUG>>` | `claritas-demographics` | filename, branch name |
| `<<MIMICS_VENDOR>>` | `Claritas` | docs / READMEs |
| `<<DATASET_TABLE>>` | `CLARITAS_DEMOGRAPHICS` | Snowflake table identifier |
| `<<REPO_DIR>>` | `Snowflake_Claritas_Demographics` | new sister-project dir |
| `<<DC_DMO>>` | `CumulusClaritasDemographics__dlm` | DC DMO name |
| `<<DATASET_SALT>>` | `claritas` | hash salt string (lowercase, short) |
| `<<CADENCE>>` | `MONTHLY` | TASK schedule prefix |
| `<<TASK_NAME>>` | `TASK_MONTHLY_CLARITAS_DEMOGRAPHICS` | Snowflake TASK identifier |
| `<<SP_NAME>>` | `SP_GENERATE_CLARITAS_DEMOGRAPHICS` | Snowflake SP identifier |
| `<<CRON>>` | `'USING CRON 0 7 1 * * UTC'` | TASK schedule clause |
| `<<AUDIENCE_PREDICATE>>` | `ACCOUNT_TYPE_FLAG = 'PERSON'` | SQL WHERE clause |
| `<<COVERAGE_RULE>>` | `rows = audience` (1:1) or `distinct accts = audience` (1:N) | shape of coverage check |
| `<<ROW_PK>>` | `(ACCOUNT_ID, PROFILE_MONTH)` | MERGE key |
| `<<COLUMN_LIST>>` | `ACCOUNT_ID, PROFILE_MONTH, PRIZM_SEGMENT, LIFE_STAGE, ...` | table column list |

For any column-list / row-factory specifics, see the per-dataset attachment files at `docs/superpowers/plans/attachments/cumulus-plan-<N>-<dataset>-rowspec.md` (created at plan-instantiation time, not part of this template).

## Pre-flight (one-time per dataset)

```bash
snow sql -q "SHOW VIEWS LIKE 'V_ACCOUNT_ANCHORS' IN SCHEMA FINS.PUBLIC"
                          # expect 1 row — if 0, Plan 0 hasn't shipped; halt
snow sql -q "SHOW SHARES LIKE 'CUMULUS_SYNTH_SHARE'"
                          # expect 1 row, kind=OUTBOUND
ls Snowflake_Cumulus_Common/cumulus_common/seed.py
                          # expect file present (Plan 0)
```

If any check fails, halt — Plan 0 has not been merged yet.

## File Structure

```
<<REPO_DIR>>/                                   ← NEW sister-project
├── README.md                                    ← Task 1
├── AGENTS.md                                    ← Task 1
├── pyproject.toml                               ← Task 1
├── schemas/
│   └── <<DATASET_TABLE_LOWER>>.sql              ← Task 2 (CREATE TABLE)
├── procedures/
│   └── sp_generate_<<DATASET_SLUG_UNDERSCORE>>.py  ← Task 4 (Snowpark Python SP)
├── tasks/
│   └── <<TASK_NAME_LOWER>>.sql                  ← Task 6 (CREATE TASK)
├── shares/
│   └── grant_to_synth_share.sql                 ← Task 7 (GRANT to share)
└── tests/
    ├── conftest.py                              ← Task 3
    ├── test_<<DATASET_SLUG_UNDERSCORE>>_row_factory.py  ← Task 3 (L1 pytest)
    └── integration/
        └── test_<<DATASET_SLUG_UNDERSCORE>>_sp.sql       ← Task 5 (L2 snow sql)
```

`<<DATASET_TABLE_LOWER>>` is `<<DATASET_TABLE>>` lowercased (e.g. `claritas_demographics`).
`<<DATASET_SLUG_UNDERSCORE>>` is `<<DATASET_SLUG>>` with `-` → `_` (e.g. `claritas_demographics`).
`<<TASK_NAME_LOWER>>` is `<<TASK_NAME>>` lowercased.

---

## Task 1: Scaffold `<<REPO_DIR>>/` repo dir

**Files:**
- Create: `<<REPO_DIR>>/README.md`
- Create: `<<REPO_DIR>>/AGENTS.md`
- Create: `<<REPO_DIR>>/pyproject.toml`
- Create: `<<REPO_DIR>>/.gitignore`

- [ ] **Step 1: Create the directory tree**

```bash
cd /Users/jsifontes/Documents/Git/JDO
mkdir -p <<REPO_DIR>>/schemas <<REPO_DIR>>/procedures <<REPO_DIR>>/tasks <<REPO_DIR>>/shares <<REPO_DIR>>/tests/integration
```

- [ ] **Step 2: Write `<<REPO_DIR>>/README.md`**

```markdown
# <<MIMICS_VENDOR>> — Cumulus Synthetic Dataset

Synthetic <<MIMICS_VENDOR>>-style data for Cumulus accounts. Mirrors
[Snowflake_CSAT_NPS](../Snowflake_CSAT_NPS) and the Cumulus umbrella
spec at [docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

## Plan
- Plan <<PLAN_N>>, instantiated from `docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)

## Snowflake objects
- Table: `FINS.PUBLIC.<<DATASET_TABLE>>`
- Stored procedure: `FINS.PUBLIC.<<SP_NAME>>()`
- Task: `FINS.PUBLIC.<<TASK_NAME>>` (<<CADENCE>>, <<CRON>>)
- Egress: `CUMULUS_SYNTH_SHARE` → DC `<<DC_DMO>>`

## Audience
\`\`\`sql
SELECT * FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE <<AUDIENCE_PREDICATE>>
\`\`\`

## Tests
\`\`\`bash
cd <<REPO_DIR>>
pip install -e ".[dev]"
pytest tests/ -v
\`\`\`

## Deploy
\`\`\`bash
snow sql -f schemas/<<DATASET_TABLE_LOWER>>.sql
snow sql -f procedures/sp_generate_<<DATASET_SLUG_UNDERSCORE>>.py
snow sql -f tasks/<<TASK_NAME_LOWER>>.sql
snow sql -f shares/grant_to_synth_share.sql
\`\`\`
```

- [ ] **Step 3: Write `<<REPO_DIR>>/AGENTS.md`**

```markdown
# AGENTS.md — <<REPO_DIR>>

Synthetic <<MIMICS_VENDOR>>-style dataset for the Cumulus FSC demo. One of 13.

## Boundaries
- Owns: `FINS.PUBLIC.<<DATASET_TABLE>>`, `<<SP_NAME>>`, `<<TASK_NAME>>`, the share grant
  for this table.
- Does NOT own: `V_ACCOUNT_ANCHORS`, `CUMULUS_SYNTH_SHARE`, `MASTER_ACCOUNTS`,
  the seed/coverage helpers — see `Snowflake_Cumulus_Common`.

## Conventions
- The SP uses `cumulus_common.seed_for(...)` for determinism with salt `<<DATASET_SALT>>`.
- The SP uses `cumulus_common.assert_coverage(session, expected_sql, actual_sql)`
  in step 4 — the canonical "coverage gap: N missing rows" message lives there.
- The MERGE replaces on PK `<<ROW_PK>>`. Re-runs are idempotent.

## Tests
- L1 (pytest, `tests/test_<<DATASET_SLUG_UNDERSCORE>>_row_factory.py`): row factory is
  pure; covers determinism, audience scoping, boring-case coverage, anchor influence,
  schema contract.
- L2 (`tests/integration/`, run via CI): deploys SP into `FINS.TEST` with a 100-anchor
  fixture view, runs it, asserts coverage + idempotency + log row.
- L3 (manual smoke, post-deploy): one run against `jdo-uqj0jr`, then row count + sample.

## Gotchas
- The dataset salt `<<DATASET_SALT>>` MUST be unique among the 13 — check the spec §5.3
  before committing if you're tempted to change it.
- The audience predicate `<<AUDIENCE_PREDICATE>>` lives in BOTH `AUDIENCE_SQL` and
  `COVERAGE_SQL` constants in the SP. They MUST stay in sync — drift is the sneakiest
  way to silently produce a coverage gap.
```

- [ ] **Step 4: Write `<<REPO_DIR>>/pyproject.toml`**

```toml
[project]
name = "cumulus-<<DATASET_SLUG>>"
version = "0.1.0"
description = "<<MIMICS_VENDOR>>-style synthetic dataset for Cumulus."
requires-python = ">=3.11"
dependencies = []

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "snowflake-snowpark-python>=1.20",
    "cumulus-common @ file:///${PROJECT_ROOT}/../Snowflake_Cumulus_Common",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["procedures", "."]
```

(The `${PROJECT_ROOT}` path is resolved by pip at install time when invoked
with `pip install -e .` from `<<REPO_DIR>>/`. If your pip version doesn't support that
substitution, use the absolute path or `pip install -e ../Snowflake_Cumulus_Common`
explicitly before installing this project.)

- [ ] **Step 5: Write `.gitignore`**

```
__pycache__/
*.pyc
.venv/
.pytest_cache/
*.egg-info/
```

- [ ] **Step 6: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add <<REPO_DIR>>/README.md <<REPO_DIR>>/AGENTS.md <<REPO_DIR>>/pyproject.toml <<REPO_DIR>>/.gitignore
git commit -m "feat(cumulus): scaffold <<REPO_DIR>>"
```

---

## Task 2: Create the dataset table DDL

**Files:**
- Create: `<<REPO_DIR>>/schemas/<<DATASET_TABLE_LOWER>>.sql`

This task requires the per-dataset attachment file at
`docs/superpowers/plans/attachments/cumulus-plan-<<PLAN_N>>-<<DATASET_SLUG>>-rowspec.md`,
which lists the exact columns, data types, and PK for this dataset's table.

If the attachment doesn't exist yet, halt — the dataset's row spec is the brainstorm
output, not boilerplate, and must be authored before the table DDL is written. The
attachment lives next to the plan and gets versioned with it.

- [ ] **Step 1: Read the rowspec attachment**

```bash
cat docs/superpowers/plans/attachments/cumulus-plan-<<PLAN_N>>-<<DATASET_SLUG>>-rowspec.md
```

Expected: a markdown file specifying every column name, data type, NULL/NOT NULL,
COMMENT, and the primary key.

- [ ] **Step 2: Translate the rowspec to a Snowflake DDL file**

Write `<<REPO_DIR>>/schemas/<<DATASET_TABLE_LOWER>>.sql`:

```sql
-- =============================================================================
-- FINS.PUBLIC.<<DATASET_TABLE>>
-- <<MIMICS_VENDOR>>-style synthetic data for Cumulus accounts.
-- =============================================================================
-- Cadence:    <<CADENCE>> via <<TASK_NAME>>
-- Audience:   <<AUDIENCE_PREDICATE>>
-- Generator:  <<SP_NAME>>
-- Egress:     CUMULUS_SYNTH_SHARE → DC <<DC_DMO>>
-- Spec:       docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md
-- =============================================================================

CREATE OR REPLACE TABLE FINS.PUBLIC.<<DATASET_TABLE>> (
    -- See attached rowspec for full column list. The PK MUST include ACCOUNT_ID.
    -- Example shape (Claritas-style 1:1 monthly):
    --
    --   ACCOUNT_ID            VARCHAR     NOT NULL,
    --   PROFILE_MONTH         DATE        NOT NULL,
    --   PRIZM_SEGMENT         VARCHAR,
    --   LIFE_STAGE            VARCHAR,
    --   ...
    --   GENERATED_AT          TIMESTAMP_NTZ NOT NULL,
    --   CONSTRAINT pk_<<DATASET_TABLE_LOWER>> PRIMARY KEY (ACCOUNT_ID, PROFILE_MONTH)
    <<COLUMN_LIST>>
)
COMMENT = '<<MIMICS_VENDOR>>-style synthetic dataset. <<CADENCE>> generation. See <<REPO_DIR>>/README.md and the umbrella spec.';
```

- [ ] **Step 3: Deploy the table**

```bash
snow sql -f <<REPO_DIR>>/schemas/<<DATASET_TABLE_LOWER>>.sql
```

Expected: `Table <<DATASET_TABLE>> successfully created.`

- [ ] **Step 4: Smoke-check the table is empty and has the expected columns**

```bash
snow sql -q "SELECT COUNT(*) FROM FINS.PUBLIC.<<DATASET_TABLE>>"
```

Expected: `0`.

```bash
snow sql -q "DESC TABLE FINS.PUBLIC.<<DATASET_TABLE>>"
```

Expected: column list matches the rowspec attachment exactly.

- [ ] **Step 5: Commit**

```bash
git add <<REPO_DIR>>/schemas/<<DATASET_TABLE_LOWER>>.sql
git commit -m "feat(cumulus): create FINS.PUBLIC.<<DATASET_TABLE>> table"
```

---

## Task 3: Write L1 pure-function tests for the row factory

The row factory `_row_for(anchor, run_ts) -> dict` is the per-dataset synthesis logic.
This is where the bulk of the dataset's correctness lives — the 5 property classes
from the spec §7.2 catch the sneakiest bugs.

**Files:**
- Create: `<<REPO_DIR>>/tests/conftest.py`
- Create: `<<REPO_DIR>>/tests/__init__.py` (empty)
- Create: `<<REPO_DIR>>/tests/test_<<DATASET_SLUG_UNDERSCORE>>_row_factory.py`

- [ ] **Step 1: Create the empty package marker**

```bash
touch <<REPO_DIR>>/tests/__init__.py
mkdir -p <<REPO_DIR>>/tests/integration
```

- [ ] **Step 2: Write `<<REPO_DIR>>/tests/conftest.py`**

```python
"""Per-dataset pytest config — pulls the shared 100-anchor fixture."""
import sys
from pathlib import Path

# Make the shared fixture importable: ../Snowflake_Cumulus_Common/tests/fixtures
_root = Path(__file__).resolve().parent.parent.parent / "Snowflake_Cumulus_Common"
sys.path.insert(0, str(_root))

from tests.fixtures.sample_anchors import SAMPLE_ANCHORS  # noqa: E402

import pytest


@pytest.fixture
def all_anchors():
    """The full 100-anchor fixture (50 person + 50 business)."""
    return SAMPLE_ANCHORS


@pytest.fixture
def in_audience_anchors():
    """Anchors that satisfy this dataset's audience predicate.

    Override in the dataset-specific test file if needed; default is all.
    """
    return SAMPLE_ANCHORS


@pytest.fixture
def out_of_audience_anchors():
    """Anchors that do NOT satisfy this dataset's audience predicate.

    Override in the dataset-specific test file. Default is empty.
    """
    return []
```

- [ ] **Step 3: Write the failing L1 test file**

Create `<<REPO_DIR>>/tests/test_<<DATASET_SLUG_UNDERSCORE>>_row_factory.py`:

```python
"""L1 tests for the <<MIMICS_VENDOR>> row factory.

Five property classes per spec §7.2:
1. Determinism
2. Audience scoping (predicate-violating anchors raise)
3. Boring-case coverage (boring result still emits a row)
4. Anchor influence (biased fields shift with anchors)
5. Schema contract (output dict matches table columns)
"""
from datetime import datetime
from collections import Counter

import pytest

# Imports the factory we'll write in Task 4.
from sp_generate_<<DATASET_SLUG_UNDERSCORE>> import _row_for, EXPECTED_OUTPUT_COLUMNS


# Override the audience fixtures for this dataset's predicate.
# Replace the lambda with the actual predicate from spec §4.
# Example: ACCOUNT_TYPE_FLAG = 'PERSON':
@pytest.fixture
def in_audience_anchors(all_anchors):
    return [a for a in all_anchors if a["ACCOUNT_TYPE_FLAG"] == "PERSON"]


@pytest.fixture
def out_of_audience_anchors(all_anchors):
    return [a for a in all_anchors if a["ACCOUNT_TYPE_FLAG"] != "PERSON"]


# ---------- Property 1: Determinism ----------

def test_determinism_same_inputs(in_audience_anchors):
    """Same (anchor, ts) → same output dict, byte for byte."""
    ts = datetime(2026, 5, 1)
    for anchor in in_audience_anchors[:5]:
        a = _row_for(anchor, ts)
        b = _row_for(anchor, ts)
        assert a == b, f"non-deterministic for {anchor['ACCOUNT_ID']}"


def test_determinism_buckets_by_year_month(in_audience_anchors):
    """Different days within a month → identical output (monthly cadence)."""
    anchor = in_audience_anchors[0]
    a = _row_for(anchor, datetime(2026, 5, 1))
    b = _row_for(anchor, datetime(2026, 5, 17))
    c = _row_for(anchor, datetime(2026, 6, 1))
    assert a == b
    assert a != c  # new month → new draw


# ---------- Property 2: Audience scoping ----------

def test_audience_violators_raise(out_of_audience_anchors):
    """Predicate-violating anchors must raise ValueError, not silently
    produce a row. Caller-side audience SQL filters them out, but defense
    in depth catches predicate drift."""
    if not out_of_audience_anchors:
        pytest.skip("no out-of-audience anchors in fixture")
    for bad in out_of_audience_anchors[:3]:
        with pytest.raises((ValueError, AssertionError)):
            _row_for(bad, datetime(2026, 5, 1))


# ---------- Property 3: Boring-case coverage ----------

def test_boring_case_still_returns_row(in_audience_anchors):
    """A 'boring' anchor (low-risk, low-income, etc.) STILL emits a row.
    Replace this fixture-specific predicate with whatever your dataset's
    'boringest' anchor looks like — the point is NO ONE GETS DROPPED."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    # Example: pick the first audience-eligible anchor and assert it
    # produces a non-None dict with ACCOUNT_ID populated.
    boring = in_audience_anchors[0]
    row = _row_for(boring, datetime(2026, 5, 1))
    assert row is not None
    assert row["ACCOUNT_ID"] == boring["ACCOUNT_ID"]


# ---------- Property 4: Anchor influence ----------

def test_anchor_influence_distribution_shifts(all_anchors):
    """The MOST IMPORTANT TEST — a row factory that ignores its anchor
    and just returns hash-derived values would pass determinism and
    schema, but produce demographically-incoherent data.

    Group anchors by some bias-relevant axis (income / industry / age)
    and verify the per-group distribution of an output field DIFFERS.

    Replace `BIAS_AXIS_FN` and `OUTPUT_FIELD_TO_CHECK` with values that
    make sense for THIS dataset.
    """
    # Example: split persons by income, check PRIZM_SEGMENT distribution
    persons = [a for a in all_anchors if a["ACCOUNT_TYPE_FLAG"] == "PERSON"]
    if len(persons) < 10:
        pytest.skip("need >= 10 persons for distribution test")

    low = [p for p in persons if (p["ANNUAL_INCOME"] or 0) < 50_000]
    high = [p for p in persons if (p["ANNUAL_INCOME"] or 0) >= 250_000]
    if not low or not high:
        pytest.skip("need both low and high income anchors")

    # Roll multiple months to get a stable distribution
    output_field = "PRIZM_SEGMENT"  # replace with output_field_to_check for THIS dataset
    rows_low = [_row_for(a, datetime(2026, m, 1))[output_field]
                for a in low for m in range(1, 13)]
    rows_high = [_row_for(a, datetime(2026, m, 1))[output_field]
                 for a in high for m in range(1, 13)]

    # The two distributions must NOT be identical
    counter_low = Counter(rows_low)
    counter_high = Counter(rows_high)
    assert counter_low != counter_high, (
        f"{output_field} distribution did not shift between low and high "
        f"income anchors — row factory may be ignoring its anchor"
    )


# ---------- Property 5: Schema contract ----------

def test_output_schema_matches_table(in_audience_anchors):
    """Output dict keys EXACTLY match the table's column list."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    row = _row_for(in_audience_anchors[0], datetime(2026, 5, 1))
    assert set(row.keys()) == EXPECTED_OUTPUT_COLUMNS, (
        f"row keys {set(row.keys())} != table columns {EXPECTED_OUTPUT_COLUMNS}"
    )
```

- [ ] **Step 4: Run tests, verify they fail**

```bash
cd <<REPO_DIR>>
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pip install -e ../Snowflake_Cumulus_Common  # ensure cumulus_common is importable
pytest tests/ -v
```

Expected: 5+ failures (`ModuleNotFoundError: No module named 'sp_generate_<<DATASET_SLUG_UNDERSCORE>>'`).

- [ ] **Step 5: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add <<REPO_DIR>>/tests/conftest.py <<REPO_DIR>>/tests/__init__.py <<REPO_DIR>>/tests/test_<<DATASET_SLUG_UNDERSCORE>>_row_factory.py
git commit -m "test(cumulus): L1 row-factory tests for <<DATASET_TABLE>>"
```

---

## Task 4: Implement the Snowpark Python stored procedure

This is the dataset's substantive code. The 5-step shape (read → build → MERGE
→ assert → log) is fixed by the spec; per-dataset variation is confined to
`_row_for` and the column list.

**Files:**
- Create: `<<REPO_DIR>>/procedures/sp_generate_<<DATASET_SLUG_UNDERSCORE>>.py`

- [ ] **Step 1: Write the SP module**

```python
"""<<MIMICS_VENDOR>>-style synthetic dataset generator.

Snowpark Python stored procedure registered as FINS.PUBLIC.<<SP_NAME>>.
Mirrors the canonical 5-step pattern from spec §5.1.

Audience: <<AUDIENCE_PREDICATE>>
Cadence:  <<CADENCE>>
Salt:     <<DATASET_SALT>>
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

# When executing inside Snowflake, the cumulus_common package is shipped via
# the `IMPORTS = (...)` clause in the CREATE PROCEDURE statement. Locally
# (under pytest), it's installed via `pip install -e`.
from cumulus_common import seed_for, assert_coverage


TABLE        = "FINS.PUBLIC.<<DATASET_TABLE>>"
TASK_NAME    = "<<TASK_NAME>>"
DATASET_SALT = "<<DATASET_SALT>>"
AUDIENCE_SQL = "SELECT * FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE <<AUDIENCE_PREDICATE>>"
COVERAGE_SQL = "SELECT COUNT(*) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE <<AUDIENCE_PREDICATE>>"

# Authoritative output column set — kept in sync with the table DDL by the
# schema-contract test in tests/.
EXPECTED_OUTPUT_COLUMNS: frozenset[str] = frozenset({
    # Replace with the dataset's columns.
    "ACCOUNT_ID",
    # ...
    "GENERATED_AT",
})


def main(session: Any) -> str:
    """Entry point invoked by FINS.PUBLIC.<<SP_NAME>> via SP_RUN_WITH_RETRY."""
    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    rows_inserted, accounts_processed, status, err = 0, 0, "SUCCEEDED", None

    try:
        # 1. Read audience from the shared view (zero-copy fresh anchors)
        audience = session.sql(AUDIENCE_SQL).collect()
        accounts_processed = len(audience)

        # 2. Build deterministic rows; tolerate up to 1% per-row failures
        records, errors = [], []
        for a in audience:
            try:
                records.append(_row_for(_anchor_to_dict(a), started))
            except Exception as exc:
                errors.append((a.ACCOUNT_ID, str(exc)[:200]))
        max_tolerated = max(10, len(audience) // 100)
        if len(errors) > max_tolerated:
            raise RuntimeError(
                f"row factory failed on {len(errors)}/{len(audience)} accounts "
                f"(tolerance {max_tolerated}); first: {errors[0] if errors else 'n/a'}"
            )
        if errors:
            err = (
                f"row factory failed on {len(errors)}/{len(audience)} accounts; "
                f"first: {errors[0]}"
            )

        # 3. Idempotent MERGE on PK
        rows_inserted = _merge(session, records)

        # 4. Coverage assertion (canonical "coverage gap: N missing rows" message)
        actual_sql = f"SELECT COUNT(DISTINCT ACCOUNT_ID) FROM {TABLE}"
        assert_coverage(session, COVERAGE_SQL, actual_sql)

    except Exception as exc:
        status = "FAILED"
        err = str(exc)[:4000]
        raise

    finally:
        # 5. Always log — success or failure
        duration_ms = int((datetime.utcnow() - started).total_seconds() * 1000)
        session.sql(
            """
            INSERT INTO FINS.PUBLIC.TASK_EXECUTION_LOG
                (LOG_ID, TASK_NAME, EXECUTION_TIME, STATUS, ROWS_INSERTED,
                 ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            params=[log_id, TASK_NAME, started, status,
                    rows_inserted, accounts_processed, err, duration_ms],
        ).collect()

    return f"{TASK_NAME}: {status} rows={rows_inserted} accounts={accounts_processed}"


def _anchor_to_dict(row: Any) -> dict:
    """Snowpark Row → dict (so _row_for can be tested with plain dicts)."""
    if isinstance(row, dict):
        return row
    return {f.name: row[f.name] for f in row._fields} if hasattr(row, "_fields") \
        else dict(row.asDict()) if hasattr(row, "asDict") else dict(row)


def _row_for(anchor: dict, run_ts: datetime) -> dict:
    """Pure function: anchor row → fact row. Deterministic.

    Per-dataset synthesis logic. Use seed_for() for the deterministic seed,
    then derive each output field by biasing on relevant anchor fields
    (income/age for demographics; industry/revenue for D&B; etc.).

    REPLACE THIS BODY with the dataset-specific synthesis. Use the
    rowspec attachment for the column derivations.
    """
    # Audience scoping (defense in depth — the SQL has already filtered)
    if not _anchor_in_audience(anchor):
        raise ValueError(
            f"anchor {anchor.get('ACCOUNT_ID')} fails audience predicate "
            f"<<AUDIENCE_PREDICATE>>"
        )

    seed = seed_for(anchor["ACCOUNT_ID"], DATASET_SALT, run_ts)

    # Example shape (replace with the per-dataset rowspec):
    return {
        "ACCOUNT_ID":   anchor["ACCOUNT_ID"],
        # ... derive the rest of EXPECTED_OUTPUT_COLUMNS from `seed` and `anchor`
        "GENERATED_AT": run_ts,
    }


def _anchor_in_audience(anchor: dict) -> bool:
    """Translate <<AUDIENCE_PREDICATE>> into a Python predicate.

    Example for ACCOUNT_TYPE_FLAG='PERSON':
        return anchor.get("ACCOUNT_TYPE_FLAG") == "PERSON"
    """
    # REPLACE with the dataset's predicate.
    raise NotImplementedError("define _anchor_in_audience for this dataset")


def _merge(session: Any, records: list[dict]) -> int:
    """MERGE records into TABLE on PK <<ROW_PK>>. Returns rows MERGED.

    Implementation pattern (Snowpark write_pandas + MERGE):

        import pandas as pd
        df = pd.DataFrame(records)
        session.write_pandas(df, "<<DATASET_TABLE>>_STAGING",
                             auto_create_table=True, overwrite=True,
                             database="FINS", schema="PUBLIC")
        session.sql(\"\"\"
            MERGE INTO FINS.PUBLIC.<<DATASET_TABLE>> tgt
            USING FINS.PUBLIC.<<DATASET_TABLE>>_STAGING src
            ON  tgt.ACCOUNT_ID = src.ACCOUNT_ID
            AND tgt.<<PK_FIELD2>> = src.<<PK_FIELD2>>
            WHEN MATCHED THEN UPDATE SET ...
            WHEN NOT MATCHED THEN INSERT (...) VALUES (...)
        \"\"\").collect()

    Replace with the actual MERGE for this dataset's PK. Returns the
    integer count of rows actually inserted/updated (read from the
    Snowpark MERGE result).
    """
    raise NotImplementedError("define _merge for this dataset")
```

- [ ] **Step 2: Implement `_anchor_in_audience` and `_row_for`**

These are the two functions where the dataset's actual synthesis logic lives.
Replace the `raise NotImplementedError` and the placeholder return dict with
the real implementations, derived from the rowspec attachment.

For `_row_for`, the conventional structure is:

```python
import random

def _row_for(anchor: dict, run_ts: datetime) -> dict:
    if not _anchor_in_audience(anchor):
        raise ValueError(...)

    seed = seed_for(anchor["ACCOUNT_ID"], DATASET_SALT, run_ts)
    rng = random.Random(seed)  # deterministic given the seed

    # Example bias logic — adapt per dataset
    income = anchor.get("ANNUAL_INCOME") or 0
    if income >= 250_000:
        prizm_pool = ["Upper Crust", "Money & Brains", "Movers & Shakers"]
    elif income >= 100_000:
        prizm_pool = ["Pools & Patios", "Suburban Pioneers", "Domestic Duos"]
    else:
        prizm_pool = ["Striving Singles", "City Roots", "Hometown Retired"]

    return {
        "ACCOUNT_ID":   anchor["ACCOUNT_ID"],
        "PROFILE_MONTH": run_ts.replace(day=1).date(),
        "PRIZM_SEGMENT": rng.choice(prizm_pool),
        # ...
        "GENERATED_AT": run_ts,
    }
```

- [ ] **Step 3: Implement `_merge`**

The function must return the integer row count actually merged. Pattern lifted
from `Snowflake_CSAT_NPS/procedures/sp_generate_monthly_csat.sql`, adapted for
Snowpark Python:

```python
def _merge(session: Any, records: list[dict]) -> int:
    if not records:
        return 0
    import pandas as pd
    df = pd.DataFrame(records)
    staging = "<<DATASET_TABLE>>_STAGING"

    session.write_pandas(
        df, staging,
        auto_create_table=True, overwrite=True,
        database="FINS", schema="PUBLIC",
    )

    merge_sql = """
        MERGE INTO FINS.PUBLIC.<<DATASET_TABLE>> tgt
        USING FINS.PUBLIC.<<DATASET_TABLE>>_STAGING src
        ON tgt.ACCOUNT_ID = src.ACCOUNT_ID
           -- AND tgt.PROFILE_MONTH = src.PROFILE_MONTH    <-- add for composite PK
        WHEN MATCHED THEN UPDATE SET
            -- list every non-PK column = src.<col>
            COL_A = src.COL_A,
            COL_B = src.COL_B
        WHEN NOT MATCHED THEN INSERT (ACCOUNT_ID, COL_A, COL_B, ...)
            VALUES (src.ACCOUNT_ID, src.COL_A, src.COL_B, ...)
    """
    rows = session.sql(merge_sql).collect()
    # Snowflake returns a single row with the merge stats
    return int(rows[0][0]) if rows else len(records)
```

Replace `COL_A`, `COL_B`, etc. with the actual column list from the rowspec.

- [ ] **Step 4: Run L1 tests, iterate to green**

```bash
cd <<REPO_DIR>>
source .venv/bin/activate
pytest tests/test_<<DATASET_SLUG_UNDERSCORE>>_row_factory.py -v
```

Expected: all 5 property classes pass (~7-9 tests). The MERGE and `main()`
are NOT tested at L1 (they require a session); L2 (Task 5) covers them.

If property #4 (anchor influence) fails, your row factory is ignoring the
anchor. Check that the bias logic actually depends on `anchor["..."]` values.

- [ ] **Step 5: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add <<REPO_DIR>>/procedures/sp_generate_<<DATASET_SLUG_UNDERSCORE>>.py
git commit -m "feat(cumulus): <<MIMICS_VENDOR>> row factory + SP entry point"
```

---

## Task 5: Write L2 SP integration test

L2 deploys the SP into the `FINS.TEST` schema with a fixture-backed
`V_ACCOUNT_ANCHORS` view, runs it, and asserts coverage + idempotency.

**Files:**
- Create: `<<REPO_DIR>>/tests/integration/test_<<DATASET_SLUG_UNDERSCORE>>_sp.sql`

- [ ] **Step 1: Write the L2 SQL test**

```sql
-- =============================================================================
-- L2 integration test for <<SP_NAME>>
-- =============================================================================
-- Run with:  snow sql -f tests/integration/test_<<DATASET_SLUG_UNDERSCORE>>_sp.sql
-- Expected:  All assertions return TRUE rows. Any FALSE row = test failure.
-- =============================================================================

USE SCHEMA FINS.TEST;

-- 1. Create test fixture: 100 anchors mocking V_ACCOUNT_ANCHORS shape
CREATE OR REPLACE TABLE TEST_V_ACCOUNT_ANCHORS_FIXTURE AS
SELECT * FROM (VALUES
    -- Insert your 100 fixture rows here, in ANCHOR column order, matching
    -- Snowflake_Cumulus_Common/tests/fixtures/sample_anchors.py.
    --
    -- Snowflake doesn't allow direct VALUES → typed view; we materialize
    -- to a TABLE then alias as a view below. Fixture row example:
    --
    -- ('TEST-PERSON-01', 'Avery Stone', '2026-05-28'::DATE, 'Retail',
    --  'PERSON', '2002-03-14'::DATE, 42000, 680, NULL, NULL, NULL,
    --  '94110', 'CA', 'US', 'HYDRATE-001'),
    NULL  -- replace with real data
) AS t(
    ACCOUNT_ID, ACCOUNT_NAME, SNAPSHOT_DATE, CLIENT_CATEGORY,
    ACCOUNT_TYPE_FLAG, BIRTHDATE, ANNUAL_INCOME, CREDIT_SCORE,
    INDUSTRY, ANNUAL_REVENUE, EMPLOYEE_COUNT,
    POSTAL_CODE, STATE_CODE, COUNTRY_CODE, EXTERNAL_ID
);

-- Override V_ACCOUNT_ANCHORS in this schema to point at the fixture
CREATE OR REPLACE VIEW FINS.TEST.V_ACCOUNT_ANCHORS AS
    SELECT * FROM FINS.TEST.TEST_V_ACCOUNT_ANCHORS_FIXTURE;

-- 2. Empty the dataset table for a clean test run
DELETE FROM FINS.TEST.<<DATASET_TABLE>>;

-- 3. First run
CALL FINS.TEST.<<SP_NAME>>();

-- 4. Coverage assertion: distinct accounts in dataset == audience cardinality
SELECT
    (SELECT COUNT(*) FROM FINS.TEST.V_ACCOUNT_ANCHORS WHERE <<AUDIENCE_PREDICATE>>) = 
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.TEST.<<DATASET_TABLE>>)
    AS coverage_assertion_passes;
-- Expected: TRUE

-- 5. Idempotency assertion: second run leaves count unchanged
LET row_count_before NUMBER := (SELECT COUNT(*) FROM FINS.TEST.<<DATASET_TABLE>>);
CALL FINS.TEST.<<SP_NAME>>();
SELECT
    (SELECT COUNT(*) FROM FINS.TEST.<<DATASET_TABLE>>) = :row_count_before
    AS idempotency_assertion_passes;
-- Expected: TRUE

-- 6. Log row exists with STATUS='SUCCEEDED'
SELECT EXISTS (
    SELECT 1 FROM FINS.TEST.TASK_EXECUTION_LOG
    WHERE TASK_NAME = '<<TASK_NAME>>' AND STATUS = 'SUCCEEDED'
) AS log_row_present;
-- Expected: TRUE

-- 7. Cleanup
DELETE FROM FINS.TEST.<<DATASET_TABLE>>;
DROP VIEW IF EXISTS FINS.TEST.V_ACCOUNT_ANCHORS;
DROP TABLE IF EXISTS FINS.TEST.TEST_V_ACCOUNT_ANCHORS_FIXTURE;
```

- [ ] **Step 2: Run the L2 test against `FINS.TEST` (interactive verification)**

```bash
# Pre-req: SP_RUN_WITH_RETRY and TASK_EXECUTION_LOG must exist in FINS.TEST.
# Pre-req: <<DATASET_TABLE>> must exist in FINS.TEST. Deploy:
snow sql --database FINS --schema TEST -f <<REPO_DIR>>/schemas/<<DATASET_TABLE_LOWER>>.sql

# Register the SP into FINS.TEST (one-off; CI does this from artifact):
snow snowpark deploy --database FINS --schema TEST \
    --procedure-name <<SP_NAME>> \
    --procedure-handler "sp_generate_<<DATASET_SLUG_UNDERSCORE>>.main" \
    --procedure-imports "<<REPO_DIR>>/procedures/sp_generate_<<DATASET_SLUG_UNDERSCORE>>.py" \
    --procedure-imports "Snowflake_Cumulus_Common/cumulus_common/"

# Run the test
snow sql -f <<REPO_DIR>>/tests/integration/test_<<DATASET_SLUG_UNDERSCORE>>_sp.sql
```

Expected: 3 assertion rows return `TRUE` (coverage_assertion_passes, idempotency_assertion_passes, log_row_present).

- [ ] **Step 3: Commit**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add <<REPO_DIR>>/tests/integration/test_<<DATASET_SLUG_UNDERSCORE>>_sp.sql
git commit -m "test(cumulus): L2 integration test for <<SP_NAME>>"
```

---

## Task 6: Create the Snowflake TASK that schedules the SP

**Files:**
- Create: `<<REPO_DIR>>/tasks/<<TASK_NAME_LOWER>>.sql`

- [ ] **Step 1: Write the TASK DDL**

```sql
-- =============================================================================
-- FINS.PUBLIC.<<TASK_NAME>>
-- Scheduled task wrapping <<SP_NAME>> via SP_RUN_WITH_RETRY (3 attempts).
-- =============================================================================
-- Cadence:  <<CADENCE>>
-- Schedule: <<CRON>>
-- Wrapper:  FINS.PUBLIC.SP_RUN_WITH_RETRY('<<SP_NAME>>', 3)
-- =============================================================================

CREATE OR REPLACE TASK FINS.PUBLIC.<<TASK_NAME>>
    WAREHOUSE = FINS_WH
    SCHEDULE  = <<CRON>>
AS
    CALL FINS.PUBLIC.SP_RUN_WITH_RETRY('<<SP_NAME>>', 3);

ALTER TASK FINS.PUBLIC.<<TASK_NAME>> RESUME;
```

- [ ] **Step 2: Deploy the task**

```bash
snow sql -f <<REPO_DIR>>/tasks/<<TASK_NAME_LOWER>>.sql
```

Expected: `Task <<TASK_NAME>> successfully created.` and `Statement executed successfully.` (the RESUME).

- [ ] **Step 3: Verify task is scheduled and the next run time is reasonable**

```bash
snow sql -q "SHOW TASKS LIKE '<<TASK_NAME>>' IN SCHEMA FINS.PUBLIC"
```

Expected: 1 row with `state='started'`, `schedule=<<CRON>>`. The next run time depends on the schedule and current UTC time.

- [ ] **Step 4: Commit**

```bash
git add <<REPO_DIR>>/tasks/<<TASK_NAME_LOWER>>.sql
git commit -m "feat(cumulus): schedule <<TASK_NAME>>"
```

---

## Task 7: Grant the dataset table to `CUMULUS_SYNTH_SHARE`

**Files:**
- Create: `<<REPO_DIR>>/shares/grant_to_synth_share.sql`

- [ ] **Step 1: Write the GRANT DDL**

```sql
-- =============================================================================
-- Grant FINS.PUBLIC.<<DATASET_TABLE>> to CUMULUS_SYNTH_SHARE
-- =============================================================================
-- Idempotent — safe to re-run.
-- =============================================================================

GRANT SELECT ON TABLE FINS.PUBLIC.<<DATASET_TABLE>>
    TO SHARE CUMULUS_SYNTH_SHARE;
```

- [ ] **Step 2: Deploy the grant**

```bash
snow sql -f <<REPO_DIR>>/shares/grant_to_synth_share.sql
```

Expected: `Statement executed successfully.`

- [ ] **Step 3: Verify the grant landed**

```bash
snow sql -q "SHOW GRANTS TO SHARE CUMULUS_SYNTH_SHARE" | grep -i <<DATASET_TABLE>>
```

Expected: 1 row matching the dataset table name with `privilege=SELECT`.

- [ ] **Step 4: Commit**

```bash
git add <<REPO_DIR>>/shares/grant_to_synth_share.sql
git commit -m "feat(cumulus): grant <<DATASET_TABLE>> to CUMULUS_SYNTH_SHARE"
```

---

## Task 8: Salesforce Data Cloud setup — create DLO, promote to DMO

This task is partly manual (DC Setup UI) and partly via the dc-connect-api skill.
The result is `<<DC_DMO>>` mounted in DC, joinable to `ssot__Account__dlm`.

- [ ] **Step 1: In Data Cloud, mount the inbound stream from `CUMULUS_SYNTH_SHARE`**

If the share has not yet been mounted (first dataset to land), follow the
one-time DC-side setup in the umbrella spec §8 — add the consumer SF account to
the share, then create the inbound stream in DC pointing at `FINS.PUBLIC.<<DATASET_TABLE>>`.
For subsequent datasets, the share is already mounted; only the per-table stream/DLO
configuration is new.

Use the `dc-connect-api` skill if doing this via REST. Otherwise, DC Setup UI
→ Data Streams → New → Snowflake → existing connection → pick the table.

- [ ] **Step 2: Promote DLO → DMO with column mapping**

In DC, promote `Cumulus<<MIMICS_VENDOR>><<TOPIC>>__dll` to
`<<DC_DMO>>`. Map:

- Snowflake `ACCOUNT_ID` → DC `ssot__AccountId__c` (lookup to `ssot__Account__dlm.ssot__Id__c`)
- Snowflake snake_case columns → DC camelCase fields per the standard SSOT mapper (see
  `Customer_Hydration/docs/foundational_streams.md` for the established convention).

- [ ] **Step 3: Add `<<DC_DMO>>` to the foundational-streams allowlist**

Edit `Customer_Hydration/docs/foundational_streams.md` to add a row in the
appropriate Tier section:

```markdown
| <<DC_DMO>> | Cumulus | <<MIMICS_VENDOR>>-style synthetic data | <<CADENCE>> |
```

- [ ] **Step 4: Verify the DLO populates after the next stream refresh**

```bash
# Wait until DC's next refresh cycle (≤ 1h) or trigger a full refresh:
# (use the dc-stream-full-refresh-via-ui skill if needed)

# Then verify the DMO has rows in DC SQL:
# (in DC's Query Editor)
SELECT COUNT(*) FROM <<DC_DMO>>
```

Expected: row count > 0, matching `SELECT COUNT(*) FROM FINS.PUBLIC.<<DATASET_TABLE>>` (within share lag).

- [ ] **Step 5: Commit the docs change**

```bash
cd /Users/jsifontes/Documents/Git/JDO
git add Customer_Hydration/docs/foundational_streams.md
git commit -m "docs(cumulus): register <<DC_DMO>> in foundational-streams allowlist"
```

---

## Task 9: L3 live smoke test

- [ ] **Step 1: Trigger the SP manually in `jdo-uqj0jr` `FINS.PUBLIC`**

```bash
snow sql -q "CALL FINS.PUBLIC.<<SP_NAME>>()"
```

Expected: a status string like `<<TASK_NAME>>: SUCCEEDED rows=NNN accounts=NNN`.

- [ ] **Step 2: Verify TASK_EXECUTION_LOG row**

```bash
snow sql -q "
SELECT EXECUTION_TIME, STATUS, ROWS_INSERTED, ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS
FROM FINS.PUBLIC.TASK_EXECUTION_LOG
WHERE TASK_NAME = '<<TASK_NAME>>'
ORDER BY EXECUTION_TIME DESC
LIMIT 1"
```

Expected: most recent row has `STATUS='SUCCEEDED'`, non-zero `ROWS_INSERTED`,
non-zero `ACCOUNTS_PROCESSED`, NULL `ERROR_MESSAGE`.

- [ ] **Step 3: Smoke-check row count is within ±5% of expected audience**

```bash
snow sql -q "
WITH expected AS (
    SELECT COUNT(*) AS n FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE <<AUDIENCE_PREDICATE>>
),
actual AS (
    SELECT COUNT(DISTINCT ACCOUNT_ID) AS n FROM FINS.PUBLIC.<<DATASET_TABLE>>
)
SELECT
    (SELECT n FROM expected) AS expected,
    (SELECT n FROM actual)   AS actual,
    ABS((SELECT n FROM actual) - (SELECT n FROM expected)) * 100.0
        / NULLIF((SELECT n FROM expected), 0) AS pct_drift"
```

Expected: `pct_drift <= 5`.

- [ ] **Step 4: Sample 10 rows and verify they look plausible**

```bash
snow sql -q "SELECT * FROM FINS.PUBLIC.<<DATASET_TABLE>> ORDER BY HASH(ACCOUNT_ID) LIMIT 10"
```

Inspect the sample. Required:
- All 10 rows have non-null PK fields
- Output values are visibly varied across rows (not all identical)
- Bias-relevant fields look correlated to the input anchor (high-income persons get
  affluent-leaning outputs)

This is a manual eyeball check — there's no automated assertion at L3.

- [ ] **Step 5: Verify the daily email picks up the dataset**

The next 9-AM-ET digest from `SP_DAILY_EMAIL_REPORT` should include a row for
`<<TASK_NAME>>`. If the email has run since Task 9 Step 1, check the inbox now;
otherwise wait until tomorrow.

Acceptance: a green `✓ <<TASK_NAME>>  NNN rows / NNN accts (DD ms)` line in the
CUMULUS DATASET PIPELINES section.

- [ ] **Step 6: Mark Plan <<PLAN_N>> done**

```bash
git log --oneline | head -10
```

Expected: 7-9 commits from this plan, plus 1 docs commit from Task 8 Step 5.

---

## Self-Review (instantiate per dataset)

When you instantiate this template into a per-dataset plan file, run these checks:

**1. Spec coverage:**
- Audience predicate from spec §4 used in: `AUDIENCE_SQL`, `COVERAGE_SQL`, `_anchor_in_audience`, the L1 test fixture override, the L2 test, the L3 smoke check ✓
- Salt from spec §5.3 used in: SP module constant ✓
- Cadence from spec §5.2 used in: TASK CRON, README, AGENTS.md ✓
- Coverage rule from spec §4 used in: L2 test, L3 smoke check ✓

**2. Placeholder scan:** Search for `<<` and `>>` in your instantiated file — there should be **none** left after substitution. Then search for `NotImplementedError` and `replace` (the literal string) — there should be **none** left in the source files (only the template has them).

**3. Type/name consistency:** `<<DATASET_TABLE>>`, `<<SP_NAME>>`, `<<TASK_NAME>>`, `<<DATASET_SALT>>` should each appear with **identical** spelling in: README, AGENTS.md, schema DDL, SP source, task DDL, share grant, L2 test, L3 smoke. A typo here is a silent failure that surfaces only at L3.

**4. Audience-predicate consistency:** Both `AUDIENCE_SQL` and `COVERAGE_SQL` and `_anchor_in_audience` and the L1 fixture override and the L2 test fixture override and the L3 smoke check **all** use the same predicate. Drift here causes the most insidious bug — a coverage gap that no test catches.

If any of the four checks fails, fix inline and re-run. Then proceed to Task 1.
