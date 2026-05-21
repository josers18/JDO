"""Bulk-load orchestration for Customer_Hydration.

This package replaces Plan 1's single `loader.py` module with proper
wave-ordered parallel loading, checkpoint/resume, ID resolution between
waves, and a reset path. Plan 3 builds out the modules; this __init__
re-exports the public API.

Plan 1's `bulk_upsert` + `BulkLoadResult` live in `_legacy` for now and
are re-exported here so the existing import path
``from customer_hydration.loader import bulk_upsert, BulkLoadResult``
keeps working while Plan 3 lands. Plan 3 / Task 3 (parallel.py) is the
sole consumer; once that lands, _legacy may be folded into parallel.py.
"""
# `subprocess` is re-exported because tests/test_loader.py patches
# `customer_hydration.loader.subprocess.run`. When Plan 3 / Task 3 lands
# parallel.py (which calls bulk_upsert) and rewrites those tests to patch
# the new entrypoint, this re-export can drop.
from customer_hydration.loader._legacy import BulkLoadResult, bulk_upsert, subprocess  # noqa: F401

# Public API will be added as Plan 3 tasks land:
# from customer_hydration.loader.wave import Wave, WAVE_DEFS
# from customer_hydration.loader.parallel import run_wave_parallel, WaveResult, RetryPolicy
# from customer_hydration.loader.checkpoint import RunCheckpoint
# from customer_hydration.loader.id_resolver import IdResolver, rewrite_csv_resolve_markers
# from customer_hydration.loader.reset import reset_hydrate

__all__ = ["BulkLoadResult", "bulk_upsert"]
