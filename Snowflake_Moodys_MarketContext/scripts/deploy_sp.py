#!/usr/bin/env python3
"""Deploy SP_GENERATE_MOODYS_MARKET_CONTEXT into FINS.PUBLIC.

Generator-style sibling of Plan 7's `Snowflake_WorldCheck_AML/scripts/deploy_sp.py`
(closest analog: only other live daily-cadence plan). Plan 1 hand-built
`procedures/sp_create_procedure.sql` once; Plan 2 automated that step;
Plans 3-13 reuse the recipe with a per-dataset identifier swap so future
datasets can clone with zero manual SQL editing.

What this script does:
  1. Read the SP body from `procedures/sp_generate_moodys_market_context.py`.
  2. Read `seed_for` and `assert_coverage` from
     `Snowflake_Cumulus_Common/cumulus_common/{seed,coverage}.py`.
  3. Strip `from __future__` and `from cumulus_common` import lines from the
     SP body (the helpers are inlined; no IMPORTS / no stage).
  4. Emit a single inline-source `CREATE OR REPLACE PROCEDURE ...` SQL file
     at `procedures/sp_create_procedure.sql`.
  5. Run `snow sql -f procedures/sp_create_procedure.sql` (default JWT
     connection — no `-c` flag needed).

Plan 13 differences from the v1.5 template (Plan 8 baseline) — FOUR
structural deviations, the most-divergent instantiation in the rollout.
This is the FINAL Cumulus plan in the rollout (13 of 13):

  - **FINAL Cumulus plan in the rollout.** Plans 1-8 shipping live; Plans
    9-12 drafted in parallel; Plan 13 closes out the dataset rollout. The
    structural-deviation count peaks here.

  - **Instrument-scoped, NOT account-scoped.** Reads
    `FINS.PUBLIC.INSTRUMENT_UNIVERSE` directly — no V_ACCOUNT_ANCHORS
    read; no `_anchor_in_audience` predicate. Row factory takes an
    instrument record `(TICKER, INSTRUMENT_NAME, SECTOR, BASE_PRICE)`
    rather than an account anchor. Composite PK is `(TICKER, PROFILE_DATE)`
    with no ACCOUNT_ID column. This is the second non-account-scoped
    Cumulus plan after Plan 4 (Esri / branch-scoped).

  - **Second daily cadence** (after Plan 7). Cron `0 1 * * * UTC`
    (01:00 UTC daily — pre-Asia-open; Tokyo opens at 00:00 UTC, so
    01:00 UTC gives a 30-minute buffer after the synthetic data
    publication AND keeps Plan 7 / Plan 13 clear of each other on the
    shared MAIN_WH_XS warehouse — Plan 7 runs at 06:00 UTC).

  - **Two-salt hybrid model** (`moodys` daily + `moodys_year` year-stable).
    Same shape as Plan 5 (`corelogic` + `corelogic_year`), now applied at
    daily cadence. The two salts are plain string constants in the SP
    module so they get inlined automatically — no helpers in
    cumulus_common need updating.

  - **`_daily_seed` wrapper inlined per Plan 7 pattern.** Cumulus_Common's
    `seed_for` buckets on Y-M only (Plan 0 design choice); the wrapper
    folds the calendar day into the ticker parameter so we get a unique
    seed per (ticker, calendar day). The wrapper lives IN the SP module
    (not in cumulus_common) so it gets inlined automatically as part of
    the SP body. Plan 7 and Plan 13 are the only two daily-cadence plans;
    no need to promote the wrapper to cumulus_common for two consumers.

  - **INSTRUMENT_UNIVERSE schema drift caught at draft time.** The umbrella
    spec said the audience was `WHERE IS_ACTIVE = TRUE` keyed by
    INSTRUMENT_ID; live INSTRUMENT_UNIVERSE has TICKER PK and no
    IS_ACTIVE column. Plan 13 keys on TICKER and reads the full table
    unconditionally. Same shape of fix as Plan 8's `run_ts.date()` vs
    `month_start.date()` rowspec drift — caught at draft time, no spec
    amendment needed since Plan 13 is the only consumer.

  - **Snowflake digit-leading column rename.** Snowflake identifiers cannot
    begin with a digit, so the rowspec fields `52_WEEK_HIGH_PRICE`,
    `52_WEEK_LOW_PRICE`, and `30_DAY_PRICE_CHANGE_PCT` are renamed at the
    DDL level to `FIFTY_TWO_WEEK_HIGH_PRICE`, `FIFTY_TWO_WEEK_LOW_PRICE`,
    and `THIRTY_DAY_PRICE_CHANGE_PCT`. The output dict keys, MERGE source
    SELECT, and DC field mapping all use the renamed identifiers
    consistently.

  - **0 BOOLEAN, 1 NULLable** (OUTLOOK_LAST_CHANGED_DATE). Simplest
    NULL/Boolean footprint of any Cumulus dataset — the DC Boolean-
    declaration ceremony from Plans 5/7/8 is NOT needed here. The single
    NULLable column passes None -> SQL NULL transparently through
    write_pandas; no special MERGE source SELECT cast.

  - **No sanitize step.** "Moody's" carries an apostrophe in the
    human-facing description text but the directory and table names
    (Moodys / MOODYS) drop it. Module docstrings use double-quoted Python
    strings so the apostrophe is fine inside the body. There is no
    ampersand to sanitize either — the Plan 3 `DnB` rename cleaning
    step is intentionally OMITTED here (no ampersand appears in any
    Plan 13 vendor name, identifier, comment, or string literal).

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
SP_PY = REPO_ROOT / "procedures" / "sp_generate_moodys_market_context.py"
SP_SQL = REPO_ROOT / "procedures" / "sp_create_procedure.sql"

# cumulus_common lives as a sibling sister package; locate it relative to JDO root.
CUMULUS_COMMON_ROOT = REPO_ROOT.parent / "Snowflake_Cumulus_Common" / "cumulus_common"
SEED_PY = CUMULUS_COMMON_ROOT / "seed.py"
COVERAGE_PY = CUMULUS_COMMON_ROOT / "coverage.py"

PROCEDURE_FQN = "FINS.PUBLIC.SP_GENERATE_MOODYS_MARKET_CONTEXT"
TABLE_FQN = "FINS.PUBLIC.MOODYS_MARKET_CONTEXT"
TASK_NAME = "TASK_DAILY_MOODYS_MARKET_CONTEXT"
DATASET_SALT = "moodys"

SQL_HEADER = f"""\
-- =============================================================================
-- {PROCEDURE_FQN}  (Snowpark Python SP)
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-13-moodys-market-context.md
-- Task:    Plan 13 T6  (FINAL Cumulus plan in the rollout — 13 of 13)
-- Source:  procedures/sp_generate_moodys_market_context.py
--          (with cumulus_common.seed_for + cumulus_common.assert_coverage
--          inlined so the SP body is self-contained — no IMPORTS / no stage).
--          Generated by scripts/deploy_sp.py — do NOT edit by hand.
--
-- Audience: INSTRUMENT-SCOPED — full INSTRUMENT_UNIVERSE table, no WHERE
--           clause (live schema has TICKER PK and no IS_ACTIVE column;
--           spec-drift fix vs the umbrella spec). ~2,004 distinct tickers.
--           NOT account-scoped — second non-account-scoped plan after
--           Plan 4 / Esri (branch-scoped). No V_ACCOUNT_ANCHORS read; no
--           `_anchor_in_audience` predicate.
-- Cadence:  DAILY ({TASK_NAME})  — second daily-cadence Cumulus plan
--           after Plan 7 / WorldCheck. Reuses Plan 7's `_daily_seed`
--           wrapper inlined.
-- Salts:    "{DATASET_SALT}"        (day-bucketed via _daily_seed wrapper;
--                                    drives daily market signals — volatility,
--                                    30-day change, market-cap daily noise)
--           "{DATASET_SALT}_year"   (year-stable via datetime(year, 1, 1);
--                                    drives editorial signals — credit rating,
--                                    outlook, 52-week band, agency flag count,
--                                    liquidity tier, shares-outstanding base)
--           Two-salt hybrid model — same shape as Plan 5
--           ("corelogic" + "corelogic_year"), now at daily cadence.
-- Table:    {TABLE_FQN}
--           Composite PK (TICKER, PROFILE_DATE).
--           DC DMO collapses to single-column PK profileDate__c with
--           KQ qualifier on ticker__c (single-column-PK rule from Plan 4).
-- 1:1:      Each instrument produces exactly one row per profile day.
-- Vendor:   Moody's Investors Service / Moody's Analytics-style synthetic
--           credit-rating + market-context dataset. Apostrophe in the
--           vendor name is human-facing only; directory and identifier
--           names use Moodys / MOODYS without apostrophe.
-- Schema-drift note: rowspec field names `52_WEEK_HIGH_PRICE`,
--           `52_WEEK_LOW_PRICE`, `30_DAY_PRICE_CHANGE_PCT` renamed at the
--           DDL level to FIFTY_TWO_WEEK_HIGH_PRICE, FIFTY_TWO_WEEK_LOW_PRICE,
--           THIRTY_DAY_PRICE_CHANGE_PCT — Snowflake identifiers cannot
--           begin with a digit.
-- NULL/Boolean footprint: 0 BOOLEAN, 1 NULLable
--           (OUTLOOK_LAST_CHANGED_DATE). Simplest of any Cumulus dataset.
-- =============================================================================

CREATE OR REPLACE PROCEDURE {PROCEDURE_FQN}()
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
    # Plan 13 has no ampersand in branding ("Moody's Investors Service" /
    # "Moody's Analytics") — the Plan 3 sanitize step is intentionally
    # OMITTED here. The apostrophe in "Moody's" appears only in
    # human-facing description text; the SP module uses double-quoted
    # Python strings so the apostrophe round-trips fine through inlining
    # into the SQL `$$ ... $$` block (Snowflake's dollar-quoted-string
    # delimiter does not interpret apostrophes).
    seed_for_def = _extract_helper(seed_src, "seed_for")
    assert_coverage_def = _extract_helper(coverage_src, "assert_coverage")

    # `seed_for` calls `hashlib.sha256`. The Plan 13 SP body does NOT import
    # hashlib at module-top, so we add an `import hashlib` line during
    # splice. Plans 1-7 did the same.
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
        + " -q \"SHOW PROCEDURES LIKE 'SP_GENERATE_MOODYS_MARKET_CONTEXT' IN SCHEMA FINS.PUBLIC\""
    )
    print("Deploy complete. Verify with:")
    print(f"  {verify_cmd}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
