import { atlasChartColors } from './atlasChartColors';
import { useState, type CSSProperties } from 'react';
import { orgCoreOrigin, lexRecordUrl } from '../../data/orgEnv';
import { useAsyncData } from '../../hooks/useAsyncData';
import type { PersonaKey } from '../../theme/themes';
import { Modal } from '../Modal';
import { Icon } from '../iconMap';
import { TaskModal } from '../home/TaskModal';
import { useStageDrafts } from './atlasDrafts';
import { fetchCrmKpis } from '../../data/crmKpis';
import { fetchPipeline, fetchPipelineDeals, orderRetailStages, type AtlasDeal } from './atlasPipelineData';
import { atlasAccountPath, type AtlasLink } from './AtlasShell';
import '../../../../../../../../docs/design-studies/2026-11-12-directions/wealth-atlas.css';
import '../../../../../../../../docs/design-studies/2026-11-12-directions/wealth-studio.css';
import '../../../../../../../../docs/design-studies/2026-11-12-directions/commercial-atlas.css';
import '../../../../../../../../docs/design-studies/2026-11-12-directions/commercial-studio.css';
import '../../../../../../../../docs/design-studies/2026-11-12-directions/workspace-visuals.css';
import '../../../../../../../../docs/design-studies/2026-11-12-directions/retail-refinement.css';
import '../../../../../../../../docs/design-studies/2026-11-12-directions/retail-priorities.css';
import './atlasPipeline.css';

const moneyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const stamp = (value?: string | null) => value ? Date.parse(value + 'T00:00:00Z') : NaN;
const date = (value?: string | null) => value && Number.isFinite(stamp(value))
  ? new Date(stamp(value)).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const cash = (value?: number | null) => value == null ? '—' : moneyFormat.format(value);
const name = (deal: AtlasDeal) => deal.Account?.Name?.value || 'No accessible linked account';
const title = (deal: AtlasDeal) => deal.Name?.value || 'Opportunity';
const initials = (value: string) => value.split(/\s+/).slice(0, 2).map(part => part[0]).join('');
const stageName = (deal: AtlasDeal) => deal.StageName?.value || 'Stage unavailable';

type Stage = Awaited<ReturnType<typeof fetchPipeline>>['stages'][number];

