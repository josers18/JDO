# Setup guide

Deploy **FSC Journey Cockpit** and place it on an Account record page in your FSC org.

> **Audience:** Salesforce admins who didn't build the component but need to ship it. Assumes basic familiarity with `sf` CLI, Lightning App Builder, and permission sets.

For developer context (architecture, conventions, traps) see [AGENTS.md](../AGENTS.md). For the full feature overview see [README.md](../README.md).

---

## 1. Prerequisites

- **`sf` CLI v2** authenticated to your target org (verify: `sf org display --target-org <alias>`)
- **FSC org**, with at least one of these data stacks populated for Person Account goals:
  - **Standard FSC** (default) — `FinancialGoal` + `FinancialGoalParty` records exist; the FSC native FinancialGoals component already shows data on Person Account record pages
  - **Managed FSC** — `FinServ__FinancialGoal__c` records linked via `FinServ__PrimaryOwner__c` or `FinServ__Household__c`
- **At least one Person Account** in the org (any FSC org will have these by default)

If neither goal stack has data, the cockpit will render correctly but the right panel will show the empty state.

---

## 2. Deploy

From the project folder:

```bash
cd DC_Goals_Cockpit_lwc

# Deploy without running tests (fastest)
sf project deploy start --source-dir force-app/main/default \
  --target-org <alias> --wait 10 --concise

# Or deploy WITH tests (recommended for first deploy + after schema changes)
sf project deploy start --source-dir force-app \
  --target-org <alias> \
  --test-level RunSpecifiedTests \
  --tests FscJourneyCockpitControllerTest --wait 30
```

**Verify** the deploy summary shows these 4 components:

| Component type | Name |
|---|---|
| `ApexClass` | `FscJourneyCockpitController` |
| `ApexClass` | `FscJourneyCockpitControllerTest` |
| `LightningComponentBundle` | `fscJourneyCockpit` |
| `PermissionSet` | `DC_Goals_Cockpit_User` |

Confirm Apex tests pass:

```bash
sf apex run test --target-org <alias> \
  --tests FscJourneyCockpitControllerTest \
  --result-format human --code-coverage --wait 10
```

Expected: **19/19 passing**, **~83%** code coverage on `FscJourneyCockpitController`.

---

## 3. Assign the permission set

The cockpit's Apex controller queries 9 source objects via `WITH USER_MODE`. Without object Read on those objects, the panels render empty for non-admin users. The `DC_Goals_Cockpit_User` permission set grants exactly what's needed for both binding modes.

### Single user

```bash
sf org assign permset --target-org <alias> \
  --name DC_Goals_Cockpit_User \
  --on-behalf-of user@yourorg.com
```

### Bulk (recommended for >5 users)

Build a CSV of `User.Id`s and bulk-insert `PermissionSetAssignment` rows:

```bash
# 1. Resolve the perm set Id
PS_ID=$(sf data query --target-org <alias> \
  -q "SELECT Id FROM PermissionSet WHERE Name = 'DC_Goals_Cockpit_User'" \
  --json | jq -r '.result.records[0].Id')

# 2. Build the CSV (CRLF line endings — required by bulk API)
sf data query --target-org <alias> \
  -q "SELECT Id FROM User WHERE IsActive = true AND (Profile.Name = 'System Administrator' OR Profile.Name = 'Standard User')" \
  --json | jq -r ".result.records[] | \"\(.Id),$PS_ID\"" \
  | (printf 'AssigneeId,PermissionSetId\r\n'; sed 's/$/\r/') > /tmp/psa.csv

# 3. Bulk-import (--line-ending CRLF is the SAFE flag to pass)
sf data import bulk --target-org <alias> \
  --sobject PermissionSetAssignment \
  --file /tmp/psa.csv \
  --line-ending CRLF --wait 5
```

`DUPLICATE_VALUE` errors on individual rows are silently skipped — re-running this is safe.

---

## 4. Place on the Lightning record page

