import { Panel, PredictionCard } from '@shared';
import { AgentforceSummaryCard } from './AgentforceSummaryCard';
import type { Full360, MlPrediction } from './full360Types';

const PRED_COLOR = { positive: 'var(--wp-pos)', opportunity: 'var(--wp-accent)', risk: 'var(--wp-neg)', neutral: 'var(--wp-text-faint)' };

/**
 * Contextual right sidebar — swaps the ML prediction(s) + Agentforce summary
 * shown to match the active tab, so the intelligence always relates to what the
 * banker is looking at. Always includes the persistent Account summary + the
 * relevant prediction models.
 */
export function ContextSidebar({ data, tab, accountId }: { data: Full360; tab: string; accountId: string }) {
  // which agentforce summaries + predictions are relevant per tab
  const map: Record<string, { af: string[]; ml: MlPrediction['key'][] }> = {
    Overview: { af: ['account'], ml: ['attrition', 'productRec'] },
    Details: { af: ['account'], ml: ['productRec'] },
    Journey: { af: ['account'], ml: ['productRec'] },
    Money: { af: ['transaction', 'trade'], ml: ['productRec'] },
    Accounts: { af: ['transaction'], ml: ['productRec'] },
    Transactions: { af: ['transaction'], ml: ['attrition'] },
    Trades: { af: ['trade'], ml: ['productRec'] },
    Engagement: { af: ['interaction', 'csat'], ml: ['csat', 'attrition'] },
    Cases: { af: ['case'], ml: ['csat'] },
    Opportunities: { af: ['opportunity'], ml: ['productRec'] },
    Campaigns: { af: ['campaign'], ml: ['productRec'] },
    Risk: { af: ['account'], ml: ['attrition', 'csat', 'productRec'] },
    Tearsheet: { af: ['account'], ml: [] },
  };
  const cfg = map[tab] ?? { af: ['account'], ml: ['attrition'] };
  const predictions = data.predictions.filter(p => cfg.ml.includes(p.key));
  const summaries = cfg.af.map(k => data.agentforce[k]).filter(Boolean);

  return (
    <div style={{ display: 'grid', gap: '1rem', position: 'sticky', top: 16 }}>
      {predictions.map(p => (
        <Panel key={p.key} title={p.title} index={0}>
          <PredictionCard title={p.title} score={p.score} scoreLabel={p.scoreLabel} outcome={p.outcome} drivers={p.drivers} color={PRED_COLOR[p.tone]} />
        </Panel>
      ))}
      {summaries.map(s => (
        <AgentforceSummaryCard key={s.key} summary={s} accountId={accountId} />
      ))}
    </div>
  );
}
