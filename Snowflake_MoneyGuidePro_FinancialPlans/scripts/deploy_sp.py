#!/usr/bin/env python3
"""Deploy SP_GENERATE_MGP_FINANCIAL_PLANS into DATA_JEDAIS.FINS__PUBLIC.

Generator-style sibling of Plan 7's `Snowflake_WorldCheck_AML/scripts/deploy_sp.py`.
Plan 1 hand-built `procedures/sp_create_procedure.sql` once; Plan 2 automated
that step; Plans 3-8 reuse the recipe with a per-dataset identifier swap so
future datasets can clone with zero manual SQL editing.

What this script does:
  1. Read the SP body from `procedures/sp_generate_mgp_financial_plans.py`.
  2. Read `seed_for` and `assert_coverage` from
     `Snowflake_Cumulus_Common/cumulus_common/{seed,coverage}.py`.
  3. Strip `from __future__` and `from cumulus_common` import lines from the
     SP body (the helpers are inlined; no IMPORTS / no stage).
  4. Emit a single inline-source `CREATE OR REPLACE PROCEDURE ...` SQL file
     at `procedures/sp_create_procedure.sql`.
  5. Run `snow sql -f procedures/sp_create_procedure.sql` (default JWT
     connection — no `-c` flag needed).

Plan 8 deviations from the v1.5 template (and from Plan 7):

  - **Smallest Cumulus audience by 2.9×.** ~3,920 Wealth Management anchors
    vs Plan 2/3's 11,389 (next-smallest). Plan 7 was the first all-accounts
    dataset (~36,813); Plan 8 is the opposite extreme — narrowest cohort
    yet. SP runtime expected <2s. The deploy script itself is unaffected
    (no audience awareness in the splice logic), but the cohort size is
    why the L1 contract changed (see next bullet).

  - **Per-anchor invariants instead of distributional.** First Cumulus
    dataset whose cohort is too small for distributional rate convergence
    (SAMPLE_ANCHORS at 100 anchors yields only ~3-5 Wealth anchors). L1
    tests assert per-anchor predicates (e.g. "every age <35 anchor has
    Aggressive or Moderate Aggressive allocation"), not mean comparisons.
    Doesn't affect deploy_sp.py — surfaced here only so the SQL-header
    comment block reflects the structural shift.

  - **Status-driven NULL semantics.** First Cumulus dataset where two
    NULLable date columns (LAST_REVIEW_DATE, NEXT_REVIEW_DATE) are gated
    by a non-Boolean enum (PLAN_STATUS Active/Draft/Stale). Plan 7 had
    two NULLables conditional on a Boolean and a rating tier; Plan 8
    consolidates the gating to one VARCHAR(20) status enum. The SP body
    handles this via `_review_dates(plan_status, ...)`; the deploy
    script just inlines the body intact.

  - **Single salt "mgp"** — back to the simpler shape. Plan 5 had two
    salts; Plan 7 had three (`worldcheck` + `worldcheck_jurisdiction` +
    `worldcheck_case`); Plan 8 reverts to one because no field is
    year-stable in this dataset (PLAN_STATUS, allocation, MC%, review
    dates are all month-bucketed; vendor case ID isn't part of the
    schema). Same shape as Plan 6.

  - **1 BOOLEAN column** (ADVISOR_NOTES_FLAG) — explicit `::BOOLEAN`
    cast in the MERGE source SELECT (Plan 5 finding, repeated in Plan 7).
    write_pandas can mis-infer int8 on an empty staging table; the DC
    DLO Boolean parse fails on Text-typed inputs. The SP body already
    casts; the deploy script just inlines it.

  - **2 NULLable date columns** (LAST_REVIEW_DATE, NEXT_REVIEW_DATE),
    both gated by PLAN_STATUS. The MERGE source SELECT lets `None` pass
    through to SQL `NULL` natively — same pattern as Plan 7's
    ADVERSE_MEDIA_CATEGORIES / CASE_REFERENCE.

  - **`_age_from_birthdate` helper local to the SP module.** Inlined
    automatically because it's a top-level def, not from cumulus_common.
    Same auto-inlining behaviour as Plan 7's `_daily_seed` helper.

  - **No `&` -> `n` sanitize.** "MGP" / "MoneyGuidePro" / "eMoney" /
    "NaviPlan" all clean — the Jinja-templating gotcha that bit Plan 3
    doesn't apply. Plan 7 already dropped this block; Plan 8 keeps it
    omitted.

Why inline source instead of `snow snowpark deploy`?
  - The SP imports from `cumulus_common`, a sibling sister package.
  - There are no internal Snowflake stages in this org (only EXTERNAL S3/GCS).
  - The cumulus_common modules are tiny (~80 LoC) and pure-Python — inlining
    the two helpers (`seed_for`, `assert_coverage`) into the SP body keeps
    the SP self-contained without needing a stage and an IMPORTS clause.

Caveats inherited from Plans 2-7:
  - If cumulus_common grows beyond a couple of hundred LoC, switch to a
    stage-based deploy: `PUT cumulus_common.zip @SP_DEPLOY_STAGE; CREATE
    PROCEDURE ... IMPORTS = ('@SP_DEPLOY_STAGE/cumulus_common.zip') ...`.
  - First-call gotcha: `session.write_pandas(..., auto_create_table=True)`
    auto-creates the staging table from DataFrame dtypes; Python `datetime`
    becomes `datetime64[ns]` becomes Snowflake `NUMBER(38,0)` (nanoseconds-
    since-epoch). The MERGE has to cast back to TIMESTAMP_NTZ via
    `TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1e9)`. The SP body in this
    package already does this — copy that pattern when cloning to new
    datasets.

Usage:
    python scripts/deploy_sp.py [--connection NAME] [--no-deploy]

    `--connection` is optional. The default JWT connection is now active so
    `snow sql -f ...` works flag-less.
"""
from __future__ import annotations

