# Cross-sell grid data generators

They fill the real holdings gaps the white-space grid exposed. The design is in `docs/superpowers/plans/2026-11-05-cross-sell-whitespace-real.md`. Both scripts are deterministic and use only the standard library.

| Script | Writes | Loaded into |
|---|---|---|
| `generate_holdings.py IN OUT` | `fa_insert.csv`, `opp_seed.json` | `FinServ__FinancialAccount__c` |
| `generate_plastics.py card_fas.csv cards.csv` | `cards.csv` | `FinServ__Card__c` (one Primary plastic per card FA) |

## Inputs for `generate_holdings.py` (CSV exports in `IN`)

- `books2.csv` — the Accounts in the 7 banker books, with columns `Id, OwnerId, Owner.Name, IsPersonAccount, PersonContactId, Name, RecordType.DeveloperName`.
- `exist_cards.csv` — `FinServ__PrimaryOwner__c` of every existing card FA.
- `ha_ccard.csv` — `ACCOUNT_ID`s with a Plaid held-away commercial card (latest month).
- `card_cands.csv` — `PERSONAL_PRODUCT_RECOMMENDATION_SUBSET` rows with `HAS_CREDIT_CARD = 1`. Columns: `ACCOUNTID, INC, FICO, HA_CARD`.
- `allen_fa.csv` — Allen Carter's FAs. These are the template for the commercial ladder.

## Runbook (as run 2026-11-05 against jdo-oe0sdd)

1. **Generate the holdings.** Run `python3 generate_holdings.py /tmp /tmp/crosssell_out`.
2. **Load the FAs.** Run `sf data import bulk -s FinServ__FinancialAccount__c -f fa_insert.csv --line-ending CRLF`.
   - The import loaded 5,533 FAs: 5,226 consumer cards, 297 corporate cards in Allen's book, and 10 on Jose's businesses.
   - It rejected 3,666 household ladder rows; the generator now skips households.
3. **Generate the plastics.** Export the new card FAs (`Id, Name, FinServ__PrimaryOwner__c, FinServ__PrimaryOwner__r.Name, FinServ__OpenDate__c, FinServ__TotalCreditLimit__c`, filtered on `RecordType.DeveloperName = 'CreditCard'`). Then run `generate_plastics.py` and bulk-import `FinServ__Card__c`. This loaded 5,526 plastics.
4. **Mirror into Snowflake.** Insert every new FA into `DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRANSACTION_ACCOUNTS`.
   - Column mapping: `SFACCOUNTID` = PrimaryOwner, `ACCOUNTID` = FA Id, `CONTACTID` = PersonContactId, `ACCOUNTTYPE` = Personal/Business, `PRODUCT_KIND` = `line` for cards and credit lines (otherwise deposit, loan or investment).
   - Set `LOADED_AT = '2026-11-05'`.
   - Guard the insert with `NOT EXISTS` on `ACCOUNTID`. A backup clone is in `FINANCIAL_TRANSACTION_ACCOUNTS_BAK_20261105`.
   - The daily transaction generator picks up the new rows, so the cards start accruing spend.
5. **Rescore.** Run `CALL SP_GENERATE_OFFER_ELIGIBILITY()`. Owned products drop out: CRC-ACQ fell by 5,227 rows and BIZ-CARD by 299. `BT_Offer_Eligibility__dlm` is zero-copy, so no refresh is needed.
6. **Backfill outcomes.** For each new FA opened in the last 60 days, create an Opportunity:
   - Name: `<grid column label> — <client name>`.
   - `StageName = 'Closed Won'`, `CloseDate` = the open date, `LeadSource = 'Cross-sell grid'`, `OwnerId` = the client's banker, `Amount` = the limit, loan or balance.
   - This created 168 Opportunities.

## Conventions learned

- `FinServ__InterestRate__c` is a **percent** (18.99), not a fraction.
- Corporate cards use the `CreditCard` record type with `FinServ__FinancialAccountType__c = 'Treasury Management'`.
- The standard `FinancialAccount` object has no `FinancialAccountParty` links, so it can't serve as a holdings source.
