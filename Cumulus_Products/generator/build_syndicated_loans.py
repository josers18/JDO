"""Cumulus Syndicated Loans — commercial segment."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from reportlab.lib.units import inch
from reportlab.platypus import KeepTogether, Paragraph, Spacer

import brand as B

OUT_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "06_Business_Loans"
))
os.makedirs(OUT_DIR, exist_ok=True)
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Syndicated_Loans.pdf")


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Syndicated Loans",
        product_code="BL-SYN-2026.04",
        category="Commercial Lending",
        segment="commercial",
    )

    story = []

    # COVER
    story += B.hero_block(
        product_name="Syndicated Loans",
        lede=("Large-ticket, multi-lender credit facilities arranged and "
              "administered by Cumulus for leveraged buyouts, "
              "recapitalizations, large acquisitions, and project "
              "finance — with the Bank serving as Administrative Agent, "
              "Lead Arranger, or participant."),
        summary_rows=[
            ("Roles", "Administrative Agent  ·  Lead Arranger  ·  Participant"),
            ("Deal size", "$25,000,000 – $500,000,000+"),
            ("Pricing", "Term SOFR + 2.25% to + 5.75%"),
            ("Structure", "Revolver  ·  Term Loan A (amortizing)  ·  Term Loan B (bullet)"),
            ("Typical maturities", "5 yrs (TLA / RC)  ·  7 yrs (TLB)"),
            ("Use of proceeds", "LBOs, recaps, acquisitions, dividend recaps, project finance"),
            ("Documentation", "LSTA-based credit agreement with institutional covenants"),
            ("Ancillary services", "Treasury, hedging, capital markets, M&A advisory"),
        ],
        category_label="PRODUCT BROCHURE  ·  COMMERCIAL LENDING",
    )
    story += B.switch_to_body()

    # OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "A syndicated credit facility is a large loan funded jointly by a "
        "group (or 'syndicate') of institutional lenders under a single "
        "credit agreement administered by one lender — the Administrative "
        "Agent. Syndicated facilities allow borrowers to raise amounts "
        "well beyond what any single bank can comfortably underwrite, "
        "while giving lenders the diversification of a participation "
        "interest rather than a bilateral exposure. Cumulus participates "
        "in the syndicated market as Administrative Agent, Lead Arranger, "
        "Bookrunner, and Syndicate Participant across leveraged finance, "
        "investment-grade, project finance, and sponsor-driven "
        "transactions."
    ))

    # ROLES
    story.append(B.section_header("Cumulus in the syndicated market",
                                  kicker="Our roles"))
    story.append(B.feature_grid([
        ("Administrative Agent",
         "Cumulus administers the credit facility on behalf of the "
         "syndicate: manages funding, interest accrual, amendments, "
         "waivers, and default remedies. Single point of contact for "
         "the borrower."),
        ("Lead Arranger / Bookrunner",
         "Structures the facility, prepares the Confidential Information "
         "Memorandum (CIM), runs the bank meeting, and books syndication "
         "commitments into the final syndicate."),
        ("Joint Lead / Co-Arranger",
         "Assists in structuring and underwriting alongside another "
         "institution; frequently shares the book-running responsibility "
         "on larger facilities."),
        ("Participant / Syndicate Member",
         "Holds a participation interest in a credit arranged by another "
         "institution. Cumulus evaluates participations under its own "
         "credit standards and holds an allocation sized to relationship "
         "and facility economics."),
        ("Sustainability Structuring Agent",
         "For sustainability-linked loans (SLLs), Cumulus designs the KPI "
         "framework, pricing-adjustment schedule, and third-party "
         "verification protocol."),
        ("Hedging Coordinator",
         "Cumulus Capital Markets coordinates interest-rate swaps, caps, "
         "and collars under the facility's ISDA and security-sharing "
         "framework."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # STRUCTURE
    story.append(B.section_header("Structure and pricing",
                                  kicker="Facility architecture"))
    story.append(B.body_para(
        "Syndicated deals are typically structured in multiple tranches "
        "to match the borrower's capital needs and investor appetite. "
        "Revolving credit and Term Loan A are bank-market products; Term "
        "Loan B is an institutional-market product typically purchased "
        "by CLOs, mutual funds, and private credit funds."
    ))
    story.append(B.data_table(
        header=["Tranche", "Structure",
                "Typical pricing", "Typical tenor", "Investor"],
        rows=[
            ["Revolving Credit Facility (RCF)",
             "Multi-draw revolver; LC sub-facility typical",
             "Term SOFR + 2.25% – 3.50%",
             "5 yrs",
             "Bank market"],
            ["Term Loan A (TLA)",
             "Amortizing term loan (typ. 1% / yr with balloon)",
             "Term SOFR + 2.25% – 3.75%",
             "5 yrs",
             "Bank market"],
            ["Term Loan B (TLB)",
             "Bullet or de minimis amortizing (1% / yr) institutional",
             "Term SOFR + 3.50% – 5.75%",
             "7 yrs",
             "Institutional (CLOs, funds)"],
            ["Delayed-Draw Term Loan (DDTL)",
             "Committed draw availability for pre-identified uses (M&A, capex)",
             "Ticking fee 0.50% – 1.00%; drawn = TLA or TLB grid",
             "Availability 18–24 mo; matched to TL maturity",
             "Matched to TL"],
            ["Second-lien / Unitranche",
             "Junior secured; unitranche combines 1st + 2nd economics",
             "Term SOFR + 5.50% – 8.00% (2nd lien)",
             "7–8 yrs",
             "Private credit, BDCs"],
            ["Incremental facility (accordion)",
             "Pre-negotiated capacity for future TL or RC additions",
             "Grid-based, subject to 'Most-Favored-Nations' (MFN)",
             "Uncommitted — priced at draw",
             "Bank / institutional"],
        ],
        col_widths=[1.5 * inch, 1.6 * inch, 1.3 * inch, 1.4 * inch, 1.4 * inch],
    ))

    # DOCUMENTATION
    story.append(B.section_header("Documentation architecture",
                                  kicker="Credit agreement and related docs"))
    story.append(B.data_table(
        header=["Document", "Purpose"],
        rows=[
            ["Credit Agreement",
             "Principal loan document. Defines tranches, pricing, "
             "mechanics, covenants, events of default, voting thresholds, "
             "and agent duties. Drafted on LSTA-compliant templates."],
            ["Intercreditor Agreement",
             "Governs priority and standstill among first-lien, "
             "second-lien, and subordinated creditors. Controls enforcement, "
             "payment waterfall, and bankruptcy rights."],
            ["Guarantee and Collateral Agreement",
             "Cross-guarantee among material subsidiaries; grants of "
             "security interests in assets; mortgage / deed-of-trust "
             "attachments for real estate."],
            ["Fee Letter(s)",
             "Confidential arrangement fees, underwriting fees, "
             "flex-pricing provisions, and market-flex mechanics."],
            ["Confidential Information Memorandum (CIM)",
             "Marketing document used for syndication. Includes business "
             "description, historical and projected financials, industry "
             "analysis, and term-sheet summary."],
            ["Commitment Letter (pre-close)",
             "Committed financing letter issued by Arranger(s) to borrower "
             "pending syndication; usually accompanied by highly-confident "
             "or market-flex provisions."],
            ["Assignment and Assumption",
             "Governs lender-to-lender secondary trading post-close."],
        ],
        col_widths=[2.1 * inch, 5.2 * inch],
    ))

    # ADVANCE RATE / STRUCTURE COMPARISON
    story.append(B.section_header("Pricing comparison by structure",
                                  kicker="Market benchmarks"))
    story.append(B.body_para(
        "The chart below compares illustrative margins across tranches "
        "for a mid-market sponsor-backed credit. Actual margins vary by "
        "rating, leverage, sponsor reputation, and market conditions at "
        "the time of launch."
    ))
    story.append(B.bar_comparison_chart(
        labels=["RCF / TLA", "TLB", "DDTL (ticking)",
                "2nd lien", "Unitranche"],
        values=[3.00, 4.75, 0.75, 7.00, 6.25],
        title="Illustrative SOFR margins by tranche (mid-market sponsor credit)",
        ylabel="Margin over SOFR (%)",
        value_fmt=lambda v: f"+{v:.2f}%",
    ))

    # PROCESS
    story.append(B.section_header("Syndication process",
                                  kicker="How it works"))
    story.append(B.data_table(
        header=["Phase", "Activities", "Timing"],
        rows=[
            ["1  ·  Mandate",
             "Borrower selects Arranger(s); mandate letter, fee letter, "
             "and commitment letter negotiated. Arranger conducts initial "
             "diligence and risk grading.",
             "Weeks 1–3"],
            ["2  ·  Structuring",
             "Term sheet finalized. Tranche sizing, pricing grid, covenant "
             "package, and collateral perfection plan agreed. Rating "
             "engagement (where applicable).",
             "Weeks 3–6"],
            ["3  ·  CIM and bank meeting",
             "Confidential Information Memorandum prepared; bank meeting "
             "or institutional roadshow held; orders collected via agent "
             "bank syndication platform.",
             "Weeks 6–8"],
            ["4  ·  Allocation and flex",
             "Commitments allocated to syndicate. Market-flex provisions "
             "exercised if demand is below expectation (pricing, covenants, "
             "or OID adjustments).",
             "Week 8"],
            ["5  ·  Documentation and close",
             "Credit agreement, guarantee/collateral, intercreditor, and "
             "ancillary documents negotiated and executed. Funding date "
             "coordinated with underlying transaction (M&A / refi).",
             "Weeks 8–12"],
            ["6  ·  Administration",
             "Cumulus (as Agent) administers interest, amendments, "
             "compliance, and distributions for the life of the facility. "
             "Secondary trading enabled post-close.",
             "Life of facility"],
        ],
        col_widths=[1.3 * inch, 4.5 * inch, 1.5 * inch],
    ))

    # USES
    story.append(B.section_header("Use cases",
                                  kicker="When syndication is appropriate"))
    story += B.bullet_list([
        "<b>Leveraged buyouts (LBOs)</b> — sponsor acquisition financing with "
        "a blend of TLA/TLB and RCF sized to acquisition enterprise value.",
        "<b>Recapitalizations and dividend recaps</b> — refinancing existing "
        "capital structure and/or returning capital to equity sponsors.",
        "<b>Strategic acquisitions</b> — DDTL committed acquisition capacity "
        "for strategic buyers in consolidation sectors.",
        "<b>Project finance</b> — ring-fenced SPV financing for "
        "infrastructure, energy, and real-estate projects, with "
        "construction-to-term financing and completion guarantees.",
        "<b>Refinancing maturing facilities</b> — refinancing existing "
        "bilateral or syndicated debt to extend tenor, upsize capacity, or "
        "reprice.",
        "<b>Sustainability-linked loans (SLLs)</b> — pricing-adjustment loans "
        "tied to independently-verified sustainability KPIs.",
    ])

    # COVENANTS
    story.append(B.section_header("Covenant architecture",
                                  kicker="Compliance framework"))
    story.append(B.data_table(
        header=["Covenant type", "Bank-market (RCF / TLA)",
                "Institutional (TLB) — covenant-lite"],
        rows=[
            ["Financial maintenance",
             "Net leverage ≤ 4.50x – 6.00x stepping down; fixed-charge or "
             "interest coverage ≥ 2.00x",
             "None (covenant-lite); springing revolver covenant only"],
            ["Incurrence tests",
             "Pro-forma leverage / ratio for new debt, investments, "
             "distributions",
             "Same pro-forma tests; typically with larger baskets and "
             "ratio-based builders"],
            ["Restricted payments",
             "Basket + ratio tests for dividends, buybacks, junior debt "
             "prepayment",
             "Larger baskets; 'builder basket' accumulating 50% of Consolidated Net Income"],
            ["Reporting",
             "Quarterly financials (45 days), annual audited (90 days), "
             "compliance certificate each quarter",
             "Same cadence; institutional investors receive via agent"],
            ["Excess cash-flow sweep",
             "Annual sweep at declining percentages (75/50/25%) stepping "
             "with leverage",
             "Similar framework; may be soft-called by 101 soft-call"],
            ["Lender voting",
             "Required lenders (50.1%) for amendments; unanimous for "
             "sacred rights (principal, interest, pro rata)",
             "Same structure; subset of sacred rights including maturity, "
             "rate, release of collateral"],
        ],
        col_widths=[1.9 * inch, 2.7 * inch, 2.7 * inch],
    ))

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Do I need a rating to access the syndicated market?",
         "Not strictly. Bank-market facilities (RCF, TLA) are regularly "
         "closed on unrated credits, particularly for investment-grade-"
         "equivalent or sponsor-backed borrowers. A public rating (Moody's "
         "and S&P) is effectively required for TLB execution and expands "
         "the investor base materially for large deals."),
        ("What is 'market flex'?",
         "Market flex is the Arranger's right under the fee letter to "
         "adjust pricing, original issue discount (OID), or select covenants "
         "within a defined range if syndication demand is insufficient at "
         "launch terms. Flex is exercised in consultation with the borrower."),
        ("How does the Administrative Agent differ from the Arranger?",
         "The Arranger structures the deal and syndicates it to investors; "
         "the Agent administers the facility post-close. In most deals "
         "Cumulus serves as both — providing continuity from structuring "
         "through life of the loan."),
        ("What are 'sacred rights' in the voting framework?",
         "Sacred rights are matters that require unanimous lender consent "
         "(or affected-lender consent) to amend — typically: principal "
         "amount, interest rate, scheduled maturity, release of all or "
         "substantially all collateral, pro-rata sharing, and the "
         "definition of 'Required Lenders' itself."),
        ("Can I refinance or reprice later?",
         "Yes. Repricings are common in favorable credit markets and "
         "typically require a 'soft-call' payment (101% of par) if they "
         "occur within the first 6–12 months post-closing. Full refinancing "
         "to a new facility follows the same process as an original "
         "syndication."),
        ("Can Cumulus hedge my rate exposure within the facility?",
         "Yes. Cumulus Capital Markets offers interest-rate swaps, caps, "
         "and collars coordinated with the facility's ISDA and security-"
         "sharing framework. Hedges settle on the same benchmark (Term "
         "SOFR) as the underlying loan."),
    ]
    for q, a in faqs:
        story.append(KeepTogether([
            Paragraph(f"<b>{q}</b>", B.STYLES["Callout"]),
            Paragraph(a, B.STYLES["Body"]),
            Spacer(1, 0.06 * inch),
        ]))

    # DISCLOSURES
    story += B.disclosure_block(
        "Important disclosures",
        B.STANDARD_LENDING_DISCLOSURES + [
            "Syndicated facilities are documented on Loan Syndications and "
            "Trading Association (LSTA)-based forms, modified as "
            "appropriate for specific transactions. Definitive terms are "
            "set forth in the final Credit Agreement, which controls in "
            "the event of any conflict with this brochure.",
            "Cumulus may act as Administrative Agent, Arranger, "
            "Bookrunner, or Participant in any given transaction. "
            "Potential conflicts of interest among these roles are "
            "addressed in the Credit Agreement and customary agent-bank "
            "provisions. Cumulus does not owe fiduciary duties to any "
            "lender or the borrower solely by virtue of its role as Agent.",
            "Information provided in a Confidential Information Memorandum "
            "(CIM) is prepared in consultation with the borrower and is "
            "circulated to potential syndicate members under a "
            "confidentiality agreement. Investors are expected to "
            "independently evaluate each credit.",
            "Rating agency engagements and sustainability-linked KPI "
            "verification are arranged through independent third-party "
            "providers selected by the borrower. Cumulus does not "
            "guarantee, and is not responsible for, the conclusions of "
            "those providers.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
