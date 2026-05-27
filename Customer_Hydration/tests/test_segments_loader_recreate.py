# tests/test_segments_loader_recreate.py
from pathlib import Path
from unittest.mock import patch, MagicMock
from customer_hydration.phase5.segments import execute_recreate_segments


def _yaml(tmp_path: Path, body: str) -> Path:
    p = tmp_path / "segments.yaml"
    p.write_text(body)
    return p


def test_recreate_deletes_then_creates_each_match(tmp_path: Path):
    yaml_path = _yaml(tmp_path, """\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: ssot__Account__dlm
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
""")
    with patch("customer_hydration.phase5.segments.get_org_session",
               return_value=("https://x", "tok")), \
         patch("customer_hydration.phase5.segments.list_segments",
               return_value=[MagicMock(api_name="RetailAll__seg")]), \
         patch("customer_hydration.phase5.segments.delete_segment",
               return_value=(True, "deleted RetailAll__seg")) as p_del, \
         patch("customer_hydration.phase5.segments.create_segment",
               return_value=(True, "RetailAll__seg")) as p_create:
        result = execute_recreate_segments(
            target_org="jdo-uqj0jr", yaml_path=yaml_path, pattern="*",
        )

    assert result.segments_processed == 1
    assert result.segments_recreated == 1
    assert result.segments_failed == 0
    assert p_del.call_count == 1
    assert p_create.call_count == 1


def test_recreate_treats_404_as_idempotent(tmp_path: Path):
    yaml_path = _yaml(tmp_path, """\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: ssot__Account__dlm
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
""")
    with patch("customer_hydration.phase5.segments.get_org_session",
               return_value=("https://x", "tok")), \
         patch("customer_hydration.phase5.segments.list_segments",
               return_value=[]), \
         patch("customer_hydration.phase5.segments.delete_segment",
               return_value=(True, "HTTP 404 (already gone)")) as p_del, \
         patch("customer_hydration.phase5.segments.create_segment",
               return_value=(True, "RetailAll__seg")) as p_create:
        result = execute_recreate_segments(
            target_org="jdo-uqj0jr", yaml_path=yaml_path, pattern="*",
        )

    assert result.segments_recreated == 1
    # When list_segments returns [], delete is skipped (segment not present);
    # create still runs.
    assert p_create.call_count == 1


def test_recreate_aborts_create_when_delete_fails_4xx(tmp_path: Path):
    yaml_path = _yaml(tmp_path, """\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: ssot__Account__dlm
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
""")
    with patch("customer_hydration.phase5.segments.get_org_session",
               return_value=("https://x", "tok")), \
         patch("customer_hydration.phase5.segments.list_segments",
               return_value=[MagicMock(api_name="RetailAll__seg")]), \
         patch("customer_hydration.phase5.segments.delete_segment",
               return_value=(False, "HTTP 403 Forbidden")), \
         patch("customer_hydration.phase5.segments.create_segment") as p_create:
        result = execute_recreate_segments(
            target_org="jdo-uqj0jr", yaml_path=yaml_path, pattern="*",
        )

    assert result.segments_failed == 1
    assert result.segments_recreated == 0
    assert p_create.call_count == 0
    assert "403" in (result.results[0].error or "")


def test_recreate_filters_by_pattern(tmp_path: Path):
    yaml_path = _yaml(tmp_path, """\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: ssot__Account__dlm
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
  cmp_one:
    name: "Cmp"
    description: "x"
    persona: retail
    publish_schedule: daily
    target_dmo: ssot__Account__dlm
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
""")
    with patch("customer_hydration.phase5.segments.get_org_session",
               return_value=("https://x", "tok")), \
         patch("customer_hydration.phase5.segments.list_segments",
               return_value=[]), \
         patch("customer_hydration.phase5.segments.delete_segment",
               return_value=(True, "HTTP 404")), \
         patch("customer_hydration.phase5.segments.create_segment",
               return_value=(True, "ok")) as p_create:
        result = execute_recreate_segments(
            target_org="jdo-uqj0jr", yaml_path=yaml_path, pattern="cmp_*",
        )

    assert result.segments_processed == 1
    assert p_create.call_count == 1
    # Only the cmp_one segment should have been touched.
    assert result.results[0].config_key == "cmp_one"
