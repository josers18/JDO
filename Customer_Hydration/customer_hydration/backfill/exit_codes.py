"""Phase 4d exit codes (spec §6.1).

Importable constants so tests + orchestrator agree on numeric meaning.
"""
from __future__ import annotations

OK: int = 0
BULK_PARTIAL_FAILURE: int = 2  # > 1% per-row failures, or DC stream returned 412
BULK_HARD_FAILURE: int = 3
SCHEMA_PICKLIST_DRIFT: int = 4
PRODUCTION_GUARD: int = 5
