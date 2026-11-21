import { AtlasBookBrief } from '@shared/components/atlas/AtlasBookBrief';
import { AtlasActionReview } from '@shared/components/atlas/AtlasActionReview';
import { atlasChartColors } from '@shared/components/atlas/atlasChartColors';
import '../../../../../../../docs/design-studies/2026-11-12-directions/wealth-atlas.css';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { orderRetailStages } from '@shared/components/atlas/atlasPipelineData';
import { fetchNetFlow } from '@shared/data/kpiTrend';
import { buildPriorityQueue, type QueueSignalItem } from '@shared/data/priorityQueue';
import { bookNames, field, label, numeric, readPipelineAmount, readSource, type Row } from './retailData';
import { TodaySignalBand } from './retailWatch';
import { AccountLink, CardIcon, compact, count, date, Facts, initials, RecordLink, relationship, SourceNotice, text, Title, useCrmList, useSource, useWorkspace } from './retailUi';

function usePriorities(ownerId: string) {
  return useSource(`priorities:${ownerId}`, async () => {
    const [risk, browsing, inflows, liquor] = await Promise.allSettled([
      readSource('who', ownerId), readSource('browsing', ownerId), readSource('inflows', ownerId), readSource('liquidity', ownerId),
    ]);
    if (risk.status === 'rejected' && browsing.status === 'rejected') throw risk.reason;
    const who = risk.status === 'fulfilled' ? risk.value.rows : [];
    const visitors = browsing.status === 'fulfilled' ? browsing.value.rows : [];
    const inflowRows = inflows.status === 'fulfilled' ? inflows.value.rows : [];
    const liquidRows = liquor.status === 'fulfilled' ? liquor.value.rows.map(row => ({ ...row, account_id: row.person_account_id__c })) : [];
    const names = await bookNames(ownerId, [...who, ...visitors, ...inflowRows, ...liquidRows]).catch(() => new Map<string, string>());
    const priority = (row: Row): QueueSignalItem => {
      const id = text(row.account_id, '');
      const satisfaction = numeric(row.csat);
      const drivers = [
        { label: 'Customer satisfaction', points: satisfaction == null ? 0 : 0.3 * (70 - satisfaction) / 50, tone: 'risk' },
        { label: 'Call sentiment', points: 0.3 * (numeric(row.deal_risk) ?? 0) / 100, tone: 'risk' },
        { label: 'Financial stress', points: 0.25 * (numeric(row.months_high) ?? 0) / 6, tone: 'risk' },
        { label: 'Eligible offer', points: 0.15 * Math.min(1, (numeric(row.conv) ?? 0) / 50), tone: 'opportunity' },
      ] as const;
      const score = Math.min(1, Math.max(0, numeric(row.score) ?? 0));
      return {
        id: `risk:${id}`, clientId: names.has(id) ? id : '', clientName: names.get(id) ?? id, segment: 'Relationship support',
        reason: [satisfaction != null && `CSAT ${satisfaction.toLocaleString('en-US', { maximumFractionDigits: 1 })}/100`,
          row.sentiment && text(row.sentiment), row.months_high != null && `${row.months_high} high-stress months`].filter(Boolean).join(' · '),
        action: 'Prepare a relationship check-in', score, severity: score >= .45 ? 'high' : 'medium',
        source: 'Who to call · Data 360', relationshipValue: 0, drivers: drivers.filter(driver => driver.points > 0),
      };
    };
    const allVisitors: QueueSignalItem[] = visitors.flatMap(row => {
      const id = text(row.account_id, '');
      const when = Date.parse(text(row.last_ts, ''));
      const views = numeric(row.views) ?? 0;
      if (views < 3 || !Number.isFinite(when) || Date.now() - when > 14 * 86_400_000 || when > Date.now()) return [];
      const product = text(row.url, '').split('?')[0].split('/').slice(-1)[0]?.replace(/-/g, ' ') ?? 'product';
      return [{
        id: `browse:${id}:${product}`, clientId: names.has(id) ? id : '', clientName: names.get(id) ?? id, segment: 'Product interest',
        reason: `${views} recognized product-page loads · ${date(row.last_ts)}`, action: `Follow up on ${product} interest`,
        score: Math.min(.7, .3 + views / 30), severity: 'medium', source: 'Recognized website browsing', relationshipValue: 0,
      } satisfies QueueSignalItem];
    });
    const other: QueueSignalItem[] = [
      ...inflowRows.map(row => ({ row, kind: 'inflow' } as const)),
      ...liquidRows.map(row => ({ row: row as Row, kind: 'liquidity' } as const)),
    ].flatMap(({ row, kind }) => {
      const id = text(row.account_id, '');
      const name = names.get(id);
      if (!name) return [];
      const inflow = kind === 'inflow';
      const amount = numeric(row.amount) ?? 0;
      return [{
        id: `${kind}:${id}`, clientId: id, clientName: name, segment: inflow ? 'Recent inflow' : 'Liquidity event',
        reason: inflow ? `${compact(amount)} qualifying credit · ${date(row.tx_date)}` : `Employer departure detected ${date(row.detected_date__c)}`,
        action: inflow ? 'Review savings and cash needs' : 'Prepare a liquidity conversation',
        score: inflow ? Math.min(.95, .5 + amount / 100_000) : Math.min(.85, .5 + (numeric(row.opportunity_score__c) ?? 0) / 250),
        severity: inflow && amount >= 20_000 ? 'high' : 'medium', source: inflow ? 'Transactions' : 'UserGems',
        relationshipValue: 0, reserveSlot: !inflow,
      } satisfies QueueSignalItem];
    });
    const errors = [risk, browsing, inflows, liquor].flatMap((result, index) =>
      result.status === 'rejected' ? [['Who to call', 'Recognized browsing', 'Recent inflows', 'Liquidity events'][index]] : []);
    return { risk: who.map(priority).filter(row => row.clientId), visitors: allVisitors.filter(row => row.clientId), other,
      warning: errors.length ? `Sources unavailable: ${errors.join(', ')}.` : null };
  });
}

