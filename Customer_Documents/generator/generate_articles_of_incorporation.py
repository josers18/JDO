from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import subprocess
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Sequence

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Flowable,
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parent.parent
ARTICLES_ROOT = ROOT / "documents" / "05_Articles_of_Incorporation"

ACCOUNT_FIELDS = (
    "Id",
    "Name",
    "IsPersonAccount",
    "RecordTypeId",
    "OwnerId",
    "ParentId",
    "Type",
    "Industry",
    "AnnualRevenue",
    "NumberOfEmployees",
    "Ownership",
    "TickerSymbol",
    "Sic",
    "SicDesc",
    "Phone",
    "Website",
    "Description",
    "BillingStreet",
    "BillingCity",
    "BillingState",
    "BillingPostalCode",
    "BillingCountry",
    "ShippingStreet",
    "ShippingCity",
    "ShippingState",
    "ShippingPostalCode",
    "ShippingCountry",
    "CreatedDate",
    "LastModifiedDate",
    "FinServ__ClientCategory__c",
    "FinServ__CustomerID__c",
    "FinServ__SourceSystemId__c",
    "External_ID__c",
    "External_ID_c__c",
    "LegacyId__c",
    "Customer_ID__c",
    "MDM_ID__c",
)

RELATIONSHIP_FIELDS = (
    ("RecordTypeId", "RecordType.Name"),
    ("RecordTypeId", "RecordType.DeveloperName"),
    ("OwnerId", "Owner.Name"),
    ("ParentId", "Parent.Name"),
)

STATE_NAMES = {
    "AL": "Alabama",
    "AK": "Alaska",
    "AZ": "Arizona",
    "AR": "Arkansas",
    "CA": "California",
    "CO": "Colorado",
    "CT": "Connecticut",
    "DE": "Delaware",
    "FL": "Florida",
    "GA": "Georgia",
    "IL": "Illinois",
    "MA": "Massachusetts",
    "MD": "Maryland",
    "MI": "Michigan",
    "MN": "Minnesota",
    "MO": "Missouri",
    "NC": "North Carolina",
    "NJ": "New Jersey",
    "NY": "New York",
    "OH": "Ohio",
    "PA": "Pennsylvania",
    "TN": "Tennessee",
    "TX": "Texas",
    "VA": "Virginia",
    "WA": "Washington",
}


class SalesforceCliError(RuntimeError):
    pass


@dataclass(frozen=True)
class ArticlesProfile:
    account: dict[str, Any]
    generated: dict[str, Any]


def run_sf_json(args: Sequence[str]) -> dict[str, Any]:
    result = subprocess.run(args, text=True, capture_output=True, check=False)
    if result.returncode != 0:
        raise SalesforceCliError(result.stderr.strip() or result.stdout.strip())
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise SalesforceCliError(f"Salesforce CLI returned non-JSON output: {result.stdout[:500]}") from exc
    if payload.get("status") not in (0, None):
        raise SalesforceCliError(json.dumps(payload, indent=2)[:2000])
    return payload


def describe_account(target_org: str) -> dict[str, Any]:
    payload = run_sf_json(
        ["sf", "sobject", "describe", "--target-org", target_org, "--sobject", "Account", "--json"]
    )
    return payload["result"]


