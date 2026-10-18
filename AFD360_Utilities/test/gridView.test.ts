import { describe, expect, it } from "vitest";
import { matches, viewRows } from "../shared/gridView.ts";

describe("matches", () => {
  it("finds text anywhere, in any case", () => {
    expect(matches("Acme Partners", "partn", false)).toBe(true);
    expect(matches("Acme Partners", "zeta", false)).toBe(false);
    expect(matches(null, "a", false)).toBe(false);
  });
  it("compares numbers by value on a number column", () => {
    expect(matches(10, ">9", true)).toBe(true);
    expect(matches(10, "> 9.5", true)).toBe(true);
    expect(matches("9", ">10", true)).toBe(false); // not "9" > "10" as text
    expect(matches(0, "!=0", true)).toBe(false);
    expect(matches(null, "<5", true)).toBe(false);
    expect(matches(null, "!=5", true)).toBe(true);
  });
  it("compares text and ISO dates in order, = exactly", () => {
    expect(matches("2026-03-01", ">=2026-02-15", false)).toBe(true);
    expect(matches("2026-01-01", ">=2026-02-15", false)).toBe(false);
    expect(matches("Account", "=account", false)).toBe(true);
    expect(matches("Accounts", "=account", false)).toBe(false);
  });
  it("matches empty with a bare = and the rest with a bare !=", () => {
    expect(matches(null, "=", false)).toBe(true);
    expect(matches("", "=", true)).toBe(true);
    expect(matches("x", "=", false)).toBe(false);
    expect(matches("x", "!=", false)).toBe(true);
    expect(matches(null, "!=", false)).toBe(false);
  });
});

describe("viewRows", () => {
  const rows = [
    ["b", 10],
    [null, 2],
    ["a10", null],
    ["a9", 30],
  ];
  const numeric = [false, true];
  it("keeps the loaded order with no sort or filter", () => {
    expect(viewRows(rows, numeric, [], null)).toEqual([0, 1, 2, 3]);
  });
  it("sorts numbers by value and text naturally, empty last both ways", () => {
    expect(viewRows(rows, numeric, [], { col: 1, desc: false })).toEqual([1, 0, 3, 2]);
    expect(viewRows(rows, numeric, [], { col: 1, desc: true })).toEqual([3, 0, 1, 2]);
    expect(viewRows(rows, numeric, [], { col: 0, desc: false })).toEqual([3, 2, 0, 1]);
  });
  it("filters on every column before sorting", () => {
    expect(viewRows(rows, numeric, ["a", ">5"], { col: 1, desc: true })).toEqual([3]);
    expect(viewRows(rows, numeric, ["", ">5"], { col: 0, desc: false })).toEqual([3, 0]);
  });
});
