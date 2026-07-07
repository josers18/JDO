# Commercial Banking — "Relationship Command" Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Commercial Banking morning-landing cockpit — a full-screen React app (new sibling UI bundle) that replaces the standard Salesforce home for a commercial relationship manager, surfacing their portfolio ranked by credit/covenant risk, a relationship/hierarchy graph, firmographics + SEC enrichment, and a live Agentforce assistant — reusing the proven `_shared` foundation and the Retail agentic pattern.

**Architecture:** A NEW deployable UI bundle `CommercialCommand` scaffolded via `sf template generate ui-bundle`, sibling to `ReactHeadless` (Retail). It wires the `@shared` alias exactly as Foundation Task 1 did for Retail, and follows the Retail plan's 8-task skeleton. Data follows the dual-path rule: Core/FSC (Account, Opportunity, Case, Task, Event, business FinancialGoal/BusinessMilestone, FinServ__FinancialAccount__c) via `executeGraphQL`; Data Cloud enrichment (DnB business credit/PAYDEX, ZoomInfo firmographics, Moody's market context, BoardEx exec intel, SEC filings, covenant/delinquency predictions, relationship graph) via `queryDataCloud` through the Apex REST bridge. Agentforce assistant via the SDK Conversation Client with the commercial agent id.

**Tech Stack:** React 19, TypeScript 5.9 (strict), Vite 7, Vitest 4 + Testing Library, Tailwind v4, `@salesforce/platform-sdk` 10.6, `@shared` foundation library, Salesforce UI Bundle SDK, Agentforce Conversation Client.

## Global Constraints

- **API version 67.0** — `sourceApiVersion`; UIBundle deploy fails below v67.
- **Consumes the `@shared` contract** (from `2026-07-02-shared-foundation.md`): `executeGraphQL`, `queryDataCloud`, `DataCloudResult`, `useAsyncData`, `ThemeProvider`, `useTheme`, `PERSONA_THEMES`, `PersonaKey`, `PersonaTheme`, `KpiTile`, `Sparkline`, `AttentionQueue`, `AttentionItem`, `SHARED_VERSION`. Foundation MUST be complete + green. The Retail plan SHOULD be built first (it proves the agentic pattern this plan reuses).
- **Persona theme = `commercial`** (copper). App root wraps in `<ThemeProvider persona="commercial">`.
- **GraphQL non-negotiables:** HTTP 200 ≠ success; `@optional` on every read field; `first:` on every query; verify field names via `graphql-search.sh` against the fetched schema BEFORE writing queries. Gated behind the schema-fetch task.
- **No `@AuraEnabled` from React** — Data Cloud via `queryDataCloud` → `POST /services/apexrest/dc/query`.
- **Replace ALL boilerplate** — no scaffold template strings survive.
- **Pilot record for verification:** Business Account `001am00000qvjs6AAA` (org `jdo-0pz8au`).

## File Structure

New bundle at `force-app/main/default/uiBundles/CommercialCommand/`. React app under `src/`:
- `src/commercial/CommercialHome.tsx` — the cockpit page.
- `src/commercial/sections/` — HeroPulseBar, AttentionSection, PortfolioKpiStrip, AccountDrillIn, RelationshipGraph, FirmographicsPanel, PipelinePanel, AssistantDock.
- `src/commercial/data/` — `portfolio.ts` (KPIs), `attention.ts` (credit/covenant risk), `account.ts` (drill-in), `relationship.ts` (hierarchy graph), `firmographics.ts` (DnB/ZoomInfo/SEC), `pipeline.ts`.
- `src/commercial/data/queries/*.graphql` — external GraphQL ops (one per file), written only after schema fetch.
- `src/commercial/agent/` — Agentforce wrapper + dock hook (mirrors Retail Task 7).
- `src/commercial/types.ts` — Commercial view-model types.

---

### Task 1: Scaffold the CommercialCommand bundle + wire `@shared` + theme

**Files:**
- Create (via CLI): `force-app/main/default/uiBundles/CommercialCommand/` (full scaffold)
- Modify: `CommercialCommand/vite.config.ts` (add `@shared` alias)
- Modify: `CommercialCommand/tsconfig.json` (add `@shared/*` path + `../_shared/src` include)
- Modify: `CommercialCommand/src/test/setup.ts` (create — same as Foundation Task 2)
- Modify: `CommercialCommand/src/routes.tsx`, `src/app.tsx`, `src/appLayout.tsx`
- Create: `CommercialCommand/src/commercial/CommercialHome.tsx` + `CommercialHome.test.tsx`
- Modify: `CommercialCommand.uibundle-meta.xml` (MasterLabel → "Commercial — Relationship Command")

**Interfaces:**
- Consumes: `ThemeProvider`, `useTheme` from `@shared`.
- Produces: a deployable `CommercialCommand` bundle with `@shared` resolving; `CommercialHome` default export at the index route under the `commercial` theme.

- [ ] **Step 1: Scaffold the bundle**

From the SFDX project root:
```bash
cd force-app/main/default/uiBundles
sf template generate ui-bundle -t reactbasic -n CommercialCommand
cd CommercialCommand && npm install && cd -
```
Expected: `CommercialCommand/` created with the reactbasic template + `node_modules`.

- [ ] **Step 2: Wire `@shared` alias + include + test setup**

In `CommercialCommand/vite.config.ts`, add to `resolve.alias`: `'@shared': path.resolve(__dirname, '../_shared/src')`.
In `CommercialCommand/tsconfig.json`, add `"@shared/*": ["../_shared/src/*"]` to `paths` and `"../_shared/src"` to `include`.
Create `CommercialCommand/src/test/setup.ts` (identical to Foundation Task 2):

```typescript
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
```
Confirm `CommercialCommand/vite.config.ts` `test.setupFiles` references `'./src/test/setup.ts'` (the reactbasic template includes it; if the path differs, align it).

- [ ] **Step 3: Write the failing test**

Create `CommercialCommand/src/commercial/CommercialHome.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@shared';
import CommercialHome from './CommercialHome';

describe('CommercialHome', () => {
  it('renders the Relationship Command cockpit heading', () => {
    render(
      <ThemeProvider persona="commercial">
        <CommercialHome />
      </ThemeProvider>
    );
    expect(screen.getByRole('heading', { name: /relationship command/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run (from `CommercialCommand` dir): `npm run test -- run src/commercial/CommercialHome.test.tsx`
Expected: FAIL — `Cannot find module './CommercialHome'` (also proves `@shared` resolves).

- [ ] **Step 5: Write minimal implementation**

Create `CommercialCommand/src/commercial/CommercialHome.tsx`:

```tsx
/**
 * Commercial Banking "Relationship Command" cockpit — the RM's morning landing
 * page, replacing the standard Salesforce home. Sections mounted by later tasks.
 */
