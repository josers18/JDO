---
version: 1
slug: "web-src-app-tsx"
primary_target: "web/src/App.tsx"
related_targets: []
---

Mode: operate

THESIS: A live API test bench that an SE can put on a customer's screen. Every exchange with Salesforce shows up as a clearly sided, timestamped card: what we sent, what came back, and what the agent did in between.

OWN-WORLD: A refined flight board (A2). Softly rounded cards sit on a tinted ground. Sent cards are cool, received cards are warm, and each card has a lane chip (→ Sent / ← Received). A dark-tinted sidebar sets the session list apart from the canvas. Tool trails are checklists on a spine. Approval cards say outright that nothing changes until you approve. Archivo is the UI voice; JetBrains Mono is used only for IDs, timestamps and payloads.

STORY: Pick an agent, then the session bar shows Live. Each turn adds a sent card and a received card. A delegation unfolds as a checked trail. A proposed write becomes an approval card. The Wire panel mirrors every call with the same sent/received color pairing.

FIRST VIEWPORT: Rail with theme picker, then the session sidebar (org, New chat, conversations with live dots), then the session bar and the thread, then the Wire panel.

FORM: concept seed f13ddaaf (flight progress strips), refined. 17 user-selectable themes ship as token sets. Each theme defines ground/surface/line/ink×3, side×5, rail×3, sent×4, recv×3, ok/live/err and action/action-ink. Default theme: Navy & Gold.

FINISH: Every theme passes contrast at body text. No glow shadows, no border-left accents above 1px, no eyebrow labels, and no text under 12px. Browser surfaces (selection, scrollbars, focus) are themed. There is no horizontal scroll at any width, and all existing behavior is preserved.
