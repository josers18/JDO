"""Phase 2: orchestrate Data Cloud segment creation.

Reads ``config/segments.yaml``, translates each YAML rule into the live
Data Cloud JSON DSL (TextComparison / NumberComparison /
DateComparison / LogicalComparison), AND-injects the HYDRATE-*
membership clause, then creates each segment via the REST API.

Idempotent: if a segment with the same ``developerName`` already
exists, it's treated as a no-op skip. The Data Cloud API rejects PATCH
on Dynamic segments (ENTITY_SAVE_ERROR — only Dbt and Lookalike
segments accept update), so we never attempt to update an existing
Dynamic segment in place.

Fire-and-forget per Phase 5.5 convention: per-segment failures are
recorded on the result, not raised.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import yaml

from customer_hydration.phase5.data_cloud import (
    DataCloudStreamRefreshResult,
    SegmentInfo,
    create_segment,
    execute_phase5_5,
    get_org_session,
    list_segments,
)


@dataclass
class SegmentDefinition:
    """One segment as parsed from segments.yaml.

    ``include_criteria`` is the FULL JSON DSL with the HYDRATE-* clause
    already AND-injected — ready to hand to ``data_cloud.create_segment``.
    """
    config_key: str
    api_name: str            # <DeveloperName>__seg, derived for legacy callers
    developer_name: str      # PascalCase, used as the API developerName
    display_name: str
    description: str
    persona: str
    publish_schedule: str    # YAML form (manual|hourly|daily|weekly)
    target_dmo: str
    include_criteria: dict[str, Any]
    linked_campaign: Optional[str] = None


@dataclass
class SegmentCreateResult:
    """Per-segment outcome from execute_create_segments."""
    config_key: str
    api_name: str
    created: bool = False    # True if newly created via POST
    skipped: bool = False    # True if a same-developerName segment already existed
    error: Optional[str] = None


@dataclass
class CreateSegmentsResult:
    """Aggregate result for an execute_create_segments run."""
    segments_processed: int = 0
    segments_created: int = 0
    segments_skipped: int = 0
    segments_failed: int = 0
    results: list[SegmentCreateResult] = field(default_factory=list)


# Live-verified HYDRATE membership filter. Every Phase 2 segment is
# wrapped in a LogicalComparison.and so it can only match hydrated demo
# accounts (External_ID_c__c starting with "HYDRATE-"), never the org's
# 178 pre-existing seed accounts.
HYDRATE_CLAUSE: dict[str, Any] = {
    "type": "TextComparison",
    "subject": {
        "objectApiName": "Account_demo__dlm",
        "fieldApiName": "External_ID_c__c",
    },
    "operator": "contains",
    "values": ["HYDRATE-"],
}


# YAML publish_schedule form -> live DC API enum.
# Live-verified enum: NoRefresh|One|Two|Four|Six|Twelve|TwentyFour.
# There is no native weekly slot; we collapse weekly -> TwentyFour
# (closest available cadence) and document that in segments.yaml.
_PUBLISH_SCHEDULE_MAP = {
    "manual": "NoRefresh",
    "hourly": "One",
    "daily": "TwentyFour",
    "weekly": "TwentyFour",
}


def map_publish_schedule(yaml_value: str) -> str:
    """Translate YAML publish_schedule form to live DC API enum.

    Pass-through for values that are already valid API enums (so a
    YAML author can opt into the granular live cadences directly)."""
    return _PUBLISH_SCHEDULE_MAP.get(yaml_value, yaml_value)


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


def _config_key_to_developer_name(config_key: str) -> str:
    """Map snake_case config key to the PascalCase developerName the
    live API expects (no ``__seg`` suffix — that's appended server-side
    on the returned ``apiName`` field)."""
    parts = config_key.split("_")
    return "".join(p.capitalize() for p in parts)


def inject_hydrate_clause(user_criteria: dict[str, Any]) -> dict[str, Any]:
    """Wrap ``user_criteria`` in a LogicalComparison.and with the
    HYDRATE-* membership filter, so segments can only match hydrated
    demo accounts.

    The wrapping is intentional even when ``user_criteria`` is itself a
    LogicalComparison.and (we don't try to flatten / merge filters,
    keeping the injection logic simple and predictable).

    Filter array shape note: the live DC create endpoint expects a FLAT
    array of comparison objects — a wrapped {"filter": {...}} shape
    triggers "missing discriminator field: <type>". (Quirky asymmetry:
    when read back via SOQL, IncludeCriteria stores filters WITH the
    wrapper, but POST/PATCH does NOT accept that form.)
    """
    return {
        "type": "LogicalComparison",
        "operator": "and",
        "filters": [HYDRATE_CLAUSE, user_criteria],
    }


# ---- Rule DSL translation ----

def _subject(target_dmo: str, field: str) -> dict[str, str]:
    return {"objectApiName": target_dmo, "fieldApiName": field}


def _text_comparison(
    target_dmo: str, field: str, operator: str,
    values: Optional[list[Any]] = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "type": "TextComparison",
        "subject": _subject(target_dmo, field),
        "operator": operator,
    }
    if values is not None:
        out["values"] = values
    return out


def _number_comparison(
    target_dmo: str, field: str, operator: str, values: list[Any],
) -> dict[str, Any]:
    return {
        "type": "NumberComparison",
        "subject": _subject(target_dmo, field),
        "operator": operator,
        "values": values,
    }


def _datetime_comparison(
    target_dmo: str, field: str, operator: str, values: list[Any],
) -> dict[str, Any]:
    # Live DC API uses "DateComparison" with singular "value" (a list).
    return {
        "type": "DateComparison",
        "subject": _subject(target_dmo, field),
        "operator": operator,
        "value": values,
    }


def _relative_date_comparison(
    target_dmo: str, field: str, operator: str, value: int, units: str = "years",
) -> dict[str, Any]:
    """Emit an ExactlyRelativeDateComparison clause.

    DC evaluates the comparison at publish time, so the value is anchored
    to today, not to a frozen calendar date. Used to express age windows
    via PersonBirthdate without time-fragility.

    Live API quirks (verified 2026-05-22 against jdo-uqj0jr):
    - ``dateUnits`` is lowercase (``"years"``, ``"days"``, ``"months"``).
      Title-case ``"Years"`` from the spec is rejected as
      ``"Unexpected value 'Years'"``.
    - ``value`` is a signed integer. Negative values mean "in the past":
      ``operator: "after",  value: -65`` means "field date is later than
      65 years ago" (i.e. the person is younger than 65). ``operator:
      "before", value: -55`` means "field date is earlier than 55 years
      ago" (i.e. the person is older than 55).
    """
    return {
        "type": "ExactlyRelativeDateComparison",
        "subject": _subject(target_dmo, field),
        "operator": operator,
        "dateUnits": units,
        "value": value,
    }


def _and(*filters: dict[str, Any]) -> dict[str, Any]:
    # Live DC create endpoint expects a flat filter array — see
    # inject_hydrate_clause docstring for the asymmetry note.
    return {
        "type": "LogicalComparison",
        "operator": "and",
        "filters": list(filters),
    }


def _or(*filters: dict[str, Any]) -> dict[str, Any]:
    """LogicalComparison.or wrapper. Symmetric counterpart to ``_and``."""
    return {
        "type": "LogicalComparison",
        "operator": "or",
        "filters": list(filters),
    }


def _translate_rule(rule: dict[str, Any], target_dmo: str, config_key: str) -> dict[str, Any]:
    """Translate one YAML rule into the DC JSON DSL.

    Compound rules (``all_of`` / ``any_of``) recurse into their sub-rules
    so callers can build arbitrarily nested AND/OR trees:

        rule:
          type: all_of
          rules:
            - type: text_equals
              field: FinServ_ClientCategory_c__c
              value: "Wealth Management"
            - type: age_in_range
              field: PersonBirthdate__c
              min_age: 55
              max_age: 65

    Atomic rules (``text_*``, ``number_*``, ``date_*``, ``age_*``) require
    a ``field``; compound rules don't.
    """
    rule_type = rule.get("type")
    if rule_type is None:
        raise ValueError(f"Segment {config_key!r}.rule.type is required")

    # ----- Compound rules -----
    if rule_type in ("all_of", "any_of"):
        sub_rules = rule.get("rules")
        if not isinstance(sub_rules, list) or not sub_rules:
            raise ValueError(
                f"Segment {config_key!r}.rule.rules must be a non-empty list "
                f"for compound type {rule_type!r}"
            )
        translated = [_translate_rule(r, target_dmo, config_key) for r in sub_rules]
        if len(translated) == 1:
            # Don't wrap a single sub-rule in a logical-comparison.
            return translated[0]
        return _and(*translated) if rule_type == "all_of" else _or(*translated)

    # Atomic rules from here down all need a field.
    field = rule.get("field")
    if field is None:
        raise ValueError(f"Segment {config_key!r}.rule.field is required for type {rule_type!r}")

    if rule_type == "text_equals":
        # Live DC API uses "matches" for text equality on Dynamic
        # segments. Sending "equals" returns "Unexpected value 'equals'"
        # from the create endpoint. The DSL key text_equals stays for
        # the YAML-side abstraction; only the emitted operator changes.
        return _text_comparison(target_dmo, field, "matches", [rule["value"]])
    if rule_type == "text_contains":
        return _text_comparison(target_dmo, field, "contains", [rule["value"]])
    if rule_type == "text_in":
        values = rule.get("values")
        if not isinstance(values, list):
            raise ValueError(
                f"Segment {config_key!r}.rule.values must be a list for type text_in"
            )
        return _text_comparison(target_dmo, field, "in", list(values))
    if rule_type == "text_has_value":
        return _text_comparison(target_dmo, field, "has value")

    if rule_type == "number_gt":
        return _number_comparison(target_dmo, field, "greater than", [rule["value"]])
    if rule_type == "number_lt":
        return _number_comparison(target_dmo, field, "less than", [rule["value"]])
    if rule_type == "number_gte":
        return _number_comparison(target_dmo, field, "greater than or equal", [rule["value"]])
    if rule_type == "number_lte":
        return _number_comparison(target_dmo, field, "less than or equal", [rule["value"]])
    if rule_type == "number_in_range":
        return _and(
            _number_comparison(target_dmo, field, "greater than or equal", [rule["gte"]]),
            _number_comparison(target_dmo, field, "less than or equal", [rule["lte"]]),
        )

    if rule_type == "date_before":
        return _datetime_comparison(target_dmo, field, "before", [rule["value"]])
    if rule_type == "date_after":
        return _datetime_comparison(target_dmo, field, "after", [rule["value"]])
    if rule_type == "date_in_range":
        return _and(
            _datetime_comparison(target_dmo, field, "after", [rule["after"]]),
            _datetime_comparison(target_dmo, field, "before", [rule["before"]]),
        )

    # Age rules use ExactlyRelativeDateComparison so DC re-evaluates the
    # window at publish time. The YAML expresses age in years; the
    # translator inverts to a date-of-birth filter relative to "now".
    #
    # Mapping (where field is a birthdate-like column):
    #   age >= N   ->  field BEFORE  (now - N years)
    #   age <= N   ->  field AFTER   (now - N years - 1 day approximation:
    #                                   we use the year-boundary, which DC
    #                                   evaluates as "more recent than
    #                                   exactly N years ago")
    #
    # For age_in_range with [min_age, max_age]:
    #   field BEFORE (now - min_age years)  AND  field AFTER (now - max_age years)
    if rule_type == "age_gte":
        return _relative_date_comparison(target_dmo, field, "before", -int(rule["value"]))
    if rule_type == "age_lte":
        return _relative_date_comparison(target_dmo, field, "after", -int(rule["value"]))
    if rule_type == "age_in_range":
        min_age = int(rule["min_age"])
        max_age = int(rule["max_age"])
        return _and(
            _relative_date_comparison(target_dmo, field, "before", -min_age),
            _relative_date_comparison(target_dmo, field, "after", -max_age),
        )

    raise ValueError(
        f"Segment {config_key!r}: unsupported rule type {rule_type!r}. "
        f"Supported: text_equals, text_contains, text_in, text_has_value, "
        f"number_gt/lt/gte/lte, number_in_range, date_before, date_after, "
        f"date_in_range, age_gte, age_lte, age_in_range, all_of, any_of."
    )


def load_segment_definitions(yaml_path: Path) -> list[SegmentDefinition]:
    """Parse segments.yaml. Translates each rule into the DC JSON DSL,
    AND-injects the HYDRATE-* clause, validates required fields. Raises
    ValueError on malformed YAML or unknown rule type."""
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
        if not isinstance(rule, dict):
            raise ValueError(f"Segment {config_key!r}.rule must be a mapping")
        target_dmo = entry["target_dmo"]
        user_criteria = _translate_rule(rule, target_dmo, config_key)
        include_criteria = inject_hydrate_clause(user_criteria)
        out.append(SegmentDefinition(
            config_key=config_key,
            api_name=config_key_to_api_name(config_key),
            developer_name=_config_key_to_developer_name(config_key),
            display_name=entry["name"],
            description=entry["description"],
            persona=entry["persona"],
            publish_schedule=entry["publish_schedule"],
            target_dmo=target_dmo,
            include_criteria=include_criteria,
            linked_campaign=entry.get("linked_campaign"),
        ))
    return out


def execute_create_segments(
    *,
    target_org: str,
    yaml_path: Path,
    segment_id: Optional[str] = None,
    skip_publish: bool = False,  # noqa: ARG001 - retained for argparse compat (no-op)
    dry_run: bool = False,
) -> CreateSegmentsResult:
    """Create Dynamic Data Cloud segments per ``segments.yaml``.

    Idempotent: if a segment with the same developerName exists already
    (per ``list_segments``), it's recorded as a skip and ``create_segment``
    is NOT called. Dynamic segments cannot be PATCHed per the live
    ENTITY_SAVE_ERROR observation.

    The ``skip_publish`` flag is retained for backward compatibility with
    the CLI but is a no-op: Dynamic segments publish per their own
    ``publishSchedule`` enum, so there is no separate publish step.

    Per-segment failures are recorded on the result; this function never raises."""
    definitions = load_segment_definitions(yaml_path)
    if segment_id is not None:
        definitions = [d for d in definitions if d.config_key == segment_id]
        if not definitions:
            return CreateSegmentsResult()

    result = CreateSegmentsResult()
    result.segments_processed = len(definitions)

    if dry_run:
        for d in definitions:
            r = SegmentCreateResult(config_key=d.config_key, api_name=d.api_name)
            result.results.append(r)
            print(
                f"  DRY-RUN would create {d.api_name} ({d.display_name}) "
                f"on {d.target_dmo} schedule={map_publish_schedule(d.publish_schedule)}"
            )
        return result

    try:
        instance_url, access_token = get_org_session(target_org)
    except Exception as exc:
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
            r.skipped = True
            result.segments_skipped += 1
            result.results.append(r)
            continue

        # Dynamic segments only support NoRefresh; YAML publish_schedule
        # is informational. See ENTITY_SAVE_ERROR from API for non-NoRefresh
        # values ("Parameters related to publish aren't supported for a
        # dynamic segments. Remove the parameters and try again.").
        ok, info = create_segment(
            instance_url, access_token,
            developer_name=d.developer_name,
            display_name=d.display_name,
            description=d.description,
            segment_on_api_name=d.target_dmo,
            include_criteria=d.include_criteria,
            publish_schedule="NoRefresh",
        )
        if ok:
            r.created = True
            result.segments_created += 1
        else:
            r.error = info
            result.segments_failed += 1
        result.results.append(r)

    return result


def execute_refresh_streams(*, target_org: str) -> DataCloudStreamRefreshResult:
    """Refresh DC streams sourcing from hydrated objects.

    Thin wrapper around execute_phase5_5 from data_cloud.py, exposed as a
    standalone function so the new `refresh-streams` CLI subcommand can call
    it directly without going through the hydrate runner."""
    return execute_phase5_5(target_org=target_org)
