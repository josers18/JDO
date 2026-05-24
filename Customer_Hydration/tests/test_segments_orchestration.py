"""Unit tests for phase5/segments.py — YAML loader + execute_create_segments.

Post-Task-10a rewrite: the segment payload schema now uses a JSON DSL
(TextComparison / NumberComparison / DateComparison /
LogicalComparison) instead of stringified SQL filters. inject_hydrate_clause
now takes/returns a dict (not a SQL string), and load_segment_definitions
translates each YAML rule.type into the DC JSON DSL.
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from customer_hydration.phase5.segments import (
    SegmentDefinition,
    SegmentCreateResult,
    CreateSegmentsResult,
    load_segment_definitions,
    config_key_to_api_name,
    inject_hydrate_clause,
    map_publish_schedule,
    execute_create_segments,
    execute_refresh_streams,
    HYDRATE_CLAUSE,
)


# ---- config_key_to_api_name ----

class TestConfigKeyToApiName:
    def test_simple_snake_case(self):
        assert config_key_to_api_name("retail_all") == "RetailAll__seg"

    def test_three_word_key(self):
        assert config_key_to_api_name("wealth_pre_retiree") == "WealthPreRetiree__seg"

    def test_campaign_aligned_key(self):
        assert config_key_to_api_name("cmp_heloc_refi_outreach") == "CmpHelocRefiOutreach__seg"

    def test_single_word(self):
        assert config_key_to_api_name("commercial") == "Commercial__seg"


# ---- map_publish_schedule ----

class TestMapPublishSchedule:
    def test_manual_maps_to_no_refresh(self):
        assert map_publish_schedule("manual") == "NoRefresh"

    def test_hourly_maps_to_one(self):
        assert map_publish_schedule("hourly") == "One"

    def test_daily_maps_to_twenty_four(self):
        assert map_publish_schedule("daily") == "TwentyFour"

    def test_weekly_falls_back_to_twenty_four(self):
        # No native weekly enum; closest available DC slot is TwentyFour
        assert map_publish_schedule("weekly") == "TwentyFour"

    def test_unknown_value_passes_through(self):
        # If YAML already uses the API enum directly, pass it through.
        assert map_publish_schedule("NoRefresh") == "NoRefresh"
        assert map_publish_schedule("Six") == "Six"


# ---- inject_hydrate_clause ----

class TestInjectHydrateClause:
    def test_wraps_user_criteria_in_logical_and_with_hydrate_filter(self):
        user = {
            "type": "TextComparison",
            "subject": {"objectApiName": "Account_demo__dlm",
                        "fieldApiName": "FinServ_ClientCategory_c__c"},
            "operator": "matches",
            "values": ["Retail"],
        }
        out = inject_hydrate_clause(user)
        assert out["type"] == "LogicalComparison"
        assert out["operator"] == "and"
        # Two filters: HYDRATE first, user second — flat (NOT wrapped
        # in {"filter": ...}). Live API rejects the wrapped form with
        # "missing discriminator field: <type>".
        assert len(out["filters"]) == 2
        assert out["filters"][0] == HYDRATE_CLAUSE
        assert out["filters"][1] == user

    def test_hydrate_clause_targets_external_id_c_field(self):
        assert HYDRATE_CLAUSE["type"] == "TextComparison"
        assert HYDRATE_CLAUSE["subject"]["fieldApiName"] == "External_ID_c__c"
        assert HYDRATE_CLAUSE["operator"] == "contains"
        assert HYDRATE_CLAUSE["values"] == ["HYDRATE-"]

    def test_hydrate_clause_targets_segment_dmo_when_passed_explicitly(self):
        """When inject_hydrate_clause is given a target_dmo, the HYDRATE
        clause's subject.objectApiName matches that DMO. Phase 2.4
        retargeted segments from Account_demo__dlm to ssot__Account__dlm,
        so the HYDRATE filter must be parameterized rather than hardcoded."""
        user = {
            "type": "TextComparison",
            "subject": {"objectApiName": "ssot__Account__dlm",
                        "fieldApiName": "FinServ_ClientCategory_c__c"},
            "operator": "matches",
            "values": ["Retail"],
        }
        out = inject_hydrate_clause(user, "ssot__Account__dlm")
        hydrate = out["filters"][0]
        assert hydrate["subject"]["objectApiName"] == "ssot__Account__dlm"
        assert hydrate["subject"]["fieldApiName"] == "External_ID_c__c"
        assert hydrate["values"] == ["HYDRATE-"]

    def test_wrapping_a_logical_comparison_keeps_structure(self):
        # A user-supplied LogicalComparison.and is wrapped, NOT merged
        # (avoids mutating caller-provided structures and keeps the
        # injection idempotency rule simple).
        user_compound = {
            "type": "LogicalComparison",
            "operator": "and",
            "filters": [
                {"type": "TextComparison",
                 "subject": {"objectApiName": "Account_demo__dlm",
                             "fieldApiName": "FinServ_ClientCategory_c__c"},
                 "operator": "matches", "values": ["Wealth"]},
                {"type": "DateComparison",
                 "subject": {"objectApiName": "Account_demo__dlm",
                             "fieldApiName": "PersonBirthdate__c"},
                 "operator": "before", "value": ["1971-01-01"]},
            ],
        }
        out = inject_hydrate_clause(user_compound)
        assert out["type"] == "LogicalComparison"
        assert out["filters"][0] == HYDRATE_CLAUSE
        assert out["filters"][1] == user_compound


# ---- load_segment_definitions: DSL translation ----

class TestLoadSegmentDefinitionsDsl:
    def _write(self, tmp_path: Path, body: str) -> Path:
        p = tmp_path / "segments.yaml"
        p.write_text(body)
        return p

    def test_text_equals_translates_to_text_comparison(self, tmp_path: Path):
        yaml_path = self._write(tmp_path, """\
