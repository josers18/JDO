# Customer Documents - Artifact Inventory

Canonical inventory for the generated customer-document PDFs and source files.

- **Total static documents:** 9
- **Static document generator:** `generator/generate_documents.py`
- **KYC generator:** `generator/generate_kyc_documents.py`
- **Articles generator:** `generator/generate_articles_of_incorporation.py`
- **Shared brand module:** `generator/brand.py`
- **Spec of record:** `docs/DOCUMENT_SPECS.md`
- **Document guide:** `docs/DOCUMENTS.md`

| Document | Segment | Folder | Pages | Size | PDF | Generator |
|---|---|---|---:|---:|---|---|
| Retail Welcome Packet | Retail | `01_Onboarding` | 7 | 16K | [Cumulus_Retail_Welcome_Packet.pdf](../documents/01_Onboarding/Cumulus_Retail_Welcome_Packet.pdf) | `generate_documents.py` |
| Retail Financial Snapshot | Retail | `02_Relationship_Review` | 7 | 16K | [Cumulus_Retail_Financial_Snapshot.pdf](../documents/02_Relationship_Review/Cumulus_Retail_Financial_Snapshot.pdf) | `generate_documents.py` |
| Retail Service Follow-Up | Retail | `03_Service_and_Retention` | 7 | 16K | [Cumulus_Retail_Service_Follow_Up.pdf](../documents/03_Service_and_Retention/Cumulus_Retail_Service_Follow_Up.pdf) | `generate_documents.py` |
| Wealth Discovery Summary | Wealth | `01_Onboarding` | 7 | 16K | [Cumulus_Wealth_Discovery_Summary.pdf](../documents/01_Onboarding/Cumulus_Wealth_Discovery_Summary.pdf) | `generate_documents.py` |
| Wealth Annual Review | Wealth | `02_Relationship_Review` | 7 | 16K | [Cumulus_Wealth_Annual_Review.pdf](../documents/02_Relationship_Review/Cumulus_Wealth_Annual_Review.pdf) | `generate_documents.py` |
| Wealth Planning Next Steps | Wealth | `03_Service_and_Retention` | 7 | 16K | [Cumulus_Wealth_Planning_Next_Steps.pdf](../documents/03_Service_and_Retention/Cumulus_Wealth_Planning_Next_Steps.pdf) | `generate_documents.py` |
| Commercial Onboarding Checklist | Commercial | `01_Onboarding` | 7 | 16K | [Cumulus_Commercial_Onboarding_Checklist.pdf](../documents/01_Onboarding/Cumulus_Commercial_Onboarding_Checklist.pdf) | `generate_documents.py` |
| Commercial Relationship Review | Commercial | `02_Relationship_Review` | 7 | 16K | [Cumulus_Commercial_Relationship_Review.pdf](../documents/02_Relationship_Review/Cumulus_Commercial_Relationship_Review.pdf) | `generate_documents.py` |
| Commercial Treasury Readiness Brief | Commercial | `03_Service_and_Retention` | 7 | 16K | [Cumulus_Commercial_Treasury_Readiness_Brief.pdf](../documents/03_Service_and_Retention/Cumulus_Commercial_Treasury_Readiness_Brief.pdf) | `generate_documents.py` |

## KYC document runs

KYC PDFs are generated from live Salesforce Account records by `generator/generate_kyc_documents.py`.

| Run date | Index |
|---|---|
| 2026-05-29 | [README](../documents/04_KYC/2026-05-29/README.md) |

## Articles of Incorporation runs

Articles PDFs are generated from live non-person Salesforce Account records by `generator/generate_articles_of_incorporation.py`.

| Run date | Index |
|---|---|
| 2026-05-29 | [README](../documents/05_Articles_of_Incorporation/2026-05-29/README.md) |
