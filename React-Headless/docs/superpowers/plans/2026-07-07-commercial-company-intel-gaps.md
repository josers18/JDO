# Commercial Company Intel + Delinquency Watch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface four §2 corporate-intelligence data gaps (ZoomInfo, BoardEx, MSCI ESG, SEC filings) as a new "Company Intel" tab on the Commercial Customer-360, plus a book-level Loan Delinquency Watch panel on the Commercial home dashboard.

**Architecture:** Extends the existing swappable-fetcher pattern in the `ReactCommercial` UI bundle. New nullable fields on the `Full360` / `HomeDashboard` view models are populated by additional `queryDataCloud` calls in the *Real* fetchers and mirrored in the *mock* fetchers, then rendered by null-safe tab/panel components. No new architecture, no new dependencies — this is the exact pattern that added the CoreLogic "Property" tab in commit `0b53932e`.

**Tech Stack:** React 19 + TypeScript + Vite, `@shared` primitives (`GlassCard`, `DataTable`, `KpiTile`), `queryDataCloud` (→ `DcBridgeRest` Apex → `ConnectApi.CdpQuery`), `executeGraphQL`. shadcn/Tailwind not touched.

## Global Constraints

- **Bundle scope:** ALL changes are inside `force-app/main/default/uiBundles/ReactCommercial/` — no other bundle, no `_shared`, no Apex. (Retail/Wealth demo accounts lack this business data.)
- **Working directory for all commands:** `/Users/jsifontes/Documents/Git/JDO/.worktrees/react-headless-agentforce/React-Headless/force-app/main/default/uiBundles/ReactCommercial`
- **No unit-test framework exists in this project** (mock/visual phase). The verification cycle per task is: `npm run build` (tsc + vite) and `npm run lint`, both must be green. In-org `browser_evaluate` verification happens once at the end (Task 5) after deploy.
- **API version 67.0. Org alias `jdo-1lrnov`.**
- **DC text is HTML-entity-encoded** (`&quot;`/`&#39;`/`&amp;`/`&lt;`/`&gt;`) — always run it through the existing `decode()` helper in `full360DataReal.ts`.
- **GraphQL `Id` is a plain string on nodes; every other field is `{ value }`-wrapped.** (Not relevant to the DC-only additions here, but holds for any GraphQL edit.)
- **Every new `Full360`/`HomeDashboard` field must be non-optional in the interface but default to `null`/`[]` in BOTH the real and mock fetchers**, so tabs/panels degrade gracefully for accounts without rows.
- Commit after each task with the shown message. Do NOT deploy until Task 5.

## Verified data facts (probed live on jdo-1lrnov, 2026-07-07)

Business demo account **Omega = `001am00000qvjs6AAA`** has rows for all four corporate DMOs. Julie (`001am00000qvjsAAAQ`, retail) has none → empty states.

| DMO | Join key | Columns used |
|---|---|---|
| `CumulusZoomInfoFirmographics__dlm` | `ssot__AccountId__c` | `revenueBand__c`, `employeeBand__c`, `industryNaicsCode__c`, `industrySicCode__c`, `foundedYear__c`, `websiteDomain__c`, `hqStateCode__c`, `hqCountryCode__c`, `linkedinFollowers__c`, `techStackFlags__c`, `profileMonth__c` |
| `CumulusBoardExExecIntel__dlm` | `ssot__AccountId__c` | `boardSize__c`, `ceoTenureYears__c`, `boardAvgTenureYears__c`, `governanceRating__c`, `keyDirectorName__c`, `interlockCount__c`, `execTurnoverFlag__c`, `recentGovernanceEventDate__c`, `profileMonth__c` |
| `CumulusMSCIESG__dlm` | `ssot__AccountId__c` | `esgScoreOverall__c`, `environmentalScore__c`, `socialScore__c`, `governanceScore__c`, `msciEsgRating__c`, `carbonIntensityTonsPerMRevenue__c`, `controversyFlagCount__c`, `topControversyCategory__c`, `lastRatingChangeDirection__c`, `profileMonth__c` |
| `SEC_Filings__dlm` | `accountid__c` | `filingtype__c`, `section__c`, `section_text__c`, `uniqueid__c` |
| `Loan_Delinquencies__dlm` | (book-only, NOT account-joinable) | `delinquency_status__c`, `loan_balance__c`, `recovered_amount__c`, `recovery_status__c`, `uniqueid__c` |