1. **Setup → Lightning App Builder**
2. Open the **Account record page** (or create a new one if you want a custom page for FSC Person Accounts)
3. From the component palette on the left, drag **FSC Journey Cockpit** onto the canvas — typically replacing the stock **Goals** and **Life Events** sections
4. Click the cockpit on the canvas to open its design attribute panel on the right
5. Configure the 8 attributes (see § 5)
6. **Save** → **Activate** → choose form-factor + assignment scope (Org default vs App default vs App + Profile)

> ⚠ If you previously placed the cockpit on a FlexiPage *before* v1.1 shipped (when the default was `goalBinding=managed`), the FlexiPage instance keeps that value baked in. **You must edit the FlexiPage and manually flip both bindings to `standard`** — defaults never retroactively migrate live admin configs.

---

## 5. Configure design attributes

| Attribute | Type | Default | When to change |
|---|---|---|---|
| `goalBinding` | picklist (`managed` / `standard`) | `standard` | Stay on `standard` to match the FSC native FinancialGoals component (reads via the `FinancialGoalParty` junction). Switch to `managed` only if your org has data on `FinServ__FinancialGoal__c` but not on standard `FinancialGoal`. |
| `lifeEventBinding` | picklist (`managed` / `standard`) | `standard` | Stay on `standard` to match `PersonLifeEvent` (the modern API surface). Switch to `managed` only if your org's life-event data is on `FinServ__LifeEvent__c` only. |
| `cardColumns` | integer (1–3) | `2` | `1` for narrow page layouts. `3` only for wide pages where 4 KPI tiles + 3 cards still fit. |
| `maxJourneyItems` | integer (5–50) | `20` | Increase if accounts have many life events and you want them all visible without scrolling. Controller fetches up to 50 regardless. |
| `themeMode` | picklist (43 themes) | `default` | Match the theme used by sibling LWCs on the same page (e.g. `multiclassPredictionLwc`) for visual coherence. Common picks: `default`, `ivory`, `midnight`, `obsidian`, `graphite`. |
| `accentColor` | hex string | (blank) | Override the default gold accent. Use `#RRGGBB` or `#RRGGBBAA` (alpha auto-stripped for derived bg/border tokens). Leave blank for theme default. |
| `warningColor` / `negativeColor` | hex strings | (blank) | Override theme warning/error tints. Rarely needed. |
| `showThemeSwitcher` | boolean | `false` | Renders 4 quick-switch buttons in the header (obsidian/midnight/graphite/ivory). **Demos only** — keep `false` in production. |

---

## 6. Verify the deployment

### Visual checklist on a Person Account record page

- [ ] **KPI strip** shows 4 tiles: Goals, Avg funded, Total tracked, Next deadline
- [ ] **Vertical journey rail** on the left shows Life Events with: solid blue node icon for past events, greyed circle for null/future events, count badge (`x2`/`x3`) on grouped same-date events
- [ ] Each rail step has 3 lines: title (event type) → description (record name) → date
- [ ] **Right panel** shows Goals as cards with: gold/green/blue progress ring, gold-or-green progress bar, priority chip (High = red, Medium = gold, Low = green), target/reached date
- [ ] Each goal card title is a **clickable link** to the goal record
- [ ] Each goal card has a **▾ chevron** that opens View/Edit/Clone/Delete menu
- [ ] **+ New Event** and **+ New Goal** buttons appear in the section headers and route to standard create pages
- [ ] **Hovering** a rail step shows a popover with the record name, date, status, and an "Open record" link
- [ ] **Hovering a grouped step** (with `x2`/`x3`) lists all members of the group with individual links

### Visual checklist on a Business Account record page

- [ ] Same KPI strip, but: Open deals · Pipeline · Weighted · Next close
- [ ] **Vertical rail** shows Business Milestones (no managed alternative — always uses standard `BusinessMilestone`)
- [ ] **Right panel** shows open Opportunities with blue probability ring + stage chip + close date
- [ ] **Closed-Won/Lost opportunities are excluded** by design (`IsClosed = false`). If you need to surface closed opps, the controller filter would need a code change

### SOQL sanity queries

If the cockpit shows different data than the native FSC component, run these queries to confirm what's actually in the database for the account being viewed (replace `<RID>` with the Account's 18-character Id):

