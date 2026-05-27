"""Phase 4d SOQL query builder + chunked fetch.

Builds the SELECT clause (owned-by-deriver fields + read-only anchors),
the WHERE clause (--persona, --record-type filters), and yields chunks
of 2,000-row SOQL pages via SfRunner.query.

Why SOQL not Bulk Query: spec §5.1 — Bulk Query has column-count limits
Bulk 2.0 (the upsert side) doesn't, so SOQL is the only path that fits
~110 columns of fetch.
"""
from __future__ import annotations

from typing import Iterable, Iterator


# Read-only anchors the archetype + derivers need but don't write.
# Order doesn't matter — the SELECT builder dedupes against owned_fields.
_REQUIRED_ANCHORS: list[str] = [
    "Id",
    "External_ID__c",
    "RecordType.Name",
    "IsPersonAccount",
    "CreatedDate",
    "FinServ__AnnualIncome__pc",
    "AnnualRevenue",
    "Industry",
    "AccountSource",
    "PersonBirthdate",
    "PersonGender",
    "PersonGenderIdentity",
    "FinServ__MaritalStatus__pc",
    "FinServ__NumberOfDependents__pc",
    "FinServ__LastInteraction__c",
    "BillingCity",
    "ShippingCity",
    "NumberOfEmployees",
    "Description",
    "FinServ__TotalInvestments__c",
    "FinServ__TotalBankDeposits__c",
    "FinServ__TotalNonfinancialAssets__c",
    "FinServ__TotalLiabilities__c",
    "FinServ__CreditScore__c",
    "FinServ__CreditRating__c",
]


# CLI --persona value → External_ID__c prefix.
PERSONA_PREFIX_MAP: dict[str, str] = {
    "retail":     "HYDRATE-RTL-",
    "wealth":     "HYDRATE-WLT-",
    "smb":        "HYDRATE-SMB-",
    "commercial": "HYDRATE-COM-",
    "household":  "HYDRATE-HH-",
}


def build_select_clause(owned_fields: list[str]) -> str:
    """Build the comma-separated SELECT field list. Dedupes against anchors.

    Returns just the field list, not the full 'SELECT ... FROM' — the caller
    composes that with the FROM Account clause + WHERE/LIMIT.
    """
    seen: set[str] = set()
    ordered: list[str] = []
    for f in (*_REQUIRED_ANCHORS, *owned_fields):
        if f not in seen:
            seen.add(f)
            ordered.append(f)
    return ", ".join(ordered)


def build_where_clause(persona: str | None, record_type: str | None) -> str:
    """Build the WHERE clause body (without the leading 'WHERE ').

    Returns an empty string when neither filter is set. Caller checks for
    truthiness before splicing in 'WHERE '.
    """
    parts: list[str] = []

    if persona:
        prefixes = []
        for p in persona.split(","):
            p = p.strip().lower()
            prefix = PERSONA_PREFIX_MAP.get(p)
            if prefix:
                prefixes.append(prefix)
        if prefixes:
            ors = " OR ".join(f"External_ID__c LIKE '{p}%'" for p in prefixes)
            parts.append(f"({ors})")

    if record_type:
        rts = [r.strip() for r in record_type.split(",") if r.strip()]
        if len(rts) == 1:
            parts.append(f"RecordType.Name = '{rts[0]}'")
        elif len(rts) > 1:
            joined = ", ".join(f"'{r}'" for r in rts)
            parts.append(f"RecordType.Name IN ({joined})")

    return " AND ".join(parts)


def fetch_account_chunks(
    sf_runner,
    *,
    owned_fields: list[str],
    persona: str | None,
    record_type: str | None,
    chunk_size: int = 2000,
    limit: int | None = None,
) -> Iterator[list[dict]]:
    """Yield successive chunks of Account records.

    Each chunk is up to chunk_size records. If --limit is set, the total
    yielded record count is capped at limit (single chunk if limit <= chunk_size).

    Pagination: spec §5.1 calls for OFFSET-based paging. SF SOQL OFFSET is
    capped at 2,000 — for full-org runs we use OrderBy(Id) + last-Id-as-cursor
    (keyset pagination). For Plan 4d v1 we use LIMIT alone, accepting that
    the org-side cap is 50,000 rows per query. If --limit is None, we issue
    multiple queries with `WHERE Id > 'previous_max'` to walk the full set.
    """
    select_clause = build_select_clause(owned_fields)
    where_body = build_where_clause(persona, record_type)
    where_prefix = f" WHERE {where_body}" if where_body else ""

    if limit is not None:
        # Single-shot path: fetch up to `limit` records, no pagination loop.
        page_size = min(limit, chunk_size)
        soql = (
            f"SELECT {select_clause} FROM Account{where_prefix} "
            f"ORDER BY Id LIMIT {page_size}"
        )
        # NB: the caller's mock asserts the literal "LIMIT 100" substring.
        records = sf_runner.query(soql)
        if records:
            yield records
        return

    # No limit → keyset-paginate by Id ascending until the page is short.
    last_id: str | None = None
    yielded = 0
    while True:
        cursor = f" AND Id > '{last_id}'" if last_id else ""
        if not where_prefix and last_id:
            cursor = f" WHERE Id > '{last_id}'"
        soql = (
            f"SELECT {select_clause} FROM Account{where_prefix}{cursor} "
            f"ORDER BY Id LIMIT {chunk_size}"
        )
        records = sf_runner.query(soql)
        if not records:
            return
        yield records
        yielded += len(records)
        if len(records) < chunk_size:
            return
        last_id = records[-1]["Id"]
