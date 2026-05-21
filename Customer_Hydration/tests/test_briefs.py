"""Plan 6 / Task 1 tests — banker brief generator with mocked SfRunner."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from customer_hydration.briefs import (
    BankerBrief,
    _persona_pitch,
    generate_brief,
    generate_index,
)


def _make_runner(query_responses: list[list[dict]]) -> MagicMock:
    """Return a MagicMock SfRunner whose .query() returns the next item.

    Tests stage one list of dict-rows per expected SOQL call, in order:
      1. total customers
      2. persona mix
      3. open opps (count + amount)
      4. open cases
      5. tasks this week
      6. sample customers
    """
    runner = MagicMock()
    runner.query.side_effect = query_responses
    return runner


def _vince_west_banker() -> dict:
    return {
        "user_id": "005am000003PYssAAG",
        "name": "Vince West",
        "title": "Relationship Manager (Wealth)",
        "role_family": "wealth",
        "seniority": "senior",
    }


def _justin_chen_banker() -> dict:
    return {
        "user_id": "005am000003PbFBAA0",
        "name": "Justin Chen",
        "title": "Relationship Banker",
        "role_family": "retail",
        "seniority": "mid",
    }


def _default_responses() -> list[list[dict]]:
    """Six SOQL responses covering one banker — used as the baseline shape."""
    return [
        [{"c": 12}],  # total
        [
            {"cat": "Wealth Management", "c": 10},
            {"cat": "Retail", "c": 2},
        ],  # persona mix
        [{"c": 3, "total": 250000.0}],  # open opps
        [{"c": 1}],  # open cases
        [{"c": 4}],  # tasks this week
        [
            {
                "Id": "001000000000001",
                "Name": "Alice Smith",
                "FirstName": "Alice",
                "LastName": "Smith",
                "External_ID__c": "HYDRATE-WEALTH-0001",
                "FinServ__ClientCategory__c": "Wealth Management",
                "FinServ__TotalInvestments__c": 5000000.0,
                "PersonMailingState": "CA",
            },
        ],
    ]


class TestGenerateBrief:
    def test_returns_banker_brief_dataclass(self):
        runner = _make_runner(_default_responses())
        brief = generate_brief(
            runner=runner, slug="vince_west", banker=_vince_west_banker(),
        )
        assert isinstance(brief, BankerBrief)
        assert brief.slug == "vince_west"
        assert brief.user_id == "005am000003PYssAAG"
        assert brief.name == "Vince West"
        assert brief.title == "Relationship Manager (Wealth)"
        assert brief.role_family == "wealth"
        assert brief.seniority == "senior"

    def test_queries_total_count(self):
        runner = _make_runner(_default_responses())
        brief = generate_brief(
            runner=runner, slug="vince_west", banker=_vince_west_banker(),
        )
        first_soql = runner.query.call_args_list[0][0][0]
        assert "COUNT(Id)" in first_soql
        assert "FROM Account" in first_soql
        assert "OwnerId='005am000003PYssAAG'" in first_soql
        assert "External_ID__c LIKE 'HYDRATE-%'" in first_soql
        assert brief.portfolio["total_customers"] == 12

    def test_queries_persona_mix(self):
        runner = _make_runner(_default_responses())
        brief = generate_brief(
            runner=runner, slug="vince_west", banker=_vince_west_banker(),
        )
        persona_soql = runner.query.call_args_list[1][0][0]
        assert "FinServ__ClientCategory__c" in persona_soql
        assert "GROUP BY FinServ__ClientCategory__c" in persona_soql
        assert brief.portfolio["persona_mix"] == {
            "Wealth Management": 10,
            "Retail": 2,
        }

    def test_queries_open_opps_with_amount(self):
        runner = _make_runner(_default_responses())
        brief = generate_brief(
            runner=runner, slug="vince_west", banker=_vince_west_banker(),
        )
        opps_soql = runner.query.call_args_list[2][0][0]
        assert "FROM Opportunity" in opps_soql
        assert "SUM(Amount)" in opps_soql
        assert "IsClosed=false" in opps_soql
        assert brief.portfolio["open_opps"] == 3
        assert brief.portfolio["open_opps_total"] == 250000.0

    def test_queries_open_cases(self):
        runner = _make_runner(_default_responses())
        brief = generate_brief(
            runner=runner, slug="vince_west", banker=_vince_west_banker(),
        )
        cases_soql = runner.query.call_args_list[3][0][0]
        assert "FROM Case" in cases_soql
        assert "IsClosed=false" in cases_soql
        assert brief.portfolio["open_cases"] == 1

    def test_queries_tasks_next_7_days(self):
        runner = _make_runner(_default_responses())
        brief = generate_brief(
            runner=runner, slug="vince_west", banker=_vince_west_banker(),
        )
        tasks_soql = runner.query.call_args_list[4][0][0]
        assert "FROM Task" in tasks_soql
        assert "NEXT_N_DAYS:7" in tasks_soql
        assert brief.portfolio["tasks_this_week"] == 4

    def test_wealth_orders_samples_by_total_investments(self):
        runner = _make_runner(_default_responses())
        generate_brief(
            runner=runner, slug="vince_west", banker=_vince_west_banker(),
        )
        sample_soql = runner.query.call_args_list[5][0][0]
        assert "ORDER BY FinServ__TotalInvestments__c DESC" in sample_soql
        assert "FinServ__TotalInvestments__c" in sample_soql

    def test_non_wealth_orders_samples_by_created_date(self):
        # Retail banker shape — sample query is a different SOQL with no
        # FinServ__TotalInvestments__c column and ORDER BY CreatedDate DESC.
        responses = [
            [{"c": 50}],
            [{"cat": "Retail", "c": 50}],
            [{"c": 0, "total": None}],
            [{"c": 0}],
            [{"c": 0}],
            [
                {
                    "Id": "001000000000099",
                    "Name": "Bob Banks",
                    "FirstName": "Bob",
                    "LastName": "Banks",
                    "External_ID__c": "HYDRATE-RETAIL-0099",
                    "FinServ__ClientCategory__c": "Retail",
                    "PersonMailingState": "TX",
                },
            ],
        ]
        runner = _make_runner(responses)
        generate_brief(
            runner=runner, slug="justin_chen", banker=_justin_chen_banker(),
        )
        sample_soql = runner.query.call_args_list[5][0][0]
        assert "ORDER BY CreatedDate DESC" in sample_soql
        assert "FinServ__TotalInvestments__c" not in sample_soql

    def test_brief_markdown_includes_banker_name(self):
        runner = _make_runner(_default_responses())
        brief = generate_brief(
            runner=runner, slug="vince_west", banker=_vince_west_banker(),
        )
        assert "Vince West" in brief.markdown
        assert "005am000003PYssAAG" in brief.markdown
        assert "Relationship Manager (Wealth)" in brief.markdown
        assert "## Portfolio at a glance" in brief.markdown
        assert "## Sample customers" in brief.markdown

    def test_brief_handles_zero_customers_gracefully(self):
        # Edge case: a banker with no HYDRATE-* records still gets a brief.
        zero_responses = [
            [{"c": 0}],
            [],
            [{"c": 0, "total": None}],
            [{"c": 0}],
            [{"c": 0}],
            [],
        ]
        runner = _make_runner(zero_responses)
        brief = generate_brief(
            runner=runner, slug="adam_watson",
            banker={
                "user_id": "005am000003PbFGAA0",
                "name": "Adam Watson",
                "title": "Financial Advisor Associate",
                "role_family": "wealth",
                "seniority": "junior",
            },
        )
        assert brief.portfolio["total_customers"] == 0
        assert brief.portfolio["open_opps_total"] == 0.0
        assert "_(no customers loaded yet)_" in brief.markdown


class TestPersonaPitch:
    def test_returns_role_family_appropriate_pitch(self):
        # All six (role_family, seniority) tuples used in rm_pool.yaml.
        pitches = {
            ("wealth", "senior"): _persona_pitch("wealth", "senior"),
            ("wealth", "mid"): _persona_pitch("wealth", "mid"),
            ("wealth", "junior"): _persona_pitch("wealth", "junior"),
            ("retail", "mid"): _persona_pitch("retail", "mid"),
            ("commercial", "senior"): _persona_pitch("commercial", "senior"),
        }
        # Each tuple yields a (description, demo_angle) pair of non-empty strings.
        for key, (description, angle) in pitches.items():
            assert description, f"empty description for {key}"
            assert angle, f"empty demo angle for {key}"
        # And the descriptions are role-distinct.
        descs = {p[0] for p in pitches.values()}
        assert len(descs) == 5

        # Fallback shape for an unknown family/seniority pair.
        desc, angle = _persona_pitch("unknown", "")
        assert desc and angle


class TestGenerateIndex:
    def test_table_has_one_row_per_banker(self):
        rows = [
            ("vince_west", "Vince West", "Wealth RM", 700, 700, 35, 4),
            ("kim_johnson", "Kim Johnson", "Wealth Advisor", 400, 400, 18, 1),
            ("adam_watson", "Adam Watson", "FAA", 200, 200, 6, 0),
        ]
        index_md = generate_index(rows)
        # One markdown table row per banker (start with `|` and contain the slug link)
        for slug, name, _title, _total, _persona_total, _opps, _cases in rows:
            assert (
                f"[{name}](briefs/{slug.replace('_', '-')}.md)" in index_md
            )
        # Header + 3 data rows = 5 total `|` lines (header + separator + 3 rows)
        table_lines = [ln for ln in index_md.splitlines() if ln.startswith("|")]
        # Header row, separator row, plus one row per banker = 5
        assert len(table_lines) == 2 + len(rows)
