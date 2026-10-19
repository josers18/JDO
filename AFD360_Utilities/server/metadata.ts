import { unzipSync, strFromU8 } from "fflate";
import { getOrgCredentials } from "./orgStore.ts";
import { forgetToken, getToken } from "./salesforce.ts";

const VERSION = "67.0";

const xmlEscape = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

async function soap(orgId: string, body: string, retry = true): Promise<string> {
  const org = getOrgCredentials(orgId);
  const token = await getToken(orgId);
  const res = await fetch(`${org.myDomain}/services/Soap/m/${VERSION}`, {
    method: "POST",
    headers: { "Content-Type": "text/xml", SOAPAction: '""' },
    body:
      `<?xml version="1.0" encoding="utf-8"?><env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/" ` +
      `xmlns="http://soap.sforce.com/2006/04/metadata"><env:Header><SessionHeader><sessionId>${token}</sessionId>` +
      `</SessionHeader></env:Header><env:Body>${body}</env:Body></env:Envelope>`,
  });
  const text = await res.text();
  if (retry && /INVALID_SESSION_ID/.test(text)) {
    forgetToken(orgId);
    return soap(orgId, body, false);
  }
  if (!res.ok) throw new Error(`Metadata API: ${/<faultstring>([^<]+)/.exec(text)?.[1] ?? `HTTP ${res.status}`}`);
  return text;
}

/**
 * Retrieves metadata components (e.g. {GenAiPlannerBundle: ["X_v1"]}) and returns the package files by path,
 * e.g. "lightningTypes/x/renderer.json". Components that don't exist are simply absent.
 */
export async function retrieveFiles(orgId: string, members: Record<string, string[]>): Promise<Map<string, string>> {
  const types = Object.entries(members)
    .filter(([, names]) => names.length)
    .map(([type, names]) => `<types>${names.map((n) => `<members>${xmlEscape(n)}</members>`).join("")}<name>${type}</name></types>`)
    .join("");
  const started = await soap(
    orgId,
    `<retrieve><retrieveRequest><apiVersion>${VERSION}</apiVersion><singlePackage>true</singlePackage>` +
      `<unpackaged>${types}<version>${VERSION}</version></unpackaged></retrieveRequest></retrieve>`,
  );
  const id = /<id>([^<]+)<\/id>/.exec(started)?.[1];
  if (!id) throw new Error("Metadata API: retrieve did not start");
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, i < 4 ? 500 : 1500));
    const status = await soap(orgId, `<checkRetrieveStatus><asyncProcessId>${id}</asyncProcessId><includeZip>true</includeZip></checkRetrieveStatus>`);
    if (!/<done>true<\/done>/.test(status)) continue;
    const zip = /<zipFile>([^<]+)<\/zipFile>/.exec(status)?.[1];
    if (!zip) throw new Error(`Metadata API: retrieve ${/<status>([^<]+)/.exec(status)?.[1] ?? "failed"}`);
    const files = unzipSync(Buffer.from(zip, "base64"));
    return new Map(Object.entries(files).map(([path, data]) => [path, strFromU8(data)]));
  }
  throw new Error("Metadata API: retrieve timed out");
}
