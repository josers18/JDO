"""Tests for the Holdings generator (Plan 2 / Task 5).

The Holdings generator emits FinServ__FinancialHolding__c rows for Wealth
investment FAs (Brokerage, Managed Advisory, IRA, Roth IRA, 529, Trust).
This org diverges significantly from the spec's idealized FSC schema —
nearly every "spec" field is renamed (FinServ__SecuritySymbol__c →
FinServ__Symbol__c, FinServ__Quantity__c → FinServ__Shares__c, etc.) and
two are dropped entirely (FinServ__CostBasis__c, FinServ__AcquiredDate__c).
The fieldmap encodes all of those renames; these tests verify the
generator emits the right physical names AFTER fieldmap translation.

This object has no External_ID__c — idempotency uses
FinServ__SourceSystemId__c instead.
"""
from __future__ import annotations

import pytest

from customer_hydration.generators.holdings import (
    HoldingBundle,
    HoldingRequest,
    generate_holdings,
    load_universe,
)


@pytest.fixture
def universe_path(package_root):
    return package_root / "config" / "holding_universe.yaml"


@pytest.fixture
def sample_requests() -> list[HoldingRequest]:
    return [
        HoldingRequest(
            fa_external_id="HYDRATE-FA-000101",
            primary_owner_external_id="HYDRATE-WL-000001",
            fa_target_balance=250_000.0,
            num_holdings=8,
        ),
        HoldingRequest(
            fa_external_id="HYDRATE-FA-000102",
            primary_owner_external_id="HYDRATE-WL-000002",
            fa_target_balance=1_500_000.0,
            num_holdings=15,
        ),
        HoldingRequest(
            fa_external_id="HYDRATE-FA-000103",
            primary_owner_external_id="HYDRATE-WL-000003",
            fa_target_balance=75_000.0,
            num_holdings=4,
        ),
    ]


@pytest.fixture
def gen_kwargs(fixed_seed, sample_requests, universe_path):
    return {
        "seed": fixed_seed,
        "starting_seq": 1,
        "requests": sample_requests,
        "universe_path": universe_path,
    }


class TestUniverseLoad:
    def test_loads_universe_yaml_returns_list_of_securities(self, universe_path):
        universe = load_universe(universe_path)
        assert isinstance(universe, list)
        # ~40 entries total across equities/etfs/mutual_funds/bonds
        assert len(universe) >= 35
        for sec in universe:
            assert "symbol" in sec
            assert "name" in sec
            assert "asset_class" in sec
            assert "asset_category" in sec
            assert "category_name" in sec


