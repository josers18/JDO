"""Phase 5.5: discover Data Cloud streams matching hydrated CRM source
objects, then trigger a refresh on each one.

Fire-and-forget: this module NEVER raises out of ``execute_phase5_5``.
All transport / lookup / trigger errors are recorded on the returned
:class:`DataCloudStreamRefreshResult` so the runner can log them in the
manifest without aborting the rest of the load.
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from typing import Iterable


# Source objects the hydrate pipeline writes to. A Data Cloud stream is
# considered "match-eligible" iff its sourceObject (or alt API field) is
# in this set. Includes both managed-package FSC objects (FinServ__*) and
# the post-revamp native equivalents.
HYDRATE_SOURCE_OBJECTS = {
    "Account", "Contact", "Opportunity", "Case", "Task", "Event",
    "Campaign", "CampaignMember", "AccountContactRelation",
    "FinServ__FinancialAccount__c", "FinServ__FinancialAccountRole__c",
    "FinServ__Card__c", "FinServ__FinancialHolding__c",
    "FinServ__FinancialGoal__c", "FinServ__LifeEvent__c",
    "FinServ__BusinessMilestone__c",
    "FinancialAccount", "FinancialAccountParty", "FinancialGoal",
    "BusinessMilestone", "PartyRelationshipGroup", "PartyProfile",
    "ContactPointAddress", "ContactPointEmail", "ContactPointPhone",
}


@dataclass
class StreamInfo:
    """Lightweight descriptor of a Data Cloud Data Stream."""

    api_name: str
    source_object: str
    label: str = ""


@dataclass
class StreamRunResult:
    """Outcome of a single trigger_stream_refresh call."""

    stream_api_name: str
    source_object: str
    run_id: str | None
    triggered_at: str
    status: str  # "Triggered" | "AlreadyRunning" | "Failed"
    error: str | None = None


@dataclass
class DataCloudStreamRefreshResult:
    """Aggregate outcome of a Phase 5.5 invocation."""

    streams_discovered: int = 0
    streams_matched: int = 0
    streams_triggered: int = 0
    stream_runs: list[StreamRunResult] = field(default_factory=list)
    stream_trigger_failures: list[str] = field(default_factory=list)


def get_org_session(target_org: str) -> tuple[str, str]:
    """Return ``(instance_url, access_token)`` for the target org via
    ``sf org display --verbose --json``.

    Raises :class:`RuntimeError` on subprocess failure or missing fields.
    Callers in :func:`execute_phase5_5` catch this so Phase 5.5 stays
    fire-and-forget.
    """
    cmd = [
        "sf", "org", "display",
        "--target-org", target_org,
        "--verbose",
        "--json",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"sf org display failed: {proc.stderr or proc.stdout}")
    payload = json.loads(proc.stdout)
    result = payload.get("result", {})
    instance_url = result.get("instanceUrl") or result.get("InstanceUrl")
    access_token = result.get("accessToken") or result.get("AccessToken")
    if not instance_url or not access_token:
        raise RuntimeError(
            f"sf org display returned no instanceUrl/accessToken: {result}"
        )
    return (instance_url, access_token)


def list_streams(
    instance_url: str,
    access_token: str,
    api_version: str = "v60.0",
) -> list[StreamInfo]:
    """List all Data Cloud Data Streams in the org via REST."""
    import urllib.request

    url = f"{instance_url}/services/data/{api_version}/ssot/data-streams"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    streams: list[StreamInfo] = []
    # Response shape varies; tolerate dataStreams / streams / records keys
    for entry in (
        data.get("dataStreams")
        or data.get("streams")
        or data.get("records")
        or []
    ):
        api_name = (
            entry.get("apiName")
            or entry.get("name")
            or entry.get("DataStreamApiName")
        )
        if isinstance(entry.get("source"), dict):
            source = entry.get("source", {}).get("apiName") or ""
        else:
            source = (
                entry.get("sourceObject")
                or entry.get("sourceObjectApiName")
                or ""
            )
        label = entry.get("label") or entry.get("MasterLabel") or ""
        if api_name:
            streams.append(StreamInfo(
                api_name=api_name,
                source_object=source or "",
                label=label,
            ))
    return streams


def trigger_stream_refresh(
    instance_url: str,
    access_token: str,
    stream_api_name: str,
    api_version: str = "v60.0",
) -> tuple[bool, str | None, str | None]:
    """POST to stream's run-now endpoint. Returns ``(success, run_id, error)``."""
    import urllib.request

    url = (
        f"{instance_url}/services/data/{api_version}"
        f"/ssot/data-streams/{stream_api_name}/refresh"
    )
    req = urllib.request.Request(url, method="POST", headers={
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read())
        run_id = (
            body.get("runId")
            or body.get("id")
            or body.get("dataStreamRunId")
        )
        return (True, run_id, None)
    except Exception as exc:  # noqa: BLE001 - surfaced in result, not raised
        return (False, None, str(exc))


def execute_phase5_5(
    *,
    target_org: str,
    sources_to_match: Iterable[str] = HYDRATE_SOURCE_OBJECTS,
) -> DataCloudStreamRefreshResult:
    """Discover + trigger CRM-sourced Data Cloud streams. Fire-and-forget.

    Phase 5.5 trigger failures DO NOT raise — they're logged in the
    result so the caller can record them in the manifest without
    aborting the run.
    """
    from datetime import datetime, timezone

    result = DataCloudStreamRefreshResult()
    try:
        instance_url, access_token = get_org_session(target_org)
    except Exception as exc:  # noqa: BLE001 - fire-and-forget
        result.stream_trigger_failures.append(f"get_org_session: {exc}")
        return result

    try:
        streams = list_streams(instance_url, access_token)
    except Exception as exc:  # noqa: BLE001 - fire-and-forget
        result.stream_trigger_failures.append(f"list_streams: {exc}")
        return result

    result.streams_discovered = len(streams)
    sources_set = set(sources_to_match)
    matching = [s for s in streams if s.source_object in sources_set]
    result.streams_matched = len(matching)

    for stream in matching:
        triggered_at = datetime.now(timezone.utc).isoformat()
        success, run_id, err = trigger_stream_refresh(
            instance_url, access_token, stream.api_name,
        )
        if success:
            result.stream_runs.append(StreamRunResult(
                stream_api_name=stream.api_name,
                source_object=stream.source_object,
                run_id=run_id,
                triggered_at=triggered_at,
                status="Triggered",
            ))
            result.streams_triggered += 1
        else:
            result.stream_runs.append(StreamRunResult(
                stream_api_name=stream.api_name,
                source_object=stream.source_object,
                run_id=None,
                triggered_at=triggered_at,
                status="Failed",
                error=err,
            ))
            result.stream_trigger_failures.append(f"{stream.api_name}: {err}")

    return result


def poll_stream_run_status(
    instance_url: str,
    access_token: str,
    run_id: str,
    api_version: str = "v60.0",
) -> dict:
    """Poll a stream-run for its current state. Used by ``dc-status`` subcommand."""
    import urllib.request

    url = (
        f"{instance_url}/services/data/{api_version}"
        f"/ssot/data-stream-runs/{run_id}"
    )
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())
