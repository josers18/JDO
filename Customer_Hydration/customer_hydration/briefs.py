"""Plan 6 Task 1 — banker brief generator.

Queries the live org for one banker's portfolio, then renders a Markdown
brief via Python f-strings. No new dependencies: deliberately avoiding
Jinja2 since f-strings cover this layout.

Public API:
    - BankerBrief (dataclass) — holds rendered content + summary row
    - generate_brief(runner, slug, banker) — query + render for one RM
    - generate_index(summary_rows) — render the BANKER_BRIEFS.md index page

Briefs include real SOQL data, not generated placeholder content. They are
regenerated after every hydration via `python hydrate.py briefs`.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from customer_hydration.sf_runner import SfRunner


@dataclass
class BankerBrief:
    """Per-banker brief content + summary row."""

    slug: str
    user_id: str
    name: str
    title: str
    role_family: str
    seniority: str
    persona_description: str
    demo_angle: str
    portfolio: dict
    sample_customers: list
    markdown: str
    summary_row: tuple


def generate_brief(
    *,
    runner: SfRunner,
    slug: str,
    banker: dict,
) -> BankerBrief:
    """Query org for banker's portfolio + render Markdown brief.

    Aggregations use SOQL aggregate functions (COUNT(Id), SUM(Amount)) so
    the SfRunner.query() helper returns one row of named columns. COUNT()
    without a field would return totalSize on the result envelope, which
    SfRunner doesn't expose — so COUNT(Id) is the friendlier shape here.
    """
    user_id = banker["user_id"]
    name = banker["name"]
    title = banker.get("title", "")
    role_family = banker.get("role_family", "")
    seniority = banker.get("seniority", "")

    # Total customers
    total_rows = runner.query(
        f"SELECT COUNT(Id) c FROM Account WHERE OwnerId='{user_id}' "
        f"AND External_ID__c LIKE 'HYDRATE-%'"
    )
    total_customers = int(total_rows[0].get("c", 0)) if total_rows else 0

    # Persona mix
    persona_rows = runner.query(
        f"SELECT FinServ__ClientCategory__c cat, COUNT(Id) c "
        f"FROM Account WHERE OwnerId='{user_id}' "
        f"AND External_ID__c LIKE 'HYDRATE-%' "
        f"GROUP BY FinServ__ClientCategory__c"
    )
    persona_mix = {
        (row.get("cat") or "Other"): int(row.get("c", 0)) for row in persona_rows
    }

    # Open opportunities — count + sum(Amount)
    opp_rows = runner.query(
        f"SELECT COUNT(Id) c, SUM(Amount) total "
        f"FROM Opportunity WHERE OwnerId='{user_id}' "
        f"AND IsClosed=false AND External_ID__c LIKE 'HYDRATE-%'"
    )
    open_opps = int(opp_rows[0].get("c", 0)) if opp_rows else 0
    open_opps_total = float(opp_rows[0].get("total") or 0) if opp_rows else 0.0

    # Open cases
    case_rows = runner.query(
        f"SELECT COUNT(Id) c FROM Case WHERE OwnerId='{user_id}' "
        f"AND IsClosed=false AND External_ID__c LIKE 'HYDRATE-%'"
    )
    open_cases = int(case_rows[0].get("c", 0)) if case_rows else 0

    # Tasks this week — SOQL NEXT_N_DAYS:7
    task_rows = runner.query(
        f"SELECT COUNT(Id) c FROM Task WHERE OwnerId='{user_id}' "
        f"AND ActivityDate = NEXT_N_DAYS:7 "
        f"AND External_ID__c LIKE 'HYDRATE-%'"
    )
    tasks_this_week = int(task_rows[0].get("c", 0)) if task_rows else 0

    # Sample customers — wealth bankers see top by AUM, others see most recent
    if role_family == "wealth":
        sample_rows = runner.query(
            f"SELECT Id, Name, FirstName, LastName, External_ID__c, "
            f"FinServ__ClientCategory__c, FinServ__TotalInvestments__c, "
            f"PersonMailingState "
            f"FROM Account WHERE OwnerId='{user_id}' "
            f"AND External_ID__c LIKE 'HYDRATE-%' "
            f"ORDER BY FinServ__TotalInvestments__c DESC NULLS LAST LIMIT 6"
        )
    else:
        sample_rows = runner.query(
            f"SELECT Id, Name, FirstName, LastName, External_ID__c, "
            f"FinServ__ClientCategory__c, PersonMailingState "
            f"FROM Account WHERE OwnerId='{user_id}' "
            f"AND External_ID__c LIKE 'HYDRATE-%' "
            f"ORDER BY CreatedDate DESC LIMIT 6"
        )

    sample_customers = []
    for row in sample_rows:
        full_name = row.get("Name") or (
            f"{row.get('FirstName', '') or ''} "
            f"{row.get('LastName', '') or ''}".strip()
        )
        sample_customers.append({
            "name": full_name,
            "external_id": row.get("External_ID__c"),
            "category": row.get("FinServ__ClientCategory__c") or "",
            "state": row.get("PersonMailingState") or "",
            "total_investments": float(
                row.get("FinServ__TotalInvestments__c") or 0
            ),
        })

    # Persona description + demo angle
    persona_description, demo_angle = _persona_pitch(role_family, seniority)

    # Render Markdown
    markdown = _render_brief(
        name=name,
        title=title,
        user_id=user_id,
        role_family=role_family,
        seniority=seniority,
        persona_description=persona_description,
        demo_angle=demo_angle,
        total_customers=total_customers,
        persona_mix=persona_mix,
        open_opps=open_opps,
        open_opps_total=open_opps_total,
        open_cases=open_cases,
        tasks_this_week=tasks_this_week,
        sample_customers=sample_customers,
    )

    summary_row = (
        slug,
        name,
        title,
        total_customers,
        sum(persona_mix.values()),
        open_opps,
        open_cases,
    )

    return BankerBrief(
        slug=slug,
        user_id=user_id,
        name=name,
        title=title,
        role_family=role_family,
        seniority=seniority,
        persona_description=persona_description,
        demo_angle=demo_angle,
        portfolio={
            "total_customers": total_customers,
            "persona_mix": persona_mix,
            "open_opps": open_opps,
            "open_opps_total": open_opps_total,
            "open_cases": open_cases,
            "tasks_this_week": tasks_this_week,
        },
        sample_customers=sample_customers,
        markdown=markdown,
        summary_row=summary_row,
    )


def _persona_pitch(role_family: str, seniority: str) -> tuple[str, str]:
    """Return (persona_description, demo_angle) from role_family + seniority."""
    if role_family == "wealth" and seniority == "senior":
        return (
            "Senior wealth advisor managing the bank's largest private-client relationships. "
            "Focuses on multi-generational families, complex tax strategy, estate planning, and "
            "alternative investments. Day-to-day work is portfolio reviews, life-event response, "
            "and discretionary asset reallocation.",
            "Wealth advisor's morning review: top 10 clients by AUM, life-event triggers, "
            "upcoming portfolio reviews.",
        )
    if role_family == "wealth" and seniority == "mid":
        return (
            "Wealth advisor handling mid-tier private-client portfolios. Mix of accumulators "
            "and pre-retirees, balancing growth allocation with risk management. Cross-sells "
            "into retail (deposits, mortgages) for the spouse + children.",
            "Mid-tier wealth advisor cockpit: client cohorts by life-stage, cross-sell pipeline.",
        )
    if role_family == "wealth" and seniority == "junior":
        return (
            "Financial advisor associate building a book. Focus on accumulators (45-55), "
            "younger high-earners, and growth-oriented portfolios. Day involves more outbound "
            "calls and prospecting than the senior advisors.",
            "Junior advisor's prospecting day: leads, opportunities, cross-sell handoffs from retail.",
        )
    if role_family == "retail" and seniority == "mid":
        return (
            "Relationship banker managing a large book of mass-market consumer customers. "
            "Day is busy: cards, mobile-banking issues, fee-waiver requests, mortgage refi "
            "inquiries. The dashboard surfaces 'today' tasks, escalated cases, and HELOC offers.",
            "Retail banker dashboard: today's tasks, escalated cases, this week's pipeline, "
            "fee waivers.",
        )
    if role_family == "commercial" and seniority == "senior":
        return (
            "Commercial RM owning the mid-market book — manufacturing, logistics, real-estate "
            "holdings, mid-market professional services. Day is annual credit reviews, "
            "treasury optimization meetings, swap covenant renewals, and deal pipeline tracking.",
            "Commercial banker pipeline review: deal stages, annual credit reviews, treasury "
            "services adoption.",
        )
    return (
        f"{role_family.title() or 'Banker'} managing a {seniority or 'standard'} book.",
        f"{role_family.title() or 'Banker'} dashboard: portfolio overview.",
    )


def _render_brief(
    *,
    name: str,
    title: str,
    user_id: str,
    role_family: str,
    seniority: str,
    persona_description: str,
    demo_angle: str,
    total_customers: int,
    persona_mix: dict,
    open_opps: int,
    open_opps_total: float,
    open_cases: int,
    tasks_this_week: int,
    sample_customers: list,
) -> str:
    """Render the brief as Markdown using f-strings."""
    persona_mix_line = " · ".join(
        f"{cat} {count}"
        for cat, count in sorted(persona_mix.items(), key=lambda kv: -kv[1])
    ) or "(none)"

    customer_lines = []
    for c in sample_customers:
        line = (
            f"- **{c['name']} ({c['external_id']})** — "
            f"{c['category']}, {c['state']}"
        )
        if c.get("total_investments"):
            line += f", AUM ${int(c['total_investments']):,}"
        line += "."
        customer_lines.append(line)
    customers_block = "\n".join(customer_lines) or "_(no customers loaded yet)_"

    persona_first_sentence = persona_description.split(".")[0].strip()
    primary_persona = (
        persona_mix_line.split("·")[0].strip() if persona_mix else "category"
    )
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    return f"""# {name} — {title}

