from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable, Sequence

import brand as B

ROOT = Path(__file__).resolve().parent.parent
KYC_ROOT = ROOT / "documents" / "04_KYC"

MAX_QUERY_FIELDS = 80

STANDARD_ACCOUNT_FIELDS = (
    "Id",
    "Name",
    "IsPersonAccount",
    "PersonContactId",
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
    "Rating",
    "AccountSource",
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
    "FirstName",
    "MiddleName",
    "LastName",
    "Salutation",
    "PersonTitle",
    "PersonDepartment",
    "PersonBirthdate",
    "PersonEmail",
    "PersonMobilePhone",
    "PersonHomePhone",
    "PersonOtherPhone",
    "PersonLeadSource",
    "PersonMailingStreet",
    "PersonMailingCity",
    "PersonMailingState",
    "PersonMailingPostalCode",
    "PersonMailingCountry",
    "FinServ__ClientCategory__c",
    "FinServ__CustomerID__c",
    "FinServ__PrimaryContact__c",
    "FinServ__PrimaryAddressIsBilling__c",
    "FinServ__SourceSystemId__c",
    "External_ID__c",
    "External_ID_c__c",
    "LegacyId__c",
    "Customer_ID__c",
    "MDM_ID__c",
    "Income__pc",
    "NetWorth__pc",
    "CreditRating__pc",
    "Tier__pc",
    "LifetimeValue__pc",
    "LastUsedChannel__pc",
    "CommunicationPreferences__pc",
    "ContactPreference__pc",
    "Contact_Status__pc",
    "Category__pc",
    "Total_Relationship__pc",
    "Rel_Role__pc",
    "xDO_MDC_Propensity_to_Churn__pc",
    "xDO_MDC_Cust360_Purchase_Score__pc",
)

RELATIONSHIP_FIELDS = (
    ("RecordTypeId", "RecordType.Name"),
    ("RecordTypeId", "RecordType.DeveloperName"),
    ("OwnerId", "Owner.Name"),
    ("ParentId", "Parent.Name"),
)

SKIP_ALL_FIELD_TYPES = {"address", "base64", "complexvalue", "location"}

RELATED_COUNT_SPECS = (
    ("Contact", "AccountId", "Contacts"),
    ("Opportunity", "AccountId", "Opportunities"),
    ("Case", "AccountId", "Cases"),
    ("Task", "AccountId", "Tasks"),
    ("Event", "AccountId", "Events"),
)


@dataclass(frozen=True)
class KycProfile:
    account: dict[str, Any]
    field_labels: dict[str, str]
    related_counts: dict[str, int]
    generated: dict[str, Any]


class SalesforceCliError(RuntimeError):
    pass


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


def describe_sobject(target_org: str, sobject: str, *, required: bool = False) -> dict[str, Any] | None:
    try:
        return run_sf_json(
            ["sf", "sobject", "describe", "--target-org", target_org, "--sobject", sobject, "--json"]
        )["result"]
    except SalesforceCliError:
        if required:
            raise
        return None


def account_describe(target_org: str) -> dict[str, Any]:
    describe = describe_sobject(target_org, "Account", required=True)
    if not describe:
        raise SalesforceCliError("Unable to describe Account in the target org.")
    return describe


