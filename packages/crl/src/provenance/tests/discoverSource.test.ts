import { createHash } from "node:crypto";
import { linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_DISCOVERY_BUDGET,
  discoverSources,
  discoveryTargetFor,
  type DiscoveryBudget,
  type DiscoveryTarget,
} from "../discoverSource";

const sha256 = (b: Buffer | string): string =>
  "sha256:" +
  createHash("sha256")
    .update(typeof b === "string" ? Buffer.from(b, "utf8") : b)
    .digest("hex");

const write = (dir: string, rel: string, bytes: Buffer | string): string => {
  const p = join(dir, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, bytes);
  return p;
};

/** Junctions ("junction" type) are created WITHOUT elevation on Windows and degrade to a plain symlink on POSIX — so this
 *  probes reparse-point handling on the same OS the corpus lives on. If even that is unavailable, the one test using it skips. */
function reparseAvailable(): boolean {
  const d = mkdtempSync(join(tmpdir(), "crl-symcap-"));
  try {
    mkdirSync(join(d, "real"));
    symlinkSync(join(d, "real"), join(d, "link"), "junction");
    return true;
  } catch {
    return false;
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}
const REPARSE = reparseAvailable();

/** Hard links (fs.linkSync) work on NTFS/ext4 without elevation; some filesystems refuse them — skip the one test if so. */
function hardlinkAvailable(): boolean {
  const d = mkdtempSync(join(tmpdir(), "crl-linkcap-"));
  try {
    writeFileSync(join(d, "a"), "x");
    linkSync(join(d, "a"), join(d, "b"));
    return true;
  } catch {
    return false;
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}
const HARDLINK = hardlinkAvailable();

describe("discoveryTargetFor", () => {
  it("extracts the filename separator-agnostically (Windows path recovered on any host)", () => {
    expect(discoveryTargetFor(sha256("x"), "E:\\worktrees\\abc\\src\\source.docx")).toMatchObject({
      basename: "source.docx",
      ext: ".docx",
    });
    expect(discoveryTargetFor(sha256("x"), "/tmp/gone/a.pdf")).toMatchObject({
      basename: "a.pdf",
      ext: ".pdf",
    });
    expect(discoveryTargetFor(sha256("x"), "bare.docx")).toMatchObject({ basename: "bare.docx" });
    expect(discoveryTargetFor(sha256("x"), "no-ext")).toMatchObject({
      basename: "no-ext",
      ext: "",
    });
  });
});

describe("discoverSources", () => {
  let root: string;
  afterEach(() => root && rmSync(root, { recursive: true, force: true }));
  const mk = (): string => (root = mkdtempSync(join(tmpdir(), "crl-disc-")));

  it("returns [] without walking when there are no targets", () => {
    expect(discoverSources("/nonexistent-root-never-walked", [])).toEqual([]);
  });

  it("finds a unique source by BASENAME predicate", () => {
    mk();
    const bytes = Buffer.from("the lost docx", "utf8");
    const p = write(root, "a/b/source.docx", bytes);
    write(root, "a/decoy.txt", "unrelated");
    const [out] = discoverSources(root, [discoveryTargetFor(sha256(bytes), "x/source.docx")]);
    expect(out).toEqual({ kind: "found", path: p, predicate: "basename" });
  });

  it("falls through to the EXTENSION predicate when no basename matches (source was renamed)", () => {
    mk();
    const bytes = Buffer.from("renamed but same bytes", "utf8");
    const p = write(root, "deep/moved.docx", bytes); // different basename, same extension + bytes
    const [out] = discoverSources(root, [discoveryTargetFor(sha256(bytes), "gone/source.docx")]);
    expect(out).toEqual({ kind: "found", path: p, predicate: "extension" });
  });

  it("prefers a BASENAME hit even when an extension-only same-hash copy also exists (staged, not merged)", () => {
    mk();
    const bytes = Buffer.from("identical content", "utf8");
    const wanted = write(root, "x/source.docx", bytes);
    write(root, "y/othername.docx", bytes); // same bytes+ext, different name — must NOT make it ambiguous
    const [out] = discoverSources(root, [discoveryTargetFor(sha256(bytes), "z/source.docx")]);
    expect(out).toEqual({ kind: "found", path: wanted, predicate: "basename" });
  });

  it("reports AMBIGUOUS when >1 distinct path shares the target basename AND hashes to the oracle", () => {
    mk();
    const bytes = Buffer.from("dup", "utf8");
    const a = write(root, "one/source.docx", bytes);
    const b = write(root, "two/source.docx", bytes);
    const [out] = discoverSources(root, [discoveryTargetFor(sha256(bytes), "source.docx")]);
    expect(out.kind).toBe("ambiguous");
    if (out.kind !== "ambiguous") throw new Error("unreachable");
    expect(out.predicate).toBe("basename");
    expect(out.paths).toEqual([a, b].sort());
  });

  it("reports NOT-FOUND when a like-named file exists but its bytes do not hash to the oracle", () => {
    mk();
    write(root, "x/source.docx", "the WRONG content");
    const [out] = discoverSources(root, [
      discoveryTargetFor(sha256("the right content"), "source.docx"),
    ]);
    expect(out).toEqual({ kind: "not-found" });
  });

  it("does NOT descend into .git / node_modules (default ignore set)", () => {
    mk();
    const bytes = Buffer.from("hidden away", "utf8");
    write(root, ".git/source.docx", bytes);
    write(root, "node_modules/pkg/source.docx", bytes);
    const [out] = discoverSources(root, [discoveryTargetFor(sha256(bytes), "source.docx")]);
    expect(out).toEqual({ kind: "not-found" });
  });

  it("reports BUDGET-EXHAUSTED (never a match) when enumeration hits a ceiling before completing", () => {
    mk();
    const bytes = Buffer.from("would-match", "utf8");
    write(root, "a/source.docx", bytes);
    write(root, "b/c/d/e/f/source.docx", bytes);
    const tiny: DiscoveryBudget = {
      maxEntries: 2, // exhausts almost immediately
      maxDirs: 1000,
      maxDepth: 1000,
      maxHashFiles: 1000,
      maxHashBytes: 1 << 30,
    };
    const [out] = discoverSources(root, [discoveryTargetFor(sha256(bytes), "source.docx")], tiny);
    expect(out).toMatchObject({ kind: "budget-exhausted" });
  });

  it("caps DEPTH — a source nested below maxDepth exhausts rather than matching", () => {
    mk();
    const bytes = Buffer.from("too deep", "utf8");
    write(root, "l1/l2/l3/source.docx", bytes);
    const shallow: DiscoveryBudget = {
      maxEntries: 1_000_000,
      maxDirs: 1_000_000,
      maxDepth: 1, // can reach l1, not l2/l3
      maxHashFiles: 1_000_000,
      maxHashBytes: 1 << 30,
    };
    const [out] = discoverSources(
      root,
      [discoveryTargetFor(sha256(bytes), "source.docx")],
      shallow,
    );
    expect(out).toMatchObject({ kind: "budget-exhausted", ceiling: "maxDepth" });
  });

  it("serves MULTIPLE targets from a SINGLE walk (union of hints), positionally aligned", () => {
    mk();
    const d1 = Buffer.from("first source", "utf8");
    const d2 = Buffer.from("second source", "utf8");
    const p1 = write(root, "x/first.docx", d1);
    const p2 = write(root, "y/z/second.pdf", d2);
    const outs = discoverSources(root, [
      discoveryTargetFor(sha256(d1), "gone/first.docx"),
      discoveryTargetFor(sha256(d2), "gone/second.pdf"),
    ]);
    expect(outs).toEqual([
      { kind: "found", path: p1, predicate: "basename" },
      { kind: "found", path: p2, predicate: "basename" },
    ]);
  });

  it.skipIf(!REPARSE)(
    "does NOT follow a reparse point (junction/symlink) — a source reachable only through one is not seen twice",
    () => {
      mk();
      const bytes = Buffer.from("behind a junction", "utf8");
      const real = write(root, "real/source.docx", bytes);
      // A junction 'mirror' → 'real'. Following it would surface source.docx a SECOND time → a false 'ambiguous'.
      symlinkSync(join(root, "real"), join(root, "mirror"), "junction");
      const [out] = discoverSources(root, [discoveryTargetFor(sha256(bytes), "source.docx")]);
      expect(out).toEqual({ kind: "found", path: real, predicate: "basename" });
    },
  );

  it("skips a target with no filename hint (empty basename, empty ext) → not-found, no crash", () => {
    mk();
    write(root, "x/source.docx", "content");
    const nameless: DiscoveryTarget = { oracle: sha256("content"), basename: "", ext: "" };
    expect(discoverSources(root, [nameless])).toEqual([{ kind: "not-found" }]);
  });

  it("matches a case-variant basename (predicate folds unconditionally; the hash confirms)", () => {
    mk();
    const bytes = Buffer.from("case variant on disk", "utf8");
    const p = write(root, "d/Source.DOCX", bytes); // re-cased on disk vs the recorded name
    const [out] = discoverSources(root, [discoveryTargetFor(sha256(bytes), "gone/source.docx")]);
    expect(out).toEqual({ kind: "found", path: p, predicate: "basename" });
  });

  it("reports BUDGET-EXHAUSTED (not not-found) when a candidate exceeds the byte budget — checked BEFORE the read", () => {
    mk();
    const big = Buffer.alloc(100, 7);
    write(root, "x/source.docx", big);
    const budget: DiscoveryBudget = { ...DEFAULT_DISCOVERY_BUDGET, maxHashBytes: 50 };
    const [out] = discoverSources(root, [discoveryTargetFor(sha256(big), "source.docx")], budget);
    expect(out).toMatchObject({ kind: "budget-exhausted", ceiling: "maxHashBytes" });
  });

  it("caps HASH FILES — more candidates than the ceiling exhausts rather than committing a match", () => {
    mk();
    const bytes = Buffer.from("dup", "utf8");
    write(root, "a/source.docx", bytes);
    write(root, "b/source.docx", bytes);
    const budget: DiscoveryBudget = { ...DEFAULT_DISCOVERY_BUDGET, maxHashFiles: 1 };
    const [out] = discoverSources(root, [discoveryTargetFor(sha256(bytes), "source.docx")], budget);
    expect(out).toMatchObject({ kind: "budget-exhausted", ceiling: "maxHashFiles" });
  });

  it.skipIf(!HARDLINK)(
    "reports AMBIGUOUS for two hard-link aliases of one inode (distinct PATHS, never inode-deduped)",
    () => {
      mk();
      const bytes = Buffer.from("one inode, two names", "utf8");
      const a = write(root, "x/source.docx", bytes);
      mkdirSync(join(root, "y"), { recursive: true });
      const b = join(root, "y", "source.docx");
      linkSync(a, b); // same inode, distinct path
      const [out] = discoverSources(root, [discoveryTargetFor(sha256(bytes), "source.docx")]);
      expect(out.kind).toBe("ambiguous");
      if (out.kind !== "ambiguous") throw new Error("unreachable");
      expect(out.paths).toEqual([a, b].sort());
    },
  );

  it("throws on a non-finite / negative budget — the safety bounds cannot be disabled", () => {
    const t = [discoveryTargetFor(sha256("x"), "a.docx")];
    expect(() =>
      discoverSources("/whatever", t, { ...DEFAULT_DISCOVERY_BUDGET, maxHashBytes: Infinity }),
    ).toThrow(RangeError);
    expect(() =>
      discoverSources("/whatever", t, { ...DEFAULT_DISCOVERY_BUDGET, maxDirs: -1 }),
    ).toThrow(RangeError);
    expect(() =>
      discoverSources("/whatever", t, { ...DEFAULT_DISCOVERY_BUDGET, maxDepth: NaN }),
    ).toThrow(RangeError);
  });
});
