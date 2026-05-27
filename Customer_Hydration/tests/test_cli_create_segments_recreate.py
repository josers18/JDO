# tests/test_cli_create_segments_recreate.py
import sys
from unittest.mock import patch
from customer_hydration.cli import main


def test_cli_create_segments_recreate_pattern_routes_to_recreate(monkeypatch):
    argv = ["hydrate.py", "create-segments", "--target-org", "jdo-uqj0jr",
            "--recreate", "cmp_*"]
    monkeypatch.setattr(sys, "argv", argv)

    with patch("customer_hydration.cli.execute_recreate_segments") as p_recreate, \
         patch("customer_hydration.cli.execute_create_segments") as p_create:
        from customer_hydration.phase5.segments import RecreateSegmentsResult
        p_recreate.return_value = RecreateSegmentsResult()
        rc = main()

    assert p_recreate.call_count == 1
    kwargs = p_recreate.call_args.kwargs
    assert kwargs["pattern"] == "cmp_*"
    assert kwargs["target_org"] == "jdo-uqj0jr"
    assert p_create.call_count == 0
    assert rc == 0


def test_cli_probe_relative_dates_runs_probe_and_writes_artifact(tmp_path, monkeypatch):
    argv = ["hydrate.py", "create-segments", "--target-org", "jdo-uqj0jr",
            "--probe-relative-dates",
            "--probe-artifact", str(tmp_path / "probe.json")]
    monkeypatch.setattr(sys, "argv", argv)

    from customer_hydration.phase5.segments_probe import (
        ProbeResult, RELATIVE_DATES_OK,
    )
    with patch("customer_hydration.cli.get_org_session",
               return_value=("https://x", "tok")), \
         patch("customer_hydration.cli.probe_relative_date_filter",
               return_value=ProbeResult(
                   verdict=RELATIVE_DATES_OK,
                   target_dmo="ssot__PersonLifeEvent__dlm",
                   field="EventDate__c", days=90,
               )):
        rc = main()

    assert rc == 0
    artifact = tmp_path / "probe.json"
    assert artifact.exists()
    import json
    data = json.loads(artifact.read_text())
    assert data["verdict"] == "RELATIVE_DATES_OK"
