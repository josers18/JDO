import { warmAgent } from "./hxl.ts";
import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import * as orgs from "./orgStore.ts";
import * as store from "./conversationStore.ts";
import { endSession, listAgents, startSession, streamMessage } from "./agentApi.ts";
import { TurnNormalizer } from "./normalize.ts";
import { SfError, forgetToken, getToken, sfJson } from "./salesforce.ts";
import type { AppEvent, Conversation, CreateConversationInput, Message, OrgInput, Part, WireEntry } from "../shared/types.ts";

export const api = Router();

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;
const wrap = (fn: Handler) => async (req: Request, res: Response) => {
  try {
    const result = await fn(req, res);
    if (!res.headersSent) res.json(result ?? { ok: true });
  } catch (e) {
    const status = e instanceof SfError ? 502 : 400;
    if (!res.headersSent) res.status(status).json({ error: (e as Error).message });
  }
};

const message = (role: Message["role"], parts: Part[], turn: number, durationMs?: number): Message => ({
  id: crypto.randomUUID(),
  role,
  parts,
  turn,
  createdAt: new Date().toISOString(),
  durationMs,
});
const note = (text: string, turn: number) => message("system", [{ kind: "text", markdown: text }], turn);

// Agent API answers an expired/unknown session with 404/410, or 400 mentioning the session.
const isSessionGone = (e: unknown) =>
  e instanceof SfError && (e.status === 404 || e.status === 410 || (e.status === 400 && /session/i.test(e.message)));

const busy = new Set<string>(); // conversations with a turn in flight

// ── Orgs ──────────────────────────────────────────────────────────────
api.get("/orgs", wrap(() => orgs.listOrgs()));
api.post("/orgs", wrap((req) => orgs.createOrg(req.body as OrgInput)));
api.put("/orgs/:id", wrap((req) => {
  forgetToken(String(req.params.id));
  return orgs.updateOrg(String(req.params.id), req.body as OrgInput);
}));
api.delete("/orgs/:id", wrap((req) => orgs.deleteOrg(String(req.params.id))));
api.post("/orgs/:id/activate", wrap((req) => orgs.setActiveOrg(String(req.params.id))));
api.post("/orgs/:id/test", wrap(async (req) => {
  const orgId = String(req.params.id);
  try {
    await getToken(orgId, undefined, true);
    const { myDomain } = orgs.getOrgCredentials(orgId);
    const info = await sfJson<{ preferred_username: string; organization_id: string }>({
      orgId,
      label: "User info",
      method: "GET",
      url: `${myDomain}/services/oauth2/userinfo`,
    });
    return { ok: true, username: info.preferred_username, organizationId: info.organization_id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}));

// ── Agents ────────────────────────────────────────────────────────────
api.get("/orgs/:id/agents", wrap((req) => listAgents(String(req.params.id))));

// ── Conversations ─────────────────────────────────────────────────────
api.get("/conversations", wrap(() => store.listConversations()));
api.get("/conversations/:id", wrap((req) => store.getConversation(String(req.params.id))));

async function openSession(c: Conversation, turn: number) {
  const started = await startSession(c.orgId, c.agentId, c.bypassUser, (w) => store.upsertWire(c, w));
  const now = new Date().toISOString();
  c.session = { id: started.sessionId, nextSequenceId: 1, startedAt: now, lastActivityAt: now };
  c.status = "live";
  const welcome = (started.messages ?? []).map((m) => m.message).filter(Boolean).join("\n\n");
  c.messages.push(note(welcome ? `**Session started.** ${welcome}` : "**Session started.**", turn));
}

api.post("/conversations", wrap(async (req) => {
  const input = req.body as CreateConversationInput & { agentLabel: string; agentType: string };
  const now = new Date().toISOString();
  const c: Conversation = {
    id: crypto.randomUUID(),
    orgId: input.orgId,
    agentId: input.agentId,
    agentLabel: input.agentLabel,
    agentType: input.agentType,
    bypassUser: input.bypassUser,
    title: `New chat with ${input.agentLabel}`,
    status: "ended",
    turns: 0,
    createdAt: now,
    updatedAt: now,
    session: null,
    messages: [],
    wire: [],
  };
  try {
    await openSession(c, 0);
  } catch (e) {
    c.messages.push(message("error", [{ kind: "text", markdown: `Could not start session: ${(e as Error).message}` }], 0));
  }
  store.saveConversation(c);
  // Warm the agent's HXL output types so its first card renders without the ~40 s metadata retrieve.
  warmAgent(c.orgId, c.agentId).catch(() => {});
  return c;
}));

api.post("/conversations/:id/session", wrap(async (req) => {
  const c = store.getConversation(String(req.params.id));
  if (c.session && c.status === "live") {
    await endSession(c.orgId, c.session.id, c.turns, (w) => store.upsertWire(c, w)).catch(() => {});
  }
  try {
    await openSession(c, c.turns);
  } catch (e) {
    c.messages.push(message("error", [{ kind: "text", markdown: `Could not start session: ${(e as Error).message}` }], c.turns));
  }
  store.saveConversation(c);
  return c;
}));

api.delete("/conversations/:id/session", wrap(async (req) => {
  const c = store.getConversation(String(req.params.id));
  if (c.session && c.status === "live") {
    await endSession(c.orgId, c.session.id, c.turns, (w) => store.upsertWire(c, w)).catch((e) => {
      if (!isSessionGone(e)) throw e;
    });
  }
  c.status = "ended";
  c.session = null;
  c.messages.push(note("**Session ended.**", c.turns));
  store.saveConversation(c);
  return c;
}));

api.delete("/conversations/:id", wrap(async (req) => {
  const c = store.getConversation(String(req.params.id));
  if (c.session && c.status === "live") await endSession(c.orgId, c.session.id, c.turns, () => {}).catch(() => {});
  store.deleteConversation(c.id);
}));

function loadLive(id: string, res: Response): Conversation | null {
  let c: Conversation;
  try {
    c = store.getConversation(id);
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
    return null;
  }
  if (c.status !== "live" || !c.session) {
    res.status(409).json({ error: "Session is not live — start a new session" });
    return null;
  }
  if (busy.has(id)) {
    res.status(409).json({ error: "A turn is already in progress" });
    return null;
  }
  return c;
}

// Runs one turn (Text, Reply or Cancel) and relays the normalized stream to the browser as SSE.
async function runTurn(res: Response, c: Conversation, request: Record<string, unknown>, userText: string) {
  busy.add(c.id);
  const session = c.session!;
  const turn = c.turns + 1;
  const send = (ev: AppEvent) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });

  const userMsg = message("user", [{ kind: "text", markdown: userText }], turn);
  c.messages.push(userMsg);
  if (c.turns === 0) c.title = userText.length > 60 ? `${userText.slice(0, 57)}…` : userText;
  send({ type: "user-message", message: userMsg });

  // Stream entries update per event; relay them to the browser at most every 250ms.
  const pending = new Map<string, WireEntry>();
  let timer: NodeJS.Timeout | null = null;
  const flushWire = () => {
    timer = null;
    for (const entry of pending.values()) send({ type: "wire", entry });
    pending.clear();
  };
  const wire = (entry: WireEntry) => {
    store.upsertWire(c, entry);
    pending.set(entry.id, entry);
    timer ??= setTimeout(flushWire, 250);
  };

  const controller = new AbortController();
  res.on("close", () => controller.abort());
  const normalizer = new TurnNormalizer();
  const t0 = Date.now();
  try {
    for await (const ev of streamMessage(c.orgId, session.id, session.nextSequenceId, request, turn, wire, controller.signal)) {
      for (const out of normalizer.push(ev)) send(out);
    }
    session.nextSequenceId++;
    session.lastActivityAt = new Date().toISOString();
    c.turns = turn;
    const final = message("agent", normalizer.finalParts(), turn, Date.now() - t0);
    const confirm = normalizer.pendingConfirm();
    if (confirm?.items.length) {
      final.confirm = { status: "pending" };
      c.pendingConfirm = { agentMessageId: final.id, confirmMessageId: confirm.messageId, items: confirm.items };
    }
    c.messages.push(final);
    send({ type: "final", message: final });
  } catch (e) {
    if (controller.signal.aborted) {
      const partial = normalizer.finalParts();
      partial.push({ kind: "progress", text: "Stopped by user — the session is still live." });
      c.messages.push(message("agent", partial, turn, Date.now() - t0));
      session.nextSequenceId++;
      c.turns = turn;
    } else if (isSessionGone(e)) {
      c.status = "expired";
      c.messages.push(message("error", [{ kind: "text", markdown: `Session expired: ${(e as Error).message}` }], turn));
      send({ type: "session-expired" });
    } else {
      c.messages.push(message("error", [{ kind: "text", markdown: (e as Error).message }], turn));
      send({ type: "error", message: (e as Error).message });
    }
  } finally {
    if (timer) clearTimeout(timer);
    flushWire();
    busy.delete(c.id);
    store.saveConversation(c);
    res.end();
  }
}