segments:
  retail_all:
    name: "Retail Customers"
    description: "All retail"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account_demo__dlm
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
""")
        defs = load_segment_definitions(yaml_path)
        assert len(defs) == 1
        d = defs[0]
        # Hydrate-injected wrapper
        assert d.include_criteria["type"] == "LogicalComparison"
        user = d.include_criteria["filters"][1]
        assert user["type"] == "TextComparison"
        # Live DC API expects "matches" (NOT "equals") for text equality.
        assert user["operator"] == "matches"
        assert user["values"] == ["Retail"]
        assert user["subject"] == {
            "objectApiName": "Account_demo__dlm",
            "fieldApiName": "FinServ_ClientCategory_c__c",
        }

    def test_text_contains_translates(self, tmp_path: Path):
        yaml_path = self._write(tmp_path, """\
segments:
  probe:
    name: "Probe"
    description: "x"
    persona: retail
    publish_schedule: manual
    target_dmo: Account_demo__dlm
    rule:
      type: text_contains
      field: External_ID_c__c
      value: "HYDRATE-"
""")
        defs = load_segment_definitions(yaml_path)
        user = defs[0].include_criteria["filters"][1]
        assert user["operator"] == "contains"
        assert user["values"] == ["HYDRATE-"]

    def test_text_in_translates_with_values_list(self, tmp_path: Path):
        yaml_path = self._write(tmp_path, """\
segments:
  multi:
    name: "Multi"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account_demo__dlm
    rule:
      type: text_in
      field: FinServ_ClientCategory_c__c
      values: ["Retail", "Wealth"]
""")
        defs = load_segment_definitions(yaml_path)
        user = defs[0].include_criteria["filters"][1]
        assert user["operator"] == "in"
        assert user["values"] == ["Retail", "Wealth"]

    def test_text_has_value_omits_values_key(self, tmp_path: Path):
        yaml_path = self._write(tmp_path, """\
segments:
  any_hydrate:
    name: "Any"
    description: "x"
    persona: mixed
    publish_schedule: weekly
    target_dmo: Account_demo__dlm
    rule:
      type: text_has_value
      field: External_ID_c__c
