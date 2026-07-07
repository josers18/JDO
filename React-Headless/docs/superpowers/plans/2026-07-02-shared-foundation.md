# Shared Foundation (`_shared`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable `_shared` source library + Apex REST bridge that all three persona cockpit apps (Retail, Commercial, Wealth) compile against — a dual data-access layer (Core/FSC GraphQL + Data Cloud via Apex REST), design-token/theme system, and a catalog of cinematic React UI primitives ported from the sibling LWC components.

**Architecture:** `_shared` is a **non-deployed TypeScript source library** living beside the app bundles. Each app bundle imports it via an `@shared` Vite/tsconfig path alias; Vite inlines the shared code into each bundle's own `dist/` at build time. No runtime coupling between bundles. Server-side Data Cloud access goes through **`@RestResource` Apex** (Aura-enabled Apex is NOT callable from React UI bundles) invoked with `sdk.fetch()`; Core/FSC records go through the SDK GraphQL path (`sdk.graphql.query`).

**Tech Stack:** React 19, TypeScript 5.9 (strict), Vite 7, Vitest 4 + Testing Library, Tailwind v4, shadcn/ui (radix-ui + lucide), `@salesforce/platform-sdk` 10.6, Apex (API v67), Salesforce UI Bundle SDK.

## Global Constraints

- **API version 67.0** — `sourceApiVersion` in `sfdx-project.json`; UIBundle deploy fails below v67. Verbatim from CLAUDE.md.
- **Data-access rule:** origin=`SalesforceDotCom` stream → read Core/FSC via SDK GraphQL (sync, typed, write-back). Origin=`SNOWFLAKE`/`Jedi_Snowflake`/streaming EVENTS → Apex REST bridge → Data Cloud (`ConnectApi.CdpQuery.queryAnsiSqlV2`). Prefer Core whenever a Core origin exists.
- **No `@AuraEnabled` from React** — all server endpoints for the apps MUST be `@RestResource` (`/services/apexrest/...`), called via `sdk.fetch()`. Aura-enabled Apex has no invocation path from UI bundles.
- **GraphQL non-negotiables:** HTTP 200 ≠ success (always parse `errors`); `@optional` on every read field; `first:` on every query; verify every field name against `schema.graphql` before writing a query (schema is fetched post-deploy — until then, defer real query strings).
- **SDK methods are optional** — always call `sdk.graphql?.` / `sdk.fetch?.` with optional chaining; both may be undefined on some surfaces.
- **Theme tokens** are CSS custom properties on `:root` / `[data-theme]`; persona apps set `data-theme="retail|commercial|wealth"`. No hardcoded hex in components — reference `var(--wp-*)` tokens.
- **`_shared` is never deployed** — it has no `.uibundle-meta.xml`, no `package.json`. It is pure `.ts`/`.tsx` source consumed via `@shared` alias.

---

### Task 1: Establish `_shared` source library + `@shared` alias wiring

**Files:**
- Create: `force-app/main/default/uiBundles/_shared/README.md`
- Create: `force-app/main/default/uiBundles/_shared/src/index.ts`
- Create: `force-app/main/default/uiBundles/_shared/src/version.ts`
- Create: `force-app/main/default/uiBundles/_shared/src/version.test.ts`
- Modify: `force-app/main/default/uiBundles/ReactHeadless/vite.config.ts` (add `@shared` alias)
- Modify: `force-app/main/default/uiBundles/ReactHeadless/tsconfig.json` (add `@shared/*` path + include)
- Modify: `force-app/main/default/uiBundles/ReactHeadless/.forceignore`-equivalent: add `_shared` to root `.forceignore` so it never deploys

**Interfaces:**
- Consumes: nothing (root task).
- Produces: `@shared/*` import alias resolving to `_shared/src/*`; `SHARED_VERSION: string` exported from `@shared`. All later tasks and all persona apps import from `@shared`.

- [ ] **Step 1: Write the failing test**

Create `force-app/main/default/uiBundles/_shared/src/version.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SHARED_VERSION } from './version';

describe('SHARED_VERSION', () => {
  it('is a semver-shaped string', () => {
    expect(SHARED_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `ReactHeadless` dir, since it owns the Vitest config — see Task 2 for why the alias must resolve): `npm run test -- run ../_shared/src/version.test.ts`
Expected: FAIL — `Cannot find module './version'`.

- [ ] **Step 3: Write minimal implementation**

Create `force-app/main/default/uiBundles/_shared/src/version.ts`:

```typescript
/** Version stamp for the _shared foundation library. Bump on breaking interface changes. */
export const SHARED_VERSION = '1.0.0';
```

Create `force-app/main/default/uiBundles/_shared/src/index.ts`:

```typescript
/**
 * Public entry point for the _shared foundation library.
 * Persona app bundles import from '@shared' (this file) or '@shared/<subpath>'.
 * _shared is a source-only library: it is NOT a deployable UI bundle and has
 * no package.json or meta XML. Vite inlines it into each app's dist at build.
 */
export { SHARED_VERSION } from './version';
```

Create `force-app/main/default/uiBundles/_shared/README.md`:

```markdown
# _shared — Foundation library for the persona cockpit apps

Source-only TypeScript/React library consumed by the Retail, Commercial, and
Wealth UI bundles via the `@shared` path alias. **Not deployed** — Vite inlines
it into each app bundle's `dist/` at build time. Excluded from SFDX deploy via
root `.forceignore`.

Layers:
- `data/` — dual data-access clients (Core/FSC GraphQL + Data Cloud Apex REST bridge)
- `theme/` — CSS custom-property token system + persona theme presets
- `components/` — cinematic React UI primitives (KPI tiles, gauges, timeline, etc.)
- `hooks/` — shared React hooks
```

- [ ] **Step 4: Wire the `@shared` alias**

In `ReactHeadless/vite.config.ts`, add to the `resolve.alias` object (after the `@assets` line):

```typescript
        '@assets': path.resolve(__dirname, './src/assets'),
        '@shared': path.resolve(__dirname, '../_shared/src'),