**Org user:** {user_id} · **Role family:** {role_family} · **Seniority:** {seniority}

**Persona:** {persona_first_sentence}.
**Demo angle:** {demo_angle}

## Portfolio at a glance

| | |
|---|---|
| Total customers | {total_customers:,} |
| Persona mix | {persona_mix_line} |
| Open opportunities | {open_opps:,} (${int(open_opps_total):,}) |
| Open cases | {open_cases:,} |
| Tasks this week | {tasks_this_week:,} |

## Persona description

{persona_description}

## What demo dashboards should show for this banker

- {demo_angle}
- Portfolio composition view: customers grouped by {primary_persona}
- Activity feed: open opportunities, open cases, tasks-this-week as the headline metrics

## Sample customers

{customers_block}

## How this brief was generated

Generated by `Customer_Hydration/hydrate.py briefs` on {timestamp}.
Re-run after any hydration to regenerate from current org state.
"""


def generate_index(summary_rows: list) -> str:
    """Render the BANKER_BRIEFS.md index page from a list of summary rows."""
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    rows_md = "\n".join(
        f"| [{name}](briefs/{slug.replace('_', '-')}.md) | {title} | "
        f"{total:,} | {persona_total:,} | {opps:,} | {cases:,} |"
        for slug, name, title, total, persona_total, opps, cases in summary_rows
    )
    return f"""# Banker briefs

One-page profiles for each role-aligned banker in the JDO demo org.
Generated by `python hydrate.py briefs --target-org jdo-fw51xz` on {timestamp}.

| Banker | Title | Total customers | Persona total | Open opps | Open cases |
|---|---|---:|---:|---:|---:|
{rows_md}

To regenerate after a hydration:

```bash
python hydrate.py briefs --target-org jdo-fw51xz --output ../docs/briefs/
```
"""
