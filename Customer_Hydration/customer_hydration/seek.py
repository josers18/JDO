"""External-ID seek-pointer logic.

Every record in the HYDRATE-* namespace has an External Id of the form
`HYDRATE-{TYPE}-{SEQ}` where SEQ is a positive integer. To support
`--append` runs, we query the org for the max existing seq per prefix
and start numbering at max+1.
"""
from __future__ import annotations

import re
from typing import Optional, Protocol

EXTERNAL_ID_PATTERN = re.compile(r"^HYDRATE-[A-Z]+-(\d+)$")


class OrgRunner(Protocol):
    """Minimal interface the seek module needs from a SOQL runner."""

    def query(self, soql: str) -> list[dict]:
        ...


def parse_seq_from_external_id(external_id: str | None) -> Optional[int]:
    """Extract the integer sequence from a HYDRATE-* External Id.

    Returns None if the input is missing, empty, or doesn't match the
    HYDRATE-{TYPE}-{SEQ} pattern.
    """
    if not external_id:
        return None
    match = EXTERNAL_ID_PATTERN.match(external_id)
    if not match:
        return None
    return int(match.group(1))


def compute_next_seq(runner: OrgRunner, prefix: str, sobject: str) -> int:
    """Compute the next free sequence number for a HYDRATE-* prefix.

    Args:
        runner: SOQL runner (anything implementing query(soql) -> list[dict])
        prefix: External-ID prefix without trailing dash, e.g. "HYDRATE-RT"
        sobject: API name of the object holding External_ID__c

    Returns:
        1 if the org has no matching records; otherwise (max existing seq) + 1.
    """
    soql = (
        f"SELECT External_ID__c FROM {sobject} "
        f"WHERE External_ID__c LIKE '{prefix}-%'"
    )
    rows = runner.query(soql)
    seqs = [
        seq
        for row in rows
        if (seq := parse_seq_from_external_id(row.get("External_ID__c"))) is not None
    ]
    return max(seqs, default=0) + 1