export default function RetailToday({ ownerId }: { ownerId: string }) {
  const { open } = useWorkspace();
  const risks = usePriorities(ownerId);
  const summary = useSource(`summary:${ownerId}`, () => readSource('summary', ownerId));
  const flow = useSource(`flow:${ownerId}`, () => fetchNetFlow(ownerId, 'Personal', true));
  const pipeline = useSource(`pipeline:${ownerId}`, () => readPipelineAmount(ownerId));
  const tasks = useCrmList('Task', ownerId, { count: 8 });
  const cases = useCrmList('Case', ownerId, { count: 8 });
  const leads = useCrmList('Lead', ownerId, { count: 3 });
  const stress = useSource(`stress:${ownerId}`, () => readSource('stressTotal', ownerId));
  const deposits = useSource(`outside-deposits:${ownerId}`, () => readSource('depositTotal', ownerId));
  const events = useCrmList('PersonLifeEvent', ownerId, { count: 2 });
  const opportunities = useCrmList('Opportunity', ownerId, { count: 5 });
  const [snoozed, setSnoozed] = useState<string[]>([]);
  const [tier, setTier] = useState('all');
  const [selection, setSelection] = useState('');
  const latest = flow.data?.last;
  const first = [...(risks.data?.risk ?? []), ...(risks.data?.visitors ?? [])].find(row => !snoozed.includes(row.id) && row.clientId);
  const dateToday = new Date().toLocaleDateString('en-CA');
  const taskRows: QueueSignalItem[] = (tasks.data?.rows ?? []).flatMap(row => {
    const dueDate = label(row, 'ActivityDate', '');
    if (!dueDate || dueDate >= dateToday) return [];
    const client = relationship(row);
    const high = label(row, 'Priority') === 'High';
    return [{
      id: `task:${row.Id}`, clientId: client.id, clientName: client.name || label(row, 'Subject'), source: 'Overdue task',
      segment: 'Commitment', action: 'Complete overdue follow-up', reason: label(row, 'Subject'), dueDate, relationshipValue: 0,
      score: high ? .9 : .55, severity: high ? 'high' : 'medium',
    }];
  });
  const deals: QueueSignalItem[] = (opportunities.data?.rows ?? []).flatMap(row => {
    const client = relationship(row);
    const amount = numeric(field(row, 'Amount'));
    const probability = numeric(field(row, 'Probability'));
    if (!client.id || amount == null || probability == null) return [];
    const high = probability >= 70;
    return [{
      id: `opportunity:${row.Id}`, clientId: client.id, clientName: client.name || client.id,
      source: 'Open opportunity', segment: 'Pipeline', action: 'Review open opportunity',
      reason: `${label(row, 'Name')} · ${compact(amount)} · ${label(row, 'StageName')}`,
      dueDate: label(row, 'CloseDate', '') || undefined, relationshipValue: amount,
      score: Math.min(1, probability / 100 * .7 + Math.min(amount / 3_000_000, 1) * .3), severity: high ? 'high' : 'medium',
    }];
  });
  const all = buildPriorityQueue({
    primary: [...(risks.data?.risk ?? []), ...(risks.data?.visitors ?? []), ...(risks.data?.other ?? []), ...taskRows, ...deals].filter(row => !snoozed.includes(row.id)),
  });
  const filtered = all.filter(row => tier === 'all' || row.tier === tier);
  const selected = filtered.find(row => row.id === selection) ?? filtered[0];
  const snooze = (row: QueueSignalItem) => setSnoozed(values => [...new Set([...values, row.id])]);
  const prepare = (row: QueueSignalItem, kind: 'prep' | 'task' | 'meeting') =>
    open({ kind, id: row.clientId || undefined, name: row.clientName, subject: kind === 'meeting' ? 'Relationship check-in' : row.action, context: row.reason,
      onSaved: kind === 'task' ? tasks.retry : undefined });
  const show = (row: QueueSignalItem, quick = false) => open({
    kind: 'detail', title: quick ? `${row.clientName} — quick view` : `Why ${row.clientName}?`,
    children: <div className="pr-evidence">
      <span className="badge">{row.source}</span><h3>{row.action}</h3><p>{row.reason}</p>
      {row.drivers && <div className="pr-driver-list">{row.drivers.map(driver => <div key={driver.label} data-driver={driver.label}>
        <span>{driver.label}</span><i><b style={{ width: `${Math.min(100, driver.points * 100)}%` }} /></i>
        <strong>{(driver.points * 100).toFixed(1)} pts</strong>
      </div>)}</div>}
      <Facts values={[[ 'Priority score', `${(row.score * 100).toFixed(0)}/100` ], ['Act by', date(row.dueDate)]]} />
      {quick && <div className="pr-actions"><AccountLink id={row.clientId} /><button className="secondary" onClick={() => prepare(row, 'task')}>Prepare follow-up</button></div>}
    </div>,
  });
  return <>
    <div className="wa retail-advisory"><section className="wa-hero" aria-label="Your book at a glance">
      <div>
        <h1>Retail portfolio overview</h1>
        <h2 className="retail-brief-label">Your daily brief</h2>
        <AtlasBookBrief persona="retail" ownerId={ownerId} facts={[
          pipeline.data && `${count(pipeline.data.count)} open opportunities worth ${compact(pipeline.data.amount)}.`,
          tasks.data && `${count(tasks.data.totalCount)} open tasks.`,
          stress.data?.rows[0]?.persistent != null && `${count(stress.data.rows[0].persistent)} customers show persistent financial stress.`,
        ].filter(Boolean).join(' ')} />
        <div className="retail-pulse-heading"><div><h2>Portfolio pulse</h2><small>Money, attention and new business.</small></div><Link to="/health">Review book health →</Link></div>
        <div className="wa-pulse">
          <button className="wa-metric" onClick={() => open({ kind: 'detail', title: 'Weekly money movement', children: <div className="pr-evidence">
            <SourceNotice source={flow} empty={!flow.data?.weeks.length} />
            {flow.data?.weeks.map(week => <Facts key={week.week} values={[[ 'Week of', date(week.week) ], ['Credits', compact(week.credits)], ['Debits', compact(week.debits)], ['Net flow', compact(week.net)]]} />)}
          </div> })}><span>Weekly net flow</span><strong>{compact(latest?.net)}</strong><small>{latest ? `Week of ${date(latest.week)}` : 'Data 360'}</small></button>
          <button className="wa-metric" onClick={() => open({ kind: 'detail', title: 'Multiple risk signals', children: <><SourceNotice source={summary} warning={summary.data?.warning} />
            <Facts values={[[ 'Customers with multiple signals', count(summary.data?.rows[0]?.multi ?? (summary.data?.rows[0]?.clients === 0 ? 0 : null)) ], ['Customers scored', count(summary.data?.rows[0]?.clients)]]} /></> })}><span>Multiple risk signals</span><strong>{count(summary.data?.rows[0]?.multi ?? (summary.data?.rows[0]?.clients === 0 ? 0 : null))}</strong><small>{count(summary.data?.rows[0]?.clients)} scored customers</small></button>
          <Link className="wa-metric" to="/prospecting"><span>Open CRM leads</span><strong>{count(leads.data?.totalCount)}</strong><small>Salesforce CRM</small></Link>
        </div>
      </div>
      {first ? <aside aria-label="Suggested first outreach">
        <span className="wa-pill">Your first move · {first.segment}</span>
        <h2>{first.clientName}</h2>
        <p>{first.action}</p><small>{first.reason}</small>
        <small>{first.source} · Source evidence</small>
        <div className="wa-actions"><button className="primary" onClick={() => prepare(first, 'prep')}>Prep me</button>
          <AccountLink id={first.clientId} /><button className="secondary" onClick={() => prepare(first, 'meeting')}>Plan a call</button></div>
        <div className="retail-outreach-links"><button className="text-button" onClick={() => show(first)}>Why this outreach</button>
          <button className="text-button" onClick={() => show(first, true)}>Quick view</button>
          <button className="text-button" onClick={() => snooze(first)}>Snooze</button></div>
      </aside> : <aside>
        <h2>{risks.loading ? 'Finding your first move…' : snoozed.length ? 'First moves snoozed for this session.' : 'No first-move signal available.'}</h2>
        <SourceNotice source={risks} warning={risks.data?.warning} />
        {snoozed.length > 0 && <button className="secondary" onClick={() => setSnoozed([])}>Restore recommendations</button>}
      </aside>}
    </section></div>
    <div className="rv-page rv-today">
      <div className="rv-today-top">
        <section className="rv-pipeline-card">
          <Title title="Your pipeline" description="Open opportunity value by stage."><Link className="rv-link" to="/pipeline">Open pipeline →</Link></Title>
          <SourceNotice source={pipeline} />
          <PipelineWheel pipeline={pipeline.data} />
        </section>
        <section className="r2-home-lead-desk">
          <Title title="Your lead & referral desk" description="Start the follow-ups that grow your book."><Link className="rv-link" to="/prospecting">Open lead workspace →</Link></Title>
          <div className="r2-home-lead-pulse"><strong>{count(leads.data?.totalCount)}</strong><span>Open leads & referrals</span></div>
          <SourceNotice source={leads} empty={!leads.data?.rows.length} />
          <div className="r2-home-lead-list">{leads.data?.rows.map(row => <Link className="list-row" key={row.Id} to={`/prospecting?lead=${row.Id}`}><span className="r2-lead-avatar">{initials(label(row, 'Name'))}</span>
            <div><strong>{label(row, 'Name')}</strong><small>{label(row, 'LeadSource')} · {label(row, 'Status')}</small></div><span>›</span></Link>)}</div>
        </section>
      </div>
      <section className="pr-workspace" aria-label="Ranked priorities">
        <header><div><span>Ranked work</span><h2>Priority customers</h2><p>Customer signals, open deals and overdue commitments in one working queue.</p></div>
          <div>{snoozed.length > 0 && <button className="text-button" onClick={() => setSnoozed([])}>Restore {snoozed.length} snoozed</button>}<span className="pr-queue-scope">Top-eight queue · selected sources</span></div></header>
        <SourceNotice source={risks} warning={risks.data?.warning} />
        <SourceNotice source={tasks} /><SourceNotice source={opportunities} />
        <div className="pr-tier-tabs" role="group" aria-label="Priority due period">{[['all','All priorities'],['today','Today'],['week','This week'],['watch','Watch']].map(([value, display]) =>
          <button key={value} aria-pressed={tier === value} onClick={() => setTier(value)}>{display}<span>{all.filter(row => value === 'all' || row.tier === value).length}</span></button>)}</div>
        <div className="pr-working-layout">
          <div className="pr-ranked-list" role="region" tabIndex={0} aria-label="Ranked customer work">{filtered.map(row => <button key={row.id} aria-pressed={row.id === selected?.id} onClick={() => setSelection(row.id)}>
            <span className="pr-rank">{all.indexOf(row) + 1}</span><div><strong>{row.clientName}</strong><span>{row.action}</span><small>{row.source}</small></div><time dateTime={row.dueDate}>{date(row.dueDate)}</time>
          </button>)}{!filtered.length && <div className="pr-empty"><h3>No priorities in this view.</h3><p>Choose another due period or restore snoozed recommendations.</p></div>}</div>
          <article className="pr-selection" data-agent-record={selected?.clientId || undefined} data-agent-label={selected?.clientName} data-agent-observation={selected && [selected.source,selected.action,selected.reason].join(' · ')}>{selected ? <>
            <div className="pr-selection-top"><span className="badge">{selected.severity} priority</span><span>{(selected.score * 100).toFixed(0)}/100 priority score</span></div>
            <h3>{selected.clientName}</h3><h4>{selected.action}</h4><p>{selected.reason}</p>
            <div className="pr-evidence-stamp"><span>{selected.source}</span><span>Act by {date(selected.dueDate)}</span></div>
            <div className="pr-actions"><button className="primary" onClick={() => prepare(selected, 'prep')}>Prep me</button><button className="secondary" onClick={() => prepare(selected, 'task')}>Follow-up</button><button className="text-button" onClick={() => show(selected)}>Why this priority</button><button className="text-button" onClick={() => show(selected, true)}>Quick view</button></div>
            {selected.clientId && <AtlasActionReview key={selected.id} accountId={selected.clientId} ownerId={ownerId} name={selected.clientName} subject={selected.action} note={selected.reason} />}
            <div className="pr-selection-footer"><AccountLink id={selected.clientId} className="text-button" /><button className="text-button" onClick={() => snooze(selected)}>Snooze recommendation</button></div>
          </> : <><h3>A clear queue for this view.</h3><p>Choose a different due period to review more work.</p></>}</article>
        </div>
        <footer>Ranked from bounded source worklists. Recorded due dates are preserved.</footer>
      </section>
      <TodaySignalBand ownerId={ownerId} />
      <div className="rv-today-bottom pr-health-band">
        <section className="rv-home-health">
          <Title title="Portfolio watchlist" description="Source-backed watch signals."><Link className="rv-link" to="/health">Relationship health →</Link></Title>
          <div className="rv-health-callouts">
            <Link to="/health"><strong>{count(stress.data?.rows[0]?.high_now)}</strong><span>High stress this month</span></Link>
            <Link to="/health?cohort=deposits"><strong>{count(deposits.data?.rows[0]?.retention)}</strong><span>Outside-deposit flow $5K+/mo</span></Link>
            <Link to="/work?view=cases"><strong>{cases.data ? count(cases.data.rows.filter(row => label(row, 'Priority') === 'Critical').length) : '—'}</strong><span>Critical cases in this sample</span></Link>
          </div>
          <SourceNotice source={cases} />
          <Title title="Customer moments" description="Recent recorded milestones."><Link className="rv-link" to="/journey">Life & goals →</Link></Title>
          <SourceNotice source={events} empty={!events.data?.rows.length} />
          <div className="rv-mini-moments">{events.data?.rows.map(row => <Link key={row.Id} to={`/journey?event=${row.Id}`}><span><CardIcon name="lifeEvent" /></span>
            <div><strong>{relationship(row).name || label(row, 'Name')}</strong><small>{label(row, 'EventType')} · {date(field(row, 'EventDate'))}</small></div></Link>)}</div>
          {(cases.data?.rows ?? []).slice(0, 1).map(row => <RecordLink key={row.Id} object="Case" id={row.Id} title={label(row, 'Subject')} />)}
        </section>
      </div>
    </div>
  </>;
}


