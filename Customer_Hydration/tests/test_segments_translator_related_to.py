# tests/test_segments_translator_related_to.py
from pathlib import Path
import pytest
from customer_hydration.phase5.segments import load_segment_definitions


def _write(tmp_path: Path, body: str) -> Path:
    p = tmp_path / "segments.yaml"
    p.write_text(body)
    return p


def test_related_to_translates_to_nested_attribute(tmp_path: Path):
    yaml_path = _write(tmp_path, """\
segments:
  retail_with_mortgage:
    name: "Retail with Mortgage"
    description: "x"
    persona: retail
    publish_schedule: daily
    target_dmo: ssot__Account__dlm
    rule:
      type: related_to
      dmo: ssot__FinServ_FinancialAccount__dlm
      via: AccountId__c
      where:
        type: text_equals
        field: FinServ_AccountType_c__c
        value: "Mortgage"
""")
    defs = load_segment_definitions(yaml_path)
    user = defs[0].include_criteria["filters"][1]

    assert user["type"] == "NestedAttribute"
    assert user["primaryObjectApiName"] == "ssot__Account__dlm"
    assert user["primaryFieldApiName"] == "Id"
    assert user["relatedObjectApiName"] == "ssot__FinServ_FinancialAccount__dlm"
    assert user["relatedFieldApiName"] == "AccountId__c"
    inner = user["filter"]
    assert inner["type"] == "TextComparison"
    assert inner["operator"] == "matches"
    assert inner["values"] == ["Mortgage"]
    assert inner["subject"] == {
        "objectApiName": "ssot__FinServ_FinancialAccount__dlm",
        "fieldApiName": "FinServ_AccountType_c__c",
    }


def test_related_to_with_compound_where_translates(tmp_path: Path):
    yaml_path = _write(tmp_path, """\
segments:
  retail_heloc_drawn:
    name: "HELOC drawn"
    description: "x"
    persona: retail
    publish_schedule: daily
    target_dmo: ssot__Account__dlm
    rule:
      type: all_of
      rules:
        - type: text_equals
          field: FinServ_ClientCategory_c__c
          value: "Retail"
        - type: related_to
          dmo: ssot__FinServ_FinancialAccount__dlm
          via: AccountId__c
          where:
            type: all_of
            rules:
              - type: text_equals
                field: FinServ_AccountType_c__c
                value: "HELOC"
              - type: number_gte
                field: Drawn_Ratio_c__c
                value: 0.5
""")
    defs = load_segment_definitions(yaml_path)
    user = defs[0].include_criteria["filters"][1]
    assert user["type"] == "LogicalComparison"
    assert user["operator"] == "and"
    persona_filter = user["filters"][0]
    related_filter = user["filters"][1]
    assert persona_filter["type"] == "TextComparison"
    assert related_filter["type"] == "NestedAttribute"
    inner = related_filter["filter"]
    assert inner["type"] == "LogicalComparison"
    assert inner["filters"][0]["subject"]["objectApiName"] == \
        "ssot__FinServ_FinancialAccount__dlm"
    assert inner["filters"][1]["operator"] == "greater than or equal"


def test_nested_related_to_inside_related_to_is_rejected(tmp_path: Path):
    yaml_path = _write(tmp_path, """\
segments:
  bad_nested:
    name: "x"
    description: "x"
    persona: retail
    publish_schedule: manual
    target_dmo: ssot__Account__dlm
    rule:
      type: related_to
      dmo: ssot__FinServ_FinancialAccount__dlm
      where:
        type: related_to
        dmo: ssot__OtherDMO__dlm
        where:
          type: text_equals
          field: x
          value: y
""")
    with pytest.raises(ValueError, match="nested related_to"):
        load_segment_definitions(yaml_path)


def test_related_to_default_via_is_AccountId(tmp_path: Path):
    yaml_path = _write(tmp_path, """\
segments:
  default_via:
    name: "x"
    description: "x"
    persona: wealth
    publish_schedule: daily
    target_dmo: ssot__Account__dlm
    rule:
      type: related_to
      dmo: ssot__PersonLifeEvent__dlm
      where:
        type: text_has_value
        field: EventDate__c
""")
    defs = load_segment_definitions(yaml_path)
    user = defs[0].include_criteria["filters"][1]
    assert user["relatedFieldApiName"] == "AccountId__c"
    # via_root defaults to "Id" — Account-side join field unchanged.
    assert user["primaryFieldApiName"] == "Id"


def test_related_to_via_root_overrides_primary_field(tmp_path: Path):
    """Phase 3d v1.1: SSOT-canonical DMOs join via IndividualId, not Id.

    The translator must let YAML override the Account-side join field
    so a NestedAttribute can express
        Account.ssot__IndividualId__c = PersonLifeEvent.ssot__IndividualId__c
    where both sides reference the Individual primary key.
    """
    yaml_path = _write(tmp_path, """\
segments:
  via_root_test:
    name: "x"
    description: "x"
    persona: wealth
    publish_schedule: daily
    target_dmo: ssot__Account__dlm
    rule:
      type: related_to
      dmo: ssot__PersonLifeEvent__dlm
      via: ssot__IndividualId__c
      via_root: ssot__IndividualId__c
      where:
        type: text_has_value
        field: ssot__PersonLifeEventDateTime__c
""")
    defs = load_segment_definitions(yaml_path)
    user = defs[0].include_criteria["filters"][1]
    assert user["primaryFieldApiName"] == "ssot__IndividualId__c"
    assert user["relatedFieldApiName"] == "ssot__IndividualId__c"
    assert user["relatedObjectApiName"] == "ssot__PersonLifeEvent__dlm"
