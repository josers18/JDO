import {
  GlassCard,
  DataTable,
  Sparkline,
  AreaChart,
  DonutChart,
  RelationshipMap,
  Timeline,
  formatValue,
  type TableColumn,
} from '@shared';
import type {
  Full360, FinAccount, Transaction, Trade, Interaction, CaseRow, Opportunity, Campaign,
} from './full360Types';
import type { Customer360, Customer360Detail } from './customerTypes';
import { DetailsPanel } from './DetailsPanel';
import { TearsheetBuilder } from './TearsheetBuilder';
import { JourneyGoals } from './JourneyGoals';

const cur = (n: number) => formatValue(n, 'currency');
const curC = (n: number) => formatValue(n, 'currencyCompact');
const SENT = { positive: 'var(--wp-pos)', neutral: 'var(--wp-text-faint)', negative: 'var(--wp-neg)' };
const PRI = { High: 'var(--wp-neg)', Medium: 'var(--wp-warn)', Low: 'var(--wp-text-faint)' };

export const FULL_TABS = ['Overview', 'Details', 'Journey', 'Money', 'Property', 'Company Intel', 'Engagement', 'Cases', 'Opportunities', 'Campaigns', 'Notes', 'Tearsheet'] as const;
export type FullTab = (typeof FULL_TABS)[number];

/**
 * Renders the active tab's content for the full Customer 360. Each tab fuses the
 * §3b content areas; the profile-widget tabs (AI Signals/Portfolio/etc.) are
 * distributed as info bits inside these.
 */
export function Full360Tabs({
  tab, full, customer, detail,
}: {
  tab: FullTab; full: Full360; customer: Customer360; detail: Customer360Detail;
}) {
  switch (tab) {
    case 'Overview':
      return <OverviewTab customer={customer} detail={detail} />;
    case 'Details':
      return <GlassCard title="Details"><DetailsPanel fields={full.details} /></GlassCard>;
    case 'Journey':
      return <JourneyTab full={full} detail={detail} />;
    case 'Money':
      return <MoneyTab full={full} />;
    case 'Property':
      return <PropertyTab full={full} />;
    case 'Company Intel':
      return <CompanyIntelTab full={full} />;
    case 'Engagement':
      return <EngagementTab full={full} />;
    case 'Cases':
      return <CasesTab full={full} />;
    case 'Opportunities':
      return <OppsTab full={full} />;
    case 'Campaigns':
      return <CampaignsTab full={full} />;
    case 'Notes':
      return <NotesTab full={full} />;
    case 'Tearsheet':
      return <GlassCard title="Tearsheet Builder"><TearsheetBuilder data={full} clientName={customer.name} /></GlassCard>;
    default:
      return null;
  }
}

