"""Shared helpers used by every Cumulus dataset generator.

See docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md.
"""

from .seed import seed_for
from .coverage import assert_coverage

__all__ = ["seed_for", "assert_coverage"]
__version__ = "0.1.0"