""")
        defs = load_segment_definitions(yaml_path)
        user = defs[0].include_criteria["filters"][1]
        assert user["operator"] == "has value"
        assert "values" not in user

    def test_number_gt_translates(self, tmp_path: Path):
        yaml_path = self._write(tmp_path, """\
segments:
  high_credit:
    name: "High Credit"
    description: "x"
    persona: retail
    publish_schedule: daily
    target_dmo: Account_demo__dlm
    rule:
      type: number_gt
      field: FinServ_CreditScore_c__c
      value: 700
""")
        defs = load_segment_definitions(yaml_path)
        user = defs[0].include_criteria["filters"][1]
        assert user["type"] == "NumberComparison"
        assert user["operator"] == "greater than"
        assert user["values"] == [700]

    def test_number_in_range_translates_to_logical_and(self, tmp_path: Path):
        yaml_path = self._write(tmp_path, """\
segments:
  income_band:
    name: "Income Band"
    description: "x"
    persona: wealth
    publish_schedule: daily
    target_dmo: Account_demo__dlm
    rule:
      type: number_in_range
      field: FinServ_AnnualIncome_pc__c
      gte: 100000
      lte: 250000
""")
        defs = load_segment_definitions(yaml_path)
        user = defs[0].include_criteria["filters"][1]
        assert user["type"] == "LogicalComparison"
        assert user["operator"] == "and"
        operators = {f["operator"] for f in user["filters"]}
        assert operators == {"greater than or equal", "less than or equal"}

    def test_date_before_translates(self, tmp_path: Path):
        yaml_path = self._write(tmp_path, """\
segments:
  born_before:
    name: "Born Before"
    description: "x"
    persona: wealth
    publish_schedule: daily
    target_dmo: Account_demo__dlm
    rule:
      type: date_before
      field: PersonBirthdate__c
      value: "1971-01-01"
""")
        defs = load_segment_definitions(yaml_path)
        user = defs[0].include_criteria["filters"][1]
        assert user["type"] == "DateComparison"
        assert user["operator"] == "before"
        assert user["value"] == ["1971-01-01"]

    def test_date_in_range_translates_to_logical_and(self, tmp_path: Path):
        yaml_path = self._write(tmp_path, """\
segments:
  pre_retiree:
    name: "Pre-Retiree"
    description: "x"
    persona: wealth
    publish_schedule: daily
    target_dmo: Account_demo__dlm
    rule:
      type: date_in_range
      field: PersonBirthdate__c
      after: "1961-01-01"
      before: "1971-01-01"
""")
        defs = load_segment_definitions(yaml_path)
        user = defs[0].include_criteria["filters"][1]
        assert user["type"] == "LogicalComparison"
        assert user["operator"] == "and"
        ops = {f["operator"] for f in user["filters"]}
        assert ops == {"after", "before"}

    def test_age_gte_translates_to_relative_date_before_negative(self, tmp_path: Path):
        """age_gte: N -> field BEFORE (now - N years).

        ExactlyRelativeDateComparison with operator=before and value=-N.
        Live API requires lowercase dateUnits ("years")."""
        yaml_path = self._write(tmp_path, """\
segments:
  senior_wealth:
    name: "Senior Wealth"
    description: "x"
    persona: wealth
    publish_schedule: daily
    target_dmo: Account_demo__dlm
    rule:
      type: age_gte
      field: PersonBirthdate__c
      value: 60
""")
        defs = load_segment_definitions(yaml_path)
        user = defs[0].include_criteria["filters"][1]
        assert user["type"] == "ExactlyRelativeDateComparison"
        assert user["operator"] == "before"
        assert user["dateUnits"] == "years"
        assert user["value"] == -60
        assert user["subject"] == {
            "objectApiName": "Account_demo__dlm",
            "fieldApiName": "PersonBirthdate__c",
        }

    def test_age_lte_translates_to_relative_date_after_negative(self, tmp_path: Path):
        """age_lte: N -> field AFTER (now - N years)."""
        yaml_path = self._write(tmp_path, """\