/* ---------- Overview: curated summary (no nested tabs) ---------- */
function OverviewTab({ customer, detail }: { customer: Customer360; detail: Customer360Detail }) {
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem' }}>
        <GlassCard title="Relationship Map">
          <RelationshipMap centerLabel={customer.photoInitials} nodes={detail.network} width={460} height={270} />
        </GlassCard>
        <GlassCard title="Relationship Timeline">
          <Timeline events={detail.timeline} />
        </GlassCard>
      </div>
      <GlassCard title="Assets & Momentum">
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <DonutChart slices={detail.productMix} centerValue={curC(customer.money.reduce((s, m) => s + Math.abs(m.amount), 0))} centerLabel="Total" />
          <div style={{ flex: 1, minWidth: 280 }}>
            <AreaChart series={detail.aumTrend} startLabel="Jan" endLabel="Today" width={480} />
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

/* ---------- Money: accounts + transactions + trades ---------- */
function MoneyTab({ full }: { full: Full360 }) {
  const accCols: TableColumn<FinAccount>[] = [
    { key: 'name', header: 'Account' },
    { key: 'type', header: 'Type' },
    { key: 'number', header: 'Number' },
    { key: 'status', header: 'Status' },
    { key: 'balance', header: 'Balance', align: 'right', render: r => <span style={{ color: r.balance < 0 ? 'var(--wp-neg)' : 'var(--wp-text)' }}>{cur(r.balance)}</span> },
  ];
  const txCols: TableColumn<Transaction>[] = [
    { key: 'date', header: 'Date' },
    { key: 'description', header: 'Description' },
    { key: 'category', header: 'Category' },
    { key: 'account', header: 'Account' },
    { key: 'amount', header: 'Amount', align: 'right', render: r => <span style={{ color: r.amount < 0 ? 'var(--wp-neg)' : 'var(--wp-pos)' }}>{r.amount < 0 ? '' : '+'}{cur(r.amount)}</span> },
  ];
  const trCols: TableColumn<Trade>[] = [
    { key: 'date', header: 'Date' },
    { key: 'action', header: 'Action', render: r => <span style={{ color: r.action === 'BUY' ? 'var(--wp-pos)' : 'var(--wp-neg)', fontWeight: 700 }}>{r.action}</span> },
    { key: 'symbol', header: 'Symbol' },
    { key: 'name', header: 'Name' },
    { key: 'shares', header: 'Shares', align: 'right', render: r => r.shares.toLocaleString() },
    { key: 'amount', header: 'Amount', align: 'right', render: r => curC(r.amount) },
  ];
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <GlassCard title="Financial Accounts" action={<span style={sub}>{full.finAccounts.length} accounts</span>}>
        <DataTable columns={accCols} rows={full.finAccounts} getRowId={r => r.id} />
      </GlassCard>
      <GlassCard title="Financial Transactions" action={<span style={sub}>Recent</span>}>
        <DataTable columns={txCols} rows={full.transactions} getRowId={r => r.id} />
      </GlassCard>
      <GlassCard title="Financial Trades" action={<span style={sub}>Last 90 days</span>}>
        <DataTable columns={trCols} rows={full.trades} getRowId={r => r.id} />
      </GlassCard>
    </div>
  );
}

