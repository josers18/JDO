# Video talk track: "Identify & Acquire"

*Commercial Bankers Cockpit V2 (org jdo-oe0sdd) · Northgate Point Group · Acquire Prospects demo. Run `./make-video.sh`; the voice-over is generated in ElevenLabs from the **Say** lines. Draft, 2026-11-24.*

The recorder (`record.mjs`) logs in and opens Atlas Today as Allen Carter before capture starts. The take submits one Task to Salesforce (S09), so today's Tasks on Northgate Point Group are deleted before and after every take.

**Actions:** `leads` (Treasury & origination in the Atlas rail, then the Leads & owner introductions tab), `lead` (clicks the Elizabeth Smith lead; waits for its signal pop-up), `company` (Open company; waits for the company page), `tasks` (the company's Activity & plans tab; waits for the new Task), `prepare` (clicks Prepare conversation, waits for Agentforce), `keep` (Keep preparation as a task proposal), `subject <text>` (retypes the task subject, sets priority High), `submit` (Submit to Salesforce, then Confirm in place), plus `slide`, `spot`, `point`, `card`, `pause`, `voice`.
**Targets:** `leads`, `row`, `chips`, `priorities`, `evidence`, `prep`, `answer`, `proposal`, `subject`, `submit`, `signals`, `task`, or text: `text:<text>`, `leads:<text>`, `life:<text>`, `priorities:<text>`, `evidence:<text>`, `prep:<text>`, `proposal:<text>`.

---

## S01 · Open
- do: slide 12 Commercial banking · Identify & acquire | A champion just changed companies. *Be the first call.* | Allen Carter, commercial relationship manager · Columbus, Ohio | Oct 18 = Elizabeth Smith becomes CFO of Northgate Point Group ; Oct 27 = Northgate raises a forty-eight million dollar Series B ; *Today = Allen finds the referral, and reaches her | Data 360 signals · Agentforce prep · one task in Salesforce

**Say:** Allen Carter is a commercial relationship manager. In October, a CFO he used to work with took a new job, at a company the bank doesn't bank yet. Nine days later, that company raised a Series B. He has no idea. However, his cockpit… does.

## S02 · Leads & owner introductions
- do: leads
- do: point 4 row -- A referral, already routed to Allen

**Say:** He opens Treasury and origination, then his leads and owner introductions. These are inbound prospects, already routed to him. At the top is Elizabeth Smith, at Northgate Point Group, a company the bank doesn't bank yet.

## S03 · Three signals
- do: spot 8 chips -- Why now | Three signals on one lead | Champion joined from Sandoval-Jordan Industries ; Intent ninety-four for equipment finance ; Raised a forty-eight million Series B

**Say:** The lead doesn't just say who. It says why now. Three signals from Data 360. A champion moved companies. Northgate is researching equipment finance, with an intent score of ninety-four. And it just raised forty-eight million dollars.

## S04 · The champion
- do: point 5 leads:Champion joined from Sandoval-Jordan Industries -- She knows the bank already

**Say:** That first signal is the one that matters most. Elizabeth was a champion at Sandoval-Jordan Industries, a client Allen already knows. Now she's the chief financial officer at Northgate. That's a warm introduction, not a cold call.

## S05 · The lead
- do: lead
- do: point 4 signals -- Every signal names its source

**Say:** Allen opens the lead. All three signals are here, and each one names its source: UserGems, Demandbase, and Harmonic.

## S05b · The company
- do: company

**Say:** Then he opens Northgate's company page. The bank doesn't bank them yet. So there are no accounts, and no open deals. But Data 360 is already bringing the CRM record and every outside signal together, in one view. Allen doesn't have to go looking.

## S05c · Who to call
- do: point 5 priorities -- Who to call, and why now

**Say:** And once the page loads, the reason to call is right at the top. Call Elizabeth Smith. She's the new chief financial officer at Northgate, and she already knows Allen from her time at Sandoval-Jordan Industries.

## S06 · The evidence
- do: point 5 evidence -- Every claim has a source and a date

**Say:** And every signal shows where it came from. Her move comes from UserGems. The intent comes from Demandbase. And the funding round comes from Harmonic, dated October twenty-seventh.

## S07 · Prepare
- do: prepare
- do: pause 1

**Say:** Next, he clicks Prepare conversation. Agentforce reads the signal and suggests how to open the call.

## S07b · The opening question
- do: point 7 answer -- An opener and a next step, from the evidence

**Say:** It gives him an opener. Congratulate her on the new role, then ask how Northgate plans to finance new equipment. And a next step: a follow-up meeting about financing. It sticks to the evidence, and the credit decision stays with Allen.

## S08 · Reach the CFO
- do: keep
- do: subject Call Elizabeth Smith, new CFO: equipment finance after the Series B
- do: point 3 subject -- Allen's own words, high priority

**Say:** He keeps the preparation as a task, and the evidence comes along in the description. Then he makes it his own, due tomorrow. Call Elizabeth Smith, the new CFO, about equipment finance after the Series B.

## S09 · Into Salesforce
- do: point 3 submit -- Nothing is written until Allen confirms
- do: submit

**Say:** Nothing is written until he says so. He submits it to Salesforce, and confirms, right where he clicked. Behind the scenes, the cockpit writes one task to the Northgate account. It's owned by Allen, due tomorrow, and the evidence and its sources travel with it.

## S09b · On the account
- do: tasks
- do: point 5 task -- The new task, on Northgate's activity

**Say:** And there it is. The task lands on the Northgate account, with the signals and their sources. Tomorrow morning, Allen calls a CFO who already trusts him.

## S10 · Close
- do: card Data 360 finds the prospect · Agentforce prepares the call · Built with React on Salesforce Multi-Framework *That's the power of Data 360.*

**Say:** Data 360 brought the signals together: the champion move, the intent, and the funding. Agentforce turned them into a conversation. And because this cockpit is built with React on Salesforce Multi-Framework, the bank can shape the banker's experience with the latest front-end tools, on the same trusted platform. That's the power of Data 360.
