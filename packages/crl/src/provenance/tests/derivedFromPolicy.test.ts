// #250 Todo B — the pure lexical `derivedFrom` classifier. The one home the producer, detectors, and normalizer share.
import { join, resolve } from "node:path";

import { classifyDerivedFrom, samePath, toCarrierRelative } from "../derivedFromPolicy";

describe("classifyDerivedFrom (#250 Todo B)", () => {
  it("accepts carrier-relative POSIX paths as ok", () => {
    for (const ok of [
      "x.docx",
      "source/foo.docx",
      "../refined-source/policy-2026.docx",
      "a/b/c.txt",
      "./foo.txt",
    ]) {
      expect(classifyDerivedFrom(ok)).toBe("ok");
    }
  });

  it("flags absolute paths under EITHER host + every drive- and scheme-qualified form", () => {
    for (const abs of [
      "E:/src/repo-wt/wt-042/artifacts/p.docx", // drive-absolute, forward slash (the observed worktree/checkout case)
      "E:\\src\\repo\\p.docx", // drive-absolute, backslash — its real defect is being absolute, not the slash
      "C:/Users/Owner/x.docx",
      "/home/user/x.docx", // POSIX-absolute
      "\\\\host\\share\\x.docx", // UNC
      "\\rooted\\x.docx", // rooted backslash
      "C:foo/bar.docx", // drive-RELATIVE — path.win32.isAbsolute is FALSE here, must still be caught
      "file:///E:/src/x.docx", // URI scheme — a stringified vscode.Uri; multi-letter scheme misses a drive-only regex
      "https://host/x.docx", // URI scheme
    ]) {
      expect(classifyDerivedFrom(abs)).toBe("absolute");
    }
  });

  it("flags non-path and non-POSIX values as malformed", () => {
    expect(classifyDerivedFrom("")).toBe("malformed");
    expect(classifyDerivedFrom("   ")).toBe("malformed"); // whitespace-only is "not a path", same bucket as empty
    expect(classifyDerivedFrom(undefined)).toBe("malformed");
    expect(classifyDerivedFrom(null)).toBe("malformed");
    expect(classifyDerivedFrom(42)).toBe("malformed");
    expect(classifyDerivedFrom({})).toBe("malformed");
    expect(classifyDerivedFrom("foo\0bar.docx")).toBe("malformed"); // NUL
    expect(classifyDerivedFrom("foo\\bar.docx")).toBe("malformed"); // relative path with a backslash separator (not POSIX)
  });

  it("is platform-independent: an E:\\-drive path is absolute regardless of the host running the check", () => {
    // The whole point of checking BOTH path.win32 and path.posix: on a Linux reviewer machine, path.isAbsolute('E:/x')
    // is false, so a host-local check would pass the dead path exactly where it is dead.
    expect(classifyDerivedFrom("E:/src/x.docx")).toBe("absolute");
    expect(classifyDerivedFrom("/etc/x.docx")).toBe("absolute");
  });
});

describe("toCarrierRelative (#250 Todo A)", () => {
  // absolute roots so the result is independent of the process CWD; the RELATIVE structure is identical on both hosts.
  const root = resolve("carrier-root-fixture");

  it("colocated source → the bare basename, no escape", () => {
    const r = toCarrierRelative(join(root, "dir", "anchor.txt"), join(root, "dir"));
    expect(r).toEqual({ ok: true, path: "anchor.txt", escapesCarrierDir: false });
  });

  it("nested-under-carrier source → a POSIX `/` sub-path", () => {
    const r = toCarrierRelative(join(root, "a", "b", "anchor.txt"), root);
    expect(r).toEqual({ ok: true, path: "a/b/anchor.txt", escapesCarrierDir: false });
  });

  it("sibling-dir source → a `../` path, escapesCarrierDir true (legitimate, not an error)", () => {
    const r = toCarrierRelative(join(root, "src", "anchor.txt"), join(root, "out"));
    expect(r).toEqual({ ok: true, path: "../src/anchor.txt", escapesCarrierDir: true });
  });

  it("every ok result is itself carrier-relative-`ok` per the classifier (the self-check invariant)", () => {
    for (const [src, carrier] of [
      [join(root, "dir", "x.txt"), join(root, "dir")],
      [join(root, "a", "b", "x.txt"), root],
      [join(root, "src", "x.txt"), join(root, "deep", "out")],
    ] as const) {
      const r = toCarrierRelative(src, carrier);
      expect(r.ok).toBe(true);
      if (r.ok) expect(classifyDerivedFrom(r.path)).toBe("ok");
    }
  });

  // Windows-only: a cross-DRIVE source has NO carrier-relative representation (path.relative returns the absolute target),
  // so the producer must FAIL rather than emit a drive-qualified value its own detector rejects. Cannot be forced on POSIX
  // (no drive letters), hence the platform guard — this is exactly the C:-docx / E:-Dev-Drive split on the authoring machine.
  it.runIf(process.platform === "win32")(
    "cross-drive source → ok:false (no-carrier-relative-representation)",
    () => {
      const r = toCarrierRelative("C:\\src\\x.docx", "E:\\carrier");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("no-carrier-relative-representation");
    },
  );
});

describe("samePath (#250 A-hardening — the producers' overwrite-guard identity)", () => {
  it("distinct files differ; identical / CWD-equivalent paths match", () => {
    expect(samePath("/a/b/x.docx", "/a/b/y.docx")).toBe(false);
    expect(samePath("/a/b/x.docx", "/a/b/x.docx")).toBe(true);
    expect(samePath("a/./x.docx", "a/x.docx")).toBe(true); // resolved vs CWD before compare
  });
  it("folds case on case-insensitive filesystems (win32 / darwin), stays case-sensitive on Linux", () => {
    const r = samePath("/a/b/X.docx", "/a/b/x.docx");
    const caseInsensitive = process.platform === "win32" || process.platform === "darwin";
    expect(r).toBe(caseInsensitive);
  });
});
