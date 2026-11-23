export interface ConnectField {
  name: string;
  type: string;
  description: string;
  required?: boolean;
  conditional?: boolean;
  enum?: (string | number)[];
  presets?: string[];
  itemEnum?: (string | number)[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
}
export interface ConnectOperation {
  method: string;
  path: string;
  families: string[];
  title: string;
  description: string;
  since: number;
  parameters: (ConnectField & { location: string })[];
  body?: { required: boolean; fields: ConnectField[]; examples: Record<string, unknown> };
}
export interface ConnectCatalog {
  version: string;
  operations: ConnectOperation[];
}
export const operationKey = (op: ConnectOperation) => op.method + " " + op.path;

export function fieldValue(field: ConnectField, value: string): unknown {
  if (field.enum && !field.enum.some((choice) => String(choice) === value))
    throw Error(`Choose a listed value for ${field.name}.`);
  if (field.type === "boolean") {
    if (value !== "true" && value !== "false") throw Error(`${field.name} requires true or false.`);
    return value === "true";
  }
  if (field.type === "number" || field.type === "integer") {
    const n = Number(value);
    if (
      !value.trim() ||
      !Number.isFinite(n) ||
      (field.type === "integer" && !Number.isInteger(n)) ||
      (field.minimum !== undefined && n < field.minimum) ||
      (field.maximum !== undefined && n > field.maximum)
    )
      throw Error(`Enter a valid ${field.type} for ${field.name}.`);
    return n;
  }
  if (field.type === "array" || field.type === "object") {
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw Error(`Enter valid JSON for ${field.name}.`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) !== (field.type === "array"))
      throw Error(`${field.name} requires a JSON ${field.type}.`);
    if (field.itemEnum && Array.isArray(parsed) && parsed.some((v) => !field.itemEnum!.includes(v)))
      throw Error(`Choose listed values for ${field.name}.`);
    return parsed;
  }
  return value;
}

export interface ConnectInput {
  operation: string;
  version: number;
  values: Record<string, string>;
  body?: unknown;
}

// Only the catalog supplies the method, path template, and allowed header names.
export function buildConnectRequest(op: ConnectOperation, input: ConnectInput, maxVersion: number) {
  if (!Number.isInteger(input.version) || input.version < op.since || input.version > maxVersion)
    throw Error(`Choose API version ${op.since}–${maxVersion}.`);
  let path = op.path;
  const query = new URLSearchParams();
  const headers: Record<string, string> = {};
  for (const field of op.parameters) {
    const value = input.values?.[field.name];
    if (value === undefined || value === "") {
      if (field.required) throw Error(`Enter ${field.name}.`);
      continue;
    }
    if (typeof value !== "string") throw Error(`Invalid ${field.name}.`);
    const parsed = fieldValue(field, value);
    if (field.location === "path") {
      if (value === "." || value === ".." || /[\\/\x00-\x1f]/.test(value))
        throw Error(`Invalid path segment for ${field.name}.`);
      path = path.replaceAll(`{${field.name}}`, encodeURIComponent(value));
    } else if (field.location === "query") {
      for (const part of Array.isArray(parsed) ? parsed : [parsed]) query.append(field.name, String(part));
    } else if (field.location === "header") {
      if (/[\r\n]/.test(value)) throw Error("Invalid header.");
      headers[field.name] = value;
    }
  }
  if (!op.body && input.body !== undefined) throw Error("This operation has no request body.");
  if (op.body?.required && input.body === undefined) throw Error("Enter the request body.");
  if (input.body !== undefined && (input.body === null || typeof input.body !== "object" || Array.isArray(input.body)))
    throw Error("The request body must be a JSON object.");
  for (const field of op.body?.fields ?? []) {
    if (input.body && field.required && !Object.hasOwn(input.body, field.name))
      throw Error(`Enter ${field.name} in the request body.`);
  }
  return {
    method: op.method,
    path: `/services/data/v${input.version}.0${path}${query.size ? "?" + query : ""}`,
    headers,
    body: input.body,
  };
}

// Editing a paginated read starts the new result set at the beginning; an explicit offset still wins.
export function editConnectParameter(
  op: ConnectOperation,
  values: Record<string, string>,
  name: string,
  value: string,
) {
  const next = { ...values, [name]: value };
  if (
    name !== "offset" &&
    value !== values[name] &&
    Number(values.offset) > 0 &&
    op.method === "GET" &&
    op.parameters.some((p) => p.name === "offset" && p.location === "query" && !p.required)
  )
    delete next.offset;
  return next;
}

// Pagination stays on the original catalog operation. Salesforce supplies only the next query values.
export function nextConnectPage(
  op: ConnectOperation,
  sent: ConnectInput,
  response: unknown,
  domain: string,
): ConnectInput | undefined {
  if (op.method !== "GET" || !response || typeof response !== "object") return;
  const body = response as Record<string, unknown>;
  if (typeof body.nextPageUrl !== "string" || !body.nextPageUrl) return;
  try {
    const request = buildConnectRequest(op, sent, sent.version);
    const current = new URL(request.path, domain);
    const next = new URL(body.nextPageUrl, current);
    if (next.origin !== current.origin || next.pathname !== current.pathname) return;
    const values = { ...sent.values };
    for (const name of new Set(next.searchParams.keys())) {
      const parameter = op.parameters.find((p) => p.location === "query" && p.name === name);
      if (!parameter) return;
      values[name] =
        parameter.type === "array" ? JSON.stringify(next.searchParams.getAll(name)) : next.searchParams.get(name)!;
    }
    const input = { ...sent, values };
    if (buildConnectRequest(op, input, sent.version).path !== request.path) return input;
  } catch {
    return;
  }
}
