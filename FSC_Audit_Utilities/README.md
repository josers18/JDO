# FSC Audit Utilities

Apex utilities and metadata that implement the cleanup and parity work
defined in the [Cumulus FSC master demo org audit](../audits/fsc-master-org-audit.md).

This project is the home for **audit-driven** code that doesn't belong inside
any individual demo widget — one-time data utilities, scheduled parity batches,
recursion-guard fields, custom audit-trail objects.

## Status

| Audit Phase | Implemented | Notes |
|---|---|---|
| **A13** — Loan FA rebalance | ✅ | `FscLoanRebalanceOnce` + `FscLoanRebalanceOnceTest`. Resolves §4.2 H7. |
| A8 — Enable `FinancialAccountRole` | ☐ | Setup change, not deployable metadata. Tracked in audit. |
| A9 — `IsParitySync__c` recursion-guard fields | ☐ | Pending Phase A10 design. |
| A10 — `FscFinancialAccountParityBatch` | ☐ | The big one. Will live alongside A13 here. |
| A12 — `FscFinancialAccountParityBatchTest` | ☐ | Pairs with A10. |

## Phase A13 — Loan FA rebalance

### What it does

A one-time Apex batch that resolves audit finding §4.2 H7 — 101 legacy
`FinServ__FinancialAccount__c` records of type `Loan` / `Mortgage` were
imported with absurd balance amounts (avg $337M, max $9.7B). Decision §6.1
D3 treats this as a data-quality bug and re-distributes the values into
realistic retail / SMB / mid-market ranges.

### What it changes

| Object | Field | Action |
|---|---|---|
| `FinServ__FinancialAccount__c` | `OriginalSnapshot__c` (new, Long Text) | JSON snapshot of original `Balance` and `LoanAmount`. Idempotency gate. |
| `FinServ__FinancialAccount__c` | `FinServ__Balance__c` | Re-distributed per D3 tier. |
| `FinServ__FinancialAccount__c` | `FinServ__LoanAmount__c` | Re-distributed per D3 tier. |
| `RebalanceLog__c` (new) | All fields | One row per rebalanced record, capturing before/after pair. |

### Distribution shape

| Tier | Range | Approx records (of 101) |
|---|---|---:|
| Retail Mortgage | $50K – $2M | ~70 |
| Small Business | $250K – $5M | ~25 |
| Mid-Market Commercial | $5M – $50M | ~6 |
| **Cap** | None above $50M | 0 |

Tier assignment is **deterministic**: records are ordered by `CreatedDate
ASC, Id ASC` then assigned to tiers by index modulo 100 (0–69 retail, 70–94
SMB, 95–99 mid-market). Within-tier amount is derived from a stable hash
of the record Id, so the same record always lands on the same value.

### Idempotency

`OriginalSnapshot__c IS NULL` is the eligibility gate in `start()`. After
a record has been rebalanced, its snapshot is non-null, and re-runs skip
it cleanly — even repeated executions are safe.

## Deploy

```sh
# From the repo root
sf project deploy start --source-dir FSC_Audit_Utilities/force-app \
                       --target-org jdo-fw51xz \
                       --test-level RunSpecifiedTests \
                       --tests FscLoanRebalanceOnceTest
```

## Run the rebalance once

After deploying, kick the batch off in anonymous Apex:

```apex
Id jobId = FscLoanRebalanceOnce.runOnDemand();
System.debug('Rebalance job submitted: ' + jobId);
```

Or directly:

```apex
Id jobId = Database.executeBatch(new FscLoanRebalanceOnce(), 200);
```

## Verify the result

```sql
-- 1. All 101 loan-type FAs now have a snapshot (idempotency marker set)
SELECT COUNT(Id) FROM FinServ__FinancialAccount__c
WHERE  FinServ__FinancialAccountType__c IN ('Loan','Mortgage','Line of Credit','Auto Loan')
AND    OriginalSnapshot__c != NULL

-- 2. Tier distribution shape
SELECT Tier__c, COUNT(Id) FROM RebalanceLog__c GROUP BY Tier__c

-- 3. New balances all within cap
SELECT MAX(FinServ__Balance__c), AVG(FinServ__Balance__c)
FROM   FinServ__FinancialAccount__c
WHERE  FinServ__FinancialAccountType__c IN ('Loan','Mortgage','Line of Credit','Auto Loan')

-- 4. Group by run for incident review
SELECT RunBatchId__c, COUNT(Id) FROM RebalanceLog__c GROUP BY RunBatchId__c
```

## Reverting

The snapshot field stores original values as JSON, so a revert script
would parse `OriginalSnapshot__c` and restore `FinServ__Balance__c` and
`FinServ__LoanAmount__c`. Not implemented as code (the audit decision
treats the rebalance as the corrected state); the JSON is there as a
safety net for the rare case where a specific demo needs the originals
back.

## Sequencing

Run order matters per the audit:

1. **A13 (this utility)** — re-distribute loan amounts.
2. **A10 parity batch** — must run *after* A13 so the mortgage parity step
   feeds realistic amounts into `ResidentialLoanApplication`.
3. **Phase B7** — RBL household rollup recompute, after both A13 and A10
   have stabilized the underlying data.

See [audits/fsc-master-org-audit.md §6.1 D3](../audits/fsc-master-org-audit.md)
for the full decision record.
