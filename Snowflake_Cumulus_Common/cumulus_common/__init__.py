"""Shared helpers used by every Cumulus dataset generator.

See docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md.
"""

from .seed import seed_for
# Re-enabled in Task 5
# from .coverage import assert_coverage

__all__ = ["seed_for"]
__version__ = "0.1.0"
