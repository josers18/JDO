# tests/test_segments_probe.py
from pathlib import Path
import json
from customer_hydration.phase5.segments_probe import (
    ProbeResult, write_probe_artifact, read_probe_artifact,
    RELATIVE_DATES_OK, RELATIVE_DATES_BROKEN, RELATIVE_DATES_UNKNOWN,
)


def test_write_and_read_probe_artifact_roundtrip(tmp_path: Path):
    out = tmp_path / "probe.json"
    result = ProbeResult(
        verdict=RELATIVE_DATES_OK,
        target_dmo="ssot__PersonLifeEvent__dlm",
        field="EventDate__c",
        days=90,
        count_recent=12_345,
        count_old=67_890,
        count_recent_frozen=12_300,
        ts="2026-05-27T18:00:00Z",
    )
    write_probe_artifact(out, result)

    loaded = read_probe_artifact(out)
    assert loaded.verdict == RELATIVE_DATES_OK
    assert loaded.count_recent == 12_345
    assert loaded.count_recent_frozen == 12_300


def test_read_probe_artifact_missing_file_returns_unknown(tmp_path: Path):
    result = read_probe_artifact(tmp_path / "nope.json")
    assert result.verdict == RELATIVE_DATES_UNKNOWN


def test_probe_returns_ok_when_recent_matches_frozen_and_less_than_old():
    create_calls = []

    def fake_create(instance_url, access_token, **kwargs):
        create_calls.append(kwargs["developer_name"])
        return True, kwargs["developer_name"] + "__seg"

    counts_by_tag = {"AFTER": 12_345, "BEFORE": 67_890, "FROZEN": 12_300}

    def fake_status(instance_url, access_token, *, api_name):
        for tag, c in counts_by_tag.items():
            if tag in api_name:
                return c
        return None

    def fake_delete(instance_url, access_token, *, api_name):
        return True, "deleted"

    from customer_hydration.phase5.segments_probe import (
        probe_relative_date_filter, RELATIVE_DATES_OK,
    )
    res = probe_relative_date_filter(
        "https://x", "tok",
        create_segment_fn=fake_create,
        delete_segment_fn=fake_delete,
        get_status_fn=fake_status,
    )
    assert res.verdict == RELATIVE_DATES_OK
    assert res.count_recent == 12_345
    assert len(create_calls) == 3


def test_probe_returns_broken_when_recent_equals_old():
    counts_by_tag = {"AFTER": 410, "BEFORE": 410, "FROZEN": 410}
    def fake_create(iu, t, **kwargs): return True, kwargs["developer_name"] + "__seg"
    def fake_status(iu, t, *, api_name):
        for tag, c in counts_by_tag.items():
            if tag in api_name:
                return c
        return None
    def fake_delete(iu, t, *, api_name): return True, "deleted"

    from customer_hydration.phase5.segments_probe import (
        probe_relative_date_filter, RELATIVE_DATES_BROKEN,
    )
    res = probe_relative_date_filter(
        "https://x", "tok",
        create_segment_fn=fake_create,
        delete_segment_fn=fake_delete,
        get_status_fn=fake_status,
    )
    assert res.verdict == RELATIVE_DATES_BROKEN


def test_probe_returns_unknown_when_create_fails():
    def fake_create(iu, t, **kwargs): return False, "boom"
    def fake_status(iu, t, *, api_name): return None
    def fake_delete(iu, t, *, api_name): return True, "deleted"

    from customer_hydration.phase5.segments_probe import (
        probe_relative_date_filter, RELATIVE_DATES_UNKNOWN,
    )
    res = probe_relative_date_filter(
        "https://x", "tok",
        create_segment_fn=fake_create,
        delete_segment_fn=fake_delete,
        get_status_fn=fake_status,
    )
    assert res.verdict == RELATIVE_DATES_UNKNOWN
    assert res.error and "boom" in res.error