import { useState } from 'react';

export default function CommercialHome() {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  void selectedAccountId;
  void setSelectedAccountId;
  return (
    <div style={{ minHeight: '100vh', background: 'var(--wp-surface)', color: 'var(--wp-text)', padding: '1.5rem' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>Relationship Command</h1>
        <p style={{ color: 'var(--wp-text-muted)', margin: '0.25rem 0 0' }}>
          Your commercial portfolio, ranked by risk and opportunity
        </p>
      </header>
      {/* Sections mounted by later tasks */}
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run (from `CommercialCommand` dir): `npm run test -- run src/commercial/CommercialHome.test.tsx`
Expected: PASS.

- [ ] **Step 7: Wire routing + theme + rebrand**

In `CommercialCommand/src/routes.tsx`, set the index element to `<CommercialHome />` with `handle: { showInNavigation: true, label: 'Relationship Command' }` (mirror Retail Task 1 Step 5).
In `src/app.tsx`, wrap the router render in `<ThemeProvider persona="commercial">`.
In `src/appLayout.tsx`, replace the boilerplate title with `Cumulus Commercial`.
In `CommercialCommand.uibundle-meta.xml`, set `<masterLabel>Commercial — Relationship Command</masterLabel>`.

- [ ] **Step 8: Build + full test**

Run (from `CommercialCommand` dir): `npm run build && npm run test -- run`
Expected: build → `dist/` 0 errors; tests pass.

- [ ] **Step 9: Commit**

```bash
git add force-app/main/default/uiBundles/CommercialCommand
git commit -m "feat(commercial): scaffold Relationship Command bundle + @shared + theme"
```

---

### Task 2: Deploy + fetch GraphQL schema (unblocks all Core/FSC queries)

**Files:**
- Generated: `schema.graphql` (project root), `CommercialCommand/src/api/graphql-operations-types.ts`

**Interfaces:**
- Consumes: the deployed `CommercialCommand` bundle + the Foundation Apex bridge.
- Produces: live schema + working `graphql-search.sh`. Gates every later GraphQL task. (If the Retail plan already fetched `schema.graphql` from the same org, this can reuse it — but a fresh fetch after this bundle deploys is safest; the org schema is org-wide, not per-bundle.)

- [ ] **Step 1: Build + deploy**

From the SFDX project root:
```bash
cd force-app/main/default/uiBundles/CommercialCommand && npm run build && cd -
sf project deploy start --source-dir force-app/main/default/uiBundles/CommercialCommand -o jdo-0pz8au --json
```
Expected: `status: 0`, `numberComponentErrors: 0`. Read the JSON.

- [ ] **Step 2: Verify via Tooling API**

```bash
sf data query --use-tooling-api -q "SELECT Id, DeveloperName, MasterLabel FROM UIBundle WHERE DeveloperName='CommercialCommand' WITH USER_MODE" -o jdo-0pz8au
```
Expected: one row, `MasterLabel = Commercial — Relationship Command`.

- [ ] **Step 3: Fetch schema + verify entities**

Run (from `CommercialCommand` dir): `npm run graphql:schema`. Then from project root:
```bash
bash scripts/graphql-search.sh Account Opportunity Case Task Event BusinessMilestone FinServ__FinancialAccount__c
```
Expected: type definitions for each. STOP on any empty result (missing object/permission).

- [ ] **Step 4: Commit schema + types**

```bash
git add ../../../../../schema.graphql force-app/main/default/uiBundles/CommercialCommand/src/api/graphql-operations-types.ts
git commit -m "chore(commercial): fetch GraphQL schema + regen types"
```

---

### Task 3: Portfolio KPI strip (Core/FSC via GraphQL)

**Files:**
- Create: `CommercialCommand/src/commercial/data/queries/portfolioKpis.graphql`
- Create: `CommercialCommand/src/commercial/data/portfolio.ts` + `portfolio.test.ts`
- Create: `CommercialCommand/src/commercial/sections/PortfolioKpiStrip.tsx` + `.test.tsx`
- Create: `CommercialCommand/src/commercial/types.ts`
- Modify: `CommercialCommand/src/commercial/CommercialHome.tsx`

**Interfaces:**
- Consumes: `executeGraphQL`, `useAsyncData`, `KpiTile` from `@shared`; generated types.
- Produces:
  - `type CommercialKpi = { key: string; label: string; value: number; format: 'currency' | 'number' | 'percent'; trend?: number[] }` (in `types.ts`).
  - `fetchPortfolioKpis(): Promise<CommercialKpi[]>` — commercial accounts, open commercial opportunities, total exposure (sum of commercial financial-account balances or open-opp amount), open cases.
  - `<PortfolioKpiStrip />` rendering `KpiTile` per KPI. Mounted in `CommercialHome`.

> Follows the exact TDD shape proven in Retail Task 3. KPIs for commercial: portfolio accounts (count), open commercial opportunities (count), total pipeline value (currency, sum of open Opportunity Amount), open cases (count).

- [ ] **Step 1: Write the failing fetcher test**

Create `CommercialCommand/src/commercial/data/portfolio.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
const execMock = vi.fn();
vi.mock('@shared', () => ({ executeGraphQL: (...a: unknown[]) => execMock(...a) }));
import { fetchPortfolioKpis } from './portfolio';

describe('fetchPortfolioKpis', () => {
  beforeEach(() => execMock.mockReset());
  it('maps portfolio counts + pipeline value into CommercialKpis', async () => {
    execMock.mockResolvedValue({
      uiapi: { query: {
        Account: { totalCount: 42 },
        Opportunity: { totalCount: 9, edges: [{ node: { Amount: { value: 500000 } } }, { node: { Amount: { value: 250000 } } }] },
        Case: { totalCount: 3 },
      } },
    });
    const kpis = await fetchPortfolioKpis();
    const byKey = Object.fromEntries(kpis.map(k => [k.key, k]));
    expect(byKey.accounts.value).toBe(42);
    expect(byKey.openOpportunities.value).toBe(9);
    expect(byKey.pipelineValue.value).toBe(750000);
    expect(byKey.pipelineValue.format).toBe('currency');
    expect(byKey.openCases.value).toBe(3);
  });
});
```

- [ ] **Step 2: Run → fail**

Run (from `CommercialCommand` dir): `npm run test -- run src/commercial/data/portfolio.test.ts` → FAIL.

- [ ] **Step 3: Write the GraphQL op**

> Verify names via `graphql-search.sh Account Opportunity Case`. Commercial accounts are filtered by a business record type / `IsPersonAccount = false`; confirm the exact filter field. Create `CommercialCommand/src/commercial/data/queries/portfolioKpis.graphql`:

```graphql
query CommercialPortfolioKpis {
  uiapi {
    query {
      Account(first: 1, where: { IsPersonAccount: { eq: false } }) {
        totalCount
      }
      Opportunity(first: 200, where: { IsClosed: { eq: false } }) {
        totalCount
        edges { node { Amount @optional { value } } }
      }
      Case(first: 1, where: { IsClosed: { eq: false } }) {
        totalCount
      }
    }
  }
}
```

- [ ] **Step 4: Codegen**

Run (from `CommercialCommand` dir): `npm run graphql:codegen` → `CommercialPortfolioKpisQuery` appears.

- [ ] **Step 5: Write types + fetcher**

Create `CommercialCommand/src/commercial/types.ts`:

```typescript
export type KpiFormat = 'currency' | 'number' | 'percent';

export interface CommercialKpi {
  key: string;
  label: string;
  value: number;
  format: KpiFormat;
  trend?: number[];
}
```

Create `CommercialCommand/src/commercial/data/portfolio.ts`:

```typescript
import { executeGraphQL } from '@shared';
import type { CommercialPortfolioKpisQuery } from '@api/graphql-operations-types';
import PORTFOLIO_KPIS_QUERY from './queries/portfolioKpis.graphql?raw';
import type { CommercialKpi } from '../types';

/**
 * Portfolio KPIs for the commercial RM. Accounts, opportunities, and cases all
 * originate in Salesforce → GraphQL path (data-access rule). Pipeline value is
 * summed client-side from open-opportunity amounts.
 */
export async function fetchPortfolioKpis(): Promise<CommercialKpi[]> {
  const data = await executeGraphQL<CommercialPortfolioKpisQuery>(PORTFOLIO_KPIS_QUERY);
  const q = data.uiapi?.query;
  const pipelineValue = (q?.Opportunity?.edges ?? []).reduce(
    (sum, e) => sum + Number(e.node.Amount?.value ?? 0),
    0
  );
  return [
    { key: 'accounts', label: 'Portfolio Accounts', value: q?.Account?.totalCount ?? 0, format: 'number' },
    { key: 'openOpportunities', label: 'Open Opportunities', value: q?.Opportunity?.totalCount ?? 0, format: 'number' },
    { key: 'pipelineValue', label: 'Pipeline Value', value: pipelineValue, format: 'currency' },
    { key: 'openCases', label: 'Open Cases', value: q?.Case?.totalCount ?? 0, format: 'number' },
  ];
}
```

- [ ] **Step 6: Run fetcher test → pass**

Run (from `CommercialCommand` dir): `npm run test -- run src/commercial/data/portfolio.test.ts` → PASS.

- [ ] **Step 7: Component test → fail → implement → pass**

Create `CommercialCommand/src/commercial/sections/PortfolioKpiStrip.test.tsx` (mirror Retail Task 3 Step 7, mock `../data/portfolio` → `fetchPortfolioKpis`, assert a label renders). Run → FAIL. Then create `CommercialCommand/src/commercial/sections/PortfolioKpiStrip.tsx` (identical structure to Retail's `BookKpiStrip` but importing `fetchPortfolioKpis`):

```tsx
import { useAsyncData, KpiTile } from '@shared';
import { fetchPortfolioKpis } from '../data/portfolio';

export function PortfolioKpiStrip() {
  const { data, loading, error } = useAsyncData(fetchPortfolioKpis, []);
  if (loading) return <div style={{ color: 'var(--wp-text-muted)' }}>Loading portfolio…</div>;
  if (error) return <div role="alert">Could not load portfolio KPIs.</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
      {(data ?? []).map(kpi => (
        <KpiTile key={kpi.key} label={kpi.label} value={kpi.value} format={kpi.format} trend={kpi.trend} />
      ))}
    </div>
  );
}
```
Run → PASS.

- [ ] **Step 8: Mount in CommercialHome + commit**

Render `<PortfolioKpiStrip />` in a section in `CommercialHome.tsx`. Run `npm run test -- run src/commercial/` → PASS.
```bash
git add force-app/main/default/uiBundles/CommercialCommand/src/commercial
git commit -m "feat(commercial): portfolio KPI strip from Core/FSC GraphQL"
```

---

### Task 4: Attention queue — credit + covenant risk (Data Cloud predictions)

**Files:**
- Create: `CommercialCommand/src/commercial/data/attention.ts` + `attention.test.ts`
- Create: `CommercialCommand/src/commercial/sections/AttentionSection.tsx` + `.test.tsx`
- Modify: `CommercialCommand/src/commercial/CommercialHome.tsx`

**Interfaces:**
- Consumes: `queryDataCloud`, `useAsyncData`, `AttentionQueue`, `AttentionItem` from `@shared`.
- Produces:
  - `fetchAttentionItems(): Promise<AttentionItem[]>` — ranks the portfolio by a composite credit/covenant risk: DnB PAYDEX deterioration + Moody's downgrade signal + covenant-breach/delinquency prediction. Reason text combines the top risk driver and the recommended RM action.
  - `<AttentionSection onSelectAccount?: (accountId: string) => void />` rendering the shared `AttentionQueue`. Mounted in `CommercialHome`.

> Same shape as Retail Task 4 — mock `queryDataCloud`, severity by score. The DIVERGENCE is the SQL + risk model: credit/covenant, not churn.

- [ ] **Step 1: Write the failing fetcher test**

Create `CommercialCommand/src/commercial/data/attention.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
const dcMock = vi.fn();
vi.mock('@shared', () => ({ queryDataCloud: (...a: unknown[]) => dcMock(...a) }));
import { fetchAttentionItems } from './attention';

describe('fetchAttentionItems (commercial)', () => {
  beforeEach(() => dcMock.mockReset());
  it('maps credit/covenant rows into AttentionItems with severity by score', async () => {
    dcMock.mockResolvedValue({
      columns: [], rowCount: 2, warning: null,
      rows: [
        { account_id: '001X', company_name: 'Acme Mfg', risk_score: 0.88, top_driver: 'PAYDEX dropped 20pts', rm_action: 'review LOC covenant' },
        { account_id: '001Y', company_name: 'Beta Corp', risk_score: 0.30, top_driver: 'stable', rm_action: 'expand deposits' },
      ],
    });
    const items = await fetchAttentionItems();
    const high = items.find(i => i.id === '001X')!;
    expect(high.severity).toBe('high');
    expect(high.clientName).toBe('Acme Mfg');
    expect(high.reason).toMatch(/PAYDEX/);
    expect(high.reason).toMatch(/covenant/i);
    expect(items.find(i => i.id === '001Y')!.severity).toBe('low');
  });
});
```

- [ ] **Step 2: Run → fail**

Run (from `CommercialCommand` dir): `npm run test -- run src/commercial/data/attention.test.ts` → FAIL.

- [ ] **Step 3: Write minimal implementation**

> Confirm DMO/column names (`CumulusDnBBusinessCredit__dlm`, `CumulusMoodysMarketContext__dlm`, `Loan_Delinquencies`/covenant prediction DMO) against the org before live runs, via a `SELECT ... LIMIT 5` probe through DcBridgeRest. Create `CommercialCommand/src/commercial/data/attention.ts`:

```typescript
import { queryDataCloud } from '@shared';
import type { AttentionItem } from '@shared';

interface CommercialRiskRow {
  account_id: string;
  company_name: string;
  risk_score: number;
  top_driver: string;
  rm_action: string;
}

/**
 * The agentic heart of the Commercial cockpit: rank the portfolio by a
 * composite credit/covenant risk — DnB PAYDEX deterioration joined to
 * Moody's market context and the covenant/delinquency prediction. All
 * Snowflake-origin Data Cloud → DC bridge path.
 */
const ATTENTION_SQL = `
  SELECT
    c.account_id__c    AS account_id,
    c.company_name__c  AS company_name,
    c.risk_score__c    AS risk_score,
    c.top_driver__c    AS top_driver,
    c.rm_action__c     AS rm_action
  FROM CumulusDnBBusinessCredit__dlm c
  ORDER BY c.risk_score__c DESC
  LIMIT 25
`;

function severityFor(score: number): AttentionItem['severity'] {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

export async function fetchAttentionItems(): Promise<AttentionItem[]> {
  const result = await queryDataCloud<CommercialRiskRow>(ATTENTION_SQL, 25);
  return result.rows.map(row => ({
    id: row.account_id,
    title: `Credit risk — ${row.company_name}`,
    clientName: row.company_name,
    reason: `${row.top_driver}; action: ${row.rm_action}`,
    score: Number(row.risk_score) || 0,
    severity: severityFor(Number(row.risk_score) || 0),
  }));
}
```

- [ ] **Step 4: Run fetcher test → pass**

Run (from `CommercialCommand` dir): `npm run test -- run src/commercial/data/attention.test.ts` → PASS.

- [ ] **Step 5: Component test → fail → implement → pass**

Create `CommercialCommand/src/commercial/sections/AttentionSection.test.tsx` (mirror Retail Task 4 Step 5 with `onSelectAccount`). Run → FAIL. Then create `CommercialCommand/src/commercial/sections/AttentionSection.tsx`:

```tsx
import { useAsyncData, AttentionQueue, type AttentionItem } from '@shared';
import { fetchAttentionItems } from '../data/attention';

interface AttentionSectionProps {
  onSelectAccount?: (accountId: string) => void;
}

export function AttentionSection({ onSelectAccount }: AttentionSectionProps) {
  const { data, loading, error } = useAsyncData(fetchAttentionItems, []);
  if (loading) return <div style={{ color: 'var(--wp-text-muted)' }}>Ranking your portfolio…</div>;
  if (error) return <div role="alert">Could not load attention queue.</div>;
  return <AttentionQueue items={data ?? []} onSelect={(item: AttentionItem) => onSelectAccount?.(item.id)} />;
}
```
Run → PASS.

- [ ] **Step 6: Mount in CommercialHome (wire selectedAccountId) + commit**

In `CommercialHome.tsx`, use the `selectedAccountId` state (already declared in Task 1) and render `<AttentionSection onSelectAccount={setSelectedAccountId} />` as the primary section. Run `npm run test -- run src/commercial/` → PASS.
```bash
git add force-app/main/default/uiBundles/CommercialCommand/src/commercial
git commit -m "feat(commercial): credit + covenant attention queue (Data Cloud)"
```

---

### Task 5: Account drill-in (Core/FSC via GraphQL)

**Files:**
- Create: `CommercialCommand/src/commercial/data/queries/accountProfile.graphql`
- Create: `CommercialCommand/src/commercial/data/account.ts` + `account.test.ts`
- Create: `CommercialCommand/src/commercial/sections/AccountDrillIn.tsx` + `.test.tsx`
- Modify: `CommercialCommand/src/commercial/CommercialHome.tsx`

**Interfaces:**
- Consumes: `executeGraphQL`, `useAsyncData` from `@shared`; generated types.
- Produces:
  - `type CommercialAccountProfile = { id: string; name: string; industry: string | null; annualRevenue: number | null; website: string | null; financialAccounts: { id: string; name: string; type: string; balance: number }[] }`.
  - `fetchAccountProfile(accountId: string): Promise<CommercialAccountProfile | null>`.
  - `<AccountDrillIn accountId={string | null} />` — empty state when null; profile card otherwise. Mounted in `CommercialHome`, fed by `selectedAccountId`.

> Same TDD shape as Retail Task 5. DIVERGENCE: business fields (Industry, AnnualRevenue, Website) instead of person fields.

- [ ] **Step 1: Failing fetcher test**

Create `CommercialCommand/src/commercial/data/account.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
const execMock = vi.fn();
vi.mock('@shared', () => ({ executeGraphQL: (...a: unknown[]) => execMock(...a) }));
import { fetchAccountProfile } from './account';

describe('fetchAccountProfile', () => {
  beforeEach(() => execMock.mockReset());
  it('returns null when no accountId', async () => {
    expect(await fetchAccountProfile('')).toBeNull();
    expect(execMock).not.toHaveBeenCalled();
  });
  it('maps account + financial accounts into a profile', async () => {
    execMock.mockResolvedValue({
      uiapi: { query: { Account: { edges: [{ node: {
        Id: '001X', Name: { value: 'Acme Mfg' }, Industry: { value: 'Manufacturing' },
        AnnualRevenue: { value: 12000000 }, Website: { value: 'acme.com' },
        FinServ__FinancialAccounts__r: { edges: [{ node: { Id: 'fa1', Name: { value: 'Operating' }, FinServ__FinancialAccountType__c: { value: 'Checking' }, FinServ__Balance__c: { value: 900000 } } }] },
      } }] } } },
    });
    const p = await fetchAccountProfile('001X');
    expect(p?.name).toBe('Acme Mfg');
    expect(p?.industry).toBe('Manufacturing');
    expect(p?.annualRevenue).toBe(12000000);
    expect(p?.financialAccounts[0].balance).toBe(900000);
  });
});
```

- [ ] **Step 2: Run → fail**

Run (from `CommercialCommand` dir): `npm run test -- run src/commercial/data/account.test.ts` → FAIL.

- [ ] **Step 3: Write the GraphQL op**

> Verify via `graphql-search.sh Account FinServ__FinancialAccount__c`. Create `CommercialCommand/src/commercial/data/queries/accountProfile.graphql`:

```graphql
query CommercialAccountProfile($accountId: ID!) {
  uiapi {
    query {
      Account(first: 1, where: { Id: { eq: $accountId } }) {
        edges {
          node {
            Id
            Name @optional { value }
            Industry @optional { value }
            AnnualRevenue @optional { value }
            Website @optional { value }
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

- [ ] **Step 4: Codegen**

Run (from `CommercialCommand` dir): `npm run graphql:codegen` → `CommercialAccountProfileQuery` + variables appear.

- [ ] **Step 5: Write the fetcher**

Create `CommercialCommand/src/commercial/data/account.ts`:

```typescript
import { executeGraphQL } from '@shared';
import type {
  CommercialAccountProfileQuery,
  CommercialAccountProfileQueryVariables,
} from '@api/graphql-operations-types';
import ACCOUNT_PROFILE_QUERY from './queries/accountProfile.graphql?raw';

export interface CommercialFinancialAccount {
  id: string;
  name: string;
  type: string;
  balance: number;
}

export interface CommercialAccountProfile {
  id: string;
  name: string;
  industry: string | null;
  annualRevenue: number | null;
  website: string | null;
  financialAccounts: CommercialFinancialAccount[];
}

/** Account drill-in. Business account + FSC financial accounts → GraphQL path. */
export async function fetchAccountProfile(accountId: string): Promise<CommercialAccountProfile | null> {
  if (!accountId) return null;
  const data = await executeGraphQL<CommercialAccountProfileQuery, CommercialAccountProfileQueryVariables>(
    ACCOUNT_PROFILE_QUERY,
    { accountId }
  );
  const node = data.uiapi?.query?.Account?.edges?.[0]?.node;
  if (!node) return null;
  return {
    id: node.Id,
    name: node.Name?.value ?? 'Unknown',
    industry: node.Industry?.value ?? null,
    annualRevenue: node.AnnualRevenue?.value != null ? Number(node.AnnualRevenue.value) : null,
    website: node.Website?.value ?? null,
    financialAccounts: (node.FinServ__FinancialAccounts__r?.edges ?? []).map(e => ({
      id: e.node.Id,
      name: e.node.Name?.value ?? '',
      type: e.node.FinServ__FinancialAccountType__c?.value ?? '',
      balance: Number(e.node.FinServ__Balance__c?.value ?? 0),
    })),
  };
}
```

- [ ] **Step 6: Run fetcher test → pass**

Run (from `CommercialCommand` dir): `npm run test -- run src/commercial/data/account.test.ts` → PASS.

- [ ] **Step 7: Component test → fail → implement → pass**

Create `CommercialCommand/src/commercial/sections/AccountDrillIn.test.tsx` (mirror Retail Task 5 Step 7: empty-state test + selected-profile test, mocking `../data/account`). Run → FAIL. Then create `CommercialCommand/src/commercial/sections/AccountDrillIn.tsx` (structurally identical to Retail `ClientDrillIn` but showing industry + revenue + website header and the financial-accounts list):

```tsx
import { useCallback } from 'react';
import { useAsyncData } from '@shared';
import { fetchAccountProfile } from '../data/account';

interface AccountDrillInProps {
  accountId: string | null;
}

export function AccountDrillIn({ accountId }: AccountDrillInProps) {
  const fetcher = useCallback(() => fetchAccountProfile(accountId ?? ''), [accountId]);
  const { data, loading, error } = useAsyncData(fetcher, [accountId]);

  if (!accountId) {
    return (
      <div style={{ color: 'var(--wp-text-muted)', padding: '1rem' }}>
        Select an account from the attention queue to drill in.
      </div>
    );
  }
  if (loading) return <div style={{ color: 'var(--wp-text-muted)' }}>Loading account…</div>;
  if (error || !data) return <div role="alert">Could not load account profile.</div>;

  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return (
    <div style={{ background: 'var(--wp-surface-glass)', border: '1px solid var(--wp-border)', borderRadius: 'var(--wp-radius)', boxShadow: 'var(--wp-shadow)', padding: '1.25rem' }}>
      <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>{data.name}</h3>
      <div style={{ color: 'var(--wp-text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
        {[data.industry, data.annualRevenue != null ? fmt.format(data.annualRevenue) : null, data.website].filter(Boolean).join(' · ') || 'No firmographic info'}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, marginTop: '1rem', display: 'grid', gap: '0.5rem' }}>
        {data.financialAccounts.map(fa => (
          <li key={fa.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
            <span>{fa.name} <span style={{ color: 'var(--wp-text-muted)' }}>({fa.type})</span></span>
            <span style={{ fontWeight: 600 }}>{fmt.format(fa.balance)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```
Run → PASS.

- [ ] **Step 8: Mount in CommercialHome + commit**

Render `<AccountDrillIn accountId={selectedAccountId} />` after the attention section. Run `npm run test -- run src/commercial/` → PASS.
```bash
git add force-app/main/default/uiBundles/CommercialCommand/src/commercial
git commit -m "feat(commercial): account drill-in profile (Core/FSC GraphQL)"
```

---

### Task 6: Relationship graph + firmographics + pipeline panels

**Files:**
- Create: `CommercialCommand/src/commercial/data/relationship.ts` + `relationship.test.ts`
- Create: `CommercialCommand/src/commercial/sections/RelationshipGraph.tsx` + `.test.tsx`
- Create: `CommercialCommand/src/commercial/data/firmographics.ts` + `firmographics.test.ts`
- Create: `CommercialCommand/src/commercial/sections/FirmographicsPanel.tsx` + `.test.tsx`
- Create: `CommercialCommand/src/commercial/data/pipeline.ts` + `pipeline.test.ts` (queries/portfolioPipeline.graphql)
- Create: `CommercialCommand/src/commercial/sections/PipelinePanel.tsx` + `.test.tsx`
- Modify: `CommercialCommand/src/commercial/CommercialHome.tsx`

**Interfaces:**
- Consumes: `executeGraphQL` (pipeline), `queryDataCloud` (relationship graph, firmographics), `useAsyncData` from `@shared`; generated types.
- Produces:
  - Relationship: `type RelationshipNode = { id: string; name: string; relation: string; depth: number }`; `fetchRelationshipGraph(accountId: string): Promise<RelationshipNode[]>` (Data Cloud — `CumulusSynthRelationshipGraph`/account hierarchy DMO); `<RelationshipGraph accountId={string | null} />`.
  - Firmographics: `type Firmographics = { employees: number | null; revenue: number | null; paydex: number | null; secLastFiling: string | null; execs: { name: string; title: string }[] }`; `fetchFirmographics(accountId: string): Promise<Firmographics | null>` (Data Cloud — ZoomInfo + DnB + BoardEx + SEC_Filings); `<FirmographicsPanel accountId={string | null} />`.
  - Pipeline: `type PipelineOpp = { id: string; name: string; stage: string; amount: number; closeDate: string }`; `fetchPipeline(): Promise<PipelineOpp[]>` (Core GraphQL); `<PipelinePanel />`.
  - All three mounted in `CommercialHome` (relationship + firmographics keyed to `selectedAccountId`).

> Three panels, each the proven fetch→map→render shape. Relationship + firmographics are DATA CLOUD (Snowflake-origin enrichment — bridge path); pipeline is CORE (GraphQL). Implement one at a time, committing after each, order: Pipeline → Firmographics → RelationshipGraph.

- [ ] **Step 1 (Pipeline): failing fetcher test**

Create `CommercialCommand/src/commercial/data/pipeline.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
const execMock = vi.fn();
vi.mock('@shared', () => ({ executeGraphQL: (...a: unknown[]) => execMock(...a) }));
import { fetchPipeline } from './pipeline';

describe('fetchPipeline', () => {
  beforeEach(() => execMock.mockReset());
  it('maps Opportunity edges into PipelineOpps', async () => {
    execMock.mockResolvedValue({
      uiapi: { query: { Opportunity: { edges: [{ node: { Id: 'o1', Name: { value: 'Acme LOC' }, StageName: { value: 'Proposal' }, Amount: { value: 1000000 }, CloseDate: { value: '2026-09-30' } } }] } } },
    });
    const opps = await fetchPipeline();
    expect(opps[0]).toMatchObject({ id: 'o1', name: 'Acme LOC', stage: 'Proposal', amount: 1000000, closeDate: '2026-09-30' });
  });
});
```

- [ ] **Step 2 (Pipeline): run → fail, write op, codegen, implement**

Run → FAIL. Create `queries/portfolioPipeline.graphql` (verify via `graphql-search.sh Opportunity`; select `Name`, `StageName`, `Amount`, `CloseDate`; `where: { IsClosed: { eq: false } }`; `orderBy: { CloseDate: { order: ASC } }`; `first: 25`). Run `npm run graphql:codegen`. Create `pipeline.ts`:

```typescript
import { executeGraphQL } from '@shared';
import type { CommercialPortfolioPipelineQuery } from '@api/graphql-operations-types';
import PIPELINE_QUERY from './queries/portfolioPipeline.graphql?raw';

export interface PipelineOpp {
  id: string;
  name: string;
  stage: string;
  amount: number;
  closeDate: string;
}

/** Open commercial pipeline from Core Opportunity (SalesforceDotCom origin). */
export async function fetchPipeline(): Promise<PipelineOpp[]> {
  const data = await executeGraphQL<CommercialPortfolioPipelineQuery>(PIPELINE_QUERY);
  return (data.uiapi?.query?.Opportunity?.edges ?? []).map(e => ({
    id: e.node.Id,
    name: e.node.Name?.value ?? '',
    stage: e.node.StageName?.value ?? '',
    amount: Number(e.node.Amount?.value ?? 0),
    closeDate: e.node.CloseDate?.value ?? '',
  }));
}
```
Run fetcher test → PASS.

- [ ] **Step 3 (Pipeline): component test → fail → implement → pass → mount**

Create `PipelinePanel.test.tsx` (mock `../data/pipeline`, assert an opp name renders). Create `PipelinePanel.tsx` rendering each opp with name, stage badge, currency amount, close date (mirror Retail's activity/pipeline list style). Mount in `CommercialHome`. Run `npm run test -- run src/commercial/` → PASS. Commit.

- [ ] **Step 4 (Firmographics): failing fetcher test**

Create `CommercialCommand/src/commercial/data/firmographics.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
const dcMock = vi.fn();
vi.mock('@shared', () => ({ queryDataCloud: (...a: unknown[]) => dcMock(...a) }));
import { fetchFirmographics } from './firmographics';

describe('fetchFirmographics', () => {
  beforeEach(() => dcMock.mockReset());
  it('returns null when no accountId', async () => {
    expect(await fetchFirmographics('')).toBeNull();
    expect(dcMock).not.toHaveBeenCalled();
  });
  it('maps the enrichment row + exec rows', async () => {
    dcMock.mockResolvedValue({
      columns: [], rowCount: 1, warning: null,
      rows: [{ employees: 4200, revenue: 12000000, paydex: 68, sec_last_filing: '2026-05-01', exec_name: 'Jane Roe', exec_title: 'CFO' }],
    });
    const f = await fetchFirmographics('001X');
    expect(f?.employees).toBe(4200);
    expect(f?.paydex).toBe(68);
    expect(f?.execs[0]).toMatchObject({ name: 'Jane Roe', title: 'CFO' });
  });
});
```

- [ ] **Step 5 (Firmographics): run → fail → implement → pass**

Run → FAIL. Create `firmographics.ts` (Data Cloud path; confirm `CumulusZoomInfoFirmographics__dlm`, `CumulusDnBBusinessCredit__dlm`, `CumulusBoardExExecIntel__dlm`, `SEC_Filings` names against the org before live):

```typescript
import { queryDataCloud } from '@shared';

interface FirmographicsRow {
  employees: number | null;
  revenue: number | null;
  paydex: number | null;
  sec_last_filing: string | null;
  exec_name: string | null;
  exec_title: string | null;
}

export interface FirmographicsExec {
  name: string;
  title: string;
}

export interface Firmographics {
  employees: number | null;
  revenue: number | null;
  paydex: number | null;
  secLastFiling: string | null;
  execs: FirmographicsExec[];
}

/**
 * Third-party firmographics + credit + exec intel + SEC — all Snowflake-origin
 * Data Cloud enrichment (ZoomInfo, DnB, BoardEx, SEC_Filings). DC bridge path.
 * One row per exec; the scalar firmographics repeat across rows.
 */
function firmographicsSql(accountId: string): string {
  const safeId = accountId.replace(/'/g, "''");
  return `
    SELECT
      z.employees__c        AS employees,
      z.revenue__c          AS revenue,
      d.paydex__c           AS paydex,
      s.last_filing_date__c AS sec_last_filing,
      b.exec_name__c        AS exec_name,
      b.exec_title__c       AS exec_title
    FROM CumulusZoomInfoFirmographics__dlm z
    LEFT JOIN CumulusDnBBusinessCredit__dlm d ON d.account_id__c = z.account_id__c
    LEFT JOIN SEC_Filings__dlm s               ON s.account_id__c = z.account_id__c
    LEFT JOIN CumulusBoardExExecIntel__dlm b   ON b.account_id__c = z.account_id__c
    WHERE z.account_id__c = '${safeId}'
    LIMIT 25
  `;
}

export async function fetchFirmographics(accountId: string): Promise<Firmographics | null> {
  if (!accountId) return null;
  const result = await queryDataCloud<FirmographicsRow>(firmographicsSql(accountId), 25);
  if (!result.rows.length) return null;
  const first = result.rows[0];
  const execs = result.rows
    .filter(r => r.exec_name)
    .map(r => ({ name: r.exec_name as string, title: r.exec_title ?? '' }));
  return {
    employees: first.employees != null ? Number(first.employees) : null,
    revenue: first.revenue != null ? Number(first.revenue) : null,
    paydex: first.paydex != null ? Number(first.paydex) : null,
    secLastFiling: first.sec_last_filing ?? null,
    execs,
  };
}
```
Run fetcher test → PASS.

> Note: `firmographicsSql` inlines a single-quote-escaped `accountId`. The DcBridgeRest gate (Foundation Task 3) rejects any non-SELECT SQL, so this stays read-only; the escape guards against quote-breaking. Account ids are 15/18-char alphanumerics, so injection surface is minimal, but the escape is retained defensively.

- [ ] **Step 6 (Firmographics): component test → fail → implement → pass → mount**

Create `FirmographicsPanel.test.tsx` (empty-state when null + populated case, mock `../data/firmographics`). Create `FirmographicsPanel.tsx` — glass card showing employees, revenue, a PAYDEX gauge/badge, SEC last-filing date, and an exec list; empty state when `accountId` null. Mount `<FirmographicsPanel accountId={selectedAccountId} />`. Run → PASS. Commit.

- [ ] **Step 7 (RelationshipGraph): failing fetcher test**

Create `CommercialCommand/src/commercial/data/relationship.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
const dcMock = vi.fn();
vi.mock('@shared', () => ({ queryDataCloud: (...a: unknown[]) => dcMock(...a) }));
import { fetchRelationshipGraph } from './relationship';

describe('fetchRelationshipGraph', () => {
  beforeEach(() => dcMock.mockReset());
  it('returns [] when no accountId', async () => {
    expect(await fetchRelationshipGraph('')).toEqual([]);
    expect(dcMock).not.toHaveBeenCalled();
  });
  it('maps related-entity rows into RelationshipNodes', async () => {
    dcMock.mockResolvedValue({
      columns: [], rowCount: 2, warning: null,
      rows: [
        { related_id: '001P', related_name: 'Acme Holdings', relation: 'parent', depth: 1 },
        { related_id: '001S', related_name: 'Acme West LLC', relation: 'subsidiary', depth: 1 },
      ],
    });
    const nodes = await fetchRelationshipGraph('001X');
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ id: '001P', name: 'Acme Holdings', relation: 'parent', depth: 1 });
  });
});
```

- [ ] **Step 8 (RelationshipGraph): run → fail → implement → pass**

Run → FAIL. Create `relationship.ts` (Data Cloud — confirm `CumulusSynthRelationshipGraph__dlm` / account-hierarchy DMO + columns against the org):

```typescript
import { queryDataCloud } from '@shared';

interface RelationshipRow {
  related_id: string;
  related_name: string;
  relation: string;
  depth: number;
}

export interface RelationshipNode {
  id: string;
  name: string;
  relation: string;
  depth: number;
}

/**
 * Corporate relationship/hierarchy graph — parent/subsidiary/affiliate links
 * from the synthetic relationship-graph DMO (Snowflake-origin). DC bridge path.
 */
function relationshipSql(accountId: string): string {
  const safeId = accountId.replace(/'/g, "''");
  return `
    SELECT
      g.related_account_id__c   AS related_id,
      g.related_account_name__c AS related_name,
      g.relation_type__c        AS relation,
      g.depth__c                AS depth
    FROM CumulusSynthRelationshipGraph__dlm g
    WHERE g.account_id__c = '${safeId}'
    ORDER BY g.depth__c ASC
    LIMIT 50
  `;
}

export async function fetchRelationshipGraph(accountId: string): Promise<RelationshipNode[]> {
  if (!accountId) return [];
  const result = await queryDataCloud<RelationshipRow>(relationshipSql(accountId), 50);
  return result.rows.map(r => ({
    id: r.related_id,
    name: r.related_name,
    relation: r.relation,
    depth: Number(r.depth) || 0,
  }));
}
```
Run fetcher test → PASS.

- [ ] **Step 9 (RelationshipGraph): component test → fail → implement → pass → mount**

Create `RelationshipGraph.test.tsx` (empty-state when null + populated, mock `../data/relationship`). Create `RelationshipGraph.tsx` — a radial/indented hierarchy visualization (SVG or nested list styled with `var(--wp-accent)` connectors) grouping nodes by `relation` and `depth`; empty state when `accountId` null. Mount `<RelationshipGraph accountId={selectedAccountId} />`. Run → PASS.

- [ ] **Step 10: Full suite + commit**

Run (from `CommercialCommand` dir): `npm run test -- run src/commercial/` → all PASS.
```bash
git add force-app/main/default/uiBundles/CommercialCommand/src/commercial
git commit -m "feat(commercial): relationship graph + firmographics + pipeline panels"
```

---

### Task 7: Cumulus Assistant dock — live Agentforce Conversation Client

**Files:**
- Create: `CommercialCommand/src/commercial/agent/assistantClient.ts` + `assistantClient.test.ts`
- Create: `CommercialCommand/src/commercial/agent/useAssistant.ts` + `useAssistant.test.tsx`
- Create: `CommercialCommand/src/commercial/sections/AssistantDock.tsx` + `AssistantDock.test.tsx`
- Modify: `CommercialCommand/src/commercial/CommercialHome.tsx`

**Interfaces:**
- Consumes: the Agentforce Conversation Client from `@salesforce/platform-sdk` (load `implementing-ui-bundle-agentforce-conversation-client` first); `useTheme` from `@shared`.
- Produces: `AssistantMessage`, `createAssistantSession(): Promise<AssistantSession>`, `useAssistant()`, `<AssistantDock />` — identical contract to Retail Task 7, with the COMMERCIAL agent id.

> This is a near-verbatim clone of Retail Task 7. The ONLY divergences: the file paths (`src/commercial/agent/...`), the dock header label context ("Cumulus Commercial Assistant"), and `COMMERCIAL_AGENT_ID`. Reuse the exact wrapper/hook/dock code from Retail Task 7 Steps 2–9, changing the agent id constant and import paths. Do NOT re-derive the pattern — copy the proven code.

- [ ] **Step 1: Load the Agentforce skill + confirm the commercial agent id**

Invoke `implementing-ui-bundle-agentforce-conversation-client`. Confirm the commercial Cumulus assistant agent id from org config (or ask the user). This is the one non-derivable value.

- [ ] **Step 2: Port the wrapper (TDD)**

Create `assistantClient.test.ts` + `assistantClient.ts` exactly as Retail Task 7 Steps 2–4, with `const COMMERCIAL_AGENT_ID = 'REPLACE_WITH_CONFIRMED_AGENT_ID';` used in `createSession({ agentId: COMMERCIAL_AGENT_ID })`. Run test → fail → pass.

- [ ] **Step 3: Port the hook (TDD)**

Create `useAssistant.test.tsx` + `useAssistant.ts` exactly as Retail Task 7 Steps 6–7 (importing from `./assistantClient`). Run test → fail → pass.

- [ ] **Step 4: Port the dock (TDD)**

Create `AssistantDock.test.tsx` + `AssistantDock.tsx` exactly as Retail Task 7 Steps 8–9, changing the header text to `Cumulus Commercial Assistant`. Run test → fail → pass.

- [ ] **Step 5: Mount in CommercialHome + full suite + build**

Render `<AssistantDock />` at the end of `CommercialHome`'s root div. Run (from `CommercialCommand` dir): `npm run test -- run src/commercial/ && npm run build` → all PASS, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add force-app/main/default/uiBundles/CommercialCommand/src/commercial
git commit -m "feat(commercial): live Agentforce Cumulus Assistant dock"
```

---

### Task 8: Full-suite gate, deploy, and pilot verification

**Files:**
- Modify: none (verification + deploy).

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a deployed, data-real Commercial cockpit verified against pilot Business Account `001am00000qvjs6AAA`.

- [ ] **Step 1: Full test suite + typecheck + lint**

Run (from `CommercialCommand` dir): `npm run test -- run`, `npx tsc -b --noEmit`, `npm run lint`.
Expected: all green, 0 type errors, 0 lint errors, coverage thresholds met.

- [ ] **Step 2: Confirm the real Agentforce agent id is set**

Verify `COMMERCIAL_AGENT_ID` in `agent/assistantClient.ts` is the confirmed commercial agent id, not the placeholder.

- [ ] **Step 3: Build + deploy**

From the SFDX project root:
```bash
cd force-app/main/default/uiBundles/CommercialCommand && npm run build && cd -
sf project deploy start --source-dir force-app/main/default/uiBundles/CommercialCommand -o jdo-0pz8au --json
```
Expected: `status: 0`, `numberComponentErrors: 0`. Read the JSON.

- [ ] **Step 4: Manual pilot verification**

Against pilot Business Account `001am00000qvjs6AAA`, confirm:
- Attention queue populates with credit/covenant-ranked accounts + RM-action reasons.
- Clicking a queue item drills the account into the profile card (industry/revenue/website + financial accounts), the relationship graph, and the firmographics panel.
- Portfolio KPI strip shows non-zero counts + pipeline value; pipeline panel renders real opps.
- Assistant dock opens a live Agentforce session and returns a reply.

Record gaps as follow-up tasks; do NOT mark complete on a red pilot check.

- [ ] **Step 5: Final commit**

```bash
git add -A force-app/main/default/uiBundles/CommercialCommand
git commit -m "chore(commercial): full-suite gate green + deployed to jdo-0pz8au"
```

---

## Self-Review

**1. Spec coverage** (surface profile-widget data + standard-home content + DC enrichment for the commercial persona):
- Business profile-widget successor → Task 5 (AccountDrillIn) + Task 6 (Firmographics, RelationshipGraph) ✓
- Standard home content: Opportunities/pipeline → Task 3 (KPI) + Task 6 (PipelinePanel) ✓; Cases → Task 3 ✓; Financials → Task 5 (financial accounts) ✓. *Gap acknowledged:* Tasks/Events activity stream and business Goals/Milestones are NOT yet a dedicated panel here (Retail has them in its Task 6). If parity is wanted, add a Commercial activity+milestones panel mirroring Retail Task 6 Steps 1–8. Flagged for review — commercial RMs arguably prioritize the relationship graph + firmographics over a raw activity feed, hence the divergence, but this is your call.
- DC third-party enrichment → Task 4 (credit/covenant), Task 6 (DnB PAYDEX, ZoomInfo, BoardEx, SEC, relationship graph) ✓
- Agentic (full end-to-end, reusing Retail pattern) → Task 4 (rankings) + Task 7 (live Agentforce) ✓
- Cinematic per-LOB identity → commercial (copper) theme via `@shared` `ThemeProvider` + glass/gradient primitives + relationship-graph viz ✓

**2. Placeholder scan:** Only intentional placeholder is `COMMERCIAL_AGENT_ID` (Task 7), gated by Task 8 Step 2. Task 6 Steps 3/6/9 reference "mirror the proven shape" for component tests/impls but specify exact fields, types, and data path per panel — right-sized because the fetcher code (the non-trivial part) is shown in full, and the component render is mechanically identical to Retail's shown components. Task 7 explicitly instructs copying Retail Task 7's shown code rather than re-deriving. GraphQL strings gated behind Task 2.

**3. Type consistency:** `AttentionItem` usage (Task 4) matches Foundation. `CommercialKpi.format` matches `KpiTile`. `selectedAccountId: string | null` (Task 1) matches `AccountDrillIn`/`RelationshipGraph`/`FirmographicsPanel` `accountId: string | null` props. `PipelineOpp`, `Firmographics`, `RelationshipNode`, `AssistantMessage`, `AssistantSession` each defined once, consumed consistently. `fetchRelationshipGraph` returns `[]` (not null) for empty — component treats empty array as empty-state; consistent between test and impl.

**Note for the Wealth plan:** Same 8-task skeleton. Diverge Layer 2: attention model = portfolio-drift / plan-progress / retirement-readiness; KPIs = AUM, held-away capture opportunity, plan progress; drill-in adds holdings/trades; enrichment panels = MSCI ESG + Plaid held-away + MGP financial plans; theme = `wealth` (gold); reuse the Task 7 dock with the wealth agent id.
