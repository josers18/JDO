# Changelog

All notable changes to the `Cumulus_Products` demo asset are documented here.

## 2026-05-27

### Added

- Added `generator/generate_offers.py`, a data-driven all-product offer generator that creates one campaign offer PDF for each of the 55 Cumulus Bank products.
- Added the `Offers/` collateral tree with 55 generated PDFs across the same 8 category folders as `brochures/`.
- Added generated offer index and guardrails in `Offers/README.md`.
- Added `docs/OFFERS.md` with offer authoring rules, regeneration instructions, and QA checklist.

### Changed

- Updated `README.md` to describe the full 110-PDF collateral set, offer badges, offer structure, and rebuild commands.
- Updated `AGENTS.md` with offer-generation conventions, common mistakes, and subfolder-specific guidance.
- Updated `docs/PRODUCT_SPECS.md` with offer document structure and offer file-naming conventions.
- Updated `docs/ARTIFACTS.md` with offer artifact inventory and generator references.
- Updated `docs/DIAGRAMS.md` with the offer generation branch and offer document layout.

### Verified

- Generated 55 offer PDFs under `Offers/`.
- Verified all offer PDFs open with PyMuPDF.
- Verified offer PDF count matches the 55-product brochure catalog.
- Verified every offer PDF includes the fictitious-institution and illustrative-only disclaimer.
