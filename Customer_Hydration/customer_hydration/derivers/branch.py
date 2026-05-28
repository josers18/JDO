"""branch deriver — FinServ__BranchCode__c, FinServ__BranchName__c.

Phase 5a. Pulls real BranchUnit rows from the org and assigns each Account
to one. If a `BranchUnitCustomer` junction already links the Account to a
BranchUnit (~144 known canonical assignments), inherit that. Otherwise pick
deterministically by metro state — branches whose name contains the metro's
state get higher weight, with uniform fallback.

Spec: docs/superpowers/specs/2026-05-27-phase-5-dmo-backfill-design.md §4.1
"""
from __future__ import annotations

from random import Random
from typing import Any

from customer_hydration.derivers._archetype import PersonaArchetype


# State -> branch-code preference list. Keyed off the metro state stored in
# archetype.home_metro ("City, ST"). Branches not listed for a state still
# get uniform weight as fallback. Built from the 26 live BranchUnit rows in
# jdo-uqj0jr (BR000..BR700) — names parsed by city.
_STATE_PREFERRED_BRANCHES: dict[str, list[str]] = {
    "CA": ["BR100", "BR110", "BR120", "BR000", "BR001", "BR002", "BR003"],  # SF + LA + SD + 4 SF-area legacy
    "NY": ["BR200", "BR004"],                                                  # NYC Financial + 10 State St
    "WA": ["BR210"],                                                           # Seattle
    "PA": ["BR220"],                                                           # Philadelphia
    "OR": ["BR230"],                                                           # Portland
    "UT": ["BR240"],                                                           # Salt Lake City
    "IL": ["BR300"],                                                           # Chicago Financial Center
    "TX": ["BR310", "BR340"],                                                  # Houston + Austin
    "TN": ["BR320"],                                                           # Nashville
    "OH": ["BR330"],                                                           # Columbus
    "MN": ["BR350"],                                                           # Minneapolis
    "MA": ["BR400"],                                                           # Boston
    "FL": ["BR500"],                                                           # Miami
    "GA": ["BR510"],                                                           # Atlanta
    "VA": ["BR520"],                                                           # Richmond
    # BR600 (Wealth Management Center), BR700 (Digital Banking Hub) — virtual,
    # available to all states as fallback.
}


def _parse_state_from_metro(home_metro: str | None) -> str | None:
    """home_metro is 'City, ST' (per _archetype.py). Return 'ST' or None."""
    if not home_metro or "," not in home_metro:
        return None
    return home_metro.rsplit(",", 1)[1].strip().upper()


class BranchAssignmentDeriver:
    """Owns FinServ__BranchCode__c + FinServ__BranchName__c.

    Two-source assignment:
      1. canonical: BranchUnitCustomer junction (passed in via record dict
         under the synthetic key '_branch_unit_customer') — inherit the live
         link if it exists.
      2. fallback: state-weighted random over the 26 BranchUnit rows
         (passed in under '_branch_units' as a list of {Id, BranchCode, Name}).

    The orchestrator is responsible for fetching both lookups once and
    seeding them into each record dict before calling derive(). This keeps
    the deriver pure (no I/O) and matches the Phase 4 protocol.
    """

    name = "branch"
    fields = [
        "FinServ__BranchCode__c",
        "FinServ__BranchName__c",
    ]

    def applies_to(self, archetype: PersonaArchetype) -> bool:
        # Branch assignment applies to every Account regardless of subtype.
        return True

    def derive(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {}

        # Path 1: canonical assignment from BranchUnitCustomer
        canonical = record.get("_branch_unit_customer")
        if canonical:
            out["FinServ__BranchCode__c"] = canonical["BranchCode"]
            out["FinServ__BranchName__c"] = canonical["Name"]
            return out

        # Path 2: state-weighted random
        branches: list[dict] = record.get("_branch_units") or []
        if not branches:
            # No lookup loaded — skip; the upsert layer will treat as no-write.
            return out

        state = _parse_state_from_metro(archetype.home_metro)
        preferred_codes = _STATE_PREFERRED_BRANCHES.get(state or "", [])

        # Build a weighted choice list. Preferred branches: weight 5; others: 1.
        weighted: list[tuple[dict, int]] = []
        for b in branches:
            code = b.get("BranchCode") or ""
            w = 5 if code in preferred_codes else 1
            weighted.append((b, w))

        total_weight = sum(w for _, w in weighted)
        if total_weight == 0:
            return out
        roll = rng.randint(1, total_weight)
        running = 0
        chosen = weighted[0][0]
        for b, w in weighted:
            running += w
            if roll <= running:
                chosen = b
                break

        out["FinServ__BranchCode__c"] = chosen["BranchCode"] or ""
        out["FinServ__BranchName__c"] = chosen["Name"] or ""
        return out