`techStackFlags__c` arrives as a delimited string (comma/semicolon/pipe). `foundedYear__c`/`linkedinFollowers__c`/`boardSize__c` etc. are DECIMAL (parse with `dcNum` then round). `execTurnoverFlag__c` is a boolean-ish (`true`/`false` string). All `profileMonth__c`/`recentGovernanceEventDate__c` are dates (use `shortDate`).

## File Structure

```
src/personas/customer/full360Types.ts    Task 1  +4 interfaces, +4 Full360 fields
src/personas/customer/full360DataReal.ts  Task 2  +4 DC queries, +mapping, +return
src/personas/customer/full360Data.ts      Task 2  +mock values for the 4 fields
src/personas/customer/Full360Tabs.tsx     Task 3  +CompanyIntelTab, +'Company Intel' tab entry
src/home/homeTypes.ts                      Task 4  +DelinquencyWatch, +field on HomeDashboard
src/home/homeDataReal.ts                   Task 4  +delinquency aggregate query + mapping
src/home/homeData.ts                       Task 4  +mock delinquency
src/home/HomePage.tsx                      Task 4  +Delinquency Watch panel (render-if-present)
                                           Task 5  deploy + in-org verify
```

---

### Task 1: Company Intel types

**Files:**
- Modify: `src/personas/customer/full360Types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Firmographics`, `Governance`, `EsgProfile`, `SecFiling` interfaces; four new fields on `Full360`: `firmographics: Firmographics | null`, `governance: Governance | null`, `esg: EsgProfile | null`, `secFilings: SecFiling[]`.

- [ ] **Step 1: Add the four interfaces**

Insert immediately BEFORE the `/* ---------- The full bundle ---------- */` comment block in `full360Types.ts`:

```ts
/* ---------- Company Intel (ZoomInfo / BoardEx / MSCI / SEC) ---------- */
export interface Firmographics {
  revenueBand: string;
  employeeBand: string;
  industryNaics: string;
  industrySic: string;
  foundedYear: number;
  website: string;
  hq: string;
  linkedinFollowers: number;
  techStack: string[];
  asOf: string;
}
export interface Governance {
  boardSize: number;
  ceoTenureYears: number;
  boardAvgTenureYears: number;
  governanceRating: string;
  keyDirector: string;
  interlockCount: number;
  execTurnover: boolean;
  recentEventDate: string;
  asOf: string;
}
export interface EsgProfile {
  overall: number;
  environmental: number;
  social: number;
  governance: number;
  rating: string;
  carbonIntensity: number;
  controversyCount: number;
  topControversy: string;
  ratingChangeDirection: string;
  asOf: string;
}
export interface SecFiling {
  filingType: string;
  sections: { id: string; section: string; text: string }[];
}
```

- [ ] **Step 2: Add four fields to the `Full360` interface**

In the `export interface Full360 { … }` block, immediately after the existing `financialPlan: FinancialPlan | null;` line, add:

