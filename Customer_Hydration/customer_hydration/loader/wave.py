"""Wave dependency definitions.

Single source of truth for which sObjects load in which wave and what
each wave depends on. Used by both the loader (forward order) and the
reset path (reverse order).

# TODO(Plan 3 / Task 2): populate WAVE_DEFS + Wave dataclass
"""
from __future__ import annotations
