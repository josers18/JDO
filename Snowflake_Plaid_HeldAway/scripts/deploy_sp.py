#!/usr/bin/env python3
"""Deploy SP_GENERATE_PLAID_HELD_AWAY into DATA_JEDAIS.FINS__PUBLIC.

Generator-style sibling of Plan 5's `Snowflake_CoreLogic_Property/scripts/deploy_sp.py`.
Plan 1 hand-built `procedures/sp_create_procedure.sql` once; Plan 2 automated
that step; Plans 3-6 reuse the recipe with a per-dataset identifier swap so
future datasets can clone with zero manual SQL editing.

What this script does:
  1. Read the SP body from `procedures/sp_generate_plaid_held_away.py`.
  2. Read `seed_for` and `assert_coverage` from
     `Snowflake_Cumulus_Common/cumulus_common/{seed,coverage}.py`.
  3. Strip `from __future__` and `from cumulus_common` import lines from the
     SP body (the helpers are inlined; no IMPORTS / no stage).
  4. Emit a single inline-source `CREATE OR REPLACE PROCEDURE ...` SQL file
     at `procedures/sp_create_procedure.sql`.
  5. Run `snow sql --role ACCOUNTADMIN -f procedures/sp_create_procedure.sql`
     (default JWT connection, no `-c` flag needed). The SP is
     `EXECUTE AS OWNER` and `write_pandas` creates a temp table, so the owner
     needs CREATE TABLE on FINS__PUBLIC. ACCOUNTADMIN has it; recreating the
     SP as the default SYSADMIN role makes every CALL fail with
     "Insufficient privileges ... CREATE TABLE".

Plan 6 differences from Plan 5:
  - **First 1:N dataset.** `_rows_for(anchor, run_ts) -> list[dict]` returns
    1-5 rows per anchor (vs Plans 1-5's `_row_for(...) -> dict`). The SP body
    flattens via `records.extend(_rows_for(anchor, run_ts))`.
  - **Composite PK** `(ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH)` —
    table DDL and MERGE ON. DC DMO collapses to single-column PK
    `heldAwayAccountId__c`.
  - **Two-part coverage assertion.** Distinct ACCOUNT_ID == audience size
    (via `assert_coverage`), plus an inline band check that total rows are
    in `[audience, 5*audience]`. Plans 1-5 had a single-equality assert.
  - **MONTHLY cadence** (TASK_MONTHLY_PLAID_HELD_AWAY) — Plan 5 was QUARTERLY;
    live cron is `35 3 1 * * America/New_York`.
  - **Account-scoped audience** `CLIENT_CATEGORY IN ('Retail', 'Wealth
    Management', 'Small Business', 'Commercial Banking')` — 30,997 anchors
    (25,381 personal + 5,616 business, 2026-10-24). No NULL-fallback needed.
  - **`IS_ACTIVE` BOOLEAN field.** First Cumulus dataset with a BOOLEAN column.
    DC needs explicit `Boolean` declaration in the DLO+DMO field input
    (Plan 5 finding). The MERGE source SELECT casts `IS_ACTIVE::BOOLEAN`
    defensively (write_pandas could mis-type on an empty target).
  - **4 NULLable columns** (LAST_TRANSACTION_DATE, MONTHLY_NET_FLOW_USD,
    INVESTMENT_RISK_TIER, INTEREST_RATE_PCT) — conditional on IS_ACTIVE /
    ACCOUNT_TYPE. The MERGE source SELECT preserves `None` -> `NULL`.
  - **Seed streams (v2/v3).** `"plaid"` (month-bucketed) drives balance
    noise, activity and flow; `plaid_identity` (no run_ts) fixes row count,
    institution, account type, base balance, link date, risk tier and rate;
    `plaid_beta` / `plaid_transfer` fix each slot's market beta and its
    move-to-another-firm month. `HELD_AWAY_ACCOUNT_ID` is a plain `sha256`
    (NOT `seed_for`) so it is identity-stable across months.
  - No `&` -> `n` sanitize. "Plaid" has no `&`, so the Jinja-templating
    gotcha that bit Plan 3 doesn't apply here.

Why inline source instead of `snow snowpark deploy`?
  - The SP imports from `cumulus_common`, a sibling sister package.
  - There are no internal Snowflake stages in this org (only EXTERNAL S3/GCS).
  - The cumulus_common modules are tiny (~80 LoC) and pure-Python — inlining
    the two helpers (`seed_for`, `assert_coverage`) into the SP body keeps
    the SP self-contained without needing a stage and an IMPORTS clause.

Caveats inherited from Plans 2-5:
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

    `--connection` is optional (the default JWT connection is active).
    `--role` defaults to ACCOUNTADMIN; see step 5 for why.
"""
from __future__ import annotations

import argparse
import pathlib
import re
import subprocess
import sys


REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
SP_PY = REPO_ROOT / "procedures" / "sp_generate_plaid_held_away.py"
SP_SQL = REPO_ROOT / "procedures" / "sp_create_procedure.sql"

# cumulus_common lives as a sibling sister package; locate it relative to JDO root.
CUMULUS_COMMON_ROOT = REPO_ROOT.parent / "Snowflake_Cumulus_Common" / "cumulus_common"
SEED_PY = CUMULUS_COMMON_ROOT / "seed.py"
COVERAGE_PY = CUMULUS_COMMON_ROOT / "coverage.py"

