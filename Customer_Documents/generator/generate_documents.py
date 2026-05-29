from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import brand as B

ROOT = Path(__file__).resolve().parent.parent
DOCUMENTS_DIR = ROOT / "documents"


@dataclass(frozen=True)
class CustomerDocumentSpec:
    title: str
    file_name: str
    folder: str
    segment: str
    document_code: str
    doc_type: str
    audience: str
    owner_role: str
    cadence: str
    lede: str
    client_context: str
    summary_rows: tuple[tuple[str, str], ...]
    highlights: tuple[tuple[str, str], ...]
    metrics: tuple[tuple[str, int, str], ...]
    action_rows: tuple[tuple[str, str, str], ...]
    source_rows: tuple[tuple[str, str], ...]
    controls: tuple[str, ...]


DISCLOSURES = (
    "This document is generated for the JDO demo environment using fictitious Cumulus Bank data.",
    "Information is illustrative, may be synthesized, and must be verified before any real customer communication.",
    "No credit, investment, insurance, tax, legal, or fiduciary recommendation is made by this generated document.",
)


def relationship_narrative(spec: CustomerDocumentSpec) -> list:
    """Build longer-form content from the spec so PDFs are useful operating briefs."""
    highlight_terms = ", ".join(title.lower() for title, _ in spec.highlights[:3])
    return [
        B.para(
            f"{spec.title} is designed for {spec.audience.lower()} use during the {spec.cadence.lower()} motion. "
            f"The document should orient the owner, clarify the current relationship frame, and convert scattered "
            f"signals into a practical plan that can be reviewed before customer contact.",
            "Body",
        ),
        B.para(
            f"The core content emphasizes {highlight_terms}. These areas are intentionally operational: they help the "
            f"{spec.owner_role.lower()} understand what is known, what still needs validation, and which follow-up "
            f"steps should be assigned before the relationship moves forward.",
            "Body",
        ),
        B.para(
            "The document is not an automated decision record. It is a generated working draft that should be checked "
            "against the system of record, then refined by the banker, advisor, service specialist, or implementation "
            "owner who is accountable for the relationship.",
            "Body",
        ),
    ]


def metric_interpretation_rows(spec: CustomerDocumentSpec) -> list[tuple[str, str, str]]:
    rows = []
    for label, score, note in spec.metrics:
        if score >= 75:
            posture = "Strong signal"
            interpretation = "Can anchor the conversation, but still requires source validation."
        elif score >= 55:
            posture = "Developing signal"
            interpretation = "Useful for planning and prioritization; review supporting evidence before acting."
        else:
            posture = "Needs review"
            interpretation = "Treat as a gap or risk indicator until the owner confirms the underlying data."
        rows.append((f"{label} ({score}%)", posture, f"{note}. {interpretation}"))
    return rows


def discussion_rows(spec: CustomerDocumentSpec) -> list[tuple[str, str, str]]:
    rows = []
    for title, body in spec.highlights:
        rows.append((title, body, "Confirm whether this should be included in the next customer or team conversation."))
    return rows


def validation_rows(spec: CustomerDocumentSpec) -> list[tuple[str, str, str]]:
    rows = []
    for source, signals in spec.source_rows:
        rows.append((source, signals, "Validate freshness, owner, and field-level trust before reuse."))
    rows.append(("Human review", spec.owner_role, "Required before customer-facing delivery or CRM task creation."))
    return rows


def appendix_rows(spec: CustomerDocumentSpec) -> list[tuple[str, str]]:
    return [
        ("Document code", spec.document_code),
        ("Document type", spec.doc_type),
        ("Audience", spec.audience),
        ("Owner role", spec.owner_role),
        ("Cadence", spec.cadence),
        ("Segment", spec.segment.title()),
        ("Generated output", f"documents/{spec.folder}/{spec.file_name}"),
    ]