```sql
-- 1. Standard goals visible via the FinancialGoalParty junction (default goalBinding)
SELECT FinancialGoal.Name, FinancialGoal.Status, FinancialGoal.Priority,
       FinancialGoal.ActualAmount, FinancialGoal.TargetAmount
FROM FinancialGoalParty
WHERE AccountId = '<RID>'
ORDER BY FinancialGoal.TargetDate

-- 2. Managed goals (alternative goalBinding)
SELECT Name, FinServ__Status__c, FinServ__ActualValue__c, FinServ__TargetValue__c
FROM FinServ__FinancialGoal__c
WHERE FinServ__PrimaryOwner__c = '<RID>' OR FinServ__Household__c = '<RID>'

-- 3. Standard life events via Contact (default lifeEventBinding)
SELECT Name, EventType, EventDate
FROM PersonLifeEvent
WHERE PrimaryPerson.AccountId = '<RID>'
ORDER BY EventDate DESC NULLS LAST

-- 4. Open opportunities (business panel)
SELECT Name, StageName, Amount, Probability, CloseDate
FROM Opportunity
WHERE AccountId = '<RID>' AND IsClosed = FALSE
ORDER BY Probability DESC NULLS LAST
```

If query 1 returns 6 rows but the cockpit shows only 5, the FlexiPage's `goalBinding` is set to `managed`. Edit the FlexiPage in App Builder and flip both bindings to `standard`.

---

## 7. Common issues

| Symptom | Cause | Fix |
|---|---|---|
| Panel shows fewer goals than the FSC native FinancialGoals component | FlexiPage's `goalBinding` is set to `managed` (or was placed before v1.1 when that was the default) | Edit FlexiPage → flip `goalBinding` to `standard` → Save |
| Life Events count off | FlexiPage's `lifeEventBinding` is set to `managed` | Same fix on `lifeEventBinding` |
| Empty panel for non-admin users | `DC_Goals_Cockpit_User` permission set not assigned | Run § 3 against the affected user |
| Goal icon is a generic target/box | Goal name doesn't match any keyword in `goalIconFor()` | Either rename the goal to include a known keyword (Wedding, College, Estate, Vacation, Retirement, Charit, Emergency, Investment, Healthcare, Auto), or extend `goalIconFor` in the controller |
| Hover popover doesn't render | Mouse moved off the trigger before the 180ms delay completed | Hover slowly; this is intentional debouncing |
| Action menu opens then immediately closes | Click bubbled to host element which fired click-outside dismiss | Should not happen with v1.1 (event.stopPropagation in `handleCardMenuClick`) — file a bug if reproducible |
| "Script-thrown exception" toast | Apex error path didn't use `buildAuraException` helper | Bug — controller should always wrap with helper that sets both ctor arg AND `setMessage()` |

---

## 8. Theme alignment with sibling LWCs

If your record page also has `multiclassPredictionLwc`, `customerProfileWidget`, or `businessProfileWidget` on it, set the same `themeMode` value on all of them so they retheme together. The cockpit's `cockpitThemes.js` carries the same 43-theme `BASE_THEMES` palette as `DC_Multiclass_Prediction_LWC/predictionThemes.js`.

The 5 most-used themes in JDO demos:

| `themeMode` | Vibe | Use when |
|---|---|---|
| `default` | Clean white card with gold accents | General FSC demos |
| `ivory` | Warm cream paper | Wealth Management demos |
| `midnight` | Deep navy with gold | Executive / private banking |
| `obsidian` | Black with bronze | Premium / VIP feel |
| `graphite` | Slate gray | Corporate banking |

---

## See also

- [README.md](../README.md) — feature overview, mermaid architecture diagram, FlexiPage attribute table
- [AGENTS.md](../AGENTS.md) — architecture deep-dive, conventions, traps, testing patterns
- [CHANGELOG.md](../CHANGELOG.md) — what's new, what changed, what's fixed
- [artifacts.md](../artifacts.md) — every deployable artifact in this project
- [design/fsc-cockpit.html](../design/fsc-cockpit.html) — approved design mock (visual source of truth)