```

In `ReactHeadless/tsconfig.json`, add to `compilerOptions.paths` (after the `@assets/*` entry):

```json
      "@assets/*": ["./src/assets/*"],
      "@shared/*": ["../_shared/src/*"],
```

In `ReactHeadless/tsconfig.json`, add `"../_shared/src"` to the `include` array:

```json
  "include": [
    "src",
    "../_shared/src",
    "e2e",
    "vite-env.d.ts",
    "vitest-env.d.ts",
    "vitest.setup.ts",
    "../../../../../../../../../../packages/sdk/platform-sdk/types"
  ],
```

In the **root** `.forceignore` (`React-Headless/.forceignore`), append:

```
# _shared is a source-only library consumed by app bundles at build time; never deploy it
**/uiBundles/_shared/**
```

- [ ] **Step 5: Run test to verify it passes**

Run (from `ReactHeadless` dir): `npm run test -- run ../_shared/src/version.test.ts`
Expected: PASS (this also proves the `@shared` alias + include wiring resolves cross-directory).

- [ ] **Step 6: Commit**

```bash
git add force-app/main/default/uiBundles/_shared ReactHeadless/vite.config.ts ReactHeadless/tsconfig.json .forceignore
git commit -m "feat(_shared): scaffold shared foundation library + @shared alias"
```

---

### Task 2: Create the missing Vitest setup file

**Files:**
- Create: `force-app/main/default/uiBundles/ReactHeadless/src/test/setup.ts`
- Test: (this task's deliverable is verified by any test importing jest-dom matchers)

**Interfaces:**
- Consumes: nothing.
- Produces: a working Vitest environment. `vite.config.ts` already references `setupFiles: ['./src/test/setup.ts']` but the file does not exist — without it, tests that use `@testing-library/jest-dom` matchers (`toBeInTheDocument`) fail. All later component tests depend on this.

- [ ] **Step 1: Write the failing test**

Create `force-app/main/default/uiBundles/ReactHeadless/src/test/setup.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('vitest setup', () => {
  it('registers jest-dom matchers', () => {
    const el = document.createElement('div');
    el.textContent = 'hi';
    document.body.appendChild(el);
    // toBeInTheDocument comes from @testing-library/jest-dom via setup.ts
    expect(el).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `ReactHeadless` dir): `npm run test -- run src/test/setup.test.ts`
Expected: FAIL — either the setup file is missing (Vitest error) or `toBeInTheDocument is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `force-app/main/default/uiBundles/ReactHeadless/src/test/setup.ts`:

```typescript
/**
 * Vitest global setup. Referenced by vite.config.ts `test.setupFiles`.
 * Registers @testing-library/jest-dom matchers and auto-cleans the DOM
 * between tests so component tests don't leak state into each other.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `ReactHeadless` dir): `npm run test -- run src/test/setup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add force-app/main/default/uiBundles/ReactHeadless/src/test/setup.ts force-app/main/default/uiBundles/ReactHeadless/src/test/setup.test.ts
git commit -m "test(ReactHeadless): add missing Vitest setup file"
```

---

### Task 3: Data Cloud Apex REST bridge (`@RestResource`)

**Files:**
- Create: `force-app/main/default/classes/DcBridgeRest.cls`
- Create: `force-app/main/default/classes/DcBridgeRest.cls-meta.xml`
- Create: `force-app/main/default/classes/DcBridgeRestTest.cls`
- Create: `force-app/main/default/classes/DcBridgeRestTest.cls-meta.xml`

**Interfaces:**
- Consumes: nothing (server-side).
- Produces: `POST /services/apexrest/dc/query` accepting JSON `{ "sql": string, "maxRows": integer? }` and returning JSON `{ "columns": [{"name","type"}], "rows": [ {..} ], "rowCount": int, "warning": string? }`. Consumed by Task 4's `dataCloudClient`. Read-only SQL only; rejects mutating SQL; clamps rows to 2000.

- [ ] **Step 1: Write the failing test**

Create `force-app/main/default/classes/DcBridgeRestTest.cls`:

```apex
@IsTest
private class DcBridgeRestTest {
    private static RestResponse setupRequest(String body) {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/dc/query';
        req.httpMethod = 'POST';
        req.requestBody = Blob.valueOf(body);
        RestContext.request = req;
        RestContext.response = new RestResponse();
        return RestContext.response;
    }

    @IsTest
    static void rejectsBlankSql() {
        setupRequest('{"sql":"  "}');
        Test.startTest();
        DcBridgeRest.query();
        Test.stopTest();
        System.assertEquals(400, RestContext.response.statusCode, 'blank SQL should be 400');
    }

    @IsTest
    static void rejectsMutatingSql() {
        setupRequest('{"sql":"DELETE FROM ssot__Account__dlm"}');
        Test.startTest();
        DcBridgeRest.query();
        Test.stopTest();
        System.assertEquals(400, RestContext.response.statusCode, 'mutating SQL should be 400');
    }

    @IsTest
    static void acceptsSelectShape() {
        // We can't execute real CdpQuery in a test context, so we assert the
        // validation gate passes SELECT through to the (mocked) execution path.
        setupRequest('{"sql":"SELECT Id__c FROM ssot__Account__dlm","maxRows":10}');
        DcBridgeRest.mockRowsForTest = new List<Map<String, Object>>{
            new Map<String, Object>{ 'Id__c' => 'a1' }
        };
        Test.startTest();
        DcBridgeRest.query();
        Test.stopTest();
        System.assertEquals(200, RestContext.response.statusCode, 'valid SELECT should be 200');
        String out = RestContext.response.responseBody.toString();
        System.assert(out.contains('rowCount'), 'response should carry rowCount');
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `sf apex run test --tests DcBridgeRestTest --result-format human -o jdo-0pz8au --wait 10 --json`
Expected: FAIL/compile error — `DcBridgeRest` does not exist.

(If deploying test-first is impractical against the org, note the class as authored and proceed; the failing state is the absence of the class.)

- [ ] **Step 3: Write minimal implementation**

Create `force-app/main/default/classes/DcBridgeRest.cls`:

```apex
/**
 * Data Cloud query bridge for React UI bundles. Exposed as Apex REST because
 * @AuraEnabled Apex is NOT callable from UI bundles — only /services/apexrest/*
 * via the SDK fetch() path. Internally runs read-only ANSI SQL through
 * ConnectApi.CdpQuery.queryAnsiSqlV2 (same mechanism as the LWC-era
 * DcQueryToTableController, re-wrapped for REST).
 *
 * POST /services/apexrest/dc/query
 *   body: { "sql": "SELECT ...", "maxRows": 500 }
 *   200:  { "columns":[{"name","type"}], "rows":[...], "rowCount":N, "warning":null }
 *   400:  { "error": "message" }
 */