SPECS: tuple[CustomerDocumentSpec, ...] = (
    CustomerDocumentSpec(
        title="Retail Welcome Packet",
        file_name="Cumulus_Retail_Welcome_Packet.pdf",
        folder="01_Onboarding",
        segment="retail",
        document_code="CD-RET-WELCOME",
        doc_type="Onboarding packet",
        audience="New retail customer",
        owner_role="Branch banker",
        cadence="At account opening",
        lede="A customer-friendly packet that introduces Cumulus Bank channels, account setup tasks, safety reminders, and early relationship next steps.",
        client_context="Use this packet when a new retail customer opens a checking, savings, or card relationship and needs a clean post-opening checklist.",
        summary_rows=(
            ("Primary relationship", "Checking plus digital banking enrollment"),
            ("Delivery moment", "First appointment or same-day follow-up"),
            ("Suggested channel", "Secure message plus printed handout"),
            ("Next milestone", "First direct deposit, debit activation, and profile completion"),
        ),
        highlights=(
            ("Setup checklist", "Clear tasks for online banking, debit card controls, alerts, and statement preferences."),
            ("Service expectations", "Explains how the customer can reach branch, phone, and digital support."),
            ("Risk reminders", "Includes demo-safe fraud, identity, and account-monitoring reminders."),
            ("Relationship bridge", "Creates a reason for the banker to schedule a 30-day check-in."),
        ),
        metrics=(
            ("Profile readiness", 72, "contact and preference gaps remain"),
            ("Digital adoption", 64, "enrollment started"),
            ("Follow-up urgency", 58, "30-day call recommended"),
        ),
        action_rows=(
            ("Today", "Confirm contact preferences and digital banking enrollment.", "Banker"),
            ("Next 7 days", "Validate debit card receipt, alerts, and first login.", "Service team"),
            ("Next 30 days", "Review direct deposit, early balance pattern, and product fit.", "Banker"),
        ),
        source_rows=(
            ("CRM", "Account, Contact, consent, and communication preference fields"),
            ("Core banking", "New account, card, and enrollment status signals"),
            ("Data Cloud", "Digital onboarding and engagement events"),
        ),
        controls=(
            "Do not include full account numbers, tax identifiers, or authentication secrets.",
            "Confirm consent and contact preference before sending any customer-facing version.",
            "Treat generated text as banker draft copy until reviewed.",
        ),
    ),
    CustomerDocumentSpec(
        title="Retail Financial Snapshot",
        file_name="Cumulus_Retail_Financial_Snapshot.pdf",
        folder="02_Relationship_Review",
        segment="retail",
        document_code="CD-RET-SNAPSHOT",
        doc_type="Financial snapshot",
        audience="Retail banker and customer",
        owner_role="Personal banker",
        cadence="Quarterly or before advice conversation",
        lede="A concise relationship summary that helps a banker discuss balances, goals, service patterns, and next best actions with a retail customer.",
        client_context="Use this snapshot before a branch appointment or outbound call where the banker needs a one-page view of relationship health.",
        summary_rows=(
            ("Household scope", "Retail checking, savings, credit card, and goal signals"),
            ("Primary objective", "Identify needs, service risks, and financial wellness moments"),
            ("Review posture", "Educational and service-oriented"),
            ("Next milestone", "Confirm top financial goal and preferred contact rhythm"),
        ),
        highlights=(
            ("Relationship summary", "Combines household, product, and service indicators into one banker-ready narrative."),
            ("Goal framing", "Captures stated goals and likely gaps without making regulated recommendations."),
            ("Needs signals", "Highlights moments such as excess deposits, low emergency savings, or card engagement."),
            ("Service history", "Surfaces open cases and recent friction before the customer meeting."),
        ),
        metrics=(
            ("Relationship depth", 68, "two active products"),
            ("Savings momentum", 61, "stable but below target"),
            ("Service risk", 34, "low open friction"),
            ("Offer fit", 76, "conversation-ready"),
        ),
        action_rows=(
            ("Prepare", "Review household goals and recent cases before outreach.", "Banker"),
            ("Discuss", "Ask which goal should anchor the next 90 days.", "Banker"),
            ("Document", "Capture updated preferences and any declined offers.", "Banker"),
        ),
        source_rows=(
            ("Salesforce CRM", "Account, Contact, FinancialAccount, Case, Task, Opportunity"),
            ("Customer Hydration", "Persona, lifecycle, campaign, and synthetic activity data"),
            ("Data Cloud", "Segment membership and engagement summaries"),
        ),
        controls=(
            "Use neutral language; do not imply approval, suitability, or guaranteed outcomes.",
            "Keep sensitive values masked when exporting outside the demo workspace.",
            "Review the generated next best actions before using them in a customer conversation.",
        ),
    ),
    CustomerDocumentSpec(
        title="Retail Service Follow-Up",
        file_name="Cumulus_Retail_Service_Follow_Up.pdf",
        folder="03_Service_and_Retention",
        segment="retail",
        document_code="CD-RET-SERVICE",
        doc_type="Service follow-up",
        audience="Retail service team",
        owner_role="Service manager",
        cadence="After complaint, case closure, or high-friction interaction",
        lede="A service recovery document that summarizes the issue, follow-up commitments, retention risk, and a banker-safe call plan.",
        client_context="Use this after a case is closed or escalated so the customer receives consistent and accountable follow-up.",
        summary_rows=(
            ("Trigger", "Closed complaint, repeated case, or negative survey"),
            ("Primary objective", "Confirm resolution and protect relationship trust"),
            ("Tone", "Accountable, specific, and service-first"),
            ("Next milestone", "Customer confirms issue is resolved"),
        ),
        highlights=(
            ("Issue recap", "Captures what happened, current status, and remaining customer concern."),
            ("Follow-up commitments", "Lists owner, due date, and proof point for each action."),
            ("Retention lens", "Flags relationship value and churn signals without over-personalizing."),
            ("Manager handoff", "Gives supervisors a clear escalation path if the customer remains dissatisfied."),
        ),
        metrics=(
            ("Resolution confidence", 70, "case closed"),
            ("Relationship risk", 52, "monitor for 30 days"),
            ("Follow-up completeness", 45, "two tasks open"),
        ),
        action_rows=(
            ("Within 24 hours", "Call customer and confirm the resolution in plain language.", "Service specialist"),
            ("Within 3 days", "Send written recap through approved channel.", "Service specialist"),
            ("Within 14 days", "Review relationship health and close residual tasks.", "Manager"),
        ),
        source_rows=(
            ("Service Cloud", "Case status, comments, reason, and escalation fields"),
            ("CRM activity", "Tasks, calls, emails, and prior follow-up commitments"),
            ("Survey data", "CSAT or NPS score if available in the demo data set"),
        ),
        controls=(
            "Do not admit liability or make fee promises unless already approved.",
            "Keep the customer's stated issue intact; do not rewrite facts to minimize the complaint.",
            "Use an approved service template for any final outbound message.",
        ),
    ),
    CustomerDocumentSpec(
        title="Wealth Discovery Summary",
        file_name="Cumulus_Wealth_Discovery_Summary.pdf",
        folder="01_Onboarding",
        segment="wealth",
        document_code="CD-WLH-DISCOVERY",
        doc_type="Discovery summary",
        audience="Wealth advisor",
        owner_role="Wealth advisor",
        cadence="After first discovery meeting",
        lede="A structured discovery summary for goals, household context, liquidity needs, planning topics, and advisor follow-up.",
        client_context="Use this as the advisor's internal recap after a discovery meeting with a wealth customer or prospect.",
        summary_rows=(
            ("Household scope", "Primary client, spouse or partner, dependents, entities, and advisors"),
            ("Planning posture", "Discovery only; no investment recommendation"),
            ("Primary objective", "Convert conversation notes into an advisory next-step plan"),
            ("Next milestone", "Planning proposal or portfolio review meeting"),
        ),
        highlights=(
            ("Goal inventory", "Captures retirement, education, liquidity, estate, and charitable intent."),
            ("Household structure", "Documents decision makers, trusted contacts, and external advisors."),
            ("Planning gaps", "Flags missing statements, estate docs, insurance details, or tax context."),
            ("Follow-up package", "Lists the documents needed before the next advisor meeting."),
        ),
        metrics=(
            ("Discovery completeness", 63, "documents pending"),
            ("Planning complexity", 78, "multi-goal household"),
            ("Advisor readiness", 56, "proposal not ready"),
        ),
        action_rows=(
            ("Immediately", "Send secure checklist for statements and planning documents.", "Advisor"),
            ("Next meeting", "Confirm goals, time horizon, and liquidity needs.", "Advisor"),
            ("After review", "Prepare planning proposal with assumptions clearly labeled.", "Advisor team"),
        ),
        source_rows=(
            ("CRM", "Household, relationship group, goals, tasks, and meeting notes"),
            ("Customer Hydration", "Wealth persona, holdings, goals, life events, and campaign data"),
            ("External docs", "Statements and planning documents supplied by the customer"),
        ),
        controls=(
            "Do not present this discovery summary as investment advice.",
            "Confirm investment objectives and risk tolerance in approved advisory systems.",
            "Store customer-supplied documents only in approved secure locations.",
        ),
    ),
    CustomerDocumentSpec(
        title="Wealth Annual Review",
        file_name="Cumulus_Wealth_Annual_Review.pdf",
        folder="02_Relationship_Review",
        segment="wealth",
        document_code="CD-WLH-ANNUAL",
        doc_type="Annual review",
        audience="Wealth household and advisor team",
        owner_role="Lead advisor",
        cadence="Annual review cycle",
        lede="A polished annual review agenda and relationship summary for goals, portfolio service topics, planning changes, and next steps.",
        client_context="Use this to prepare for a formal annual review where the advisor needs a consistent story across goals, life events, and service follow-up.",
        summary_rows=(
            ("Review scope", "Goals, holdings, financial accounts, opportunities, tasks, and life events"),
            ("Primary objective", "Prepare an agenda and capture decisions"),
            ("Risk posture", "Advisor-reviewed; system-generated draft only"),
            ("Next milestone", "Approved annual review notes and follow-up tasks"),
        ),
        highlights=(
            ("Goal progress", "Frames progress against stated goals without calculating performance advice."),
            ("Household changes", "Surfaces life events, beneficiary updates, and planning milestones."),
            ("Relationship opportunities", "Lists follow-up topics for deposits, lending, trust, or advisory services."),
            ("Decision log", "Creates a durable agenda and action-item structure."),
        ),
        metrics=(
            ("Goal coverage", 81, "most goals current"),
            ("Planning freshness", 49, "estate update due"),
            ("Service completion", 67, "tasks in motion"),
            ("Deepening fit", 72, "advisor discussion"),
        ),
        action_rows=(
            ("Pre-meeting", "Validate goals, household members, and open service items.", "Advisor associate"),
            ("Meeting", "Review changes, confirm decisions, and record unresolved questions.", "Lead advisor"),
            ("Post-meeting", "Create tasks, update CRM notes, and schedule next review.", "Advisor team"),
        ),
        source_rows=(
            ("CRM", "Financial goals, opportunities, tasks, events, and relationship groups"),
            ("FSC objects", "Financial accounts, holdings, household records, and party relationships"),
            ("Data Cloud", "Segment membership and engagement indicators"),
        ),
        controls=(
            "Performance, tax, and legal topics require approved source systems and licensed review.",
            "Do not send generated review language until the advisor validates it.",
            "Document all decisions in the official CRM record after the meeting.",
        ),
    ),
    CustomerDocumentSpec(
        title="Wealth Planning Next Steps",
        file_name="Cumulus_Wealth_Planning_Next_Steps.pdf",
        folder="03_Service_and_Retention",
        segment="wealth",
        document_code="CD-WLH-NEXT",
        doc_type="Planning next steps",
        audience="Advisor team",
        owner_role="Planning specialist",
        cadence="After planning review or major life event",
        lede="A focused next-steps document for planning gaps, customer homework, internal owners, and sequencing after a wealth planning conversation.",
        client_context="Use this after a major life event, estate planning discussion, retirement review, or complex planning meeting.",
        summary_rows=(
            ("Trigger", "Planning review, liquidity event, inheritance, retirement, or family milestone"),
            ("Primary objective", "Turn planning topics into ordered tasks"),
            ("Delivery posture", "Internal advisor workflow with customer-facing excerpts"),
            ("Next milestone", "Completed document package and updated plan assumptions"),
        ),
        highlights=(
            ("Task sequencing", "Groups planning actions by customer, advisor, and specialist owner."),
            ("Document needs", "Identifies statements, estate documents, insurance schedules, or business records."),
            ("Decision dependencies", "Shows which tasks need completion before proposal or implementation."),
            ("Retention context", "Keeps complex planning work visible across the team."),
        ),
        metrics=(
            ("Document readiness", 42, "material gaps"),
            ("Specialist alignment", 66, "trust review needed"),
            ("Timeline clarity", 74, "owners assigned"),
        ),
        action_rows=(
            ("Week 1", "Collect planning documents and confirm external advisor contacts.", "Planning specialist"),
            ("Week 2", "Review assumptions with trust, lending, or tax partners as needed.", "Advisor team"),
            ("Week 3", "Present next-step plan and capture client decisions.", "Lead advisor"),
        ),
        source_rows=(
            ("CRM activity", "Meeting notes, tasks, open opportunities, and planning topics"),
            ("Customer files", "Statements, trust documents, tax summaries, and insurance schedules"),
            ("Advisor input", "Reviewed assumptions and approved language"),
        ),
        controls=(
            "Do not summarize legal documents without specialist review.",
            "Separate customer homework from internal advisory tasks.",
            "Use approved channels for any document collection request.",
        ),
    ),
    CustomerDocumentSpec(
        title="Commercial Onboarding Checklist",
        file_name="Cumulus_Commercial_Onboarding_Checklist.pdf",
        folder="01_Onboarding",
        segment="commercial",
        document_code="CD-COM-ONBOARD",
        doc_type="Onboarding checklist",
        audience="Business customer and implementation team",
        owner_role="Commercial relationship manager",
        cadence="At relationship kickoff",
        lede="A coordinated onboarding checklist for commercial deposits, treasury setup, users, approvals, documentation, and implementation milestones.",
        client_context="Use this when a business customer is opening a new Cumulus commercial relationship or implementing treasury services.",
        summary_rows=(
            ("Business scope", "Operating accounts, treasury services, credit, users, and signers"),
            ("Primary objective", "Coordinate customer tasks and internal implementation work"),
            ("Delivery moment", "Kickoff call and implementation recap"),
            ("Next milestone", "First successful production transaction"),
        ),
        highlights=(
            ("Implementation plan", "Clarifies owners for legal docs, user setup, testing, and go-live."),
            ("Treasury readiness", "Surfaces ACH, wire, positive pay, lockbox, and RDC dependencies."),
            ("Risk controls", "Calls out approvals, dual control, limits, and fraud-prevention setup."),
            ("Customer communication", "Provides an executive-friendly progress summary."),
        ),
        metrics=(
            ("Document package", 55, "legal docs pending"),
            ("Treasury readiness", 48, "testing not started"),
            ("User setup", 62, "approvers identified"),
            ("Go-live confidence", 51, "dependencies open"),
        ),
        action_rows=(
            ("Kickoff", "Confirm services, owners, expected go-live date, and approval model.", "RM"),
            ("Implementation", "Complete documents, user setup, and test transactions.", "Treasury implementation"),
            ("Go-live", "Validate first production transactions and support model.", "RM and service team"),
        ),
        source_rows=(
            ("CRM", "Account, contacts, opportunities, implementation tasks, and products"),
            ("Treasury systems", "Service enrollment, limits, user roles, and test status"),
            ("Compliance", "KYC, beneficial ownership, signer, and document status"),
        ),
        controls=(
            "Do not expose full tax IDs, account numbers, or authentication credentials.",
            "Dual-control and approval language must match the final treasury agreement.",
            "Implementation dates remain tentative until operations confirms readiness.",
        ),
    ),
    CustomerDocumentSpec(
        title="Commercial Relationship Review",
        file_name="Cumulus_Commercial_Relationship_Review.pdf",
        folder="02_Relationship_Review",
        segment="commercial",
        document_code="CD-COM-REVIEW",
        doc_type="Relationship review",
        audience="Relationship manager and business customer",
        owner_role="Commercial relationship manager",
        cadence="Semiannual or annual review",
        lede="A business relationship review that combines product footprint, service activity, treasury usage, credit needs, and next best actions.",
        client_context="Use this before a scheduled business review with owners, CFOs, controllers, or treasury managers.",
        summary_rows=(
            ("Relationship scope", "Deposits, lending, treasury, merchant, and service activity"),
            ("Primary objective", "Prepare a business review agenda and growth plan"),
            ("Review posture", "Relationship-management draft"),
            ("Next milestone", "Agreed action plan and updated opportunity pipeline"),
        ),
        highlights=(
            ("Footprint view", "Shows current Cumulus products and missing service opportunities."),
            ("Operating signals", "Summarizes balances, transaction patterns, and service friction."),
            ("Credit and treasury fit", "Frames discussion areas without implying approval or pricing."),
            ("Executive agenda", "Turns data into a clean meeting flow for business stakeholders."),
        ),
        metrics=(
            ("Relationship depth", 74, "multi-product customer"),
            ("Treasury utilization", 58, "room to expand"),
            ("Credit readiness", 46, "financials pending"),
            ("Service health", 69, "stable"),
        ),
        action_rows=(
            ("Pre-review", "Validate products, open service items, and opportunity stage.", "RM"),
            ("Meeting", "Confirm operating priorities and decision timeline.", "RM"),
            ("Follow-up", "Route credit, treasury, or merchant actions to specialists.", "RM and partners"),
        ),
        source_rows=(
            ("CRM", "Account, opportunities, contacts, activities, and cases"),
            ("Snowflake Cumulus data", "Commercial enrichment, firmographics, and risk context"),
            ("Treasury systems", "Service utilization and transaction-pattern indicators"),
        ),
        controls=(
            "Credit discussion language must remain conditional until underwriting review.",
            "Confirm financial statement recency before using revenue, debt, or cash-flow details.",
            "Keep proprietary business details inside approved demo or customer channels.",
        ),
    ),
    CustomerDocumentSpec(
        title="Commercial Treasury Readiness Brief",
        file_name="Cumulus_Commercial_Treasury_Readiness_Brief.pdf",
        folder="03_Service_and_Retention",
        segment="commercial",
        document_code="CD-COM-TREASURY",
        doc_type="Treasury readiness brief",
        audience="Treasury specialist and relationship manager",
        owner_role="Treasury management officer",
        cadence="Before treasury proposal or implementation",
        lede="A specialist brief that turns operating signals into a treasury-services readiness view with implementation blockers and recommended discussion points.",
        client_context="Use this before a treasury proposal, implementation call, or renewal conversation with a business customer.",
        summary_rows=(
            ("Service scope", "ACH, wires, positive pay, lockbox, RDC, cards, and sweeps"),
            ("Primary objective", "Identify readiness gaps and implementation priorities"),
            ("Review posture", "Specialist preparation document"),
            ("Next milestone", "Treasury proposal or implementation plan"),
        ),
        highlights=(
            ("Cash-cycle indicators", "Frames receivables, payables, fraud risk, and liquidity movement."),
            ("Service fit", "Maps business needs to treasury capabilities for discussion."),
            ("Implementation blockers", "Surfaces approvals, file formats, testing, and user-administration gaps."),
            ("Risk controls", "Keeps fraud prevention and dual control visible."),
        ),
        metrics=(
            ("Receivables fit", 71, "lockbox or RDC likely"),
            ("Payables fit", 69, "ACH and wire review"),
            ("Fraud-control need", 82, "positive pay conversation"),
            ("Implementation effort", 57, "moderate"),
        ),
        action_rows=(
            ("Before proposal", "Confirm volumes, file needs, approvers, and target services.", "TMO"),
            ("Proposal", "Present services, controls, implementation timeline, and pricing assumptions.", "TMO"),
            ("Implementation", "Coordinate testing, user setup, limits, and go-live support.", "Treasury implementation"),
        ),
        source_rows=(
            ("CRM", "Products, opportunities, contacts, and implementation tasks"),
            ("Treasury usage", "ACH, wire, card, RDC, lockbox, and fraud-control indicators"),
            ("External enrichment", "Industry, size, location, and operating-risk signals"),
        ),
        controls=(
            "Pricing, limits, and availability require treasury approval.",
            "Do not expose account-level transaction details in broad meeting materials.",
            "Validate implementation assumptions with operations before committing dates.",
        ),
    ),
)