/* ---------- Journey & Goals + MoneyGuidePro financial plan ---------- */
function JourneyTab({ full, detail }: { full: Full360; detail: Customer360Detail }) {
  const plan = full.financialPlan;
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {plan && (
        <GlassCard
          title="Financial Plan"
          action={<span style={{ ...sub, color: /stale|overdue/i.test(plan.status) ? 'var(--wp-warn)' : 'var(--wp-pos)' }}>✦ MoneyGuidePro · {plan.status}</span>}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.85rem' }}>
            {[
              ['Total Goal', curC(plan.totalGoalAmount)],
              ['Goals', String(plan.goalCount)],
              ['Retirement Age', String(plan.retirementTargetAge)],
              ['Monthly Income Target', cur(plan.monthlyIncomeTarget)],
              ['Allocation', plan.recommendedAllocation],
              ['Next Review', plan.nextReviewDate],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: '0.7rem', color: 'var(--wp-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</div>
                <div style={{ fontSize: '0.98rem', fontWeight: 700, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
      <GlassCard title="Journey & Goals">
        <JourneyGoals journey={detail.journey} goals={detail.goalRings} />
      </GlassCard>
    </div>
  );
}

/* ---------- Property (CoreLogic) ---------- */
function PropertyTab({ full }: { full: Full360 }) {
  const p = full.property;
  if (!p) {
    return <GlassCard title="Property"><p style={{ color: 'var(--wp-text-muted)', fontSize: '0.88rem', margin: 0 }}>No property data on file for this client.</p></GlassCard>;
  }
  const riskColor = (n: number) => (n >= 66 ? 'var(--wp-neg)' : n >= 33 ? 'var(--wp-warn)' : 'var(--wp-pos)');
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <GlassCard title="Property Value & Equity" action={<span style={sub}>CoreLogic · {p.asOf}</span>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
          {[
            ['Estimated Value', cur(p.estimatedValue)],
            ['Home Equity', cur(p.equity)],
            ['Mortgage Balance', cur(p.mortgageBalance)],
            ['Property Type', p.propertyType],
            ['Owner-Occupied', p.isOwner ? 'Yes' : 'No'],
          ].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: '0.7rem', color: 'var(--wp-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      </GlassCard>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem' }}>
        <GlassCard title="HELOC Opportunity" action={<span style={sub}>✦ lending signal</span>}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            <span style={{ fontSize: '2.4rem', fontWeight: 800, color: p.helocOpportunityScore >= 66 ? 'var(--wp-pos)' : 'var(--wp-text)' }}>{p.helocOpportunityScore}</span>
            <span style={{ color: 'var(--wp-text-muted)', fontSize: '0.85rem' }}>/ 100 propensity</span>
          </div>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: 'var(--wp-text-muted)', lineHeight: 1.5 }}>
            {p.helocOpportunityScore >= 66
              ? `Strong HELOC candidate — ${cur(p.equity)} in tappable equity with ${p.mortgageBalance === 0 ? 'no outstanding mortgage' : cur(p.mortgageBalance) + ' remaining'}.`
              : 'Moderate HELOC fit based on current equity and property profile.'}
          </p>
        </GlassCard>
        <GlassCard title="Property Risk">
          <div style={{ display: 'grid', gap: '0.7rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--wp-text-muted)' }}>Flood Zone</span>
              <span style={{ fontWeight: 700 }}>{p.floodZone}{p.floodZone === 'X' ? ' (minimal)' : ''}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--wp-text-muted)' }}>Wildfire Risk</span>
              <span style={{ fontWeight: 700, color: riskColor(p.wildfireRiskScore) }}>{p.wildfireRiskScore} / 100</span>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

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

/* ---------- Engagement: interactions + call summaries + CSAT/NPS ---------- */
function EngagementTab({ full }: { full: Full360 }) {
  const { csatNps } = full;
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem' }}>
        <GlassCard title="CSAT">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800 }}>{csatNps.csatScore}</span>
            <span style={{ color: 'var(--wp-text-muted)', fontSize: '0.85rem' }}>/ 100</span>
          </div>
          <Sparkline points={csatNps.csatTrend} width={240} height={40} />
        </GlassCard>
        <GlassCard title="NPS">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800 }}>{csatNps.npsScore}</span>
            <span style={{ color: 'var(--wp-text-muted)', fontSize: '0.85rem' }}>promoter-leaning</span>
          </div>
          <Sparkline points={csatNps.npsTrend} width={240} height={40} />
        </GlassCard>
      </div>
      <GlassCard title="Interactions & Engagements">
        <ul style={list}>
          {full.interactions.map((i: Interaction, idx) => (
            <li key={i.id} style={{ ...row, borderTop: idx === 0 ? 'none' : '1px solid var(--wp-border-strong)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: SENT[i.sentiment], marginTop: 6 }} />
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem' }}>{i.type} · {i.channel}</span>
                <span style={{ display: 'block', color: 'var(--wp-text-muted)', fontSize: '0.82rem' }}>{i.summary}</span>
              </span>
              <span style={sub}>{i.when}</span>
            </li>
          ))}
        </ul>
      </GlassCard>
      <GlassCard title="Call Summaries" action={<span style={sub}>✦ Agentforce-generated</span>}>
        <div style={{ display: 'grid', gap: '0.85rem' }}>
          {full.callSummaries.map(c => (
            <div key={c.id} style={{ padding: '0.75rem 0.9rem', background: 'var(--wp-surface-raised)', borderRadius: 'var(--wp-radius-sm)', border: '1px solid var(--wp-border-strong)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{c.channel} · {c.date} · {c.duration}</span>
                <span style={{ fontSize: '0.72rem', color: SENT[c.sentiment], fontWeight: 700, textTransform: 'uppercase' }}>{c.sentiment}</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.5, color: 'var(--wp-text-muted)' }}>{c.summary}</p>
            </div>
          ))}
        </div>
      </GlassCard>
      <GlassCard title="Recent Survey Verbatims">
        <ul style={list}>
          {csatNps.recent.map((s, idx) => (
            <li key={s.id} style={{ ...row, borderTop: idx === 0 ? 'none' : '1px solid var(--wp-border-strong)' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--wp-accent)', width: 44 }}>{s.type} {s.score}</span>
              <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--wp-text-muted)', fontStyle: 'italic' }}>“{s.verbatim}”</span>
              <span style={sub}>{s.when}</span>
            </li>
          ))}
        </ul>
      </GlassCard>
    </div>
  );
}