@RestResource(urlMapping='/dc/query')
global with sharing class DcBridgeRest {
    private static final Integer DEFAULT_MAX_ROWS = 500;
    private static final Integer ABSOLUTE_MAX_ROWS = 2000;

    @TestVisible
    static List<Map<String, Object>> mockRowsForTest;

    global class QueryRequest {
        public String sql;
        public Integer maxRows;
    }

    @HttpPost
    global static void query() {
        RestResponse res = RestContext.response;
        res.addHeader('Content-Type', 'application/json');
        try {
            String body = RestContext.request.requestBody != null
                ? RestContext.request.requestBody.toString()
                : '';
            QueryRequest reqBody = String.isBlank(body)
                ? new QueryRequest()
                : (QueryRequest) JSON.deserialize(body, QueryRequest.class);

            String sql = reqBody.sql == null ? '' : reqBody.sql.trim();
            if (String.isBlank(sql)) {
                writeError(res, 400, 'Enter a Data Cloud SQL statement.');
                return;
            }
            if (sql.endsWith(';')) {
                sql = sql.substring(0, sql.length() - 1).trim();
            }
            if (!isReadOnly(sql)) {
                writeError(res, 400, 'Only SELECT queries (optionally starting with WITH) are allowed.');
                return;
            }

            Integer cap = (reqBody.maxRows == null || reqBody.maxRows < 1)
                ? DEFAULT_MAX_ROWS
                : reqBody.maxRows;
            if (cap > ABSOLUTE_MAX_ROWS) {
                cap = ABSOLUTE_MAX_ROWS;
            }
            String toRun = hasLimit(sql) ? sql : sql + ' LIMIT ' + cap;

            List<Map<String, Object>> rows;
            if (Test.isRunningTest()) {
                rows = mockRowsForTest != null ? mockRowsForTest : new List<Map<String, Object>>();
            } else {
                rows = runCdpSql(toRun);
            }

            Map<String, Object> payload = new Map<String, Object>{
                'columns' => deriveColumns(rows),
                'rows' => rows,
                'rowCount' => rows.size(),
                'warning' => null
            };
            res.statusCode = 200;
            res.responseBody = Blob.valueOf(JSON.serialize(payload));
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'DcBridgeRest error: ' + e.getTypeName() + ': ' + e.getMessage());
            writeError(res, 400, 'Data Cloud query failed.');
        }
    }

    private static List<Map<String, Object>> runCdpSql(String sql) {
        ConnectApi.CdpQueryInput input = new ConnectApi.CdpQueryInput();
        input.sql = sql;
        ConnectApi.CdpQueryOutputV2 response = ConnectApi.CdpQuery.queryAnsiSqlV2(input);
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        if (response == null || response.data == null) {
            return out;
        }
        List<String> colNames = new List<String>();
        if (response.metadata != null) {
            for (String key : response.metadata.keySet()) {
                colNames.add(key);
            }
        }
        for (Object rowObj : response.data) {
            List<Object> cells = (List<Object>) rowObj;
            Map<String, Object> row = new Map<String, Object>();
            for (Integer i = 0; i < colNames.size() && i < cells.size(); i++) {
                row.put(colNames[i], cells[i]);
            }
            out.add(row);
        }
        return out;
    }

    private static List<Map<String, Object>> deriveColumns(List<Map<String, Object>> rows) {
        List<Map<String, Object>> cols = new List<Map<String, Object>>();
        if (rows.isEmpty()) {
            return cols;
        }
        for (String key : rows[0].keySet()) {
            Object v = rows[0].get(key);
            String type = (v instanceof Decimal || v instanceof Integer || v instanceof Double)
                ? 'number'
                : 'text';
            cols.add(new Map<String, Object>{ 'name' => key, 'type' => type });
        }
        return cols;
    }

    private static Boolean isReadOnly(String s) {
        String lower = s.toLowerCase().replaceAll('\\s+', ' ').trim();
        if (!Pattern.compile('^(select|with)\\s').matcher(lower).find()) {
            return false;
        }
        for (String bad : new List<String>{
            ' insert ', ' update ', ' delete ', ' merge ', ' drop ', ' truncate ', ' alter ', ' create '
        }) {
            if (lower.contains(bad)) {
                return false;
            }
        }
        return true;
    }

    private static Boolean hasLimit(String s) {
        return Pattern.compile('(?i)\\blimit\\s+\\d+').matcher(s).find();
    }

    private static void writeError(RestResponse res, Integer code, String msg) {
        res.statusCode = code;
        res.responseBody = Blob.valueOf(JSON.serialize(new Map<String, Object>{ 'error' => msg }));
    }
}
```

Create `force-app/main/default/classes/DcBridgeRest.cls-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>67.0</apiVersion>
    <status>Active</status>
</ApexClass>
```

Create `force-app/main/default/classes/DcBridgeRestTest.cls-meta.xml` (identical content).

- [ ] **Step 4: Run test to verify it passes**

Run: `sf apex run test --tests DcBridgeRestTest --result-format human -o jdo-0pz8au --wait 10 --json`
Expected: PASS — 3 tests, all green, ≥75% coverage on `DcBridgeRest`.

- [ ] **Step 5: Commit**

```bash
git add force-app/main/default/classes/DcBridgeRest.cls force-app/main/default/classes/DcBridgeRest.cls-meta.xml force-app/main/default/classes/DcBridgeRestTest.cls force-app/main/default/classes/DcBridgeRestTest.cls-meta.xml
git commit -m "feat(apex): add Data Cloud REST bridge for UI bundle access"
```

---

### Task 4: `_shared` data clients — GraphQL (Core/FSC) + Data Cloud

**Files:**
- Create: `force-app/main/default/uiBundles/_shared/src/data/graphqlClient.ts`
- Create: `force-app/main/default/uiBundles/_shared/src/data/graphqlClient.test.ts`
- Create: `force-app/main/default/uiBundles/_shared/src/data/dataCloudClient.ts`
- Create: `force-app/main/default/uiBundles/_shared/src/data/dataCloudClient.test.ts`
- Create: `force-app/main/default/uiBundles/_shared/src/data/index.ts`
- Modify: `force-app/main/default/uiBundles/_shared/src/index.ts` (re-export data layer)

**Interfaces:**
- Consumes: `createDataSDK` from `@salesforce/platform-sdk`; Task 3's `POST /services/apexrest/dc/query`.
- Produces:
  - `executeGraphQL<TData, TVariables>(query: string, variables?: TVariables): Promise<TData>` — Core/FSC path. Throws on `errors` or null data.
  - `queryDataCloud<TRow = Record<string, unknown>>(sql: string, maxRows?: number): Promise<DataCloudResult<TRow>>` where `DataCloudResult<TRow> = { columns: { name: string; type: string }[]; rows: TRow[]; rowCount: number; warning: string | null }` — Data Cloud path via Apex REST.
  - Both re-exported from `@shared`. All persona data hooks consume these two functions.

- [ ] **Step 1: Write the failing test (GraphQL client)**

Create `force-app/main/default/uiBundles/_shared/src/data/graphqlClient.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('@salesforce/platform-sdk', () => ({
  createDataSDK: vi.fn(async () => ({ graphql: { query: queryMock } })),
}));

