"""Parallel-within-wave bulk loader with retry/backoff.

Each wave's CSVs run as concurrent subprocesses via ProcessPoolExecutor.
Per-CSV failure is surfaced; wave-level fail-fast: other CSVs in the same
wave still complete, but the next wave does NOT start.

# TODO(Plan 3 / Task 3): implement run_wave_parallel + RetryPolicy
"""
from __future__ import annotations