function Metric({ label, value, detail }: {label: string; value: string; detail?: string}) {
  return <div className="wa-metric"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

const probabilityBands = ['Under 30%', '30–69%', '70% or higher', 'Unavailable'];
function probabilityBand(value: number | null | undefined) {
  if (value == null) return 3;
  return value < 30 ? 0 : value < 70 ? 1 : 2;
}

function DealPlot({ deals, selected, pick }: {
  deals: AtlasDeal[]; selected?: AtlasDeal; pick: (id: string) => void;
}) {
  const chosen = [...new Map([
    ...deals.slice(0, 12),
    ...[...deals].sort((a, b) => (stamp(a.CloseDate?.value) || Infinity) - (stamp(b.CloseDate?.value) || Infinity)).slice(0, 12),
  ].map(deal => [deal.Id, deal])).values()];
  const points = chosen.flatMap(deal => {
    const amount = deal.Amount?.value;
    const close = stamp(deal.CloseDate?.value);
    return amount != null && amount > 0 && Number.isFinite(close) ? [{deal, close, value: Math.log10(amount)}] : [];
  });
  if (!points.length) return <p>No dated opportunities with a positive amount in these results.</p>;
  const first = Math.min(...points.map(point => point.close));
  const last = Math.max(...points.map(point => point.close));
  const lo = Math.floor(Math.min(...points.map(point => point.value)));
  const hi = Math.max(lo + 1, Math.ceil(Math.max(...points.map(point => point.value))));
  const x = (value: number) => 80 + (value - first) / Math.max(86400000, last - first) * 680;
  const y = (value: number) => 255 - (value - lo) / (hi - lo) * 195;
  return <div className="ws-deal-plot">
    <div className="ws-plot-note"><span>Open opportunities by close date and value</span><small>Close date × positive opportunity value · logarithmic scale</small></div>
    <div className="ws-probability-key"><strong>Recorded probability</strong>{probabilityBands.map((label,i) =>
      (i !== 3 || points.some(p => p.deal.Probability?.value == null)) &&
      <span key={label} data-band={i}><i />{label}</span>)}</div>
    <svg viewBox="0 0 830 330" role="group" aria-label="Open opportunity close dates and amounts">
      {Array.from({length: hi-lo+1}, (_,i) => <g key={i}>
        <line x1="80" x2="760" y1={y(lo+i)} y2={y(lo+i)} stroke="var(--tone-wash, #e1dceb)" strokeDasharray="3 5" />
        <text x="68" y={y(lo+i)+4} textAnchor="end">{cash(10**(lo+i))}</text>
      </g>)}
      {points.map(({deal, close, value}) => <g key={deal.Id} tabIndex={0} role="button"
        aria-label={`${name(deal)}, ${title(deal)}, ${cash(deal.Amount?.value)}, ${date(deal.CloseDate?.value)}`}
        onClick={() => pick(deal.Id)} onKeyDown={e => { if(e.key==='Enter'||e.key===' ') { e.preventDefault(); pick(deal.Id); } }}>
        <circle cx={x(close)} cy={y(value)} r={selected?.Id===deal.Id?12:8} data-band={probabilityBand(deal.Probability?.value)} fill="var(--prob-color)"
          stroke={selected?.Id===deal.Id?'var(--tone-deep, #292343)':'#fff'} strokeWidth={selected?.Id===deal.Id?3:2} />
        <title>{title(deal)} · {deal.Probability?.value == null ? 'Probability unavailable' : deal.Probability.value + '% probability'}</title>
      </g>)}
      <text x="80" y="293">{date(new Date(first).toISOString().slice(0,10))}</text>
      <text x="760" y="293" textAnchor="end">{date(new Date(last).toISOString().slice(0,10))}</text>
    </svg>
    <p>{points.length} opportunities shown. Select a point to inspect its source record.</p>
  </div>;
}

function DealDetail({ deal, persona, link, onPrepare, onReview, ownerId }: {
  deal: AtlasDeal; persona: PersonaKey; link: AtlasLink; onPrepare: () => void; onReview?: () => void; ownerId: string;
}) {
  const account = deal.AccountId?.value;
  if (persona === 'commercial') return <article className="ca-deal-detail">
    <div className="ca-company-banner">
      <span className="ca-company-symbol">{initials(name(deal))}</span><div><h2>{name(deal)}</h2><p>{title(deal)}</p></div>
    </div>
    <div className="ca-deal-vitals">
      <div><small>Opportunity amount</small><strong>{cash(deal.Amount?.value)}</strong></div>
      <div><small>Source probability</small><strong>{deal.Probability?.value == null ? 'Unavailable' : deal.Probability.value + '%'}</strong></div>
      <div><small>Source close date</small><strong>{date(deal.CloseDate?.value)}</strong></div>
    </div>
    <div className="ca-actions">
      {account && <button type="button" className="primary" onClick={onPrepare}>Draft deal follow-up</button>}
      <button className="secondary" type="button" disabled={!onReview || !account} onClick={onReview}>Review opportunity proposal</button>
      {account && link(atlasAccountPath(persona, account), 'Open company dossier', 'text-button')}
    </div>
    <div className="cs-deal-context"><span>Company</span><i>→</i><span>Exact opportunity</span><i>→</i><span>Reviewable follow-up</span></div>
    <p className="ca-note">Conversation guide for the next deal review.</p>
    <h3>Deal follow-up</h3><p>{deal.Description?.value || 'No source deal description was supplied.'}</p>
    <details><summary>Record and ownership</summary><p>Opportunity {deal.Id}<br/>Account {account || '—'}<br/>Owner {ownerId}<br/>Lead source {deal.LeadSource?.value || '—'}</p></details>
  </article>;
  return <aside className="ws-deal-focus">
    <div className="ws-folder-tab">My next deal conversation</div>
    <div className="ws-focus-head">
      <span className="ws-household-seal">{initials(name(deal))}</span><h2>{name(deal)}</h2><p>{title(deal)}</p>
    </div>
    <div className="ws-deal-value">{cash(deal.Amount?.value)}<small>Opportunity amount</small></div>
    <div className="ws-deal-facts">
      <Metric label="Recorded stage" value={stageName(deal)} /><Metric label="Close date" value={date(deal.CloseDate?.value)} />
      <Metric label="Source probability" value={deal.Probability?.value == null ? '—' : deal.Probability.value + '%'} />
      <Metric label="Lead source" value={deal.LeadSource?.value || '—'} />
    </div>
    <div className="ws-conversation-path"><span>Understand the need</span><i /><span>Agree the next step</span><i /><span>Keep the commitment</span></div>
    <div className="ws-focus-actions">
      {account && <button className="primary" type="button" onClick={onPrepare}>Prepare deal follow-up</button>}
      <a className="secondary" href={lexRecordUrl('Opportunity', deal.Id)} target="_top">Review opportunity</a>
      {account && link(atlasAccountPath(persona, account), 'Open household', 'text-button')}
    </div>
    <details><summary>Exact source records</summary><p>Opportunity {deal.Id}<br/>Account {account || '—'}</p></details>
  </aside>;
}

function StageBar({ stages, total, onSelect, color }: {
  stages: Stage[]; total?: number | null; onSelect: (stage: string) => void; color: (stage: string) => string;
}) {
  return <div className="ws-stage-composition">
    <div className="ws-stage-stream" aria-label="Open pipeline value by recorded stage">
      {stages.map(stage => <button key={stage.name} type="button" onClick={() => onSelect(stage.name)}
        style={{flex:Math.max(0,stage.amount)/Math.max(1,total ?? 1)*100,background:color(stage.name)}}
        aria-label={`${stage.name}, ${cash(stage.amount)}, ${stage.count ?? 'unknown'} open opportunities`}
        title={`${stage.name} · ${cash(stage.amount)}`} />)}
    </div>
    <div className="ws-stage-top">
      {stages.slice(0,4).map(stage => <button key={stage.name} type="button" style={{'--stage-color':color(stage.name)} as CSSProperties} onClick={() => onSelect(stage.name)}>
        <i style={{background:color(stage.name)}}/><span>{stage.name}</span><strong>{cash(stage.amount)}</strong>
      </button>)}
    </div>
    <small>All {stages.length} native stage labels retained. Deal details are paginated.</small>
  </div>;
}

function RetailStages({ stages, total, select, current, color }: {
  stages:Stage[];total:number|null|undefined;select:(stage:string)=>void;current:string;color:(stage:string)=>string;
}) {
  let offset=0;
  const denominator=Math.max(1,total ?? 0);
  const totalCount=stages.reduce((sum,stage)=>sum+(stage.count ?? 0),0);
  return <div className="rv-stage-composition">
    <div className="rv-stage-wheel">
      <svg viewBox="0 0 220 220" role="group" aria-label="Open pipeline amount by recorded stage">
        {stages.map(stage=>{
          const percent=stage.amount/denominator*100;
          const start=offset;
          offset+=percent;
          return <circle key={stage.name} cx="110" cy="110" r="83" fill="none" stroke={color(stage.name)} strokeWidth="22" pathLength="100"
            strokeDasharray={`${Math.max(0,percent-1)} ${101-percent}`} strokeDashoffset={-start} transform="rotate(-90 110 110)"
            role="button" tabIndex={0} aria-label={stage.name+' '+cash(stage.amount)} onClick={()=>select(stage.name)}
            onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(stage.name);}}} />;
        })}
        <text x="110" y="109" textAnchor="middle">{cash(total)}</text>
        <text x="110" y="133" textAnchor="middle" className="rv-wheel-caption">{totalCount.toLocaleString()} open</text>
      </svg>
    </div>
    <div className="rv-stage-key">
      {stages.map(stage=><button key={stage.name} type="button" onClick={()=>select(stage.name)} aria-pressed={stage.name===current}>
        <i style={{background:color(stage.name)}} /><span><strong>{stage.name}</strong>
          <small>{stage.count ?? '—'} opportunities · {(stage.amount/denominator*100).toFixed(1)}% of value</small></span><b>{cash(stage.amount)}</b>
      </button>)}
    </div>
  </div>;
}

