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

    # Phase 3d v1.2: NumberAggregation envelope (count of related rows ≥ 1).
    assert user["type"] == "NumberAggregation"
    assert user["aggregateFunction"] == "count"
    assert user["containerObjectApiName"] == "ssot__FinServ_FinancialAccount__dlm"
    hop = user["path"][0]
    # v1.2: Account DMO's primary key is ssot__Id__c (not "Id").
    assert hop[0] == {"objectApiName": "ssot__Account__dlm", "fieldApiName": "ssot__Id__c"}
    assert hop[1] == {
        "objectApiName": "ssot__FinServ_FinancialAccount__dlm",
        "fieldApiName": "AccountId__c",
    }
    assert user["joinPath"] == user["path"]
    inner = user["filter"]
    assert inner["type"] == "TextComparison"
    assert inner["operator"] == "matches"
    assert inner["values"] == ["Mortgage"]
    # Inner filter on the related DMO carries the v62 metadata annotations.
    assert inner["subjectFieldDataType"] == "TEXT"
    assert inner["subjectFieldBusinessType"] == "TEXT"
    assert inner["subjectFieldSourceType"] == "RELATED"
    assert inner["selfReference"] is False
    # The "exists" comparison is pinned: count >= 1.
    assert user["comparison"]["type"] == "NumberComparison"
    assert user["comparison"]["operator"] == "greater than or equal"
    assert user["comparison"]["value"] == 1


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
    # v1.2: NumberAggregation envelope, not NestedAttribute.
    assert related_filter["type"] == "NumberAggregation"
    inner = related_filter["filter"]
    # Compound where: → translated LogicalComparison whose nested filters
    # all carry the v62 annotations via _annotate_inner_filter recursion.
    assert inner["type"] == "LogicalComparison"
    assert inner["filters"][0]["subject"]["objectApiName"] == \
        "ssot__FinServ_FinancialAccount__dlm"
    assert inner["filters"][0]["subjectFieldSourceType"] == "RELATED"
    assert inner["filters"][1]["operator"] == "greater than or equal"
    assert inner["filters"][1]["subjectFieldDataType"] == "NUMBER"


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
    # v1.2: join hops live in path[0]; default via_root is ssot__Id__c
    # (the SSOT Account DMO's primary key — "Id" doesn't exist on it).
    hop = user["path"][0]
    assert hop[0]["fieldApiName"] == "ssot__Id__c"
    assert hop[1]["fieldApiName"] == "AccountId__c"


def test_related_to_via_root_overrides_primary_field(tmp_path: Path):
    """Phase 3d v1.1: SSOT-canonical DMOs join via IndividualId, not Id.

    The translator must let YAML override the Account-side join field so the
    cross-DMO clause expresses
        Account.ssot__IndividualId__c = PersonLifeEvent.ssot__IndividualId__c
    where both sides reference the Individual primary key. v1.2: that override
    lands in path[0][0].fieldApiName, not in flat primaryFieldApiName.
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
    hop = user["path"][0]
    assert hop[0] == {
        "objectApiName": "ssot__Account__dlm",
        "fieldApiName": "ssot__IndividualId__c",
    }
    assert hop[1] == {
        "objectApiName": "ssot__PersonLifeEvent__dlm",
        "fieldApiName": "ssot__IndividualId__c",
    }
    assert user["containerObjectApiName"] == "ssot__PersonLifeEvent__dlm"
