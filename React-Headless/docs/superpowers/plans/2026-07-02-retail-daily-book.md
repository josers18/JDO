# Retail Banking — "Daily Book" Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Retail Banking morning-landing cockpit — a full-screen React app that replaces the standard Salesforce home page for a retail banker, surfacing their whole book (churn-ranked attention queue, book KPIs, client drill-in, activity/pipeline/goals) with a live Agentforce assistant — proving the `_shared` foundation AND the full agentic stack end-to-end before Commercial/Wealth clone the pattern.

**Architecture:** This repurposes the existing, already-deployed `ReactHeadless` UI bundle (DeveloperName stays `ReactHeadless` for deploy stability; MasterLabel becomes "Retail — Daily Book"). It consumes the `@shared` foundation library via the `@shared` alias (wired in the Foundation plan). Data follows the dual-path rule: Core/FSC records (Account, Contact, Opportunity, Case, Task, Event, FinancialGoal, FinServ__FinancialAccount__c) via `executeGraphQL`; Data Cloud enrichment + ML predictions (Attrition/Bank_Churner churn, PERSONAL_PRODUCT_RECOMMENDATION, CSAT, Plaid held-away, life events) via `queryDataCloud` through the Apex REST bridge. The Agentforce assistant uses the SDK Agentforce Conversation Client.

**Tech Stack:** React 19, TypeScript 5.9 (strict), Vite 7, Vitest 4 + Testing Library, Tailwind v4, `@salesforce/platform-sdk` 10.6, `@shared` foundation library, Salesforce UI Bundle SDK, Agentforce Conversation Client.

## Global Constraints

- **API version 67.0** — `sourceApiVersion` in `sfdx-project.json`; UIBundle deploy fails below v67.
- **Consumes the `@shared` contract** (from `2026-07-02-shared-foundation.md`), imported via the `@shared` alias:
  `executeGraphQL<TData,TVars>(query, vars)`, `queryDataCloud<TRow>(sql, maxRows?)`, `DataCloudResult<TRow>`, `useAsyncData<T>(fetcher, deps)`, `ThemeProvider`, `useTheme`, `PERSONA_THEMES`, `PersonaKey`, `PersonaTheme`, `KpiTile`, `Sparkline`, `AttentionQueue`, `AttentionItem`, `SHARED_VERSION`. The Foundation plan MUST be complete and green before this plan starts.
- **Persona theme = `retail`** (teal). The app root wraps in `<ThemeProvider persona="retail">`.
- **GraphQL non-negotiables:** HTTP 200 ≠ success (parse `errors`); `@optional` on every read field; `first:` on every query; verify every field name via `graphql-search.sh` against the fetched `schema.graphql` BEFORE writing the query string. Tasks that write GraphQL are gated behind Task 2 (schema fetch).
- **No `@AuraEnabled` from React** — Data Cloud goes through the Foundation's `POST /services/apexrest/dc/query` via `queryDataCloud`.
- **SDK methods optional** — `sdk.graphql?.` / `sdk.fetch?.` always optional-chained (handled inside `@shared` clients).
- **Replace ALL boilerplate** — no "React App" / "Welcome to your React application" strings survive.
- **Pilot record for manual verification:** Person Account `001am00000qvjsAAAQ` (org `jdo-0pz8au`).

## File Structure

The Retail app lives under `force-app/main/default/uiBundles/ReactHeadless/src/`:
- `retail/RetailHome.tsx` — the cockpit page (composed of sections below).
- `retail/sections/` — one file per cockpit section (HeroPulseBar, AttentionSection, BookKpiStrip, ClientDrillIn, ActivityStream, PipelinePanel, GoalsPanel, AssistantDock).
- `retail/data/` — one file per data concern (queries + fetchers): `book.ts` (KPIs), `attention.ts` (churn/NBA rankings), `client.ts` (drill-in profile), `activity.ts`, `pipeline.ts`, `goals.ts`.
- `retail/data/queries/*.graphql` — external GraphQL operations (one op per file), written only after Task 2.
- `retail/agent/` — Agentforce conversation client wrapper + dock state.
- `retail/types.ts` — Retail-local view-model types.

---

### Task 1: Rebrand the bundle to Retail + mount the Retail route under the theme

**Files:**
- Modify: `force-app/main/default/uiBundles/ReactHeadless/ReactHeadless.uibundle-meta.xml` (MasterLabel → "Retail — Daily Book")
- Modify: `force-app/main/default/uiBundles/ReactHeadless/src/routes.tsx`
- Modify: `force-app/main/default/uiBundles/ReactHeadless/src/app.tsx` (wrap router in `<ThemeProvider persona="retail">`)
- Modify: `force-app/main/default/uiBundles/ReactHeadless/src/appLayout.tsx` (replace boilerplate title)
- Create: `force-app/main/default/uiBundles/ReactHeadless/src/retail/RetailHome.tsx`
- Create: `force-app/main/default/uiBundles/ReactHeadless/src/retail/RetailHome.test.tsx`
- Delete (later, once RetailHome is the index): `src/pages/Home.tsx` usage in routes

**Interfaces:**
- Consumes: `ThemeProvider`, `useTheme`, `SHARED_VERSION` from `@shared`.
- Produces: `RetailHome` default-export React component mounted at the index route; app-wide `retail` theme context. All later section tasks render inside `RetailHome`.

- [ ] **Step 1: Write the failing test**

Create `force-app/main/default/uiBundles/ReactHeadless/src/retail/RetailHome.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@shared';
import RetailHome from './RetailHome';

describe('RetailHome', () => {
  it('renders the Daily Book cockpit shell heading', () => {
    render(
      <ThemeProvider persona="retail">
        <RetailHome />
      </ThemeProvider>
    );
    expect(screen.getByRole('heading', { name: /daily book/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `ReactHeadless` dir): `npm run test -- run src/retail/RetailHome.test.tsx`
Expected: FAIL — `Cannot find module './RetailHome'`.

- [ ] **Step 3: Write minimal implementation**

Create `force-app/main/default/uiBundles/ReactHeadless/src/retail/RetailHome.tsx`:

```tsx
/**
 * Retail Banking "Daily Book" cockpit — the retail banker's morning landing
 * page, replacing the standard Salesforce home. Sections are added by later
 * tasks; this shell establishes the layout grid + heading under the retail
 * (teal) theme.
 */