segments:
  young_wealth:
    name: "Young Wealth"
    description: "x"
    persona: wealth
    publish_schedule: daily
    target_dmo: Account_demo__dlm
    rule:
      type: age_lte
      field: PersonBirthdate__c
      value: 40
""")
        defs = load_segment_definitions(yaml_path)
        user = defs[0].include_criteria["filters"][1]
        assert user["type"] == "ExactlyRelativeDateComparison"
        assert user["operator"] == "after"
        assert user["dateUnits"] == "years"
        assert user["value"] == -40

    def test_age_in_range_translates_to_logical_and_of_relative_dates(self, tmp_path: Path):
        """age_in_range: [55, 65] -> AND(BEFORE -55y, AFTER -65y).

        This produces a self-correcting age window because DC re-evaluates
        ExactlyRelativeDateComparison at each publish, replacing frozen
        date anchors that drift as the calendar advances."""
        yaml_path = self._write(tmp_path, """\
segments:
  pre_retiree:
    name: "Pre-Retiree"
    description: "x"
    persona: wealth
    publish_schedule: daily
    target_dmo: Account_demo__dlm
    rule:
      type: age_in_range
      field: PersonBirthdate__c
      min_age: 55
      max_age: 65
""")
        defs = load_segment_definitions(yaml_path)
        user = defs[0].include_criteria["filters"][1]
        assert user["type"] == "LogicalComparison"
        assert user["operator"] == "and"
        # Two ExactlyRelativeDateComparison filters
        rel_filters = user["filters"]
        assert len(rel_filters) == 2
        for f in rel_filters:
            assert f["type"] == "ExactlyRelativeDateComparison"
            assert f["dateUnits"] == "years"
        ops_to_values = {f["operator"]: f["value"] for f in rel_filters}
        # min_age -> "before -55y" (older than 55, so DOB is more than 55y in the past)
        # max_age -> "after -65y"  (younger than 65, so DOB is less than 65y in the past)
        assert ops_to_values == {"before": -55, "after": -65}

    def test_all_of_combines_two_atomic_rules_via_logical_and(self, tmp_path: Path):
        """all_of with [text_equals, age_in_range] -> outer LogicalComparison.and
        wrapping the two translated sub-rules. Combined with the auto-injected
        HYDRATE clause, this gives a 3-clause AND chain at the top level."""
        yaml_path = self._write(tmp_path, """\
segments:
  wealth_55_65:
    name: "Wealth Pre-Retirees"
    description: "x"
    persona: wealth
    publish_schedule: daily
    target_dmo: Account_demo__dlm
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
""")
        defs = load_segment_definitions(yaml_path)
        outer = defs[0].include_criteria
        assert outer["type"] == "LogicalComparison"
        assert outer["operator"] == "and"
        user = outer["filters"][1]
        assert user["type"] == "LogicalComparison"
        assert user["operator"] == "and"
        assert len(user["filters"]) == 2
        text_clause = user["filters"][0]
        age_clause = user["filters"][1]
        assert text_clause["type"] == "TextComparison"
        assert text_clause["operator"] == "matches"
        assert text_clause["values"] == ["Wealth Management"]
        assert age_clause["type"] == "LogicalComparison"
        assert age_clause["operator"] == "and"
        ops = {f["operator"]: f["value"] for f in age_clause["filters"]}
        assert ops == {"before": -55, "after": -65}

    def test_any_of_combines_atomic_rules_via_logical_or(self, tmp_path: Path):
        """any_of -> LogicalComparison.or."""
        yaml_path = self._write(tmp_path, """\
segments:
  affluent_or_commercial:
    name: "Affluent or Commercial"
    description: "x"
    persona: mixed
    publish_schedule: daily
    target_dmo: Account_demo__dlm
    rule:
      type: any_of
      rules:
        - type: text_equals
          field: FinServ_ClientCategory_c__c
          value: "Wealth Management"
        - type: text_equals
          field: FinServ_ClientCategory_c__c
          value: "Commercial Banking"
