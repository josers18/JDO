// Types shared by the Express server and the React app.

export interface OrgSummary {
  id: string;
  name: string;
  myDomain: string;
  clientId: string;
  secretLast4: string;
  createdAt: string;
}

export interface OrgsResponse {
  orgs: OrgSummary[];
  activeOrgId: string | null;
}

export interface OrgInput {
  name: string;
  myDomain: string;
  clientId: string;
  clientSecret?: string; // optional on update = keep existing
}

export interface OrgTestResult {
  ok: boolean;
  username?: string;
  organizationId?: string;
  error?: string;
}

export interface Agent {
  id: string;
  developerName: string;
  label: string;
  agentType: string;
  active: boolean;
  supported: boolean; // false for the "Agentforce (Default)" assistant (AgentType = Employee)
}

export interface ToolStep {
  description: string;
  status: string;
}

export interface Tool {
  id: string;
  description: string;
  count?: string;
  status: string; // running | success | error ...
  category?: string;
  // Every description this tool reported, in order (e.g. agent delegation sub-steps); last = current.
  steps?: ToolStep[];
}

export type Part =
  | { kind: "text"; markdown: string }
  | { kind: "tools"; tools: Tool[] }
  | { kind: "progress"; text: string }
  | { kind: "action"; actionType: string; toolId?: string; value: unknown } // a proposed action awaiting approval
  | { kind: "raw"; lightningType: string; value: unknown };

// An agent Confirm message item (TargetTypeMessage) — sent back verbatim in the approving Reply.
export interface ConfirmItem {
  type: string;
  property?: string;
  value: unknown;
}

export type ConfirmStatus = "pending" | "approved" | "partially-approved" | "rejected" | "superseded";

export interface Message {
  id: string;
  role: "user" | "agent" | "system" | "error";
  parts: Part[];
  createdAt: string;
  turn: number;
  durationMs?: number;
  confirm?: { status: ConfirmStatus; approvedToolIds?: string[] };
}

export interface WireStreamEvent {
  t: number; // ms since request start
  event: string;
  data: unknown;
}

export interface WireEntry {
  id: string;
  turn: number | null;
  label: string; // e.g. "Start session", "Send message (stream)"
  startedAt: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: unknown;
  status?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  streamEvents?: WireStreamEvent[];
  durationMs?: number;
  error?: string;
}

export interface SessionState {
  id: string;
  nextSequenceId: number;
  startedAt: string;
  lastActivityAt: string;
}

export type ConversationStatus = "live" | "expired" | "ended";

export interface ConversationSummary {
  id: string;
  orgId: string;
  agentId: string;
  agentLabel: string;
  title: string;
  status: ConversationStatus;
  turns: number;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation extends ConversationSummary {
  agentType: string;
  bypassUser: boolean;
  session: SessionState | null;
  messages: Message[];
  wire: WireEntry[];
  // The open approval request: agent Confirm message id + action items, tied to our agent message.
  pendingConfirm?: { agentMessageId: string; confirmMessageId: string; items: ConfirmItem[] } | null;
}

export interface CreateConversationInput {
  orgId: string;
  agentId: string;
  bypassUser: boolean;
}

// Events streamed from the server to the browser while a turn runs.
export type AppEvent =
  | { type: "user-message"; message: Message }
  | { type: "text-delta"; segment: number; text: string }
  | { type: "tool"; segment: number; tool: Tool }
  | { type: "progress"; text: string }
  | { type: "part"; segment: number; part: Part }
  | { type: "final"; message: Message }
  | { type: "end-of-turn" }
  | { type: "session-expired" }
  | { type: "error"; message: string }
  | { type: "wire"; entry: WireEntry };
