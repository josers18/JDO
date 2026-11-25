import { connectLookup, lookupOptions, lookupParameters, resourceId } from "../shared/connectLookup";
import { describe, it, expect } from "vitest";
import snapshot from "../server/connect-catalog.json";
import {
  buildConnectRequest,
  editConnectParameter,
  nextConnectPage,
  operationKey,
  type ConnectCatalog,
  type ConnectOperation,
} from "../shared/connect";
import { maskBody, maskHeaders } from "../server/wire";

const catalog: ConnectCatalog = snapshot;
const list = catalog.operations.find((o) => operationKey(o) === "GET /ssot/data-streams")!;
const base = { operation: operationKey(list), version: 67, values: {} };
describe("Connect API catalog", () => {
  it("has every v68 operation, family and path parameter", () => {
    expect(new Set(catalog.operations.map(operationKey)).size).toBe(428);
    expect(new Set(catalog.operations.flatMap((o) => o.families)).size).toBe(36);
    for (const op of catalog.operations) {
      expect(op.path.startsWith("/ssot/")).toBe(true);
      const names = [...op.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]).sort();
      expect(
        op.parameters
          .filter((p) => p.location === "path")
          .map((p) => p.name)
          .sort(),
      ).toEqual(names);
      expect(op.since).toBeLessThanOrEqual(68);
    }
  });
  it("encodes identifiers and serializes documented parameters only", () => {
    const op: ConnectOperation = {
      ...list,
      path: "/ssot/demo/{id}",
      parameters: [
        { name: "id", type: "string", required: true, location: "path", description: "" },
        { name: "fields", type: "array", location: "query", description: "" },
      ],
    };
    const req = buildConnectRequest(op, { ...base, values: { id: "a?#", fields: '["a","b"]', extra: "ignore" } }, 68);
    expect(req.path).toBe("/services/data/v67.0/ssot/demo/a%3F%23?fields=a&fields=b");
    for (const id of ["..", "", "../other"])
      expect(() => buildConnectRequest(op, { ...base, values: { id } }, 68)).toThrow();
    expect(() => buildConnectRequest(list, { ...base, version: 10 }, 68)).toThrow();
    expect(() => buildConnectRequest(list, { ...base, body: {} }, 68)).toThrow();
  });
  it("uses operation-specific dropdowns for prose choices and preserves editable sort expressions", () => {
    const get = (path: string, name: string) =>
      catalog.operations.find((o) => operationKey(o) === "GET /ssot/" + path)!.parameters.find((p) => p.name === name)!;
    expect(get("data-spaces", "orderBy").enum).toEqual(["ASC", "DESC"]);
    expect(get("data-streams", "orderBy").presets).toContain("DeveloperName DESC");
    expect(get("segments", "orderby").presets).toContain("MarketSegmentType DESC");
    expect(get("data-model-objects/{dataModelObjectName}/relationships", "orderBy").enum).toEqual([
      "FilterSortOrderAsc",
      "FilterSortOrderDesc",
    ]);
    expect(get("data-spaces", "limit").enum).toBeUndefined();
    const retrievers = catalog.operations.find((o) => operationKey(o) === "GET /ssot/machine-learning/retrievers")!;
    expect(retrievers.parameters.find((p) => p.name === "sortOrder")?.itemEnum).toEqual(["Ascending", "Descending"]);
    const req = buildConnectRequest(
      retrievers,
      { ...base, version: 68, values: { sortOrder: '["Descending","Ascending"]' } },
      68,
    );
    expect(req.path).toContain("sortOrder=Descending&sortOrder=Ascending");
  });
  it("distinguishes method-specific requirements and conditional fields", () => {
    function body(method: string, path: string) {
      return catalog.operations.find((o) => o.method === method && o.path === path)?.body?.fields ?? [];
    }
    const create = body("POST", "/ssot/calculated-insights");
    const patch = body("PATCH", "/ssot/calculated-insights/{apiName}");
    expect(create.find((f) => f.name === "apiName")?.required).toBe(true);
    expect(patch.find((f) => f.name === "apiName")?.required).toBeUndefined();
    expect(create.find((f) => f.name === "publishScheduleStartDateTime")?.conditional).toBe(true);
    const activation = body("POST", "/ssot/activations").find((f) => f.name === "activationTargetName");
    expect(activation?.conditional).toBe(true);
    expect(activation?.required).toBeUndefined();
    expect(
      body("POST", "/ssot/document-processing/actions/detect-schema").find((f) => f.name === "threshold")?.conditional,
    ).toBeUndefined();
  });
  it("starts changed filters on page one and respects an explicitly entered offset", () => {
    const op = catalog.operations.find((o) => operationKey(o) === "GET /ssot/machine-learning/configured-models")!;
    const page = { limit: "25", offset: "75" };
    expect(editConnectParameter(op, page, "modelType", "Predictive")).toEqual({
      limit: "25",
      modelType: "Predictive",
    });
    expect(editConnectParameter(op, page, "offset", "100").offset).toBe("100");
  });
  it("takes a qualified model identifier from its own resource URL", () => {
    const path = "/services/data/v67.0/ssot/machine-learning/configured-models";
    const list = "https://demo.my.salesforce.com" + path + "?modelType=Predictive";
    const id = (url: string) => resourceId({ name: "DefaultARIMA", url }, "configuredModelIdOrName", list);
    expect(id(path + "/sfdc_ai__DefaultARIMA")).toBe("sfdc_ai__DefaultARIMA");
    expect(id(path + "/x/y")).toBe("DefaultARIMA");
    expect(id("https://elsewhere.example" + path + "/wrong")).toBe("DefaultARIMA");
  });
  it("only follows pagination for the same org and operation", () => {
    const path = "/services/data/v67.0/ssot/data-streams?offset=10";
    const page = (url: string) => nextConnectPage(list, base, { nextPageUrl: url }, "https://demo.my.salesforce.com");
    expect(page(path)?.values.offset).toBe("10");
    expect(page("https://example.com" + path)).toBeUndefined();
    expect(page("/services/data/v67.0/ssot/data-spaces?offset=10")).toBeUndefined();
  });
  it("masks Connect credential structures and signed URLs", () => {
    const secret = "NEVER_SHOW_THIS";
    expect(
      JSON.stringify(maskBody({ credentials: { custom: secret }, signingKey: secret, presignedUrls: [secret] })),
    ).not.toContain(secret);
    expect(maskHeaders({ "set-cookie": secret })).toEqual({ "set-cookie": "••••" });
  });
});