function PipelineWheel({ pipeline }: { pipeline: Awaited<ReturnType<typeof readPipelineAmount>> | null }) {
  const navigate = useNavigate();
  const total = pipeline?.amount;
  const stages = orderRetailStages(pipeline?.stages ?? []);
  const shares = stages.map(stage => total && total > 0 ? (stage.amount ?? 0) / total * 100 : 0);
  const stageLink = (stage: string) => `/pipeline?stage=${encodeURIComponent(stage)}`;
  return <div className="rv-stage-composition rv-stage-home">
    <div className="rv-stage-wheel">
      <svg viewBox="0 0 220 220" role="group" aria-label="Open pipeline amount by recorded stage">
        {stages.map((stage, index) => {
          const share = shares[index];
          const start = shares.slice(0, index).reduce((sum, value) => sum + value, 0);
          return share > 0 ? <a key={stage.name} href={stageLink(stage.name)} onClick={event => { event.preventDefault(); navigate(stageLink(stage.name)); }}
            aria-label={`${stage.name}, ${compact(stage.amount)}, ${count(stage.count)} open opportunities`}>
            <circle cx="110" cy="110" r="83" fill="none" stroke={atlasChartColors[index % atlasChartColors.length]} strokeWidth="22" pathLength="100"
              strokeDasharray={`${Math.max(0, share - 1)} ${101 - share}`} strokeDashoffset={-start} transform="rotate(-90 110 110)" />
          </a> : null;
        })}
        <text x="110" y="109" textAnchor="middle">{compact(total)}</text>
        <text x="110" y="133" textAnchor="middle" className="rv-wheel-caption">{count(pipeline?.count)} open</text>
      </svg>
    </div>
    <div className="rv-stage-key">{stages.map((stage, index) =>
      <button key={stage.name} onClick={() => navigate(stageLink(stage.name))}>
        <i style={{ background: atlasChartColors[index % atlasChartColors.length] }} /><span><strong>{stage.name}</strong>
          <small>{count(stage.count)} opportunities{total && stage.amount != null ? ` · ${(stage.amount / total * 100).toFixed(1)}% of value` : ''}</small></span><b>{compact(stage.amount)}</b>
      </button>)}</div>
  </div>;
}