export default function RetailHome() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--wp-surface)',
        color: 'var(--wp-text)',
        padding: '1.5rem',
      }}
    >
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>Daily Book</h1>
        <p style={{ color: 'var(--wp-text-muted)', margin: '0.25rem 0 0' }}>
          Your retail portfolio at a glance
        </p>
      </header>
      {/* Sections mounted by later tasks */}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `ReactHeadless` dir): `npm run test -- run src/retail/RetailHome.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire routing + theme + rebrand**

In `src/routes.tsx`, replace the `Home` index element with `RetailHome`:

```tsx
import type { RouteObject } from 'react-router';
import AppLayout from '@/appLayout';
import RetailHome from './retail/RetailHome';
import NotFound from './pages/NotFound';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <RetailHome />,
        handle: { showInNavigation: true, label: 'Daily Book' },
      },
      {
        path: '*',
        element: <NotFound />,
      },
    ],
  },
];
```

In `src/app.tsx`, wrap the `<RouterProvider>` (or the router render) in the theme provider. Locate the existing render of the router and wrap it:

```tsx
import { ThemeProvider } from '@shared';
// ...existing basename + createBrowserRouter logic unchanged...
// Wrap the provider:
//   <ThemeProvider persona="retail">
//     <RouterProvider router={router} />
//   </ThemeProvider>
```

In `src/appLayout.tsx`, replace the boilerplate "React App" title text with `Cumulus Retail`.

In `ReactHeadless.uibundle-meta.xml`, set `<masterLabel>Retail — Daily Book</masterLabel>` (leave `fullName`/DeveloperName `ReactHeadless` unchanged).

- [ ] **Step 6: Verify build + full test pass**

Run (from `ReactHeadless` dir): `npm run build && npm run test -- run`
Expected: build → `dist/` with 0 errors; all tests pass (shared suite + RetailHome).

- [ ] **Step 7: Commit**

```bash
git add force-app/main/default/uiBundles/ReactHeadless/src force-app/main/default/uiBundles/ReactHeadless/ReactHeadless.uibundle-meta.xml
git commit -m "feat(retail): rebrand ReactHeadless as Daily Book cockpit + retail theme"
```

---

### Task 2: Deploy + fetch GraphQL schema (unblocks all Core/FSC queries)

**Files:**
- Generated: `schema.graphql` (project root, 5 levels up — `DEFAULT_SCHEMA_PATH`)
- Generated: `src/api/graphql-operations-types.ts`
- No hand-written source in this task.

**Interfaces:**
- Consumes: the deployed bundle + Apex bridge (Foundation Task 3) in `jdo-0pz8au`.
- Produces: a live `schema.graphql` + working `graphql-search.sh` lookups. Every later task that writes a GraphQL string depends on this. **No GraphQL query string may be authored before this task completes.**

- [ ] **Step 1: Build + deploy the current bundle + Apex bridge**

From the SFDX project root:

```bash
cd force-app/main/default/uiBundles/ReactHeadless && npm install && npm run build && cd -
sf project deploy start \
  --source-dir force-app/main/default/uiBundles/ReactHeadless \
  --source-dir force-app/main/default/classes \
  -o jdo-0pz8au --json
```
Expected: `status: 0`, `numberComponentErrors: 0`. Read the JSON — do NOT trust exit code alone (per CLAUDE.md gotcha #5).

- [ ] **Step 2: Verify the bundle deployed (Tooling API)**

```bash
sf data query --use-tooling-api \
  -q "SELECT Id, DeveloperName, MasterLabel FROM UIBundle WHERE DeveloperName='ReactHeadless' WITH USER_MODE" \
  -o jdo-0pz8au
```
Expected: one row, `MasterLabel = Retail — Daily Book`.

- [ ] **Step 3: Fetch the GraphQL schema from the deployed org**

From the `ReactHeadless` dir:

```bash
npm run graphql:schema
```
Expected: `schema.graphql` written at the project root (5 levels up). Note: introspection can take minutes — do not interrupt.

- [ ] **Step 4: Verify the schema-search script resolves the Retail entities**

From the SFDX project root:

```bash
bash scripts/graphql-search.sh Account Opportunity Case Task Event FinancialGoal
```
Expected: type definitions returned for each. If `FinServ__FinancialAccount__c` is needed, also run `bash scripts/graphql-search.sh FinServ__FinancialAccount__c`. If any entity returns nothing, STOP — the object/permission set may be missing; escalate before writing its query.

- [ ] **Step 5: Commit the schema + regenerated types**

```bash
git add ../../../../../schema.graphql force-app/main/default/uiBundles/ReactHeadless/src/api/graphql-operations-types.ts
git commit -m "chore(retail): fetch GraphQL schema from jdo-0pz8au + regen types"
```

---

### Task 3: Book KPI strip (Core/FSC via GraphQL)

**Files:**
- Create: `force-app/main/default/uiBundles/ReactHeadless/src/retail/data/queries/bookKpis.graphql`
- Create: `force-app/main/default/uiBundles/ReactHeadless/src/retail/data/book.ts`
- Create: `force-app/main/default/uiBundles/ReactHeadless/src/retail/data/book.test.ts`
- Create: `force-app/main/default/uiBundles/ReactHeadless/src/retail/sections/BookKpiStrip.tsx`
- Create: `force-app/main/default/uiBundles/ReactHeadless/src/retail/sections/BookKpiStrip.test.tsx`
- Create: `force-app/main/default/uiBundles/ReactHeadless/src/retail/types.ts`
- Modify: `force-app/main/default/uiBundles/ReactHeadless/src/retail/RetailHome.tsx`

**Interfaces:**
- Consumes: `executeGraphQL`, `useAsyncData`, `KpiTile` from `@shared`; generated types from Task 2.
- Produces:
  - `type BookKpi = { key: string; label: string; value: number; format: 'currency' | 'number' | 'percent'; trend?: number[] }` (in `types.ts`).
  - `fetchBookKpis(): Promise<BookKpi[]>` (in `book.ts`).
  - `<BookKpiStrip />` React component rendering `KpiTile` per KPI. Mounted in `RetailHome`.

- [ ] **Step 1: Write the failing test (fetcher)**

Create `force-app/main/default/uiBundles/ReactHeadless/src/retail/data/book.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const execMock = vi.fn();
vi.mock('@shared', () => ({ executeGraphQL: (...a: unknown[]) => execMock(...a) }));

import { fetchBookKpis } from './book';

