---
target: Chat page
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/jsifontes/Documents/Git/JDO/AFD360_Utilities/web/src/chat/ChatModule.tsx"
target_fingerprint: "sha256:e639bc61202390abc81e38e6af7acadce96192ee03ed1e5526396528d2a8a448"
target_path: /Users/jsifontes/Documents/Git/JDO/AFD360_Utilities/web/src/chat/ChatModule.tsx
timestamp: 2026-10-12T20-03-46Z
slug: web-src-chat-chatmodule-tsx
---
# Critique: Chat module (web/src/chat/ChatModule.tsx) — 26/40

Heuristics: 1:3 2:3 3:3 4:2 5:3 6:3 7:3 8:2 9:2 10:2.

Specificity: mostly authored (two-lane system, Navy & Gold, Wire strips); gallery grid and shell are generic.
Detector: design-system-font-size CardHead.tsx:49 (11px); browser line-length 29, nested-cards 22 (+159 Wire rows, false positive). HXL iframe not scanned.

## Priority issues
- [P1] HXL header uses sent lane inside a received message (HxlCard.tsx:91-97); triple frame. Fix: BAR.neutral/BADGE.neutral, drop outer border-sent-line wrapper.
- [P1] Wire panel can squeeze chat to ~450px (ChatModule.tsx:68 wireMax 60%, persisted at :100); 1000px slide-over has no scrim. Fix: cap ~45%, chat min ~560px, scrim + Esc.
- [P2] Assistant prose ~130-145ch/line (thread max-w-[72rem]). Fix: cap prose ~70ch in MessageView.tsx; tables/HXL/tool cards full width.
- [P2] Chip text 11px below 12px floor (CardHead.tsx:49). Fix: text-xs.
- [P2] Session bar metadata wraps with leading separators; "Live" + "idle 94h" contradiction. Fix: nowrap items, separators between, truncate IDs, likely-expired state.

## Persona red flags
- Alex: telemetry rows flood Wire (no filter); no shortcuts.
- Sam: no aria-live/role=log on thread; doubled focus ring (AgentGallery.tsx:85, ChatModule.tsx:424); 16px checkboxes.
- SE on projector: 11px chips, faint legend swatches, squeezed chat, emoji flush with labels.

## Minor
- Approval reassurance copy muted (ApprovalCard.tsx:150) — unverified live.
- Stats Tokens columns all dashes when empty; Turn panel >4 chunks.
- "Earlier" only sidebar group; gallery's only CTA disabled.
