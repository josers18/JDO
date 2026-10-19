import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { asCurl, asFetch, colName, toCsv, toXlsx } from "../web/src/query/export.ts";

describe("query export", () => {
  it("quotes CSV cells that need it", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"'], [null, 3]])).toBe('\uFEFFa,b\r\n"x,y","say ""hi"""\r\n,3\r\n');
  });

  it("names columns past Z", () => {
    expect([0, 25, 26, 701, 702].map(colName)).toEqual(["A", "Z", "AA", "ZZ", "AAA"]);
  });

  it("writes a sheet with typed cells, a frozen header and an autofilter", () => {
    const files = unzipSync(toXlsx(["id", "n", "ok"], [["001<a>", 2, true]]));
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]!);
    expect(sheet).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">001&lt;a&gt;</t></is></c>');
    expect(sheet).toContain('<c r="B2"><v>2</v></c>');
    expect(sheet).toContain('<c r="C2" t="b"><v>1</v></c>');
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<autoFilter ref="A1:C2"/>');
  });

  it("shows the request as curl and fetch with the token as a placeholder", () => {
    const r = { method: "POST", url: "https://x.my.salesforce.com/services/data/v67.0/ssot/query-sql", body: { sql: "SELECT 'a' FROM t" } };
    expect(asCurl(r)).toContain(`--data '{"sql":"SELECT '\\''a'\\'' FROM t"}'`);
    expect(asCurl(r)).toContain("Bearer $TOKEN");
    expect(asFetch(r)).toContain('method: "POST"');
  });
});