describe('fetchBookKpis', () => {
  beforeEach(() => execMock.mockReset());

  it('maps GraphQL edges into BookKpi view models', async () => {
    // households (Account count), open opps, open cases, deposits sum
    execMock.mockResolvedValue({
      uiapi: {
        query: {
          Account: { totalCount: 128, edges: [] },
          Opportunity: { totalCount: 14, edges: [] },
          Case: { totalCount: 6, edges: [] },
        },
      },
    });
    const kpis = await fetchBookKpis();
    const byKey = Object.fromEntries(kpis.map(k => [k.key, k]));
    expect(byKey.households.value).toBe(128);
    expect(byKey.openOpportunities.value).toBe(14);
    expect(byKey.openCases.value).toBe(6);
    expect(byKey.households.format).toBe('number');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `ReactHeadless` dir): `npm run test -- run src/retail/data/book.test.ts`
Expected: FAIL — `Cannot find module './book'`.

- [ ] **Step 3: Write the GraphQL operation**

> Field names below MUST be confirmed via `graphql-search.sh` (Task 2 Step 4). If `totalCount` is unavailable on a connection in this schema version, fetch with `first: 1` + `pageInfo` and derive counts from a dedicated aggregate; adjust the mapper accordingly. The query as written assumes `totalCount` is present (v60+ connections).

Create `force-app/main/default/uiBundles/ReactHeadless/src/retail/data/queries/bookKpis.graphql`:

```graphql
query RetailBookKpis {
  uiapi {
    query {
      Account(first: 1, where: { Type: { eq: "Household" } }) {
        totalCount
      }
      Opportunity(first: 1, where: { IsClosed: { eq: false } }) {
        totalCount
      }
      Case(first: 1, where: { IsClosed: { eq: false } }) {
        totalCount
      }
    }
  }
}
```

- [ ] **Step 4: Regenerate types**

Run (from `ReactHeadless` dir): `npm run graphql:codegen`
Expected: `RetailBookKpisQuery` type appears in `src/api/graphql-operations-types.ts`.

- [ ] **Step 5: Write minimal implementation**

Create `force-app/main/default/uiBundles/ReactHeadless/src/retail/types.ts`:

```typescript
export type KpiFormat = 'currency' | 'number' | 'percent';

export interface BookKpi {
  key: string;
  label: string;
  value: number;
  format: KpiFormat;
  trend?: number[];
}
```

Create `force-app/main/default/uiBundles/ReactHeadless/src/retail/data/book.ts`:

```typescript
import { executeGraphQL } from '@shared';
import type { RetailBookKpisQuery } from '@api/graphql-operations-types';
import BOOK_KPIS_QUERY from './queries/bookKpis.graphql?raw';
import type { BookKpi } from '../types';

/**
 * Book-level KPIs for the retail banker. Households, open opportunities, and
 * open cases all ORIGINATE in Salesforce (SalesforceDotCom streams) → read via
 * GraphQL, never the Data Cloud mirror (data-access rule).
 */
export async function fetchBookKpis(): Promise<BookKpi[]> {
  const data = await executeGraphQL<RetailBookKpisQuery>(BOOK_KPIS_QUERY);
  const q = data.uiapi?.query;
  return [
    {
      key: 'households',
      label: 'Households',
      value: q?.Account?.totalCount ?? 0,
      format: 'number',
    },
    {
      key: 'openOpportunities',
      label: 'Open Opportunities',
      value: q?.Opportunity?.totalCount ?? 0,
      format: 'number',
    },
    {
      key: 'openCases',
      label: 'Open Cases',
      value: q?.Case?.totalCount ?? 0,
      format: 'number',
    },
  ];
}
```

- [ ] **Step 6: Run fetcher test to verify pass**

Run (from `ReactHeadless` dir): `npm run test -- run src/retail/data/book.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the failing test (component)**

Create `force-app/main/default/uiBundles/ReactHeadless/src/retail/sections/BookKpiStrip.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@shared';

vi.mock('../data/book', () => ({
  fetchBookKpis: vi.fn(async () => [
    { key: 'households', label: 'Households', value: 128, format: 'number' as const },
  ]),
}));

import { BookKpiStrip } from './BookKpiStrip';

describe('BookKpiStrip', () => {
  it('renders a KpiTile per KPI from the fetcher', async () => {
    render(
      <ThemeProvider persona="retail">
        <BookKpiStrip />
      </ThemeProvider>
    );
    await waitFor(() => expect(screen.getByText('Households')).toBeInTheDocument());
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run (from `ReactHeadless` dir): `npm run test -- run src/retail/sections/BookKpiStrip.test.tsx`
Expected: FAIL — `Cannot find module './BookKpiStrip'`.

- [ ] **Step 9: Write minimal implementation (component)**

Create `force-app/main/default/uiBundles/ReactHeadless/src/retail/sections/BookKpiStrip.tsx`:

```tsx
import { useAsyncData, KpiTile } from '@shared';
import { fetchBookKpis } from '../data/book';

/** Glass KPI strip for the retail book. Data via GraphQL (Core/FSC). */
export function BookKpiStrip() {
  const { data, loading, error } = useAsyncData(fetchBookKpis, []);

  if (loading) return <div style={{ color: 'var(--wp-text-muted)' }}>Loading book…</div>;
  if (error) return <div role="alert">Could not load book KPIs.</div>;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem',
      }}
    >
      {(data ?? []).map(kpi => (
        <KpiTile
          key={kpi.key}
          label={kpi.label}
          value={kpi.value}
          format={kpi.format}
          trend={kpi.trend}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 10: Mount in RetailHome + run tests**

In `src/retail/RetailHome.tsx`, import and render `<BookKpiStrip />` below the header (replace the `{/* Sections mounted by later tasks */}` comment):

```tsx
import { BookKpiStrip } from './sections/BookKpiStrip';
// ...inside the returned JSX, after </header>:
      <section style={{ marginBottom: '2rem' }}>
        <BookKpiStrip />
      </section>
```

Run (from `ReactHeadless` dir): `npm run test -- run src/retail/`
Expected: PASS (RetailHome + book + BookKpiStrip).

- [ ] **Step 11: Commit**

```bash
git add force-app/main/default/uiBundles/ReactHeadless/src/retail
git commit -m "feat(retail): book KPI strip from Core/FSC GraphQL"
```

---

### Task 4: Attention queue — churn + next-best-product (Data Cloud predictions)

**Files:**
- Create: `force-app/main/default/uiBundles/ReactHeadless/src/retail/data/attention.ts`
- Create: `force-app/main/default/uiBundles/ReactHeadless/src/retail/data/attention.test.ts`
- Create: `force-app/main/default/uiBundles/ReactHeadless/src/retail/sections/AttentionSection.tsx`
- Create: `force-app/main/default/uiBundles/ReactHeadless/src/retail/sections/AttentionSection.test.tsx`
- Modify: `force-app/main/default/uiBundles/ReactHeadless/src/retail/RetailHome.tsx`

**Interfaces:**
- Consumes: `queryDataCloud`, `DataCloudResult`, `useAsyncData`, `AttentionQueue`, `AttentionItem` from `@shared`.
- Produces:
  - `fetchAttentionItems(): Promise<AttentionItem[]>` — ranks the book by churn score (Attrition/Bank_Churner DMO) joined to next-best-product (PERSONAL_PRODUCT_RECOMMENDATION DMO); reason text combines the churn driver and the recommended product.
  - `<AttentionSection onSelectClient?: (accountId: string) => void />` — renders the shared `AttentionQueue`. Mounted in `RetailHome`.

- [ ] **Step 1: Write the failing test (fetcher)**

Create `force-app/main/default/uiBundles/ReactHeadless/src/retail/data/attention.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dcMock = vi.fn();
vi.mock('@shared', () => ({ queryDataCloud: (...a: unknown[]) => dcMock(...a) }));

import { fetchAttentionItems } from './attention';

describe('fetchAttentionItems', () => {
  beforeEach(() => dcMock.mockReset());

  it('maps churn + NBA rows into AttentionItems with severity by score', async () => {
    dcMock.mockResolvedValue({
      columns: [],
      rowCount: 2,
      warning: null,
      rows: [
        { account_id: '001A', client_name: 'Ada Lovelace', churn_score: 0.91, top_driver: 'balance drop', nba_product: 'HELOC' },
        { account_id: '001B', client_name: 'Alan Turing', churn_score: 0.35, top_driver: 'low engagement', nba_product: 'Savings+' },
      ],
    });
    const items = await fetchAttentionItems();
    expect(items).toHaveLength(2);
    const high = items.find(i => i.id === '001A')!;
    expect(high.severity).toBe('high');
    expect(high.score).toBeCloseTo(0.91);
    expect(high.clientName).toBe('Ada Lovelace');
    expect(high.reason).toMatch(/balance drop/i);
    expect(high.reason).toMatch(/HELOC/);
    expect(items.find(i => i.id === '001B')!.severity).toBe('low');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `ReactHeadless` dir): `npm run test -- run src/retail/data/attention.test.ts`
Expected: FAIL — `Cannot find module './attention'`.

- [ ] **Step 3: Write minimal implementation**

> The exact DMO/column names (`Bank_Churner__dlm`, `PERSONAL_PRODUCT_RECOMMENDATION__dlm`, field API names) must be confirmed against the org's Data Cloud schema before running live. Use the `dc-connect-api` / DC MCP tooling or the DcBridgeRest against a `SELECT ... LIMIT 5` probe to confirm column names, then finalize the SQL. The mapper below is column-name-driven, so only the SQL string changes if names differ.

Create `force-app/main/default/uiBundles/ReactHeadless/src/retail/data/attention.ts`:

```typescript
import { queryDataCloud } from '@shared';
import type { AttentionItem } from '@shared';

interface AttentionRow {
  account_id: string;
  client_name: string;
  churn_score: number;
  top_driver: string;
  nba_product: string;
}

/**
 * The agentic heart of the Retail cockpit: rank the book by churn risk
 * (Bank_Churner prediction DMO) and pair each at-risk client with their
 * next-best product (PERSONAL_PRODUCT_RECOMMENDATION DMO). Both are
 * Snowflake-origin Data Cloud predictions with no Core home → DC bridge path.
 */
const ATTENTION_SQL = `
  SELECT
    c.account_id__c        AS account_id,
    c.client_name__c       AS client_name,
    c.churn_score__c       AS churn_score,
    c.top_driver__c        AS top_driver,
    r.recommended_product__c AS nba_product
  FROM Bank_Churner__dlm c
  LEFT JOIN PERSONAL_PRODUCT_RECOMMENDATION__dlm r
    ON r.account_id__c = c.account_id__c
  ORDER BY c.churn_score__c DESC
  LIMIT 25
`;

function severityFor(score: number): AttentionItem['severity'] {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

export async function fetchAttentionItems(): Promise<AttentionItem[]> {
  const result = await queryDataCloud<AttentionRow>(ATTENTION_SQL, 25);
  return result.rows.map(row => ({
    id: row.account_id,
    title: `Churn risk — ${row.client_name}`,
    clientName: row.client_name,
    reason: `${row.top_driver}; next-best: ${row.nba_product}`,
    score: Number(row.churn_score) || 0,
    severity: severityFor(Number(row.churn_score) || 0),
  }));
}
```

- [ ] **Step 4: Run fetcher test to verify pass**

Run (from `ReactHeadless` dir): `npm run test -- run src/retail/data/attention.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test (component)**

Create `force-app/main/default/uiBundles/ReactHeadless/src/retail/sections/AttentionSection.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@shared';

vi.mock('../data/attention', () => ({
  fetchAttentionItems: vi.fn(async () => [
    { id: '001A', title: 'Churn risk — Ada', reason: 'x', score: 0.9, severity: 'high' as const, clientName: 'Ada' },
  ]),
}));

import { AttentionSection } from './AttentionSection';

describe('AttentionSection', () => {
  it('renders ranked items and fires onSelectClient with the account id', async () => {
    const onSelectClient = vi.fn();
    render(
      <ThemeProvider persona="retail">
        <AttentionSection onSelectClient={onSelectClient} />
      </ThemeProvider>
    );
    await waitFor(() => expect(screen.getByText('Churn risk — Ada')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Churn risk — Ada'));
    expect(onSelectClient).toHaveBeenCalledWith('001A');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run (from `ReactHeadless` dir): `npm run test -- run src/retail/sections/AttentionSection.test.tsx`
Expected: FAIL — `Cannot find module './AttentionSection'`.

- [ ] **Step 7: Write minimal implementation (component)**

Create `force-app/main/default/uiBundles/ReactHeadless/src/retail/sections/AttentionSection.tsx`:

```tsx
import { useAsyncData, AttentionQueue, type AttentionItem } from '@shared';
import { fetchAttentionItems } from '../data/attention';

interface AttentionSectionProps {
  onSelectClient?: (accountId: string) => void;
}

/** "Attention Today" — churn-ranked, next-best-action queue (Data Cloud ML). */
export function AttentionSection({ onSelectClient }: AttentionSectionProps) {
  const { data, loading, error } = useAsyncData(fetchAttentionItems, []);

  if (loading) return <div style={{ color: 'var(--wp-text-muted)' }}>Ranking your book…</div>;
  if (error) return <div role="alert">Could not load attention queue.</div>;

  return (
    <AttentionQueue
      items={data ?? []}
      onSelect={(item: AttentionItem) => onSelectClient?.(item.id)}
    />
  );
}
```

- [ ] **Step 8: Mount in RetailHome + run tests**

In `src/retail/RetailHome.tsx`, add a section above the KPI strip (attention is the primary morning focus). This requires lifting a `selectedClientId` state that Task 5 consumes — add it now:

```tsx
import { useState } from 'react';
import { AttentionSection } from './sections/AttentionSection';
// inside component:
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
// in JSX, before the KPI section:
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Attention Today</h2>
        <AttentionSection onSelectClient={setSelectedClientId} />
      </section>
```

(Keep `selectedClientId` even though it's only read starting Task 5; export nothing.)

Run (from `ReactHeadless` dir): `npm run test -- run src/retail/`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add force-app/main/default/uiBundles/ReactHeadless/src/retail
git commit -m "feat(retail): churn + next-best-product attention queue (Data Cloud)"
```

---

### Task 5: Client drill-in (Core/FSC profile — cinematic successor to the profile widget)

**Files:**
- Create: `force-app/main/default/uiBundles/ReactHeadless/src/retail/data/queries/clientProfile.graphql`
- Create: `force-app/main/default/uiBundles/ReactHeadless/src/retail/data/client.ts`
- Create: `force-app/main/default/uiBundles/ReactHeadless/src/retail/data/client.test.ts`
- Create: `force-app/main/default/uiBundles/ReactHeadless/src/retail/sections/ClientDrillIn.tsx`
- Create: `force-app/main/default/uiBundles/ReactHeadless/src/retail/sections/ClientDrillIn.test.tsx`
- Modify: `force-app/main/default/uiBundles/ReactHeadless/src/retail/RetailHome.tsx`

**Interfaces:**
- Consumes: `executeGraphQL`, `useAsyncData` from `@shared`; generated types from Task 2.
- Produces:
  - `type ClientProfile = { id: string; name: string; email: string | null; phone: string | null; financialAccounts: { id: string; name: string; type: string; balance: number }[] }`.
  - `fetchClientProfile(accountId: string): Promise<ClientProfile | null>`.
  - `<ClientDrillIn accountId={string | null} />` — shows the profile for the selected attention-queue client; empty state when `accountId` is null. Mounted in `RetailHome`, fed by `selectedClientId`.

- [ ] **Step 1: Write the failing test (fetcher)**

Create `force-app/main/default/uiBundles/ReactHeadless/src/retail/data/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const execMock = vi.fn();
vi.mock('@shared', () => ({ executeGraphQL: (...a: unknown[]) => execMock(...a) }));

import { fetchClientProfile } from './client';

describe('fetchClientProfile', () => {
  beforeEach(() => execMock.mockReset());

  it('returns null when no accountId is given', async () => {
    const result = await fetchClientProfile('');
    expect(result).toBeNull();
    expect(execMock).not.toHaveBeenCalled();
  });

  it('maps the account + financial accounts into a ClientProfile', async () => {
    execMock.mockResolvedValue({
      uiapi: {
        query: {
          Account: {
            edges: [
              {
                node: {
                  Id: '001A',
                  Name: { value: 'Ada Lovelace' },
                  PersonEmail: { value: 'ada@example.com' },
                  Phone: { value: '555-0100' },
                  FinServ__FinancialAccounts__r: {
                    edges: [
                      { node: { Id: 'fa1', Name: { value: 'Checking' }, FinServ__FinancialAccountType__c: { value: 'Checking' }, FinServ__Balance__c: { value: 5200 } } },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    });
    const result = await fetchClientProfile('001A');
    expect(result?.name).toBe('Ada Lovelace');
    expect(result?.email).toBe('ada@example.com');
    expect(result?.financialAccounts[0].balance).toBe(5200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `ReactHeadless` dir): `npm run test -- run src/retail/data/client.test.ts`
Expected: FAIL — `Cannot find module './client'`.

- [ ] **Step 3: Write the GraphQL operation**

> Confirm field names via `graphql-search.sh Account FinServ__FinancialAccount__c` (Task 2). The child relationship name (`FinServ__FinancialAccounts__r`) and person fields (`PersonEmail`) are org-specific — verify before finalizing. Adjust the query + mapper together if names differ.

Create `force-app/main/default/uiBundles/ReactHeadless/src/retail/data/queries/clientProfile.graphql`:

```graphql
query RetailClientProfile($accountId: ID!) {
  uiapi {
    query {
      Account(first: 1, where: { Id: { eq: $accountId } }) {
        edges {
          node {
            Id
            Name @optional { value }
            PersonEmail @optional { value }
            Phone @optional { value }
            FinServ__FinancialAccounts__r @optional(first: 20) {
              edges {
                node {
                  Id
                  Name @optional { value }
                  FinServ__FinancialAccountType__c @optional { value }
                  FinServ__Balance__c @optional { value }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

- [ ] **Step 4: Regenerate types**

Run (from `ReactHeadless` dir): `npm run graphql:codegen`
Expected: `RetailClientProfileQuery` + `RetailClientProfileQueryVariables` appear.

- [ ] **Step 5: Write minimal implementation**

Create `force-app/main/default/uiBundles/ReactHeadless/src/retail/data/client.ts`:

```typescript
import { executeGraphQL } from '@shared';
import type {
  RetailClientProfileQuery,
  RetailClientProfileQueryVariables,
} from '@api/graphql-operations-types';
import CLIENT_PROFILE_QUERY from './queries/clientProfile.graphql?raw';

export interface ClientFinancialAccount {
  id: string;
  name: string;
  type: string;
  balance: number;
}

export interface ClientProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  financialAccounts: ClientFinancialAccount[];
}

/**
 * Client drill-in profile. Account, person contact fields, and FSC financial
 * accounts all originate in Salesforce → GraphQL path (data-access rule).
 */
export async function fetchClientProfile(accountId: string): Promise<ClientProfile | null> {
  if (!accountId) return null;
  const data = await executeGraphQL<RetailClientProfileQuery, RetailClientProfileQueryVariables>(
    CLIENT_PROFILE_QUERY,
    { accountId }
  );
  const node = data.uiapi?.query?.Account?.edges?.[0]?.node;
  if (!node) return null;
  return {
    id: node.Id,
    name: node.Name?.value ?? 'Unknown',
    email: node.PersonEmail?.value ?? null,
    phone: node.Phone?.value ?? null,
    financialAccounts: (node.FinServ__FinancialAccounts__r?.edges ?? []).map(e => ({
      id: e.node.Id,
      name: e.node.Name?.value ?? '',
      type: e.node.FinServ__FinancialAccountType__c?.value ?? '',
      balance: Number(e.node.FinServ__Balance__c?.value ?? 0),
    })),
  };
}
```

- [ ] **Step 6: Run fetcher test to verify pass**

Run (from `ReactHeadless` dir): `npm run test -- run src/retail/data/client.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the failing test (component)**

Create `force-app/main/default/uiBundles/ReactHeadless/src/retail/sections/ClientDrillIn.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@shared';

vi.mock('../data/client', () => ({
  fetchClientProfile: vi.fn(async (id: string) =>
    id
      ? { id, name: 'Ada Lovelace', email: 'ada@x.com', phone: null, financialAccounts: [] }
      : null
  ),
}));

import { ClientDrillIn } from './ClientDrillIn';

describe('ClientDrillIn', () => {
  it('shows an empty state when no client is selected', () => {
    render(
      <ThemeProvider persona="retail">
        <ClientDrillIn accountId={null} />
      </ThemeProvider>
    );
    expect(screen.getByText(/select a client/i)).toBeInTheDocument();
  });

  it('renders the selected client profile', async () => {
    render(
      <ThemeProvider persona="retail">
        <ClientDrillIn accountId="001A" />
      </ThemeProvider>
    );
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run (from `ReactHeadless` dir): `npm run test -- run src/retail/sections/ClientDrillIn.test.tsx`
Expected: FAIL — `Cannot find module './ClientDrillIn'`.

- [ ] **Step 9: Write minimal implementation (component)**

Create `force-app/main/default/uiBundles/ReactHeadless/src/retail/sections/ClientDrillIn.tsx`:

```tsx
import { useCallback } from 'react';
import { useAsyncData } from '@shared';
import { fetchClientProfile } from '../data/client';

interface ClientDrillInProps {
  accountId: string | null;
}

/** Cinematic client drill-in — successor to the pilot profile widget. */
export function ClientDrillIn({ accountId }: ClientDrillInProps) {
  const fetcher = useCallback(() => fetchClientProfile(accountId ?? ''), [accountId]);
  const { data, loading, error } = useAsyncData(fetcher, [accountId]);

  if (!accountId) {
    return (
      <div style={{ color: 'var(--wp-text-muted)', padding: '1rem' }}>
        Select a client from the attention queue to drill in.
      </div>
    );
  }
  if (loading) return <div style={{ color: 'var(--wp-text-muted)' }}>Loading client…</div>;
  if (error || !data) return <div role="alert">Could not load client profile.</div>;

  return (
    <div
      style={{
        background: 'var(--wp-surface-glass)',
        border: '1px solid var(--wp-border)',
        borderRadius: 'var(--wp-radius)',
        boxShadow: 'var(--wp-shadow)',
        padding: '1.25rem',
      }}
    >
      <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>{data.name}</h3>
      <div style={{ color: 'var(--wp-text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
        {[data.email, data.phone].filter(Boolean).join(' · ') || 'No contact info'}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, marginTop: '1rem', display: 'grid', gap: '0.5rem' }}>
        {data.financialAccounts.map(fa => (
          <li
            key={fa.id}
            style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}
          >
            <span>
              {fa.name} <span style={{ color: 'var(--wp-text-muted)' }}>({fa.type})</span>
            </span>
            <span style={{ fontWeight: 600 }}>
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(fa.balance)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 10: Mount in RetailHome + run tests**

In `src/retail/RetailHome.tsx`, render `<ClientDrillIn accountId={selectedClientId} />` in a two-column area beside/below the attention queue:

```tsx
import { ClientDrillIn } from './sections/ClientDrillIn';
// in JSX, after the attention section:
      <section style={{ marginBottom: '2rem' }}>
        <ClientDrillIn accountId={selectedClientId} />
      </section>
```

Run (from `ReactHeadless` dir): `npm run test -- run src/retail/`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add force-app/main/default/uiBundles/ReactHeadless/src/retail
git commit -m "feat(retail): client drill-in profile (Core/FSC GraphQL)"
```

---

### Task 6: Activity stream + pipeline + goals panels (Core/FSC via GraphQL)

**Files:**
- Create: `.../src/retail/data/queries/bookActivity.graphql`
- Create: `.../src/retail/data/activity.ts` + `activity.test.ts`
- Create: `.../src/retail/sections/ActivityStream.tsx` + `ActivityStream.test.tsx`
- Create: `.../src/retail/sections/PipelinePanel.tsx` + `PipelinePanel.test.tsx`
- Create: `.../src/retail/data/pipeline.ts` + `pipeline.test.ts` (queries/bookPipeline.graphql)
- Create: `.../src/retail/data/goals.ts` + `goals.test.ts` (queries/bookGoals.graphql)
- Create: `.../src/retail/sections/GoalsPanel.tsx` + `GoalsPanel.test.tsx`
- Modify: `.../src/retail/RetailHome.tsx`

**Interfaces:**
- Consumes: `executeGraphQL`, `useAsyncData` from `@shared`; generated types.
- Produces:
  - `type ActivityItem = { id: string; kind: 'task' | 'event'; subject: string; when: string }`; `fetchRecentActivity(): Promise<ActivityItem[]>`; `<ActivityStream />`.
  - `type PipelineOpp = { id: string; name: string; stage: string; amount: number; closeDate: string }`; `fetchPipeline(): Promise<PipelineOpp[]>`; `<PipelinePanel />`.
  - `type GoalProgress = { id: string; name: string; target: number; current: number; pct: number }`; `fetchGoals(): Promise<GoalProgress[]>`; `<GoalsPanel />`.
  - All three mounted in `RetailHome`.

> This task groups three structurally-identical read-panels (fetch Core records → map → render a list). Each follows the exact TDD shape proven in Tasks 3 & 5: (1) fetcher test with a mocked `executeGraphQL`, (2) `.graphql` op verified via `graphql-search.sh`, (3) `graphql:codegen`, (4) fetcher impl, (5) component test with mocked fetcher, (6) component impl, (7) mount. Implement them one at a time, committing after each, in the order Activity → Pipeline → Goals.

- [ ] **Step 1 (Activity): failing fetcher test**

Create `.../src/retail/data/activity.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
const execMock = vi.fn();
vi.mock('@shared', () => ({ executeGraphQL: (...a: unknown[]) => execMock(...a) }));
import { fetchRecentActivity } from './activity';

describe('fetchRecentActivity', () => {
  beforeEach(() => execMock.mockReset());
  it('merges Task + Event edges into a unified, dated stream', async () => {
    execMock.mockResolvedValue({
      uiapi: { query: {
        Task: { edges: [{ node: { Id: 't1', Subject: { value: 'Call Ada' }, ActivityDate: { value: '2026-07-02' } } }] },
        Event: { edges: [{ node: { Id: 'e1', Subject: { value: 'Review meeting' }, ActivityDateTime: { value: '2026-07-03T15:00:00Z' } } }] },
      } },
    });
    const items = await fetchRecentActivity();
    expect(items.find(i => i.id === 't1')?.kind).toBe('task');
    expect(items.find(i => i.id === 'e1')?.kind).toBe('event');
  });
});
```

- [ ] **Step 2 (Activity): run → fail**

Run: `npm run test -- run src/retail/data/activity.test.ts` → FAIL (module missing).

- [ ] **Step 3 (Activity): write the op**

> Verify `Task`/`Event` field names via `graphql-search.sh Task Event`. Create `.../src/retail/data/queries/bookActivity.graphql`:

```graphql
query RetailBookActivity {
  uiapi {
    query {
      Task(first: 15, orderBy: { ActivityDate: { order: DESC } }, where: { IsClosed: { eq: false } }) {
        edges { node { Id Subject @optional { value } ActivityDate @optional { value } } }
      }
      Event(first: 15, orderBy: { ActivityDateTime: { order: DESC } }) {
        edges { node { Id Subject @optional { value } ActivityDateTime @optional { value } } }
      }
    }
  }
}
```

- [ ] **Step 4 (Activity): codegen**

Run: `npm run graphql:codegen` → `RetailBookActivityQuery` appears.

- [ ] **Step 5 (Activity): implement fetcher**

Create `.../src/retail/data/activity.ts`:

```typescript
import { executeGraphQL } from '@shared';
import type { RetailBookActivityQuery } from '@api/graphql-operations-types';
import ACTIVITY_QUERY from './queries/bookActivity.graphql?raw';

export interface ActivityItem {
  id: string;
  kind: 'task' | 'event';
  subject: string;
  when: string;
}

/** Unified activity stream from Core Task + Event (SalesforceDotCom origin). */
export async function fetchRecentActivity(): Promise<ActivityItem[]> {
  const data = await executeGraphQL<RetailBookActivityQuery>(ACTIVITY_QUERY);
  const q = data.uiapi?.query;
  const tasks: ActivityItem[] = (q?.Task?.edges ?? []).map(e => ({
    id: e.node.Id,
    kind: 'task',
    subject: e.node.Subject?.value ?? '(no subject)',
    when: e.node.ActivityDate?.value ?? '',
  }));
  const events: ActivityItem[] = (q?.Event?.edges ?? []).map(e => ({
    id: e.node.Id,
    kind: 'event',
    subject: e.node.Subject?.value ?? '(no subject)',
    when: e.node.ActivityDateTime?.value ?? '',
  }));
  return [...tasks, ...events].sort((a, b) => (a.when < b.when ? 1 : -1));
}
```

- [ ] **Step 6 (Activity): run → pass**

Run: `npm run test -- run src/retail/data/activity.test.ts` → PASS.

- [ ] **Step 7 (Activity): component test**

Create `.../src/retail/sections/ActivityStream.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@shared';
vi.mock('../data/activity', () => ({
  fetchRecentActivity: vi.fn(async () => [{ id: 't1', kind: 'task' as const, subject: 'Call Ada', when: '2026-07-02' }]),
}));
import { ActivityStream } from './ActivityStream';

describe('ActivityStream', () => {
  it('renders activity items', async () => {
    render(<ThemeProvider persona="retail"><ActivityStream /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('Call Ada')).toBeInTheDocument());
  });
});
```

- [ ] **Step 8 (Activity): run → fail, then implement**

Run: `npm run test -- run src/retail/sections/ActivityStream.test.tsx` → FAIL. Then create `.../src/retail/sections/ActivityStream.tsx`:

```tsx
import { useAsyncData } from '@shared';
import { fetchRecentActivity } from '../data/activity';

/** Recent Task/Event activity across the book. */
export function ActivityStream() {
  const { data, loading, error } = useAsyncData(fetchRecentActivity, []);
  if (loading) return <div style={{ color: 'var(--wp-text-muted)' }}>Loading activity…</div>;
  if (error) return <div role="alert">Could not load activity.</div>;
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.4rem' }}>
      {(data ?? []).map(a => (
        <li key={a.id} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.9rem' }}>
          <span style={{ color: 'var(--wp-accent)', textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 700, minWidth: 42 }}>
            {a.kind}
          </span>
          <span style={{ flex: 1 }}>{a.subject}</span>
          <span style={{ color: 'var(--wp-text-muted)' }}>{a.when}</span>
        </li>
      ))}
    </ul>
  );
}
```
Run again → PASS.

- [ ] **Step 9 (Pipeline): repeat the shape**

Fetcher test → op (`graphql-search.sh Opportunity`; select `Name`, `StageName`, `Amount`, `CloseDate`, `where: { IsClosed: { eq: false } }`, `orderBy: { CloseDate: { order: ASC } }`, `first: 20`) → codegen → fetcher → component → mount. Types:

```typescript
export interface PipelineOpp { id: string; name: string; stage: string; amount: number; closeDate: string; }
export async function fetchPipeline(): Promise<PipelineOpp[]> { /* map Opportunity edges */ }
```
`<PipelinePanel />` renders each opp with name, stage badge, currency-formatted amount, close date. Commit after green.

- [ ] **Step 10 (Goals): repeat the shape**

Fetcher test → op (`graphql-search.sh FinancialGoal`; select goal name, target amount, current amount fields — confirm exact API names, they are org-specific per the picklist/label memory) → codegen → fetcher (compute `pct = current/target`) → `<GoalsPanel />` renders a labeled progress bar per goal using `var(--wp-accent)` fill. Types:

```typescript
export interface GoalProgress { id: string; name: string; target: number; current: number; pct: number; }
export async function fetchGoals(): Promise<GoalProgress[]> { /* map FinancialGoal edges */ }
```
Commit after green.

- [ ] **Step 11: Mount all three in RetailHome + full suite**

In `src/retail/RetailHome.tsx`, add a responsive grid section holding `<ActivityStream />`, `<PipelinePanel />`, `<GoalsPanel />` (each in a glass card wrapper). Run (from `ReactHeadless` dir): `npm run test -- run src/retail/` → all PASS.

- [ ] **Step 12: Commit**

```bash
git add force-app/main/default/uiBundles/ReactHeadless/src/retail
git commit -m "feat(retail): activity stream + pipeline + goals panels (Core/FSC)"
```

---

### Task 7: Cumulus Assistant dock — live Agentforce Conversation Client

**Files:**
- Create: `.../src/retail/agent/assistantClient.ts` + `assistantClient.test.ts`
- Create: `.../src/retail/agent/useAssistant.ts` + `useAssistant.test.tsx`
- Create: `.../src/retail/sections/AssistantDock.tsx` + `AssistantDock.test.tsx`
- Modify: `.../src/retail/RetailHome.tsx`
- Possibly modify: `ReactHeadless.uibundle-meta.xml` / CSP config if the Agentforce endpoint needs a trusted site.

**Interfaces:**
- Consumes: the Agentforce Conversation Client from `@salesforce/platform-sdk` (per the `implementing-ui-bundle-agentforce-conversation-client` skill — load it before implementing this task). `useTheme` from `@shared`.
- Produces:
  - `type AssistantMessage = { id: string; role: 'user' | 'agent'; text: string }`.
  - `createAssistantSession(): Promise<AssistantSession>` where `AssistantSession = { sendMessage(text: string): Promise<AssistantMessage>; end(): Promise<void> }` — thin wrapper over the SDK conversation client.
  - `useAssistant(): { messages: AssistantMessage[]; send(text: string): Promise<void>; sending: boolean; error: string | null }`.
  - `<AssistantDock />` — persistent bottom-right dock; input + transcript. Mounted in `RetailHome`.

> **Load the skill first:** invoke `implementing-ui-bundle-agentforce-conversation-client` to get the exact current client API (session creation, message send, streaming). The signatures below define the wrapper's stable surface; adapt the wrapper body to the skill's API. The wrapper exists precisely so the SDK's shape is isolated to one file and the dock/hook test against `AssistantSession`, not the SDK.

- [ ] **Step 1: Load the Agentforce skill**

Invoke the `implementing-ui-bundle-agentforce-conversation-client` skill. Note the exact import + session/create/send API. Confirm the agent ID for the Cumulus retail assistant (from the sibling `Cumulus_Assistant` component config, or ask the user if unavailable).

- [ ] **Step 2: Write the failing test (wrapper, SDK mocked)**

Create `.../src/retail/agent/assistantClient.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

// Mock the SDK conversation client surface (adapt to the real export the skill specifies).
const sendMock = vi.fn(async () => ({ text: 'Hello from the assistant' }));
vi.mock('@salesforce/platform-sdk', () => ({
  createAgentforceClient: vi.fn(async () => ({
    createSession: vi.fn(async () => ({ sendMessage: sendMock, end: vi.fn(async () => {}) })),
  })),
}));

import { createAssistantSession } from './assistantClient';

describe('createAssistantSession', () => {
  it('sends a message and returns an agent AssistantMessage', async () => {
    const session = await createAssistantSession();
    const reply = await session.sendMessage('hi');
    expect(reply.role).toBe('agent');
    expect(reply.text).toContain('assistant');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- run src/retail/agent/assistantClient.test.ts` → FAIL (module missing).

- [ ] **Step 4: Write minimal implementation (wrapper)**

Create `.../src/retail/agent/assistantClient.ts` (adapt the SDK calls to the skill's actual API; keep the exported surface stable):

```typescript
/**
 * Thin wrapper over the Agentforce Conversation Client for the Cumulus retail
 * assistant. Isolates the SDK surface so the dock + hook test against a stable
 * AssistantSession contract. Adapt the SDK calls to match
 * implementing-ui-bundle-agentforce-conversation-client.
 */
import { createAgentforceClient } from '@salesforce/platform-sdk';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
}

export interface AssistantSession {
  sendMessage(text: string): Promise<AssistantMessage>;
  end(): Promise<void>;
}

// Retail Cumulus assistant agent id — confirm against Cumulus_Assistant config.
const RETAIL_AGENT_ID = 'REPLACE_WITH_CONFIRMED_AGENT_ID';

export async function createAssistantSession(): Promise<AssistantSession> {
  const client = await createAgentforceClient();
  const session = await client.createSession({ agentId: RETAIL_AGENT_ID });
  let seq = 0;
  return {
    async sendMessage(text: string): Promise<AssistantMessage> {
      const res = await session.sendMessage(text);
      seq += 1;
      return { id: `agent-${seq}`, role: 'agent', text: res.text ?? '' };
    },
    async end(): Promise<void> {
      await session.end();
    },
  };
}
```

> The `RETAIL_AGENT_ID` placeholder is the ONE value that must be filled from org config in Step 1 — it is not derivable from code. Replace it before deploy; the test mocks the SDK so it passes regardless, but a live run needs the real id.

- [ ] **Step 5: Run wrapper test → pass**

Run: `npm run test -- run src/retail/agent/assistantClient.test.ts` → PASS.

- [ ] **Step 6: Write the failing test (hook)**

Create `.../src/retail/agent/useAssistant.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('./assistantClient', () => ({
  createAssistantSession: vi.fn(async () => ({
    sendMessage: vi.fn(async (t: string) => ({ id: 'a1', role: 'agent' as const, text: `echo:${t}` })),
    end: vi.fn(async () => {}),
  })),
}));

import { useAssistant } from './useAssistant';

describe('useAssistant', () => {
  it('appends the user message and the agent reply', async () => {
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.send('hello'); });
    await waitFor(() => {
      const texts = result.current.messages.map(m => `${m.role}:${m.text}`);
      expect(texts).toContain('user:hello');
      expect(texts).toContain('agent:echo:hello');
    });
  });
});
```

- [ ] **Step 7: Run → fail, then implement the hook**

Run: `npm run test -- run src/retail/agent/useAssistant.test.tsx` → FAIL. Create `.../src/retail/agent/useAssistant.ts`:

```typescript
import { useCallback, useRef, useState } from 'react';
import { createAssistantSession, type AssistantMessage, type AssistantSession } from './assistantClient';

/** Manages a single Agentforce session + the transcript for the dock. */
export function useAssistant() {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<AssistantSession | null>(null);
  const counter = useRef(0);

  const send = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    counter.current += 1;
    const userMsg: AssistantMessage = { id: `user-${counter.current}`, role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    try {
      if (!sessionRef.current) sessionRef.current = await createAssistantSession();
      const reply = await sessionRef.current.sendMessage(text);
      setMessages(prev => [...prev, reply]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assistant error');
    } finally {
      setSending(false);
    }
  }, []);

  return { messages, send, sending, error };
}
```
Run again → PASS.

- [ ] **Step 8: Write the failing test (dock component)**

Create `.../src/retail/sections/AssistantDock.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@shared';

const sendSpy = vi.fn(async () => {});
vi.mock('../agent/useAssistant', () => ({
  useAssistant: () => ({ messages: [{ id: 'a1', role: 'agent', text: 'Hi, how can I help?' }], send: sendSpy, sending: false, error: null }),
}));

import { AssistantDock } from './AssistantDock';

describe('AssistantDock', () => {
  it('renders the transcript and sends input on submit', async () => {
    render(<ThemeProvider persona="retail"><AssistantDock /></ThemeProvider>);
    expect(screen.getByText('Hi, how can I help?')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'show me churn risks' } });
    fireEvent.submit(screen.getByTestId('assistant-form'));
    await waitFor(() => expect(sendSpy).toHaveBeenCalledWith('show me churn risks'));
  });
});
```

- [ ] **Step 9: Run → fail, then implement the dock**

Run: `npm run test -- run src/retail/sections/AssistantDock.test.tsx` → FAIL. Create `.../src/retail/sections/AssistantDock.tsx`:

```tsx
import { useState } from 'react';
import { useAssistant } from '../agent/useAssistant';

/** Persistent Cumulus Assistant dock — live Agentforce conversation. */
export function AssistantDock() {
  const { messages, send, sending, error } = useAssistant();
  const [draft, setDraft] = useState('');

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft;
    setDraft('');
    void send(text);
  };

  return (
    <aside
      style={{
        position: 'fixed',
        right: '1.5rem',
        bottom: '1.5rem',
        width: 340,
        maxHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--wp-surface-glass)',
        border: '1px solid var(--wp-border)',
        borderRadius: 'var(--wp-radius)',
        boxShadow: 'var(--wp-shadow)',
        backdropFilter: 'blur(12px)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '0.75rem 1rem', background: 'var(--wp-accent-gradient)', color: '#fff', fontWeight: 700 }}>
        Cumulus Assistant
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'grid', gap: '0.5rem' }}>
        {messages.map(m => (
          <div
            key={m.id}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              background: m.role === 'user' ? 'var(--wp-accent)' : 'var(--wp-surface-raised)',
              color: m.role === 'user' ? '#fff' : 'var(--wp-text)',
              padding: '0.5rem 0.75rem',
              borderRadius: 12,
              fontSize: '0.9rem',
              maxWidth: '85%',
            }}
          >
            {m.text}
          </div>
        ))}
        {error && <div role="alert" style={{ color: '#ef4444', fontSize: '0.85rem' }}>{error}</div>}
      </div>
      <form data-testid="assistant-form" onSubmit={onSubmit} style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem', borderTop: '1px solid var(--wp-border)' }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Ask the assistant…"
          style={{ flex: 1, background: 'var(--wp-surface)', border: '1px solid var(--wp-border)', borderRadius: 8, color: 'var(--wp-text)', padding: '0.4rem 0.6rem' }}
        />
        <button type="submit" disabled={sending} style={{ background: 'var(--wp-accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '0.4rem 0.8rem', fontWeight: 600 }}>
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </aside>
  );
}
```
Run again → PASS.

- [ ] **Step 10: Mount in RetailHome + full suite + build**

In `src/retail/RetailHome.tsx`, render `<AssistantDock />` at the end of the root div (it's `position: fixed`, so placement in the tree is cosmetic). Run (from `ReactHeadless` dir): `npm run test -- run src/retail/ && npm run build`.
Expected: all tests PASS; build succeeds.

- [ ] **Step 11: Commit**

```bash
git add force-app/main/default/uiBundles/ReactHeadless/src/retail
git commit -m "feat(retail): live Agentforce Cumulus Assistant dock"
```

---

### Task 8: Full-suite gate, deploy, and pilot verification

**Files:**
- Modify: none (verification + deploy) — fix any surfaced issues.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a deployed, data-real Retail cockpit verified against pilot Account `001am00000qvjsAAAQ`. This is the proving-ground gate before Commercial/Wealth plans execute.

- [ ] **Step 1: Full test suite + typecheck + lint**

Run (from `ReactHeadless` dir):
```bash
npm run test -- run
npx tsc -b --noEmit
npm run lint
```
Expected: all green, 0 type errors, 0 lint errors. Coverage thresholds (85%, per `vite.config.ts`) met.

- [ ] **Step 2: Confirm the real Agentforce agent id is set**

Verify `RETAIL_AGENT_ID` in `src/retail/agent/assistantClient.ts` is the confirmed Cumulus retail agent id (not the placeholder). If still placeholder, resolve from org config or the user before deploy.

- [ ] **Step 3: Build + deploy**

From the SFDX project root:
```bash
cd force-app/main/default/uiBundles/ReactHeadless && npm run build && cd -
sf project deploy start --source-dir force-app/main/default/uiBundles/ReactHeadless --source-dir force-app/main/default/classes -o jdo-0pz8au --json
```
Expected: `status: 0`, `numberComponentErrors: 0`. Read the JSON.

- [ ] **Step 4: Manual pilot verification**

Open the deployed bundle (the platform serves it at the opaque `/lwr/application/...` URL). Confirm against pilot Account `001am00000qvjsAAAQ`:
- Attention queue populates with churn-ranked clients + next-best-product reasons.
- Clicking a queue item drills the client into the profile card with FSC financial accounts.
- Book KPI strip shows non-zero counts; activity/pipeline/goals panels render real records.
- Assistant dock opens a live Agentforce session and returns a reply.

Record any gaps as follow-up tasks; do NOT mark this plan complete with a red pilot check.

- [ ] **Step 5: Commit any fixes + final commit**

```bash
git add -A force-app/main/default/uiBundles/ReactHeadless
git commit -m "chore(retail): full-suite gate green + deployed to jdo-0pz8au"
```

---

## Self-Review

**1. Spec coverage** (against the checkpoint scope directive — surface profile-widget data + standard-home content + DC enrichment):
- Profile-widget successor → Task 5 (ClientDrillIn) ✓
- Standard home content: Opportunities → Task 6 (Pipeline); Cases → Task 3 (KPI) ✓; Tasks/Events/activity → Task 6 (ActivityStream) ✓; Goals → Task 6 (GoalsPanel) ✓; Financials → Task 5 (financial accounts) + Task 3 ✓
- DC third-party enrichment + ML → Task 4 (churn/NBA); life-events/held-away enrichment can extend Task 4's SQL (noted). *Gap acknowledged:* Plaid held-away + life-event enrichment columns are folded into the attention reason via SQL extension rather than a dedicated panel — if a standalone enrichment panel is wanted, add a Task 4b mirroring Task 4's shape. Flag for review.
- Agentic (full end-to-end, per the locked decision) → Tasks 4 (rankings) + 7 (live Agentforce) ✓
- Cinematic per-LOB identity → retail theme via `@shared` `ThemeProvider` + glass/gradient/count-up primitives ✓

**2. Placeholder scan:** The only intentional placeholder is `RETAIL_AGENT_ID` (Task 7), which is org config, not derivable from code — Task 8 Step 2 gates deploy on replacing it. Task 6 Steps 9–10 (Pipeline/Goals) intentionally reference "repeat the proven shape" rather than repeating identical code, but specify exact fields, types, query args, and ordering — right-sized because they're mechanically identical to Tasks 3/5 which show full code. GraphQL query strings are gated behind Task 2 (schema fetch) per skill preconditions.

**3. Type consistency:** `AttentionItem` (from `@shared`) fields used in Task 4 match the Foundation definition (`id/title/reason/score/severity/clientName`). `BookKpi.format` matches `KpiTile`'s `format` union. `ClientProfile`, `ActivityItem`, `PipelineOpp`, `GoalProgress`, `AssistantMessage`, `AssistantSession` are each defined once and consumed consistently. `selectedClientId: string | null` state (Task 4) matches `ClientDrillIn`'s `accountId: string | null` prop (Task 5).

**Note for Commercial/Wealth plans:** Both clone this structure — rebrand-or-scaffold → schema fetch → KPI strip → attention queue (different model: credit/covenant for Commercial, portfolio-drift/plan-progress for Wealth) → client drill-in → LOB-specific panels → reuse the Task 7 Agentforce dock pattern (different agent id) → deploy+verify. Commercial and Wealth are NEW sibling bundles (own `.uibundle-meta.xml`), each wiring the `@shared` alias per Foundation Task 1.