function PipelineHistory({ amounts, dates = [], loading, close }: {amounts?:number[];dates?:string[];loading:boolean;close:()=>void}) {
  const lo=amounts?.length?Math.min(...amounts):0;
  const hi=amounts?.length?Math.max(...amounts):0;
  const yy=(amount:number)=>150-(amount-lo)/Math.max(1,hi-lo)*110;
  const xx=(index:number)=>40+index*580/Math.max(1,(amounts?.length??1)-1);
  return <Modal open onClose={close} title="Pipeline through time" wide>
    {amounts?.length ? <>
      <p>Data 360 reconstruction of this book’s open pipeline. Each point uses the same historical source.</p>
      <svg className="ca-history-chart" viewBox="0 0 660 200" role="img" aria-label="Weekly open pipeline snapshots">
        <polyline points={amounts.map((amount,i)=>`${xx(i)},${yy(amount)}`).join(' ')} fill="none" stroke="#528f89" strokeWidth="3" />
        {amounts.map((amount,i)=><g key={i}><circle cx={xx(i)} cy={yy(amount)} r="5" fill="#528f89"/><title>{date(dates[i])} · {cash(amount)}</title><text x={xx(i)} y="183" textAnchor="middle" fontSize="12">{dates[i]?.slice(5)}</text></g>)}
      </svg>
      <div className="ca-ledger">{amounts.map((amount,i)=><div key={i}><strong>{date(dates[i])}</strong><span>{cash(amount)}</span></div>)}</div>
    </> : <p>{loading?'Loading pipeline history…':'Book-scoped historical pipeline is unavailable.'}</p>}
  </Modal>;
}

