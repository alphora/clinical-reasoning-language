import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findCheckoutRoot, repoEscapeAdvisory } from "../repoEscape";

describe("repoEscapeAdvisory", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "crl-repoescape-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("no advisory when the source is inside the discovered checkout (.git as a file — worktree/submodule style)", () => {
    writeFileSync(join(tmp, ".git"), "gitdir: /elsewhere\n"); // a `.git` FILE still marks a checkout root
    mkdirSync(join(tmp, "sub"), { recursive: true });
    expect(repoEscapeAdvisory(join(tmp, "sub", "rx.docx"), join(tmp, "sub"))).toBeUndefined();
  });

  it("advises when the source resolves ABOVE the discovered checkout root", () => {
    writeFileSync(join(tmp, ".git"), "gitdir: /elsewhere\n"); // pins the root at tmp deterministically
    mkdirSync(join(tmp, "sub"), { recursive: true });
    const outside = join(tmp, "..", "outside.docx"); // tmp's PARENT — above the root
    const adv = repoEscapeAdvisory(outside, join(tmp, "sub"));
    expect(adv).toMatch(/resolves OUTSIDE the repository checkout/);
  });

  it("no advisory for a source inside a directory with no local .git marker", () => {
    // No `.git` at tmp → the root is either an ancestor (source still inside it) or undiscoverable (disabled): either
    // way an inside-tmp source yields no advisory. Deterministic without assuming anything about tmp's ancestors.
    expect(repoEscapeAdvisory(join(tmp, "rx.docx"), tmp)).toBeUndefined();
  });

  // Root-discovery precedence, tested on findCheckoutRoot directly. Hermetic: `.git` nearest-wins returns BEFORE reaching
  // any uncontrolled ancestor, and the topmost-package.json property ("nearest sub-package does NOT win") holds regardless
  // of ancestor markers (topmost is always >= the controlled outer dir, so it is never the inner one). The exact topmost
  // RESULT is ambient-sensitive (the walk runs to the filesystem root) and so is deliberately not asserted.
  it("findCheckoutRoot: nearest .git wins outright, even under an ancestor package.json", () => {
    mkdirSync(join(tmp, "outer", "inner"), { recursive: true });
    writeFileSync(join(tmp, "outer", "package.json"), "{}");
    writeFileSync(join(tmp, "outer", "inner", ".git"), "gitdir: /elsewhere\n");
    expect(findCheckoutRoot(join(tmp, "outer", "inner"))).toBe(join(tmp, "outer", "inner"));
  });

  it("findCheckoutRoot: no .git → the TOPMOST package.json (a monorepo sub-package never wins over its parent)", () => {
    mkdirSync(join(tmp, "outer", "inner"), { recursive: true });
    writeFileSync(join(tmp, "outer", "package.json"), "{}"); // the outer package boundary
    writeFileSync(join(tmp, "outer", "inner", "package.json"), "{}"); // a nearer sub-package
    // Whatever the ambient ancestry contributes, topmost is at least `outer` → the nearest (inner) never wins.
    expect(findCheckoutRoot(join(tmp, "outer", "inner"))).not.toBe(join(tmp, "outer", "inner"));
  });
});