import argparse
import pathlib
import re
import subprocess
import sys


REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
SP_PY = REPO_ROOT / "procedures" / "sp_generate_mgp_financial_plans.py"
SP_SQL = REPO_ROOT / "procedures" / "sp_create_procedure.sql"

# cumulus_common lives as a sibling sister package; locate it relative to JDO root.
CUMULUS_COMMON_ROOT = REPO_ROOT.parent / "Snowflake_Cumulus_Common" / "cumulus_common"
SEED_PY = CUMULUS_COMMON_ROOT / "seed.py"
COVERAGE_PY = CUMULUS_COMMON_ROOT / "coverage.py"

PROCEDURE_FQN = "DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MGP_FINANCIAL_PLANS"
TABLE_FQN = "DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS"
TASK_NAME = "TASK_MONTHLY_MGP_FINANCIAL_PLANS"
DATASET_SALT = "mgp"

SQL_HEADER = f"""\
-- =============================================================================
-- {PROCEDURE_FQN}  (Snowpark Python SP)
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-8-mgp-financial-plans.md
-- Task:    Plan 8 T6
-- Source:  procedures/sp_generate_mgp_financial_plans.py
--          (with cumulus_common.seed_for + cumulus_common.assert_coverage
--          inlined so the SP body is self-contained — no IMPORTS / no stage).
--          Generated by scripts/deploy_sp.py — do NOT edit by hand.
--
-- Audience: CLIENT_CATEGORY = 'Wealth Management'
--           ~3,920 distinct anchors — SMALLEST Cumulus audience by 2.9×
--           (next-smallest is Plan 2/3 at 11,389). Probed 2026-05-28.
-- Cadence:  MONTHLY ({TASK_NAME})  — first of month at 07:00 UTC.
--           Matches Plans 1-3 / Plan 6; reverts after Plan 7's daily.
-- Salt:     "{DATASET_SALT}"  (month-bucketed; SINGLE salt — no year-stable
--           subfields, unlike Plan 7's three-salt arrangement; back to
--           Plan 6's simpler shape).
-- Table:    {TABLE_FQN}
--           Composite PK (ACCOUNT_ID, PROFILE_MONTH).
--           DC DMO collapses to single-column PK profileMonth__c.
-- 1:1:      Each Wealth anchor produces exactly one row per calendar month
--           (~3,920 rows/month).
-- Schema:   14 columns — 12 NOT NULL + 2 NULLable (LAST_REVIEW_DATE,
--           NEXT_REVIEW_DATE, both gated by PLAN_STATUS) + 1 BOOLEAN
--           (ADVISOR_NOTES_FLAG; explicit ::BOOLEAN cast in MERGE source).
-- NULL semantics: PLAN_STATUS='Draft' → LAST_REVIEW_DATE NULL.
--                 PLAN_STATUS='Stale' → NEXT_REVIEW_DATE NULL.
--                 PLAN_STATUS='Active' → both populated.
--                 First Cumulus dataset gated by a non-Boolean enum.
-- Vendor:   MoneyGuidePro / eMoney / NaviPlan-style synthetic plans —
--           README uses canonical name. No real vendor data / license.
-- =============================================================================

CREATE OR REPLACE PROCEDURE {PROCEDURE_FQN}(NUM_MONTHS INT DEFAULT 1)
RETURNS STRING
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'pandas')
HANDLER = 'main'
EXECUTE AS CALLER
AS
$$
"""

SQL_FOOTER = "$$;\n"


def _strip_module_docstring_and_imports(src: str) -> str:
    """Strip module docstring, `from __future__`, and `from cumulus_common` lines.

    The SP body inlines the cumulus_common helpers directly, so the import
    must be removed. Module docstring is dropped because it duplicates info
    already in the SQL header comments.
    """
    src = re.sub(
        r'^\s*"""[\s\S]*?"""\s*\n',
        "",
        src,
        count=1,
    )
    src = re.sub(r"^from __future__ import .*\n", "", src, flags=re.MULTILINE)
    src = re.sub(r"^from cumulus_common(?:\.[\w]+)? import .*\n", "", src, flags=re.MULTILINE)
    return src


