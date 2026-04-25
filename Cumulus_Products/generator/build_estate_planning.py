"""Cumulus Estate Planning — wealth segment / estate services."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from reportlab.lib.units import inch
from reportlab.platypus import KeepTogether, Paragraph, Spacer

import brand as B

OUT_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "04_Investments"
))
os.makedirs(OUT_DIR, exist_ok=True)
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Estate_Planning.pdf")


def build():
    B.set_theme("wealth")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Estate Planning",
        product_code="WM-EST-PLN-2026.04",
        category="Wealth Management  ·  Estate Services",
        segment="wealth",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Estate Planning",
        lede=("An advisory engagement to draft and coordinate the core legal "
              "documents that govern the orderly transfer of wealth, the "
              "management of incapacity, and the expression of healthcare "
              "wishes — executed by licensed attorneys."),
        summary_rows=[
            ("Service type", "Attorney-drafted estate planning documents"),
            ("Core deliverables", "Will  ·  Revocable trust  ·  POA  ·  Healthcare directive"),
            ("Fee", "Flat $1,500 – $5,000 depending on complexity"),
            ("Complimentary threshold", "Managed Advisory clients with $2M+ relationship"),
            ("Typical timeline", "30 – 60 days from engagement to execution"),
            ("Coordinated with", "Your Cumulus advisor, tax professional, attorney"),
            ("Fiduciary services", "Corporate trustee available through affiliate"),
            ("Regulatory framework", "State probate code, UTC, UPIA, HIPAA"),
        ],
        category_label="PRODUCT BROCHURE  ·  ESTATE SERVICES",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus Estate Planning is an advisory engagement in which licensed "
        "attorneys, coordinating with your Cumulus advisor and tax "
        "professional, draft the core documents that govern the disposition "
        "of your assets at death, the management of your affairs during any "
        "period of incapacity, and the expression of your wishes regarding "
        "healthcare and end-of-life decisions. The engagement is document-"
        "drafting in nature; Cumulus acts in a fiduciary capacity only where "
        "separately retained as trustee, co-trustee, or successor trustee."
    ))
    story.append(B.body_para(
        "Investment products are not FDIC insured, not bank guaranteed, and "
        "may lose value. Any assets subsequently held in investment accounts "
        "titled to your trust remain subject to market risk."
    ))

    # --------------------------------------------------------------- CORE DOCS
    story.append(B.section_header("The core documents",
                                  kicker="What your plan will include"))
    story.append(B.feature_grid([
        ("Last Will and Testament",
         "Governs the distribution of probate assets, names an executor, "
         "and designates guardians for minor children. A will alone does not "
         "avoid probate."),
        ("Revocable Living Trust",
         "Holds titled assets for your benefit during life and directs their "
         "disposition at death outside of probate. Fully revocable and "
         "amendable during your lifetime."),
        ("Pour-Over Will",
         "Complements the trust by directing any probate assets that were "
         "not retitled before death into the trust, ensuring a unified "
         "distribution scheme."),
        ("Durable Power of Attorney",
         "Authorizes a trusted agent to manage your financial affairs if "
         "you are incapacitated. 'Durable' means the authority survives "
         "incapacity."),
        ("Advance Healthcare Directive",
         "Appoints a healthcare agent and states your wishes regarding "
         "life-sustaining treatment, pain management, and organ donation."),
        ("HIPAA Release",
         "Authorizes named family members and healthcare agents to access "
         "your protected health information consistent with 45 C.F.R. Parts "
         "160 and 164."),
    ], cols=2))

    # --------------------------------------------------------------- WILL VS TRUST
    story.append(B.section_header("Will vs. revocable trust — a comparison",
                                  kicker="Two instruments, different roles"))
    story.append(B.body_para(
        "A will and a revocable living trust are complementary instruments, "
        "not substitutes. Most Cumulus clients have both. The table below "
        "summarizes where each instrument is distinctive."
    ))
    story.append(B.data_table(
        header=["Consideration", "Last Will and Testament",
                "Revocable Living Trust"],
        rows=[
            ["Probate",
             "Probate is required to transfer assets titled in the decedent's "
             "name alone.",
             "Avoids probate for assets titled to the trust (the principal "
             "benefit for most clients)."],
            ["Public record",
             "Becomes a matter of public record when filed for probate.",
             "Remains private; terms are not publicly filed."],
            ["Incapacity management",
             "Does not address incapacity; provides no authority during life.",
             "The successor trustee may manage trust assets during the "
             "grantor's incapacity without court intervention."],
            ["Multi-state property",
             "Each state in which real estate is owned requires ancillary "
             "probate.",
             "Real estate retitled to the trust avoids ancillary probate."],
            ["Cost to establish",
             "Typically lower to draft initially.",
             "Higher drafting cost; offset by probate savings."],
            ["Funding required",
             "Nothing to fund; operates at death.",
             "Must be actively funded by retitling assets to the trust."],
            ["Guardianship for minors",
             "Will is the appropriate instrument to nominate guardians.",
             "Trusts do not nominate guardians."],
        ],
        col_widths=[1.7 * inch, 2.8 * inch, 2.8 * inch],
    ))

    # --------------------------------------------------------------- CHART / DONUT
    story.append(Spacer(1, 0.10 * inch))
    story.append(B.section_header("A well-constructed estate plan — composition",
                                  kicker="Where the work sits"))
    story.append(B.body_para(
        "The allocation below illustrates the typical composition of "
        "attorney time across the core documents in a Cumulus Estate Planning "
        "engagement. Complex plans — those involving closely-held business "
        "interests, irrevocable trusts, or multi-state real estate — "
        "typically reallocate more time to the trust and tax-planning "
        "components."
    ))
    story.append(B.donut_chart(
        labels=["Revocable trust & funding",
                "Will & pour-over provisions",
                "Durable POA",
                "Healthcare directive & HIPAA",
                "Attorney meetings & review"],
        values=[35, 20, 15, 10, 20],
        title="Illustrative attorney-time allocation across core documents",
    ))

    # --------------------------------------------------------------- FEE TABLE
    story.append(B.section_header("Engagement fees",
                                  kicker="Transparent flat pricing"))
    story.append(B.body_para(
        "Cumulus Estate Planning is priced as a flat engagement based on the "
        "anticipated complexity of your plan. Complimentary planning is "
        "available to Managed Advisory clients with $2 million or more in "
        "qualifying assets under management. Out-of-pocket expenses (court "
        "filing fees, notary and witnessing, recording of real estate "
        "deeds) are billed at cost."
    ))
    story.append(B.data_table(
        header=["Plan type", "Flat fee", "Typical client profile"],
        rows=[
            ["Foundational plan",
             "$1,500",
             "Simple estate, single state, no closely-held business; "
             "will + POA + healthcare directive + HIPAA."],
            ["Core trust-based plan",
             "$2,500",
             "Revocable trust, pour-over will, POA, healthcare directive, "
             "HIPAA; one or two states, no active business."],
            ["Advanced plan",
             "$3,500",
             "Trust-based plan with an irrevocable ILIT, gifting trust, or "
             "basic business-succession provisions."],
            ["Complex plan",
             "$5,000",
             "Multiple trusts, closely-held business, multi-state real "
             "estate, generation-skipping planning."],
            ["Managed Advisory $2M+ clients",
             "Complimentary",
             "Foundational, core, or advanced plans included with "
             "advisory relationship."],
        ],
        col_widths=[2.0 * inch, 1.2 * inch, 4.1 * inch],
    ))

    # --------------------------------------------------------------- ENGAGEMENT
    story.append(B.section_header("How the engagement works",
                                  kicker="From discovery to execution"))
    story.append(B.data_table(
        header=["Step", "What happens", "Typical timing"],
        rows=[
            ["1  ·  Discovery",
             "Your Cumulus advisor and the engagement attorney review your "
             "family, asset, and tax picture; identify priorities; and "
             "confirm jurisdictional considerations.",
             "1–2 meetings"],
            ["2  ·  Design",
             "The attorney drafts a written design memorandum describing the "
             "recommended documents, funding steps, and any related "
             "insurance or retirement-account beneficiary updates.",
             "7–10 days"],
            ["3  ·  Drafting",
             "First drafts of all documents are circulated for review. A "
             "second meeting addresses revisions and fine-tuning.",
             "10–15 days"],
            ["4  ·  Execution",
             "Documents are signed with the required formalities (notary, "
             "two witnesses, self-proving affidavits) before an attorney or "
             "notary.",
             "1–2 hours"],
            ["5  ·  Funding",
             "Assets are retitled to the trust: real estate deeds recorded, "
             "investment accounts re-registered, beneficiary designations "
             "coordinated, and a funding memorandum delivered.",
             "30–60 days"],
        ],
        col_widths=[1.1 * inch, 4.6 * inch, 1.5 * inch],
    ))

    # --------------------------------------------------------------- PROBATE
    story.append(B.section_header("Why probate avoidance matters",
                                  kicker="The case for a funded revocable trust"))
    story.append(B.body_para(
        "Probate is the court-supervised process by which title to a "
        "decedent's assets is transferred to heirs or beneficiaries. In "
        "many states, probate is public, can take six to eighteen months, "
        "and consumes 2% to 5% of the gross estate in court costs, personal-"
        "representative commissions, and attorney fees. Assets properly "
        "titled to a funded revocable trust pass outside of probate, "
        "preserving privacy, reducing delay, and minimizing administrative "
        "expense. A pour-over will remains essential as a safety net for "
        "any asset not retitled before death."
    ))

    # --------------------------------------------------------------- TAX
    story.append(B.section_header("Tax considerations",
                                  kicker="Federal and state transfer taxes"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Federal transfer taxes"),
            *B.bullet_list([
                "Federal estate-tax exemption (2026, illustrative): $13.99 "
                "million per individual. Scheduled sunset to approximately "
                "$7 million per individual absent legislative action.",
                "Federal gift-tax annual exclusion: $18,000 per donor, per "
                "donee.",
                "Portability — a surviving spouse may elect to use the "
                "deceased spouse's unused exemption (DSUE) on Form 706.",
                "Generation-skipping transfer (GST) tax: a separate "
                "exemption equal to the estate-tax exemption, allocated at "
                "death or by timely election.",
            ]),
        ],
        right_flowables=[
            B.sub_header("State considerations"),
            *B.bullet_list([
                "A number of states impose their own estate or inheritance "
                "tax with lower exemption thresholds than federal.",
                "Community-property states (e.g., California, Texas, "
                "Washington) permit a full step-up in basis of community "
                "property at the first spouse's death.",
                "State-specific formalities (number of witnesses, self-"
                "proving affidavits, spousal elective share) must be "
                "respected in drafting and execution.",
                "Multi-state real estate benefits from retitling to a "
                "revocable trust to avoid ancillary probate.",
            ]),
        ],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Do I need a revocable trust if I already have a will?",
         "A revocable trust is not strictly required, but many clients "
         "benefit from one. A funded trust avoids probate (which is public "
         "and can be time-consuming), provides a mechanism for managing "
         "assets during incapacity, and is particularly valuable if you own "
         "real estate in more than one state or want to maintain privacy."),
        ("Who should be my agent under a durable power of attorney?",
         "A trusted individual — often a spouse, adult child, or close "
         "family friend — who is financially capable and geographically "
         "available. Many clients name a primary agent plus a successor. "
         "Consider whether the agent should be permitted to make gifts, "
         "change beneficiary designations, or handle digital assets; these "
         "powers must be explicitly granted in the document."),
        ("What is the difference between a healthcare directive and a "
         "HIPAA release?",
         "A healthcare directive appoints a healthcare agent and states "
         "your treatment wishes. A HIPAA release authorizes healthcare "
         "providers to share protected health information with named "
         "individuals under 45 C.F.R. Parts 160 and 164. Both are typically "
         "executed together; neither fully substitutes for the other."),
        ("How often should I update my plan?",
         "Review every three to five years and after major life events: "
         "marriage, divorce, birth or adoption of children, death of a named "
         "fiduciary, significant change in assets or domicile, material "
         "change in tax law, or sale of a closely-held business."),
        ("Will Cumulus serve as my trustee or executor?",
         "Cumulus, through its trust affiliate, is available to serve as "
         "corporate trustee, co-trustee, successor trustee, or executor "
         "where separately engaged. Fiduciary services are billed under the "
         "separate Trust Administration Services fee schedule."),
    ]
    for q, a in faqs:
        story.append(KeepTogether([
            Paragraph(f"<b>{q}</b>", B.STYLES["Callout"]),
            Paragraph(a, B.STYLES["Body"]),
            Spacer(1, 0.06 * inch),
        ]))

    # --------------------------------------------------------------- DISCLOSURES
    story += B.disclosure_block(
        "Important disclosures",
        B.STANDARD_INVESTMENT_DISCLOSURES + [
            "Estate planning documents are prepared by attorneys licensed in "
            "the applicable jurisdiction. Cumulus Bank, N.A. and its "
            "affiliates do not provide legal advice except through licensed "
            "attorneys engaged for that purpose.",
            "Cumulus and its affiliates do not provide tax advice. The "
            "federal and state transfer-tax figures in this brochure are "
            "illustrative only; confirm current exemptions, rates, and "
            "portability rules with your tax professional before relying on "
            "any planning technique.",
            "Where Cumulus Trust Company, N.A. is named in a fiduciary "
            "capacity (as trustee, co-trustee, successor trustee, or "
            "executor), it accepts the engagement under a separate written "
            "agreement and the applicable fee schedule. Acceptance of a "
            "fiduciary appointment is at the discretion of Cumulus Trust "
            "Company, N.A.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
