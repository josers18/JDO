#!/usr/bin/env python3
"""Deploy SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH into DATA_JEDAIS.FINS__PUBLIC.

Generator-style sibling of Plan 6's `Snowflake_Plaid_HeldAway/scripts/deploy_sp.py`
(the closer 1:N template) and Plan 7's `Snowflake_WorldCheck_AML/scripts/deploy_sp.py`
(closest splice-pattern template — Plan 7's hashlib inline matches Plan 9's
SP module which calls `seed_for` but does NOT import hashlib at module-top).
Plan 1 hand-built `procedures/sp_create_procedure.sql` once; Plan 2 automated
that step; Plans 3-9 reuse the recipe with a per-dataset identifier swap so
future datasets can clone with zero manual SQL editing.

What this script does:
  1. Read the SP body from `procedures/sp_generate_synth_relationship_graph.py`.
  2. Read `seed_for` and `assert_coverage` from
     `Snowflake_Cumulus_Common/cumulus_common/{seed,coverage}.py`.
  3. Strip `from __future__` and `from cumulus_common` import lines from the
     SP body (the helpers are inlined; no IMPORTS / no stage).
  4. Emit a single inline-source `CREATE OR REPLACE PROCEDURE ...` SQL file
     at `procedures/sp_create_procedure.sql`.
  5. Run `snow sql -f procedures/sp_create_procedure.sql` (default JWT
     connection — no `-c` flag needed).

Plan 9 differences from the v1.5 template (FOUR structural deviations —
matches Plan 7 in divergence count, but the deviations are different in kind):

  - **First edge-scoped 1:N row factory.** `_rows_for(anchor, run_ts, *,
    available_edge_types, lookup_tables) -> list[dict]` returns 1-N edge rows
    per anchor, where each row is a directed edge `(SRC_ACCOUNT_ID,
    DST_ACCOUNT_ID, EDGE_TYPE)`. Plan 9 is the first dataset where the row
    PK is the directed-edge tuple — not an account-anchored single key with
    a slot index. SRC_ACCOUNT_ID is the anchor side (FK to ssot__Account__dlm);
    DST_ACCOUNT_ID is any other account in the audience (or the same account
    for SELF edges).

  - **First cross-plan SOFT dependencies.** SP `main()` runs
    `_probe_available_edge_types(session)` at top-of-run. Each `IF EXISTS`
    probe (`SELECT 1 FROM <table> LIMIT 1`) is wrapped in try/except;
    absent tables silently filter out the corresponding edge_type from
    `available_edge_types`. The SP NEVER fails on a missing upstream
    table. SELF / ADVISOR_BOOK / REFERRAL / BUSINESS_OWNER are always-on;
    HOUSEHOLD requires CLARITAS_DEMOGRAPHICS (Plan 1); CORPORATE_PARENT
    requires DNB_BUSINESS_CREDIT (Plan 3); BOARD_MEMBER requires
    BOARDEX_EXEC_INTEL (Plan 10, expected to ship after Plan 9). Per
    manifest section 3.2: "If any are absent, the corresponding edge type
    is skipped (not failed)."

  - **SELF self-edge fallback — the load-bearing coverage guarantee.**
    Every `_rows_for(anchor, ...)` that would otherwise return `[]` instead
    returns `[self_edge(anchor)]`. The SELF row has fixed
    `EDGE_WEIGHT=1.000`, `CONFIDENCE_PCT=100.00`,
    `EDGE_DISCOVERED_DATE=EDGE_LAST_SEEN_DATE=week_start.date()`,
    `METADATA=NULL`. This guarantees `COUNT(DISTINCT SRC_ACCOUNT_ID) =
    audience_size` always holds, regardless of which cross-plan edge
    sources are populated. Coverage assertion is therefore single-part —
    no row-count band, because the SELF-fallback obviates Plan 6's
    two-part band shape.

  - **Composite 3-column natural PK collapses to single-column DC PK with
    KQ qualifiers on the other two.** Snowflake DDL keeps PK on
    `(SRC_ACCOUNT_ID, DST_ACCOUNT_ID, EDGE_TYPE)`. DC enforces single-column
    DMO PK (Plan 4 finding); the DLO source view
    `V_SYNTH_RELATIONSHIP_GRAPH_FOR_DC` projects a derived
    `EDGE_ID = SUBSTR(SHA2(SRC || '|' || DST || '|' || EDGE_TYPE, 256), 1, 32)`
    as the single-column DMO PK with KQ qualifiers `srcAccountId__c`,
    `dstAccountId__c`, `edgeType__c`. Plan 6 collapsed 3-to-1 too but the
    keying was naturally HELD_AWAY_ACCOUNT_ID-rooted; Plan 9 is the first
    dataset where the collapse needs a derived hash column.

  - **Single salt** "synth-graph" (week-bucketed) — back to single-salt
    model after Plan 7's three salts and Plan 5's two. Same shape as
    Plans 6 and 8. Re-running mid-week produces byte-identical output
    because the seed and GENERATED_AT both anchor on the week's Monday
    (via `_week_start(run_ts)` which floors run_ts to Monday 00:00 UTC).

  - **Weekly cadence** `'USING CRON 0 5 * * 1 UTC'` — Monday 05:00 UTC.
    Second weekly cadence in the rollout (Plan 6 was first; Plan 12 will
    be third). Plan 6 is actually monthly per its task SQL (cron
    `0 7 1 * * UTC`); the per-plan spec aligns Plan 9 with Plan 6's
    Monday slot in spirit (start-of-business-week refresh), with a
    weekly-specific cron.

  - **No ampersand sanitize.** "synth-graph" / "Synth Relationship Graph"
    all clean. The brainstorm doc references "DnB" via the lookup table
    name `DNB_BUSINESS_CREDIT` — no ampersand in the SP module text.
    The `D-and-B -> DnB` sanitize that bit Plan 3 is intentionally
    OMITTED here. The generated SQL header below avoids any ampersand
    entirely to dodge the `snow sql` template-render crash that bit
    Plan 3 even in passive comments.

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
SP_PY = REPO_ROOT / "procedures" / "sp_generate_synth_relationship_graph.py"
SP_SQL = REPO_ROOT / "procedures" / "sp_create_procedure.sql"

# cumulus_common lives as a sibling sister package; locate it relative to JDO root.
CUMULUS_COMMON_ROOT = REPO_ROOT.parent / "Snowflake_Cumulus_Common" / "cumulus_common"
SEED_PY = CUMULUS_COMMON_ROOT / "seed.py"
COVERAGE_PY = CUMULUS_COMMON_ROOT / "coverage.py"

PROCEDURE_FQN = "DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH"
TABLE_FQN = "DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH"
TASK_NAME = "TASK_WEEKLY_SYNTH_RELATIONSHIP_GRAPH"
DATASET_SALT = "synth-graph"

SQL_HEADER = f"""\
-- =============================================================================
-- {PROCEDURE_FQN}  (Snowpark Python SP)
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-9-synth-relationship-graph.md
-- Task:    Plan 9 T6
-- Source:  procedures/sp_generate_synth_relationship_graph.py
--          (with cumulus_common.seed_for + cumulus_common.assert_coverage
--          inlined so the SP body is self-contained — no IMPORTS / no stage).
--          Generated by scripts/deploy_sp.py — do NOT edit by hand.
--
-- Audience: ALL accounts — `1=1` predicate. `SELECT DISTINCT *` defensively
--           dedupes the 1.7% MASTER_ACCOUNTS dup discovered in Plan 0 v1.5.
--           36,813 distinct anchors (probed 2026-05-28). Second all-accounts
--           audience (Plan 7 World-Check AML was first).
-- Cadence:  WEEKLY ({TASK_NAME}) — Monday 05:00 UTC. Second weekly
--           cadence in the rollout (Plan 6 was first conceptually; Plan 12
--           will be third).
-- Salt:     "{DATASET_SALT}" (week-bucketed). Single salt — back to the
--           Plans 6 / 8 shape after Plan 7's three-salt and Plan 5's two-salt
--           configurations. Re-running mid-week is byte-identical because
--           seed and GENERATED_AT both anchor on the week's Monday via
--           _week_start(run_ts).
-- Table:    {TABLE_FQN}
--           Composite 3-column PK (SRC_ACCOUNT_ID, DST_ACCOUNT_ID, EDGE_TYPE).
--           DC DMO collapses to single-column PK edgeId__c (sha256 hash of
--           the 3 columns) with KQ qualifiers srcAccountId__c,
--           dstAccountId__c, edgeType__c.
-- 1:N:      Second 1:N dataset (Plan 6 was first) and the only edge-scoped
--           dataset in the rollout. Each anchor produces 1-N edge rows per
--           week. Total ~110K-180K rows/week with full cross-plan coverage;
--           floor is 36,813 (every anchor SELF-falls-back).
-- SOFT:     First cross-plan SOFT-dependency dataset. SP probes Claritas
--           (Plan 1), DnB (Plan 3), and BoardEx (Plan 10) via try/except
--           on `SELECT 1 FROM <table> LIMIT 1`. Absent tables silently
--           filter out the corresponding edge type — SELF self-edge
--           fallback guarantees coverage regardless. SP never fails on a
--           missing upstream table.
-- Vendor:   Composition (no single vendor) — synthesized from prior Cumulus
--           plans plus internally-generated structure. Brainstorm doc s17.
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
    # Plan 9 has no ampersand in branding ("synth-graph" / "Synth Relationship
    # Graph") — the `D-and-B -> DnB` sanitize from Plan 3 is intentionally
    # OMITTED here. The Plan 9 SP module text references DnB only via the
    # FQN `DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT` and never spells it with an
    # ampersand, so no string substitution is needed on the inlined body.
    seed_for_def = _extract_helper(seed_src, "seed_for")
    assert_coverage_def = _extract_helper(coverage_src, "assert_coverage")

    # `seed_for` calls `hashlib.sha256`. The Plan 9 SP body does NOT import
    # hashlib at module-top (it imports json / random / uuid / datetime
    # only — sha256 is reached only via the inlined `seed_for`). So we add
    # an `import hashlib` line during splice. Plans 1-5 and Plan 7 did the
    # same; Plan 6 did NOT need it because that SP body imports hashlib
    # itself for the HELD_AWAY_ACCOUNT_ID derivation.
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
        + " -q \"SHOW PROCEDURES LIKE 'SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH' IN SCHEMA DATA_JEDAIS.FINS__PUBLIC\""
    )
    print("Deploy complete. Verify with:")
    print(f"  {verify_cmd}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
