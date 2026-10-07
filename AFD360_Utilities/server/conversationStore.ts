import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./env.ts";
import type { Conversation, ConversationSummary, WireEntry } from "../shared/types.ts";

const DIR = path.join(DATA_DIR, "conversations");
const MAX_WIRE_ENTRIES = 400;
const ID = /^[0-9a-f-]{36}$/;

function file(id: string) {
  if (!ID.test(id)) throw new Error("Invalid conversation id");
  return path.join(DIR, `${id}.json`);
}

export function summarize(c: Conversation): ConversationSummary {
  const { id, orgId, agentId, agentLabel, title, status, turns, createdAt, updatedAt } = c;
  return { id, orgId, agentId, agentLabel, title, status, turns, createdAt, updatedAt };
}

export function listConversations(): ConversationSummary[] {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => summarize(JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"))))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getConversation(id: string): Conversation {
  const p = file(id);
  if (!fs.existsSync(p)) throw new Error(`Unknown conversation ${id}`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function saveConversation(c: Conversation) {
  c.updatedAt = new Date().toISOString();
  if (c.wire.length > MAX_WIRE_ENTRIES) c.wire = c.wire.slice(-MAX_WIRE_ENTRIES);
  fs.writeFileSync(file(c.id), JSON.stringify(c, null, 2));
}

export function deleteConversation(id: string) {
  fs.rmSync(file(id), { force: true });
}

// Upsert by id: the same wire entry is re-reported as its response/stream progresses.
export function upsertWire(c: Conversation, entry: WireEntry) {
  const i = c.wire.findIndex((w) => w.id === entry.id);
  if (i >= 0) c.wire[i] = entry;
  else c.wire.push(entry);
}