PROCEDURE_FQN = "DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_PLAID_HELD_AWAY"
TABLE_FQN = "DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY"
TASK_NAME = "TASK_MONTHLY_PLAID_HELD_AWAY"
DATASET_SALT = "plaid"

SQL_HEADER = f"""\
-- =============================================================================
-- {PROCEDURE_FQN}  (Snowpark Python SP)
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-6-plaid-held-away.md
-- Task:    Plan 6 T6
-- Source:  procedures/sp_generate_plaid_held_away.py
--          (with cumulus_common.seed_for + cumulus_common.assert_coverage
--          inlined so the SP body is self-contained — no IMPORTS / no stage).
--          Generated by scripts/deploy_sp.py — do NOT edit by hand.
--
-- Audience: CLIENT_CATEGORY IN ('Retail', 'Wealth Management',
--           'Small Business', 'Commercial Banking') — 30,997 anchors
--           (25,381 personal + 5,616 business).
-- Owner:    run as ACCOUNTADMIN (EXECUTE AS OWNER; write_pandas needs
--           CREATE TABLE on FINS__PUBLIC).
-- Market:   v3 — investment balances follow _MARKET_RETURNS x per-slot beta;
--           ~4% of personal Brokerage/Managed Portfolio/IRA slots move out.
-- Cadence:  MONTHLY ({TASK_NAME})
-- Salt:     "{DATASET_SALT}" (month-bucketed: balance drift, activity, flow) and
--           "plaid_identity" (no run_ts: row count, institution, account type,
--           link date, risk tier, rate). HELD_AWAY_ACCOUNT_ID is plain sha256,
--           identity-stable across months.
-- Backfill: CALL {PROCEDURE_FQN}('2026-05-01'::DATE) regenerates one month.
-- Table:    {TABLE_FQN}
--           Composite PK (ORG_ID, ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH).
--           DC DMO collapses to single-column PK heldAwayAccountId__c.
-- 1:N:      First 1:N dataset in the rollout — each anchor produces 1-5
--           rows/month. Total ~66,500 rows/month.
-- Vendor:   Plaid-style (held-away financial accounts) — README uses
--           canonical name.
-- =============================================================================

CREATE OR REPLACE PROCEDURE {PROCEDURE_FQN}(RUN_MONTH DATE DEFAULT NULL)
RETURNS STRING
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'pandas')
HANDLER = 'main'
EXECUTE AS OWNER
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
    # Drop module-level docstring if present (triple-quoted at file start).
    src = re.sub(
        r'^\s*"""[\s\S]*?"""\s*\n',
        "",
        src,
        count=1,
    )
    # Drop `from __future__ import ...` lines.
    src = re.sub(r"^from __future__ import .*\n", "", src, flags=re.MULTILINE)
    # Drop `from cumulus_common import ...` lines.
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
        # Stop at the next top-level def/class/assignment.
        if line and line[0] not in (" ", "\t", "\n", "#"):
            break
        out.append(line)
    if not out:
        raise RuntimeError(f"could not find `def {func_name}` in source")
    # Trim trailing blank lines.
    while out and out[-1].strip() == "":
        out.pop()
    return "".join(out) + "\n"


def build_sql() -> str:
    sp_src = SP_PY.read_text()
    seed_src = SEED_PY.read_text()
    coverage_src = COVERAGE_PY.read_text()

    sp_clean = _strip_module_docstring_and_imports(sp_src)
    # Plan 6 has no `&` in branding ("Plaid" / "HeldAway") — the
    # `D&B -> DnB` sanitize from Plan 3 is intentionally OMITTED here.
    seed_for_def = _extract_helper(seed_src, "seed_for")
    assert_coverage_def = _extract_helper(coverage_src, "assert_coverage")

    # `seed_for` calls `hashlib.sha256`; the Plaid SP body already imports
    # hashlib at module-top (used directly for HELD_AWAY_ACCOUNT_ID), so we
    # do NOT need to add another `import hashlib` here. Plans 1-5 added it
    # because their SP bodies didn't import hashlib themselves.
    inlined_helpers = (
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

    # Insert helpers after the import block (and any blank lines that follow it).
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
        "--role",
        default="ACCOUNTADMIN",
        help="Role that creates (and so owns) the SP (default: ACCOUNTADMIN).",
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

    cmd = ["snow", "sql", "--role", args.role, "-f", str(SP_SQL)]
    if args.connection:
        cmd[2:2] = ["-c", args.connection]
    print(f"Deploying SP via: {' '.join(cmd)}")
    rc = subprocess.call(cmd)
    if rc != 0:
        print(f"ERROR: snow sql exited with code {rc}", file=sys.stderr)
        return rc

    verify_cmd = (
        "snow sql"
        + (f" -c {args.connection}" if args.connection else "")
        + f" --role {args.role}"
        + " -q \"SHOW PROCEDURES LIKE 'SP_GENERATE_PLAID_HELD_AWAY' IN SCHEMA DATA_JEDAIS.FINS__PUBLIC\""
    )
    print("Deploy complete. Verify with:")
    print(f"  {verify_cmd}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
