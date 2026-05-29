#!/usr/bin/env python3
"""Deploy SP_GENERATE_CLARITAS_DEMOGRAPHICS into FINS.PUBLIC.

This wrapper exists primarily as documentation of the canonical Cumulus
Snowpark Python SP deploy path. It runs the inline-source SQL produced by
`procedures/sp_create_procedure.sql` via `snow sql -f`.

Why inline source instead of `snow snowpark deploy`?
  - The SP imports from `cumulus_common`, a sibling sister package.
  - There are no internal Snowflake stages in this org (only EXTERNAL S3/GCS).
  - The cumulus_common modules are tiny (~80 LoC) and pure-Python — inlining
    the two helpers (`seed_for`, `assert_coverage`) into the SP body keeps
    the SP self-contained without needing a stage and an IMPORTS clause.

Caveats for the next dataset (Plans 2-13):
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
    python scripts/deploy_sp.py [--connection GSB13421]
"""
from __future__ import annotations

import argparse
import pathlib
import subprocess
import sys


REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
SP_SQL = REPO_ROOT / "procedures" / "sp_create_procedure.sql"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--connection", "-c",
        default=None,
        help="Snowflake CLI connection name (default: unflagged — use the active JWT connection)",
    )
    args = parser.parse_args()

    if not SP_SQL.exists():
        print(f"ERROR: {SP_SQL} does not exist", file=sys.stderr)
        return 1

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
        + " -q \"SHOW PROCEDURES LIKE 'SP_GENERATE_CLARITAS_DEMOGRAPHICS' IN SCHEMA FINS.PUBLIC\""
    )
    print("Deploy complete. Verify with:")
    print(f"  {verify_cmd}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
