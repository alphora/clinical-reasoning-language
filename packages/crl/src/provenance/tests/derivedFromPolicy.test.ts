// #250 Todo B — the pure lexical `derivedFrom` classifier. The one home the producer, detectors, and normalizer share.
import { classifyDerivedFrom } from "../derivedFromPolicy";

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
