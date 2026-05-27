"""Live-org end-to-end smoke test for Phase 4d.

Gated by RUN_LIVE_TESTS=1 — CI does not run this file.

Run manually with:
    RUN_LIVE_TESTS=1 pytest tests/test_backfill_e2e_live.py -v -s
"""
import json
import os
from pathlib import Path

import pytest

from customer_hydration import backfill_accounts


pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_LIVE_TESTS") != "1",
    reason="set RUN_LIVE_TESTS=1 to run live-org smoke",
)


LIVE_ORG = os.environ.get("LIVE_TEST_ORG", "jdo-uqj0jr")


def test_live_dry_run_describe_and_query_parse(tmp_path):
    """Dry-run with --limit 5 against the real org. Proves describe + SOQL work."""
    out_dir = tmp_path / "live_dry_run"
    rc = backfill_accounts.run_backfill(
        target_org=LIVE_ORG,
        output_dir=out_dir,
        dry_run=True,
        limit=5,
    )
    assert rc == 0, f"dry-run returned rc={rc}"
    manifest = json.loads((out_dir / "manifest.json").read_text())
    assert manifest["query"]["rows_queried"] >= 1, manifest


def test_live_apply_with_limit_5_round_trips(tmp_path):
    """--limit 5 against the real org. Bulk upserts + triggers DC refresh."""
    out_dir = tmp_path / "live_apply"
    rc = backfill_accounts.run_backfill(
        target_org=LIVE_ORG,
        output_dir=out_dir,
        dry_run=False,
        limit=5,
        skip_refresh_stream=False,
    )
    # Acceptable outcomes: rc=0 (clean) or rc=2 (DC stream PolicySkipped).
    assert rc in (0, 2), f"unexpected rc={rc}"
    manifest = json.loads((out_dir / "manifest.json").read_text())
    assert manifest["bulk_load"]["rows_processed"] >= 1
    assert manifest["dc_refresh"] is not None
