import { useState } from 'react';
import { Modal, CrmNote } from '../Modal';
import { Button } from '../Button';
import { Icon } from '../iconMap';
import { Field, TextInput, TextArea, GenLine } from './fields';
import { useCrmAction } from './useCrmAction';
import { runPromptFlow, stripHtml, type PromptFlow } from '../../data/promptClient';

const bankerSignOff = 'Best,\nJose Sifontes\nCumulus Financial Services';

function composeDraft(clientName: string): string {
  const first = clientName.split(/\s+/)[0] || 'there';
  return `Hi ${first},\n\nI wanted to reach out personally. I noticed a few items open on your account and want to make sure we get them fully resolved for you.\n\nDo you have 15 minutes this week for a quick call? I can walk through everything and take care of it in one go.\n\n${bankerSignOff}`;
}

/**
 * Draft-email modal. "Generate draft" composes a template instantly, then
 * (best-effort, never blocking) attempts to enrich it via a prompt flow. Send
 * writes an EmailMessage through the CRM bridge.
 */
export function EmailModal({
  open,
  onClose,
  clientName,
  clientId,
  toAddress = '',
  promptFlow,
}: {
  open: boolean;
  onClose: () => void;
  clientName: string;
  clientId?: string;
  toAddress?: string;
  promptFlow?: PromptFlow;
}) {
  const { submit, loading, error } = useCrmAction(onClose);
  const [to, setTo] = useState(toAddress);
  const [subject, setSubject] = useState('Checking in — a couple of quick next steps');
  const [body, setBody] = useState('');
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    // Composed-first: show a useful draft immediately.
    setBody(composeDraft(clientName));
    if (!promptFlow || !clientId) return;
    setGenerating(true);
    try {
      const raw = await runPromptFlow(promptFlow, clientId);
      const clean = stripHtml(raw);
      if (clean) setBody(`${clean}\n\n${bankerSignOff}`);
    } catch {
      /* keep the composed draft */
    } finally {
      setGenerating(false);
    }
  };

  const send = () =>
    void submit(
      { action: 'email', subject, toAddress: to, htmlBody: body.replace(/\n/g, '<br>') },
      'Email sent',
      `${clientName} · EmailMessage`,
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="ai"
      icon={<Icon name="email" size={17} />}
      title="Draft email"
      subtitle={clientName}
      footer={
        <>
          <CrmNote>Draft via prompt flow · sends as EmailMessage</CrmNote>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="accent" onClick={send} disabled={loading}>
            {loading ? 'Sending…' : 'Send email'}
          </Button>
        </>
      }
    >
      <Field label="To">
        <TextInput type="email" placeholder="client@email.com" value={to} onChange={e => setTo(e.target.value)} />
      </Field>
      <Field label="Subject">
        <TextInput value={subject} onChange={e => setSubject(e.target.value)} />
      </Field>
      <div className="mb-3.5">
        <Button variant="ai" size="sm" onClick={() => void generate()} disabled={generating}>
          ✦ Generate draft with Agentforce
        </Button>
      </div>
      {generating && <GenLine>Generating from CRM history &amp; recent activity…</GenLine>}
      <Field label="Body">
        <TextArea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Write, or generate a draft from the client's history…"
        />
      </Field>
      {error && <p className="mt-1 text-[12px] text-risk">{error}</p>}
    </Modal>
  );
}