import { executeGraphQL } from './graphqlClient';

describe('executeGraphQL', () => {
  beforeEach(() => queryMock.mockReset());

  it('returns data on success', async () => {
    queryMock.mockResolvedValue({ data: { uiapi: { ok: true } }, errors: null });
    const result = await executeGraphQL<{ uiapi: { ok: boolean } }, undefined>('query Q { uiapi { ok } }');
    expect(result.uiapi.ok).toBe(true);
  });

  it('throws when errors array is present', async () => {
    queryMock.mockResolvedValue({ data: null, errors: [{ message: 'FLS denied' }] });
    await expect(executeGraphQL('query Q {}')).rejects.toThrow(/FLS denied/);
  });

  it('throws when data is null and no errors', async () => {
    queryMock.mockResolvedValue({ data: null, errors: null });
    await expect(executeGraphQL('query Q {}')).rejects.toThrow(/null/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `ReactHeadless` dir): `npm run test -- run ../_shared/src/data/graphqlClient.test.ts`
Expected: FAIL — `Cannot find module './graphqlClient'`.

- [ ] **Step 3: Write minimal implementation (GraphQL client)**

Create `force-app/main/default/uiBundles/_shared/src/data/graphqlClient.ts`:

```typescript
/**
 * Core/FSC data path. Reads records that ORIGINATE in Salesforce
 * (Connector Type = SalesforceDotCom in the DC inventory): Account, Contact,
 * Opportunity, Case, Task, Event, FinancialGoal, PersonLifeEvent,
 * FinServ__FinancialAccount__c, etc. Synchronous, typed, cacheable,
 * write-back capable — always prefer this over the Data Cloud mirror.
 */
import { createDataSDK } from '@salesforce/platform-sdk';

export async function executeGraphQL<TData, TVariables = Record<string, unknown>>(
  query: string,
  variables?: TVariables
): Promise<TData> {
  const sdk = await createDataSDK();
  const result = await sdk.graphql?.query<TData, TVariables>({ query, variables });

  if (!result) {
    throw new Error('GraphQL is not available on this surface');
  }
  if (result.errors?.length) {
    throw new Error(`GraphQL Error: ${result.errors.map(e => e.message).join('; ')}`);
  }
  if (result.data == null) {
    throw new Error('GraphQL response data is null');
  }
  return result.data;
}
```

- [ ] **Step 4: Run GraphQL test to verify pass**

Run (from `ReactHeadless` dir): `npm run test -- run ../_shared/src/data/graphqlClient.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing test (Data Cloud client)**

Create `force-app/main/default/uiBundles/_shared/src/data/dataCloudClient.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.mock('@salesforce/platform-sdk', () => ({
  createDataSDK: vi.fn(async () => ({ fetch: fetchMock })),
}));

import { queryDataCloud } from './dataCloudClient';

describe('queryDataCloud', () => {
  beforeEach(() => fetchMock.mockReset());

  it('POSTs sql to the bridge and returns parsed rows', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        columns: [{ name: 'churn', type: 'number' }],
        rows: [{ churn: 0.8 }],
        rowCount: 1,
        warning: null,
      }),
    });
    const res = await queryDataCloud<{ churn: number }>('SELECT churn FROM Attrition__dlm', 10);
    expect(fetchMock).toHaveBeenCalledWith(
      '/services/apexrest/dc/query',
      expect.objectContaining({ method: 'POST' })
    );
    expect(res.rows[0].churn).toBe(0.8);
    expect(res.rowCount).toBe(1);
  });

  it('throws on non-ok HTTP', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'bad sql' }) });
    await expect(queryDataCloud('DELETE x')).rejects.toThrow(/bad sql/);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run (from `ReactHeadless` dir): `npm run test -- run ../_shared/src/data/dataCloudClient.test.ts`
Expected: FAIL — `Cannot find module './dataCloudClient'`.

- [ ] **Step 7: Write minimal implementation (Data Cloud client)**

Create `force-app/main/default/uiBundles/_shared/src/data/dataCloudClient.ts`:

```typescript
/**
 * Data Cloud path. For data that has NO Salesforce origin (Connector Type =
 * SNOWFLAKE / Jedi_Snowflake / streaming EVENTS in the DC inventory): the
 * Cumulus enrichment suite, ML predictions, CSAT/NPS, financial trades,
 * held-away assets, MGP plans, etc. Goes through the Apex REST bridge
 * (DcBridgeRest) because @AuraEnabled Apex is not callable from UI bundles.
 */
import { createDataSDK } from '@salesforce/platform-sdk';

export interface DataCloudColumn {
  name: string;
  type: string;
}

export interface DataCloudResult<TRow = Record<string, unknown>> {
  columns: DataCloudColumn[];
  rows: TRow[];
  rowCount: number;
  warning: string | null;
}

export async function queryDataCloud<TRow = Record<string, unknown>>(
  sql: string,
  maxRows?: number
): Promise<DataCloudResult<TRow>> {
  const sdk = await createDataSDK();
  if (!sdk.fetch) {
    throw new Error('fetch is not available on this surface');
  }
  const res = await sdk.fetch('/services/apexrest/dc/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, maxRows }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error ?? `Data Cloud query failed (HTTP ${res.status})`);
  }
  return json as DataCloudResult<TRow>;
}
```

- [ ] **Step 8: Create the data barrel + re-export from `@shared`**