function RetailPlot({ deals, selected, pick, color }: {
  deals:AtlasDeal[]; selected?:AtlasDeal; pick:(id:string)=>void; color:(stage:string)=>string;
}) {
  const [fit,setFit]=useState(false);
  const points=deals.flatMap(deal=>{
    const value=deal.Amount?.value, close=stamp(deal.CloseDate?.value);
    return value != null && Number.isFinite(close) ? [{deal,value,close}] : [];
  });
  if (!points.length) return <p>Choose a stage with recorded amounts and close dates.</p>;
  const start=Math.min(...points.map(p=>p.close))-7*86400000, end=Math.max(...points.map(p=>p.close))+7*86400000;
  const floor=fit?Math.min(...points.map(p=>p.value))*.94:0;
  const ceil=Math.max(...points.map(p=>p.value))*1.12;
  const compact=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:1});
  return <div className="viz-plot-wrap">
    <div className="viz-plot-tools"><span>Recorded amount</span><div className="viz-switch" aria-label="Value scale">
      <button type="button" aria-pressed={!fit} onClick={()=>setFit(false)}>From zero</button>
      <button type="button" aria-pressed={fit} onClick={()=>setFit(true)}>Fit values</button>
    </div></div>
    <div className="viz-deal-plot">
      <div className="viz-y-axis">{Array.from({length:4},(_,i)=><span key={i} style={{top:`${6+i*26}%`}}>{compact.format(floor+(ceil-floor)*(3-i)/3)}</span>)}</div>
      <div className="viz-plot-field"><div className="viz-gridlines" aria-hidden="true"><i/><i/><i/><i/></div>
        {points.map(({deal,value,close})=><button type="button" key={deal.Id} className={`viz-deal-dot ${selected?.Id===deal.Id?'selected':''}`}
          style={{left:`${8+(close-start)/(end-start)*85}%`,top:`${84-(value-floor)/Math.max(1,ceil-floor)*78}%`,'--deal-color':color(stageName(deal))} as CSSProperties}
          aria-pressed={selected?.Id===deal.Id} aria-label={`Select ${name(deal)}, ${cash(value)}, close ${date(deal.CloseDate?.value)}`}
          onClick={()=>pick(deal.Id)}><span>{initials(name(deal))}</span><strong>{compact.format(value)}</strong></button>)}
        <div className="viz-x-axis">{Array.from({length:4},(_,i)=><span key={i} style={{left:`${i/3*100}%`}}>{date(new Date(start+(end-start)*i/3).toISOString().slice(0,10))}</span>)}</div>
      </div>
    </div>
    <p className="viz-axis-title">Recorded close date</p>
    <ul className="viz-plot-key" aria-label="Deals in this plot">
      {points.map(({deal})=><li key={deal.Id}><button type="button" aria-pressed={selected?.Id===deal.Id} onClick={()=>pick(deal.Id)}>
        <i style={{background:color(stageName(deal))}} />{name(deal)}
      </button></li>)}
    </ul>
  </div>;
}