""")
        defs = load_segment_definitions(yaml_path)
        user = defs[0].include_criteria["filters"][1]
        assert user["type"] == "LogicalComparison"
        assert user["operator"] == "or"
        values = {f["values"][0] for f in user["filters"]}
        assert values == {"Wealth Management", "Commercial Banking"}

    def test_compound_with_single_rule_unwraps_to_the_atomic(self, tmp_path: Path):
        """A compound with exactly one sub-rule shouldn't wrap in a
        no-op LogicalComparison. Pass the atomic clause through."""
        yaml_path = self._write(tmp_path, """\
segments:
  retail_only:
    name: "Retail (single)"
    description: "x"
    persona: retail
    publish_schedule: daily
    target_dmo: Account_demo__dlm
    rule:
      type: all_of
      rules:
        - type: text_equals
          field: FinServ_ClientCategory_c__c
          value: "Retail"
""")
        defs = load_segment_definitions(yaml_path)
        user = defs[0].include_criteria["filters"][1]
        assert user["type"] == "TextComparison"
        assert user["operator"] == "matches"
        assert user["values"] == ["Retail"]

    def test_nested_compound_rules(self, tmp_path: Path):
        """Compound rules nest: any_of of (all_of, atomic)."""
        yaml_path = self._write(tmp_path, """\
segments:
  niche:
    name: "Niche"
    description: "x"
    persona: mixed
    publish_schedule: daily
    target_dmo: Account_demo__dlm
    rule:
      type: any_of
      rules:
        - type: all_of
          rules:
            - type: text_equals
              field: FinServ_ClientCategory_c__c
              value: "Wealth Management"
            - type: age_in_range
              field: PersonBirthdate__c
              min_age: 55
              max_age: 65
        - type: text_equals
          field: FinServ_ClientCategory_c__c
          value: "Commercial Banking"
""")
        defs = load_segment_definitions(yaml_path)
        user = defs[0].include_criteria["filters"][1]
        assert user["type"] == "LogicalComparison"
        assert user["operator"] == "or"
        assert len(user["filters"]) == 2
        first = user["filters"][0]
        assert first["type"] == "LogicalComparison"
        assert first["operator"] == "and"
        second = user["filters"][1]
        assert second["type"] == "TextComparison"
        assert second["values"] == ["Commercial Banking"]

    def test_compound_with_empty_rules_raises(self, tmp_path: Path):
        """A compound with no sub-rules is a config error."""
        yaml_path = self._write(tmp_path, """\
segments:
  bad:
    name: "Bad"
    description: "x"
    persona: retail
    publish_schedule: daily
    target_dmo: Account_demo__dlm
    rule:
      type: all_of
      rules: []
""")
        with pytest.raises(ValueError, match="non-empty list"):
            load_segment_definitions(yaml_path)

    def test_unknown_rule_type_raises(self, tmp_path: Path):
        yaml_path = self._write(tmp_path, """\
segments:
  weird:
    name: "Weird"
    description: "x"
    persona: retail
    publish_schedule: manual
    target_dmo: Account_demo__dlm
    rule:
      type: nonsense_op
      field: External_ID_c__c
      value: "x"
""")
        with pytest.raises(ValueError, match="rule type"):
            load_segment_definitions(yaml_path)


class TestLoadSegmentDefinitionsRequired:
    def test_loads_yaml_and_parses_each_segment(self, tmp_path: Path):
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "All retail"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account_demo__dlm
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
""")
        defs = load_segment_definitions(yaml_path)
        assert len(defs) == 1
        d = defs[0]
        assert d.config_key == "retail_all"
        assert d.api_name == "RetailAll__seg"
        assert d.developer_name == "RetailAll"
        assert d.display_name == "Retail Customers"
        assert d.persona == "retail"
        assert d.target_dmo == "Account_demo__dlm"
        # Hydrate clause must be embedded in the criteria tree.
        assert d.include_criteria["type"] == "LogicalComparison"
        assert d.include_criteria["filters"][0]["values"] == ["HYDRATE-"]

    def test_raises_on_missing_required_field(self, tmp_path: Path):
        yaml_path = tmp_path / "bad.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    # missing description, persona, publish_schedule, target_dmo, rule
