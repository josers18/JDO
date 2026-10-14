import { describe, expect, it } from "vitest";
import { autoCard, resolveTree } from "../server/hxl.ts";

const texts = (n: any): string[] => [...(n.attributes?.text !== undefined ? [String(n.attributes.text)] : []), ...(n.children ?? []).flatMap(texts)];
const defs = (n: any): string[] => [n.definition, ...(n.children ?? []).flatMap(defs)];

describe("resolveTree", () => {
  it("fills whole and embedded bindings, drops meta.if=false nodes, adds ids", () => {
    const tree = resolveTree(
      {
        definition: "tile/column",
        children: [
          { definition: "tile/text", attributes: { text: "{!$attrs.name}" } },
          { definition: "tile/text", attributes: { text: "Owner: {!$attrs.owner.name}" } },
          { definition: "tile/link", attributes: { href: "{!$attrs.url}" }, meta: { if: "{!$attrs.found}" } },
        ],
      },
      { name: "Omega", owner: { name: "Erica" }, url: "https://x", found: false },
    )!;
    expect(texts(tree)).toEqual(["Omega", "Owner: Erica"]);
    expect(defs(tree)).not.toContain("tile/link");
    expect(tree.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("resolveTree — loops and $meta", () => {
  it("repeats meta.forEach blocks with forItem/forIndex and resolves {!$meta.env.orgUrl}", () => {
    const tree = resolveTree(
      {
        definition: "tile/column",
        children: [
          {
            definition: "tile/row",
            meta: { forEach: "{!$attrs.lines}", forItem: "$line", forIndex: "$i" },
            children: [
              { definition: "tile/text", attributes: { text: "{!$i}. {!$line.product}" } },
              { definition: "tile/badge", meta: { if: "{!$line.backordered}" }, attributes: { label: "Backordered" } },
            ],
          },
          { definition: "tile/link", attributes: { href: "{!$meta.env.orgUrl}/lightning/page/home", text: "Home" } },
        ],
      },
      { lines: [{ product: "Gold card", backordered: true }, { product: "Checking" }] },
      "https://org.example",
    )!;
    expect(texts(tree)).toEqual(["0. Gold card", "1. Checking", "Home"]);
    expect(defs(tree).filter((d) => d === "tile/badge")).toHaveLength(1);
    expect((tree.children!.at(-1)!.attributes as any).href).toBe("https://org.example/lightning/page/home");
  });
});

describe("autoCard", () => {
  it("builds a titled field card for an object, hiding ids and turning URLs into a link", () => {
    const card = autoCard("account", { name: "Omega, Inc.", industry: "Technology", accountId: "001am00000qvjs6AAA", recordUrl: "https://o/x", found: true });
    expect(texts(card)).toEqual(["Omega, Inc.", "Account", "Industry", "Technology", "Found", "Yes", "Open in Salesforce"]);
    expect(defs(card)).toContain("tile/link");
  });

  it("keeps columns within HXL's 10-children limit", () => {
    const card = autoCard("record", { name: "Big", ...Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`f${i}`, i])) });
    const maxKids = (n: any): number => Math.max(n.definition === "tile/column" ? (n.children ?? []).length : 0, ...(n.children ?? []).map(maxKids));
    expect(maxKids(card)).toBeLessThanOrEqual(10);
  });

  it("uses a table for lists of records", () => {
    const card = autoCard("records", [{ Name: "Acme", Amount: 5000 }, { Name: "Globex", Amount: 12000 }]);
    const table = JSON.stringify(card).includes('"tile/table"');
    expect(table).toBe(true);
  });

  it("flattens lightning__recordInfoType-shaped records", () => {
    const card = autoCard("record", {
      title: "Joanna Ball",
      sObjectInfo: { label: "Lead" },
      data: { Rating: { label: "Rating", value: "Hot", displayValue: "Hot" }, Id: { value: "00Qam000009wueaEAA" } },
    });
    expect(texts(card)).toEqual(["Joanna Ball", "Lead", "Rating", "Hot"]);
  });

  it("tables a list of recordInfoType records by their data fields", () => {
    const opp = (name: string, amount: string, stage: string) => ({
      id: "006am00000LcOy6AAF",
      recordTypeId: "012am000001mrZgAAI",
      sObjectInfo: { apiName: "Opportunity", label: "Opportunity" },
      title: name,
      data: {
        Id: { value: "006am00000LcOy6AAF", label: "Opportunity ID", displayValue: null },
        Name: { value: name, label: "Name", displayValue: null },
        Amount: { value: 5257150000, label: "Amount", displayValue: amount },
        StageName: { value: stage, label: "Stage", displayValue: stage },
      },
    });
    const card = autoCard("result", [opp("Innovation Pipeline", "USD 5,257,150,000.00", "Qualification"), opp("Cumulus Loan", "USD 1.00", "Closed Won")]);
    const find = (n: any): any => (n.definition === "tile/table" ? n : (n.children ?? []).map(find).find(Boolean));
    const t = find(card).attributes;
    expect(t.columns.map((c: any) => c.header)).toEqual(["Name", "Amount", "Stage"]);
    expect(t.rows[0]).toMatchObject({ Name: "Innovation Pipeline", Amount: "USD 5,257,150,000.00", Stage: "Qualification" });
  });

  it("formats Currency fields as right-aligned currency number columns from the raw value", () => {
    const row = (amount: number | null, display: string | null) => ({
      id: "006am00000LcOy6AAF",
      title: "Deal",
      data: {
        Name: { label: "Name", value: "Deal" },
        Amount: { label: "Amount", value: amount, displayValue: display, dataType: "Currency" },
      },
    });
    const card = autoCard("result", [row(5257150000, "USD 5,257,150,000.00"), row(12.5, "EUR 12.50"), row(null, null)]);
    const find = (n: any): any => (n.definition === "tile/table" ? n : (n.children ?? []).map(find).find(Boolean));
    const t = find(card).attributes;
    expect(t.columns[1]).toEqual({
      key: "Amount",
      header: "Amount",
      align: "right",
      columnType: { type: "number", format: "currency", currencyCodeKey: "_currency:Amount" },
    });
    expect(t.columns.map((c: any) => c.key)).toEqual(["Name", "Amount"]);
    expect(t.rows[0]).toMatchObject({ Amount: "5257150000", "_currency:Amount": "USD" });
    expect(t.rows[1]).toMatchObject({ Amount: "12.5", "_currency:Amount": "EUR" });
    expect(t.rows[2].Amount).toBe("—");
  });

  it("types Date, DateTime, Percent and number fields from the raw value", () => {
    const card = autoCard("result", [
      {
        id: "006am00000LcOy6AAF",
        title: "Deal",
        data: {
          Name: { label: "Name", value: "Deal" },
          CloseDate: { label: "Close Date", value: "2026-07-29", displayValue: "7/29/2026", dataType: "Date" },
          LastActivity: { label: "Last Activity", value: "2026-07-29T14:30:00.000Z", displayValue: "7/29/2026, 2:30 PM", dataType: "DateTime" },
          Probability: { label: "Probability (%)", value: 14.3, displayValue: "14.3%", dataType: "Percent" },
          Quantity: { label: "Quantity", value: 1200.5, displayValue: "1,200.5", dataType: "Double" },
          Seats: { label: "Seats", value: 40, displayValue: "40", dataType: "Int" },
        },
      },
    ]);
    const find = (n: any): any => (n.definition === "tile/table" ? n : (n.children ?? []).map(find).find(Boolean));
    const t = find(card).attributes;
    const col = (key: string) => t.columns.find((c: any) => c.key === key);
    expect(col("Close Date")).toEqual({ key: "Close Date", header: "Close Date", isSortable: true, isFilterable: true, columnType: { type: "date" } });
    expect(col("Last Activity")).toMatchObject({ isSortable: true, isFilterable: true, columnType: { type: "date", format: "datetime" } });
    expect(col("Probability (%)")).toEqual({ key: "Probability (%)", header: "Probability (%)", align: "right", columnType: { type: "number", format: "percent" } });
    expect(col("Quantity")).toMatchObject({ align: "right", columnType: { type: "number" } });
    expect(col("Seats")).toMatchObject({ align: "right", columnType: { type: "number" } });
    expect(t.rows[0]).toMatchObject({
      "Close Date": "2026-07-29T00:00:00", // local midnight: a bare date parses as UTC and shows a day early west of UTC
      "Last Activity": "2026-07-29T14:30:00.000Z",
      "Probability (%)": "0.143",
      Quantity: "1200.5",
      Seats: "40",
    });
  });

  it("renders Picklist fields as picklist columns of the stored value, labeled from the rows", () => {
    const row = (value: string | null, displayValue: string | null) => ({
      id: "006am00000LcOy6AAF",
      title: "Deal",
      data: { Name: { label: "Name", value: "Deal" }, StageName: { label: "Stage", value, displayValue, dataType: "Picklist" } },
    });
    const card = autoCard("result", [row("Qualification", "Qualification"), row("Closed Won", "Gagné"), row("Closed Won", "Gagné"), row(null, null)]);
    const find = (n: any): any => (n.definition === "tile/table" ? n : (n.children ?? []).map(find).find(Boolean));
    const t = find(card).attributes;
    expect(t.columns[1]).toEqual({
      key: "Stage",
      header: "Stage",
      isSortable: true,
      isFilterable: true,
      columnType: {
        type: "picklist",
        options: [
          { label: "Qualification", value: "Qualification" },
          { label: "Gagné", value: "Closed Won" },
        ],
      },
    });
    expect(t.rows.map((r: any) => r.Stage)).toEqual(["Qualification", "Closed Won", "Closed Won", "—"]);
  });

  it("links a record table's Name column to the record", () => {
    const card = autoCard("result", [
      { id: "006am00000LcOy6AAF", title: "Deal", data: { Name: { label: "Name", value: "Deal" }, Amount: { label: "Amount", value: 5 } } },
    ]);
    const resolved = resolveTree(card, {}, "https://acme.my.salesforce.com") as any;
    const find = (n: any): any => (n.definition === "tile/table" ? n : (n.children ?? []).map(find).find(Boolean));
    const t = find(resolved).attributes;
    expect(t.columns[0]).toMatchObject({ key: "Name", columnType: { type: "link", urlKey: "_recordUrl" } });
    expect(t.columns.map((c: any) => c.key)).toEqual(["Name", "Amount"]);
    expect(t.rows[0]._recordUrl).toBe("https://acme.my.salesforce.com/lightning/r/006am00000LcOy6AAF/view");
  });
});