def build_pdf(spec: CustomerDocumentSpec) -> tuple[Path, int]:
    B.set_theme(spec.segment)
    out_dir = DOCUMENTS_DIR / spec.folder
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / spec.file_name
    doc = B.CustomerDocumentDoc(
        str(out_path),
        title=spec.title,
        document_code=spec.document_code,
        segment=spec.segment,
    )
    story = []
    story.extend(
        B.cover_block(
            title=spec.title,
            lede=spec.lede,
            document_code=spec.document_code,
            rows=(
                ("Document type", spec.doc_type),
                ("Audience", spec.audience),
                ("Owner", spec.owner_role),
                ("Cadence", spec.cadence),
            ),
        )
    )
    story.append(B.section_header("Customer context", "Relationship frame"))
    story.append(B.para(spec.client_context, "Lead"))
    story.extend(relationship_narrative(spec))
    story.append(B.callout("Working posture", "Use this as a content-heavy planning document. It is meant to collect context, evidence, actions, and controls in one place before the owner decides what should become customer-facing language."))
    story.append(B.Spacer(1, 0.12 * 72))
    story.append(B.data_table(("Field", "Value"), spec.summary_rows, col_widths=[1.8 * 72, 4.55 * 72]))
    story.append(B.Spacer(1, 0.15 * 72))
    story.append(B.section_header("Document highlights", "What this produces"))
    story.append(B.feature_grid(spec.highlights))
    story.append(B.Spacer(1, 0.15 * 72))
    story.append(B.subsection("Discussion guide"))
    story.append(
        B.data_table(
            ("Topic", "Why it matters", "Review prompt"),
            discussion_rows(spec),
            col_widths=[1.4 * 72, 3.25 * 72, 1.7 * 72],
        )
    )
    story.append(B.PageBreak())
    story.append(B.section_header("Readiness signals", "Generated scorecard"))
    story.extend(B.metrics_block(spec.metrics))
    story.append(B.subsection("How to interpret these signals"))
    story.append(
        B.data_table(
            ("Signal", "Posture", "Interpretation"),
            metric_interpretation_rows(spec),
            col_widths=[1.55 * 72, 1.25 * 72, 3.55 * 72],
        )
    )
    story.append(B.Spacer(1, 0.14 * 72))
    story.append(B.section_header("Evidence model", "Source review"))
    story.append(B.data_table(("Source", "Signals"), spec.source_rows, col_widths=[1.8 * 72, 4.55 * 72]))
    story.append(B.Spacer(1, 0.12 * 72))
    story.append(
        B.data_table(
            ("Source", "Expected content", "Validation step"),
            validation_rows(spec),
            col_widths=[1.4 * 72, 3.25 * 72, 1.7 * 72],
        )
    )
    story.append(B.PageBreak())
    story.append(B.section_header("Action plan", "Recommended workflow"))
    story.append(B.data_table(("Timing", "Action", "Owner"), spec.action_rows, col_widths=[1.15 * 72, 4.0 * 72, 1.2 * 72]))
    story.append(B.Spacer(1, 0.12 * 72))
    story.append(B.subsection("Operating notes"))
    for timing, action, owner in spec.action_rows:
        story.append(B.para(f"{timing}: {owner} should {action[0].lower() + action[1:] if action else action} The owner should record the outcome in the CRM activity timeline and identify any dependency that blocks the next step.", "Body"))
    story.append(B.PageBreak())
    story.append(B.section_header("Controls", "Review before use"))
    story.extend(B.bullet_block(spec.controls))
    story.append(B.Spacer(1, 0.12 * 72))
    story.append(B.subsection("Review checklist"))
    story.append(
        B.data_table(
            ("Check", "Required review"),
            (
                ("Data freshness", "Confirm the data was refreshed recently enough for the customer workflow."),
                ("Sensitive information", "Mask identifiers, credentials, account numbers, and private notes."),
                ("Human approval", "Route customer-facing excerpts through the owner and approved template process."),
                ("CRM update", "Log decisions, declined actions, follow-up tasks, and unresolved questions."),
            ),
            col_widths=[1.65 * 72, 4.7 * 72],
        )
    )
    story.extend(B.disclosure_block(DISCLOSURES))
    story.append(B.PageBreak())
    story.append(B.section_header("Appendix", "Document metadata"))
    story.append(B.data_table(("Field", "Value"), appendix_rows(spec), col_widths=[1.7 * 72, 4.65 * 72]))
    story.append(B.Spacer(1, 0.12 * 72))
    story.append(B.para("This appendix exists so generated PDFs can be checked back to their source spec, folder, owner model, and usage cadence during demos or document QA.", "Body"))
    story.extend(B.back_cover_block(spec.owner_role))
    doc.build(story)
    return out_path, int(doc.page)


