# Data Graph integration

This component does **not** use `ConnectApi.DataCloud` in Apex. It uses an **HTTP callout** through Named Credential **`DataCloud`** to the REST path below.

## HTTP contract (as implemented)

| Item | Value |
|------|--------|
| Method | `GET` |
| Endpoint base | `callout:DataCloud` |
| Path | `/services/data/v62.0/ssot/data-graph/{graphApiName}/records/{recordId}` |
| Encoding | `graphApiName` and `recordId` are URL-encoded. |

**Important:** Salesforce evolves Data Cloud REST surfaces. If your org returns **404** or a different JSON envelope, adjust the path in `CustomerProfileWidgetController.fetchDataGraphRecord` to match current documentation for **SSOT Data Graph** (or your integration pattern), while keeping the Named Credential name stable.

### `recordId` in the URL

The **`recordId`** passed from the Lightning page is the **CRM** Account or Contact Id. Your Data Graph must be resolvable by that identifier, or you must expose a different key (for example a Unified Individual Id) via automation or a custom wrapper—**this package does not** currently substitute `recordIdFieldName` into the URL (the property is reserved for future use).

## Response body

Apex deserializes the body with **`JSON.deserializeUntyped`**, then:

1. If the root is a map with **`record`** → mapping root = `record`.
2. Else if root has **`data`** → mapping root = `data`.
3. Else → mapping root = the full map.

All **field path** properties in App Builder are **dot-paths** relative to that root.

### Examples

**Flat root** (paths like `firstName`, `annualRevenue`):

```json
{
  "firstName": "Alex",
  "lastName": "Morgan",
  "mailingCity": "Boston",
  "mailingState": "MA",
  "customerTier": "Private",
  "propensityScore": 82,
  "mobileEnrolled": true
}
```

**Wrapped in `record`:**

```json
{
  "record": {
    "firstName": "Alex",
    "lastName": "Morgan"
  }
}
```

**Nested** (configure paths such as `party.individual.firstName`):

```json
{
  "party": {
    "individual": {
      "firstName": "Sam",
      "lastName": "Delta",
      "cty": "Seattle",
      "st": "WA"
    }
  }
}
```

In App Builder set **Path: first name** = `party.individual.firstName`, **Path: city** = `party.individual.cty`, etc.

## Logical keys → `ProfileResult`

The LWC sends a JSON object whose **keys** are fixed logical names. Each value is the **dot path** (or simple key) in the graph JSON.

| Logical key (fixed) | Typical `ProfileResult` target |
|---------------------|--------------------------------|
| `firstName`, `lastName` | Combined into `fullName` |
| `fullName` | Used if first+last not set |
| `city`, `state` | Location; also feed billing city/state when blank |
| `industry`, `employees`, `phone`, `email`, `website`, `revenue` | Direct |
| `tierSegment` | Tier badge |
| `propensityScore`, `engagementScore`, `churnScore`, `ltvScore` | Signals (0–100 style numbers) |
| `investmentBalance`, `loanBalance`, `depositYtd`, `loanLimit` | Portfolio / KPIs |
| `riskProfile`, `customerSince`, `lastInteraction` | Overview (`lastInteraction` → `lastInteractionDate`) |
| `mobileEnrolled`, `onlineEnrolled`, `paperlessEnrolled`, `alertsEnrolled`, `wireEnabled` | Booleans (also accept stringy `true`/`false`) |
| `kycStatus`, `twoFaStatus` | Strings |
| `street`, `zip` | `billingStreet`, `billingPostalCode` |
| `assignedBranch`, `branchDistance` | Branch header |
| `nearbyBranches` | Array of branch objects (see below) |

## `nearbyBranches` array

If the graph returns a **list** at the path configured for logical key **`nearbyBranches`**, each element should be an object with:

| Key | BranchInfo field |
|-----|------------------|
| `name` | `name` |
| `distance` | `distance` |
| `address` | `address` |
| `hours` | `hours` |
| `status` | `status` (e.g. `Open`) |
| `assigned` | `assigned` (boolean) |

The bundle exposes **`fieldNearbyBranches`** (default path `nearbyBranches`). Point it at your graph array (including nested paths such as `relationships.nearbyBranches`).

## Designing your Data Graph

1. **Identity:** Ensure the graph can be queried with the **record Id** you pass from the page (or plan a middleware).
2. **Shape:** Prefer a consistent envelope (`record` or flat) so App Builder paths stay stable.
3. **Types:** Use JSON primitives Apex can coerce (`Decimal` for money/scores, booleans for flags).
4. **CRM fallback:** Fields not in graph are still filled from **Account/Contact SOQL** when empty—good for phone, billing address, industry on Account.

## Testing without Data Cloud

- Leave **`graphApiName`** empty → no HTTP call; SOQL populates standard CRM fields.
- Unit tests in the repo use **`HttpCalloutMock`** to simulate graph JSON.

---

Back to [SETUP.md](SETUP.md) · [ARCHITECTURE.md](ARCHITECTURE.md)
