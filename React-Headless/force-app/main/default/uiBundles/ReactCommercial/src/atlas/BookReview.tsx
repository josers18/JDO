import { useState } from 'react';
import { fetchCrmKpis, fetchFirmographicMix, fetchMarketFootprint, fetchServiceNowDrag } from '@shared';
import { useNavigate } from 'react-router';
import { fetchHomeDashboardReal } from '../home/homeDataReal';
import type { CustomerGoal, HomeDashboard } from '../home/homeTypes';
import { cash, day, Inspect, Panel, Pending, RouteLink, useLive } from './controls';
import { generateBookBrief } from './bookBrief';
import { RecordedAgendaPreview } from './Work';

function Bars({ values, label }: { values?: number[]; label: string }) {
  if (!values?.length) return null;
  const min = Math.min(...values), range = Math.max(...values) - min;
  return <span className="cr-bars" role="img" aria-label={label}>{values.map((v,i) =>
    <i key={i} style={{height:(range ? 15 + 75 * (v-min)/range : 55)+'%'}} />)}</span>;
}

function BookBrief({ data, close }: { data: HomeDashboard; close: () => void }) {
  const [attempt,setAttempt] = useState(0);
  const [sources,setSources] = useState(false);
  const metrics = data.kpis.filter(k => !data.unavailableMetrics?.includes(k.key));
  const generated = useLive(() => generateBookBrief(JSON.stringify({
    banker:data.bankerName, asOf:data.dateLabel, measures:metrics.map(({label,value,note}) => ({label,value,note})),
    activity:data.portfolioActivity, priorityCompanies:data.callList.slice(0,2).map(({clientName,reason,action}) => ({clientName,reason,action})),
  })),String(attempt));
  return <Inspect title={sources ? 'Portfolio sources' : 'Daily brief'} onClose={close}><div className="cr-dialog">
    {sources ? <>{data.dataFreshness?.sources.map(source => <div className="cr-source" key={source.label}><strong>{source.label}</strong><span>{source.issue || source.asOf || source.cadence}</span></div>)}
      <button className="secondary" onClick={() => setSources(false)}>Back to briefing</button></> : <>
      <p className="cr-date">{data.bankerName} · {data.dateLabel}</p><h3>Risk and growth across the book</h3>
      {generated.error ? <button className="secondary" onClick={() => setAttempt(n => n+1)}>Retry AI briefing</button> : <Pending state={generated}>{generated.value?.split(/\n\s*\n/).map((paragraph,i) => <p key={i}>{paragraph}</p>)}</Pending>}
      <h3>Latest verified measures</h3><dl className="cr-facts">{metrics.map(k => <div key={k.key}><dt>{k.label}</dt><dd>{k.format.startsWith('currency') ? cash(k.value) : k.value.toLocaleString()}</dd></div>)}</dl>
      <div className="ca-actions">{generated.value && 'speechSynthesis' in window && <button className="secondary" onClick={() => {window.speechSynthesis.cancel();window.speechSynthesis.speak(new SpeechSynthesisUtterance(generated.value));}}>Listen to briefing</button>}
      <button className="secondary" onClick={() => setSources(true)}>Source dates</button><RouteLink style="primary" to="/intelligence">Open company intelligence</RouteLink></div></>}
  </div></Inspect>;
}
type PulseProps = {
  title: string; date: string; onBrief: () => void; growth?: number; profiled?: number;
  exposed?: number; clients?: number; cases?: number; trend?: number[]; caseNote: string;
};
function PulseStrip({ title, date, onBrief, growth, profiled, exposed, clients, cases, trend, caseNote }: PulseProps) {
  const navigate = useNavigate();
  const coverage = (amount: number | undefined, label: string, total: number | undefined, note: string, to: string) =>
    <button onClick={() => navigate(to)}><span>{label}</span><strong>{amount?.toLocaleString() ?? '—'}{amount != null && total != null && <small> / {total.toLocaleString()}</small>}</strong>
      <span className="cr-meter">{amount != null && !!total && <i style={{width:100 * amount / total+'%'}} />}</span><em>{note}</em></button>;
  return <section className="cr-pulse"><header><div className="cr-pulse-title"><h2>{title}</h2><small>{date}</small></div>
      <button className="text-button" onClick={onBrief}>Read book briefing ↗</button></header><div className="cr-pulse-body">
      {coverage(growth,'Growth-tier mix',profiled,'Companies with $50M+ revenue','/health?focus=growth')}
      {coverage(exposed,'Branch exposure',clients,'Clients near Consolidate branches','/health?focus=market')}
      <button onClick={() => navigate('/work?sub=cases')}><span>Open service cases</span><strong>{cases?.toLocaleString() ?? '—'}</strong>
        <Bars values={trend} label="Weekly CRM open case counts" /><em>{caseNote}</em></button>
    </div></section>;
}