def write_documents_index(results: Sequence[tuple[CustomerDocumentSpec, Path, int]]) -> None:
    lines = [
        "# Cumulus Customer Documents",
        "",
        "Generated customer-document catalog for the JDO demo org.",
        "",
        "> Cumulus Bank is fictitious. These PDFs use generated demo data and are not approved customer communications.",
        "",
        "| Document | Segment | Type | Owner | Pages | PDF |",
        "|---|---|---|---|---:|---|",
    ]
    for spec, path, pages in results:
        rel = path.relative_to(DOCUMENTS_DIR).as_posix()
        lines.append(
            f"| {spec.title} | {spec.segment.title()} | {spec.doc_type} | {spec.owner_role} | {pages} | [{path.name}]({rel}) |"
        )
    kyc_root = DOCUMENTS_DIR / "04_KYC"
    if kyc_root.exists():
        lines.extend(["", "## KYC document runs", "", "| Run date | Index |", "|---|---|"])
        for run_dir in sorted(path for path in kyc_root.iterdir() if path.is_dir()):
            index = run_dir / "README.md"
            if index.exists():
                lines.append(f"| {run_dir.name} | [KYC index](04_KYC/{run_dir.name}/README.md) |")
    articles_root = DOCUMENTS_DIR / "05_Articles_of_Incorporation"
    if articles_root.exists():
        lines.extend(["", "## Articles of Incorporation runs", "", "| Run date | Index |", "|---|---|"])
        for run_dir in sorted(path for path in articles_root.iterdir() if path.is_dir()):
            index = run_dir / "README.md"
            if index.exists():
                lines.append(
                    f"| {run_dir.name} | [Articles of Incorporation index](05_Articles_of_Incorporation/{run_dir.name}/README.md) |"
                )
    lines.extend(
        [
            "",
            "Regenerate with:",
            "",
            "```bash",
            "cd Customer_Documents",
            "python3 generator/generate_documents.py",
            "```",
            "",
        ]
    )
    (DOCUMENTS_DIR / "README.md").write_text("\n".join(lines), encoding="utf-8")


