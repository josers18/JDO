import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR, MASTER_KEY } from "./env.ts";
import { decrypt, encrypt } from "./crypto.ts";
import type { OrgInput, OrgSummary, OrgsResponse } from "../shared/types.ts";

interface StoredOrg extends Omit<OrgSummary, "secretLast4"> {
  secretEnc: string;
}

interface OrgFile {
  orgs: StoredOrg[];
  activeOrgId: string | null;
}

const FILE = path.join(DATA_DIR, "orgs.json");

function read(): OrgFile {
  if (!fs.existsSync(FILE)) return { orgs: [], activeOrgId: null };
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

function write(data: OrgFile) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function summarize(o: StoredOrg): OrgSummary {
  const { secretEnc, ...rest } = o;
  return { ...rest, secretLast4: decrypt(secretEnc, MASTER_KEY).slice(-4) };
}

function normalizeDomain(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

export function listOrgs(): OrgsResponse {
  const data = read();
  return { orgs: data.orgs.map(summarize), activeOrgId: data.activeOrgId };
}

export function getOrgCredentials(id: string) {
  const org = read().orgs.find((o) => o.id === id);
  if (!org) throw new Error(`Unknown org ${id}`);
  return { ...org, clientSecret: decrypt(org.secretEnc, MASTER_KEY) };
}

export function createOrg(input: OrgInput): OrgSummary {
  if (!input.name || !input.myDomain || !input.clientId || !input.clientSecret) {
    throw new Error("name, myDomain, clientId and clientSecret are required");
  }
  const data = read();
  const org: StoredOrg = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    myDomain: normalizeDomain(input.myDomain),
    clientId: input.clientId.trim(),
    secretEnc: encrypt(input.clientSecret.trim(), MASTER_KEY),
    createdAt: new Date().toISOString(),
  };
  data.orgs.push(org);
  data.activeOrgId ??= org.id;
  write(data);
  return summarize(org);
}

export function updateOrg(id: string, input: OrgInput): OrgSummary {
  const data = read();
  const org = data.orgs.find((o) => o.id === id);
  if (!org) throw new Error(`Unknown org ${id}`);
  org.name = input.name.trim();
  org.myDomain = normalizeDomain(input.myDomain);
  org.clientId = input.clientId.trim();
  if (input.clientSecret) org.secretEnc = encrypt(input.clientSecret.trim(), MASTER_KEY);
  write(data);
  return summarize(org);
}

export function deleteOrg(id: string) {
  const data = read();
  data.orgs = data.orgs.filter((o) => o.id !== id);
  if (data.activeOrgId === id) data.activeOrgId = data.orgs[0]?.id ?? null;
  write(data);
}

export function setActiveOrg(id: string) {
  const data = read();
  if (!data.orgs.some((o) => o.id === id)) throw new Error(`Unknown org ${id}`);
  data.activeOrgId = id;
  write(data);
}
