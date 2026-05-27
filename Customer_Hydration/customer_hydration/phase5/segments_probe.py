"""Live probe of v62 relative-date filter semantics on Profile-category DMOs.

Phase 2 docs (config/segments.yaml header) note that
ExactlyRelativeDateComparison was broken on Profile DMOs as of 2026-05-25.
Phase 3d's wealth_recent_life_event segment needs a 90-day window on
ssot__PersonLifeEvent__dlm; rather than assume the bug persists, this
module probes live and persists a verdict that gates which translator
branch the YAML loader uses.

If the probe is unavailable (auth fail, network, etc.), the verdict is
RELATIVE_DATES_UNKNOWN and the translator falls back to frozen anchors.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

RELATIVE_DATES_OK = "RELATIVE_DATES_OK"
RELATIVE_DATES_BROKEN = "RELATIVE_DATES_BROKEN"
RELATIVE_DATES_UNKNOWN = "RELATIVE_DATES_UNKNOWN"


@dataclass
class ProbeResult:
    verdict: str
    target_dmo: str
    field: str
    days: int
    count_recent: Optional[int] = None
    count_old: Optional[int] = None
    count_recent_frozen: Optional[int] = None
    ts: Optional[str] = None
    error: Optional[str] = None


def write_probe_artifact(path: Path, result: ProbeResult) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(asdict(result), indent=2, sort_keys=True))


def read_probe_artifact(path: Path) -> ProbeResult:
    if not path.exists():
        return ProbeResult(
            verdict=RELATIVE_DATES_UNKNOWN,
            target_dmo="",
            field="",
            days=0,
        )
    data = json.loads(path.read_text())
    return ProbeResult(**data)


from datetime import datetime, timedelta, timezone


def probe_relative_date_filter(
    instance_url: str,
    access_token: str,
    *,
    target_dmo: str = "ssot__PersonLifeEvent__dlm",
    field: str = "EventDate__c",
    days: int = 90,
    create_segment_fn=None,
    delete_segment_fn=None,
    get_status_fn=None,
) -> ProbeResult:
    """Run the three-segment probe and return a verdict.

    `create_segment_fn`, `delete_segment_fn`, `get_status_fn` are injectable
    seams so tests can mock the live API. When None, defaults route to
    customer_hydration.phase5.data_cloud.{create_segment, delete_segment,
    get_segment_status}.

    The default `get_status_fn` returns a SegmentStatus dataclass; the
    runner extracts `.member_count`. Tests can pass a fake that returns
    an int directly — both shapes are accepted.
    """
    if create_segment_fn is None:
        from customer_hydration.phase5.data_cloud import create_segment
        create_segment_fn = create_segment
    if delete_segment_fn is None:
        from customer_hydration.phase5.data_cloud import delete_segment
        delete_segment_fn = delete_segment
    if get_status_fn is None:
        from customer_hydration.phase5.data_cloud import get_segment_status
        get_status_fn = get_segment_status

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    anchor = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()

    probes = {
        "after":   _probe_segment_def(target_dmo, field, "after",  -days),
        "before":  _probe_segment_def(target_dmo, field, "before", -days),
        "frozen":  _probe_segment_def_frozen(target_dmo, field, anchor),
    }
    api_names: dict[str, str] = {}
    counts: dict[str, Optional[int]] = {}
    error: Optional[str] = None

    try:
        for tag, defn in probes.items():
            developer = f"PROBE_RELDATE_{tag.upper()}_{ts}"
            ok, info = create_segment_fn(
                instance_url, access_token,
                developer_name=developer,
                display_name=f"Probe RelDate {tag} {ts}",
                description="Phase 3d probe — safe to delete",
                segment_on_api_name="ssot__Account__dlm",
                include_criteria=defn,
            )
            if not ok:
                raise RuntimeError(f"create probe {tag}: {info}")
            api_names[tag] = info or f"{developer}__seg"
            raw = get_status_fn(instance_url, access_token, api_name=api_names[tag])
            # Accept both SegmentStatus dataclass and bare int return shapes.
            counts[tag] = getattr(raw, "member_count", raw) if raw is not None else None
    except Exception as exc:
        error = str(exc)
    finally:
        for api_name in api_names.values():
            try:
                delete_segment_fn(instance_url, access_token, api_name=api_name)
            except Exception:
                pass

    if error is not None:
        return ProbeResult(
            verdict=RELATIVE_DATES_UNKNOWN, target_dmo=target_dmo, field=field,
            days=days, ts=ts, error=error,
        )

    a, b, c = counts.get("after"), counts.get("before"), counts.get("frozen")
    if None in (a, b, c):
        verdict = RELATIVE_DATES_UNKNOWN
    elif a is not None and c is not None and abs(a - c) <= max(5, c // 100) and a < (b or 0):
        verdict = RELATIVE_DATES_OK
    else:
        verdict = RELATIVE_DATES_BROKEN

    return ProbeResult(
        verdict=verdict, target_dmo=target_dmo, field=field, days=days,
        count_recent=a, count_old=b, count_recent_frozen=c, ts=ts,
    )


def _probe_segment_def(target_dmo: str, field: str, op: str, value: int) -> dict:
    return {
        "type": "LogicalComparison", "operator": "and",
        "filters": [
            {
                "type": "TextComparison",
                "subject": {"objectApiName": "ssot__Account__dlm",
                            "fieldApiName": "External_ID_c__c"},
                "operator": "contains", "values": ["HYDRATE-"],
            },
            {
                "type": "ExactlyRelativeDateComparison",
                "subject": {"objectApiName": target_dmo, "fieldApiName": field},
                "operator": op, "dateUnits": "days", "value": value,
            },
        ],
    }


def _probe_segment_def_frozen(target_dmo: str, field: str, anchor_iso: str) -> dict:
    return {
        "type": "LogicalComparison", "operator": "and",
        "filters": [
            {
                "type": "TextComparison",
                "subject": {"objectApiName": "ssot__Account__dlm",
                            "fieldApiName": "External_ID_c__c"},
                "operator": "contains", "values": ["HYDRATE-"],
            },
            {
                "type": "DateComparison",
                "subject": {"objectApiName": target_dmo, "fieldApiName": field},
                "operator": "after", "value": [anchor_iso],
            },
        ],
    }