```ts
  /** ZoomInfo firmographics (null when the account has no firmographic row). */
  firmographics: Firmographics | null;
  /** BoardEx governance / exec intel (null when none). */
  governance: Governance | null;
  /** MSCI corporate ESG profile (null when none). */
  esg: EsgProfile | null;
  /** SEC filings grouped by filing type (empty array when none). */
  secFilings: SecFiling[];
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: FAILS — `full360DataReal.ts` and `full360Data.ts` now error that the returned object is missing the four new required properties. This confirms the type is wired into `Full360`. (Task 2 fixes both.)

- [ ] **Step 4: Commit**

```bash
git add src/personas/customer/full360Types.ts
git commit -m "feat(react-headless): add Company Intel types to Full360 contract"
```

---

### Task 2: Populate Company Intel in real + mock fetchers

**Files:**
- Modify: `src/personas/customer/full360DataReal.ts`
- Modify: `src/personas/customer/full360Data.ts`

**Interfaces:**
- Consumes: `Firmographics`, `Governance`, `EsgProfile`, `SecFiling` from Task 1; existing helpers `rows`, `queryDataCloud`, `dcNum`, `decode`, `shortDate` (already in `full360DataReal.ts`).
- Produces: a `Full360` object that includes `firmographics`, `governance`, `esg`, `secFilings`.

- [ ] **Step 1: Import the new types in `full360DataReal.ts`**

In the `import type { … } from './full360Types';` block, add `Firmographics, Governance, EsgProfile, SecFiling` to the imported names. Result:

```ts
import type {
  Full360, DetailField, FinAccount, Transaction, Trade, Interaction, CaseRow,
  CsatNps, Opportunity, Campaign, MeetingNote, CallSummary, KycSummary,
  MlPrediction, AgentforceSummary, Firmographics, Governance, EsgProfile, SecFiling,
} from './full360Types';
```

- [ ] **Step 2: Add four DC queries to the `Promise.all` batch**

In `fetchFull360Real`, the destructuring array currently ends with `propRows, planRows]` and the `Promise.all([ … ])` currently ends with the MgpFinancialPlans query. Extend BOTH: add `ziRows, bxRows, esgRows, secRows` to the destructured names, and append these four `rows(queryDataCloud(...))` calls as the last entries of the `Promise.all` array (after the MgpFinancialPlans call, keeping positional order aligned with the destructure):

```ts
    rows(queryDataCloud<Record<string, unknown>>(`SELECT revenueBand__c rev, employeeBand__c emp, industryNaicsCode__c naics, industrySicCode__c sic, foundedYear__c founded, websiteDomain__c web, hqStateCode__c state, hqCountryCode__c country, linkedinFollowers__c li, techStackFlags__c tech, profileMonth__c m FROM CumulusZoomInfoFirmographics__dlm WHERE ssot__AccountId__c = '${acct}' ORDER BY profileMonth__c DESC LIMIT 1`, 1)),
    rows(queryDataCloud<Record<string, unknown>>(`SELECT boardSize__c size, ceoTenureYears__c ceo, boardAvgTenureYears__c avg, governanceRating__c rating, keyDirectorName__c dir, interlockCount__c interlock, execTurnoverFlag__c turnover, recentGovernanceEventDate__c evt, profileMonth__c m FROM CumulusBoardExExecIntel__dlm WHERE ssot__AccountId__c = '${acct}' ORDER BY profileMonth__c DESC LIMIT 1`, 1)),
    rows(queryDataCloud<Record<string, unknown>>(`SELECT esgScoreOverall__c overall, environmentalScore__c env, socialScore__c soc, governanceScore__c gov, msciEsgRating__c rating, carbonIntensityTonsPerMRevenue__c carbon, controversyFlagCount__c ctrl, topControversyCategory__c topc, lastRatingChangeDirection__c dir, profileMonth__c m FROM CumulusMSCIESG__dlm WHERE ssot__AccountId__c = '${acct}' ORDER BY profileMonth__c DESC LIMIT 1`, 1)),
    rows(queryDataCloud<Record<string, unknown>>(`SELECT filingtype__c ftype, section__c sect, section_text__c txt, uniqueid__c uid FROM SEC_Filings__dlm WHERE accountid__c = '${acct}' LIMIT 40`, 40)),
