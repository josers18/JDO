"""Wave dependency definitions.

Single source of truth for which sObjects load in which wave and what
each wave depends on. Used by both the loader (forward order) and the
reset path (reverse order).

Wave A: Account
Wave B: Contact
Wave C: AccountContactRelation
Wave D: FA, Card, Goal, LifeEvent, Campaign, Opportunity (parallel-safe)
Wave E: FA Role, Holding, Case, Task, Event, CampaignMember
        (parallel-safe; depend on D)

Plan 4 will extend with Wave F + G for native FSC mirrors.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Wave:
    """One wave in the load pipeline.

    Attributes:
        name: Single-letter wave identifier (e.g. "A", "B", ..., "E").
        sobjects: Tuple of sObject API names that load in this wave.
        depends_on: Tuple of wave names that must finish before this wave starts.
        parallel: True if the sobjects in this wave can load concurrently.
        description: Human-readable summary surfaced in logs/manifests.
    """

    name: str
    sobjects: tuple[str, ...]
    depends_on: tuple[str, ...]
    parallel: bool
    description: str


WAVE_DEFS: dict[str, Wave] = {
    "A": Wave(
        name="A",
        sobjects=("Account",),
        depends_on=(),
        parallel=False,  # only one sobject anyway
        description="Account (Person + Business + Household + Trust RTs in one CSV)",
    ),
    "B": Wave(
        name="B",
        sobjects=("Contact",),
        depends_on=("A",),
        parallel=False,
        description="Contact (business officers/signers)",
    ),
    "C": Wave(
        name="C",
        sobjects=("AccountContactRelation",),
        depends_on=("A", "B"),
        parallel=False,
        description="AccountContactRelation (household members + business signers)",
    ),
    "D": Wave(
        name="D",
        sobjects=(
            "FinServ__FinancialAccount__c",
            "FinServ__Card__c",
            "FinServ__FinancialGoal__c",
            "FinServ__LifeEvent__c",
            "Campaign",
            "Opportunity",
        ),
        depends_on=("A", "B"),
        parallel=True,
        description="FA, Card, Goal, LifeEvent, Campaign, Opportunity (parallel-safe)",
    ),
    "E": Wave(
        name="E",
        sobjects=(
            "FinServ__FinancialAccountRole__c",
            "FinServ__FinancialHolding__c",
            "Case",
            "Task",
            "Event",
            "CampaignMember",
        ),
        depends_on=("A", "B", "C", "D"),
        parallel=True,
        description="FA Role, Holding, Case, Task, Event, CampaignMember (depend on D)",
    ),
}


def waves_in_forward_order() -> list[Wave]:
    """Return waves topologically sorted (A -> B -> C -> D -> E).

    Insertion order in WAVE_DEFS already reflects topological order, so we
    just return its values as a list.
    """
    return list(WAVE_DEFS.values())


def waves_in_reverse_order() -> list[Wave]:
    """Return waves in reverse topological order for reset (E -> D -> C -> B -> A)."""
    return list(reversed(WAVE_DEFS.values()))


def sobject_to_wave(sobject: str) -> Wave | None:
    """Find which wave owns a given sObject.

    Args:
        sobject: sObject API name (e.g. "Account", "FinServ__FinancialAccount__c").

    Returns:
        The owning Wave, or None if the sobject is not registered in any wave.
    """
    for wave in WAVE_DEFS.values():
        if sobject in wave.sobjects:
            return wave
    return None
