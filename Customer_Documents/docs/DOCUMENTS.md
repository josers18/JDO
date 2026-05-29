# Customer Documents - Generation Guide

This project follows the same broad pattern as `Cumulus_Products`: source content is kept in generator specs, reusable ReportLab primitives live in `brand.py`, and generated PDFs plus generated indexes are rebuilt from code.

The document style is intentionally different. These are content-heavy operating briefs, not brochures. Prefer detailed narrative sections, source validation, owner checklists, action plans, and appendices over marketing-style layout.

Salesforce-backed Articles of Incorporation are a separate legal-form document type. They intentionally do not use `brand.py` or the shared Cumulus page shell.

## Build

```bash
cd Customer_Documents
python3 generator/generate_documents.py
```

The generator:

1. Builds every `CustomerDocumentSpec`.
2. Writes PDFs into `documents/<category>/`.
3. Refreshes `documents/README.md`.
4. Refreshes `docs/ARTIFACTS.md`.

## Generate KYC documents from Salesforce

KYC generation reads live Salesforce Account records through the Salesforce CLI and writes PDFs to `documents/04_KYC/<date>/`.

```bash
cd Customer_Documents

# Bounded smoke
python3 generator/generate_kyc_documents.py --target-org jdo-uqj0jr --limit 10

# Filtered run
python3 generator/generate_kyc_documents.py --target-org jdo-uqj0jr --where "BillingCountry = 'United States'" --limit 100

# Specific Account
python3 generator/generate_kyc_documents.py --target-org jdo-uqj0jr --account-id 001XXXXXXXXXXXXXXX

# Full-org run
python3 generator/generate_kyc_documents.py --target-org jdo-uqj0jr --all
```

The current default org has 36K+ Accounts, so use `--all` only when that output volume is intended.

By default, KYC generation describes Account and queries every safe Account field in chunks. Use `--kyc-fields-only` for a smaller curated field set.

## Generate Articles of Incorporation from Salesforce

Articles generation reads live Salesforce Account records where `IsPersonAccount = false` and writes legal-form PDFs to `documents/05_Articles_of_Incorporation/<date>/`.

```bash
cd Customer_Documents

# Bounded smoke
python3 generator/generate_articles_of_incorporation.py --target-org jdo-uqj0jr --limit 10

# Filtered run
python3 generator/generate_articles_of_incorporation.py --target-org jdo-uqj0jr --where "BillingState = 'NY'" --limit 100

# Specific business Account
python3 generator/generate_articles_of_incorporation.py --target-org jdo-uqj0jr --account-id 001XXXXXXXXXXXXXXX

# Full business-account run
python3 generator/generate_articles_of_incorporation.py --target-org jdo-uqj0jr --all
```

The current default org has 10K+ non-person Accounts. Use `--all` only when that output volume is intended.

## Add a document

1. Add a new `CustomerDocumentSpec` in `generator/generate_documents.py`.
2. Reuse an existing folder or add a clearly numbered category folder.
3. Keep file names in the `Cumulus_<Name>.pdf` pattern.
4. Use one of the existing segment keys: `retail`, `wealth`, or `commercial`.
5. Run `python3 generator/generate_documents.py`.
6. Run `python3 -m unittest discover -s tests`.
7. Update `docs/DOCUMENT_SPECS.md` if the catalog or category model changes.

## Add a document primitive

Reusable document primitives belong in `generator/brand.py`, not inside document specs. Add a function or flowable there, then call it from the generator.

## QA checklist

- PDFs open and have the Cumulus page shell.
- Segment accent matches Retail, Wealth, or Commercial.
- Demo disclaimer appears in the footer and disclosures.
- Document code appears in the header.
- No generated document contains real customer data or sensitive identifiers.
- `documents/README.md` and `docs/ARTIFACTS.md` match the generated PDFs.
- KYC PDFs use `<AccountId>_KYC_<date>.pdf` naming.
- KYC output folder has a run-level `README.md` index.
- Articles PDFs use `<AccountId>_Articles_of_Incorporation_<date>.pdf` naming.
- Articles output only includes records where `IsPersonAccount = false`.
- Articles output folder has a run-level `README.md` index.
