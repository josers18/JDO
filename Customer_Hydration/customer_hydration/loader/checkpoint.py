"""Run-state checkpointing for crash-resume.

Writes output/run-{ts}/checkpoint.json after each wave completes (and
after each CSV inside a wave finishes, for fine-grained resume). The
resume command reads this and continues at the in-progress wave.

# TODO(Plan 3 / Task 4): implement RunCheckpoint dataclass + persist/load
"""
from __future__ import annotations
