# Changelog

All notable changes to **Customer_Documents**.

## [May 2026] - 2026-05-28

### Added

- Scaffolded `Customer_Documents/` as a Cumulus-style document-generation project.
- Added shared ReportLab brand system in `generator/brand.py`.
- Added `generator/generate_documents.py` with 9 starting customer-document PDFs across Retail, Wealth, and Commercial segments.
- Added `generator/generate_kyc_documents.py` for Salesforce-backed KYC PDFs named `<AccountId>_KYC_<date>.pdf`.
- Added `generator/generate_articles_of_incorporation.py` for Salesforce-backed business Account Articles of Incorporation PDFs named `<AccountId>_Articles_of_Incorporation_<date>.pdf`.
- Added generated `documents/README.md` and `docs/ARTIFACTS.md` output hooks.
- Added local docs: `DOCUMENT_SPECS.md`, `DOCUMENTS.md`, `DIAGRAMS.md`, and this changelog.
- Added unittest coverage for catalog shape, file naming, and required generation inputs.
