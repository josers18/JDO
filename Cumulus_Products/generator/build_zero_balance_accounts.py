"""Cumulus Zero Balance Accounts — commercial segment."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from reportlab.lib.units import inch
from reportlab.platypus import KeepTogether, Paragraph, Spacer

import brand as B

OUT_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "08_Treasury_Management"
))
os.makedirs(OUT_DIR, exist_ok=True)
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Zero_Balance_Accounts.pdf")

TREASURY_DISCLOSURES = [
    "Zero Balance Account (ZBA) Services are provided by Cumulus Bank, "
    "N.A. under the Treasury Services Master Agreement and applicable "
    "service schedule. ZBA is an operating deposit structure; all "
    "sub-accounts are demand-deposit accounts held at Cumulus Bank.",
    "FDIC insurance at $250,000 per depositor per insured institution "
    "per account ownership category applies to the aggregate balance "
    "across related ZBA master and sub-accounts held by the same "
    "depositor in the same ownership capacity — not to each "
    "sub-account individually.",
    "Inter-account transfers between ZBA master and sub-accounts are "
    "bookkeeping adjustments and do not constitute reportable "
    "transactions under 31 C.F.R. Part 1010 or Regulation D.",
    "Overdraft at the sub-account level is covered by the master "
    "account; persistent overdraft at the master account triggers "
    "overdraft fees, sweep from a linked line-of-credit, or return "
    "of items per the client's service schedule.",
]


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Zero Balance Accounts",
        product_code="TM-ZBA-2026.04",
        category="Treasury Management",
        segment="commercial",
    )

    story = []

    story += B.hero_block(
        product_name="Zero Balance Accounts",
        lede=("Master-and-sub-account structure that concentrates all "
              "cash in a single master each night — ideal for divisional "
              "accounting, payroll segregation, franchise operations, "
              "and multi-entity organizations."),
        summary_rows=[
            ("Structure", "One master + 1-1,000+ zero-balancing sub-accounts"),
            ("Sub-account cost", "$25 / month per sub-account"),
            ("Master account", "Cumulus Business Analyzed Checking (required)"),
            ("Zero-out timing", "End of each business day"),
            ("Uses", "Divisional  ·  payroll  ·  franchise  ·  escrow  ·  reserve"),
            ("Transfer mechanism", "Internal bookkeeping; no ACH / wire"),
            ("Reporting", "Per-sub-account detail + master-roll-up"),
            ("Integration", "Sweep, lockbox, Positive Pay, ERP"),
        ],
        category_label="PRODUCT BROCHURE  ·  TREASURY MANAGEMENT",
    )
    story += B.switch_to_body()

    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "A Zero Balance Account (ZBA) structure links multiple "
        "sub-accounts — one per division, location, payroll group, or "
        "entity — to a single master operating account. Each sub-account "
        "is funded as needed during the business day to support its own "
        "activity (checks issued, ACH credits, card settlements). At "
        "end-of-day, Cumulus zeroes each sub-account: sub-account "
        "positive balances transfer to the master; sub-account debit "
        "balances (overdrafts) fund from the master. The master then "
        "holds the entire organization's cash, available for sweep into "
        "overnight investments. ZBA produces operational clarity "
        "(divisional-level accounting with separate check stock, "
        "ACH routing, and reporting) without the working-capital cost "
        "of keeping material cash balances in each sub-account."
    ))

    story.append(B.section_header("Key benefits",
                                  kicker="Why ZBA"))
    story.append(B.feature_grid([
        ("Single cash pool",
         "Concentrate all operating cash in the master at end-of-day — "
         "maximize invested balance for sweep and simplify liquidity "
         "management."),
        ("Divisional / entity clarity",
         "Each sub-account carries its own account number, check stock, "
         "ACH routing, and reporting — enabling divisional accounting "
         "without separate legal entities."),
        ("Payroll segregation",
         "Dedicated payroll sub-account: ACH payroll debits post "
         "only against the payroll sub-account, isolating payroll risk "
         "and supporting FLSA / payroll-tax audit requirements."),
        ("Franchise operations",
         "Sub-accounts for individual franchise locations; royalty and "
         "fee collections automated; central master consolidates cash."),
        ("Simplified reconciliation",
         "Each sub-account reconciles to its own activity; master "
         "balance equals sum of daily transfers; eliminates inter-"
         "company wash-entry complexity."),
        ("Extends all treasury services",
         "Sub-accounts can use Positive Pay, RDC, card acceptance, ACH "
         "origination, and lockbox just like standalone accounts — all "
         "feeding back to the concentrated master."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # COMMON STRUCTURES
    story.append(B.section_header("Common ZBA structures",
                                  kicker="Use cases"))
    story.append(B.data_table(
        header=["Structure", "Use case", "Typical sub-account count"],
        rows=[
            ["Payroll segregation",
             "Dedicated payroll sub-account; separate bank stock / "
             "routing; separate reconciliation",
             "1–3 (domestic payroll, international payroll, garnishment trust)"],
            ["Divisional accounting",
             "One sub per business unit or division",
             "3–25"],
            ["Franchise / multi-location operations",
             "One sub per franchise or retail location",
             "10–500+"],
            ["Escrow / trust",
             "Client-funds trust accounts (law firms, brokers, property "
             "managers, title companies); required by state trust rules",
             "Variable"],
            ["Reserve / holdback",
             "Contractor retainage, insurance reserve, litigation reserve",
             "1–5"],
            ["Disbursement control",
             "Separate AP disbursement sub-account; fraud-attempt "
             "exposure contained to operating balance only",
             "1"],
            ["Multi-entity",
             "Each legal entity has its own sub (must be documented "
             "separately for tax / FDIC purposes)",
             "Variable (subject to legal separation)"],
        ],
        col_widths=[1.9 * inch, 3.6 * inch, 1.8 * inch],
    ))

    # PRICING
    story.append(B.section_header("Pricing",
                                  kicker="Service fees"))
    story.append(B.data_table(
        header=["Component", "Amount", "Notes"],
        rows=[
            ["Master account",
             "Cumulus Business Analyzed Checking pricing",
             "Required foundation; ECR offsets sub-account fees"],
            ["Per sub-account",
             "$25 / month per sub-account",
             "Charged against master's analysis statement"],
            ["Per-item pricing (sub-accounts)",
             "Same as Analyzed Checking",
             "Itemized in master analysis"],
            ["ZBA setup (per sub-account)",
             "$50 one-time",
             "Includes account opening, routing, and checks ordering"],
            ["Volume tier — 50+ sub-accounts",
             "$20 / month per sub-account",
             "Automatic discount"],
            ["Volume tier — 200+ sub-accounts",
             "$15 / month per sub-account",
             "Automatic discount"],
            ["Volume tier — 500+ sub-accounts",
             "Negotiated", "Enterprise relationship"],
        ],
        col_widths=[2.6 * inch, 2.3 * inch, 2.4 * inch],
    ))

    # COST CHART
    story.append(B.section_header("Cost comparison vs. separate accounts",
                                  kicker="Structural economics"))
    story.append(B.body_para(
        "The chart below compares ZBA sub-account cost versus "
        "maintaining separately-operating commercial checking accounts "
        "for a 50-location franchise operator. Beyond direct fee "
        "differential, ZBA unlocks earnings-credit optimization on the "
        "concentrated master and eliminates idle balances across "
        "locations."
    ))
    story.append(B.bar_comparison_chart(
        labels=["ZBA (50 subs)", "ZBA (200 subs)",
                "Separate acct (50)", "Separate acct (200)"],
        values=[1000, 3000, 1750, 7000],
        title="Monthly treasury fees — ZBA vs. separate accounts",
        ylabel="Monthly fees (USD)",
        value_fmt=lambda v: f"${v:,.0f}",
    ))

    # MECHANICS
    story.append(B.section_header("How ZBA operates",
                                  kicker="Daily cycle"))
    story.append(B.data_table(
        header=["Time (ET)", "Activity"],
        rows=[
            ["Continuous",
             "Sub-accounts post transactions: check paid, ACH debit, "
             "ACH credit, wire in / out, deposits. Sub-balance may "
             "fluctuate above or below zero intraday."],
            ["5:30 p.m.",
             "End-of-day balance on each sub-account determined."],
            ["5:35 p.m.",
             "Sub-account positive balances transfer to master; "
             "sub-account negative balances (overdrafts) funded from "
             "master. All sub-accounts reset to $0."],
            ["5:40 p.m.",
             "Master balance reflects consolidated cash across the "
             "organization."],
            ["5:45 p.m.",
             "Optional: sweep evaluates master for above-target cash "
             "and invests accordingly (see Sweep Account Services)."],
            ["Next business day",
             "Sub-accounts open at $0; activity resumes; funding from "
             "master occurs as transactions hit the sub."],
            ["Monthly",
             "Analysis statement reflects all sub-account fees and "
             "activity rolled up to the master."],
        ],
        col_widths=[1.8 * inch, 5.5 * inch],
    ))

    # CONTROLS / INTEGRATIONS
    story.append(B.section_header("Controls and integrations",
                                  kicker="Operational rigor"))
    story += B.bullet_list([
        "<b>Per-sub-account entitlements</b> — authorized signers, "
        "limits, and online-banking access set per sub-account. "
        "Division managers see only their sub-account.",
        "<b>Positive Pay on each sub-account</b> — Check Positive Pay "
        "and ACH Positive Pay operate at sub-account level with "
        "consolidated daily exception dashboard at master level.",
        "<b>ERP integration</b> — each sub-account reports separately "
        "to ERP; intercompany eliminations handled at ERP level, not "
        "at Cumulus.",
        "<b>Sweep compatibility</b> — the master account is the sweep "
        "source; sub-accounts cannot sweep individually but contribute "
        "to master's sweep.",
        "<b>Lockbox</b> — incoming remittance to a specific lockbox "
        "can deposit directly to a specified sub-account (for divisional "
        "AR segregation), then ZBA concentrates to master overnight.",
        "<b>Reporting rollup</b> — single consolidated report across "
        "all sub-accounts, with drill-down to any sub-account level.",
    ])

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("How does ZBA differ from sweep?",
         "ZBA concentrates cash across multiple operating accounts into "
         "a single master daily — it moves cash between Cumulus DDAs, "
         "not into investments. Sweep then invests above-target cash "
         "in the concentrated master into overnight investment vehicles. "
         "ZBA and sweep are complementary, not alternatives — ZBA "
         "prepares the pool; sweep invests it."),
        ("Can sub-accounts have different ownership?",
         "ZBA is designed for accounts held by the same legal entity "
         "in the same ownership capacity. Multi-entity ZBA structures "
         "are possible but require separate legal and FDIC insurance "
         "considerations; the Cumulus Treasury Legal team reviews each "
         "arrangement for ownership documentation and appropriate "
         "agreements between entities."),
        ("What happens if a sub-account overdraws?",
         "Intraday negative balances are normal — the sub is funded "
         "from the master at end-of-day. Persistent master overdraft "
         "(the entire relationship is negative after ZBA concentration) "
         "is treated as any overdraft: covered by a linked line of "
         "credit (preferred structure), paid with overdraft fees, or "
         "items returned per the service schedule."),
        ("Can I have separate authorized signers per sub-account?",
         "Yes. Each sub-account is a separate DDA and may have its "
         "own authorized-signer card and online-banking entitlements. "
         "This is foundational to the payroll-segregation, divisional, "
         "and franchise use cases where operational separation is the "
         "core value proposition."),
        ("What's the FDIC implication of ZBA?",
         "FDIC insurance ($250,000 per depositor, per insured "
         "institution, per ownership category) applies at the depositor "
         "level across all Cumulus deposits — ZBA does not increase or "
         "decrease FDIC coverage. Amounts above $250,000 may be "
         "protected via ICS (Insured Cash Sweep), CDARS, or sweep to "
         "Treasury-secured repo."),
        ("How are taxes and reporting handled?",
         "The master account is the reporting unit for all interest "
         "(if interest-bearing) and for IRS Form 1099-INT. Sub-account "
         "transfers are internal bookkeeping, not reportable. Each "
         "sub-account produces its own statement for internal "
         "reporting, but tax reporting consolidates at master."),
    ]
    for q, a in faqs:
        story.append(KeepTogether([
            Paragraph(f"<b>{q}</b>", B.STYLES["Callout"]),
            Paragraph(a, B.STYLES["Body"]),
            Spacer(1, 0.06 * inch),
        ]))

    story += B.disclosure_block("Important disclosures", TREASURY_DISCLOSURES)
    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
