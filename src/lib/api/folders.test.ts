import { describe, expect, it } from "vitest";
import { FOLDER_MAX_DEPTH, validateFolderParent } from "./folders";

const parents = new Map<string, string | null>([
  ["a", null],
  ["b", "a"],
  ["c", "b"],
  ["d", "c"],
  ["e", "d"],
  ["f", "e"],
  ["g", "f"],
  ["h", "g"],
  // rama lateral: "s1" bajo "d" (mismo nivel que "e"), "s2" bajo "s1"
  ["s1", "d"],
  ["s2", "s1"],
]);

describe("validateFolderParent", () => {
  it("accepts null parent (root) with depth 0", () => {
    expect(validateFolderParent(parents, "", null)).toEqual({ ok: true, depth: 0 });
  });

  it("accepts a valid parent and reports the resulting depth", () => {
    expect(validateFolderParent(parents, "", "a")).toEqual({ ok: true, depth: 1 });
    expect(validateFolderParent(parents, "", "d")).toEqual({ ok: true, depth: 4 });
  });

  it("rejects moving a folder under one of its own descendants (cycle)", () => {
    // Moving "b" under "c" (its own child) must be a cycle.
    expect(validateFolderParent(parents, "b", "c").ok).toBe(false);
  });

  it("rejects moving a folder under itself", () => {
    expect(validateFolderParent(parents, "b", "b").ok).toBe(false);
  });

  it("accepts moving a subtree sideways at the same depth", () => {
    // Moving "e" under "s1" (a lateral branch of "d") is fine: s1 is not a
    // descendant of e, and the chain s1→d→c→b→a gives depth 5.
    expect(validateFolderParent(parents, "e", "s1")).toEqual({ ok: true, depth: 5 });
  });

  it(`rejects a depth beyond ${FOLDER_MAX_DEPTH}`, () => {
    // h sits at depth 7; adding a folder under it is depth 8 (allowed).
    expect(validateFolderParent(parents, "", "h")).toEqual({ ok: true, depth: 8 });
    // A new folder cannot go under a folder whose depth would exceed 8.
    const deep = new Map([...parents, ["i", "h"]]); // i at depth 8
    expect(validateFolderParent(deep, "", "i").ok).toBe(false);
  });
});