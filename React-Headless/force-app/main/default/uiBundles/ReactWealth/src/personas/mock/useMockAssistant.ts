import { useCallback, useRef, useState } from 'react';
import type { AssistantMessage } from '@shared';

/**
 * Mock Agentforce assistant. Same public surface the live Agentforce hook will
 * expose ({ messages, send, sending }), so <AssistantDock> binds identically in
 * both phases. Canned replies are keyed off simple keyword matching to feel
 * responsive during the visual review.
 */
export function useMockAssistant(persona: 'retail' | 'commercial' | 'wealth') {
  const greeting: AssistantMessage = {
    id: 'a0',
    role: 'agent',
    text:
      persona === 'retail'
        ? 'Morning! 9 households need attention today. Ask me to summarize any client or draft outreach.'
        : persona === 'commercial'
          ? 'Good morning. 4 accounts are on covenant watch. Ask about any relationship or credit signal.'
          : 'Good morning. 7 reviews are due and Whitfield is drifting from policy. Ask me to model a rebalance.',
  };
  const [messages, setMessages] = useState<AssistantMessage[]>([greeting]);
  const [sending, setSending] = useState(false);
  const seq = useRef(0);

  const reply = useCallback(
    (prompt: string): string => {
      const p = prompt.toLowerCase();
      if (p.includes('churn') || p.includes('risk'))
        return 'Highest risk is Ada Lovelace (91): balance down 62% and direct deposit stopped. I drafted a retention call script with a fee-waiver offer — want me to log the task?';
      if (p.includes('rebalance'))
        return 'Whitfield is 78% equity vs a 65% target. Selling $2.9M VTI and buying AGG restores policy and harvests $180k in gains. Shall I stage the orders?';
      if (p.includes('summar'))
        return 'Here’s the one-line: strong tenure, mass-affluent, rate-shopping detected. Next best action is a HELOC refinance offer.';
      if (p.includes('covenant'))
        return 'Northwind’s projected DSCR is 1.05x vs a 1.25x minimum next quarter. I recommend a pre-emptive waiver conversation and updated 13-week cash flow.';
      return 'On it — I’ve pulled the relevant Data Cloud signals and CRM records. (This is a mock reply during design review.)';
    },
    []
  );

  const send = useCallback(
    (text: string) => {
      seq.current += 1;
      const userMsg: AssistantMessage = { id: `u${seq.current}`, role: 'user', text };
      setMessages(prev => [...prev, userMsg]);
      setSending(true);
      const answer = reply(text);
      window.setTimeout(() => {
        seq.current += 1;
        setMessages(prev => [...prev, { id: `a${seq.current}`, role: 'agent', text: answer }]);
        setSending(false);
      }, 650);
    },
    [reply]
  );

  return { messages, send, sending };
}
