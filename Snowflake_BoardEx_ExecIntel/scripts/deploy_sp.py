#!/usr/bin/env python3
"""Deploy SP_GENERATE_BOARDEX_EXEC_INTEL into DATA_JEDAIS.FINS__PUBLIC.

Generator-style sibling of Plan 8's `Snowflake_MoneyGuidePro_FinancialPlans/scripts/deploy_sp.py`.
Plan 1 hand-built `procedures/sp_create_procedure.sql` once; Plan 2 automated
that step; Plans 3-10 reuse the recipe with a per-dataset identifier swap so
future datasets can clone with zero manual SQL editing.

What this script does:
  1. Read the SP body from `procedures/sp_generate_boardex_exec_intel.py`.
  2. Read `seed_for` and `assert_coverage` from
     `Snowflake_Cumulus_Common/cumulus_common/{seed,coverage}.py`.
  3. Strip `from __future__` and `from cumulus_common` import lines from the
     SP body (the helpers are inlined; no IMPORTS / no stage).
  4. Emit a single inline-source `CREATE OR REPLACE PROCEDURE ...` SQL file
     at `procedures/sp_create_procedure.sql`.
  5. Run `snow sql -f procedures/sp_create_procedure.sql` (default JWT
     connection — no `-c` flag needed).

Plan 10 deviations from the v1.5 template (and from Plan 8, the closest
structural analog — account-scoped, monthly, single salt, narrow
predicate-filtered cohort):

  - **Smallest Cumulus audience by 4.1×.** ~960 Commercial Banking anchors
    vs Plan 8's 3,920 (the previous title-holder). Plan 10 dethrones Plan 8
    as the smallest Cumulus dataset. SP runtime expected <1s. The deploy
    script itself is unaffected (no audience awareness in the splice
    logic), but the cohort size is why the L1 contract changed even more
    aggressively than Plan 8's (see next bullet).

  - **Cohort-fixture override — first Cumulus dataset where SAMPLE_ANCHORS
    has ZERO relevant cohort members.** Commercial Banking is ~2.6% of the
    anchor pool and the 100-anchor SAMPLE_ANCHORS slice (Retail / Wealth /
    Household / Small Business heavy) contains none. The L1 conftest
    therefore overrides SAMPLE_ANCHORS entirely with an inline 5-anchor
    synthetic Commercial Banking fixture spanning the EMPLOYEE_COUNT and
    INTERLOCK_DEGREE bias bands. The Plan 5/6 graceful-skip pattern is
    explicitly NOT acceptable here — skipping every cohort assertion
    silently would defeat the point. Doesn't affect deploy_sp.py — surfaced
    here only so the SQL-header comment block reflects the structural
    shift. The SP module docstring documents this deviation per AGENTS.md.

  - **Single NULLable column with independent Bernoulli draw.** Simpler
    than Plan 8's PLAN_STATUS-gated 2-NULL setup. RECENT_GOVERNANCE_EVENT_DATE
    is NULL ~70% of rows via a flat 30%/70% Bernoulli — no enum gating,
    no multi-column coordination. The MERGE source SELECT preserves
    `None` -> SQL `NULL` natively. The SP body handles this directly;
    the deploy script just inlines the body intact.

  - **Single salt "boardex"** — same shape as Plan 8. Monthly cadence,
    no year-stable subfields (board structure / governance rating /
    interlock count / dates are all month-bucketed; no vendor case ID).

  - **1 BOOLEAN column** (EXEC_TURNOVER_FLAG) — explicit `::BOOLEAN`
    cast in the MERGE source SELECT (Plan 5 finding, repeated in Plans 7
    and 8). write_pandas can mis-infer int8 on an empty staging table;
    the DC DLO Boolean parse fails on Text-typed inputs. The SP body
    already casts; the deploy script just inlines it.

  - **No ampersand sanitize.** "BoardEx" / "Exec Intel" / "Equilar" /
    "ISS" are all clean — the Jinja-templating gotcha that bit Plan 3
    ("DnB" with a literal ampersand in the original vendor name) does
    not apply here. Plan 7 already dropped this block; Plans 8 and 10
    keep it omitted.

Why inline source instead of `snow snowpark deploy`?
  - The SP imports from `cumulus_common`, a sibling sister package.
  - There are no internal Snowflake stages in this org (only EXTERNAL S3/GCS).
  - The cumulus_common modules are tiny (~80 LoC) and pure-Python — inlining
    the two helpers (`seed_for`, `assert_coverage`) into the SP body keeps
    the SP self-contained without needing a stage and an IMPORTS clause.

Caveats inherited from Plans 2-8:
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
SP_PY = REPO_ROOT / "procedures" / "sp_generate_boardex_exec_intel.py"
SP_SQL = REPO_ROOT / "procedures" / "sp_create_procedure.sql"

# cumulus_common lives as a sibling sister package; locate it relative to JDO root.
CUMULUS_COMMON_ROOT = REPO_ROOT.parent / "Snowflake_Cumulus_Common" / "cumulus_common"
SEED_PY = CUMULUS_COMMON_ROOT / "seed.py"
COVERAGE_PY = CUMULUS_COMMON_ROOT / "coverage.py"

PROCEDURE_FQN = "DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_BOARDEX_EXEC_INTEL"
TABLE_FQN = "DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL"
TASK_NAME = "TASK_MONTHLY_BOARDEX_EXEC_INTEL"
DATASET_SALT = "boardex"

SQL_HEADER = f"""\
-- =============================================================================
-- {PROCEDURE_FQN}  (Snowpark Python SP)
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-10-boardex-exec-intel.md
-- Task:    Plan 10 T6
-- Source:  procedures/sp_generate_boardex_exec_intel.py
--          (with cumulus_common.seed_for + cumulus_common.assert_coverage
--          inlined so the SP body is self-contained — no IMPORTS / no stage).
--          Generated by scripts/deploy_sp.py — do NOT edit by hand.
--
-- Audience: CLIENT_CATEGORY = 'Commercial Banking'
--           ~960 distinct anchors — SMALLEST Cumulus audience by 4.1×
--           (next-smallest is Plan 8 MGP at 3,920). Probed 2026-05-28.
--           Plan 10 dethrones Plan 8 as the smallest Cumulus dataset.
-- Cadence:  MONTHLY ({TASK_NAME})  — first of month at 07:00 UTC.
--           Matches Plans 1-3 / Plan 6 / Plan 8 PRECISELY.
-- Salt:     "{DATASET_SALT}"  (month-bucketed; SINGLE salt — no year-stable
--           subfields. Same simpler shape as Plan 8 / Plan 6.)
-- Table:    {TABLE_FQN}
--           Composite PK (ACCOUNT_ID, PROFILE_MONTH).
--           DC DMO collapses to single-column PK profileMonth__c.
-- 1:1:      Each Commercial Banking anchor produces exactly one row per
--           calendar month (~960 rows/month).
-- Schema:   15 columns — 13 NOT NULL + 1 NULLable (RECENT_GOVERNANCE_EVENT_DATE)
--           + 1 BOOLEAN (EXEC_TURNOVER_FLAG; explicit ::BOOLEAN cast in MERGE
--           source) + 1 GENERATED_AT timestamp.
-- NULL semantics: RECENT_GOVERNANCE_EVENT_DATE NULL ~70% of rows via a flat
--                 30%/70% Bernoulli draw — INDEPENDENT, no multi-column
--                 coordination (compare Plan 8's PLAN_STATUS-gated 2-NULL
--                 setup). Simpler than every prior plan with NULLables.
-- L1 contract: First Cumulus dataset where SAMPLE_ANCHORS has ZERO relevant
--              cohort members — the L1 conftest builds an inline 5-anchor
--              synthetic Commercial Banking fixture spanning the
--              EMPLOYEE_COUNT and INTERLOCK_DEGREE bias bands. Per-anchor
--              range / vocabulary / bias-band / date-coherence invariants
--              replace any rate-convergence approach.
-- Vendor:   BoardEx / Equilar / ISS-style synthetic board-and-exec
--           intelligence. README uses canonical names. No real vendor data
--           / license. "BoardEx" / "Exec Intel" both clean — no Jinja
--           ampersand sanitize required (compare Plan 6's D and B
--           workaround).
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

    # No ampersand sanitize on the SP body. "BoardEx" / "Exec Intel" /
    # "Equilar" / "ISS" are all clean — the Jinja-templating gotcha that
    # bit Plan 3 (D and B, originally written with the ampersand) does
    # not apply here. Plan 7 dropped this block; Plans 8 and 10 keep it
    # omitted.
    sp_clean = _strip_module_docstring_and_imports(sp_src)
    seed_for_def = _extract_helper(seed_src, "seed_for")
    assert_coverage_def = _extract_helper(coverage_src, "assert_coverage")

    # `seed_for` calls `hashlib.sha256`. The Plan 10 SP body does NOT import
    # hashlib at module-top, so we add an `import hashlib` line during splice.
    # Plans 1-8 did the same.
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
        + " -q \"SHOW PROCEDURES LIKE 'SP_GENERATE_BOARDEX_EXEC_INTEL' IN SCHEMA DATA_JEDAIS.FINS__PUBLIC\""
    )
    print("Deploy complete. Verify with:")
    print(f"  {verify_cmd}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
