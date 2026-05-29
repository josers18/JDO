#!/usr/bin/env python3
"""Deploy SP_GENERATE_WORLD_CHECK_AML into FINS.PUBLIC.

Generator-style sibling of Plan 6's `Snowflake_Plaid_HeldAway/scripts/deploy_sp.py`.
Plan 1 hand-built `procedures/sp_create_procedure.sql` once; Plan 2 automated
that step; Plans 3-7 reuse the recipe with a per-dataset identifier swap so
future datasets can clone with zero manual SQL editing.

What this script does:
  1. Read the SP body from `procedures/sp_generate_world_check_aml.py`.
  2. Read `seed_for` and `assert_coverage` from
     `Snowflake_Cumulus_Common/cumulus_common/{seed,coverage}.py`.
  3. Strip `from __future__` and `from cumulus_common` import lines from the
     SP body (the helpers are inlined; no IMPORTS / no stage).
  4. Emit a single inline-source `CREATE OR REPLACE PROCEDURE ...` SQL file
     at `procedures/sp_create_procedure.sql`.
  5. Run `snow sql -f procedures/sp_create_procedure.sql` (default JWT
     connection — no `-c` flag needed).

Plan 7 differences from Plan 6 (FOUR structural deviations from the v1.5
template — the most-divergent instantiation so far):

  - **First DAILY-cadence dataset.** Cron `0 6 * * * UTC` (06:00 UTC daily,
    after LSEG's overnight feed publishes at ~02:00 GMT). Plans 1-4 are
    monthly; Plan 5 introduced quarterly; Plan 6 returned to monthly;
    Plan 7 now introduces daily. This precedent matters for Plan 13
    (Moody's, also daily).

  - **First all-accounts-audience dataset.** No `WHERE` predicate beyond
    `SELECT DISTINCT * FROM V_ACCOUNT_ANCHORS`. Plan 4 had a `POSTAL_CODE
    <> ''` defensive filter; Plan 5 had a PERSON-only filter; Plan 6 had
    `CLIENT_CATEGORY IN (...)`. Plan 7 has no audience predicate at all
    — AML / sanctions screening is non-negotiable for every customer.
    `_anchor_in_audience` always returns True given a non-empty ACCOUNT_ID.

  - **Anchor-independent bias.** The row factory reads ONLY
    `anchor['ACCOUNT_ID']`. No BIRTHDATE / ANNUAL_INCOME / STATE_CODE /
    CLIENT_CATEGORY signal. The novel `RISK_JURISDICTION_CODE` field is
    SYNTHESIZED year-stable per account (salt `worldcheck_jurisdiction`)
    rather than read from `anchor.COUNTRY_CODE` — that field is dirty in
    the source data and can't be trusted as a screening jurisdiction.

  - **THREE salts** instead of Plan 5's two or Plan 6's one:
      * `worldcheck`              — daily-bucketed; main rng for the
                                     daily-flip events on each component flag.
      * `worldcheck_jurisdiction` — year-stable; RISK_JURISDICTION_CODE +
                                     RISK_JURISDICTION_TIER, the year-stable
                                     base flag draws (sanctions / pep / media),
                                     and the noise-tail rating bump.
      * `worldcheck_case`         — year-stable; CASE_REFERENCE
                                     (WCH-YYYY-NNNNNN format).
    All three are inlined automatically because they're plain string
    constants in the SP module — no helpers in cumulus_common need updating.

  - **Hybrid year-stable + daily XOR component-flag model.** Each of the
    three flags (sanctions, PEP, adverse media) is computed as:
        flag = year_stable_base(account_id, year) XOR daily_flip(rng)
    where the year-stable base is drawn at slightly-below-target rate and
    the daily-flip event has probability ~0.3%. This delivers BOTH:
      - target marginal rates (~0.5% / 1.2% / 3.0%)
      - high day-to-day stability (~99% Unchanged) per the rowspec.
    The rowspec originally specified IID daily draws; that fails the
    Unchanged-rate invariant. The hybrid model is a v1.2 refinement (see
    `_flag_with_daily_flip` in the SP module).

  - **3 BOOLEAN columns** (SANCTIONS_HIT, PEP_HIT, ADVERSE_MEDIA_HIT). All
    three need explicit `::BOOLEAN` cast in the MERGE source SELECT
    (write_pandas can mis-infer int8 on an empty staging table — Plan 6
    finding, repeated three times).

  - **2 NULLable columns** (ADVERSE_MEDIA_CATEGORIES, CASE_REFERENCE)
    conditional on ADVERSE_MEDIA_HIT / OVERALL_RISK_RATING. The MERGE
    source SELECT lets `None` pass through to SQL `NULL` natively.

  - **`_daily_seed` helper** wraps `cumulus_common.seed_for`. The shared
    helper buckets by (year, month) only; Plan 7 needs day-bucketed seeds
    so adjacent days within a month produce distinct seeds. We work around
    this by folding the day-of-month into the `account_id` parameter
    (which IS hashed by `seed_for`). This keeps the cumulus_common
    contract intact — no need to extend `seed_for` for one consumer. The
    helper lives IN the SP module (not in cumulus_common), so it gets
    inlined automatically as part of the SP body.

  - No `&` -> `n` sanitize. "WorldCheck" / "World-Check" both clean — the
    Jinja-templating gotcha that bit Plan 3 doesn't apply here.

Why inline source instead of `snow snowpark deploy`?
  - The SP imports from `cumulus_common`, a sibling sister package.
  - There are no internal Snowflake stages in this org (only EXTERNAL S3/GCS).
  - The cumulus_common modules are tiny (~80 LoC) and pure-Python — inlining
    the two helpers (`seed_for`, `assert_coverage`) into the SP body keeps
    the SP self-contained without needing a stage and an IMPORTS clause.

Caveats inherited from Plans 2-6:
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
SP_PY = REPO_ROOT / "procedures" / "sp_generate_world_check_aml.py"
SP_SQL = REPO_ROOT / "procedures" / "sp_create_procedure.sql"

# cumulus_common lives as a sibling sister package; locate it relative to JDO root.
CUMULUS_COMMON_ROOT = REPO_ROOT.parent / "Snowflake_Cumulus_Common" / "cumulus_common"
SEED_PY = CUMULUS_COMMON_ROOT / "seed.py"
COVERAGE_PY = CUMULUS_COMMON_ROOT / "coverage.py"

PROCEDURE_FQN = "FINS.PUBLIC.SP_GENERATE_WORLD_CHECK_AML"
TABLE_FQN = "FINS.PUBLIC.WORLD_CHECK_AML"
TASK_NAME = "TASK_DAILY_WORLD_CHECK_AML"
DATASET_SALT = "worldcheck"

SQL_HEADER = f"""\
-- =============================================================================
-- {PROCEDURE_FQN}  (Snowpark Python SP)
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-7-worldcheck-aml.md
-- Task:    Plan 7 T6
-- Source:  procedures/sp_generate_world_check_aml.py
--          (with cumulus_common.seed_for + cumulus_common.assert_coverage
--          inlined so the SP body is self-contained — no IMPORTS / no stage).
--          Generated by scripts/deploy_sp.py — do NOT edit by hand.
--
-- Audience: ALL accounts — no WHERE predicate beyond `SELECT DISTINCT *`.
--           ~36,813 distinct anchors (Plan 7 is the first all-accounts dataset).
-- Cadence:  DAILY ({TASK_NAME})  — first daily-cadence Cumulus dataset.
-- Salts:    "{DATASET_SALT}"               (day-bucketed; main daily rng)
--           "{DATASET_SALT}_jurisdiction"  (year-stable; jurisdiction +
--                                           component-flag bases + noise tail)
--           "{DATASET_SALT}_case"          (year-stable; CASE_REFERENCE)
--           THREE salts — most-multi-salt instantiation to date. Plan 5 had
--           two ("corelogic" + "corelogic_year"); Plan 6 had one ("plaid").
-- Table:    {TABLE_FQN}
--           Composite PK (ACCOUNT_ID, PROFILE_DATE).
--           DC DMO collapses to single-column PK profileDate__c.
-- 1:1:      Each anchor produces exactly one row per screening day.
-- Vendor:   LSEG World-Check / Dow Jones Risk & Compliance / ComplyAdvantage
--           — README uses canonical name.
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
    # Plan 7 has no `&` in branding ("World-Check" / "WorldCheck" / "Dow Jones"
    # / "ComplyAdvantage") — the `D&B -> DnB` sanitize from Plan 3 is
    # intentionally OMITTED here.
    seed_for_def = _extract_helper(seed_src, "seed_for")
    assert_coverage_def = _extract_helper(coverage_src, "assert_coverage")

    # `seed_for` calls `hashlib.sha256`. The Plan 7 SP body does NOT import
    # hashlib at module-top (unlike Plan 6 which uses sha256 directly for
    # HELD_AWAY_ACCOUNT_ID). So we add an `import hashlib` line during
    # splice. Plans 1-5 did the same.
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
        + " -q \"SHOW PROCEDURES LIKE 'SP_GENERATE_WORLD_CHECK_AML' IN SCHEMA FINS.PUBLIC\""
    )
    print("Deploy complete. Verify with:")
    print(f"  {verify_cmd}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