// Marks the open approval request as resolved on its agent message.
function resolveConfirm(c: Conversation, status: NonNullable<Message["confirm"]>["status"], approvedToolIds?: string[]) {
  const msg = c.messages.find((m) => m.id === c.pendingConfirm?.agentMessageId);
  if (msg) msg.confirm = { status, approvedToolIds };
  c.pendingConfirm = null;
}

api.post("/conversations/:id/messages", async (req: Request, res: Response) => {
  const text = String(req.body?.text ?? "").trim();
  if (!text) return res.status(400).json({ error: "text is required" });
  const c = loadLive(String(req.params.id), res);
  if (!c) return;
  // Typing instead of approving leaves the agent's proposal unanswered.
  if (c.pendingConfirm) resolveConfirm(c, "superseded");
  await runTurn(res, c, { type: "Text", text }, text);
});

// Approve (all or some) or reject the agent's proposed actions: Reply with the approved action inputs, or Cancel.
api.post("/conversations/:id/confirm", async (req: Request, res: Response) => {
  const c = loadLive(String(req.params.id), res);
  if (!c) return;
  const pending = c.pendingConfirm;
  if (!pending) return res.status(409).json({ error: "Nothing is waiting for approval" });
  const toolIds: string[] | undefined = req.body?.toolIds;
  const approved =
    req.body?.decision === "approve"
      ? pending.items.filter((i) => !toolIds || toolIds.includes(String((i.value as { toolId?: string })?.toolId)))
      : [];
  if (approved.length) {
    const all = approved.length === pending.items.length;
    resolveConfirm(c, all ? "approved" : "partially-approved", approved.map((i) => String((i.value as { toolId?: string })?.toolId)));
    await runTurn(
      res,
      c,
      { type: "Reply", inReplyToMessageId: pending.confirmMessageId, reply: approved },
      `✅ Approved ${approved.length} of ${pending.items.length} proposed change${pending.items.length === 1 ? "" : "s"}`,
    );
  } else {
    resolveConfirm(c, "rejected");
    await runTurn(res, c, { type: "Cancel", inReplyToMessageId: pending.confirmMessageId }, "✖ Rejected the proposed changes");
  }
});
