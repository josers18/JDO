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


# Available Version: 62.0 per Connect API spec; v60/v61 return 404.
STREAM_TRIGGER_API_VERSION = "v62.0"


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
    connector_type: str = ""
    connector_name: str = ""


@dataclass
class StreamRunResult:
    """Outcome of a single trigger_stream_refresh call."""

    stream_api_name: str
    source_object: str
    run_id: str | None
    triggered_at: str
    # "Triggered" | "AlreadyRunning" | "Failed" | "PolicySkipped".
    # PolicySkipped covers org-policy rejections from the v62 actions/run
    # endpoint (e.g. SalesforceDotCom non-interactive 400, non-FULL_REFRESH
    # interactive 412) — distinct from a real failure because the API
    # accepted the request and just refused based on stream config.
    status: str
    error: str | None = None


@dataclass
class DataCloudStreamRefreshResult:
    """Aggregate outcome of a Phase 5.5 invocation."""

    streams_discovered: int = 0
    streams_matched: int = 0
    streams_triggered: int = 0
    # Streams the v62 actions/run endpoint refused on org-policy grounds
    # (e.g. SalesforceDotCom non-interactive, non-FULL_REFRESH interactive).
    # Distinct from ``stream_trigger_failures`` so the manifest captures
    # "no-op-by-design" outcomes without inflating the failure counter.
    streams_policy_skipped: int = 0
    stream_runs: list[StreamRunResult] = field(default_factory=list)
    stream_trigger_failures: list[str] = field(default_factory=list)


@dataclass
class SegmentInfo:
    """Subset of a segment's metadata returned by list_segments."""
    api_name: str
    display_name: str
    description: str
    target_dmo: str
    publish_schedule: str


