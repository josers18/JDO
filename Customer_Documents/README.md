# Customer Documents

Generated customer-document catalog for **Cumulus Bank**, a fictitious financial-services brand used across the JDO demo environment. This project mirrors the document-generation pattern in `Cumulus_Products`: shared ReportLab primitives, generator-owned PDF outputs, local artifact documentation, and demo-safe disclosure controls. The documents themselves are more content-heavy operating briefs, not product brochures and not tied to the Cumulus_Products visual system.

![Documents](https://img.shields.io/badge/Documents-9_static_%2B_runs-0A1F3D)
![Segments](https://img.shields.io/badge/Segments-3-0E7C86)
![Engine](https://img.shields.io/badge/Engine-ReportLab-B08D3C)
![Status](https://img.shields.io/badge/Status-Demo_asset-2E7D5B)

> **Cumulus Bank is a fictitious institution.** All customer names, signals, scores, summaries, and recommendations in this project are illustrative demo content and are not approved production customer communications.

---

## At a glance

| | |
|---|---|
| **Documents** | 9 static generated customer PDFs + Salesforce-backed KYC and Articles of Incorporation runs |
| **Segments** | Retail, Wealth, Commercial |
| **Categories** | Onboarding, Relationship Review, Service and Retention |
| **Engine** | ReportLab PDF generation |
| **Source** | `generator/generate_documents.py`, `generator/generate_kyc_documents.py`, `generator/generate_articles_of_incorporation.py`, plus shared `generator/brand.py` |
| **Spec** | `docs/DOCUMENT_SPECS.md` |
| **Artifact index** | `docs/ARTIFACTS.md` |

## Catalog

| Folder | Segment coverage | Documents |
|---|---|---|
| [`documents/01_Onboarding`](documents/01_Onboarding) | Retail, Wealth, Commercial | Retail Welcome Packet, Wealth Discovery Summary, Commercial Onboarding Checklist |
| [`documents/02_Relationship_Review`](documents/02_Relationship_Review) | Retail, Wealth, Commercial | Retail Financial Snapshot, Wealth Annual Review, Commercial Relationship Review |
| [`documents/03_Service_and_Retention`](documents/03_Service_and_Retention) | Retail, Wealth, Commercial | Retail Service Follow-Up, Wealth Planning Next Steps, Commercial Treasury Readiness Brief |
| [`documents/04_KYC`](documents/04_KYC) | Live Salesforce Account records | One comprehensive KYC PDF per selected Account, named `<AccountId>_KYC_<date>.pdf` |
| [`documents/05_Articles_of_Incorporation`](documents/05_Articles_of_Incorporation) | Live non-person Salesforce Account records | One legal-form Articles PDF per selected business Account, named `<AccountId>_Articles_of_Incorporation_<date>.pdf` |

Generated index: [`documents/README.md`](documents/README.md)

## Document system

`generator/brand.py` provides the shared document system:

- Neutral page shell, header, footer, demo disclaimer, and contact line
- Retail, Wealth, and Commercial document themes for organization, not brochure branding
- Cover block, narrative sections, source tables, discussion guides, scorecards, controls, appendix, and back cover
- Consistent disclosure framing so generated documents are not confused with production communications

## Rebuilding documents

Set up the build environment once:

```bash
cd Customer_Documents
python3 -m venv .venv && source .venv/bin/activate
pip install reportlab
```

Regenerate every PDF and refresh generated indexes:

```bash
python3 generator/generate_documents.py
```

Generate KYC PDFs from the configured Salesforce org:

```bash
# Bounded smoke run
python3 generator/generate_kyc_documents.py --target-org jdo-uqj0jr --limit 10

# One specific Account
python3 generator/generate_kyc_documents.py --target-org jdo-uqj0jr --account-id 001XXXXXXXXXXXXXXX

# Full org run. The current default org has 36K+ Accounts, so this can create a large output set.
python3 generator/generate_kyc_documents.py --target-org jdo-uqj0jr --all
```

Generate Articles of Incorporation PDFs for business Accounts only:

```bash
# Bounded smoke run
python3 generator/generate_articles_of_incorporation.py --target-org jdo-uqj0jr --limit 10

# One specific business Account
python3 generator/generate_articles_of_incorporation.py --target-org jdo-uqj0jr --account-id 001XXXXXXXXXXXXXXX

# Full business-account run. The current default org has 10K+ non-person Accounts.
python3 generator/generate_articles_of_incorporation.py --target-org jdo-uqj0jr --all
```

Run the local tests:

```bash
python3 -m unittest discover -s tests
```

## Contents

```text
Customer_Documents/
├── README.md
├── AGENTS.md
├── CHANGELOG.md
├── documents/
│   ├── 01_Onboarding/
│   ├── 02_Relationship_Review/
│   ├── 03_Service_and_Retention/
│   ├── 04_KYC/
│   ├── 05_Articles_of_Incorporation/
│   └── README.md
├── docs/
│   ├── ARTIFACTS.md
│   ├── DIAGRAMS.md
│   ├── DOCUMENTS.md
│   └── DOCUMENT_SPECS.md
├── generator/
│   ├── brand.py
│   ├── generate_documents.py
│   ├── generate_articles_of_incorporation.py
│   └── generate_kyc_documents.py
└── tests/
    └── test_document_specs.py
```