Create `force-app/main/default/uiBundles/_shared/src/data/index.ts`:

```typescript
export { executeGraphQL } from './graphqlClient';
export {
  queryDataCloud,
  type DataCloudColumn,
  type DataCloudResult,
} from './dataCloudClient';
```

In `force-app/main/default/uiBundles/_shared/src/index.ts`, add:

```typescript
export * from './data';
```

- [ ] **Step 9: Run both data tests to verify pass**

Run (from `ReactHeadless` dir): `npm run test -- run ../_shared/src/data/`
Expected: PASS (5 tests total).

- [ ] **Step 10: Commit**

```bash
git add force-app/main/default/uiBundles/_shared/src/data force-app/main/default/uiBundles/_shared/src/index.ts
git commit -m "feat(_shared): dual data clients — GraphQL Core/FSC + Data Cloud bridge"
```

---

### Task 5: Theme token system + persona presets

**Files:**
- Create: `force-app/main/default/uiBundles/_shared/src/theme/tokens.css`
- Create: `force-app/main/default/uiBundles/_shared/src/theme/themes.ts`
- Create: `force-app/main/default/uiBundles/_shared/src/theme/themes.test.ts`
- Create: `force-app/main/default/uiBundles/_shared/src/theme/ThemeProvider.tsx`
- Create: `force-app/main/default/uiBundles/_shared/src/theme/ThemeProvider.test.tsx`
- Create: `force-app/main/default/uiBundles/_shared/src/theme/index.ts`
- Modify: `force-app/main/default/uiBundles/_shared/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PERSONA_THEMES: Record<PersonaKey, PersonaTheme>` where `type PersonaKey = 'retail' | 'commercial' | 'wealth'` and `interface PersonaTheme { key: PersonaKey; label: string; accent: string; accentSoft: string; gradient: string }`.
  - `<ThemeProvider persona={PersonaKey}>{children}</ThemeProvider>` — sets `data-theme` on a wrapper div and injects token CSS.
  - `useTheme(): PersonaTheme` hook (reads current persona from context).
  - `tokens.css` importable side-effect stylesheet. All persona apps wrap their root in `<ThemeProvider>`.

- [ ] **Step 1: Write the failing test (theme presets)**

Create `force-app/main/default/uiBundles/_shared/src/theme/themes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PERSONA_THEMES, type PersonaKey } from './themes';

describe('PERSONA_THEMES', () => {
  it('defines retail(teal), commercial(copper), wealth(gold)', () => {
    const keys: PersonaKey[] = ['retail', 'commercial', 'wealth'];
    keys.forEach(k => {
      expect(PERSONA_THEMES[k]).toBeDefined();
      expect(PERSONA_THEMES[k].accent).toMatch(/^#|^oklch|^hsl|^rgb/);
    });
  });

  it('each theme has a distinct accent', () => {
    const accents = Object.values(PERSONA_THEMES).map(t => t.accent);
    expect(new Set(accents).size).toBe(accents.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `ReactHeadless` dir): `npm run test -- run ../_shared/src/theme/themes.test.ts`
Expected: FAIL — `Cannot find module './themes'`.

- [ ] **Step 3: Write minimal implementation (theme presets + tokens)**

Create `force-app/main/default/uiBundles/_shared/src/theme/themes.ts`:

```typescript
/**
 * Persona theme presets — the "signature identity per line of business" from
 * the Cumulus brand system: Retail teal, Commercial copper, Wealth gold.
 * Each persona app selects its theme via <ThemeProvider persona="...">.
 */
export type PersonaKey = 'retail' | 'commercial' | 'wealth';

export interface PersonaTheme {
  key: PersonaKey;
  label: string;
  accent: string;
  accentSoft: string;
  gradient: string;
}

export const PERSONA_THEMES: Record<PersonaKey, PersonaTheme> = {
  retail: {
    key: 'retail',
    label: 'Retail Banking',
    accent: '#0d9488', // teal-600
    accentSoft: '#5eead4', // teal-300
    gradient: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
  },
  commercial: {
    key: 'commercial',
    label: 'Commercial Banking',
    accent: '#b45309', // copper / amber-700
    accentSoft: '#fbbf24', // amber-400
    gradient: 'linear-gradient(135deg, #b45309 0%, #92400e 100%)',
  },
  wealth: {
    key: 'wealth',
    label: 'Wealth Management',
    accent: '#ca8a04', // gold / yellow-600
    accentSoft: '#fde047', // yellow-300
    gradient: 'linear-gradient(135deg, #ca8a04 0%, #a16207 100%)',
  },
};
```

Create `force-app/main/default/uiBundles/_shared/src/theme/tokens.css`:

```css
/**
 * Shared design tokens for cockpit apps. Persona accent tokens are set by
 * ThemeProvider via inline style on the [data-theme] wrapper; these :root
 * defaults cover structural (non-accent) tokens used by all personas.
 */
:root {
  --wp-surface: #0b1220;
  --wp-surface-raised: #141d2e;
  --wp-surface-glass: rgba(20, 29, 46, 0.72);
  --wp-border: rgba(148, 163, 184, 0.18);
  --wp-text: #e2e8f0;
  --wp-text-muted: #94a3b8;
  --wp-radius: 16px;
  --wp-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  /* accent tokens are overridden per-persona by ThemeProvider */
  --wp-accent: #0d9488;
  --wp-accent-soft: #5eead4;
  --wp-accent-gradient: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
}
```

- [ ] **Step 4: Run theme presets test to verify pass**

Run (from `ReactHeadless` dir): `npm run test -- run ../_shared/src/theme/themes.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing test (ThemeProvider)**

Create `force-app/main/default/uiBundles/_shared/src/theme/ThemeProvider.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, useTheme } from './ThemeProvider';

function Probe() {
  const theme = useTheme();
  return <span data-testid="probe">{theme.label}</span>;
}

describe('ThemeProvider', () => {
  it('provides the selected persona theme and sets data-theme', () => {
    const { container } = render(
      <ThemeProvider persona="wealth">
        <Probe />
      </ThemeProvider>
    );
    expect(screen.getByTestId('probe').textContent).toBe('Wealth Management');
    expect(container.querySelector('[data-theme="wealth"]')).not.toBeNull();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run (from `ReactHeadless` dir): `npm run test -- run ../_shared/src/theme/ThemeProvider.test.tsx`
Expected: FAIL — `Cannot find module './ThemeProvider'`.

- [ ] **Step 7: Write minimal implementation (ThemeProvider)**

Create `force-app/main/default/uiBundles/_shared/src/theme/ThemeProvider.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from 'react';
import { PERSONA_THEMES, type PersonaKey, type PersonaTheme } from './themes';
import './tokens.css';

