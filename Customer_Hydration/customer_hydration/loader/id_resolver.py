"""Post-wave ID resolution.

After Wave A loads Accounts, the resolver queries the org for
{External_ID__c → Salesforce Id} maps. Subsequent waves' CSVs use these
maps to fill in `WhatId`, `ContactId`, and other parent references that
can't be resolved client-side at generation time.

CSV markers like "RESOLVE:HYDRATE-RT-000001" are replaced in-place.

Three internal maps power resolution:

* ``by_external_id`` — keyed by ``External_ID__c`` (most sObjects).
* ``by_source_system_id`` — keyed by ``FinServ__SourceSystemId__c`` for
  Holdings and LifeEvents which only carry that ext-id field.
* ``contact_id_by_account_external_id`` — Person Accounts auto-create a
  Contact with no client-controlled external id; we look it up by joining
  on ``Account.External_ID__c`` so ACR / CampaignMember rows can resolve
  the implicit ContactId.
"""
from __future__ import annotations

import csv
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - imported only for type checking
    from customer_hydration.sf_runner import SfRunner


_RESOLVE_PREFIX = "RESOLVE:"


@dataclass
class IdResolver:
    """Maps external IDs to Salesforce record Ids after a wave loads."""

    by_external_id: dict[str, str] = field(default_factory=dict)
    by_source_system_id: dict[str, str] = field(default_factory=dict)
    contact_id_by_account_external_id: dict[str, str] = field(default_factory=dict)

    def populate_from_org(
        self,
        runner: "SfRunner",
        sobject: str,
        external_id_field: str = "External_ID__c",
        prefix: str = "HYDRATE-",
    ) -> int:
        """Query the org for ``{Id, ext_field}`` pairs and fill the right map.

        Returns the count of records loaded into the relevant map.

        When ``sobject == "Account"`` we also populate
        ``contact_id_by_account_external_id`` by joining Contact on
        Account.External_ID__c — this lets ACR / CampaignMember resolve
        Person Account auto-Contact ids.
        """
        soql = (
            f"SELECT Id, {external_id_field} FROM {sobject} "
            f"WHERE {external_id_field} LIKE '{prefix}%'"
        )
        rows = runner.query(soql)
        target = (
            self.by_source_system_id
            if external_id_field == "FinServ__SourceSystemId__c"
            else self.by_external_id
        )
        loaded = 0
        for row in rows:
            ext = row.get(external_id_field)
            sf_id = row.get("Id")
            if ext and sf_id:
                target[ext] = sf_id
                loaded += 1

        if sobject == "Account":
            self._populate_person_account_contacts(runner, prefix)
        return loaded

    def _populate_person_account_contacts(
        self, runner: "SfRunner", prefix: str
    ) -> None:
        soql = (
            f"SELECT Id, AccountId, Account.External_ID__c FROM Contact "
            f"WHERE Account.External_ID__c LIKE '{prefix}%' "
            f"AND Account.IsPersonAccount = true"
        )
        rows = runner.query(soql)
        for row in rows:
            account_ext_id = (row.get("Account") or {}).get("External_ID__c")
            contact_id = row.get("Id")
            if account_ext_id and contact_id:
                self.contact_id_by_account_external_id[account_ext_id] = contact_id

    def resolve(self, marker: str, *, want: str = "id") -> str | None:
        """Resolve a ``RESOLVE:HYDRATE-*`` marker to a record Id.

        Args:
            marker: e.g. ``"RESOLVE:HYDRATE-RT-000001"``.
            want: which kind of Id to return.

                - ``"id"`` (default): consult ``by_external_id`` and
                  ``by_source_system_id``; falls back to
                  ``contact_id_by_account_external_id`` only if the ext-id
                  exists nowhere else. Used for Account / FA references
                  (``FinServ__Client__c``, ``WhatId``, ``WhoId``, …).
                - ``"contact"``: consult ``contact_id_by_account_external_id``
                  only. Used for ``AccountContactRelation.ContactId`` and
                  ``CampaignMember.ContactId`` where Salesforce demands a
                  ``003*`` (Contact) Id and would reject a ``001*`` (Account)
                  Id with FIELD_INTEGRITY_EXCEPTION.

        Returns:
            The resolved record Id, ``None`` for empty input or unknown
            markers, and the original string for non-marker values
            (caller convenience).
        """
        if not marker:
            return None
        if not marker.startswith(_RESOLVE_PREFIX):
            return marker
        ext = marker[len(_RESOLVE_PREFIX):]
        if want == "contact":
            return self.contact_id_by_account_external_id.get(ext)
        # default: account/fa/etc — prefer account-typed maps first.
        if ext in self.by_external_id:
            return self.by_external_id[ext]
        if ext in self.by_source_system_id:
            return self.by_source_system_id[ext]
        # last resort: caller may have passed a Person-Account ext_id whose
        # only mapping is the implicit Contact (legacy behavior preserved).
        return self.contact_id_by_account_external_id.get(ext)

    def save(self, path: Path) -> None:
        """Persist the maps to JSON for resume support."""
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                {
                    "by_external_id": self.by_external_id,
                    "by_source_system_id": self.by_source_system_id,
                    "contact_id_by_account_external_id": (
                        self.contact_id_by_account_external_id
                    ),
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    @classmethod
    def load(cls, path: Path) -> "IdResolver":
        """Load a previously saved resolver from JSON.

        Raises ``FileNotFoundError`` if the file does not exist.
        """
        data = json.loads(path.read_text(encoding="utf-8"))
        return cls(
            by_external_id=data.get("by_external_id", {}),
            by_source_system_id=data.get("by_source_system_id", {}),
            contact_id_by_account_external_id=data.get(
                "contact_id_by_account_external_id", {}
            ),
        )


def rewrite_csv_resolve_markers(
    csv_path: Path,
    columns: list[str] | dict[str, str],
    resolver: IdResolver,
) -> tuple[int, int]:
    """In-place rewrite a CSV: replace ``RESOLVE:*`` markers with record Ids.

    ``columns`` may be either:

    * a ``list[str]`` of column names — every column resolves with the
      default ``want="id"`` kind (Account / FA Ids). Backward compatible.
    * a ``dict[str, str]`` mapping each column name to its ``want`` kind
      (``"id"`` or ``"contact"``). Use this when a CSV mixes Account-typed
      and Contact-typed columns (e.g. AccountContactRelation: AccountId is
      ``"id"``, ContactId is ``"contact"``).

    Drops rows where any named column fails to resolve. Returns
    ``(rows_kept, rows_dropped)``.

    The CSV must have a header row. Empty CSVs (header only) are no-ops.
    Output uses LF line endings to satisfy Bulk API 2.0's ``--line-ending LF``
    requirement (see AGENTS.md).
    """
    # Normalize columns to {col_name: want_kind}.
    if isinstance(columns, dict):
        col_kinds: dict[str, str] = dict(columns)
    else:
        col_kinds = {col: "id" for col in columns}

    text = csv_path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if len(lines) < 2:
        return (0, 0)

    reader = csv.DictReader(lines)
    fieldnames = list(reader.fieldnames or [])
    kept_rows: list[dict[str, str]] = []
    dropped = 0

    for row in reader:
        all_resolved = True
        for col, want in col_kinds.items():
            if col not in row:
                continue  # column not in CSV; skip silently
            marker = row[col]
            if marker and marker.startswith(_RESOLVE_PREFIX):
                resolved = resolver.resolve(marker, want=want)
                if resolved is None:
                    all_resolved = False
                    break
                row[col] = resolved
        if all_resolved:
            kept_rows.append(row)
        else:
            dropped += 1

    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=fieldnames,
            lineterminator="\n",
            quoting=csv.QUOTE_MINIMAL,
        )
        writer.writeheader()
        for row in kept_rows:
            writer.writerow(row)

    return (len(kept_rows), dropped)
