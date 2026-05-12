# Financial KPI Widget

Glassmorphic Lightning Web Component that replaces the stock Deposits/Loans/Investments tile widget on a Financial Services Cloud customer record page. Dark navy glass cards with colored radial glow, animated count-up, and hand-rolled SVG sparklines. Data is sourced from two `@wire` Apex calls against `FinServ__FinancialAccount__c`, with optional Flow-variable overrides for demo mode.

## Targets

- `lightning__RecordPage` (Account, Contact)
- `lightning__FlowScreen`
- `lightning__AppPage`, `lightning__HomePage`

## Contents

```
force-app/main/default/
├── classes/
│   ├── FinancialOverviewController.cls
│   ├── FinancialOverviewController.cls-meta.xml
│   ├── FinancialOverviewControllerTest.cls
│   └── FinancialOverviewControllerTest.cls-meta.xml
└── lwc/
    └── premiumFinancialOverview/
        ├── premiumFinancialOverview.html
        ├── premiumFinancialOverview.js
        ├── premiumFinancialOverview.css
        └── premiumFinancialOverview.js-meta.xml
```

## Architecture

```
┌─────────────────────────────────┐
│  Record page (Person Account)   │
│       └─ @api recordId ─┐       │
└─────────────────────────┼───────┘
                          ▼
┌──────────────────────────────────────────────┐
│  premiumFinancialOverview (LWC)              │
│                                              │
│   @wire getFinancialMetrics ({recordId})  ───┼──┐
│   @wire getTrendData ({recordId, months}) ───┼──┤
│                                              │  │
│   ↓ animated count-up + sparkline paths      │  │
│   ↓ glass cards rendered                     │  │
└──────────────────────────────────────────────┘  │
                                                   ▼
                          ┌────────────────────────────────────┐
                          │ FinancialOverviewController (Apex) │
                          │                                    │
                          │  SOQL #1: aggregate current values │
                          │    FROM FinServ__FinancialAccount  │
                          │    WHERE PrimaryOwner = :recordId  │
                          │                                    │
                          │  SOQL #2: trend snapshots          │
                          │    FROM Account_Financial_Snapshot │
                          │    WHERE Account = :recordId       │
                          │    (with synthetic fallback)       │
                          └────────────────────────────────────┘
```

Flow-variable overrides (`@api` string properties) short-circuit the Apex values when present, so the same component works on a record page and inside a Flow screen without modification.

## Ground rules used

- Target API version **62.0**
- No new objects, permission sets, or dependencies — uses FSC's `FinServ__FinancialAccount__c` plus an optional `Account_Financial_Snapshot__c` custom object if deployed
- No npm packages — sparklines are hand-rolled SVG paths computed in the JS controller
- All SOQL uses bind variables (`:recordId`)

## Deploy

From this folder (`Financial_KPI_Widget/`):

```bash
sf project deploy start \
  --source-dir force-app/main/default/lwc/premiumFinancialOverview \
  --source-dir force-app/main/default/classes \
  --target-org <your-alias>

sf apex run test \
  --class-names FinancialOverviewControllerTest \
  --result-format human \
  --target-org <your-alias>
```

Then:

1. Open a customer record.
2. Edit the Lightning record page → drag **Premium Financial Overview** into the slot the stock widget is in.
3. Remove the stock widget, save, activate.

## Customization points

- **Account type picklist values** — the three `Set<String>` constants at the top of `FinancialOverviewController.cls` assume common FSC picklist values. Edit if your org uses different labels.
- **ROI formula** — default is `(balance − deposited) / deposited × 100`, unweighted. If ROI is pre-computed per investment, swap in `AVG(FinServ__RateOfReturn__c)`.
- **Snapshot object** — to disable synthetic trend data, deploy an `Account_Financial_Snapshot__c` custom object with fields `Account__c`, `Snapshot_Date__c`, `Deposits_Total__c`, `Loans_Balance__c`, `Investments_Balance__c` and populate monthly (Apex job or Data Cloud write-back). The controller picks it up automatically.
- **Accent colors** — `:host` CSS variables in the `.css` file. Changing `--pfo-deposits`, `--pfo-loans`, `--pfo-investments` rewrites the whole palette including glows, dots, and icon tints.
- **Contact record page** — if dropping on a Contact page, change `WHERE FinServ__PrimaryOwner__c = :recordId` to `WHERE FinServ__PrimaryOwner__r.PersonContactId = :recordId` (FSC stores the PrimaryOwner as the Person Account, not the Contact).

