import type { AppEvent, ConfirmItem, Part, Tool, ToolStep } from "../shared/types.ts";
import type { SseEvent } from "./sse.ts";

const AGENT_MESSAGE = "propertyType/search__agentMessage";
const TOOL_BATCH = "propertyType/search__toolBatch";

interface Segment {
  index: number;
  lightningType: string;
  buf: string;
  depth: number;
  inString: boolean;
  escape: boolean;
  toolStart: number; // index in buf where the current tool object opened, -1 if none
  textEmitted: number; // decoded chars already sent as text-delta
  text: string; // decoded text so far (agent messages / TextChunk)
  tools: Map<string, Tool>;
}

// Decodes the (possibly truncated) JSON string value of "content" in a partial object.
function partialContent(buf: string): string {
  const m = /"content"\s*:\s*"/.exec(buf);
  if (!m) return "";
  let body = "";
  for (let i = m.index + m[0].length; i < buf.length; i++) {
    const c = buf[i];
    if (c === "\\") {
      const esc = buf[i + 1];
      if (esc === undefined) break; // incomplete escape at end of buffer
      if (esc === "u") {
        if (i + 5 >= buf.length) break;
        body += buf.slice(i, i + 6);
        i += 5;
      } else {
        body += c + esc;
        i++;
      }
    } else if (c === '"') {
      break; // end of string
    } else {
      body += c;
    }
  }
  try {
    return JSON.parse(`"${body}"`);
  } catch {
    return "";
  }
}

function toolsFrom(value: unknown): Tool[] {
  const list = (value as { tools?: Tool[] })?.tools ?? [];
  const byId = new Map<string, Tool>();
  for (const t of list) byId.set(t.id, t); // later entries are status updates for the same tool
  return [...byId.values()];
}

// A proposed action awaiting approval: copilotActionInput/* (e.g. UpdateRecordFields), or another typed proposal that
// carries a toolId and a record payload (e.g. the Coworker's search__recordDraft for creating a record).
function isProposal(type: string, value: unknown): boolean {
  if (type.startsWith("copilotActionInput/")) return true;
  const v = value as { toolId?: unknown; recordDetailInput?: unknown } | null;
  return type !== TOOL_BATCH && type !== AGENT_MESSAGE && typeof v?.toolId === "string" && Boolean(v.recordDetailInput);
}

function partFromResult(type: string, value: unknown): Part {
  if (isProposal(type, value)) {
    return { kind: "action", actionType: type, toolId: (value as { toolId?: string })?.toolId, value };
  }
  if (type === AGENT_MESSAGE) return { kind: "text", markdown: String((value as { content?: string })?.content ?? "") };
  if (type === TOOL_BATCH) return { kind: "tools", tools: toolsFrom(value) };
  return { kind: "raw", lightningType: type, value };
}

/**
 * Turns one turn's raw Agent API stream into app events.
 * Handles both stream shapes:
 *  - LightningChunk: pieces of JSON objects ({"content":...} / {"tools":[...]}), finished by Inform.result[]
 *  - Text: TextChunk / ProgressIndicator, finished by Inform.message
 */
export class TurnNormalizer {
  private segments: Segment[] = [];
  private open: Segment | null = null;
  private progress: string[] = [];
  private informResult: Part[] | null = null;
  private informMessage = "";
  private confirm: { messageId: string; items: ConfirmItem[] } | null = null;
  // Per tool id, every step it reported; the final Inform only carries the last state, so the trail lives here.
  private trails = new Map<string, ToolStep[]>();

  push(ev: SseEvent): AppEvent[] {
    const out: AppEvent[] = [];
    const m = ((ev.data as { message?: Record<string, unknown> })?.message ?? {}) as Record<string, unknown>;
    switch (m.type) {
      case "LightningChunk":
        this.feedLightning(String(m.lightningType ?? ""), String(m.value ?? ""), out);
        break;
      case "TextChunk": {
        if (!this.open || this.open.lightningType !== "TextChunk") this.open = this.newSegment("TextChunk");
        const text = String(m.message ?? "");
        this.open.text += text;
        out.push({ type: "text-delta", segment: this.open.index, text });
        break;
      }
      case "ProgressIndicator": {
        const text = String(m.message ?? "");
        this.progress.push(text);
        out.push({ type: "progress", text });
        break;
      }
      case "Inform": {
        this.informMessage = String(m.message ?? "");
        const result = m.result as { type: string; value: unknown }[] | undefined;
        if (result?.length) {
          this.informResult = result.map((r) => partFromResult(r.type, r.value));
          // Action-output-only results (e.g. displayable Apex outputs) carry the reply text in message, not in result.
          if (this.informMessage && !this.informResult.some((p) => p.kind === "text")) {
            this.informResult.unshift({ kind: "text", markdown: this.informMessage });
          }
        }
        break;
      }
      case "Confirm": {
        // The agent wants approval before running actions; render everything it sent, keep the action inputs to reply with.
        const items = (m.confirm as ConfirmItem[] | undefined) ?? [];
        this.informResult = items.map((r) => partFromResult(r.type, r.value));
        if (m.message) this.informResult.unshift({ kind: "text", markdown: String(m.message) });
        this.confirm = { messageId: String(m.id), items: items.filter((i) => isProposal(i.type, i.value)) };
        break;
      }
      case "EndOfTurn":
        out.push({ type: "end-of-turn" });
        break;
      default:
        if (/error|fail/i.test(String(m.type ?? ev.event))) {
          out.push({ type: "error", message: String(m.message ?? m.errorMessage ?? JSON.stringify(ev.data)) });
        }
    }
    return out;
  }

