#!/usr/bin/env python3
"""Deploy SP_GENERATE_GONG_CALL_SENTIMENT into FINS.PUBLIC.

Generator-style sibling of Plan 6's `Snowflake_Plaid_HeldAway/scripts/deploy_sp.py`
and Plan 8's `Snowflake_Mgp_FinancialPlans/scripts/deploy_sp.py`. Plan 1 hand-built
`procedures/sp_create_procedure.sql` once; Plan 2 automated that step; Plans 3-12
reuse the recipe with a per-dataset identifier swap so future datasets can clone
with zero manual SQL editing.

What this script does:
  1. Read the SP body from `procedures/sp_generate_gong_call_sentiment.py`.
  2. Read `seed_for` and `assert_coverage` from
     `Snowflake_Cumulus_Common/cumulus_common/{seed,coverage}.py`.
  3. Strip `from __future__` and `from cumulus_common` import lines from the
     SP body (the helpers are inlined; no IMPORTS / no stage).
  4. Emit a single inline-source `CREATE OR REPLACE PROCEDURE ...` SQL file
     at `procedures/sp_create_procedure.sql`.
  5. Run `snow sql -f procedures/sp_create_procedure.sql` (default JWT
     connection -- no `-c` flag needed).

Plan 12 deviations from Plan 8 (the structural sibling):
  - **Second weekly cadence Cumulus plan.** Plan 6 (Plaid Held-Away) was monthly;
    among the active rollout Plan 12 lands on the same weekly cron Plan 9
    (Synth Relationship Graph) is being drafted against:
    `'USING CRON 0 5 * * 1 UTC'` (Monday 05:00 UTC). Plan 8 was monthly
    `'USING CRON 0 7 1 * * UTC'`. Seed pattern shifts from `month_start =
    run_ts.replace(day=1, ...)` to `week_start = run_ts -
    timedelta(days=run_ts.weekday())` truncated to midnight (Monday anchor).
    PROFILE_WEEK column replaces PROFILE_MONTH in the PK.
  - **Two-salt model** -- back to Plan 5/13's two-salt shape after Plan 8's
    single-salt simplification. Primary salt `"gong"` (week-bucketed) drives
    everything that legitimately changes weekly. Secondary salt `"gong_rm"`
    (year-bucketed) drives RM_NAME stickiness -- relationship managers do not
    reassign weekly. A tertiary helper salt `"gong_trend"` (year-bucketed)
    lives inside the row factory as the SENTIMENT_TREND base trajectory; it
    is a row-factory helper rather than a top-level dataset salt. All three
    are plain string constants in the SP module so they get inlined into the
    generated SQL automatically; only the primary `DATASET_SALT` needs to be
    referenced in the SQL_HEADER comment.
  - **Cascade-NULL semantics for the zero-activity boring case.** First
    Cumulus dataset where NULL semantics cascade-collapse from a single
    Boolean predicate. When `CALL_COUNT_LAST_7D == 0`, six fields collapse
    together (TOTAL_TALK_TIME_MINUTES = 0, CUSTOMER_TALK_RATIO_PCT = 0.00,
    OVERALL_SENTIMENT = 'Neutral', KEY_TOPICS_FLAGS IS NULL, LAST_CALL_DATE
    IS NULL, ACTION_ITEMS_COUNT = 0) but the row still emits. Plan 8 had 2
    NULLables gated by a 3-value enum; Plan 12 collapses six fields off a
    single Boolean predicate. The boring case is itself a meaningful row,
    not a row that's filtered out -- so the coverage invariant
    (distinct anchors == distinct accounts in target == audience size) still
    holds the same shape as Plans 1-3, 5, 7, 8.
  - **3 NULLable columns** (KEY_TOPICS_FLAGS, LAST_CALL_DATE,
    NEXT_SCHEDULED_CALL_DATE) plus the auxiliary mixed-gate
    RM_LAST_LOGGED_NOTE_DATE that feeds DEAL_RISK_SCORE via the
    `rm_note_stale` boolean rather than emitting NULL semantics for the
    row's call activity. The MERGE source SELECT preserves `None` -> `NULL`
    for all four. 0 BOOLEAN columns at the table level (Plan 6's Boolean
    cast concern does not apply here).
  - **No ampersand sanitize.** "Gong" is clean; the Jinja-templating
    gotcha that bit Plan 3 (vendor name with the conjunction symbol mapped
    to "DnB") is intentionally OMITTED here.

Why inline source instead of `snow snowpark deploy`?
  - The SP imports from `cumulus_common`, a sibling sister package.
  - There are no internal Snowflake stages in this org (only EXTERNAL S3/GCS).
  - The cumulus_common modules are tiny (~80 LoC) and pure-Python -- inlining
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
    `TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000)`. The SP body in
    this package already does this -- copy that pattern when cloning to new
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
SP_PY = REPO_ROOT / "procedures" / "sp_generate_gong_call_sentiment.py"
SP_SQL = REPO_ROOT / "procedures" / "sp_create_procedure.sql"

# cumulus_common lives as a sibling sister package; locate it relative to JDO root.
CUMULUS_COMMON_ROOT = REPO_ROOT.parent / "Snowflake_Cumulus_Common" / "cumulus_common"
SEED_PY = CUMULUS_COMMON_ROOT / "seed.py"
COVERAGE_PY = CUMULUS_COMMON_ROOT / "coverage.py"

PROCEDURE_FQN = "FINS.PUBLIC.SP_GENERATE_GONG_CALL_SENTIMENT"
TABLE_FQN = "FINS.PUBLIC.GONG_CALL_SENTIMENT"
TASK_NAME = "TASK_WEEKLY_GONG_CALL_SENTIMENT"
DATASET_SALT = "gong"

SQL_HEADER = f"""\
-- =============================================================================
-- {PROCEDURE_FQN}  (Snowpark Python SP)
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-12-gong-call-sentiment.md
-- Task:    Plan 12 T6
-- Source:  procedures/sp_generate_gong_call_sentiment.py
--          (with cumulus_common.seed_for + cumulus_common.assert_coverage
--          inlined so the SP body is self-contained -- no IMPORTS / no stage).
--          Generated by scripts/deploy_sp.py -- do NOT edit by hand.
--
-- Audience: CLIENT_CATEGORY IN ('Wealth Management', 'Commercial Banking')
--           -- 4,880 anchors (Wealth 3,920 + Commercial 960; probed 2026-05-28).
-- Cadence:  WEEKLY ({TASK_NAME})
-- Salt:     "{DATASET_SALT}" (week-bucketed) is the primary rng stream. Plan 12
--           also uses a year-stable secondary salt "gong_rm" for RM_NAME
--           stickiness and a row-factory helper salt "gong_trend" for the
--           SENTIMENT_TREND base trajectory; both are inlined as plain string
--           constants in the SP body so they appear in the generated SQL
--           automatically.
-- Table:    {TABLE_FQN}
--           Composite PK (ACCOUNT_ID, PROFILE_WEEK).
--           DC DMO collapses to single-column PK profileWeek__c with
--           ssot__AccountId__c as a KQ qualifier (single-column-PK rule
--           from Plan 4).
-- 1:1:      Account-scoped 1:1 -- exactly one row per Wealth+Commercial
--           anchor per week. ~4,880 rows/week, ~21,000 rows/month.
-- Cascade:  First Cumulus dataset with cascade-NULL semantics for the
--           zero-activity boring case -- when CALL_COUNT_LAST_7D == 0, six
--           fields collapse to no-call defaults but the row still emits.
-- Vendor:   Gong-style (conversation-intelligence rollups) -- README uses
--           canonical name. No ampersand sanitize ("Gong" is clean).
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
    # Plan 12 has no ampersand in branding ("Gong") -- the
    # vendor-name sanitize from Plan 3 is intentionally OMITTED here.
    seed_for_def = _extract_helper(seed_src, "seed_for")
    assert_coverage_def = _extract_helper(coverage_src, "assert_coverage")

    # `seed_for` calls `hashlib.sha256`; the Gong SP body does NOT import
    # hashlib at module-top, so we inject `import hashlib` alongside the
    # inlined helpers. Same shape as Plans 1-5, 7, 8.
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
    # `import`/`from` line in the cleaned SP body (no leading indent -- so an
    # `import pandas as pd` nested inside a function won't match). Splice in
    # before the next non-trivial line.
    lines = sp_clean.splitlines(keepends=True)
    last_import_idx = -1
    for i, line in enumerate(lines):
        if line.startswith("import ") or line.startswith("from "):
            last_import_idx = i
    if last_import_idx < 0:
        raise RuntimeError("no import lines found in cleaned SP body -- refusing to splice")

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
        help="Snowflake CLI connection name (default: unflagged -- use the active JWT connection)",
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
        + " -q \"SHOW PROCEDURES LIKE 'SP_GENERATE_GONG_CALL_SENTIMENT' IN SCHEMA FINS.PUBLIC\""
    )
    print("Deploy complete. Verify with:")
    print(f"  {verify_cmd}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
