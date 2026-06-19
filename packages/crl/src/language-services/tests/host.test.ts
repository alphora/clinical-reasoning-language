// Characterization tests for NodeLanguageServiceHost (#132 step 2). Pins the reviewed
// contract: overlay-shadow keyed by canonicalize() (incl. a non-canonical input path and
// an empty-string shadow), readFile THROWS on a missing file (preserves projectIndex's
// isCrlProject try/catch), and readDir distinguishes files vs directories AND ignores
// overlays (overlays are a file-content layer, not a virtual filesystem).
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { NodeLanguageServiceHost } from "../host";
import { canonicalize } from "../paths";

describe("NodeLanguageServiceHost (#132 step 2)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crl-host-"));
  const fileA = path.join(dir, "a.txt");
  fs.writeFileSync(fileA, "disk-content");
  fs.mkdirSync(path.join(dir, "sub"));

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("readFile returns disk contents (matches fs)", () => {
    const host = new NodeLanguageServiceHost();
    expect(host.readFile(fileA)).toBe("disk-content");
    expect(host.readFile(fileA)).toBe(fs.readFileSync(fileA, "utf-8"));
  });

  it("readFile canonicalizes the lookup key — a non-canonical input path still hits the overlay", () => {
    const overlays = new Map([[canonicalize(fileA), "overlay-content"]]);
    const host = new NodeLanguageServiceHost({ overlays });
    // Raw (un-normalized) path with a "/./" segment: differs from the overlay key
    // until canonicalize() collapses it. If readFile did NOT canonicalize, this would
    // miss the overlay and fall through to disk ("disk-content").
    const messyPath = dir + path.sep + "." + path.sep + "a.txt";
    expect(host.readFile(messyPath)).toBe("overlay-content");
  });

  it("readFile: an empty-string overlay shadows disk (unsaved-emptied buffer != disk)", () => {
    const overlays = new Map([[canonicalize(fileA), ""]]);
    const host = new NodeLanguageServiceHost({ overlays });
    expect(host.readFile(fileA)).toBe("");
  });

  it("readFile throws on a missing file (matches fs; callers wrap in try/catch)", () => {
    const host = new NodeLanguageServiceHost();
    expect(() => host.readFile(path.join(dir, "nope.txt"))).toThrow();
  });

  it("readDir distinguishes files and directories", () => {
    const host = new NodeLanguageServiceHost();
    const entries = host.readDir(dir);
    const a = entries.find((e) => e.name === "a.txt");
    const sub = entries.find((e) => e.name === "sub");
    expect(a?.isFile()).toBe(true);
    expect(a?.isDirectory()).toBe(false);
    expect(sub?.isDirectory()).toBe(true);
    expect(sub?.isFile()).toBe(false);
  });

  it("readDir ignores overlays (file-content layer only, not a virtual fs)", () => {
    const overlayOnly = path.join(dir, "ghost.txt");
    const overlays = new Map([[canonicalize(overlayOnly), "only-in-overlay"]]);
    const host = new NodeLanguageServiceHost({ overlays });
    expect(host.readDir(dir).some((e) => e.name === "ghost.txt")).toBe(false);
  });

  it("readDir throws on a missing directory", () => {
    const host = new NodeLanguageServiceHost();
    expect(() => host.readDir(path.join(dir, "no-such-dir"))).toThrow();
  });

  it("workspaceRoots defaults to empty and is settable", () => {
    expect(new NodeLanguageServiceHost().workspaceRoots).toEqual([]);
    expect(
      new NodeLanguageServiceHost({ workspaceRoots: ["/x"] }).workspaceRoots,
    ).toEqual(["/x"]);
  });
});