```

So the destructure line becomes:
```ts
  const [core, txns, tradeRows, inters, notes, csatRows, camps, gong, aml, attr, pcsat, propRows, planRows, ziRows, bxRows, esgRows, secRows] = await Promise.all([
```

- [ ] **Step 3: Map the rows to the new fields**

Immediately AFTER the existing `const financialPlan = pl ? { … } : null;` block and BEFORE the final `return { … }`, insert:

```ts
  /* ---- ZoomInfo firmographics (real, per-account) ---- */
  const zi = ziRows[0];
  const firmographics: Firmographics | null = zi ? {
    revenueBand: decode(zi.rev) || '—',
    employeeBand: decode(zi.emp) || '—',
    industryNaics: String(zi.naics ?? '—'),
    industrySic: String(zi.sic ?? '—'),
    foundedYear: Math.round(dcNum(zi.founded)),
    website: decode(zi.web) || '—',
    hq: [String(zi.state ?? ''), String(zi.country ?? '')].filter(Boolean).join(', ') || '—',
    linkedinFollowers: Math.round(dcNum(zi.li)),
    techStack: decode(zi.tech).split(/[,;|]/).map(t => t.trim()).filter(Boolean),
    asOf: shortDate(zi.m),
  } : null;

  /* ---- BoardEx governance (real, per-account) ---- */
  const bx = bxRows[0];
  const governance: Governance | null = bx ? {
    boardSize: Math.round(dcNum(bx.size)),
    ceoTenureYears: Math.round(dcNum(bx.ceo)),
    boardAvgTenureYears: Math.round(dcNum(bx.avg)),
    governanceRating: decode(bx.rating) || '—',
    keyDirector: decode(bx.dir) || '—',
    interlockCount: Math.round(dcNum(bx.interlock)),
    execTurnover: bx.turnover === true || String(bx.turnover).toLowerCase() === 'true',
    recentEventDate: bx.evt ? shortDate(bx.evt) : '—',
    asOf: shortDate(bx.m),
  } : null;

  /* ---- MSCI ESG (real, per-account) ---- */
  const eg = esgRows[0];
  const esg: EsgProfile | null = eg ? {
    overall: Math.round(dcNum(eg.overall) * 10) / 10,
    environmental: Math.round(dcNum(eg.env) * 10) / 10,
    social: Math.round(dcNum(eg.soc) * 10) / 10,
    governance: Math.round(dcNum(eg.gov) * 10) / 10,
    rating: decode(eg.rating) || '—',
    carbonIntensity: Math.round(dcNum(eg.carbon) * 10) / 10,
    controversyCount: Math.round(dcNum(eg.ctrl)),
    topControversy: decode(eg.topc) || 'None',
    ratingChangeDirection: decode(eg.dir) || '—',
    asOf: shortDate(eg.m),
  } : null;

  /* ---- SEC filings grouped by filing type (real, per-account) ---- */
  const secByType = new Map<string, { id: string; section: string; text: string }[]>();
  secRows.forEach((r, i) => {
    const ftype = decode(r.ftype) || '10-Q';
    const arr = secByType.get(ftype) ?? [];
    arr.push({ id: `sec${i}`, section: decode(r.sect) || 'Section', text: decode(r.txt) });
    secByType.set(ftype, arr);
  });
  const secFilings: SecFiling[] = [...secByType.entries()].map(([filingType, sections]) => ({ filingType, sections }));
```

- [ ] **Step 4: Add the four fields to the return object**

Change the final `return { … }` so its last line reads:

```ts
    property, financialPlan, firmographics, governance, esg, secFilings,
```

- [ ] **Step 5: Add mock values in `full360Data.ts`**

In `full360Data.ts`, the mock object (`JULIE_FULL`) ends with `property: { … }, financialPlan: { … },` before the closing `};`. Immediately after the `financialPlan` entry, add representative Omega-shaped mock values so the dev harness renders the tab fully:

```ts
  firmographics: {
    revenueBand: '$10M-$50M', employeeBand: '201-1000', industryNaics: '541511', industrySic: '7372',
    foundedYear: 1998, website: 'omega-inc.example.com', hq: 'CA, US', linkedinFollowers: 48200,
    techStack: ['Salesforce', 'AWS', 'Snowflake', 'Workday'], asOf: 'Jul 2026',
  },
  governance: {
    boardSize: 11, ceoTenureYears: 6, boardAvgTenureYears: 7, governanceRating: 'Adequate',
    keyDirector: 'Morgan Ellery', interlockCount: 3, execTurnover: false, recentEventDate: 'Apr 2026', asOf: 'Jul 2026',
  },
  esg: {
    overall: 6.3, environmental: 5.8, social: 6.9, governance: 6.1, rating: 'BBB',
    carbonIntensity: 142.5, controversyCount: 1, topControversy: 'Labor Management', ratingChangeDirection: 'Upgrade', asOf: 'Jul 2026',
  },
  secFilings: [{
    filingType: '10-Q',
    sections: [
      { id: 'sec0', section: 'Part 1 - Management Discussion and Analysis', text: 'Revenue grew 8% year over year driven by expansion in the commercial segment. Operating margins remained stable amid disciplined cost management.' },
      { id: 'sec1', section: 'Part 2 - Risk Factors', text: 'Macroeconomic conditions and interest-rate volatility present ongoing risk to the loan portfolio and net interest margin.' },
    ],
  }],
```

- [ ] **Step 6: Build + lint**

Run: `npm run build && npm run lint`
Expected: BOTH green (the Task 1 type error is now resolved; the new tab isn't rendered yet, that's Task 3).

- [ ] **Step 7: Commit**

```bash
git add src/personas/customer/full360DataReal.ts src/personas/customer/full360Data.ts
git commit -m "feat(react-headless): wire ZoomInfo/BoardEx/MSCI/SEC into Commercial 360 fetchers"
```

---

### Task 3: Company Intel tab renderer

**Files:**
- Modify: `src/personas/customer/Full360Tabs.tsx`

**Interfaces:**
- Consumes: `Full360` with `firmographics`/`governance`/`esg`/`secFilings` (Task 1+2); `GlassCard` from `@shared`; the module-local `sub` style and `cur`/`curC` helpers already defined in this file.
- Produces: `CompanyIntelTab` component + `'Company Intel'` entry in `FULL_TABS`.

- [ ] **Step 1: Add the tab to `FULL_TABS`**

Change the `FULL_TABS` array (currently line 25) to insert `'Company Intel'` immediately after `'Property'`:

```ts
export const FULL_TABS = ['Overview', 'Details', 'Journey', 'Money', 'Property', 'Company Intel', 'Engagement', 'Cases', 'Opportunities', 'Campaigns', 'Notes', 'Tearsheet'] as const;
```

- [ ] **Step 2: Add the switch case**

In `Full360Tabs`'s `switch (tab)`, immediately after the `case 'Property':` return, add:

```ts
    case 'Company Intel':
      return <CompanyIntelTab full={full} />;
```

- [ ] **Step 3: Add the `CompanyIntelTab` component**

Insert this component immediately AFTER the `PropertyTab` function (after its closing `}` near line 215) and before the `EngagementTab`:

```tsx
/* ---------- Company Intel (ZoomInfo / BoardEx / MSCI / SEC) ---------- */
function CompanyIntelTab({ full }: { full: Full360 }) {
  const { firmographics: fg, governance: gv, esg, secFilings } = full;
  if (!fg && !gv && !esg && secFilings.length === 0) {
    return (
      <GlassCard title="Company Intel">
        <p style={{ color: 'var(--wp-text-muted)', fontSize: '0.88rem', margin: 0 }}>
          No corporate-intelligence data on file for this client. (Available for business accounts.)
        </p>
      </GlassCard>
    );
  }
  const fact = (k: string, v: string) => (
    <div key={k}>
      <div style={{ fontSize: '0.7rem', color: 'var(--wp-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</div>
      <div style={{ fontSize: '1.02rem', fontWeight: 800, marginTop: 2 }}>{v}</div>
    </div>
  );
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' };
  const esgBar = (label: string, val: number) => (
    <div key={label} style={{ display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
        <span style={{ color: 'var(--wp-text-muted)' }}>{label}</span>
        <span style={{ fontWeight: 700 }}>{val.toFixed(1)}</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'var(--wp-border)' }}>
        <div style={{ width: `${Math.min(100, (val / 10) * 100)}%`, height: '100%', borderRadius: 999, background: 'var(--wp-accent)' }} />
      </div>
    </div>
  );
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {fg && (
        <GlassCard title="Firmographics" action={<span style={sub}>ZoomInfo · {fg.asOf}</span>}>
          <div style={grid}>
            {fact('Revenue Band', fg.revenueBand)}
            {fact('Employees', fg.employeeBand)}
            {fact('Founded', fg.foundedYear ? String(fg.foundedYear) : '—')}
            {fact('Industry (NAICS)', fg.industryNaics)}
            {fact('Website', fg.website)}
            {fact('HQ', fg.hq)}
            {fact('LinkedIn Followers', fg.linkedinFollowers ? fg.linkedinFollowers.toLocaleString() : '—')}
          </div>
          {fg.techStack.length > 0 && (
            <div style={{ marginTop: '0.9rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {fg.techStack.map(t => (
                <span key={t} style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--wp-accent)', background: 'color-mix(in srgb, var(--wp-accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--wp-accent) 34%, transparent)', borderRadius: 999, padding: '0.15rem 0.65rem' }}>{t}</span>
              ))}
            </div>
          )}
        </GlassCard>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem' }}>
        {gv && (
          <GlassCard title="Board & Governance" action={<span style={sub}>BoardEx · {gv.asOf}</span>}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.85rem' }}>
              {fact('Board Size', String(gv.boardSize))}
              {fact('CEO Tenure', `${gv.ceoTenureYears} yrs`)}
              {fact('Avg Board Tenure', `${gv.boardAvgTenureYears} yrs`)}
              {fact('Governance', gv.governanceRating)}
              {fact('Key Director', gv.keyDirector)}
              {fact('Interlocks', String(gv.interlockCount))}
            </div>
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.82rem', color: gv.execTurnover ? 'var(--wp-warn)' : 'var(--wp-text-muted)' }}>
              {gv.execTurnover ? '⚠ Recent executive turnover flagged' : 'No recent executive turnover'} · last governance event {gv.recentEventDate}
            </p>
          </GlassCard>
        )}
        {esg && (
          <GlassCard title="ESG Profile" action={<span style={sub}>MSCI · {esg.rating}{esg.ratingChangeDirection !== '—' ? ` (${esg.ratingChangeDirection})` : ''}</span>}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '2.2rem', fontWeight: 800 }}>{esg.overall.toFixed(1)}</span>
              <span style={{ color: 'var(--wp-text-muted)', fontSize: '0.85rem' }}>/ 10 overall</span>
            </div>
            <div style={{ display: 'grid', gap: '0.55rem' }}>
              {esgBar('Environmental', esg.environmental)}
              {esgBar('Social', esg.social)}
              {esgBar('Governance', esg.governance)}
            </div>
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.8rem', color: 'var(--wp-text-muted)' }}>
              Carbon intensity {esg.carbonIntensity} t/$M rev · {esg.controversyCount} controversy flag{esg.controversyCount === 1 ? '' : 's'}{esg.controversyCount > 0 ? ` (top: ${esg.topControversy})` : ''}
            </p>
          </GlassCard>
        )}
      </div>
      {secFilings.length > 0 && (
        <GlassCard title="SEC Filings" action={<span style={sub}>{secFilings.map(f => f.filingType).join(', ')}</span>}>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {secFilings.map(f => (
              <div key={f.filingType}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, marginBottom: '0.5rem' }}>{f.filingType}</div>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {f.sections.map(s => (
                    <details key={s.id} style={{ background: 'var(--wp-surface-glass)', border: '1px solid var(--wp-border)', borderRadius: 'var(--wp-radius-sm)', padding: '0.6rem 0.85rem' }}>
                      <summary style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>{s.section}</summary>
                      {s.text && <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: 'var(--wp-text-muted)', lineHeight: 1.55 }}>{s.text}</p>}
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Build + lint**

Run: `npm run build && npm run lint`
Expected: BOTH green. (`React.CSSProperties` is already used elsewhere in this file, so the `React` type is in scope; no new import needed.)

- [ ] **Step 5: Commit**

```bash
git add src/personas/customer/Full360Tabs.tsx
git commit -m "feat(react-headless): add Company Intel tab to Commercial 360"
```

---

### Task 4: Delinquency Watch on the Commercial home

**Files:**
- Modify: `src/home/homeTypes.ts`
- Modify: `src/home/homeDataReal.ts`
- Modify: `src/home/homeData.ts`
- Modify: `src/home/HomePage.tsx`

**Interfaces:**
- Consumes: existing `HomeDashboard` type, `queryDataCloud`, `GlassCard`, `formatValue`.
- Produces: `DelinquencyWatch` interface + `delinquency: DelinquencyWatch | null` field on `HomeDashboard`; a render-if-present panel in `HomePage`.

- [ ] **Step 1: Add the type in `homeTypes.ts`**

Insert immediately BEFORE the `export interface HomeDashboard {` block:

```ts
/** Book-level loan delinquency aggregate (NOT client-joinable — a book metric). */
export interface DelinquencyWatch {
  totalDelinquentBalance: number;
  totalRecovered: number;
  byStatus: { status: string; count: number; balance: number }[];
  asOf: string;
}
```

Then add this field to the `HomeDashboard` interface, immediately after `dataSourceCount: number;`:

```ts
  /** Book-level delinquency aggregate (null when not wired for this persona). */
  delinquency: DelinquencyWatch | null;
```

- [ ] **Step 2: Type-check to confirm the field is required**

Run: `npm run build`
Expected: FAILS — `homeDataReal.ts` and `homeData.ts` now error that their returned `HomeDashboard` is missing `delinquency`. Confirms wiring. (Steps 3-4 fix both.)

- [ ] **Step 3: Add the aggregate query + mapping in `homeDataReal.ts`**

In `homeDataReal.ts`, add the import of the new type — change the type import line to:

```ts
import type { HomeDashboard, CallItem, ScheduleItem, BankerGoal, PipelineItem, DelinquencyWatch } from './homeTypes';
```

Add this SQL constant immediately after the `CREDIT_RISK_SQL` template literal (after its closing backtick + `;`):

```ts
/* ── Data Cloud: book-level loan delinquency (NOT account-joinable —
   all rows belong to a synthetic loan book, so this is an aggregate metric). */
const DELINQUENCY_SQL = `
  SELECT delinquency_status__c AS status, COUNT(uniqueid__c) AS cnt,
         SUM(loan_balance__c) AS balance, SUM(recovered_amount__c) AS recovered
  FROM Loan_Delinquencies__dlm
  WHERE delinquency_status__c IS NOT NULL
  GROUP BY delinquency_status__c
  ORDER BY SUM(loan_balance__c) DESC
`;
interface DelinqRow { status: string; cnt: number; balance: number; recovered: number; }
```

In `fetchHomeDashboardReal`, extend the opening `Promise.all` to fetch delinquency alongside the existing calls. Change:

```ts
  const [core, credit] = await Promise.all([
    executeGraphQL<CoreShape>(HOME_CORE_QUERY),
    queryDataCloud<CreditRow>(CREDIT_RISK_SQL, 8),
  ]);
```
to:
```ts
  const [core, credit, delinq] = await Promise.all([
    executeGraphQL<CoreShape>(HOME_CORE_QUERY),
    queryDataCloud<CreditRow>(CREDIT_RISK_SQL, 8),
    queryDataCloud<DelinqRow>(DELINQUENCY_SQL, 20).catch(() => ({ rows: [] as DelinqRow[] })),
  ]);
```

Immediately before the final `return {` in `fetchHomeDashboardReal`, add:

```ts
  const delinqRows = delinq.rows ?? [];
  const delinquency: DelinquencyWatch | null = delinqRows.length ? {
    totalDelinquentBalance: delinqRows.reduce((s, r) => s + Number(r.balance || 0), 0),
    totalRecovered: delinqRows.reduce((s, r) => s + Number(r.recovered || 0), 0),
    byStatus: delinqRows.map(r => ({ status: String(r.status || '—'), count: Math.round(Number(r.cnt || 0)), balance: Number(r.balance || 0) })),
    asOf: 'Latest',
  } : null;
```

Add `delinquency,` to the returned object — insert it immediately after the `leads: [ … ],` entry (the last property before the closing `};`):

```ts
    leads: [],
    delinquency,
  };
```

- [ ] **Step 4: Add the mock in `homeData.ts`**

In `homeData.ts`, the `DASH` object ends with a set of properties before `};`. Add a `delinquency` mock as the last property of `DASH` (immediately before the closing `};` of the `DASH` object literal):

```ts
  delinquency: {
    totalDelinquentBalance: 4820000,
    totalRecovered: 1130000,
    byStatus: [
      { status: '90 days late', count: 38, balance: 2740000 },
      { status: '60 days late', count: 71, balance: 1520000 },
      { status: '30 days late', count: 96, balance: 560000 },
    ],
    asOf: 'Latest',
  },
```

- [ ] **Step 5: Render the panel in `HomePage.tsx`**

Add `DelinquencyWatch` is NOT needed as an explicit import (it's read off `data`). Insert a render-if-present panel. Place it immediately AFTER the "Life events across your book" `GlassCard` block and BEFORE the `{/* Pipeline + alerts + leads */}` comment:

```tsx
      {/* Loan delinquency watch (book-level aggregate) */}
      {data.delinquency && (
        <GlassCard title="Delinquency Watch" action={<span style={{ fontSize: '0.72rem', color: 'var(--wp-text-faint)' }}>Book-level · loan portfolio</span>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1.5rem', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--wp-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Delinquent Balance</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--wp-neg)' }}>{formatValue(data.delinquency.totalDelinquentBalance, 'currencyCompact')}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--wp-text-muted)', marginTop: 2 }}>{formatValue(data.delinquency.totalRecovered, 'currencyCompact')} recovered</div>
            </div>
            <div style={{ display: 'grid', gap: '0.55rem' }}>
              {data.delinquency.byStatus.map(b => (
                <div key={b.status} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: '0.75rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--wp-text-muted)' }}>{b.status}</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{b.count} loans</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, textAlign: 'right' }}>{formatValue(b.balance, 'currencyCompact')}</span>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      )}
```

- [ ] **Step 6: Build + lint**

Run: `npm run build && npm run lint`
Expected: BOTH green.

- [ ] **Step 7: Commit**

```bash
git add src/home/homeTypes.ts src/home/homeDataReal.ts src/home/homeData.ts src/home/HomePage.tsx
git commit -m "feat(react-headless): add book-level Delinquency Watch to Commercial home"
```

---

### Task 5: Deploy + in-org verification

**Files:** none (deploy + verify only).

**Interfaces:** Consumes the built `dist/` from Tasks 2-4.

- [ ] **Step 1: Fresh production build**

Run: `npm run build`
Expected: green (`tsc -b && vite build` → `dist/`).

- [ ] **Step 2: Deploy ReactCommercial (content-only; metadata unchanged → plain redeploy, no delete)**

From the SFDX project root (`/Users/jsifontes/Documents/Git/JDO/.worktrees/react-headless-agentforce/React-Headless`):
```bash
sf project deploy start --source-dir force-app/main/default/uiBundles/ReactCommercial -o jdo-1lrnov --json
```
Expected: parse the JSON — `result.status` = `Succeeded`, `result.numberComponentErrors` = `0`. If token/network fails, re-auth (`sf org open -o jdo-1lrnov --path / --url-only`) and retry.

- [ ] **Step 3: Verify Company Intel tab in-org (Omega business account)**

Bundle JS caches hard on the app domain — append a cache-bust query (`?cb=<n>`) to the URL. Use `browser_evaluate` (App Domain screenshots time out on the blocked Google-Fonts stylesheet, so read text, don't screenshot):
- Navigate: `https://storm-16a17dc388fbe6--c.demo.my.salesforce.app/app/c__ReactCommercial/client/001am00000qvjs6AAA?cb=1`
- Click the "Company Intel" tab, then read `document.body.innerText`.
- Expected: firmographics ($10M–$50M revenue band, employee band), governance (board size 11, "Adequate"), ESG (overall score + BBB-ish rating), and at least one SEC 10-Q section. NO "No corporate-intelligence data" empty state.

- [ ] **Step 4: Verify Delinquency Watch on the Commercial home**

- Navigate: `https://storm-16a17dc388fbe6--c.demo.my.salesforce.app/app/c__ReactCommercial?cb=1`
- Read `document.body.innerText`.
- Expected: a "Delinquency Watch" panel with a delinquent balance and status breakdown (90/60/30 days late). No stuck "Loading your book…".

- [ ] **Step 5: Verify graceful empty state (retail account has no business data)**

- Navigate: `https://storm-16a17dc388fbe6--c.demo.my.salesforce.app/app/c__ReactCommercial/client/001am00000qvjsAAAQ?cb=1` (Julie), click "Company Intel".
- Expected: the "No corporate-intelligence data on file" empty state renders (no crash, no stuck loader).

- [ ] **Step 6: Final verification note**

No commit here (deploy only). Record the in-org verification result (what rendered on Omega + home + Julie empty state) in the completion summary.

---

## Self-Review

**1. Spec coverage:**
- ZoomInfo firmographics → Task 1 (type), Task 2 (query+map+mock), Task 3 (render). ✅
- BoardEx exec intel → same. ✅
- MSCI ESG → same. ✅
- SEC filings → same. ✅
- Loan delinquency (book aggregate on home) → Task 4. ✅
- One "Company Intel" tab folding all four corporate signals → Task 3. ✅
- ReactCommercial-only scope → Global Constraints + every task path. ✅
- Null-safe / graceful empty states → Global Constraints + Task 3 empty state + Task 5 Step 5 verify. ✅
- Deliberately-excluded gaps (Retail/Wealth, per-holding ESG, Agentforce history, Moody's/Esri) → not in any task. ✅

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to". Every code step shows full code. The `.catch(() => ({ rows: [] }))` on the delinquency query is real defensive code (delinquency is optional/best-effort), not a placeholder.

**3. Type consistency:**
- `Firmographics`/`Governance`/`EsgProfile`/`SecFiling` field names defined in Task 1 match exactly what Task 2 constructs and Task 3 reads (`firmographics.revenueBand`, `governance.boardSize`, `esg.overall`, `secFilings[].sections[].section`). ✅
- `DelinquencyWatch` fields (`totalDelinquentBalance`/`totalRecovered`/`byStatus[{status,count,balance}]`/`asOf`) defined in Task 4 Step 1 match the mapping (Step 3), mock (Step 4), and render (Step 5). ✅
- `Full360` gains exactly `firmographics/governance/esg/secFilings`; both fetchers return exactly those. ✅
- `HomeDashboard` gains exactly `delinquency`; both fetchers return it. ✅

No issues found.