def field_map(describe: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {field["name"]: field for field in describe.get("fields", [])}


def account_fields(describe: dict[str, Any]) -> list[str]:
    fields = field_map(describe)
    selected: list[str] = []
    for field in ACCOUNT_FIELDS:
        if field in fields and field not in selected:
            selected.append(field)
    for required_by, relationship_field in RELATIONSHIP_FIELDS:
        if required_by in fields and relationship_field not in selected:
            selected.append(relationship_field)
    return selected


def flatten_record(record: dict[str, Any]) -> dict[str, Any]:
    flat: dict[str, Any] = {}
    for key, value in record.items():
        if key == "attributes":
            continue
        if isinstance(value, dict):
            for nested_key, nested_value in value.items():
                if nested_key != "attributes":
                    flat[f"{key}.{nested_key}"] = nested_value
        else:
            flat[key] = value
    return flat


def build_where_clause(account_ids: Sequence[str], user_where: str | None) -> str:
    clauses = ["IsPersonAccount = false"]
    if account_ids:
        quoted = ", ".join(f"'{account_id}'" for account_id in account_ids)
        clauses.append(f"Id IN ({quoted})")
    if user_where:
        clauses.append(f"({user_where})")
    return " WHERE " + " AND ".join(clauses)


def query_accounts(
    target_org: str,
    fields: Sequence[str],
    *,
    account_ids: Sequence[str],
    where: str | None,
    limit: int | None,
) -> list[dict[str, Any]]:
    selected = ", ".join(fields)
    where_clause = build_where_clause(account_ids, where)
    limit_clause = f" LIMIT {limit}" if limit else ""
    soql = f"SELECT {selected} FROM Account{where_clause} ORDER BY LastModifiedDate DESC{limit_clause}"
    payload = run_sf_json(["sf", "data", "query", "--target-org", target_org, "--query", soql, "--json"])
    return [flatten_record(record) for record in payload["result"].get("records", [])]


def default_target_org() -> str:
    payload = run_sf_json(["sf", "config", "get", "target-org", "--json"])
    for item in payload.get("result") or []:
        if item.get("name") == "target-org" and item.get("value"):
            return item["value"]
    raise SalesforceCliError("No target org configured. Pass --target-org.")


def seed_int(account_id: str, salt: str, modulo: int) -> int:
    digest = hashlib.sha256(f"{account_id}:{salt}".encode("utf-8")).hexdigest()
    return int(digest[:12], 16) % modulo


def pick(account_id: str, salt: str, choices: Sequence[str]) -> str:
    return choices[seed_int(account_id, salt, len(choices))]


def sanitize_entity_name(name: str) -> str:
    cleaned = re.sub(r"\s+", " ", name or "Unnamed Entity").strip()
    suffix_pattern = re.compile(r"\b(incorporated|inc\.?|corp\.?|corporation|llc|l\.l\.c\.|ltd\.?|limited)\b\.?", re.I)
    if suffix_pattern.search(cleaned):
        return cleaned
    return f"{cleaned}, Inc."


def format_address(parts: Sequence[Any], fallback: str) -> str:
    values = [str(part).strip() for part in parts if part not in (None, "", [])]
    return ", ".join(values) if values else fallback


def state_name(state: Any, account_id: str) -> str:
    raw = str(state or "").strip()
    if not raw:
        return pick(account_id, "jurisdiction", ("Delaware", "New York", "Texas", "California", "Virginia"))
    if len(raw) == 2:
        return STATE_NAMES.get(raw.upper(), raw.upper())
    return raw


def filed_date(account: dict[str, Any], run_date: date) -> date:
    created = account.get("CreatedDate")
    if isinstance(created, str) and created:
        try:
            return datetime.fromisoformat(created.replace("Z", "+00:00")).date()
        except ValueError:
            pass
    account_id = str(account["Id"])
    year = max(1998, run_date.year - seed_int(account_id, "age", 18))
    month = 1 + seed_int(account_id, "month", 12)
    day = 1 + seed_int(account_id, "day", 27)
    return date(year, month, day)


def currency(value: Any) -> str:
    if isinstance(value, (int, float)):
        return f"${value:,.0f}"
    return "Not stated in the Account record"


def generated_articles_profile(account: dict[str, Any], run_date: date) -> dict[str, Any]:
    account_id = str(account["Id"])
    legal_name = sanitize_entity_name(str(account.get("Name") or account_id))
    jurisdiction = state_name(account.get("BillingState") or account.get("ShippingState"), account_id)
    principal_office = format_address(
        (
            account.get("BillingStreet") or account.get("ShippingStreet"),
            account.get("BillingCity") or account.get("ShippingCity"),
            account.get("BillingState") or account.get("ShippingState"),
            account.get("BillingPostalCode") or account.get("ShippingPostalCode"),
            account.get("BillingCountry") or account.get("ShippingCountry"),
        ),
        f"{pick(account_id, 'street-no', ('100', '275', '410', '860'))} Commerce Plaza, {jurisdiction}",
    )
    registered_office = format_address(
        (
            f"{100 + seed_int(account_id, 'agent-street', 890)} {pick(account_id, 'agent-road', ('Market Street', 'Main Street', 'Capitol Avenue', 'Commerce Drive'))}",
            account.get("BillingCity") or account.get("ShippingCity") or pick(account_id, "agent-city", ("Wilmington", "Austin", "Richmond", "Sacramento", "Albany")),
            account.get("BillingState") or account.get("ShippingState") or jurisdiction,
            account.get("BillingPostalCode") or f"{10000 + seed_int(account_id, 'agent-postal', 89999)}",
        ),
        f"100 Market Street, {jurisdiction}",
    )
    industry = str(account.get("Industry") or account.get("SicDesc") or "general commercial services")
    entity_type = pick(
        account_id,
        "entity-type",
        (
            "domestic stock corporation",
            "domestic business corporation",
            "public benefit corporation",
            "professional corporation",
            "closely held corporation",
        ),
    )
    share_count = pick(account_id, "shares", ("1,000", "5,000", "10,000", "25,000", "100,000"))
    par_value = pick(account_id, "par", ("$0.001", "$0.01", "$0.10", "$1.00"))
    officer_last = re.sub(r"[^A-Za-z ]", "", legal_name).split()[0:2] or ["Corporate"]
    base_name = " ".join(officer_last)
    incorporator = f"{pick(account_id, 'first-inc', ('Alex', 'Jordan', 'Morgan', 'Taylor', 'Casey'))} {pick(account_id, 'last-inc', ('Reed', 'Santos', 'Miller', 'Patel', 'Chen'))}"
    directors = [
        f"{pick(account_id, f'dir-first-{index}', ('Avery', 'Blake', 'Cameron', 'Drew', 'Emerson', 'Finley'))} {pick(account_id, f'dir-last-{index}', ('Bennett', 'Clark', 'Hayes', 'Nguyen', 'Rivera', 'Stone'))}"
        for index in range(3)
    ]
    purpose = (
        f"to engage in lawful business activities related to {industry.lower()}, including the ownership, "
        "operation, management, financing, and support of related commercial activities, and to conduct any "
        f"other lawful act or activity for which corporations may be organized under the laws of {jurisdiction}."
    )
    filing_date = filed_date(account, run_date)
    return {
        "legal_name": legal_name,
        "jurisdiction": jurisdiction,
        "entity_type": entity_type,
        "purpose": purpose,
        "principal_office": principal_office,
        "registered_agent": f"{base_name} Corporate Services LLC",
        "registered_office": registered_office,
        "share_class": "Common Stock",
        "authorized_shares": share_count,
        "par_value": par_value,
        "incorporator": incorporator,
        "incorporator_address": registered_office,
        "directors": directors,
        "effective_date": filing_date.isoformat(),
        "filing_number": f"AOI-{account_id[-6:]}-{filing_date.year}",
        "seal_number": f"{seed_int(account_id, 'seal', 900000) + 100000}",
        "annual_revenue": currency(account.get("AnnualRevenue")),
        "employees": str(account.get("NumberOfEmployees") or "Not stated in the Account record"),
        "record_type": account.get("RecordType.Name") or account.get("RecordType.DeveloperName") or "Not stated",
        "owner": account.get("Owner.Name") or "Not stated",
    }


def articles_file_name(account_id: str, run_date: date) -> str:
    return f"{account_id}_Articles_of_Incorporation_{run_date.isoformat()}.pdf"


class SignatureLine(Flowable):
    def __init__(self, width: float = 3.1 * inch, height: float = 0.42 * inch) -> None:
        super().__init__()
        self.width = width
        self.height = height

    def draw(self) -> None:
        self.canv.setStrokeColor(colors.black)
        self.canv.line(0, 0.24 * inch, self.width, 0.24 * inch)


def styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "Title": ParagraphStyle(
            "LegalTitle",
            parent=base["Title"],
            fontName="Times-Bold",
            fontSize=18,
            leading=22,
            alignment=TA_CENTER,
            spaceAfter=18,
            textColor=colors.black,
        ),
        "Subtitle": ParagraphStyle(
            "LegalSubtitle",
            parent=base["Normal"],
            fontName="Times-Bold",
            fontSize=11,
            leading=14,
            alignment=TA_CENTER,
            spaceAfter=16,
            textColor=colors.black,
        ),
        "Article": ParagraphStyle(
            "ArticleHeading",
            parent=base["Heading2"],
            fontName="Times-Bold",
            fontSize=12,
            leading=15,
            alignment=TA_CENTER,
            spaceBefore=12,
            spaceAfter=8,
            textColor=colors.black,
        ),
        "Body": ParagraphStyle(
            "LegalBody",
            parent=base["BodyText"],
            fontName="Times-Roman",
            fontSize=10.5,
            leading=15,
            alignment=TA_JUSTIFY,
            firstLineIndent=0.25 * inch,
            spaceAfter=7,
            textColor=colors.black,
        ),
        "BodyNoIndent": ParagraphStyle(
            "LegalBodyNoIndent",
            parent=base["BodyText"],
            fontName="Times-Roman",
            fontSize=10.5,
            leading=15,
            alignment=TA_JUSTIFY,
            spaceAfter=7,
            textColor=colors.black,
        ),
        "Small": ParagraphStyle(
            "LegalSmall",
            parent=base["BodyText"],
            fontName="Times-Roman",
            fontSize=8.5,
            leading=11,
            alignment=TA_LEFT,
            textColor=colors.black,
        ),
        "Right": ParagraphStyle(
            "LegalRight",
            parent=base["BodyText"],
            fontName="Times-Roman",
            fontSize=10,
            leading=13,
            alignment=TA_RIGHT,
            textColor=colors.black,
        ),
        "CertTitle": ParagraphStyle(
            "CertificateTitle",
            parent=base["Heading1"],
            fontName="Times-Bold",
            fontSize=14,
            leading=18,
            alignment=TA_CENTER,
            spaceAfter=12,
            textColor=colors.black,
        ),
    }


