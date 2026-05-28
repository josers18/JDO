# Cumulus Bank Product Offers

Generated marketing-offer collateral for the Cumulus Bank demo product catalog.

- Campaign: Cumulus Offers FY26 Q3
- Window: May 27, 2026 - August 31, 2026
- Documents: 55 PDFs
- Structure: one offer PDF per product, grouped by the same 8 category folders as `brochures/`
- Source: generator/generate_offers.py
- Brand system: generator/brand.py
- Product terms: docs/PRODUCT_SPECS.md

Cumulus Bank is a fictitious institution. These offers, rates, incentives, and disclosures are illustrative only and are not actual financial products or offers of credit.

## Regenerate

From the `Cumulus_Products` folder:

```bash
python3 generator/generate_offers.py
```

The command rebuilds every offer PDF and refreshes this index. It is intentionally named outside the `build_*.py` pattern so the brochure rebuild loop does not pick it up.

## Offer document structure

Each offer PDF is a campaign document rather than a product brochure. It uses the same Cumulus brand system and footer disclosures, but the content is organized around offer execution:

1. Cover with campaign, window, base product terms, primary incentive, offer code, and fulfillment rule
2. Campaign overview and primary client promise
3. Current offer economics: standard terms vs. campaign concession vs. client value
4. Qualification and fulfillment rules
5. FSC campaign playbook: target audiences, trigger events, next best actions, and client journey
6. Controls and disclosure guardrails
7. Product-family disclosures and segment-themed back cover

## Guardrails

- Do not treat these offers as real bank marketing, regulatory disclosures, or credit commitments.
- Keep rates, fees, limits, and base product terms aligned with `docs/PRODUCT_SPECS.md` and the source brochure scripts.
- Keep campaign incentives in `generator/generate_offers.py` so offer collateral remains data-driven and reproducible.
- Preserve the fictitious-institution and illustrative-only disclaimer in every generated document.

## Index

### 01_Personal_Deposits

- [Cumulus Everyday Checking Offer](01_Personal_Deposits/Cumulus_Everyday_Checking_Offer.pdf) - Everyday Direct Deposit Switch
- [Cumulus Premier Checking Offer](01_Personal_Deposits/Cumulus_Premier_Checking_Offer.pdf) - Premier Relationship Bonus
- [Cumulus Statement Savings Offer](01_Personal_Deposits/Cumulus_Statement_Savings_Offer.pdf) - Starter Savings Match
- [Cumulus High-Yield Savings Offer](01_Personal_Deposits/Cumulus_High_Yield_Savings_Offer.pdf) - New Money Yield Booster
- [Cumulus Money Market Offer](01_Personal_Deposits/Cumulus_Money_Market_Offer.pdf) - Liquidity Builder Money Market
- [Cumulus 6Mo CD Offer](01_Personal_Deposits/Cumulus_6Mo_CD_Offer.pdf) - Short-Term CD Rate Lock
- [Cumulus 12Mo CD Offer](01_Personal_Deposits/Cumulus_12Mo_CD_Offer.pdf) - One-Year Rate Advantage CD
- [Cumulus 36Mo CD Offer](01_Personal_Deposits/Cumulus_36Mo_CD_Offer.pdf) - Three-Year Ladder Plus CD
- [Cumulus 60Mo CD Offer](01_Personal_Deposits/Cumulus_60Mo_CD_Offer.pdf) - Five-Year Legacy CD

### 02_Personal_Loans

- [Cumulus Personal Loan Offer](02_Personal_Loans/Cumulus_Personal_Loan_Offer.pdf) - Debt Consolidation Rate Discount
- [Cumulus Auto Loan Offer](02_Personal_Loans/Cumulus_Auto_Loan_Offer.pdf) - Auto Refi and Purchase Drive
- [Cumulus Personal Line of Credit Offer](02_Personal_Loans/Cumulus_Personal_Line_Of_Credit_Offer.pdf) - Ready Reserve Line Offer
- [Cumulus HELOC Offer](02_Personal_Loans/Cumulus_HELOC_Offer.pdf) - Home Equity Project Line
- [Cumulus HELOAN Offer](02_Personal_Loans/Cumulus_HELOAN_Offer.pdf) - Fixed Home Equity Installment Offer
- [Cumulus 30-Year Fixed Mortgage Offer](02_Personal_Loans/Cumulus_30_Year_Fixed_Mortgage_Offer.pdf) - Homebuyer Closing-Cost Credit
- [Cumulus 5/1 ARM Mortgage Offer](02_Personal_Loans/Cumulus_5_1_ARM_Mortgage_Offer.pdf) - Five-Year Flex ARM Offer

### 03_Credit_Cards

- [Cumulus Cash Rewards Card Offer](03_Credit_Cards/Cumulus_Cash_Rewards_Card_Offer.pdf) - Cash Back Kickstart
- [Cumulus Travel Points Card Offer](03_Credit_Cards/Cumulus_Travel_Points_Card_Offer.pdf) - Premier Travel Accelerator
- [Cumulus Secured Card Offer](03_Credit_Cards/Cumulus_Secured_Card_Offer.pdf) - Credit Builder Graduation Path

### 04_Investments