function OverviewBookBrief({ owner, name, close }: { owner: string; name: string; close: () => void }) {
  const live = useLive(() => fetchHomeDashboardReal({userId:owner,name}),owner);
  return live.value ? <BookBrief data={live.value} close={close} /> :
    <Inspect title="Daily brief" onClose={close}><Pending state={live}>{null}</Pending></Inspect>;
}
export function OverviewPulse({owner, name}: {owner: string; name: string}) {
  const [brief,setBrief] = useState(false);
  const mix = useLive(() => fetchFirmographicMix(owner,true),owner);
  const footprint = useLive(() => fetchMarketFootprint(owner,true),owner);
  const crm = useLive(() => fetchCrmKpis(owner,new Date(),true),owner);
  const service = useLive(() => fetchServiceNowDrag(owner),owner);
  const growth = mix.value?.scope === 'book' ? mix.value : undefined;
  const market = footprint.value?.scope === 'book' ? footprint.value : undefined;
  const crmCases = crm.value?.scope === 'book' ? crm.value.openCases : undefined;
  const serviceCases = service.value?.scope === 'book' ? service.value.open : undefined;
  const date = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date());
  return <><PulseStrip title="Portfolio pulse" date={date} onBrief={() => setBrief(true)}
    growth={growth?.upmarket} profiled={growth?.total} exposed={market?.consolidate} clients={market?.clients}
    cases={crmCases && serviceCases != null ? crmCases.value + serviceCases : undefined} trend={crmCases?.trend}
    caseNote={crmCases && serviceCases != null ? crmCases.value.toLocaleString()+' CRM · '+serviceCases.toLocaleString()+' ServiceNow'
      : crm.pending || service.pending ? 'Loading case totals…' : 'Case totals unavailable'} />
    {brief && <OverviewBookBrief owner={owner} name={name} close={() => setBrief(false)} />}</>;
}
function Portfolio({ data }: { data: HomeDashboard }) {
  const navigate = useNavigate();
  const [brief,setBrief] = useState(false);
  const metric = (key: string) => data.unavailableMetrics?.includes(key) ? undefined : data.kpis.find(k => k.key === key);
  const value = (key: string) => {
    const k = metric(key);
    return k ? k.format.startsWith('currency') ? cash(k.value) : k.value.toLocaleString() : '—';
  };
  const reading = (key: string,label: string,to: string) => <button key={key} className="cr-reading" onClick={() => navigate(to)}>
    <span><strong>{label}</strong><small>{metric(key)?.note ?? 'Source unavailable'}</small></span><b>{value(key)}</b></button>;
  return <>
    <PulseStrip title="Coverage & service" date={data.dateLabel} onBrief={() => setBrief(true)}
      growth={metric('upmarket')?.value} profiled={data.firmographics?.total}
      exposed={metric('branchRisk')?.value} clients={data.marketFootprint?.clients}
      cases={metric('openCases')?.value} trend={metric('openCases')?.trend} caseNote={metric('openCases')?.note ?? 'Source unavailable'} />
    <div className="cr-focus-grid"><Panel title="Credit & relationship signals">
      {reading('atRisk','Credit Watch','/health?focus=watch')}{reading('callTone','Call tone sliding','/intelligence?q=Gong')}
      {reading('outlook','Negative or watch outlook','/intelligence?q=Moody')}{reading('leadership','Leadership changes','/intelligence?q=BoardEx')}
      {reading('esg','ESG movers','/intelligence?q=MSCI')}</Panel>
    <Panel title="Money & origination">{reading('netFlow','Business net flow','/?flow=weekly')}{reading('pipeline','Open pipeline','/pipeline')}
      {reading('uplift','Modeled uplift','/growth?view=offers')}{reading('leads','Leads & referrals','/growth?view=development')}
      <button className="cr-reading" onClick={() => navigate('/pipeline')}><span><strong>Closed-won value</strong><small>Last 30 days</small></span><b>{cash(data.portfolioActivity?.wonAmount)}</b></button></Panel></div>
    <Panel title="Activity & goals" action={<RouteLink to="/journey">Open activity &amp; plans</RouteLink>}><dl className="cr-facts">
      <div><dt>Activities in last 7 days</dt><dd>{data.portfolioActivity?.activities?.toLocaleString() ?? '—'}</dd></div>
      <div><dt>Active banker goals</dt><dd>{value('goals')}</dd></div></dl></Panel>
    {brief && <BookBrief data={data} close={() => setBrief(false)} />}
  </>;
}
function Agenda({ data, owner }: { data: HomeDashboard; owner: string }) {
  const [goal,setGoal] = useState<CustomerGoal>();
  return <div className="cr-focus-grid">
    <Panel title="Recorded agenda"><RecordedAgendaPreview owner={owner} expanded /></Panel>
    <Panel title="Pipeline movement" action={<RouteLink to="/pipeline">Open deal room</RouteLink>}>{data.pipelineMovement.map(stage =>
      <div className="cr-stage-reading" key={stage.id}><span><strong>{stage.label}</strong><small>{stage.deltaPct == null ? 'Prior period unavailable' : (stage.deltaPct*100).toFixed(1)+'% week over week'}</small></span>
        <Bars values={stage.trend} label={stage.label+' weekly pipeline'} /><b>{cash(stage.amount)}</b></div>)}
      <div className="ca-deal-strip">{data.pipeline.slice(0,3).map(deal => <RouteLink key={deal.id} style="" to={deal.recordId ? '/pipeline?deal='+deal.recordId : '/pipeline'}><span>{deal.stage}</span><strong>{deal.clientName}</strong><em>{cash(deal.amount)}</em></RouteLink>)}</div></Panel>
    <Panel title="Customer goals" action={<RouteLink to="/journey">Plans &amp; life events</RouteLink>}>{data.customerGoals.slice(0,3).map(g =>
      <button className="cr-reading" key={g.id} onClick={() => setGoal(g)}><span><strong>{g.name}</strong><small>{g.clientName} · {day(g.targetDate)}</small></span><b>{cash(g.current)} / {cash(g.target)}</b></button>)}
      {!data.customerGoals.length && <p>No customer goals returned.</p>}</Panel>
    <Panel title="Service & referrals"><div className="ca-actions"><RouteLink style="secondary" to="/work?sub=cases">Open service cases</RouteLink><RouteLink style="secondary" to="/growth?view=development">Leads &amp; introductions</RouteLink></div></Panel>
    {goal && <Inspect title={goal.name} onClose={() => setGoal(undefined)}><p>{goal.clientName} · {goal.planName}</p><p>{goal.description}</p><p>{goal.status} · {day(goal.targetDate)} · {cash(goal.current)} / {cash(goal.target)}</p>{goal.clientId && <RouteLink to={'/client/'+goal.clientId}>Open company</RouteLink>}</Inspect>}
  </div>;
}
export function BookReview({ owner, name, tab }: { owner: string; name: string; tab: 'portfolio'|'agenda' }) {
  const live = useLive(() => fetchHomeDashboardReal({userId:owner,name,firstName:name.split(' ')[0]}),owner);
  return <Pending state={live}>{live.value && (tab === 'portfolio' ? <Portfolio data={live.value} /> : <Agenda data={live.value} owner={owner} />)}</Pending>;
}