def p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(html.escape(str(text)), style)


def p_markup(markup: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(markup, style)


def source_rows(account: dict[str, Any], generated: dict[str, Any]) -> list[tuple[str, str]]:
    return [
        ("Salesforce Account ID", str(account.get("Id", ""))),
        ("Salesforce Account Name", str(account.get("Name", ""))),
        ("Record Type", str(generated["record_type"])),
        ("Relationship Owner", str(generated["owner"])),
        ("Industry", str(account.get("Industry") or account.get("SicDesc") or "Not stated")),
        ("Business Type", str(account.get("Type") or "Not stated")),
        ("Annual Revenue", str(generated["annual_revenue"])),
        ("Employees", str(generated["employees"])),
        ("Website", str(account.get("Website") or "Not stated")),
        ("Phone", str(account.get("Phone") or "Not stated")),
        ("Last Modified", str(account.get("LastModifiedDate") or "Not stated")),
    ]


def table(rows: Sequence[tuple[str, str]], widths: Sequence[float] = (2.2 * inch, 4.0 * inch)) -> Table:
    small = styles()["Small"]
    body = [[Paragraph(f"<b>{html.escape(left)}</b>", small), Paragraph(html.escape(str(right)), small)] for left, right in rows]
    grid = Table(body, colWidths=list(widths), hAlign="LEFT")
    grid.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.35, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F3F3F3")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return grid


def page_footer(canvas: Any, doc: SimpleDocTemplate) -> None:
    canvas.saveState()
    canvas.setFont("Times-Roman", 8)
    canvas.setStrokeColor(colors.black)
    canvas.line(doc.leftMargin, 0.48 * inch, letter[0] - doc.rightMargin, 0.48 * inch)
    canvas.drawString(doc.leftMargin, 0.32 * inch, "Generated demonstration Articles of Incorporation; not a filed legal record.")
    canvas.drawRightString(letter[0] - doc.rightMargin, 0.32 * inch, f"Page {doc.page}")
    canvas.restoreState()


def build_articles_story(profile: ArticlesProfile, run_date: date) -> list[Any]:
    s = styles()
    account = profile.account
    generated = profile.generated
    legal_name = generated["legal_name"]
    jurisdiction = generated["jurisdiction"]
    story: list[Any] = []
    story.append(p("ARTICLES OF INCORPORATION", s["Title"]))
    story.append(p_markup(f"OF<br/>{html.escape(legal_name.upper())}", s["Subtitle"]))
    story.append(HRFlowable(width="100%", thickness=0.8, color=colors.black))
    story.append(Spacer(1, 0.18 * inch))
    story.append(
        p(
            f"The undersigned incorporator, for the purpose of forming a {generated['entity_type']} "
            f"under the laws of {jurisdiction}, adopts the following Articles of Incorporation.",
            s["BodyNoIndent"],
        )
    )
    story.append(p_markup("ARTICLE I<br/>NAME", s["Article"]))
    story.append(p(f"The name of the corporation is {legal_name}.", s["Body"]))
    story.append(p_markup("ARTICLE II<br/>PURPOSE", s["Article"]))
    story.append(
        p(
            f"The corporation is organized {generated['purpose']} The corporation may exercise all powers "
            "granted to corporations under applicable law, including the power to enter into contracts, own "
            "property, borrow money, lend money where lawful, open bank and treasury relationships, and take "
            "all acts necessary or convenient to carry out its business purposes.",
            s["Body"],
        )
    )
    story.append(p_markup("ARTICLE III<br/>DURATION", s["Article"]))
    story.append(p("The period of duration of the corporation shall be perpetual unless dissolved according to law.", s["Body"]))
    story.append(p_markup("ARTICLE IV<br/>PRINCIPAL OFFICE", s["Article"]))
    story.append(
        p(
            f"The street address of the corporation's initial principal office is {generated['principal_office']}. "
            "The corporation may maintain additional offices and places of business within or outside the state "
            "as the board of directors may determine.",
            s["Body"],
        )
    )
    story.append(p_markup("ARTICLE V<br/>REGISTERED AGENT AND REGISTERED OFFICE", s["Article"]))
    story.append(
        p(
            f"The name of the initial registered agent is {generated['registered_agent']}. The street address of "
            f"the initial registered office is {generated['registered_office']}. The registered agent is authorized "
            "to receive service of process and official notices on behalf of the corporation.",
            s["Body"],
        )
    )
    story.append(p_markup("ARTICLE VI<br/>AUTHORIZED SHARES", s["Article"]))
    story.append(
        p(
            f"The corporation is authorized to issue {generated['authorized_shares']} shares of {generated['share_class']} "
            f"with a par value of {generated['par_value']} per share. The board of directors may issue shares for "
            "consideration approved by the board and may adopt reasonable restrictions, legends, and transfer "
            "procedures consistent with applicable law.",
            s["Body"],
        )
    )
    story.append(PageBreak())
    story.append(p_markup("ARTICLE VII<br/>INITIAL DIRECTORS", s["Article"]))
    directors = ", ".join(generated["directors"])
    story.append(
        p(
            f"The initial directors of the corporation shall be {directors}. Each director shall serve until a "
            "successor is elected and qualified, or until earlier resignation or removal according to the bylaws "
            "and applicable law.",
            s["Body"],
        )
    )
    story.append(p_markup("ARTICLE VIII<br/>INCORPORATOR", s["Article"]))
    story.append(
        p(
            f"The name and mailing address of the incorporator are {generated['incorporator']}, "
            f"{generated['incorporator_address']}. The incorporator is authorized to execute these Articles, "
            "deliver them for filing, and take organizational action until the initial board assumes control.",
            s["Body"],
        )
    )
    story.append(p_markup("ARTICLE IX<br/>LIMITATION OF DIRECTOR LIABILITY", s["Article"]))
    story.append(
        p(
            "To the fullest extent permitted by law, no director of the corporation shall be personally liable "
            "to the corporation or its shareholders for monetary damages for breach of fiduciary duty as a "
            "director. If applicable law is amended to authorize further elimination or limitation of director "
            "liability, the liability of a director shall be eliminated or limited to the fullest extent permitted "
            "by the amended law.",
            s["Body"],
        )
    )
    story.append(p_markup("ARTICLE X<br/>INDEMNIFICATION", s["Article"]))
    story.append(
        p(
            "The corporation shall indemnify directors, officers, employees, and agents to the fullest extent "
            "permitted by law. The corporation may purchase and maintain insurance, advance expenses, and enter "
            "into indemnification agreements as authorized by the board of directors.",
            s["Body"],
        )
    )
    story.append(p_markup("ARTICLE XI<br/>BYLAWS AND ORGANIZATIONAL ACTION", s["Article"]))
    story.append(
        p(
            "The initial bylaws may be adopted by the incorporator or the initial board of directors. The board "
            "may amend, repeal, or restate the bylaws except as otherwise provided by law, these Articles, or a "
            "shareholder-approved bylaw provision.",
            s["Body"],
        )
    )
    story.append(p_markup("ARTICLE XII<br/>EFFECTIVE DATE", s["Article"]))
    story.append(
        p(
            f"These Articles shall be effective upon filing by the appropriate filing office, with an intended "
            f"effective date of {generated['effective_date']} for generated document purposes.",
            s["Body"],
        )
    )
    story.append(Spacer(1, 0.22 * inch))
    story.append(
        p(
            f"IN WITNESS WHEREOF, the undersigned incorporator has executed these Articles of Incorporation "
            f"on {run_date.isoformat()}.",
            s["BodyNoIndent"],
        )
    )
    story.append(Spacer(1, 0.22 * inch))
    sig = Table(
        [
            [SignatureLine(), Paragraph("Incorporator", s["Small"])],
            [Paragraph(generated["incorporator"], s["Small"]), ""],
        ],
        colWidths=[3.3 * inch, 2.0 * inch],
        hAlign="LEFT",
    )
    sig.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "BOTTOM"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(sig)
    story.append(PageBreak())
    story.append(p("CERTIFICATE OF ORGANIZATIONAL ACTION", s["CertTitle"]))
    story.append(
        p(
            f"The incorporator certifies that {legal_name} has been organized as a {generated['entity_type']} "
            f"under the laws of {jurisdiction}; that the attached Articles of Incorporation are complete as "
            "generated; and that the initial directors named in these Articles are authorized to conduct the "
            "first organizational meeting, adopt bylaws, appoint officers, authorize banking resolutions, and "
            "take other initial corporate action.",
            s["BodyNoIndent"],
        )
    )
    story.append(Spacer(1, 0.1 * inch))
    story.append(
        table(
            (
                ("Generated Filing Number", generated["filing_number"]),
                ("Generated Seal Number", generated["seal_number"]),
                ("Entity Type", generated["entity_type"].title()),
                ("Jurisdiction", jurisdiction),
                ("Effective Date", generated["effective_date"]),
                ("Authorized Shares", f"{generated['authorized_shares']} {generated['share_class']}"),
                ("Principal Office", generated["principal_office"]),
                ("Registered Agent", generated["registered_agent"]),
                ("Registered Office", generated["registered_office"]),
            )
        )
    )
    story.append(Spacer(1, 0.24 * inch))
    story.append(p("SOURCE DATA MEMORANDUM", s["CertTitle"]))
    story.append(
        p(
            "This memorandum records the Salesforce Account values used to generate the realistic legal-form "
            "content. Missing corporate-law details were deterministically synthesized from the Account ID so "
            "repeat runs produce stable document text.",
            s["BodyNoIndent"],
        )
    )
    story.append(table(source_rows(account, generated)))
    story.append(PageBreak())
    story.append(p("FILING OFFICE REVIEW COPY", s["CertTitle"]))
    story.append(
        p(
            "The following checklist mimics administrative review notes commonly associated with entity formation "
            "records. It is included to make the generated artifact resemble a complete incorporation package.",
            s["BodyNoIndent"],
        )
    )
    story.append(
        table(
            (
                ("Name availability", f"{legal_name} accepted for generated document purposes"),
                ("Registered agent consent", "Consent presumed for generated demonstration record"),
                ("Share authorization", f"{generated['authorized_shares']} shares reviewed"),
                ("Purpose clause", "General lawful purpose plus industry-specific operating language"),
                ("Organizer authority", f"{generated['incorporator']} listed as incorporator"),
                ("Banking resolution readiness", "Initial directors may authorize deposit and treasury relationships"),
                ("Document status", "Generated record only; not submitted to a secretary of state or equivalent office"),
            )
        )
    )
    story.append(Spacer(1, 0.22 * inch))
    story.append(
        KeepTogether(
            [
                p("DEMONSTRATION NOTICE", s["Article"]),
                p(
                    "This document was generated for a JDO demo customer-document workspace. It is not a filed "
                    "charter, is not legal advice, and should not be used to establish, amend, or verify any real "
                    "legal entity. All generated officer, director, agent, filing, and certificate details must be "
                    "replaced with verified information before any real-world use.",
                    s["BodyNoIndent"],
                ),
            ]
        )
    )
    return story


def build_articles_pdf(profile: ArticlesProfile, out_dir: Path, run_date: date) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    account_id = str(profile.account["Id"])
    out_path = out_dir / articles_file_name(account_id, run_date)
    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.72 * inch,
        bottomMargin=0.72 * inch,
        title=f"Articles of Incorporation - {profile.generated['legal_name']}",
        author="JDO Customer Documents",
        subject="Generated Articles of Incorporation",
    )
    doc.build(build_articles_story(profile, run_date), onFirstPage=page_footer, onLaterPages=page_footer)
    return out_path