- [Cumulus Brokerage Accounts Offer](04_Investments/Cumulus_Brokerage_Accounts_Offer.pdf) - Brokerage Transfer Advantage
- [Cumulus Managed Advisory Services Offer](04_Investments/Cumulus_Managed_Advisory_Services_Offer.pdf) - Advisory Onboarding Fee Credit
- [Cumulus Roth IRA Offer](04_Investments/Cumulus_Roth_IRA_Offer.pdf) - Roth Auto-Contribution Builder
- [Cumulus Traditional IRA Offer](04_Investments/Cumulus_Traditional_IRA_Offer.pdf) - Traditional IRA Transfer Credit
- [Cumulus 401(k)/403(b) Rollover Offer](04_Investments/Cumulus_401k_403b_Rollover_Offer.pdf) - Rollover Readiness Review
- [Cumulus 529 Education Savings Offer](04_Investments/Cumulus_529_Education_Savings_Offer.pdf) - Education Goal Starter
- [Cumulus Estate Planning Offer](04_Investments/Cumulus_Estate_Planning_Offer.pdf) - Estate Plan Refresh
- [Cumulus Revocable and Irrevocable Trusts Offer](04_Investments/Cumulus_Revocable_and_Irrevocable_Trusts_Offer.pdf) - Trustee Acceptance Credit
- [Cumulus Charitable Trusts Offer](04_Investments/Cumulus_Charitable_Trusts_Offer.pdf) - Philanthropic Trust Illustration
- [Cumulus Special Needs Trust Offer](04_Investments/Cumulus_Special_Needs_Trust_Offer.pdf) - Special Needs Trust Care Review
- [Cumulus Testamentary Trust Offer](04_Investments/Cumulus_Testamentary_Trust_Offer.pdf) - Future Trustee Readiness
- [Cumulus Estate Settlement Services Offer](04_Investments/Cumulus_Estate_Settlement_Services_Offer.pdf) - Executor Support Consultation

### 05_Business_Deposits

- [Cumulus Business Fundamentals Checking Offer](05_Business_Deposits/Cumulus_Business_Fundamentals_Checking_Offer.pdf) - Small Business Operating Bonus
- [Cumulus Business Analyzed Checking Offer](05_Business_Deposits/Cumulus_Business_Analyzed_Checking_Offer.pdf) - Commercial Analysis Credit

### 06_Business_Loans

- [Cumulus Business Term Loans Offer](06_Business_Loans/Cumulus_Business_Term_Loans_Offer.pdf) - Expansion Capital Fee Reduction
- [Cumulus Business Lines of Credit Offer](06_Business_Loans/Cumulus_Business_Lines_of_Credit_Offer.pdf) - Working Capital Line Launch
- [Cumulus SBA Loans Offer](06_Business_Loans/Cumulus_SBA_Loans_Offer.pdf) - SBA Preferred Lender Package
- [Cumulus Commercial Real Estate Financing Offer](06_Business_Loans/Cumulus_Commercial_Real_Estate_Financing_Offer.pdf) - Owner-Occupied CRE Credit
- [Cumulus Asset-Based Lending Offer](06_Business_Loans/Cumulus_Asset_Based_Lending_Offer.pdf) - Borrowing Base Transition Credit
- [Cumulus Syndicated Loans Offer](06_Business_Loans/Cumulus_Syndicated_Loans_Offer.pdf) - Lead Arranger Mandate Credit
- [Cumulus Equipment Loans Offer](06_Business_Loans/Cumulus_Equipment_Loans_Offer.pdf) - Equipment Purchase Rate Break
- [Cumulus Equipment Leasing Offer](06_Business_Loans/Cumulus_Equipment_Leasing_Offer.pdf) - Lease Launch Payment Deferral

### 07_Merchant_Services

- [Cumulus Payment Processing Solutions Offer](07_Merchant_Services/Cumulus_Payment_Processing_Solutions_Offer.pdf) - Merchant Switch Credit
- [Cumulus Point-of-Sale Systems Offer](07_Merchant_Services/Cumulus_Point_of_Sale_Systems_Offer.pdf) - POS Upgrade Credit

### 08_Treasury_Management

- [Cumulus ACH Origination Offer](08_Treasury_Management/Cumulus_ACH_Origination_Offer.pdf) - ACH Payables Launch
- [Cumulus Wire Transfers Offer](08_Treasury_Management/Cumulus_Wire_Transfers_Offer.pdf) - Secure Wire Migration
- [Cumulus Corporate Cards Offer](08_Treasury_Management/Cumulus_Corporate_Cards_Offer.pdf) - Corporate T and E Accelerator
- [Cumulus Purchasing Cards Offer](08_Treasury_Management/Cumulus_Purchasing_Cards_Offer.pdf) - AP Card Rebate Accelerator
- [Cumulus Positive Pay Offer](08_Treasury_Management/Cumulus_Positive_Pay_Offer.pdf) - Fraud Control Activation
- [Cumulus ACH Services Offer](08_Treasury_Management/Cumulus_ACH_Services_Offer.pdf) - ACH Debit Protection Setup
- [Cumulus ACH Collections Offer](08_Treasury_Management/Cumulus_ACH_Collections_Offer.pdf) - Receivables ACH Launch
- [Cumulus Remote Deposit Capture Offer](08_Treasury_Management/Cumulus_Remote_Deposit_Capture_Offer.pdf) - RDC Check Capture Launch
- [Cumulus Lockbox Services Offer](08_Treasury_Management/Cumulus_Lockbox_Services_Offer.pdf) - Lockbox Conversion Credit
- [Cumulus Merchant Integration Offer](08_Treasury_Management/Cumulus_Merchant_Integration_Offer.pdf) - Receivables Reconciliation Bridge
- [Cumulus Sweep Account Services Offer](08_Treasury_Management/Cumulus_Sweep_Account_Services_Offer.pdf) - Excess Liquidity Sweep Review
- [Cumulus Zero Balance Accounts Offer](08_Treasury_Management/Cumulus_Zero_Balance_Accounts_Offer.pdf) - ZBA Structure Launch