def field_map(describe: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {field["name"]: field for field in describe.get("fields", [])}


def account_fields(describe: dict[str, Any], include_all_fields: bool) -> tuple[list[str], dict[str, str]]:
    fields = field_map(describe)
    selected: list[str] = []
    for field in STANDARD_ACCOUNT_FIELDS:
        if field in fields and field not in selected:
            selected.append(field)
    for required_by, relationship_field in RELATIONSHIP_FIELDS:
        if required_by in fields and relationship_field not in selected:
            selected.append(relationship_field)
    if include_all_fields:
        for name, meta in sorted(fields.items()):
            if name in selected:
                continue
            if meta.get("deprecatedAndHidden"):
                continue
            if meta.get("compoundFieldName"):
                continue
            if meta.get("type") in SKIP_ALL_FIELD_TYPES:
                continue
            selected.append(name)
    labels = {name: meta.get("label", name) for name, meta in fields.items()}
    labels.update(
        {
            "RecordType.Name": "Record Type",
            "RecordType.DeveloperName": "Record Type API Name",
            "Owner.Name": "Owner",
            "Parent.Name": "Parent Account",
        }
    )
    return selected, labels


def chunked(values: Sequence[str], size: int) -> Iterable[Sequence[str]]:
    for index in range(0, len(values), size):
        yield values[index : index + size]


def build_where_clause(account_ids: Sequence[str], user_where: str | None) -> str:
    clauses = []
    if account_ids:
        quoted = ", ".join(f"'{account_id}'" for account_id in account_ids)
        clauses.append(f"Id IN ({quoted})")
    if user_where:
        clauses.append(f"({user_where})")
    if not clauses:
        return ""
    return " WHERE " + " AND ".join(clauses)


def query_accounts(
    target_org: str,
    fields: Sequence[str],
    *,
    account_ids: Sequence[str],
    where: str | None,
    limit: int | None,
) -> list[dict[str, Any]]:
    where_clause = build_where_clause(account_ids, where)
    order_clause = " ORDER BY LastModifiedDate DESC"
    limit_clause = f" LIMIT {limit}" if limit else ""
    records_by_id: dict[str, dict[str, Any]] = {}
    ordered_ids: list[str] = []
    base_fields = ["Id"]
    query_fields = [field for field in fields if field != "Id"]
    for chunk in chunked(query_fields, MAX_QUERY_FIELDS):
        selected = base_fields + list(chunk)
        soql = f"SELECT {', '.join(selected)} FROM Account{where_clause}{order_clause}{limit_clause}"
        payload = run_sf_json(["sf", "data", "query", "--target-org", target_org, "--query", soql, "--json"])
        for record in payload["result"].get("records", []):
            account_id = record.get("Id")
            if not account_id:
                continue
            cleaned = {key: value for key, value in record.items() if key != "attributes"}
            if account_id not in records_by_id:
                records_by_id[account_id] = cleaned
                ordered_ids.append(account_id)
            else:
                records_by_id[account_id].update(cleaned)
    return [records_by_id[account_id] for account_id in ordered_ids]


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


def describe_field_exists(target_org: str, sobject: str, field: str) -> bool:
    describe = describe_sobject(target_org, sobject)
    if not describe:
        return False
    return field in field_map(describe)


def query_related_counts(target_org: str, account_ids: Sequence[str]) -> dict[str, dict[str, int]]:
    if not account_ids or len(account_ids) > 200:
        return {account_id: {} for account_id in account_ids}
    counts_by_account = {account_id: {} for account_id in account_ids}
    quoted = ", ".join(f"'{account_id}'" for account_id in account_ids)
    for sobject, account_field, label in RELATED_COUNT_SPECS:
        if not describe_field_exists(target_org, sobject, account_field):
            continue
        soql = (
            f"SELECT {account_field} AccountId, COUNT(Id) Total "
            f"FROM {sobject} WHERE {account_field} IN ({quoted}) GROUP BY {account_field}"
        )
        try:
            payload = run_sf_json(["sf", "data", "query", "--target-org", target_org, "--query", soql, "--json"])
        except SalesforceCliError:
            continue
        for record in payload["result"].get("records", []):
            account_id = record.get("AccountId")
            if account_id in counts_by_account:
                counts_by_account[account_id][label] = int(record.get("Total") or 0)
    return counts_by_account


def seed_int(account_id: str, salt: str, modulo: int) -> int:
    digest = hashlib.sha256(f"{account_id}:{salt}".encode("utf-8")).hexdigest()
    return int(digest[:12], 16) % modulo


def pick(account_id: str, salt: str, choices: Sequence[str]) -> str:
    return choices[seed_int(account_id, salt, len(choices))]


def money_range(account_id: str, salt: str, low: int, high: int, step: int = 1000) -> str:
    steps = max(1, (high - low) // step)
    value = low + seed_int(account_id, salt, steps + 1) * step
    return f"${value:,.0f}"


def account_type(account: dict[str, Any]) -> str:
    record_type = str(account.get("RecordType.Name") or account.get("RecordType.DeveloperName") or "")
    category = str(account.get("FinServ__ClientCategory__c") or "")
    if account.get("IsPersonAccount") or "Person" in record_type or category in {"Retail", "Wealth Management"}:
        return "Individual"
    if "Household" in record_type:
        return "Household"
    return "Business"


def risk_rating(account: dict[str, Any], related_counts: dict[str, int]) -> tuple[str, int, list[str]]:
    score = 25
    reasons: list[str] = []
    industry = str(account.get("Industry") or "").lower()
    country = str(account.get("BillingCountry") or account.get("PersonMailingCountry") or "")
    revenue = account.get("AnnualRevenue") or 0
    employees = account.get("NumberOfEmployees") or 0
    if any(term in industry for term in ("crypto", "casino", "gaming", "money", "foreign", "metals")):
        score += 35
        reasons.append("industry requires enhanced review")
    if country and country not in {"United States", "USA", "US"}:
        score += 18
        reasons.append("non-US address requires geography review")
    if isinstance(revenue, (int, float)) and revenue > 50_000_000:
        score += 12
        reasons.append("large reported revenue")
    if isinstance(employees, (int, float)) and employees > 250:
        score += 8
        reasons.append("larger operating footprint")
    if related_counts.get("Cases", 0) > 3:
        score += 8
        reasons.append("recent service volume")
    if account_type(account) == "Household":
        score += 4
        reasons.append("household-level relationship")
    if not reasons:
        reasons.append("standard customer profile based on available fields")
    if score >= 70:
        return "High", min(score, 95), reasons
    if score >= 45:
        return "Medium", score, reasons
    return "Low", score, reasons


def generated_profile(account: dict[str, Any], related_counts: dict[str, int], run_date: date) -> dict[str, Any]:
    account_id = str(account["Id"])
    customer_type = account_type(account)
    risk, score, reasons = risk_rating(account, related_counts)
    pep_status = "Potential match - review required" if seed_int(account_id, "pep", 100) >= 96 else "No match indicated"
    sanctions = "No match indicated" if seed_int(account_id, "sanctions", 100) < 99 else "Potential match - review required"
    adverse_media = pick(
        account_id,
        "adverse",
        ("No adverse media indicated", "Minor service-related media note", "Industry watchlist review recommended"),
    )
    if customer_type == "Business":
        source_of_funds = pick(
            account_id,
            "business-source-funds",
            ("Operating revenue", "Receivables collection", "Owner capital contribution", "Contract proceeds"),
        )
        source_of_wealth = pick(
            account_id,
            "business-source-wealth",
            ("Business ownership", "Retained earnings", "Private investment", "Real estate and operating assets"),
        )
        expected_activity = (
            f"Monthly deposits {money_range(account_id, 'dep', 75000, 1800000, 25000)}; "
            f"monthly wires/ACH {money_range(account_id, 'ach', 25000, 900000, 25000)}."
        )
        beneficial_owner = pick(
            account_id,
            "bo",
            ("Majority owner verified", "Two controlling owners expected", "Managing member certification required"),
        )
    elif customer_type == "Household":
        source_of_funds = pick(account_id, "hh-source-funds", ("Payroll deposits", "Investment distributions", "Retirement income"))
        source_of_wealth = pick(account_id, "hh-source-wealth", ("Employment income", "Long-term savings", "Home equity and investments"))
        expected_activity = (
            f"Monthly deposits {money_range(account_id, 'hh-dep', 8000, 75000, 1000)}; "
            f"monthly outgoing activity {money_range(account_id, 'hh-out', 5000, 60000, 1000)}."
        )
        beneficial_owner = "Household members and relationship roles require CRM validation"
    else:
        source_of_funds = pick(account_id, "retail-source-funds", ("Payroll", "Retirement income", "Business income", "Investment income"))
        source_of_wealth = pick(account_id, "retail-source-wealth", ("Employment savings", "Retirement savings", "Real estate equity", "Investment portfolio"))
        expected_activity = (
            f"Monthly deposits {money_range(account_id, 'ret-dep', 3000, 45000, 500)}; "
            f"monthly card/debit activity {money_range(account_id, 'ret-card', 1000, 18000, 250)}."
        )
        beneficial_owner = "Not applicable for individual customer; verify identity and authorized agents"
    return {
        "run_date": run_date.isoformat(),
        "customer_type": customer_type,
        "risk_rating": risk,
        "risk_score": score,
        "risk_reasons": reasons,
        "pep_status": pep_status,
        "sanctions_status": sanctions,
        "adverse_media": adverse_media,
        "source_of_funds": source_of_funds,
        "source_of_wealth": source_of_wealth,
        "expected_activity": expected_activity,
        "beneficial_owner": beneficial_owner,
        "review_cycle": "Annual" if risk == "Low" else "Semiannual" if risk == "Medium" else "Quarterly",
        "next_review_date": f"{run_date.year + 1}-{run_date.month:02d}-{run_date.day:02d}"
        if risk == "Low"
        else f"{run_date.year}-{min(run_date.month + (6 if risk == 'Medium' else 3), 12):02d}-{run_date.day:02d}",
        "id_document": pick(account_id, "id-doc", ("Driver license", "Passport", "State ID", "Business formation record")),
        "verification_method": pick(
            account_id,
            "verify",
            ("Salesforce profile plus documentary review", "Banker attestation plus system checks", "Documentary review with exception queue"),
        ),
    }


def non_empty_field_rows(account: dict[str, Any], labels: dict[str, str]) -> list[tuple[str, str, str]]:
    rows = []
    for key in sorted(account):
        value = account[key]
        if value in (None, "", [], {}):
            continue
        if key == "Id":
            continue
        rows.append((labels.get(key, key), key, str(value)))
    return rows


def address_summary(account: dict[str, Any]) -> str:
    parts = [
        account.get("BillingStreet") or account.get("PersonMailingStreet"),
        account.get("BillingCity") or account.get("PersonMailingCity"),
        account.get("BillingState") or account.get("PersonMailingState"),
        account.get("BillingPostalCode") or account.get("PersonMailingPostalCode"),
        account.get("BillingCountry") or account.get("PersonMailingCountry"),
    ]
    return ", ".join(str(part) for part in parts if part) or "Address not available in queried Account fields"


def segment_for_profile(profile: KycProfile) -> str:
    generated = profile.generated
    account = profile.account
    if generated["customer_type"] == "Business":
        return "commercial"
    category = str(account.get("FinServ__ClientCategory__c") or "")
    if "Wealth" in category or (account.get("NetWorth__pc") or 0):
        return "wealth"
    return "retail"


def kyc_file_name(account_id: str, run_date: date) -> str:
    return f"{account_id}_KYC_{run_date.isoformat()}.pdf"


def kyc_rows(profile: KycProfile) -> dict[str, list[tuple[str, str]]]:
    account = profile.account
    generated = profile.generated
    return {
        "identity": [
            ("Account ID", account.get("Id", "")),
            ("Customer name", account.get("Name", "")),
            ("Customer type", generated["customer_type"]),
            ("Record type", account.get("RecordType.Name") or account.get("RecordType.DeveloperName") or "Not available"),
            ("Owner", account.get("Owner.Name") or "Not available"),
            ("Primary address", address_summary(account)),
            ("Phone", account.get("Phone") or account.get("PersonMobilePhone") or account.get("PersonHomePhone") or "Not available"),
            ("Email", account.get("PersonEmail") or "Not available"),
        ],
        "kyc": [
            ("KYC risk rating", f"{generated['risk_rating']} ({generated['risk_score']}/100)"),
            ("Risk drivers", "; ".join(generated["risk_reasons"])),
            ("PEP screen", generated["pep_status"]),
            ("Sanctions screen", generated["sanctions_status"]),
            ("Adverse media", generated["adverse_media"]),
            ("Review cycle", generated["review_cycle"]),
            ("Next review date", generated["next_review_date"]),
        ],
        "financial": [
            ("Source of funds", generated["source_of_funds"]),
            ("Source of wealth", generated["source_of_wealth"]),
            ("Expected activity", generated["expected_activity"]),
            ("Beneficial ownership", generated["beneficial_owner"]),
            ("Industry", account.get("Industry") or "Not available"),
            ("Annual revenue", f"${account.get('AnnualRevenue'):,.0f}" if isinstance(account.get("AnnualRevenue"), (int, float)) else "Not available"),
            ("Employees", str(account.get("NumberOfEmployees") or "Not available")),
        ],
        "verification": [
            ("Identity document", generated["id_document"]),
            ("Verification method", generated["verification_method"]),
            ("Salesforce data timestamp", account.get("LastModifiedDate") or "Not available"),
            ("KYC generated date", generated["run_date"]),
        ],
    }


def build_kyc_pdf(profile: KycProfile, out_dir: Path, run_date: date) -> Path:
    account = profile.account
    generated = profile.generated
    B.set_theme(segment_for_profile(profile))
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / kyc_file_name(str(account["Id"]), run_date)
    doc = B.CustomerDocumentDoc(
        str(out_path),
        title=f"KYC Profile - {account.get('Name', account['Id'])}",
        document_code=f"KYC-{account['Id']}",
        segment=segment_for_profile(profile),
    )
    rows = kyc_rows(profile)
    story = []
    story.extend(
        B.cover_block(
            title=f"KYC Profile - {account.get('Name', account['Id'])}",
            lede=(
                "Comprehensive generated KYC profile assembled from Salesforce Account data, "
                "related-record counts, and deterministic demo enrichment where source data is incomplete."
            ),
            document_code=f"KYC-{account['Id']}",
            rows=(
                ("Account ID", str(account["Id"])),
                ("Customer type", generated["customer_type"]),
                ("Risk rating", f"{generated['risk_rating']} ({generated['risk_score']}/100)"),
                ("Generated", run_date.isoformat()),
            ),
        )
    )
    story.append(B.section_header("Executive KYC summary", "Customer due diligence"))
    story.append(
        B.para(
            f"This profile summarizes the KYC posture for {account.get('Name', account['Id'])}. "
            f"The current generated risk rating is {generated['risk_rating']} with a score of "
            f"{generated['risk_score']}/100. The profile combines live Account fields with "
            "deterministic enrichment so demo documents remain complete even when optional KYC fields are blank.",
            "Lead",
        )
    )
    story.append(B.callout("Review posture", "Generated information is a banker draft and must be reconciled with the Salesforce record, approved systems, and policy procedures before any customer-facing use."))
    story.append(B.Spacer(1, 0.12 * 72))
    story.append(B.data_table(("Field", "Value"), rows["identity"], col_widths=[1.65 * 72, 4.7 * 72]))
    story.append(B.PageBreak())
    story.append(B.section_header("Customer identification profile", "CIP"))
    story.append(B.data_table(("Field", "Value"), rows["verification"], col_widths=[1.85 * 72, 4.5 * 72]))
    story.append(B.Spacer(1, 0.12 * 72))
    story.append(B.section_header("Risk assessment", "AML and sanctions"))
    story.append(B.data_table(("Field", "Value"), rows["kyc"], col_widths=[1.75 * 72, 4.6 * 72]))
    story.append(B.Spacer(1, 0.12 * 72))
    story.extend(
        B.metrics_block(
            (
                ("KYC completeness", min(95, 52 + len(non_empty_field_rows(account, profile.field_labels)) // 2), "source fields populated"),
                ("AML risk", generated["risk_score"], generated["risk_rating"].lower()),
                ("Review urgency", 35 if generated["risk_rating"] == "Low" else 62 if generated["risk_rating"] == "Medium" else 88, generated["review_cycle"].lower()),
            )
        )
    )
    story.append(B.PageBreak())
    story.append(B.section_header("Financial profile", "Expected relationship activity"))
    story.append(B.data_table(("Field", "Value"), rows["financial"], col_widths=[1.85 * 72, 4.5 * 72]))
    story.append(B.Spacer(1, 0.12 * 72))
    story.append(
        B.para(
            "Expected activity is generated from the Account profile and should be compared with observed account behavior once transactions, treasury usage, deposits, or lending balances are available in the system of record.",
            "Body",
        )
    )
    story.append(B.section_header("Related Salesforce activity", "Relationship evidence"))
    related_rows = [(label, str(count)) for label, count in sorted(profile.related_counts.items())]
    if not related_rows:
        related_rows = [("Related counts", "Not queried for this run or no related records found")]
    story.append(B.data_table(("Related object", "Count"), related_rows, col_widths=[2.2 * 72, 4.15 * 72]))
    story.append(B.PageBreak())
    story.append(B.section_header("KYC controls and document checklist", "Required review"))
    story.append(
        B.data_table(
            ("Control", "Status / required action"),
            (
                ("Identity verification", "Validate documentary or non-documentary evidence before approval."),
                ("Address verification", "Confirm physical address and mailing address against approved evidence."),
                ("Beneficial ownership", generated["beneficial_owner"]),
                ("Sanctions / PEP / adverse media", "Review generated screen outputs and resolve any possible match."),
                ("Source of funds / wealth", "Validate against banker notes, documentation, and observed behavior."),
                ("Ongoing monitoring", f"Set review cadence to {generated['review_cycle']} based on generated risk."),
            ),
            col_widths=[2.1 * 72, 4.25 * 72],
        )
    )
    story.append(B.Spacer(1, 0.12 * 72))
    story.append(B.section_header("Salesforce source field inventory", "Non-empty Account fields"))
    field_rows = non_empty_field_rows(account, profile.field_labels)
    if not field_rows:
        field_rows = [("No fields", "N/A", "No non-empty queried Account fields found")]
    story.append(B.data_table(("Label", "API name", "Value"), field_rows[:55], col_widths=[1.7 * 72, 1.8 * 72, 2.85 * 72]))
    if len(field_rows) > 55:
        story.append(B.para(f"{len(field_rows) - 55} additional non-empty fields were omitted from the PDF table for readability; rerun with JSON export support if a full machine-readable extract is needed.", "Small"))
    story.append(B.PageBreak())
    story.append(B.section_header("Policy notes", "Generated content controls"))
    story.extend(
        B.bullet_block(
            (
                "This KYC document is generated from Salesforce data plus deterministic demo enrichment for missing banking KYC details.",
                "Generated enrichment should be treated as plausible placeholder content, not verified customer information.",
                "Real KYC approval requires policy review, source-document validation, sanctions screening, and appropriate sign-off.",
                "Do not send this generated PDF to customers without replacing placeholder content and completing compliance review.",
            )
        )
    )
    story.extend(B.disclosure_block(("Generated KYC documents are demo artifacts for JDO and Cumulus Bank scenarios.",)))
    story.extend(B.back_cover_block(str(account.get("Owner.Name") or "Relationship owner")))
    doc.build(story)
    return out_path


def build_profiles(
    accounts: Sequence[dict[str, Any]],
    labels: dict[str, str],
    related_counts: dict[str, dict[str, int]],
    run_date: date,
) -> list[KycProfile]:
    profiles = []
    for record in accounts:
        flat = flatten_record(record)
        account_id = flat["Id"]
        counts = related_counts.get(account_id, {})
        profiles.append(KycProfile(flat, labels, counts, generated_profile(flat, counts, run_date)))
    return profiles


def write_index(out_dir: Path, profiles: Sequence[KycProfile], paths: Sequence[Path], run_date: date, target_org: str) -> None:
    lines = [
        f"# KYC Documents - {run_date.isoformat()}",
        "",
        f"Generated from Salesforce target org `{target_org}`.",
        "",
        "| Account | Account ID | Customer type | Risk | PDF |",
        "|---|---|---|---|---|",
    ]
    for profile, path in zip(profiles, paths):
        account = profile.account
        generated = profile.generated
        lines.append(
            f"| {account.get('Name', account['Id'])} | `{account['Id']}` | {generated['customer_type']} | {generated['risk_rating']} ({generated['risk_score']}/100) | [{path.name}]({path.name}) |"
        )
    lines.extend(
        [
            "",
            "Regenerate example:",
            "",
            "```bash",
            "cd Customer_Documents",
            f"python3 generator/generate_kyc_documents.py --target-org {target_org} --limit {len(paths)}",
            "```",
            "",
        ]
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "README.md").write_text("\n".join(lines), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate KYC PDFs from Salesforce Account records.")
    parser.add_argument("--target-org", default=None, help="Salesforce org alias. Defaults to sf target-org.")
    parser.add_argument("--account-id", action="append", default=[], help="Account Id to generate. Repeat for multiple.")
    parser.add_argument("--where", default=None, help="Additional Account WHERE clause without the WHERE keyword.")
    parser.add_argument("--limit", type=int, default=None, help="Limit Account records for a bounded run.")
    parser.add_argument("--all", action="store_true", help="Generate for every matching Account record.")
    parser.add_argument("--all-account-fields", action="store_true", help="Query every safe Account field in chunks. This is the default; kept for explicitness.")
    parser.add_argument("--kyc-fields-only", action="store_true", help="Use only the curated KYC Account field set.")
    parser.add_argument("--date", default=date.today().isoformat(), help="KYC run date in YYYY-MM-DD format.")
    parser.add_argument("--output-dir", default=None, help="Override output directory.")
    return parser.parse_args()


def default_target_org() -> str:
    payload = run_sf_json(["sf", "config", "get", "target-org", "--json"])
    result = payload.get("result") or []
    for item in result:
        if item.get("name") == "target-org" and item.get("value"):
            return item["value"]
    raise SalesforceCliError("No target org configured. Pass --target-org.")


def main() -> None:
    args = parse_args()
    if not args.all and not args.limit and not args.account_id:
        raise SystemExit("Refusing unbounded KYC generation. Pass --all, --limit, or --account-id.")
    target_org = args.target_org or default_target_org()
    run_date = datetime.strptime(args.date, "%Y-%m-%d").date()
    describe = account_describe(target_org)
    fields, labels = account_fields(describe, include_all_fields=not args.kyc_fields_only or args.all_account_fields)
    accounts = query_accounts(target_org, fields, account_ids=args.account_id, where=args.where, limit=args.limit)
    if not accounts:
        raise SystemExit("No Account records matched the requested filters.")
    account_ids = [record["Id"] for record in accounts if record.get("Id")]
    related_counts = query_related_counts(target_org, account_ids)
    profiles = build_profiles(accounts, labels, related_counts, run_date)
    out_dir = Path(args.output_dir) if args.output_dir else KYC_ROOT / run_date.isoformat()
    paths = [build_kyc_pdf(profile, out_dir, run_date) for profile in profiles]
    write_index(out_dir, profiles, paths, run_date, target_org)
    for path in paths:
        print(f"built {path.relative_to(ROOT)}")
    print(f"index {out_dir.relative_to(ROOT) / 'README.md'}")


if __name__ == "__main__":
    main()
