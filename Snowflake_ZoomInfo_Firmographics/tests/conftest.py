"""Per-dataset pytest config — pulls the shared 100-anchor fixture from
Snowflake_Cumulus_Common and provides Plan 11 BUSINESS-audience overrides.

Plan 11 audience: `ACCOUNT_TYPE_FLAG == 'BUSINESS'` — same predicate as
Plans 2 (MSCI) and 3 (DnB). Of SAMPLE_ANCHORS' 100 anchors, 50 carry the
BUSINESS flag, giving ample cohort headroom for distributional checks
(NULL-rate convergence on WEBSITE_DOMAIN / TECH_STACK_FLAGS) without the
per-anchor invariants Plan 8 needed for its narrow Wealth cohort.

v1.x multi-org-additive: ORG_ID now flows through `_row_for` (defaults to
'JDO' when the anchor lacks ORG_ID, so the shared 100-anchor fixture works
unchanged at runtime). Schema-shape tests, however, hard-code a 15-key set;
this conftest patches the canonical 16-key set into the test module before
collection so we don't have to fork the test file.
"""
import importlib
import importlib.util
import sys
from pathlib import Path

# Load the shared fixture module directly from its file path so we don't
# collide with the local `tests/` package (which would shadow Cumulus_Common's
# own `tests/` namespace if we just appended its root to sys.path).
_FIXTURE_PATH = (
    Path(__file__).resolve().parent.parent.parent
    / "Snowflake_Cumulus_Common"
    / "tests"
    / "fixtures"
    / "sample_anchors.py"
)
_spec = importlib.util.spec_from_file_location(
    "_cumulus_common_sample_anchors", _FIXTURE_PATH
)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["_cumulus_common_sample_anchors"] = _mod
_spec.loader.exec_module(_mod)
SAMPLE_ANCHORS = _mod.SAMPLE_ANCHORS

import pytest  # noqa: E402


def pytest_collection_modifyitems(config, items):
    """Multi-org-additive (v1.x): patch the test module's 15-key
    ``EXPECTED_KEYS`` set to add ``ORG_ID`` before any test runs.

    The schema tests (``test_output_schema_matches_table`` and
    ``test_output_schema_constant_matches_test_set``) compare row keys
    against a hard-coded set. Migrating that set in-place would require
    editing the test file; per the Plan 11 migration instructions we patch
    the constant from conftest only.
    """
    try:
        test_mod = importlib.import_module(
            "test_zoominfo_firmographics_row_factory"
        )
    except ModuleNotFoundError:
        # Tests not yet collected (e.g. running a different file) — nothing
        # to patch.
        return
    if hasattr(test_mod, "EXPECTED_KEYS") and "ORG_ID" not in test_mod.EXPECTED_KEYS:
        test_mod.EXPECTED_KEYS = set(test_mod.EXPECTED_KEYS) | {"ORG_ID"}


@pytest.fixture
def all_anchors():
    """The full 100-anchor fixture (50 person + 50 business)."""
    return SAMPLE_ANCHORS


@pytest.fixture
def in_audience_anchors(all_anchors):
    """Plan 11 audience predicate: ACCOUNT_TYPE_FLAG = 'BUSINESS'."""
    return [a for a in all_anchors if a["ACCOUNT_TYPE_FLAG"] == "BUSINESS"]


@pytest.fixture
def out_of_audience_anchors(all_anchors):
    """Anchors that fail the BUSINESS predicate (PERSON anchors —
    Retail / Wealth / Commercial Banking customers)."""
    return [a for a in all_anchors if a["ACCOUNT_TYPE_FLAG"] != "BUSINESS"]