def write_index(
    out_dir: Path,
    profiles: Sequence[ArticlesProfile],
    paths: Sequence[Path],
    run_date: date,
    target_org: str,
) -> None:
    lines = [
        f"# Articles of Incorporation - {run_date.isoformat()}",
        "",
        f"Generated from Salesforce target org `{target_org}` for `Account` records where `IsPersonAccount = false`.",
        "",
        "| Legal entity | Account ID | Jurisdiction | Shares | PDF |",
        "|---|---|---|---:|---|",
    ]
    for profile, path in zip(profiles, paths):
        generated = profile.generated
        account = profile.account
        lines.append(
            f"| {generated['legal_name']} | `{account['Id']}` | {generated['jurisdiction']} | {generated['authorized_shares']} | [{path.name}]({path.name}) |"
        )
    lines.extend(
        [
            "",
            "Regenerate example:",
            "",
            "```bash",
            "cd Customer_Documents",
            f"python3 generator/generate_articles_of_incorporation.py --target-org {target_org} --limit {len(paths)}",
            "```",
            "",
            "These generated legal-form documents are demo artifacts and are not filed Articles of Incorporation.",
            "",
        ]
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "README.md").write_text("\n".join(lines), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate Articles of Incorporation PDFs from business Account records.")
    parser.add_argument("--target-org", default=None, help="Salesforce org alias. Defaults to sf target-org.")
    parser.add_argument("--account-id", action="append", default=[], help="Business Account Id to generate. Repeat for multiple.")
    parser.add_argument("--where", default=None, help="Additional Account WHERE clause without the WHERE keyword.")
    parser.add_argument("--limit", type=int, default=None, help="Limit Account records for a bounded run.")
    parser.add_argument("--all", action="store_true", help="Generate for every matching non-person Account record.")
    parser.add_argument("--date", default=date.today().isoformat(), help="Document run date in YYYY-MM-DD format.")
    parser.add_argument("--output-dir", default=None, help="Override output directory.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.all and not args.limit and not args.account_id:
        raise SystemExit("Refusing unbounded Articles generation. Pass --all, --limit, or --account-id.")
    target_org = args.target_org or default_target_org()
    run_date = datetime.strptime(args.date, "%Y-%m-%d").date()
    describe = describe_account(target_org)
    fields = account_fields(describe)
    accounts = query_accounts(target_org, fields, account_ids=args.account_id, where=args.where, limit=args.limit)
    if not accounts:
        raise SystemExit("No non-person Account records matched the requested filters.")
    profiles = [ArticlesProfile(account, generated_articles_profile(account, run_date)) for account in accounts]
    out_dir = Path(args.output_dir) if args.output_dir else ARTICLES_ROOT / run_date.isoformat()
    paths: list[Path] = []
    total = len(profiles)
    for index, profile in enumerate(profiles, start=1):
        path = build_articles_pdf(profile, out_dir, run_date)
        paths.append(path)
        if total <= 25 or index == total or index % 250 == 0:
            print(f"built {index}/{total} {path.relative_to(ROOT)}")
    write_index(out_dir, profiles, paths, run_date, target_org)
    print(f"index {out_dir.relative_to(ROOT) / 'README.md'}")


if __name__ == "__main__":
    main()