""")
        with pytest.raises(ValueError, match="missing required"):
            load_segment_definitions(yaml_path)

    def test_raises_on_missing_segments_key(self, tmp_path: Path):
        yaml_path = tmp_path / "bad.yaml"
        yaml_path.write_text("""\
something_else: foo
""")
        with pytest.raises(ValueError, match="segments"):
            load_segment_definitions(yaml_path)

    def test_linked_campaign_optional(self, tmp_path: Path):
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  cmp_heloc:
    name: "HELOC"
    description: "x"
    persona: retail
    publish_schedule: daily
    target_dmo: Account_demo__dlm
    linked_campaign: HYDRATE-CMP-001
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
  retail_all:
    name: "Retail All"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account_demo__dlm
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
""")
        defs = load_segment_definitions(yaml_path)
        d_with = next(d for d in defs if d.config_key == "cmp_heloc")
        d_without = next(d for d in defs if d.config_key == "retail_all")
        assert d_with.linked_campaign == "HYDRATE-CMP-001"
        assert d_without.linked_campaign is None


# ---- execute_create_segments ----

class TestExecuteCreateSegmentsDryRun:
    def test_dry_run_makes_no_rest_calls(self, tmp_path: Path):
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account_demo__dlm
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
""")
        with patch("customer_hydration.phase5.segments.get_org_session") as mock_sess, \
             patch("customer_hydration.phase5.segments.list_segments") as mock_list, \
             patch("customer_hydration.phase5.segments.create_segment") as mock_create:
            result = execute_create_segments(
                target_org="DRY-RUN", yaml_path=yaml_path, dry_run=True,
            )
            assert mock_sess.call_count == 0
            assert mock_list.call_count == 0
            assert mock_create.call_count == 0
            assert result.segments_processed == 1


class TestExecuteCreateSegmentsLive:
    @patch("customer_hydration.phase5.segments.get_org_session")
    @patch("customer_hydration.phase5.segments.list_segments")
    @patch("customer_hydration.phase5.segments.create_segment")
    def test_creates_when_segment_not_in_existing_list(
        self, mock_create, mock_list, mock_sess, tmp_path: Path,
    ):
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account_demo__dlm
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
""")
        mock_sess.return_value = ("https://x.salesforce.com", "tok")
        mock_list.return_value = []  # No existing segments
        mock_create.return_value = (True, "RetailAll__seg")
        result = execute_create_segments(target_org="alias", yaml_path=yaml_path)
        assert result.segments_created == 1
        assert result.segments_skipped == 0
        assert mock_create.call_count == 1
        # New payload kwargs must be passed through:
        kwargs = mock_create.call_args.kwargs
        assert kwargs["developer_name"] == "RetailAll"
        assert kwargs["display_name"] == "Retail Customers"
        assert kwargs["segment_on_api_name"] == "Account_demo__dlm"
        # Live API rejects non-NoRefresh values for Dynamic segments
        # ("Parameters related to publish aren't supported for a dynamic
        # segments"), so orchestration ALWAYS sends NoRefresh regardless
        # of YAML publish_schedule (which is informational only).
        assert kwargs["publish_schedule"] == "NoRefresh"
        criteria = kwargs["include_criteria"]
        assert criteria["type"] == "LogicalComparison"
        # HYDRATE clause is the first filter — flat (no {"filter": ...}
        # wrapper), matching the live API's create-shape.
        assert criteria["filters"][0]["values"] == ["HYDRATE-"]

    @patch("customer_hydration.phase5.segments.get_org_session")
    @patch("customer_hydration.phase5.segments.list_segments")
    @patch("customer_hydration.phase5.segments.create_segment")
    def test_skips_idempotently_when_segment_already_exists(
        self, mock_create, mock_list, mock_sess, tmp_path: Path,
    ):
        from customer_hydration.phase5.data_cloud import SegmentInfo
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account_demo__dlm
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
""")
        mock_sess.return_value = ("https://x.salesforce.com", "tok")
        mock_list.return_value = [SegmentInfo(
            api_name="RetailAll__seg", display_name="Old Name",
            description="old", target_dmo="Account_demo__dlm", publish_schedule="One",
        )]
        result = execute_create_segments(target_org="alias", yaml_path=yaml_path)
        # Dynamic segments cannot be PATCHed -> existing segment is a
        # no-op idempotent skip.
        assert result.segments_created == 0
        assert result.segments_skipped == 1
        assert result.segments_failed == 0
        # create_segment must NOT be called for an existing segment.
        assert mock_create.call_count == 0
        assert result.results[0].skipped is True

    @patch("customer_hydration.phase5.segments.get_org_session")
    @patch("customer_hydration.phase5.segments.list_segments")
    @patch("customer_hydration.phase5.segments.create_segment")
    def test_skip_publish_flag_is_no_op(
        self, mock_create, mock_list, mock_sess, tmp_path: Path,
    ):
        # --skip-publish is retained for argparse compatibility but is a
        # no-op now (Dynamic segments publish on their schedule).
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account_demo__dlm
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
""")
        mock_sess.return_value = ("https://x.salesforce.com", "tok")
        mock_list.return_value = []
        mock_create.return_value = (True, "RetailAll__seg")
        result = execute_create_segments(
            target_org="alias", yaml_path=yaml_path, skip_publish=True,
        )
        assert result.segments_created == 1

    @patch("customer_hydration.phase5.segments.get_org_session")
    @patch("customer_hydration.phase5.segments.list_segments")
    @patch("customer_hydration.phase5.segments.create_segment")
    def test_segment_id_filters_to_one_entry(
        self, mock_create, mock_list, mock_sess, tmp_path: Path,
    ):
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account_demo__dlm
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
  wealth_all:
    name: "Wealth Clients"
    description: "x"
    persona: wealth
    publish_schedule: hourly
    target_dmo: Account_demo__dlm
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Wealth"
""")
        mock_sess.return_value = ("https://x.salesforce.com", "tok")
        mock_list.return_value = []
        mock_create.return_value = (True, "WealthAll__seg")
        result = execute_create_segments(
            target_org="alias", yaml_path=yaml_path, segment_id="wealth_all",
        )
        assert result.segments_processed == 1
        assert mock_create.call_count == 1
        called_developer_name = mock_create.call_args.kwargs["developer_name"]
        assert called_developer_name == "WealthAll"

    @patch("customer_hydration.phase5.segments.get_org_session")
    @patch("customer_hydration.phase5.segments.list_segments")
    @patch("customer_hydration.phase5.segments.create_segment")
    def test_create_failure_recorded_does_not_raise(
        self, mock_create, mock_list, mock_sess, tmp_path: Path,
    ):
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account_demo__dlm
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
""")
        mock_sess.return_value = ("https://x.salesforce.com", "tok")
        mock_list.return_value = []
        mock_create.return_value = (False, "HTTP 400 Bad Request")
        result = execute_create_segments(target_org="alias", yaml_path=yaml_path)
        assert result.segments_failed == 1
        assert result.segments_created == 0
        assert "HTTP 400" in result.results[0].error


# ---- execute_refresh_streams ----

class TestExecuteRefreshStreams:
    @patch("customer_hydration.phase5.segments.execute_phase5_5")
    def test_delegates_to_phase5_5(self, mock_p55):
        from customer_hydration.phase5.data_cloud import DataCloudStreamRefreshResult
        mock_p55.return_value = DataCloudStreamRefreshResult(
            streams_discovered=5, streams_matched=3, streams_triggered=3,
        )
        result = execute_refresh_streams(target_org="alias")
        assert result.streams_discovered == 5
        assert result.streams_matched == 3
        assert result.streams_triggered == 3
        mock_p55.assert_called_once_with(target_org="alias")
