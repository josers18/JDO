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

describe("autoCard", () => {
  it("builds a titled field card for an object, hiding ids and turning URLs into a link", () => {
    const card = autoCard("account", { name: "Omega, Inc.", industry: "Technology", accountId: "001am00000qvjs6AAA", recordUrl: "https://o/x", found: true });
    expect(texts(card)).toEqual(["Omega, Inc.", "Account", "Industry", "Technology", "Found", "Yes", "Open in Salesforce"]);
    expect(defs(card)).toContain("tile/link");
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
});
