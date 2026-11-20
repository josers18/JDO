# Video talk track: "After the call"

*ReactCommercial (org jdo-oe0sdd) · Rodriguez Industries · Supercharge Bankers demo. Run `./make-video.sh`; the voice-over is generated in ElevenLabs from the **Say** lines. Draft, 2026-11-19.*

The recorder (`record.mjs`) logs in, opens the client's **Notes & Tools → Notes** tab before capture starts, and clears what the panel wrote (today's Tasks on the account, "Call summary" notes, KYC back to Expired) before and after every take.

**Actions:** `draft` (clicks Draft follow-ups, waits for the draft), `approve` (clicks Approve, waits for "Saved …"), `reload` (reopens the Notes tab so the panel re-reads CRM), plus `slide`, `spot`, `point`, `card`, `pause`.
**Targets:** `panel`, `summary`, `tasks`, `email`, `gaps`, `approve`, `status`, `notes`, `transcript`, `kyc`, or text: `panel:<text>`, `notes:<text>`, `text:<text>`.

---

## S01 · Open
- do: slide 12 Commercial banking · Rodriguez Industries | Forty-one minutes on the phone. *Then the paperwork.* | Allen Carter, relationship manager · Treasury Services proposal review, Nov 15 | Nov 15 = The call: pricing pushback, a new parent company ; *Now = Allen opens the client in ReactCommercial ; One click = Summary, tasks, email, KYC | One transcript · every follow-up drafted · approved in one click
- do: spot 6 panel -- After the call | The latest call, ready to wrap up | Reads the Nov 15 transcript ; Plus Gong sentiment and WorldCheck screening

**Say:** Allen Carter is a commercial relationship manager. On November fifteenth he spent forty-one minutes on the phone with Rodriguez Industries, reviewing a Treasury Services proposal. Normally the next hour goes to notes, tasks and a recap email. Here, the client's page already has an After the call panel, built from the call transcript.

## S02 · The signals
- do: point 4 panel:Sentiment negative -- Gong: the call went badly
- do: point 4 panel:KYC Expired · PEP hit -- KYC expired, and a PEP hit

**Say:** Before he does anything, the panel shows what matters. Gong scored the call negative, with three action items. Know Your Customer is expired, and the latest WorldCheck screening flagged a politically exposed person.

## S03 · Draft
- do: draft
- do: spot 7 summary -- The call, summarized | Drafted from the transcript and signals | Pricing pushback against another bank ; New parent company and a new owner ; Next check-in January fourth

**Say:** Allen clicks Draft follow-ups. Agentforce reads the transcript with the Gong and WorldCheck signals and writes the call summary: the client pushed back on pricing against another bank, they are restructuring under a new holding company with a new thirty percent owner, and the next check-in is January fourth.

## S04 · The commitments
- do: point 6 tasks -- Three commitments, with due dates

**Say:** It turns the three commitments from the call into follow-up tasks with their due dates: revised pricing by November twenty-second, the ownership document checklist, and a liquidity sweep demo before the January call.

## S05 · The recap email
- do: point 6 email -- A recap for the CFO, logged not sent

**Say:** It drafts the recap email to Daniel Okafor, the chief financial officer, in Allen's voice. It lists what was agreed and the documents the bank needs. It's logged to the record, not sent, so Allen stays in control.

## S06 · What compliance needs
- do: spot 7 gaps -- The KYC gaps | Caught from what the client said | A new parent entity: formation documents ; Beneficial ownership for the new owner ; PEP hit: refresh due diligence

**Say:** And it catches what compliance needs. The client mentioned the new parent company almost in passing. The panel turns that into KYC gaps: formation documents, a beneficial ownership certification for the new owner, and refreshed due diligence for the PEP hit.

## S07 · Approve
- do: point 3 approve -- Everything is editable; one click saves it
- do: approve
- do: spot 6 status -- One click, six records | Written straight to Salesforce | Three follow-up tasks ; The email, logged ; The call summary note ; KYC set to Required

**Say:** Every field is editable. When it reads right, Allen clicks Approve. One click writes six records to Salesforce: three follow-up tasks, the logged email, the call summary note, and the KYC status set to Required, with the gaps attached.

## S08 · It landed
- do: reload
- do: point 4 panel:Call summary — -- Today's call summary is now the latest note
- do: point 4 panel:KYC Required -- KYC now reads Required

**Say:** Reload the client and the record has caught up. The call summary is now the latest note on the account, and the KYC status reads Required, so the compliance team sees the gaps today, not next week.

## S09 · Close
- do: card From call to CRM in one click

**Say:** From a forty-one minute call to a clean record, in one click. That's the banker's hour back.
