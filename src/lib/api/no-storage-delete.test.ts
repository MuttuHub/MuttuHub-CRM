// Never-delete policy (S0.9a): the unified upload policy promises that a file
// once stored is never removed — uploads may be created and re-read, never
// deleted or relocated. This guard walks the whole `src` tree, because the
// risk is a future caller adding a cleanup/relocation call in any file, not
// just in the upload routes.
//
// Why the match is narrow: releasing a temporary blob link with the DOM
// anchor's removal method is a legitimate download-helper call, so a naive
// substring search for that method name would flag it. The scanner therefore
// requires a Supabase Storage chain — `storage.from(BUCKET)` — to be what ends
// in the deletion or relocation method, and the tests at the end of this file
// prove that a DOM-only call is never flagged and that a real chain is.
//
// `// @vitest-environment node` — this test only reads the filesystem and has
// no DOM dependency, so it skips the jsdom setup cost.

// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../../..", import.meta.url));
const sourceRoot = join(projectRoot, "src");

/** Every `.ts`/`.tsx` file under `src`, read as UTF-8 source. */
function scannedSources(): { path: string; source: string }[] {
  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  }
  return walk(sourceRoot).map((path) => ({
    // Normalize to posix separators: the suite also runs under Windows node.
    path: relative(projectRoot, path).split(sep).join("/"),
    source: readFileSync(path, "utf8"),
  }));
}

const scanned = scannedSources();

/**
 * A Storage chain ending in the deletion method: either `.storage` followed by
 * the call within 300 characters (enough to cross the line breaks of the
 * `supabase.storage\n  .from(BUCKET)\n  .upload(...)` style used here), or a
 * `.from(<bucket>)` chain that goes straight to it.
 */
const STORAGE_REMOVE =
  /\.storage[\s\S]{0,300}?\.remove\(|\.from\([^)]*\)\s*\.remove\(/;
/** Same shape for the relocation methods (move/copy), which would also delete a file from its key. */
const STORAGE_MOVE_OR_COPY =
  /\.storage[\s\S]{0,300}?\.(move|copy)\(|\.from\([^)]*\)\s*\.(move|copy)\(/;
/** The DOM blob-link release used by the download helpers (NOT a storage call). */
const DOM_ANCHOR_REMOVE = /\ba\.remove\(\)/;

function offenders(pattern: RegExp): string[] {
  return scanned.filter((file) => pattern.test(file.source)).map((file) => file.path);
}

describe("never-delete policy — no Supabase Storage removal in src", () => {
  // Anti-vacuity guard: if the walker ever returns nothing, the assertions
  // below would pass without scanning anything.
  it("scans every .ts/.tsx file under src", () => {
    expect(scanned.length).toBeGreaterThan(100);
    expect(scanned.map((file) => file.path)).toEqual(
      expect.arrayContaining(["src/lib/api/files.ts", "src/app/api/v1/documents/route.ts"]),
    );
  });

  it("no source file calls storage remove()", () => {
    expect(offenders(STORAGE_REMOVE)).toEqual([]);
  });

  it("no source file calls storage move() or copy()", () => {
    // Measured before this guard was added: neither method appears anywhere in
    // `src`, storage chain or not, so there is no existing caller to migrate —
    // this test only locks the door.
    expect(offenders(STORAGE_MOVE_OR_COPY)).toEqual([]);
  });

  it("still sees the DOM blob-link removals it must not flag", () => {
    const domSites = offenders(DOM_ANCHOR_REMOVE);
    expect(domSites).toEqual(
      expect.arrayContaining([
        "src/components/crm/client-list.tsx",
        "src/components/kanban/kanban-board.tsx",
        "src/components/kanban/report-view.tsx",
        "src/hooks/documents.ts",
      ]),
    );
    // The discrimination proof: those same files must NOT match the storage
    // pattern, otherwise the guard above would be catching the DOM calls too
    // and its green result would mean nothing.
    const wronglyFlagged = scanned
      .filter((file) => DOM_ANCHOR_REMOVE.test(file.source) && STORAGE_REMOVE.test(file.source))
      .map((file) => file.path);
    expect(wronglyFlagged).toEqual([]);
  });

  // Positive control: the green result above must mean "nothing calls it", not
  // "the pattern never matches anything". The sample is assembled at runtime so
  // this file does not itself contain a storage-removal chain (it is scanned
  // like every other source file).
  it("fires on a synthetic storage removal", () => {
    const sample = ["supabase.storage", '.from("bucket")', '.rem' + 'ove(["key"])'].join("");
    expect(STORAGE_REMOVE.test(sample)).toBe(true);
  });

  it("fires on a synthetic storage move/copy and ignores a DOM-only snippet", () => {
    const moveSample = ["supabase.storage", '.from("bucket")', '.m' + 'ove("a", "b")'].join("");
    const copySample = ["supabase.storage", '.from("bucket")', '.cop' + 'y("a", "b")'].join("");
    expect(STORAGE_MOVE_OR_COPY.test(moveSample)).toBe(true);
    expect(STORAGE_MOVE_OR_COPY.test(copySample)).toBe(true);
    // A DOM-only blob-link release carries no storage chain, so the storage
    // pattern must stay silent on it.
    expect(STORAGE_REMOVE.test(["link", '.rem' + 'ove()'].join(""))).toBe(false);
  });
});
