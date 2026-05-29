# Customer Documents - Document Specs

This file is the spec of record for the starting Cumulus Bank customer-document catalog.

## Scope

The project generates banker-ready and customer-adjacent PDFs for the JDO demo org. Documents are designed for demos, walkthroughs, and internal workflow examples. They are not production communications.

The project borrows the generator-owned artifact pattern from `Cumulus_Products`, but it does not share the brochure branding model. These documents should read like content-heavy operating briefs: narrative context, evidence, score interpretation, action owners, review controls, and appendices.

## Segment themes

| Segment | Accent | Typical user | Voice |
|---|---|---|---|
| Retail | Teal | Branch banker, service specialist | Clear, practical, service-oriented |
| Wealth | Gold | Advisor, planning specialist | Advisory, structured, careful |
| Commercial | Copper | Relationship manager, treasury specialist | Operational, direct, team-oriented |

## Categories

| Category | Purpose | Starting documents |
|---|---|---|
| `01_Onboarding` | First-stage customer setup and discovery | Retail Welcome Packet, Wealth Discovery Summary, Commercial Onboarding Checklist |
| `02_Relationship_Review` | Periodic banker or advisor review | Retail Financial Snapshot, Wealth Annual Review, Commercial Relationship Review |
| `03_Service_and_Retention` | Follow-up, retention, and specialist next steps | Retail Service Follow-Up, Wealth Planning Next Steps, Commercial Treasury Readiness Brief |
| `04_KYC` | Live Salesforce Account KYC packages | One generated KYC PDF per selected Account record |
| `05_Articles_of_Incorporation` | Live Salesforce business Account legal-form packages | One generated Articles of Incorporation PDF per selected non-person Account record |

## Document contract

Every generated document must include:

- Cover with document title, segment, document code, type, audience, owner, and cadence
- Customer context section
- Key summary table
- Document highlights grid
- Discussion guide
- Readiness signal scorecard
- Signal interpretation table
- Source signal table
- Source validation table
- Action plan with timing, action, and owner
- Operating notes
- Controls section
- Review checklist
- Metadata appendix
- Demo disclosures and back cover

## KYC document contract

KYC PDFs are generated from Salesforce Account records by `generator/generate_kyc_documents.py`.

Every KYC document must include:

- File name in `<AccountId>_KYC_<YYYY-MM-DD>.pdf` format
- Live Salesforce Account identity fields
- Customer type classification
- Risk rating and risk drivers
- CIP verification summary
- Sanctions, PEP, and adverse-media placeholders
- Source of funds and source of wealth
- Expected account activity profile
- Beneficial ownership posture for business customers
- Related Salesforce activity counts when queried
- Non-empty Account source field inventory
- Control checklist and generated-content disclaimers

## Articles of Incorporation contract

Articles PDFs are generated from non-person Salesforce Account records by `generator/generate_articles_of_incorporation.py`.

Every Articles document must include:

- File name in `<AccountId>_Articles_of_Incorporation_<YYYY-MM-DD>.pdf` format
- A hard Account filter of `IsPersonAccount = false`
- Legal-form page styling that does not use the shared Cumulus document template
- Corporate name, jurisdiction, purpose, duration, principal office, registered agent, registered office, shares, incorporator, and initial directors
- Real Salesforce Account context where available, including Account ID, name, record type, owner, industry, revenue, employee count, website, and last modified date
- Deterministic generated details for missing corporate-law fields so repeated runs are stable
- Filing-office-style certificate, review checklist, and generated-record disclaimer

## Guardrails

- Never include real customer data.
- Never include full account numbers, tax identifiers, authentication values, or credentials.
- Generated next best actions are banker drafts, not approved advice.
- Generated Articles of Incorporation are not legal filings and must not be treated as charter evidence.
- Credit, investment, tax, legal, insurance, and fiduciary content must remain conditional and review-gated.
- Customer-facing usage requires approved templates, consent checks, and human review.