  /** Approval request from a Confirm message, if this turn ended with one. */
  pendingConfirm() {
    return this.confirm;
  }

  /** Authoritative parts for the finished agent message. */
  finalParts(): Part[] {
    if (this.informResult) {
      return this.informResult.map((p) => (p.kind === "tools" ? { ...p, tools: p.tools.map((t) => this.track(t)) } : p));
    }
    const progress: Part[] = this.progress.map((text) => ({ kind: "progress", text }));
    if (this.informMessage) return [...progress, { kind: "text", markdown: this.informMessage }];
    // No Inform (e.g. stream cut short): fall back to what was streamed.
    const streamed: Part[] = this.segments.flatMap((s): Part[] => {
      if (s.tools.size) return [{ kind: "tools", tools: [...s.tools.values()] }];
      return s.text ? [{ kind: "text", markdown: s.text }] : [];
    });
    return [...progress, ...streamed];
  }

  private newSegment(lightningType: string): Segment {
    const seg: Segment = {
      index: this.segments.length,
      lightningType,
      buf: "",
      depth: 0,
      inString: false,
      escape: false,
      toolStart: -1,
      textEmitted: 0,
      text: "",
      tools: new Map(),
    };
    this.segments.push(seg);
    return seg;
  }

  private feedLightning(lightningType: string, value: string, out: AppEvent[]) {
    for (const c of value) {
      if (!this.open || this.open.lightningType === "TextChunk") {
        if (c !== "{") continue; // whitespace between objects
        this.open = this.newSegment(lightningType);
      }
      const seg = this.open;
      seg.buf += c;
      if (seg.inString) {
        if (seg.escape) seg.escape = false;
        else if (c === "\\") seg.escape = true;
        else if (c === '"') seg.inString = false;
        continue;
      }
      if (c === '"') seg.inString = true;
      else if (c === "{" || c === "[") {
        seg.depth++;
        if (c === "{" && seg.depth === 3 && seg.lightningType === TOOL_BATCH) seg.toolStart = seg.buf.length - 1;
      } else if (c === "}" || c === "]") {
        seg.depth--;
        if (c === "}" && seg.depth === 2 && seg.toolStart >= 0) {
          this.emitTool(seg, seg.buf.slice(seg.toolStart), out);
          seg.toolStart = -1;
        }
        if (seg.depth === 0) this.closeSegment(seg, out);
      }
    }
    if (this.open) this.flushText(this.open, out);
  }

  // Records a tool update: a new description is a new step (the previous running step is then done).
  private track(update: Tool): Tool {
    const steps = this.trails.get(update.id) ?? [];
    const last = steps.at(-1);
    if (!last || last.description !== update.description) {
      if (last?.status === "running") last.status = "success";
      steps.push({ description: update.description, status: update.status });
    } else {
      last.status = update.status;
    }
    this.trails.set(update.id, steps);
    return { ...update, steps: steps.map((st) => ({ ...st })) };
  }

  private emitTool(seg: Segment, json: string, out: AppEvent[]) {
    try {
      const tool = this.track(JSON.parse(json) as Tool);
      seg.tools.set(tool.id, tool);
      out.push({ type: "tool", segment: seg.index, tool });
    } catch {
      /* malformed tool object: the final Inform.result still carries it */
    }
  }

  private flushText(seg: Segment, out: AppEvent[]) {
    if (seg.lightningType !== AGENT_MESSAGE) return;
    seg.text = partialContent(seg.buf);
    if (seg.text.length > seg.textEmitted) {
      out.push({ type: "text-delta", segment: seg.index, text: seg.text.slice(seg.textEmitted) });
      seg.textEmitted = seg.text.length;
    }
  }

  private closeSegment(seg: Segment, out: AppEvent[]) {
    this.flushText(seg, out);
    if (seg.lightningType !== AGENT_MESSAGE && seg.lightningType !== TOOL_BATCH) {
      try {
        out.push({ type: "part", segment: seg.index, part: partFromResult(seg.lightningType, JSON.parse(seg.buf)) });
      } catch {
        /* incomplete object: rely on Inform.result */
      }
    }
    this.open = null;
  }
}