def write_artifacts(results: Sequence[tuple[CustomerDocumentSpec, Path, int]]) -> None:
    lines = [
        "# Customer Documents - Artifact Inventory",
        "",
        "Canonical inventory for the generated customer-document PDFs and source files.",
        "",
        f"- **Total static documents:** {len(results)}",
        "- **Static document generator:** `generator/generate_documents.py`",
        "- **KYC generator:** `generator/generate_kyc_documents.py`",
        "- **Articles generator:** `generator/generate_articles_of_incorporation.py`",
        "- **Shared brand module:** `generator/brand.py`",
        "- **Spec of record:** `docs/DOCUMENT_SPECS.md`",
        "- **Document guide:** `docs/DOCUMENTS.md`",
        "",
        "| Document | Segment | Folder | Pages | Size | PDF | Generator |",
        "|---|---|---|---:|---:|---|---|",
    ]
    for spec, path, pages in results:
        rel = path.relative_to(ROOT).as_posix()
        size_kb = max(1, round(path.stat().st_size / 1024))
        lines.append(
            f"| {spec.title} | {spec.segment.title()} | `{spec.folder}` | {pages} | {size_kb}K | [{path.name}](../{rel}) | `generate_documents.py` |"
        )
    kyc_root = ROOT / "documents" / "04_KYC"
    if kyc_root.exists():
        lines.extend(
            [
                "",
                "## KYC document runs",
                "",
                "KYC PDFs are generated from live Salesforce Account records by `generator/generate_kyc_documents.py`.",
                "",
                "| Run date | Index |",
                "|---|---|",
            ]
        )
        for run_dir in sorted(path for path in kyc_root.iterdir() if path.is_dir()):
            index = run_dir / "README.md"
            if index.exists():
                lines.append(f"| {run_dir.name} | [README](../documents/04_KYC/{run_dir.name}/README.md) |")
    articles_root = ROOT / "documents" / "05_Articles_of_Incorporation"
    if articles_root.exists():
        lines.extend(
            [
                "",
                "## Articles of Incorporation runs",
                "",
                "Articles PDFs are generated from live non-person Salesforce Account records by `generator/generate_articles_of_incorporation.py`.",
                "",
                "| Run date | Index |",
                "|---|---|",
            ]
        )
        for run_dir in sorted(path for path in articles_root.iterdir() if path.is_dir()):
            index = run_dir / "README.md"
            if index.exists():
                lines.append(f"| {run_dir.name} | [README](../documents/05_Articles_of_Incorporation/{run_dir.name}/README.md) |")
    lines.append("")
    (ROOT / "docs" / "ARTIFACTS.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
    results = []
    for spec in SPECS:
        path, pages = build_pdf(spec)
        results.append((spec, path, pages))
        print(f"built {path.relative_to(ROOT)} ({pages} pages)")
    write_documents_index(results)
    write_artifacts(results)


if __name__ == "__main__":
    main()
