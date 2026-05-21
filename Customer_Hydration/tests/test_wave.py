"""Tests for loader/wave.py — wave dependency definitions."""
from __future__ import annotations

import dataclasses

import pytest

from customer_hydration.loader.wave import (
    WAVE_DEFS,
    Wave,
    sobject_to_wave,
    waves_in_forward_order,
    waves_in_reverse_order,
)


class TestWaveDefs:
    def test_waves_f_and_g_defined(self):
        # Plan 4 added native FSC waves F + G on top of legacy A-E.
        assert set(WAVE_DEFS.keys()) == {"A", "B", "C", "D", "E", "F", "G"}

    def test_wave_a_has_no_dependencies(self):
        assert WAVE_DEFS["A"].depends_on == ()

    def test_wave_b_depends_on_a(self):
        assert WAVE_DEFS["B"].depends_on == ("A",)

    def test_wave_c_depends_on_a_and_b(self):
        assert WAVE_DEFS["C"].depends_on == ("A", "B")

    def test_wave_d_depends_on_a_and_b_only(self):
        # D is independent of C — they can run in either order
        assert WAVE_DEFS["D"].depends_on == ("A", "B")
        assert "C" not in WAVE_DEFS["D"].depends_on

    def test_wave_e_depends_on_all_prior_waves(self):
        assert WAVE_DEFS["E"].depends_on == ("A", "B", "C", "D")

    def test_wave_d_is_parallel_with_6_sobjects(self):
        assert WAVE_DEFS["D"].parallel is True
        assert len(WAVE_DEFS["D"].sobjects) == 6

    def test_wave_e_is_parallel_with_6_sobjects(self):
        assert WAVE_DEFS["E"].parallel is True
        assert len(WAVE_DEFS["E"].sobjects) == 6

    def test_wave_a_includes_account(self):
        assert "Account" in WAVE_DEFS["A"].sobjects

    def test_wave_e_includes_fa_role_and_holding(self):
        assert "FinServ__FinancialAccountRole__c" in WAVE_DEFS["E"].sobjects
        assert "FinServ__FinancialHolding__c" in WAVE_DEFS["E"].sobjects

    def test_wave_f_includes_native_financial_account(self):
        # The whole point of Wave F is the native FSC mirror set, headed
        # by FinancialAccount.
        assert "FinancialAccount" in WAVE_DEFS["F"].sobjects
        # Spot-check the rest of the native FSC bundle.
        for sobj in (
            "FinancialGoal",
            "BusinessMilestone",
            "PartyRelationshipGroup",
            "PartyProfile",
            "ContactPointAddress",
            "ContactPointEmail",
            "ContactPointPhone",
        ):
            assert sobj in WAVE_DEFS["F"].sobjects

    def test_wave_g_depends_on_f(self):
        # G holds FinancialAccountParty, which can only resolve native FA
        # Ids after Wave F's queryback.
        assert WAVE_DEFS["G"].depends_on == ("F",)
        assert "FinancialAccountParty" in WAVE_DEFS["G"].sobjects


class TestWaveTraversal:
    def test_forward_order_now_a_through_g(self):
        names = [w.name for w in waves_in_forward_order()]
        assert names == ["A", "B", "C", "D", "E", "F", "G"]

    def test_reverse_order_now_g_through_a(self):
        names = [w.name for w in waves_in_reverse_order()]
        assert names == ["G", "F", "E", "D", "C", "B", "A"]

    def test_no_sobject_appears_in_two_waves(self):
        seen: set[str] = set()
        for wave in WAVE_DEFS.values():
            for sobj in wave.sobjects:
                assert sobj not in seen, f"{sobj} appears in more than one wave"
                seen.add(sobj)

    def test_sobject_to_wave_resolves_account_to_a(self):
        wave = sobject_to_wave("Account")
        assert wave is not None
        assert wave.name == "A"

    def test_sobject_to_wave_resolves_fa_role_to_e(self):
        wave = sobject_to_wave("FinServ__FinancialAccountRole__c")
        assert wave is not None
        assert wave.name == "E"

    def test_sobject_to_wave_returns_none_for_unknown(self):
        assert sobject_to_wave("FooBar__c") is None


class TestWaveDataclassImmutability:
    def test_wave_is_frozen(self):
        wave = WAVE_DEFS["A"]
        with pytest.raises(dataclasses.FrozenInstanceError):
            wave.name = "Z"  # type: ignore[misc]