@dataclass
class SegmentStatus:
    """Current state of a segment: status + member count + last publish time."""
    api_name: str
    status: str  # DRAFT | PUBLISHING | PUBLISHED | FAILED | NOT_FOUND
    member_count: int | None
    last_publish_time: str | None
    error: str | None = None


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
    """List all Data Cloud Data Streams in the org via REST.

    The endpoint paginates (default page size 10). Walk ``nextPageUrl``
    until the response stops returning one. Live-verified against
    jdo-uqj0jr where ``totalSize=289`` and a single-page read missed
    96% of streams.
    """
    import urllib.request

    streams: list[StreamInfo] = []
    next_path = f"/services/data/{api_version}/ssot/data-streams"
    safety_pages = 0
    while next_path and safety_pages < 200:
        safety_pages += 1
        req = urllib.request.Request(
            f"{instance_url}{next_path}",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        page_entries = (
            data.get("dataStreams")
            or data.get("streams")
            or data.get("records")
            or []
        )
        streams.extend(_parse_stream_entries(page_entries))
        # ``nextPageUrl`` is a path (e.g. ``/services/data/v60.0/ssot/...?offset=11``)
        # or null on the final page.
        next_path = data.get("nextPageUrl")
    return streams


def _parse_stream_entries(entries: list[dict]) -> list[StreamInfo]:
    """Translate raw /ssot/data-streams entries into StreamInfo objects."""
    out: list[StreamInfo] = []
    for entry in entries:
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
        # Live API (v60.0) shape: connectorInfo.connectorType identifies the
        # upstream system (SalesforceDotCom, SNOWFLAKE, etc.) and
        # connectorInfo.connectorDetails.name disambiguates own-source
        # ("SalesforceDotCom_Home") from external federation streams
        # (e.g. "SalesforceDotCom_FinsDC1"). Both are used by the
        # Phase 5.5 matcher as a fallback when source_object is empty.
        connector_info = entry.get("connectorInfo") or {}
        if isinstance(connector_info, dict):
            connector_type = connector_info.get("connectorType", "")
            connector_details = connector_info.get("connectorDetails") or {}
            connector_name = (
                connector_details.get("name", "")
                if isinstance(connector_details, dict)
                else ""
            )
        else:
            connector_type = ""
            connector_name = ""
        if api_name:
            out.append(StreamInfo(
                api_name=api_name,
                source_object=source or "",
                label=label,
                connector_type=connector_type,
                connector_name=connector_name,
            ))
    return out


def trigger_stream_refresh(
    instance_url: str,
    access_token: str,
    stream_api_name: str,
    api_version: str = STREAM_TRIGGER_API_VERSION,
) -> tuple[bool, str | None, str | None]:
    """POST to a stream's actions/run endpoint. Returns ``(success, run_id, error)``.

    Endpoint per Connect API spec
    (``/services/data/connectapi/spec/cdp-connect-api-Swagger.yaml``):

        POST /services/data/v62.0/ssot/data-streams/{name}/actions/run
             ?interactive=true

    Available Version: 62.0 — v60/v61 return 404. ``interactive=true`` is
    required for SalesforceDotCom-typed connectors; the API rejects
    ``interactive=false`` with HTTP 400 ``"Connector type SalesforceDotCom
    is not allowed to run in non-interactive mode"`` (live-verified
    against jdo-fw51xz, 2026-05-22).

    The org enforces a separate policy: only streams whose
    ``refreshMode == FULL_REFRESH`` may be triggered manually. Streams
    configured for UPSERT yield HTTP 412 ``"not allowed to run in
    interactive mode if refresh mode is not FULL_REFRESH"``.

    Both of those are returned as ``(False, None, "policy: <message>")``
    so the caller can record them as ``PolicySkipped`` rather than as
    real failures. Other HTTP errors return ``(False, None,
    "HTTP <code>: <body>")``. Phase 5.5 fire-and-forget contract is
    preserved — this function never raises.
    """
    import urllib.request
    from urllib.error import HTTPError

    url = (
        f"{instance_url}/services/data/{api_version}"
        f"/ssot/data-streams/{stream_api_name}/actions/run"
        f"?interactive=true"
    )
    req = urllib.request.Request(url, method="POST", headers={
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read())
        # Spec: DataStreamActionResponseRepresentation. Empirically the
        # field name has drifted across versions, so try the spec'd key
        # first then fall back.
        run_id = (
            body.get("dataStreamRunId")
            or body.get("runId")
            or body.get("id")
            or body.get("actionId")
        )
        return (True, run_id, None)
    except HTTPError as exc:
        try:
            err_body = exc.fp.read().decode("utf-8") if exc.fp else ""
        except Exception:  # noqa: BLE001 - body is best-effort
            err_body = ""
        # Detect org-policy rejections — both the 400 non-interactive and
        # the 412 non-FULL_REFRESH responses come back as JSON arrays of
        # ``{errorCode, message}`` objects.
        policy_msg = _extract_policy_message(exc.code, err_body)
        if policy_msg is not None:
            return (False, None, f"policy: {policy_msg}")
        snippet = err_body[:200] if err_body else exc.reason
        return (False, None, f"HTTP {exc.code}: {snippet}")
    except Exception as exc:  # noqa: BLE001 - surfaced in result, not raised
        return (False, None, str(exc))


def _extract_policy_message(http_code: int, body: str) -> str | None:
    """Return the policy message if ``body`` matches a known org-policy
    rejection from the v62 actions/run endpoint, else ``None``.

    Recognised cases (live-verified 2026-05-22):
      - HTTP 400 + "not allowed to run in non-interactive mode"
      - HTTP 412 + "not allowed to run in interactive mode if refresh mode
        is not FULL_REFRESH"
      - HTTP 412 + "Data Stream status must be ACTIVE or PROCESSING"
    """
    if http_code not in (400, 412) or not body:
        return None
    # The API returns a JSON array; tolerate single-object shape too.
    message = ""
    try:
        parsed = json.loads(body)
    except (json.JSONDecodeError, ValueError):
        message = body
    else:
        if isinstance(parsed, list) and parsed and isinstance(parsed[0], dict):
            message = str(parsed[0].get("message") or "")
        elif isinstance(parsed, dict):
            message = str(parsed.get("message") or "")
    if not message:
        message = body
    lowered = message.lower()
    if (
        "not allowed to run in non-interactive mode" in lowered
        or "not allowed to run in interactive mode if refresh mode is not full_refresh"
        in lowered
        or "data stream status must be active or processing" in lowered
    ):
        return message
    return None


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
    # Match if legacy source_object is in allowlist OR connector_name
    # equals "SalesforceDotCom_Home" (live v60.0 API omits sourceObject
    # entirely and exposes the upstream system via connectorInfo. The
    # narrower connectorDetails.name check excludes external federation
    # streams from other orgs — e.g. SalesforceDotCom_FinsDC1 — which
    # share connectorType "SalesforceDotCom" but are NOT this org's own
    # data and therefore must not be triggered by the hydrate refresh).
    matching = [
        s for s in streams
        if s.source_object in sources_set or s.connector_name == "SalesforceDotCom_Home"
    ]
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
        elif err is not None and err.startswith("policy:"):
            # Org-policy rejection — recorded as a distinct outcome and
            # NOT counted as a trigger failure (the API accepted the
            # request and refused based on the stream's refreshMode /
            # connector configuration).
            result.stream_runs.append(StreamRunResult(
                stream_api_name=stream.api_name,
                source_object=stream.source_object,
                run_id=None,
                triggered_at=triggered_at,
                status="PolicySkipped",
                error=err,
            ))
            result.streams_policy_skipped += 1
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


def list_segments(
    instance_url: str, access_token: str, api_version: str = "v60.0",
) -> list[SegmentInfo]:
    """List all DC Segments via GET /services/data/{v}/ssot/segments.

    Tolerates response shape variation: tries `segments`, `dataSegments`,
    `records` keys in order. Returns empty list on any HTTP error
    (Phase 5.5 fire-and-forget convention)."""
    import urllib.request
    from urllib.error import HTTPError, URLError
    url = f"{instance_url}/services/data/{api_version}/ssot/segments"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
    except (HTTPError, URLError, json.JSONDecodeError):
        return []
    raw = data.get("segments") or data.get("dataSegments") or data.get("records") or []
    out: list[SegmentInfo] = []
    for entry in raw:
        api_name = entry.get("apiName") or entry.get("name") or entry.get("DataSegmentApiName") or ""
        if not api_name:
            continue
        out.append(SegmentInfo(
            api_name=api_name,
            display_name=entry.get("displayName") or entry.get("masterLabel") or api_name,
            description=entry.get("description") or "",
            target_dmo=entry.get("targetDmo") or entry.get("targetEntity") or "",
            publish_schedule=entry.get("publishSchedule") or "manual",
        ))
    return out


def create_segment(
    instance_url: str, access_token: str, *,
    developer_name: str,
    display_name: str,
    description: str,
    segment_on_api_name: str,
    include_criteria: dict,
    publish_schedule: str = "NoRefresh",
    segment_type: str = "Dynamic",
    api_version: str = "v60.0",
) -> tuple[bool, str | None]:
    """Create a new segment via POST /services/data/{v}/ssot/segments.

    Live-verified payload schema (Task 10 smoke against jdo-uqj0jr,
    2026-05-22):

        {
          "displayName": ...,
          "developerName": ...,
          "segmentOnApiName": "Account_demo__dlm",
          "segmentType": "Dynamic",        # required for new segments
          "publishSchedule": "NoRefresh",  # enum: NoRefresh|One|Two|Four|Six|Twelve|TwentyFour
          "description": ...,
          "includeCriteria": "<stringified JSON DSL>",
        }

    The ``include_criteria`` dict is JSON-serialised at call time. It
    must be a single TextComparison/NumberComparison/DateTimeComparison
    object, or a LogicalComparison wrapping multiple filters. Callers
    are responsible for AND-injecting the HYDRATE-* clause before
    invoking this function (handled upstream in
    ``segments.inject_hydrate_clause``).

    Returns ``(success, segment_api_name_or_error_message)``. Never
    raises — Phase 5.5 fire-and-forget contract: HTTP errors are
    returned as (False, error_string)."""
    import urllib.request
    from urllib.error import HTTPError, URLError
    url = f"{instance_url}/services/data/{api_version}/ssot/segments"
    body = {
        "displayName": display_name,
        "developerName": developer_name,
        "segmentOnApiName": segment_on_api_name,
        "segmentType": segment_type,
        "publishSchedule": publish_schedule,
        "description": description,
        "includeCriteria": json.dumps(include_criteria),
    }
    req = urllib.request.Request(
        url, method="POST",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
        # Live API echoes apiName for the created segment; fall back to
        # id/segmentId for older responses, then to developer_name.
        return (
            True,
            data.get("apiName")
            or data.get("id")
            or data.get("segmentId")
            or developer_name,
        )
    except HTTPError as exc:
        try:
            err_body = exc.fp.read().decode("utf-8") if exc.fp else ""
        except Exception:
            err_body = ""
        return (False, f"HTTP {exc.code} {exc.reason}: {err_body[:200]}")
    except (URLError, json.JSONDecodeError) as exc:
        return (False, str(exc))


# NOTE: patch_segment was removed in the Task 10a rewrite. The Data
# Cloud segments endpoint returns ENTITY_SAVE_ERROR on PATCH for any
# segment with segmentType=Dynamic — only Dbt and Lookalike segments
# accept update calls. Phase 2 segments are all Dynamic, so an existing
# segment with the same developerName is now treated as idempotent
# success by ``execute_create_segments`` (skipped, not patched).


def publish_segment(
    instance_url: str, access_token: str, *,
    api_name: str,
    api_version: str = "v60.0",
) -> tuple[bool, str | None]:
    """Trigger a publish (membership computation) for a segment via
    POST /services/data/{v}/ssot/segments/{api_name}/publish.

    Returns (success, run_id_or_error). Never raises."""
    import urllib.request
    from urllib.error import HTTPError, URLError
    url = f"{instance_url}/services/data/{api_version}/ssot/segments/{api_name}/publish"
    req = urllib.request.Request(url, method="POST", headers={
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        return (True, data.get("runId") or data.get("id") or api_name)
    except HTTPError as exc:
        try:
            err_body = exc.fp.read().decode("utf-8") if exc.fp else ""
        except Exception:
            err_body = ""
        return (False, f"HTTP {exc.code} {exc.reason}: {err_body[:200]}")
    except (URLError, json.JSONDecodeError) as exc:
        return (False, str(exc))


def get_segment_status(
    instance_url: str, access_token: str, *,
    api_name: str,
    api_version: str = "v60.0",
) -> SegmentStatus:
    """Fetch a segment's current state via GET /services/data/{v}/ssot/segments/{api_name}.

    Returns SegmentStatus. Never raises — returns a status with status=NOT_FOUND or FAILED
    on HTTP error."""
    import urllib.request
    from urllib.error import HTTPError, URLError
    url = f"{instance_url}/services/data/{api_version}/ssot/segments/{api_name}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        return SegmentStatus(
            api_name=api_name,
            status=data.get("status") or "UNKNOWN",
            member_count=data.get("memberCount"),
            last_publish_time=data.get("lastPublishTime"),
            error=None,
        )
    except HTTPError as exc:
        return SegmentStatus(
            api_name=api_name,
            status="NOT_FOUND" if exc.code == 404 else "FAILED",
            member_count=None,
            last_publish_time=None,
            error=f"HTTP {exc.code} {exc.reason}",
        )
    except (URLError, json.JSONDecodeError) as exc:
        return SegmentStatus(
            api_name=api_name,
            status="FAILED",
            member_count=None,
            last_publish_time=None,
            error=str(exc),
        )