class TestGenerateHoldings:
    def test_generates_num_holdings_per_request(self, gen_kwargs):
        bundle = generate_holdings(**gen_kwargs)
        assert isinstance(bundle, HoldingBundle)
        expected_total = sum(r.num_holdings for r in gen_kwargs["requests"])
        assert len(bundle.holdings) == expected_total

    def test_holdings_use_symbol_field_not_security_symbol(self, gen_kwargs):
        bundle = generate_holdings(**gen_kwargs)
        for h in bundle.holdings:
            assert "FinServ__Symbol__c" in h
            assert h["FinServ__Symbol__c"]
            assert "FinServ__SecuritySymbol__c" not in h

    def test_holdings_use_securities_field_not_security_name(self, gen_kwargs):
        bundle = generate_holdings(**gen_kwargs)
        for h in bundle.holdings:
            assert "FinServ__Securities__c" in h
            assert h["FinServ__Securities__c"]
            assert "FinServ__SecurityName__c" not in h

    def test_holdings_use_shares_not_quantity(self, gen_kwargs):
        bundle = generate_holdings(**gen_kwargs)
        for h in bundle.holdings:
            assert "FinServ__Shares__c" in h
            assert h["FinServ__Shares__c"] > 0
            assert "FinServ__Quantity__c" not in h

    def test_holdings_use_price_not_current_price(self, gen_kwargs):
        bundle = generate_holdings(**gen_kwargs)
        for h in bundle.holdings:
            assert "FinServ__Price__c" in h
            assert h["FinServ__Price__c"] > 0
            assert "FinServ__CurrentPrice__c" not in h

    def test_holdings_have_no_cost_basis_field(self, gen_kwargs):
        # Dropped — derived client-side as shares × purchase_price.
        bundle = generate_holdings(**gen_kwargs)
        for h in bundle.holdings:
            assert "FinServ__CostBasis__c" not in h

    def test_holdings_have_no_acquired_date_field(self, gen_kwargs):
        # Dropped — not on the org's FinancialHolding object.
        bundle = generate_holdings(**gen_kwargs)
        for h in bundle.holdings:
            assert "FinServ__AcquiredDate__c" not in h

    def test_holdings_use_source_system_id_for_idempotency(self, gen_kwargs):
        gen_kwargs["starting_seq"] = 7
        bundle = generate_holdings(**gen_kwargs)
        ssids = [h["FinServ__SourceSystemId__c"] for h in bundle.holdings]
        assert ssids[0] == "HYDRATE-HOLD-000007"
        # Sequential, zero-padded to 6 digits
        for i, ssid in enumerate(ssids):
            assert ssid == f"HYDRATE-HOLD-{7 + i:06d}"
            assert len(ssid.split("-")[-1]) == 6

    def test_holdings_link_to_fa(self, gen_kwargs):
        bundle = generate_holdings(**gen_kwargs)
        # Group holdings by FA — first request says num_holdings=8, etc.
        fa_to_holdings: dict[str, list[dict]] = {}
        for h in bundle.holdings:
            fa_to_holdings.setdefault(h["FinServ__FinancialAccount__c"], []).append(h)
        for req in gen_kwargs["requests"]:
            assert req.fa_external_id in fa_to_holdings
            assert len(fa_to_holdings[req.fa_external_id]) == req.num_holdings

    def test_holdings_link_to_owner(self, gen_kwargs):
        bundle = generate_holdings(**gen_kwargs)
        owners_seen = {h["FinServ__PrimaryOwner__c"] for h in bundle.holdings}
        expected = {r.primary_owner_external_id for r in gen_kwargs["requests"]}
        assert owners_seen == expected
        # Each holding's owner matches the owner of its FA.
        owner_by_fa = {r.fa_external_id: r.primary_owner_external_id
                       for r in gen_kwargs["requests"]}
        for h in bundle.holdings:
            assert h["FinServ__PrimaryOwner__c"] == owner_by_fa[h["FinServ__FinancialAccount__c"]]

    def test_market_value_equals_shares_times_price(self, gen_kwargs):
        bundle = generate_holdings(**gen_kwargs)
        for h in bundle.holdings:
            shares = h["FinServ__Shares__c"]
            price = h["FinServ__Price__c"]
            mv = h["FinServ__MarketValue__c"]
            # Allow 1¢ rounding tolerance (round to 2dp at multiple stages).
            assert abs(mv - round(shares * price, 2)) < 0.02

    def test_total_market_value_approximates_fa_target_balance(self, gen_kwargs):
        bundle = generate_holdings(**gen_kwargs)
        # Group by FA, sum MarketValue, check ±15% of fa_target_balance.
        fa_totals: dict[str, float] = {}
        for h in bundle.holdings:
            fa_totals.setdefault(h["FinServ__FinancialAccount__c"], 0.0)
            fa_totals[h["FinServ__FinancialAccount__c"]] += h["FinServ__MarketValue__c"]
        for req in gen_kwargs["requests"]:
            total = fa_totals[req.fa_external_id]
            ratio = total / req.fa_target_balance
            assert 0.85 <= ratio <= 1.15, (
                f"FA {req.fa_external_id}: total={total} target={req.fa_target_balance} "
                f"ratio={ratio}"
            )

    def test_distinct_securities_per_request(self, gen_kwargs):
        bundle = generate_holdings(**gen_kwargs)
        # Group by FA and verify symbol uniqueness within each.
        symbols_by_fa: dict[str, list[str]] = {}
        for h in bundle.holdings:
            symbols_by_fa.setdefault(h["FinServ__FinancialAccount__c"], []).append(
                h["FinServ__Symbol__c"]
            )
        for fa_id, symbols in symbols_by_fa.items():
            assert len(symbols) == len(set(symbols)), (
                f"FA {fa_id} has duplicate symbols: {symbols}"
            )

    def test_same_seed_produces_identical_output(self, gen_kwargs):
        bundle1 = generate_holdings(**gen_kwargs)
        bundle2 = generate_holdings(**gen_kwargs)
        assert bundle1.holdings == bundle2.holdings
