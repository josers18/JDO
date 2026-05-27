# tests/test_segments_translator_relative_date.py
from pathlib import Path
import pytest
from customer_hydration.phase5.segments import load_segment_definitions
from customer_hydration.phase5.segments_probe import (
    ProbeResult, write_probe_artifact,
    RELATIVE_DATES_OK, RELATIVE_DATES_BROKEN,
)


def _write_yaml(tmp_path: Path) -> Path:
    p = tmp_path / "segments.yaml"
    p.write_text("""\
segments:
  recent:
    name: "Recent"
    description: "x"
    persona: wealth
    publish_schedule: daily
    target_dmo: ssot__PersonLifeEvent__dlm
    rule:
      type: relative_date_after_days
      field: EventDate__c
      days: 90
""")
    return p


def test_relative_date_emits_relative_when_probe_ok(tmp_path: Path, monkeypatch):
    probe_path = tmp_path / "probe.json"
    write_probe_artifact(probe_path, ProbeResult(
        verdict=RELATIVE_DATES_OK,
        target_dmo="ssot__PersonLifeEvent__dlm",
        field="EventDate__c", days=90,
    ))
    monkeypatch.setenv("PHASE3D_PROBE_ARTIFACT", str(probe_path))

    yaml_path = _write_yaml(tmp_path)
    defs = load_segment_definitions(yaml_path)
    user = defs[0].include_criteria["filters"][1]
    assert user["type"] == "ExactlyRelativeDateComparison"
    assert user["operator"] == "after"
    assert user["dateUnits"] == "days"
    assert user["value"] == -90


def test_relative_date_emits_frozen_anchor_when_probe_broken(tmp_path: Path, monkeypatch):
    probe_path = tmp_path / "probe.json"
    write_probe_artifact(probe_path, ProbeResult(
        verdict=RELATIVE_DATES_BROKEN,
        target_dmo="ssot__PersonLifeEvent__dlm",
        field="EventDate__c", days=90,
    ))
    monkeypatch.setenv("PHASE3D_PROBE_ARTIFACT", str(probe_path))

    yaml_path = _write_yaml(tmp_path)
    defs = load_segment_definitions(yaml_path)
    user = defs[0].include_criteria["filters"][1]
    assert user["type"] == "DateComparison"
    assert user["operator"] == "after"
    # Frozen anchor: ISO date 90 days ago. We don't pin the exact date —
    # just verify the form is YYYY-MM-DD and that there's exactly one value.
    import re
    assert isinstance(user["value"], list) and len(user["value"]) == 1
    assert re.match(r"^\d{4}-\d{2}-\d{2}$", user["value"][0])


def test_relative_date_emits_frozen_when_no_probe_artifact(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("PHASE3D_PROBE_ARTIFACT", raising=False)
    yaml_path = _write_yaml(tmp_path)
    defs = load_segment_definitions(yaml_path)
    user = defs[0].include_criteria["filters"][1]
    # Default (no artifact => UNKNOWN) falls through to frozen anchor.
    assert user["type"] == "DateComparison"
