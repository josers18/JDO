"""Holdings generator (Plan 2 / Task 5).

Emits FinServ__FinancialHolding__c rows from a list of HoldingRequests —
one row per security position inside a Wealth investment FA (Brokerage,
Managed Advisory, IRA, Roth IRA, 529, Trust). Securities are drawn
deterministically from `config/holding_universe.yaml` (~40 tickers
spanning equities, ETFs, mutual funds, bonds).

This org's FinancialHolding object diverges from the spec significantly:

  Spec / logical                      Physical (org)             Notes
  ---------------------------------   ------------------------   --------
  FinServ__SecuritySymbol__c          FinServ__Symbol__c         renamed
  FinServ__SecurityName__c            FinServ__Securities__c     renamed
  FinServ__Quantity__c                FinServ__Shares__c         renamed
  FinServ__CurrentPrice__c            FinServ__Price__c          renamed
  FinServ__CostBasis__c               (dropped)                  derive client-side
  FinServ__AcquiredDate__c            (dropped)                  not on object
  External_ID__c                      (does not exist)           use SourceSystemId

Idempotency: this object has no External_ID__c, so we use
FinServ__SourceSystemId__c = f"HYDRATE-HOLD-{starting_seq + i:06d}"
as the upsert external-id key (the loader is configured per-object
with the correct idempotency field).

Per-holding economics:
  market_value = shares × current_price          (emitted explicitly)
  cost_basis   = shares × purchase_price         (computed but not emitted)
  gain_loss    = market_value - cost_basis        (emitted)
  pct_change   = gain_loss / cost_basis           (emitted, decimal)
  purchase_price = current_price × U(0.7, 1.2)    (simulates gain/loss)

Per-request allocation: holdings sum to ~fa_target_balance via random
weights — within ±15% of the target after rounding.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from customer_hydration.fieldmap import JDO_FIELDMAP


_UNIVERSE_CATEGORIES = ("equities", "etfs", "mutual_funds", "bonds")


@dataclass
class HoldingRequest:
    """Per-FA spec — one request → one investment FA worth of holdings.

    fa_target_balance is the FA's target Balance__c; the generator
    distributes that total across `num_holdings` distinct securities.
    """

    fa_external_id: str
    primary_owner_external_id: str
    fa_target_balance: float
    num_holdings: int


@dataclass
class HoldingBundle:
    """All FinServ__FinancialHolding__c rows produced for a batch."""

    holdings: list[dict] = field(default_factory=list)


def load_universe(path: Path) -> list[dict]:
    """Load holding_universe.yaml and flatten to a list of securities.

    Each security is a dict with keys: symbol, name, asset_class,
    asset_category, category_name. Categories are merged in a fixed
    order (equities → etfs → mutual_funds → bonds) so the resulting
    list is deterministic across runs.
    """
    data = yaml.safe_load(Path(path).read_text())
    universe: list[dict] = []
    for category_key in _UNIVERSE_CATEGORIES:
        universe.extend(data.get(category_key, []) or [])
    return universe


def generate_holdings(
    *,
    seed: int,
    starting_seq: int,
    requests: list[HoldingRequest],
    universe_path: Path,
) -> HoldingBundle:
    """Generate FinServ__FinancialHolding__c rows from holding requests.

    Determinism: a single Random(seed) drives security selection,
    weights, prices, shares, and purchase prices across all requests
    so the same seed + requests + universe produces identical output.
    """
    rng = random.Random(seed)
    universe = load_universe(universe_path)
    bundle = HoldingBundle()
    holding_idx = 0

    for req in requests:
        # Pick distinct securities deterministically. If a request asks
        # for more holdings than the universe contains we cap at the
        # universe size — preserves the "distinct symbols" invariant.
        sample_size = min(req.num_holdings, len(universe))
        chosen = rng.sample(universe, k=sample_size)

        # Allocate the FA's target balance across holdings via random
        # weights. weights ∈ [0.5, 1.5) to prevent any single holding
        # from dominating or vanishing.
        weights = [rng.random() + 0.5 for _ in chosen]
        total_weight = sum(weights)

        for sec_idx, sec in enumerate(chosen):
            allocation = req.fa_target_balance * weights[sec_idx] / total_weight

            # Realistic price ranges across asset types. For demos this
            # need not match real market data — only that MarketValue
            # ≈ allocation and gain/loss looks plausible.
            current_price = round(rng.uniform(20, 800), 2)
            shares = round(allocation / current_price, 4)
            purchase_price = round(current_price * rng.uniform(0.7, 1.2), 2)

            market_value = round(shares * current_price, 2)
            cost_basis = round(shares * purchase_price, 2)
            gain_loss = round(market_value - cost_basis, 2)
            pct_change = round(gain_loss / cost_basis, 4) if cost_basis else 0.0

            ssid = f"HYDRATE-HOLD-{starting_seq + holding_idx:06d}"
            holding_idx += 1

            # Build the logical row using spec field names where renames
            # apply, physical names where no rename applies. The fieldmap
            # then drops CostBasis / AcquiredDate (which we emit only so
            # the renames stay in one place — fieldmap.py).
            logical = {
                "Name": f"{sec['symbol']} - {sec['name']}",
                # Renamed by fieldmap → physical FinServ__Symbol__c et al.
                "FinServ__SecuritySymbol__c": sec["symbol"],
                "FinServ__SecurityName__c": sec["name"],
                "FinServ__Quantity__c": shares,
                "FinServ__CurrentPrice__c": current_price,
                # No rename — emit directly.
                "FinServ__PurchasePrice__c": purchase_price,
                "FinServ__MarketValue__c": market_value,
                # Dropped by fieldmap (cost basis derives shares × purchase).
                "FinServ__CostBasis__c": cost_basis,
                # Dropped by fieldmap (not on object).
                "FinServ__AcquiredDate__c": None,
                # Derived gain/loss surfaces — present on object.
                "FinServ__GainLoss__c": gain_loss,
                "FinServ__PercentChange__c": pct_change,
                # Asset taxonomy — present on object.
                "FinServ__AssetClass__c": sec.get("asset_class", ""),
                "FinServ__AssetCategory__c": sec.get("asset_category", ""),
                "FinServ__AssetCategoryName__c": sec.get("category_name", ""),
                # Linkages (loader rewrites column header to *.External_ID__c
                # reference syntax for Bulk API 2.0).
                "FinServ__FinancialAccount__c": req.fa_external_id,
                "FinServ__PrimaryOwner__c": req.primary_owner_external_id,
                # Idempotency — this object has no External_ID__c.
                "FinServ__SourceSystemId__c": ssid,
            }
            bundle.holdings.append(
                JDO_FIELDMAP.apply("FinServ__FinancialHolding__c", logical)
            )

    return bundle