def _extract_helper(src: str, func_name: str) -> str:
    """Extract a top-level `def func_name(...)` definition with its body.

    Walks line-by-line looking for the `def` and stops when indentation
    returns to column 0 on a non-blank, non-comment line (or EOF).
    """
    lines = src.splitlines(keepends=True)
    out: list[str] = []
    in_func = False
    for line in lines:
        if not in_func:
            if line.lstrip().startswith(f"def {func_name}("):
                in_func = True
                out.append(line)
            continue
        if line and line[0] not in (" ", "\t", "\n", "#"):
            break
        out.append(line)
    if not out:
        raise RuntimeError(f"could not find `def {func_name}` in source")
    while out and out[-1].strip() == "":
        out.pop()
    return "".join(out) + "\n"


def build_sql() -> str:
    sp_src = SP_PY.read_text()
    seed_src = SEED_PY.read_text()
    coverage_src = COVERAGE_PY.read_text()

    # No `&` -> `n` sanitize on the SP body. "MGP" / "MoneyGuidePro" / "eMoney"
    # / "NaviPlan" are all clean — the Jinja-templating gotcha that bit Plan 3
    # ("D&B" → "DnB") does not apply here. Plan 7 already dropped this block;
    # Plan 8 intentionally keeps it omitted.
    sp_clean = _strip_module_docstring_and_imports(sp_src)
    seed_for_def = _extract_helper(seed_src, "seed_for")
    assert_coverage_def = _extract_helper(coverage_src, "assert_coverage")

    # `seed_for` calls `hashlib.sha256`. The Plan 8 SP body does NOT import
    # hashlib at module-top, so we add an `import hashlib` line during splice.
    # Plans 1-7 did the same.
    inlined_helpers = (
        "import hashlib\n\n"
        "# -------------------------------------------------------------------\n"
        "# Inlined from cumulus_common.seed (kept in sync via scripts/deploy_sp.py)\n"
        "# -------------------------------------------------------------------\n"
        f"{seed_for_def}\n"
        "# -------------------------------------------------------------------\n"
        "# Inlined from cumulus_common.coverage (kept in sync via scripts/deploy_sp.py)\n"
        "# -------------------------------------------------------------------\n"
        f"{assert_coverage_def}\n"
    )

    # Inject helpers after the prelude imports. We find the last *top-level*
    # `import`/`from` line in the cleaned SP body (no leading indent — so an
    # `import pandas as pd` nested inside a function won't match). Splice in
    # before the next non-trivial line.
    lines = sp_clean.splitlines(keepends=True)
    last_import_idx = -1
    for i, line in enumerate(lines):
        if line.startswith("import ") or line.startswith("from "):
            last_import_idx = i
    if last_import_idx < 0:
        raise RuntimeError("no import lines found in cleaned SP body — refusing to splice")

    insert_at = last_import_idx + 1
    while insert_at < len(lines) and lines[insert_at].strip() == "":
        insert_at += 1

    body = (
        "from __future__ import annotations\n\n"
        + "".join(lines[:insert_at])
        + "\n"
        + inlined_helpers
        + "\n"
        + "".join(lines[insert_at:])
    )

    return SQL_HEADER + body + SQL_FOOTER


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--connection", "-c",
        default=None,
        help="Snowflake CLI connection name (default: unflagged — use the active JWT connection)",
    )
    parser.add_argument(
        "--no-deploy",
        action="store_true",
        help="Generate sp_create_procedure.sql but skip running snow sql -f.",
    )
    args = parser.parse_args()

    for path in (SP_PY, SEED_PY, COVERAGE_PY):
        if not path.exists():
            print(f"ERROR: {path} does not exist", file=sys.stderr)
            return 1

    print(f"Building {SP_SQL} from {SP_PY} + cumulus_common helpers ...")
    sql = build_sql()
    SP_SQL.write_text(sql)
    print(f"  wrote {SP_SQL} ({len(sql)} bytes)")

    if args.no_deploy:
        print("--no-deploy set; skipping snow sql.")
        return 0

    cmd = ["snow", "sql", "-f", str(SP_SQL)]
    if args.connection:
        cmd[1:1] = ["-c", args.connection]
    print(f"Deploying SP via: {' '.join(cmd)}")
    rc = subprocess.call(cmd)
    if rc != 0:
        print(f"ERROR: snow sql exited with code {rc}", file=sys.stderr)
        return rc

    verify_cmd = (
        "snow sql"
        + (f" -c {args.connection}" if args.connection else "")
        + " -q \"SHOW PROCEDURES LIKE 'SP_GENERATE_MGP_FINANCIAL_PLANS' IN SCHEMA DATA_JEDAIS.FINS__PUBLIC\""
    )
    print("Deploy complete. Verify with:")
    print(f"  {verify_cmd}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