function RetailDealInspector({ deal, preview, stages, setStage, prepare, retain, saved }: {
  deal:AtlasDeal; preview?:string; stages:Stage[]; setStage:(stage:string)=>void; prepare:()=>void; retain:()=>void; saved:string;
}) {
  const past=stamp(deal.CloseDate?.value)<Date.now();
  return <aside className="viz-inspector viz-deal-inspector">
    <span className="badge">{preview?'Local scenario':stageName(deal)}</span>
    <h2>{name(deal)}</h2><p>{title(deal)}</p><div className="viz-large-value">{cash(deal.Amount?.value)}</div>
    <dl className="viz-detail-list">
      <div><dt>Recorded stage</dt><dd>{stageName(deal)}</dd></div>
      <div><dt>Recorded close</dt><dd>{date(deal.CloseDate?.value)}</dd></div>
      <div><dt>Close timing</dt><dd>{deal.CloseDate?.value ? (past?'Past recorded date':'Future recorded date') : '—'}</dd></div>
    </dl>
    <label className="viz-field">Preview a stage
      <select aria-label="Preview stage for selected deal" value={preview||stageName(deal)} onChange={e=>setStage(e.target.value)}>
        {stages.map(stage=><option key={stage.name}>{stage.name}</option>)}
      </select>
    </label>
    {preview && <><p className="viz-scenario-note">Local preview · {stageName(deal)} → {preview}</p>
      <button className="primary" type="button" onClick={retain}>Keep stage-plan draft</button>
      <button className="text-button" type="button" onClick={()=>setStage(stageName(deal))}>Reset preview</button></>}
    {saved && <p role="status">{saved}</p>}
    <a className="secondary" href={lexRecordUrl('Opportunity',deal.Id)} target="_top">Review deal</a>
    {deal.AccountId?.value && <button className="secondary" type="button" onClick={prepare}>Plan follow-up</button>}
  </aside>;
}

function StagePlanning({ deals, stages, pair, setPair, pick }: {
  deals: AtlasDeal[]; stages: Stage[]; pair: Record<string,string>;
  setPair: (recordId:string,stage:string)=>void; pick:(recordId:string)=>void;
}) {
  const laneNames=[...new Set([...stages.slice(0,3).map(stage=>stage.name),...deals.map(deal=>pair[deal.Id]||stageName(deal))])];
  return <div className="viz-board-scroll"><div className="viz-planning-board" style={{'--board-columns':laneNames.length} as CSSProperties}>
    {laneNames.map(stage=>{
      const lane=deals.filter(deal=>(pair[deal.Id]||stageName(deal))===stage);
      return <section className="viz-plan-lane" key={stage} aria-label={stage+' planning lane'} onDragOver={e=>e.preventDefault()}
        onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain');if(deals.some(deal=>deal.Id===id)){setPair(id,stage);pick(id);}}}>
        <header><h3>{stage}</h3><span>{lane.length} shown</span></header>
        {lane.map(deal=><button className={`viz-plan-deal ${pair[deal.Id]?'scenario':''}`} key={deal.Id} type="button" draggable
          onDragStart={e=>e.dataTransfer.setData('text/plain',deal.Id)} onClick={()=>pick(deal.Id)}>
          <span className="viz-drag-handle" aria-hidden>⠿</span><strong>{name(deal)}</strong><span>{cash(deal.Amount?.value)}</span>
          <small>{pair[deal.Id]?'Local stage preview':date(deal.CloseDate?.value)}</small>
        </button>)}
        {!lane.length && <div className="viz-drop-hint">Drop a deal here to preview this stage</div>}
      </section>;
    })}
  </div></div>;
}

