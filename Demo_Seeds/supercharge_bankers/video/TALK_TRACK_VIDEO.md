# Video talk track: "After the call"

*Commercial Bankers Cockpit (org jdo-oe0sdd) · Rodriguez Industries · Supercharge Bankers demo. Run `./make-video.sh`; the voice-over is generated in ElevenLabs from the **Say** lines. Draft, 2026-11-19; voice cues and Multi-Framework close, 2026-11-24.*

The recorder (`record.mjs`) logs in, opens the V2 company page on its **Notes & tools** tab before capture starts, and clears what the panel wrote (today's Tasks on the account, "Call summary" notes, KYC back to Expired) before and after every take.

**Actions:** `draft` (clicks Draft follow-ups, waits for the draft), `approve` (clicks Approve, waits for "Saved …"), `reload` (reopens the Notes tab so the panel re-reads CRM), plus `slide`, `spot`, `point`, `card`, `pause`.
**Targets:** `panel`, `summary`, `tasks`, `email`, `gaps`, `compliance`, `approve`, `status`, `notes`, `transcript`, `kyc`, or text: `panel:<text>`, `notes:<text>`, `text:<text>`, `summary:<regex>` (underlines the matching sentence of the drafted call summary).

---

## S01 · Open
- do: slide 11 Commercial banking · Rodriguez Industries | Forty-one minutes on the phone. *Then the paperwork.* | Allen Carter, relationship manager · Treasury Services proposal review, Nov 15 | Nov 15 = The call: pricing pushback, a new parent company ; *Now = Allen opens the client in the Commercial Bankers Cockpit ; One click = Summary, tasks, email, KYC | One transcript · every follow-up drafted · approved in one click
- do: spot 5 panel -- After the call | The latest call, ready to wrap up | Reads the Nov 15 transcript ; Plus call sentiment and compliance screening

**Say:** Allen Carter is a commercial relationship manager. On November fifteenth, he spent forty-one minutes on the phone with Rodriguez Industries, reviewing a Treasury Services proposal. Normally the next hour goes to notes, tasks and a recap email. Here, the client's page already has an After the call panel, built from the call transcript.

## S02 · The signals
- do: point 4 panel:Sentiment negative -- Call sentiment: it went badly
- do: point 4 compliance -- KYC expired, and the ownership changed

**Say:** Before he does anything, the panel shows what matters. The call sentiment came back negative, with three action items. The know-your-customer review is expired, and the call surfaced a change in ownership.

## S03 · Draft
- do: draft
- do: pause 1

**Say:** Allen clicks Draft follow-ups. Agentforce reads the transcript, along with the call sentiment, and writes everything that comes next.

## S03b · The call summary
- do: point 3.2 summary:pric
- do: point 3.5 summary:owner|parent|restructur
- do: point 2.4 summary:check.?in|january

**Say:** First, the call summary. The client pushed back on pricing against another bank. They are restructuring under a new holding company, with a new thirty percent owner. And the next check-in is January fourth.

## S04 · The commitments
- do: point 6 tasks -- Three commitments, with due dates

**Say:** It turns the three commitments from the call into follow-up tasks with their due dates: revised pricing by November twenty-fifth, the ownership document checklist, and a liquidity sweep demo before the January call.

## S05 · The recap email
- do: point 6 email -- A recap for the CFO, logged not sent

**Say:** It drafts the recap email to Daniel Okafor, the chief financial officer, in Allen's voice. It lists what was agreed and the documents the bank needs. It's logged to the record, not sent, so Allen stays in control.

## S06 · What compliance needs
- do: spot 7 gaps -- The KYC gaps | Caught from what the client said | KYC review expired: refresh it ; A new parent entity: formation documents ; Beneficial ownership for the new owner

**Say:** And it catches what compliance needs. The client mentioned the new parent company almost in passing. The panel turns that into KYC gaps: the expired review, formation documents for the new parent, and a beneficial ownership certification for the new owner.

## S07 · Approve
- do: point 3 approve -- Everything is editable; one click saves it
- do: approve

**Say:** Every field is editable. When it reads right, Allen clicks Approve. Nothing is written until he does, because the agent drafts and the banker decides. Now it saves everything to Salesforce.

## S07b · Six records
- do: spot 6 status -- One click, six records | Written straight to Salesforce | Three follow-up tasks ; The email, logged ; The call summary note ; KYC set to Required

**Say:** That one click writes six records to Salesforce: three follow-up tasks, the logged email, the call summary note, and the KYC status set to Required, with the gaps listed for compliance.

## S08 · It landed
- do: reload
- do: point 4 notes:Call summary — -- Today's call summary is now the latest note
- do: point 4 notes:Required -- KYC now reads Required

**Say:** Reload the client and the record has caught up. The call summary is now the latest note on the account, and the KYC status reads Required, so the compliance team sees the gaps today, not next week.

## S09 · Close
- do: card From call to CRM in one click
- do: pause 4.5
- do: card Built with React on Salesforce Multi-Framework. Context from Data 360. Governed by Salesforce.

**Say:** From a forty-one minute call to a clean record, in one click. And this cockpit is a React app, running natively on Salesforce with Salesforce Multi-Framework. So the team builds the banker's experience with the latest front-end tools, the same components and libraries they already use, shaped around how each banker works. Data Three Sixty serves the context, and sign-in, security and governance come built in from the platform. That's the banker's hour back.
