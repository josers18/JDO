"""Tests for loader/reset.py — reverse-wave HYDRATE-* deletion.

Covers:
- Confirmation gate (alias mismatch raises, match proceeds).
- Dry-run path (counts only, no subprocess).
- Empty sObjects are skipped (no work).
- Reverse-wave order across all sObjects.
- Per-sObject idempotency-field map correctness.
- Subprocess failure surfaces an error in the report.
- Output dir is created when missing.
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from customer_hydration.loader.reset import (
    _IDEM_FIELD,
    ResetReport,
    reset_hydrate,
)
from customer_hydration.loader.wave import waves_in_reverse_order


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_runner(query_results: list[list[dict]] | list[dict] | None = None) -> MagicMock:
    """Build a mocked SfRunner.

    If a list-of-lists is passed, successive calls return successive lists.
    Otherwise a single static list is returned every call.
    """
    runner = MagicMock()
    if query_results is None:
        runner.query.return_value = []
        return runner
    if query_results and isinstance(query_results[0], list):
        runner.query.side_effect = query_results
    else:
        runner.query.return_value = query_results
    return runner


def _ok_proc(stdout: str = '{"result": {"jobInfo": {"numberRecordsProcessed": 0, "numberRecordsFailed": 0}}}') -> MagicMock:
    proc = MagicMock()
    proc.returncode = 0
    proc.stdout = stdout
    proc.stderr = ""
    return proc


def _fail_proc(stderr: str = "auth expired") -> MagicMock:
    proc = MagicMock()
    proc.returncode = 1
    proc.stdout = ""
    proc.stderr = stderr
    return proc


# ---------------------------------------------------------------------------
# TestConfirmation
# ---------------------------------------------------------------------------


class TestConfirmation:
    def test_raises_value_error_on_alias_mismatch(self, tmp_path: Path) -> None:
        runner = _make_runner([])
        with pytest.raises(ValueError, match="Confirmation mismatch"):
            reset_hydrate(
                runner=runner,
                target_org="jdo-fw51xz",
                output_dir=tmp_path,
                confirm_alias="jdo-fw51xz",
                user_typed_alias="wrong-alias",
            )

    def test_proceeds_when_alias_matches(self, tmp_path: Path) -> None:
        runner = _make_runner([])  # nothing to delete anywhere
        # Should not raise and should return a list (every sobject skipped).
        reports = reset_hydrate(
            runner=runner,
            target_org="jdo-fw51xz",
            output_dir=tmp_path,
            confirm_alias="jdo-fw51xz",
            user_typed_alias="jdo-fw51xz",
            dry_run=True,
        )
        assert isinstance(reports, list)
        assert all(isinstance(r, ResetReport) for r in reports)


# ---------------------------------------------------------------------------
# TestDryRun
# ---------------------------------------------------------------------------


class TestDryRun:
    def test_dry_run_does_not_invoke_subprocess(self, tmp_path: Path) -> None:
        runner = _make_runner([{"Id": "001AA00000A"}, {"Id": "001AA00000B"}])
        with patch("customer_hydration.loader.reset.subprocess.run") as mock_run:
            reset_hydrate(
                runner=runner,
                target_org="jdo-fw51xz",
                output_dir=tmp_path,
                confirm_alias="jdo-fw51xz",
                user_typed_alias="jdo-fw51xz",
                dry_run=True,
            )
            assert mock_run.call_count == 0

    def test_dry_run_returns_query_counts(self, tmp_path: Path) -> None:
        runner = _make_runner([
            {"Id": "001AA00000A"},
            {"Id": "001AA00000B"},
            {"Id": "001AA00000C"},
        ])
        reports = reset_hydrate(
            runner=runner,
            target_org="jdo-fw51xz",
            output_dir=tmp_path,
            confirm_alias="jdo-fw51xz",
            user_typed_alias="jdo-fw51xz",
            dry_run=True,
        )
        # Every sObject in the wave map gets the same 3-row response.
        non_skipped = [r for r in reports if not r.skipped]
        assert len(non_skipped) > 0
        assert all(r.queried == 3 for r in non_skipped)
        assert all(r.deleted == 0 for r in non_skipped)


# ---------------------------------------------------------------------------
# TestSkipsEmptySObjects
# ---------------------------------------------------------------------------


class TestSkipsEmptySObjects:
    def test_skips_sobject_with_no_hydrate_rows(self, tmp_path: Path) -> None:
        runner = _make_runner([])  # no rows for any sobject
        with patch("customer_hydration.loader.reset.subprocess.run") as mock_run:
            reports = reset_hydrate(
                runner=runner,
                target_org="jdo-fw51xz",
                output_dir=tmp_path,
                confirm_alias="jdo-fw51xz",
                user_typed_alias="jdo-fw51xz",
            )
            # No deletes because nothing was returned.
            assert mock_run.call_count == 0
        assert len(reports) > 0
        assert all(r.skipped for r in reports)
        assert all(r.queried == 0 for r in reports)


# ---------------------------------------------------------------------------
# TestReverseWaveOrder
# ---------------------------------------------------------------------------


class TestReverseWaveOrder:
    def test_deletes_in_reverse_wave_order(self, tmp_path: Path) -> None:
        runner = _make_runner([{"Id": "001AA00000A"}])
        # Build the expected order from the wave registry itself. Plan 4
        # adds None-idem natives (PartyRelationshipGroup, ContactPoint*,
        # FinancialAccountParty, etc.) which the reset loop skips, so they
        # never reach the bulk-delete subprocess we're observing here.
        expected_order: list[str] = []
        for wave in waves_in_reverse_order():
            for sobj in wave.sobjects:
                if sobj in _IDEM_FIELD and _IDEM_FIELD[sobj] is not None:
                    expected_order.append(sobj)

        observed_order: list[str] = []

        def _observe(cmd: list[str], **_kwargs):  # noqa: ANN001
            # cmd is `sf data delete bulk --file ... --sobject <sobj> ...`
            sobj = cmd[cmd.index("--sobject") + 1]
            observed_order.append(sobj)
            return _ok_proc()

        with patch(
            "customer_hydration.loader.reset.subprocess.run",
            side_effect=_observe,
        ):
            reset_hydrate(
                runner=runner,
                target_org="jdo-fw51xz",
                output_dir=tmp_path,
                confirm_alias="jdo-fw51xz",
                user_typed_alias="jdo-fw51xz",
            )

        assert observed_order == expected_order
        # The first DELETED sObject comes from the latest wave that has
        # any non-None-idem sobjects. Wave G's only entry
        # (FinancialAccountParty) is None-idem, so the first delete lands
        # on a Wave-F native FSC object with External_ID__c.
        assert observed_order[0] in {
            "FinancialAccount",
            "FinancialGoal",
            "BusinessMilestone",
        }
        # And the very last sObject must be Account (Wave A).
        assert observed_order[-1] == "Account"


# ---------------------------------------------------------------------------
# TestSObjectsCovered
# ---------------------------------------------------------------------------


class TestSObjectsCovered:
    def test_each_idem_field_is_correct(self) -> None:
        # External_ID__c (capital ID) — most objects.
        assert _IDEM_FIELD["Account"] == "External_ID__c"
        assert _IDEM_FIELD["AccountContactRelation"] == "External_ID__c"
        assert _IDEM_FIELD["FinServ__FinancialAccount__c"] == "External_ID__c"
        assert _IDEM_FIELD["FinServ__FinancialAccountRole__c"] == "External_ID__c"
        assert _IDEM_FIELD["FinServ__Card__c"] == "External_ID__c"
        assert _IDEM_FIELD["FinServ__FinancialGoal__c"] == "External_ID__c"
        assert _IDEM_FIELD["Campaign"] == "External_ID__c"
        assert _IDEM_FIELD["Opportunity"] == "External_ID__c"
        assert _IDEM_FIELD["Case"] == "External_ID__c"
        assert _IDEM_FIELD["Task"] == "External_ID__c"
        assert _IDEM_FIELD["Event"] == "External_ID__c"
        assert _IDEM_FIELD["CampaignMember"] == "External_ID__c"

        # Contact uses lowercase-d External_Id__c.
        assert _IDEM_FIELD["Contact"] == "External_Id__c"

        # FinServ__SourceSystemId__c — for objects that don't carry External_ID__c.
        assert _IDEM_FIELD["FinServ__LifeEvent__c"] == "FinServ__SourceSystemId__c"
        assert _IDEM_FIELD["FinServ__FinancialHolding__c"] == "FinServ__SourceSystemId__c"


# ---------------------------------------------------------------------------
# TestSubprocessFailure
# ---------------------------------------------------------------------------


class TestSubprocessFailure:
    def test_subprocess_failure_records_error(self, tmp_path: Path) -> None:
        runner = _make_runner([
            {"Id": "001AA00000A"},
            {"Id": "001AA00000B"},
        ])
        with patch(
            "customer_hydration.loader.reset.subprocess.run",
            return_value=_fail_proc("auth expired"),
        ):
            reports = reset_hydrate(
                runner=runner,
                target_org="jdo-fw51xz",
                output_dir=tmp_path,
                confirm_alias="jdo-fw51xz",
                user_typed_alias="jdo-fw51xz",
            )
        non_skipped = [r for r in reports if not r.skipped]
        assert len(non_skipped) > 0
        # Every non-skipped one should have an error and failed=queried.
        for r in non_skipped:
            assert r.error is not None
            assert "auth expired" in r.error
            assert r.failed == r.queried
            assert r.queried == 2


# ---------------------------------------------------------------------------
# TestNoneIdemSkip (Plan 4 / Task 9)
# ---------------------------------------------------------------------------


class TestNoneIdemSkip:
    def test_skips_natives_with_none_idem_field(self, tmp_path: Path) -> None:
        # Plan 4 native FSC objects without External_ID__c are mapped to
        # None in _IDEM_FIELD. The reset path must:
        #   1. NOT issue a SOQL query for them (no marker field to filter on)
        #   2. NOT shell out to `sf data delete bulk`
        #   3. Surface them as skipped reports
        none_idem_sobjects = {
            sobj for sobj, idem in _IDEM_FIELD.items() if idem is None
        }
        assert none_idem_sobjects, (
            "test premise: at least one None-idem object is registered"
        )

        runner = _make_runner([{"Id": "001AA00000A"}])  # any non-None query
        seen_soql: list[str] = []

        def _capture(soql: str):  # noqa: ANN001
            seen_soql.append(soql)
            return [{"Id": "001AA00000A"}]

        runner.query.side_effect = _capture

        with patch(
            "customer_hydration.loader.reset.subprocess.run",
            return_value=_ok_proc(),
        ) as mock_run:
            reports = reset_hydrate(
                runner=runner,
                target_org="jdo-fw51xz",
                output_dir=tmp_path,
                confirm_alias="jdo-fw51xz",
                user_typed_alias="jdo-fw51xz",
            )

        # Each None-idem sobject should appear as a skipped report.
        skipped = {r.sobject for r in reports if r.skipped}
        for sobj in none_idem_sobjects:
            assert sobj in skipped, f"{sobj} should be skipped (None idem)"

        # And no SOQL or bulk-delete should have referenced any None-idem object.
        joined_soql = " ".join(seen_soql)
        for sobj in none_idem_sobjects:
            assert sobj not in joined_soql, (
                f"unexpected SOQL touched None-idem sobject {sobj}"
            )
        for call in mock_run.call_args_list:
            args = call.args[0] if call.args else call.kwargs.get("args", [])
            if "--sobject" in args:
                touched = args[args.index("--sobject") + 1]
                assert touched not in none_idem_sobjects, (
                    f"unexpected bulk-delete on None-idem sobject {touched}"
                )


# ---------------------------------------------------------------------------
# TestNoOutputDir
# ---------------------------------------------------------------------------


class TestNoOutputDir:
    def test_creates_output_dir_if_missing(self, tmp_path: Path) -> None:
        target = tmp_path / "nonexistent" / "deeper"
        assert not target.exists()
        runner = _make_runner([])  # nothing to delete; dir-creation still must run
        reset_hydrate(
            runner=runner,
            target_org="jdo-fw51xz",
            output_dir=target,
            confirm_alias="jdo-fw51xz",
            user_typed_alias="jdo-fw51xz",
            dry_run=True,
        )
        assert target.exists()
        assert target.is_dir()