const ThemeContext = createContext<PersonaTheme>(PERSONA_THEMES.retail);

export function useTheme(): PersonaTheme {
  return useContext(ThemeContext);
}

interface ThemeProviderProps {
  persona: PersonaKey;
  children: ReactNode;
}

export function ThemeProvider({ persona, children }: ThemeProviderProps) {
  const theme = PERSONA_THEMES[persona];
  const style = {
    '--wp-accent': theme.accent,
    '--wp-accent-soft': theme.accentSoft,
    '--wp-accent-gradient': theme.gradient,
  } as React.CSSProperties;

  return (
    <ThemeContext.Provider value={theme}>
      <div data-theme={persona} style={style}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
```

- [ ] **Step 8: Create theme barrel + re-export**

Create `force-app/main/default/uiBundles/_shared/src/theme/index.ts`:

```typescript
export { PERSONA_THEMES, type PersonaKey, type PersonaTheme } from './themes';
export { ThemeProvider, useTheme } from './ThemeProvider';
```

In `force-app/main/default/uiBundles/_shared/src/index.ts`, add:

```typescript
export * from './theme';
```

- [ ] **Step 9: Run all theme tests to verify pass**

Run (from `ReactHeadless` dir): `npm run test -- run ../_shared/src/theme/`
Expected: PASS (3 tests).

- [ ] **Step 10: Commit**

```bash
git add force-app/main/default/uiBundles/_shared/src/theme force-app/main/default/uiBundles/_shared/src/index.ts
git commit -m "feat(_shared): persona theme token system (retail/commercial/wealth)"
```

---

### Task 6: `useAsyncData` hook (shared, generation-safe)

**Files:**
- Create: `force-app/main/default/uiBundles/_shared/src/hooks/useAsyncData.ts`
- Create: `force-app/main/default/uiBundles/_shared/src/hooks/useAsyncData.test.tsx`
- Create: `force-app/main/default/uiBundles/_shared/src/hooks/index.ts`
- Modify: `force-app/main/default/uiBundles/_shared/src/index.ts`

**Interfaces:**
- Consumes: React.
- Produces: `useAsyncData<T>(fetcher: () => Promise<T>, deps: React.DependencyList): { data: T | null; loading: boolean; error: string | null }`. Ported from the scaffold's proven hook (cancellation + generation guard). All persona data-bound components use this to call `executeGraphQL` / `queryDataCloud`.

- [ ] **Step 1: Write the failing test**

Create `force-app/main/default/uiBundles/_shared/src/hooks/useAsyncData.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAsyncData } from './useAsyncData';

describe('useAsyncData', () => {
  it('resolves data and clears loading', async () => {
    const { result } = renderHook(() => useAsyncData(async () => 42, []));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe(42);
    expect(result.current.error).toBeNull();
  });

  it('captures error message on rejection', async () => {
    const { result } = renderHook(() =>
      useAsyncData(async () => {
        throw new Error('boom');
      }, [])
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('boom');
    expect(result.current.data).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `ReactHeadless` dir): `npm run test -- run ../_shared/src/hooks/useAsyncData.test.tsx`
Expected: FAIL — `Cannot find module './useAsyncData'`.

- [ ] **Step 3: Write minimal implementation**

Create `force-app/main/default/uiBundles/_shared/src/hooks/useAsyncData.ts` (ported verbatim from `ReactHeadless/src/hooks/useAsyncData.ts` — the scaffold's implementation is already correct):

```typescript
import { useEffect, useRef, useState } from 'react';

interface UseAsyncDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Runs an async fetcher on mount and whenever `deps` change. A generation
 * counter + cancellation flag prevent stale/out-of-order updates. Shared by
 * all cockpit components that read from executeGraphQL / queryDataCloud.
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList
): UseAsyncDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const [prevDeps, setPrevDeps] = useState(deps);
  if (deps.length !== prevDeps.length || deps.some((d, i) => d !== prevDeps[i])) {
    setPrevDeps(deps);
    setGeneration(g => g + 1);
    if (!loading) setLoading(true);
    if (error !== null) setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    fetcherRef
      .current()
      .then(result => {
        if (!cancelled) setData(result);
      })
      .catch(err => {
        console.error(err);
        if (!cancelled) setError(err instanceof Error ? err.message : 'An error occurred');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [generation]);

  return { data, loading, error };
}
```

- [ ] **Step 4: Create hooks barrel + re-export**

Create `force-app/main/default/uiBundles/_shared/src/hooks/index.ts`:

```typescript
export { useAsyncData } from './useAsyncData';
```

In `force-app/main/default/uiBundles/_shared/src/index.ts`, add:

```typescript
export * from './hooks';
```

- [ ] **Step 5: Run test to verify it passes**

Run (from `ReactHeadless` dir): `npm run test -- run ../_shared/src/hooks/useAsyncData.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add force-app/main/default/uiBundles/_shared/src/hooks force-app/main/default/uiBundles/_shared/src/index.ts
git commit -m "feat(_shared): useAsyncData hook (generation-safe async fetch)"
```

---

### Task 7: `KpiTile` primitive (glass tile + animated count-up + SVG sparkline)

**Files:**
- Create: `force-app/main/default/uiBundles/_shared/src/components/KpiTile.tsx`
- Create: `force-app/main/default/uiBundles/_shared/src/components/KpiTile.test.tsx`
- Create: `force-app/main/default/uiBundles/_shared/src/components/Sparkline.tsx`
- Create: `force-app/main/default/uiBundles/_shared/src/components/Sparkline.test.tsx`
- Create: `force-app/main/default/uiBundles/_shared/src/components/index.ts`
- Modify: `force-app/main/default/uiBundles/_shared/src/index.ts`

**Interfaces:**
- Consumes: `useTheme` (Task 5).
- Produces:
  - `<Sparkline points={number[]} className?: string />` — hand-rolled SVG polyline (no chart dep), stroked with `var(--wp-accent)`.
  - `<KpiTile label={string} value={number} format?: 'currency'|'number'|'percent' trend?: number[] />` — glass card, animated count-up to `value`, optional sparkline. Renders `label`, formatted value, sparkline. Used by every persona's KPI strip.

- [ ] **Step 1: Write the failing test (Sparkline)**

Create `force-app/main/default/uiBundles/_shared/src/components/Sparkline.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Sparkline } from './Sparkline';

describe('Sparkline', () => {
  it('renders an svg polyline for the points', () => {
    const { container } = render(<Sparkline points={[1, 3, 2, 5, 4]} />);
    const poly = container.querySelector('polyline');
    expect(poly).not.toBeNull();
    // 5 points => 5 "x,y" pairs in the points attribute
    expect(poly?.getAttribute('points')?.trim().split(/\s+/).length).toBe(5);
  });

  it('renders nothing meaningful for empty points', () => {
    const { container } = render(<Sparkline points={[]} />);
    expect(container.querySelector('polyline')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `ReactHeadless` dir): `npm run test -- run ../_shared/src/components/Sparkline.test.tsx`
Expected: FAIL — `Cannot find module './Sparkline'`.

- [ ] **Step 3: Write minimal implementation (Sparkline)**

Create `force-app/main/default/uiBundles/_shared/src/components/Sparkline.tsx`:

```tsx
interface SparklineProps {
  points: number[];
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Hand-rolled SVG sparkline — no charting dependency (mirrors the
 * Financial_KPI_Widget approach). Stroke uses the persona accent token.
 */
export function Sparkline({ points, width = 120, height = 32, className }: SparklineProps) {
  if (!points.length) {
    return <svg width={width} height={height} className={className} aria-hidden="true" />;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const coords = points
    .map((p, i) => {
      const x = i * step;
      const y = height - ((p - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className={className} aria-hidden="true">
      <polyline
        points={coords}
        fill="none"
        stroke="var(--wp-accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

- [ ] **Step 4: Run Sparkline test to verify pass**

Run (from `ReactHeadless` dir): `npm run test -- run ../_shared/src/components/Sparkline.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing test (KpiTile)**

Create `force-app/main/default/uiBundles/_shared/src/components/KpiTile.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { KpiTile } from './KpiTile';

describe('KpiTile', () => {
  it('renders the label and animates to the formatted value', async () => {
    render(<KpiTile label="Deposits" value={1250000} format="currency" />);
    expect(screen.getByText('Deposits')).toBeInTheDocument();
    await waitFor(() => {
      // count-up ends at the final formatted currency value
      expect(screen.getByTestId('kpi-value').textContent).toMatch(/\$1,250,000|\$1\.25M|1,250,000/);
    });
  });

  it('renders a sparkline when trend provided', () => {
    const { container } = render(
      <KpiTile label="AUM" value={100} format="number" trend={[1, 2, 3]} />
    );
    expect(container.querySelector('polyline')).not.toBeNull();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run (from `ReactHeadless` dir): `npm run test -- run ../_shared/src/components/KpiTile.test.tsx`
Expected: FAIL — `Cannot find module './KpiTile'`.

- [ ] **Step 7: Write minimal implementation (KpiTile)**

Create `force-app/main/default/uiBundles/_shared/src/components/KpiTile.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Sparkline } from './Sparkline';

type KpiFormat = 'currency' | 'number' | 'percent';

interface KpiTileProps {
  label: string;
  value: number;
  format?: KpiFormat;
  trend?: number[];
}

function formatValue(v: number, format: KpiFormat): string {
  if (format === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(v);
  }
  if (format === 'percent') {
    return `${(v * 100).toFixed(1)}%`;
  }
  return new Intl.NumberFormat('en-US').format(Math.round(v));
}

/**
 * Glassmorphic KPI tile with animated count-up and optional sparkline.
 * Reused across every persona's book-KPI strip. Count-up runs ~600ms via rAF.
 */
export function KpiTile({ label, value, format = 'number', trend }: KpiTileProps) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let raf = 0;
    const duration = 600;
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      setDisplay(value * progress);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <div
      style={{
        background: 'var(--wp-surface-glass)',
        border: '1px solid var(--wp-border)',
        borderRadius: 'var(--wp-radius)',
        boxShadow: 'var(--wp-shadow)',
        backdropFilter: 'blur(12px)',
        padding: '1rem 1.25rem',
        color: 'var(--wp-text)',
      }}
    >
      <div style={{ color: 'var(--wp-text-muted)', fontSize: '0.8rem', fontWeight: 500 }}>
        {label}
      </div>
      <div
        data-testid="kpi-value"
        style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '0.25rem' }}
      >
        {formatValue(display, format)}
      </div>
      {trend && trend.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <Sparkline points={trend} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Create components barrel + re-export**

Create `force-app/main/default/uiBundles/_shared/src/components/index.ts`:

```typescript
export { Sparkline } from './Sparkline';
export { KpiTile } from './KpiTile';
```

In `force-app/main/default/uiBundles/_shared/src/index.ts`, add:

```typescript
export * from './components';
```

- [ ] **Step 9: Run all component tests to verify pass**

Run (from `ReactHeadless` dir): `npm run test -- run ../_shared/src/components/`
Expected: PASS (4 tests).

- [ ] **Step 10: Commit**

```bash
git add force-app/main/default/uiBundles/_shared/src/components force-app/main/default/uiBundles/_shared/src/index.ts
git commit -m "feat(_shared): KpiTile + Sparkline cinematic primitives"
```

---

### Task 8: `AttentionQueue` primitive (agentic ranked action list)

**Files:**
- Create: `force-app/main/default/uiBundles/_shared/src/components/AttentionQueue.tsx`
- Create: `force-app/main/default/uiBundles/_shared/src/components/AttentionQueue.test.tsx`
- Modify: `force-app/main/default/uiBundles/_shared/src/components/index.ts`

**Interfaces:**
- Consumes: `useTheme` (Task 5).
- Produces: `<AttentionQueue items={AttentionItem[]} onSelect?: (item: AttentionItem) => void />` where `interface AttentionItem { id: string; title: string; reason: string; score: number; severity: 'high' | 'medium' | 'low'; clientName?: string }`. Renders items sorted by `score` desc, each with a severity indicator, title, reason, and score badge. This is the agentic heart every persona cockpit renders (fed by different ML models per persona).

- [ ] **Step 1: Write the failing test**

Create `force-app/main/default/uiBundles/_shared/src/components/AttentionQueue.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AttentionQueue, type AttentionItem } from './AttentionQueue';

const items: AttentionItem[] = [
  { id: 'a', title: 'Low churn signal', reason: 'stable', score: 0.2, severity: 'low' },
  { id: 'b', title: 'High churn risk', reason: 'balance dropped 60%', score: 0.9, severity: 'high' },
];

describe('AttentionQueue', () => {
  it('renders items sorted by score descending', () => {
    render(<AttentionQueue items={items} />);
    const titles = screen.getAllByTestId('attention-title').map(n => n.textContent);
    expect(titles[0]).toBe('High churn risk');
    expect(titles[1]).toBe('Low churn signal');
  });

  it('fires onSelect with the clicked item', () => {
    const onSelect = vi.fn();
    render(<AttentionQueue items={items} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('High churn risk'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `ReactHeadless` dir): `npm run test -- run ../_shared/src/components/AttentionQueue.test.tsx`
Expected: FAIL — `Cannot find module './AttentionQueue'`.

- [ ] **Step 3: Write minimal implementation**

Create `force-app/main/default/uiBundles/_shared/src/components/AttentionQueue.tsx`:

```tsx
export interface AttentionItem {
  id: string;
  title: string;
  reason: string;
  score: number;
  severity: 'high' | 'medium' | 'low';
  clientName?: string;
}

interface AttentionQueueProps {
  items: AttentionItem[];
  onSelect?: (item: AttentionItem) => void;
}

const SEVERITY_COLOR: Record<AttentionItem['severity'], string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#64748b',
};

/**
 * Agentic "Attention Today" queue — the reasoned, ML-ranked action list at the
 * heart of every persona cockpit. Persona apps feed it items from their own
 * models (churn, credit-risk, portfolio-drift). Sorted by score descending.
 */
export function AttentionQueue({ items, onSelect }: AttentionQueueProps) {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
      {sorted.map(item => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect?.(item)}
            style={{
              width: '100%',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              background: 'var(--wp-surface-glass)',
              border: '1px solid var(--wp-border)',
              borderRadius: 'var(--wp-radius)',
              padding: '0.75rem 1rem',
              color: 'var(--wp-text)',
              cursor: 'pointer',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                marginTop: 6,
                background: SEVERITY_COLOR[item.severity],
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1 }}>
              <span
                data-testid="attention-title"
                style={{ display: 'block', fontWeight: 600 }}
              >
                {item.title}
              </span>
              <span style={{ color: 'var(--wp-text-muted)', fontSize: '0.85rem' }}>
                {item.clientName ? `${item.clientName} — ` : ''}
                {item.reason}
              </span>
            </span>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'var(--wp-accent)',
              }}
            >
              {Math.round(item.score * 100)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Add to components barrel**

In `force-app/main/default/uiBundles/_shared/src/components/index.ts`, add:

```typescript
export { AttentionQueue, type AttentionItem } from './AttentionQueue';
```

- [ ] **Step 5: Run test to verify it passes**

Run (from `ReactHeadless` dir): `npm run test -- run ../_shared/src/components/AttentionQueue.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add force-app/main/default/uiBundles/_shared/src/components
git commit -m "feat(_shared): AttentionQueue agentic ranked-action primitive"
```

---

### Task 9: Full `_shared` suite green + typecheck gate

**Files:**
- Modify: none (verification task) — may fix any type errors surfaced.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a proven, type-clean `_shared` library ready for persona apps to import. This is the reviewer gate before persona plans begin.

- [ ] **Step 1: Run the full `_shared` test suite**

Run (from `ReactHeadless` dir): `npm run test -- run ../_shared/src/`
Expected: PASS — all suites (version, data ×2, theme ×2, hooks, components ×3). ~16 tests.

- [ ] **Step 2: Typecheck the shared library through the app tsconfig**

Run (from `ReactHeadless` dir): `npx tsc -b --noEmit`
Expected: 0 errors. `_shared/src` is in the `include` array, so its types are checked here.

- [ ] **Step 3: Lint the shared library**

Run (from `ReactHeadless` dir): `npx eslint ../_shared/src`
Expected: 0 errors.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A force-app/main/default/uiBundles/_shared
git commit -m "chore(_shared): typecheck + lint gate green"
```

---

## Self-Review

**1. Spec coverage:**
- Dual data-access contract (Core GraphQL + DC Apex REST) → Tasks 3, 4 ✓
- `_shared` as non-deployed source library via `@shared` alias → Task 1 ✓
- Theme system (retail teal / commercial copper / wealth gold) → Task 5 ✓
- Cinematic primitives (KPI tiles, sparklines, agentic queue) → Tasks 7, 8 ✓
- Shared async hook → Task 6 ✓
- Missing Vitest setup (would break all tests) → Task 2 ✓
- **Deferred (correctly, per skill preconditions):** real GraphQL query strings — `schema.graphql` is absent and there is no `graphql-search.sh`; those are fetched post-deploy and belong in the persona plans, not here. The profile-widget/timeline/prediction React ports also belong in persona plans since their exact data queries depend on the fetched schema.

**2. Placeholder scan:** No TBD/TODO-as-deliverable; every code step shows complete code. The only intentional deferral (GraphQL strings) is documented above as a precondition gate, not a placeholder.

**3. Type consistency:** `executeGraphQL`/`queryDataCloud` signatures in Task 4 match the Produces block; `DataCloudResult<TRow>` shape matches the Apex JSON in Task 3; `PersonaKey`/`PersonaTheme` consistent across Task 5; `AttentionItem` fields consistent between Task 8 impl and test; `KpiTile`/`Sparkline` prop names consistent.

**Note for persona plans:** Their task "Interfaces → Consumes" blocks import from `@shared`: `executeGraphQL`, `queryDataCloud`, `DataCloudResult`, `useAsyncData`, `ThemeProvider`, `useTheme`, `PERSONA_THEMES`, `KpiTile`, `Sparkline`, `AttentionQueue`, `AttentionItem`, `SHARED_VERSION`. Each persona plan MUST begin with a UI-bundle scaffold task (`sf template generate ui-bundle`) + the `@shared` alias wiring (mirroring Task 1) + a post-deploy `graphql:schema` + codegen task before any real GraphQL query is written.
