"""Phase 2: orchestrate Data Cloud segment creation + publish.

Reads config/segments.yaml, creates each segment via the REST API
(or PATCHes if it already exists), and triggers a publish. Idempotent:
re-runs are safe and effectively become a "republish all" pass.

Fire-and-forget per Phase 5.5 convention: per-segment failures are
recorded on the result, not raised.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yaml

from customer_hydration.phase5.data_cloud import (
    DataCloudStreamRefreshResult,
    SegmentInfo,
    create_segment,
    execute_phase5_5,
    get_org_session,
    list_segments,
    patch_segment,
    publish_segment,
)


@dataclass
class SegmentDefinition:
    """One segment as parsed from segments.yaml."""
    config_key: str
    api_name: str
    display_name: str
    description: str
    persona: str
    publish_schedule: str
    target_dmo: str
    filter_sql: str
    linked_campaign: Optional[str] = None


@dataclass
class SegmentCreateResult:
    """Per-segment outcome from execute_create_segments."""
    config_key: str
    api_name: str
    created: bool = False  # True if newly created
    patched: bool = False  # True if updated in place
    published: bool = False
    member_count: Optional[int] = None
    error: Optional[str] = None


@dataclass
class CreateSegmentsResult:
    """Aggregate result for an execute_create_segments run."""
    segments_processed: int = 0
    segments_created: int = 0
    segments_patched: int = 0
    segments_published: int = 0
    segments_failed: int = 0
    results: list[SegmentCreateResult] = field(default_factory=list)


# DMO-mapped name (verified against Account_demo__dlm in jdo-uqj0jr on 2026-05-22).
# The source field External_ID__c becomes External_ID_c__c after DC mapping.
_HYDRATE_CLAUSE = "External_ID_c__c LIKE 'HYDRATE-%'"


def config_key_to_api_name(config_key: str) -> str:
    """Map snake_case config key to PascalCase__seg API name.

    Examples:
        retail_all → RetailAll__seg
        wealth_pre_retiree → WealthPreRetiree__seg
        cmp_heloc_refi_outreach → CmpHelocRefiOutreach__seg
    """
    parts = config_key.split("_")
    pascal = "".join(p.capitalize() for p in parts)
    return f"{pascal}__seg"


def inject_hydrate_clause(filter_sql: str) -> str:
    """Append `AND External_ID_c__c LIKE 'HYDRATE-%'` to a filter unless already present.

    Idempotent: if the HYDRATE-* clause already appears in the filter (in any form),
    the input is returned unchanged."""
    if "HYDRATE-%" in filter_sql:
        return filter_sql
    stripped = filter_sql.strip()
    return f"{stripped} AND {_HYDRATE_CLAUSE}"


def load_segment_definitions(yaml_path: Path) -> list[SegmentDefinition]:
    """Parse segments.yaml. Validates required fields. Injects the
    HYDRATE-* clause into each rule.filter. Raises ValueError on
    malformed YAML."""
    text = yaml_path.read_text(encoding="utf-8")
    data = yaml.safe_load(text) or {}
    segments_section = data.get("segments")
    if segments_section is None:
        raise ValueError(f"YAML at {yaml_path} is missing top-level 'segments' key")
    if not isinstance(segments_section, dict):
        raise ValueError(f"'segments' must be a mapping in {yaml_path}")

    required = {"name", "description", "persona", "publish_schedule", "target_dmo", "rule"}
    out: list[SegmentDefinition] = []
    for config_key, entry in segments_section.items():
        if not isinstance(entry, dict):
            raise ValueError(f"Segment {config_key!r} must be a mapping")
        missing = required - set(entry.keys())
        if missing:
            raise ValueError(
                f"Segment {config_key!r} is missing required field(s): {sorted(missing)}"
            )
        rule = entry["rule"]
        if not isinstance(rule, dict) or "filter" not in rule:
            raise ValueError(f"Segment {config_key!r}.rule must contain 'filter'")
        filter_sql = inject_hydrate_clause(str(rule["filter"]))
        out.append(SegmentDefinition(
            config_key=config_key,
            api_name=config_key_to_api_name(config_key),
            display_name=entry["name"],
            description=entry["description"],
            persona=entry["persona"],
            publish_schedule=entry["publish_schedule"],
            target_dmo=entry["target_dmo"],
            filter_sql=filter_sql,
            linked_campaign=entry.get("linked_campaign"),
        ))
    return out


def execute_create_segments(
    *,
    target_org: str,
    yaml_path: Path,
    segment_id: Optional[str] = None,
    skip_publish: bool = False,
    dry_run: bool = False,
) -> CreateSegmentsResult:
    """Create + publish segments per segments.yaml.

    Idempotent: if a segment exists (matching api_name), PATCH it; else POST.
    Always publish (subject to skip_publish).

    Per-segment failures are recorded on the result; this function never raises."""
    definitions = load_segment_definitions(yaml_path)
    if segment_id is not None:
        definitions = [d for d in definitions if d.config_key == segment_id]
        if not definitions:
            result = CreateSegmentsResult()
            return result

    result = CreateSegmentsResult()
    result.segments_processed = len(definitions)

    if dry_run:
        for d in definitions:
            r = SegmentCreateResult(config_key=d.config_key, api_name=d.api_name)
            result.results.append(r)
            print(f"  DRY-RUN would create/patch {d.api_name} ({d.display_name})")
        return result

    try:
        instance_url, access_token = get_org_session(target_org)
    except Exception as exc:
        # Mark every definition as failed
        for d in definitions:
            r = SegmentCreateResult(
                config_key=d.config_key, api_name=d.api_name,
                error=f"get_org_session failed: {exc}",
            )
            result.results.append(r)
            result.segments_failed += 1
        return result

    existing = {s.api_name for s in list_segments(instance_url, access_token)}

    for d in definitions:
        r = SegmentCreateResult(config_key=d.config_key, api_name=d.api_name)
        if d.api_name in existing:
            ok, info = patch_segment(
                instance_url, access_token,
                api_name=d.api_name,
                display_name=d.display_name,
                description=d.description,
                filter_sql=d.filter_sql,
                publish_schedule=d.publish_schedule,
            )
            if ok:
                r.patched = True
                result.segments_patched += 1
            else:
                r.error = info
                result.segments_failed += 1
                result.results.append(r)
                continue
        else:
            ok, info = create_segment(
                instance_url, access_token,
                api_name=d.api_name,
                display_name=d.display_name,
                description=d.description,
                target_dmo=d.target_dmo,
                filter_sql=d.filter_sql,
                publish_schedule=d.publish_schedule,
            )
            if ok:
                r.created = True
                result.segments_created += 1
            else:
                r.error = info
                result.segments_failed += 1
                result.results.append(r)
                continue

        if not skip_publish:
            ok, info = publish_segment(
                instance_url, access_token, api_name=d.api_name,
            )
            if ok:
                r.published = True
                result.segments_published += 1
            else:
                # Publish-only failure — segment was successfully created/patched
                # but couldn't trigger publish. Don't count toward `segments_failed`
                # (the create/patch succeeded); just record the publish error.
                r.error = f"publish failed: {info}"

        result.results.append(r)

    return result


def execute_refresh_streams(*, target_org: str) -> DataCloudStreamRefreshResult:
    """Refresh DC streams sourcing from hydrated objects.

    Thin wrapper around execute_phase5_5 from data_cloud.py, exposed as a
    standalone function so the new `refresh-streams` CLI subcommand can call
    it directly without going through the hydrate runner."""
    return execute_phase5_5(target_org=target_org)