/* ---------- Cases ---------- */
function CasesTab({ full }: { full: Full360 }) {
  const cols: TableColumn<CaseRow>[] = [
    { key: 'number', header: 'Case #' },
    { key: 'subject', header: 'Subject' },
    { key: 'priority', header: 'Priority', render: r => <span style={{ color: PRI[r.priority], fontWeight: 700 }}>{r.priority}</span> },
    { key: 'status', header: 'Status' },
    { key: 'opened', header: 'Opened', align: 'right' },
  ];
  return <GlassCard title="Cases" action={<span style={sub}>{full.cases.length} total</span>}><DataTable columns={cols} rows={full.cases} getRowId={r => r.id} /></GlassCard>;
}

/* ---------- Opportunities ---------- */
function OppsTab({ full }: { full: Full360 }) {
  const cols: TableColumn<Opportunity>[] = [
    { key: 'name', header: 'Opportunity' },
    { key: 'stage', header: 'Stage' },
    { key: 'amount', header: 'Amount', align: 'right', render: r => curC(r.amount) },
    { key: 'probability', header: 'Prob.', align: 'right', render: r => `${Math.round(r.probability * 100)}%` },
    { key: 'closeDate', header: 'Close', align: 'right' },
  ];
  return <GlassCard title="Opportunities" action={<span style={sub}>{full.opportunities.length} open</span>}><DataTable columns={cols} rows={full.opportunities} getRowId={r => r.id} /></GlassCard>;
}

/* ---------- Campaigns ---------- */
function CampaignsTab({ full }: { full: Full360 }) {
  const cols: TableColumn<Campaign>[] = [
    { key: 'name', header: 'Campaign' },
    { key: 'type', header: 'Type' },
    { key: 'status', header: 'Status' },
    { key: 'responded', header: 'Responded', render: r => <span style={{ color: r.responded ? 'var(--wp-pos)' : 'var(--wp-text-faint)', fontWeight: 700 }}>{r.responded ? 'Yes' : '—'}</span> },
    { key: 'memberSince', header: 'Since', align: 'right' },
  ];
  return <GlassCard title="Campaigns" action={<span style={sub}>{full.campaigns.length} memberships</span>}><DataTable columns={cols} rows={full.campaigns} getRowId={r => r.id} /></GlassCard>;
}

/* ---------- Notes: meeting notes + KYC ---------- */
function NotesTab({ full }: { full: Full360 }) {
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <GlassCard title="Meeting Notes">
        <div style={{ display: 'grid', gap: '0.85rem' }}>
          {full.meetingNotes.map(n => (
            <div key={n.id} style={{ padding: '0.8rem 0.95rem', background: 'var(--wp-surface-raised)', borderRadius: 'var(--wp-radius-sm)', border: '1px solid var(--wp-border-strong)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{n.title}</span>
                <span style={sub}>{n.author} · {n.date}</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.5, color: 'var(--wp-text-muted)' }}>{n.body}</p>
            </div>
          ))}
        </div>
      </GlassCard>
      <GlassCard title="KYC Summary" action={<span style={{ ...sub, color: 'var(--wp-pos)' }}>● {full.kyc.status}</span>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.85rem' }}>
          {[['Status', full.kyc.status], ['Last Review', full.kyc.lastReview], ['Risk Rating', full.kyc.riskRating], ['AML Status', full.kyc.amlStatus]].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: '0.7rem', color: 'var(--wp-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</div>
              <div style={{ fontSize: '0.92rem', fontWeight: 600, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
        <p style={{ margin: '0.85rem 0 0', fontSize: '0.85rem', lineHeight: 1.5, color: 'var(--wp-text-muted)' }}>{full.kyc.notes}</p>
      </GlassCard>
    </div>
  );
}

const sub: React.CSSProperties = { fontSize: '0.72rem', color: 'var(--wp-text-faint)' };
const list: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0' };
const row: React.CSSProperties = { display: 'flex', gap: '0.7rem', alignItems: 'flex-start', padding: '0.6rem 0' };
