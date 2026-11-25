import { useState } from 'react';
import { loadCenterConfig } from '../../data/configCache';
import { generateText } from '../../data/aiGenerateClient';
import { localIsoDate } from '../../data/localDate';
import { useSpeech } from '../home/useSpeech';

type BriefProps = { persona: 'retail' | 'wealth'; ownerId: string; facts: string };
export function AtlasBookBrief(props: BriefProps) {
  const date = localIsoDate(new Date());
  return <BookBrief key={[props.persona, props.ownerId, date].join('|')} {...props} date={date} />;
}

function BookBrief({ persona, facts, date }: BriefProps & { date: string }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<'ready'|'loading'|'unavailable'>('ready');
  const speech = useSpeech();
  async function generate() {
    setState('loading');
    speech.stop();
    try {
      const config = await loadCenterConfig(persona);
      const result = await generateText({task:'freeform', modelName:config.models.freeform, ...config.params,
        prompt:'Write a concise daily briefing for the banker using only the supplied dated facts. Preserve all dates, units and amounts exactly. Do not infer missing figures or invent names or explanations.',
        context: date+' · '+persona+' book. '+facts});
      if (!result.text.trim() || result.source !== 'model') throw new Error();
      setText(result.text.trim()); setState('ready');
    } catch { setText(''); setState('unavailable'); }
  }
  return <section aria-label="Book briefing">
    <p><small>{date} · {text ? 'Generated briefing' : 'Book summary'}</small></p>
    <p>{text || facts || 'Book figures are unavailable.'}</p>
    {facts && <div className="wa-actions">
      <button type="button" className="secondary" disabled={state === 'loading'} onClick={generate}>{state === 'loading' ? 'Generating briefing…' : text ? 'Refresh briefing' : 'Generate briefing'}</button>
      {speech.supported && <button type="button" className="secondary" onClick={() => speech.toggle(text || facts)}>{speech.speaking ? 'Stop listening' : 'Listen to briefing'}</button>}
    </div>}
    {state === 'unavailable' && <p role="status">Generation is unavailable. Showing the figures from your book.</p>}
  </section>;
}
