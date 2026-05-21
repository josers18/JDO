"""Phase 0 pre-flight — describe target sObjects, cache field lists.

Output of this phase is consumed by the CSV writer to silently drop any
column corresponding to a field that doesn't exist in the target org.
This protects the generator from FSC version drift.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Protocol


class DescribeRunner(Protocol):
    def describe(self, sobject: str) -> dict:
        ...


@dataclass
class PreflightCache:
    """Maps sObject API name to the set of field API names it exposes."""

    field_sets: dict[str, set[str]] = field(default_factory=dict)

    def known_fields(self, sobject: str) -> set[str]:
        if sobject not in self.field_sets:
            raise KeyError(f"No describe cache for sObject {sobject!r}. "
                           f"Did you include it in run_preflight()?")
        return self.field_sets[sobject]

    def drop_unknown_fields(
        self, rows: list[dict], sobject: str,
    ) -> tuple[list[dict], set[str]]:
        """Strip columns from each row that aren't in the org's describe.

        Returns (cleaned_rows, dropped_field_names).
        """
        known = self.known_fields(sobject)
        dropped: set[str] = set()
        cleaned: list[dict] = []
        for row in rows:
            row_dropped = set(row.keys()) - known
            dropped.update(row_dropped)
            cleaned.append({k: v for k, v in row.items() if k in known})
        return cleaned, dropped


def run_preflight(
    runner: DescribeRunner, sobjects: Iterable[str],
) -> PreflightCache:
    """Describe each sObject and return a PreflightCache."""
    field_sets: dict[str, set[str]] = {}
    for sobject in sobjects:
        payload = runner.describe(sobject)
        fields_list = payload.get("fields", [])
        field_sets[sobject] = {f["name"] for f in fields_list}
    return PreflightCache(field_sets=field_sets)
