#!/usr/bin/env python3
"""Deploy SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS into FINS.PUBLIC.

Generator-style sibling of Plan 8's `Snowflake_MoneyGuidePro_FinancialPlans/
scripts/deploy_sp.py`. Plan 1 hand-built `procedures/sp_create_procedure.sql`
once; Plan 2 automated that step; Plans 3-11 reuse the recipe with a
per-dataset identifier swap so future datasets can clone with zero manual
SQL editing.

What this script does:
  1. Read the SP body from
     `procedures/sp_generate_zoominfo_firmographics.py`.
  2. Read `seed_for` and `assert_coverage` from
     `Snowflake_Cumulus_Common/cumulus_common/{seed,coverage}.py`.
  3. Strip `from __future__` and `from cumulus_common` import lines from the
     SP body (the helpers are inlined; no IMPORTS / no stage).
  4. Emit a single inline-source `CREATE OR REPLACE PROCEDURE ...` SQL file
     at `procedures/sp_create_procedure.sql`.
  5. Run `snow sql -f procedures/sp_create_procedure.sql` (default JWT
     connection -- no `-c` flag needed).

Plan 11 deviations from the v1.5 template:

  - **Most boring Plan structurally in the Cumulus rollout.** Same
    audience predicate as Plans 2 (MSCI ESG) and 3 (DnB Business Credit),
    same monthly cadence, same 1:1 row shape, same MERGE pattern. The
    deploy script itself is verbatim shape-wise from Plans 2/3/8 -- only
    identifier constants differ (PROCEDURE_FQN, TABLE_FQN, TASK_NAME,
    DATASET_SALT). The structural sameness is the point: Plan 11 is
    intentionally the lowest-deviation Plan in the rollout so the recipe
    proves itself at clone-and-swap velocity.

  - **Defensive string handling (per Plan 4 v1.5 findings).** Three
    V_ACCOUNT_ANCHORS string columns require defensive projection in the
    SP body: COUNTRY_CODE projected as literal "US" regardless of source
    value (4 dirty-literal rows in the source view); POSTAL_CODE
    synth-fallback to a 5-digit ZIP from seed bytes when raw is empty
    (10,798 empty-string rows); STATE_CODE fallback via SP-local
    _state_from_zip helper (10-entry ZIP-first-digit to 2-char state
    mapping) when raw is blank. The L1 tests assert these as defensive
    string invariants -- every row must satisfy len(HQ_COUNTRY_CODE)==2,
    len(HQ_STATE_CODE)==2, len(HQ_POSTAL_CODE)==5 and non-empty. The
    deploy script just inlines the SP body intact; the helpers are
    SP-local top-level defs and auto-inline via `_extract_helper`-style
    walk (same as Plan 7's `_daily_seed`, Plan 8's `_age_from_birthdate`).

  - **2 NULLable VARCHAR columns** (WEBSITE_DOMAIN, TECH_STACK_FLAGS) gated
    by data-availability heuristics, NOT enums. Lighter-weight than Plan
    8's enum-driven NULL gating because the BUSINESS audience is large
    enough (12,021 rows) for distributional rate convergence to work --
    L1 asserts ~99.5% non-null and ~90% non-null over a 3+ month roll
    rather than per-anchor invariants. The MERGE source SELECT lets
    `None` pass through to SQL `NULL` natively -- same pattern as Plan
    7's ADVERSE_MEDIA_CATEGORIES / Plan 8's review-date columns.

  - **No BOOLEAN columns** -- contrast with Plan 7's NEGATIVE_FLAG / Plan
    8's ADVISOR_NOTES_FLAG. No explicit `::BOOLEAN` cast needed in the
    MERGE source SELECT.

  - **Single salt "zoominfo"** -- back to the simplest shape. Plan 5 had
    two salts; Plan 7 had three (worldcheck plus worldcheck_jurisdiction
    plus worldcheck_case); Plan 11 reverts to one because no field is
    year-stable in this dataset (FOUNDED_YEAR is per-anchor deterministic
    and never re-rolled, but it's not multi-stream-salted; LINKEDIN /
    TECH_STACK_FLAGS / LAST_DATA_REFRESH_DATE jitter all month-bucket on
    the single salt). Same shape as Plan 6 / Plan 8.

  - **No ampersand-to-n sanitize.** "ZoomInfo" is path-clean -- the
    Jinja-templating gotcha that bit Plan 3 (the DnB pun originally written
    with an ampersand) does not apply here. Plan 7 already dropped this
    block; Plans 8 and 11 keep it omitted. The "BUSINESS" misclassification
    caveat (~7K Person Accounts misclassified by the
    `PersonBirthdate__c IS NULL -> BUSINESS` heuristic, real CRM BUSINESS
    cardinality closer to 5K) is documented in the SP body and surfaces
    as a step 1.5 warning when accounts_processed > 10000 -- not a deploy
    concern, just a runtime visibility item.

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
    `TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1e9)`. The SP body in this
    package already does this -- copy that pattern when cloning to new
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
SP_PY = REPO_ROOT / "procedures" / "sp_generate_zoominfo_firmographics.py"
SP_SQL = REPO_ROOT / "procedures" / "sp_create_procedure.sql"

# cumulus_common lives as a sibling sister package; locate it relative to JDO root.
CUMULUS_COMMON_ROOT = REPO_ROOT.parent / "Snowflake_Cumulus_Common" / "cumulus_common"
SEED_PY = CUMULUS_COMMON_ROOT / "seed.py"
COVERAGE_PY = CUMULUS_COMMON_ROOT / "coverage.py"

PROCEDURE_FQN = "FINS.PUBLIC.SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS"
TABLE_FQN = "FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS"
TASK_NAME = "TASK_MONTHLY_ZOOMINFO_FIRMOGRAPHICS"
DATASET_SALT = "zoominfo"

SQL_HEADER = f"""\
-- =============================================================================
-- {PROCEDURE_FQN}  (Snowpark Python SP)
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-11-zoominfo-firmographics.md
-- Task:    Plan 11 T6
-- Source:  procedures/sp_generate_zoominfo_firmographics.py
--          (with cumulus_common.seed_for + cumulus_common.assert_coverage
--          inlined so the SP body is self-contained -- no IMPORTS / no stage).
--          Generated by scripts/deploy_sp.py -- do NOT edit by hand.
--
-- Audience: ACCOUNT_TYPE_FLAG = 'BUSINESS'
--           ~12,021 distinct anchors -- same audience predicate as Plans 2
--           (MSCI ESG) and 3 (DnB Business Credit). Probed 2026-05-28.
--           BUSINESS over-count caveat: real CRM BUSINESS cardinality is
--           closer to 5K; the 12,021 includes ~7K Person Accounts
--           misclassified by the PersonBirthdate__c IS NULL -> BUSINESS
--           heuristic. SP warns (does NOT fail) when accounts_processed
--           > 10000. Long-term fix is upstream backfill, not a view-layer
--           change. Same caveat as Plans 2/3.
-- Cadence:  MONTHLY ({TASK_NAME})  -- first of month at 07:00 UTC.
--           Matches Plans 1-3 / Plan 6 / Plan 8.
-- Salt:     "{DATASET_SALT}"  (month-bucketed; SINGLE salt -- no year-stable
--           subfields. Same shape as Plans 2/3/6/8; simpler than Plan 7's
--           three-salt arrangement).
-- Table:    {TABLE_FQN}
--           Composite PK (ACCOUNT_ID, PROFILE_MONTH).
--           DC DMO collapses to single-column PK profileMonth__c.
-- 1:1:      Each BUSINESS anchor produces exactly one row per calendar month
--           (~12,021 rows/month).
-- Schema:   14 columns -- 12 NOT NULL + 2 NULLable (WEBSITE_DOMAIN,
--           TECH_STACK_FLAGS, both gated by data-availability heuristics).
-- NULL semantics: WEBSITE_DOMAIN NULL when normalized ACCOUNT_NAME alnum-slug
--                 length < 3 (~0.5% of rows).
--                 TECH_STACK_FLAGS NULL when industry-biased tag count rolls
--                 0 (~10% of rows -- concentrated in Personal Services /
--                 Construction / F+B).
--                 L1 asserts both DISTRIBUTIONALLY over a 3+ month roll
--                 (works at 12K-row scale, unlike Plan 8's narrow Wealth
--                 cohort which needed per-anchor invariants).
-- Defensive string handling (per Plan 4 v1.5 findings):
--   HQ_COUNTRY_CODE projected as literal 'US' regardless of source value
--     (4 dirty-literal rows: 'USA' / 'United States').
--   HQ_POSTAL_CODE synth-fallback to deterministic 5-digit ZIP from seed
--     bytes when raw is empty (10,798 empty-string rows in source).
--   HQ_STATE_CODE fallback via SP-local _state_from_zip helper (10-entry
--     ZIP-first-digit to 2-char state mapping) when raw is blank.
--   L1 invariants: every row satisfies len(HQ_COUNTRY_CODE)==2,
--     len(HQ_STATE_CODE)==2, len(HQ_POSTAL_CODE)==5 and non-empty.
-- Vendor:   ZoomInfo / DiscoverOrg / Crunchbase-style synthetic firmographics
--           -- README uses canonical name. No real vendor data / license.
--           No ampersand-to-n sanitize needed; "ZoomInfo" is path-clean.
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

    # No ampersand-to-n sanitize on the SP body. "ZoomInfo" is path-clean
    # -- the Jinja-templating gotcha that bit Plan 3 does not apply. Plan 7
    # already dropped this block; Plans 8 and 11 keep it omitted.
    sp_clean = _strip_module_docstring_and_imports(sp_src)
    seed_for_def = _extract_helper(seed_src, "seed_for")
    assert_coverage_def = _extract_helper(coverage_src, "assert_coverage")

    # `seed_for` calls `hashlib.sha256`. The Plan 11 SP body does NOT import
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
        + " -q \"SHOW PROCEDURES LIKE 'SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS' IN SCHEMA FINS.PUBLIC\""
    )
    print("Deploy complete. Verify with:")
    print(f"  {verify_cmd}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