describe("org lookup choices", () => {
  it("discovers ML filters without applying the current filter or page to discovery", () => {
    const op = catalog.operations.find((o) => operationKey(o) === "GET /ssot/machine-learning/configured-models")!;
    const field = op.parameters.find((p) => p.name === "modelType")!;
    const source = connectLookup(op, field, catalog.operations, 67)!;
    expect(lookupParameters(source, { modelType: "Predictive", offset: "75" })).toEqual({});
    expect([
      ...lookupOptions(source, field, {
        configuredModels: [{ modelType: "Predictive" }, { modelType: "invalid" }],
        other: [{ modelType: "Generative" }],
      }),
    ]).toEqual([["Predictive", "Predictive"]]);
  });
  it("selects data space names for write bodies through a GET", () => {
    const op = catalog.operations.find((o) => operationKey(o) === "POST /ssot/activation-targets")!;
    const field = op.body!.fields.find((f) => f.name === "dataSpaceName")!;
    const source = connectLookup(op, field, catalog.operations, 67)!;
    expect(operationKey(source.operation)).toBe("GET /ssot/data-spaces");
    expect([
      ...lookupOptions(source, field, { dataSpaces: [{ id: "123", name: "default", label: "Default space" }] }),
    ]).toEqual([["default", "Default space"]]);
  });
});

it("clears a selected record when its data graph or space changes", () => {
  const op = catalog.operations.find((o) => o.path === "/ssot/data-graphs/data/{dataGraphEntityName}")!;
  const values = { dataGraphEntityName: "Accounts", lookupKeys: "[ssot__Id__c=001]" };
  expect(editConnectParameter(op, values, "dataspace", "retail").lookupKeys).toBeUndefined();
  expect(editConnectParameter(op, values, "dataGraphEntityName", "Individuals").lookupKeys).toBeUndefined();
  expect(editConnectParameter(op, values, "noCache", "true").lookupKeys).toBe(values.lookupKeys);
});