export default function AtlasPipeline({ ownerId, actorId, persona, link, locationState, ownerName, onDealProposal }: {
  ownerId: string; actorId?: string; ownerName?: string; persona: PersonaKey; link: AtlasLink;
  onDealProposal?: (deal: AtlasDeal, kind: 'task' | 'opportunity') => void;
  locationState: { search: string; stage: string; deal: string; set: (key: 'q'|'stage'|'deal', value: string) => void };
}) {
  const filterKey=JSON.stringify([locationState.search,locationState.stage]);
  const [paging,setPaging]=useState<{key:string;cursors:(string|null)[]}>({key:'',cursors:[null]});
  const cursorHistory=paging.key===filterKey ? paging.cursors : [null];
  const movePage=(cursors:(string|null)[])=>setPaging({key:filterKey,cursors});
  const drafts = useStageDrafts(persona, actorId, ownerId);
  const [saved,setSaved]=useState('');
  const [mode,setMode]=useState<'plot'|'board'>('plot');
  const [preview,setPreview]=useState<Record<string,string>>({});
  const [task,setTask]=useState<AtlasDeal>();
  const [historyOpen,setHistoryOpen]=useState(false);
  const [retry,setRetry]=useState(0);
  const cursor=cursorHistory[cursorHistory.length-1];
  const aggregate=useAsyncData(()=>fetchPipeline(ownerId),[ownerId,retry]);
  const pageSize = persona === 'retail' ? 6 : 40;
  const records=useAsyncData(()=>fetchPipelineDeals(ownerId,locationState.search,locationState.stage,cursor,pageSize),[ownerId,locationState.search,locationState.stage,cursor,pageSize,retry]);
  const history=useAsyncData(()=>historyOpen || persona==='commercial' ? fetchCrmKpis(ownerId, new Date(), true) : Promise.resolve(null),[ownerId,historyOpen,persona]);
  const exact=useAsyncData(()=>locationState.deal ? fetchPipelineDeals(ownerId,'','',null,1,locationState.deal) : Promise.resolve(null),[ownerId,locationState.deal]);
  const liveStages=aggregate.data?.stages ?? [];
  const stages=persona==='retail' ? orderRetailStages(liveStages) : liveStages;
  const stageHistory=history.data?.stages ?? [];
  const bookStages=stages.map(stage=>{
    const period=stageHistory.find(s=>s.label===stage.name);
    return {...stage, amount:period?.trend?.length ? period.trend[period.trend.length-1] : stage.amount, delta:period?.deltaPct};
  });
  const color=(stage:string)=>atlasChartColors[Math.max(0,stages.findIndex(row=>row.name===stage))%atlasChartColors.length];
  const setFilter=(key:'q'|'stage',value:string)=>{locationState.set(key,value);};
  const pickedStage=(stage:string)=>setFilter('stage',stage===locationState.stage?'':stage);
  const pick=(id:string)=>locationState.set('deal',id);
  const deals=records.loading||records.error?[]:records.data?.edges.map(edge=>edge.node)??[];
  const selected=locationState.deal
    ? deals.find(deal=>deal.Id===locationState.deal) ?? (!exact.loading && !exact.error ? exact.data?.edges.find(edge=>edge.node.Id===locationState.deal)?.node : undefined)
    : deals[0];
  const heading=persona==='wealth'?'Advisory opportunity pipeline':persona==='commercial'?'Commercial opportunity pipeline':'Retail opportunity pipeline';
  const subtitle=persona==='wealth'?'Review amounts, stages and close dates by household.':persona==='commercial'?'Review financing and treasury opportunities by company, stage and close date.':'Review your open pipeline, then work through individual deals.';
  return <div data-agent-record={selected?.Id} data-agent-label={selected && title(selected)} className={`atlas-pipeline ${persona === 'retail' ? 'atlas-retail-pipeline' : 'wa ws ws-pipeline'} ${persona === 'commercial' ? 'ca-root cs-root cs-page-pipeline' : ''}`}>
    <header className="wa-title atlas-pipeline-heading">
      <div>
        {persona!=='wealth' && <p className="atlas-pipeline-scope">{ownerName} · {persona==='commercial'?'Commercial banking':'Retail banking'}</p>}
        <h1>{heading}</h1><p>{subtitle}</p>
      </div>
      {persona!=='commercial' && <a className="primary" href={orgCoreOrigin() + '/lightning/o/Opportunity/new'} target="_top">New opportunity</a>}
    </header>
    {persona==='commercial' ? <>
      <div className="cs-pipeline-total">
        <div><span className="cs-eyebrow">Your book · Salesforce CRM</span><strong>{cash(aggregate.data?.amount)}</strong>
          <p>{stages.reduce((sum,stage)=>sum+(stage.count ?? 0),0).toLocaleString()} open opportunities</p></div>
        <div><h2>Open pipeline</h2><p>Compare book totals by stage. Select a stage to review its open deals.</p></div>
        <button className="secondary" type="button" onClick={()=>setHistoryOpen(true)}>Eight-week history ↗</button>
      </div>
      <div className="ca-stage-ribbon cs-stage-landscape">
        {bookStages.map((stage,index)=><button key={stage.name} type="button" onClick={()=>pickedStage(stage.name)} aria-pressed={locationState.stage===stage.name}
          style={{'--cs-stage-height':`${Math.max(2,stage.amount/Math.max(1,...bookStages.map(s=>s.amount))*100)}%`} as CSSProperties}>
          <span className="cs-stage-pillar" aria-hidden><i style={{ background: atlasChartColors[index % atlasChartColors.length] }} /></span>
          <span>{stage.name}</span><strong>{cash(stage.amount)}</strong><small>{stage.delta == null ? 'Prior period unavailable' : (stage.delta*100).toFixed(1)+'% week over week'}</small>
        </button>)}
      </div>
    </> : persona==='retail' ? <>
      <div className="pr-pipeline-entry"><div><strong>The shape of your pipeline over time.</strong>
        <span>Eight dated snapshots · totals and current-open stage cohorts</span></div>
        <button className="secondary" type="button" onClick={()=>setHistoryOpen(true)}>Explore pipeline history</button>
      </div>
      <section className="atlas-retail-stage">
        <div><p>Open pipeline{ownerName && ' · '+ownerName}</p><div className="atlas-retail-pipeline-total">{cash(aggregate.data?.amount)}</div>
          <strong>{stages.reduce((sum,stage)=>sum+(stage.count??0),0).toLocaleString()} open opportunities</strong>
          <p>Aggregate across all open stages. The individual deals below are paginated.</p>
        </div>
        <RetailStages stages={stages} total={aggregate.data?.amount} select={pickedStage} current={locationState.stage} color={color} />
      </section>
    </> :
      <section className="ws-pipeline-ledger">
        <div className="ws-pipeline-total"><div className="ws-metric">
          <span>My open pipeline</span><strong>{cash(aggregate.data?.amount)}</strong>
          <small>{records.data?.totalCount != null && !locationState.search && !locationState.stage ? records.data.totalCount.toLocaleString()+' opportunities · CRM aggregate' : 'CRM aggregate'}</small>
          </div>
          <span className="ws-ledger-mark"><Icon name="pipeline" /></span></div>
        <StageBar stages={stages} total={aggregate.data?.amount} onSelect={pickedStage} color={color} />
      </section>}
    {historyOpen && <PipelineHistory dates={history.data?.historyDates} amounts={history.data?.scope==='book'?history.data.pipeline.trend:undefined}
      loading={history.loading} close={()=>setHistoryOpen(false)} />}
    {persona!=='commercial' && <div className={persona==='retail'?'atlas-retail-pipeline-controls':'ws-pipeline-controls'}>
      <label className="atlas-pipeline-search">{persona==='wealth'&&'Find a household or opportunity'}
        <input aria-label={persona==='wealth'?'Find a household or opportunity':'Filter opportunities'} value={locationState.search}
          onChange={e=>setFilter('q',e.target.value)} placeholder={persona==='wealth'?'Name, stage or exact record…':'Find a deal or relationship'} />
      </label>
      <label className="atlas-pipeline-stage">{persona==='wealth'?'Recorded stage':'Stage'}
        <select aria-label={persona==='wealth'?'Recorded stage':'Stage'} value={locationState.stage} onChange={e=>setFilter('stage',e.target.value)}>
          <option value="">All stages</option>
          {stages.map(stage=><option key={stage.name} value={stage.name}>{stage.name}{persona==='retail' && stage.count!=null && ' · '+stage.count.toLocaleString()+' total'}</option>)}
        </select>
      </label>
      {persona==='wealth' && records.data && <span>{records.data.totalCount.toLocaleString()} matching open records</span>}
    </div>}
    {(records.error || aggregate.error) && <p role="alert">Part of the pipeline is unavailable. <button className="secondary" type="button" onClick={()=>setRetry(v=>v+1)}>Retry</button></p>}
    {records.loading && <p role="status">Loading the pipeline…</p>}
    {persona==='retail' && <section className="viz-workspace">
      <div className="viz-section-heading">
        <div><h2>{mode==='plot'?'The deal landscape':'Plan the next move'}</h2>
          <p>{mode==='plot'?'Recorded opportunity value against recorded close date. Select a deal to inspect it.':'Drag a deal to explore a stage change, or use the stage selector.'}</p></div>
        <div className="viz-switch" aria-label="Pipeline view">
          <button type="button" aria-pressed={mode==='plot'} onClick={()=>setMode('plot')}>Deal plot</button>
          <button type="button" aria-pressed={mode==='board'} onClick={()=>setMode('board')}>Planning board</button>
        </div>
      </div>
      <div className={mode==='plot'?'viz-deal-layout':'viz-board-layout'}>
        {mode==='plot' ? <RetailPlot deals={deals} selected={selected} pick={pick} color={color} /> :
          <StagePlanning deals={deals} stages={stages} pair={preview} setPair={(id,stage)=>setPreview(v=>({...v,[id]:stage}))} pick={pick} />}
        {selected ? <RetailDealInspector deal={selected} preview={preview[selected.Id]} stages={stages}
          setStage={stage=>{setSaved('');setPreview(v=>({...v,[selected.Id]:stage===stageName(selected)?'':stage}));}}
          prepare={()=>setTask(selected)} saved={saved} retain={()=>{
            const value=preview[selected.Id];
            if(value) setSaved(drafts.save({id:selected.Id,recordId:selected.Id,label:title(selected),recorded:stageName(selected),proposed:value})
              ? 'Stage plan saved in this tab.' : 'Stage plan could not be saved.');
          }} /> : <aside className="viz-inspector viz-deal-inspector"><h2>Deal details</h2>
          <p>{records.loading ? 'Loading opportunities…' : 'Choose a deal to inspect its recorded value and close date.'}</p></aside>}
      </div>
      <p className="viz-footnote">The plot and board show this page of deals. Stage previews stay local.</p>
      <div className="atlas-pipeline-pagination">
        {cursorHistory.length>1 && <button type="button" className="secondary" onClick={()=>movePage(cursorHistory.slice(0,-1))}>Previous page</button>}
        {!records.loading && records.data?.pageInfo.hasNextPage && records.data.pageInfo.endCursor &&
          <button type="button" className="secondary" onClick={()=>movePage([...cursorHistory,records.data?.pageInfo.endCursor ?? null])}>Next page</button>}
      </div>
    </section>}
    {persona!=='retail' && <div className={persona==='commercial'?'ca-deal-room':'ws-deal-desk'}>
      <div>
        {persona!=='commercial' && mode==='plot' && <section className="ws-deal-canvas"><DealPlot deals={deals} selected={selected} pick={pick} /></section>}
        <div className={persona==='commercial'?'ca-deal-list':'ws-deal-list'}>
          {deals.map(deal=><button key={deal.Id} type="button" aria-pressed={deal.Id===selected?.Id} onClick={()=>pick(deal.Id)}>
            <span className={persona==='commercial'?'ca-company-symbol':'ws-household-seal'}>{initials(name(deal))}</span>
            {persona === 'commercial' ? <span><strong>{name(deal)}</strong><small>{title(deal)}</small>
              <span><span className="ca-badge">{stageName(deal)}</span> {cash(deal.Amount?.value)}</span></span> : <>
              <span><strong>{name(deal)}</strong><small>{title(deal)} · {stageName(deal)}</small></span>
              <span><b>{cash(deal.Amount?.value)}</b><small>{date(deal.CloseDate?.value)}</small></span></>}
          </button>)}
          {!deals.length && !records.loading && !records.error && <p>No matching opportunities in this book.</p>}
        </div>
        <div className="atlas-pipeline-pagination">
          {cursorHistory.length>1 && <button type="button" className="secondary" onClick={()=>movePage(cursorHistory.slice(0,-1))}>Previous page</button>}
          {!records.loading && records.data?.pageInfo.hasNextPage && records.data.pageInfo.endCursor &&
            <button type="button" className="secondary" onClick={()=>movePage([...cursorHistory,records.data?.pageInfo.endCursor ?? null])}>Next page</button>}
        </div>
      </div>
      {selected && <DealDetail deal={selected} persona={persona} ownerId={ownerId} link={link}
        onReview={onDealProposal && (() => onDealProposal(selected, 'opportunity'))}
        onPrepare={() => onDealProposal ? onDealProposal(selected, 'task') : setTask(selected)} />}
    </div>}
    {locationState.deal && !exact.loading && !selected && <p role="alert">The selected opportunity is unavailable in this book.</p>}
    {task && <TaskModal open onClose={()=>setTask(undefined)} clientName={name(task)} clientId={task.AccountId?.value ?? undefined}
      subjectDefault={'Follow up on ' + title(task)} commentsDefault={'Source opportunity ' + task.Id} />}
  </div>;
}
