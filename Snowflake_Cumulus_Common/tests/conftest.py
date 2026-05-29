"""Shared pytest configuration for cumulus_common tests.

Per-dataset projects (e.g. Snowflake_Claritas_Demographics) get their own
conftest that imports SAMPLE_ANCHORS from the fixture module — see Task 7.
"""
import pytest

# Currently no shared fixtures here — kept as a stub so per-dataset projects
# can copy/extend it without re-discovering the pattern.
