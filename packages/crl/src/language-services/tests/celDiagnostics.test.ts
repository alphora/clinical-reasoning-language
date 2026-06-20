// Unit + integration tests for headless CEL diagnostics (#4 slice 4).
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { computeCelDiagnostics, type CelFileValidator } from "../celDiagnostics";
import { canonicalize } from "../paths";
import { validateCELFile } from "../../index";

describe("computeCelDiagnostics (#4) — mapping + overlays (DI'd validator)", () => {
  const CEL = canonicalize("/p/a.cel"); // the validator/resolver attribute to + look up by the canonical path

  it("maps errors+warnings to LsDiagnostic + overlays the .cel source (under the canonical key) on top of .crl overlays", () => {
    let captured: { fp?: string; overlays?: ReadonlyMap<string, string> } = {};
    const fake: CelFileValidator = (fp, opts) => {
      captured = { fp, overlays: opts.overlays };
      return {
        errors: [
          {
            kind: "unresolved-covers",
            message: "covers unresolved",
            severity: "error",
            location: { start: { line: 3, column: 0 }, end: { line: 3, column: 5 } },
          },
        ],
        warnings: [{ kind: "soft", message: "a warning", severity: "warning" }], // no location → one-char range
      };
    };
    const diags = computeCelDiagnostics("/p/a.cel", "CELSRC", new Map([["/p/lib.crl", "CRLSRC"]]), fake);
    expect(captured.fp).toBe(CEL); // validated against the canonical path
    expect(captured.overlays?.get(CEL)).toBe("CELSRC"); // the buffer overlaid under the canonical key
    expect(captured.overlays?.get("/p/lib.crl")).toBe("CRLSRC"); // incoming .crl overlay preserved
    expect(diags).toEqual([
      { filePath: CEL, range: { startLine: 2, startCol: 0, endLine: 2, endCol: 5 }, severity: "error", message: "covers unresolved", code: "unresolved-covers", source: "crl-cel" },
      { filePath: CEL, range: { startLine: 0, startCol: 0, endLine: 0, endCol: 1 }, severity: "warning", message: "a warning", code: "soft", source: "crl-cel" },
    ]);
  });

  it("drops diagnostics for a different file (a non-.cel-attributed finding)", () => {
    const fake: CelFileValidator = () => ({
      errors: [{ kind: "k", message: "a crl error", severity: "error", filePath: "/some/other/lib.crl" }],
      warnings: [],
    });
    expect(computeCelDiagnostics("/p/a.cel", "src", new Map(), fake)).toEqual([]);
  });

  it("canonicalizes the path so the self-file filter keeps diagnostics despite drive-case mismatch (Windows)", () => {
    if (process.platform !== "win32") return; // canonicalize only re-cases the drive on Windows
    const fake: CelFileValidator = () => ({
      // the validator attributes to the canonical (uppercase-drive) path; the doc path is lowercase-drive.
      errors: [{ kind: "k", message: "err", severity: "error", filePath: "C:\\proj\\a.cel" }],
      warnings: [],
    });
    const diags = computeCelDiagnostics("c:\\proj\\a.cel", "src", new Map(), fake);
    expect(diags.length).toBe(1); // would be 0 without canonicalizing both sides of the filter
    expect(diags[0].filePath).toBe("C:\\proj\\a.cel");
  });
});

describe("computeCelDiagnostics (#4) — real validateCELFile integration", () => {
  let root: string;
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "crl-cel-diag-"));
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "tmp", version: "0.0.0" }));
    fs.writeFileSync(
      path.join(root, "lib.crl"),
      ["# Lib", 'library "Lib".', 'concept "C":', "- type is Condition.", "- code is `c`.", 'activity "A":', "- request CPGServiceRequest.", "- with `a`.", 'decision "D":', '- when "C" then recommend activity "A".'].join("\n"),
    );
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it("a clean .cel → no diagnostics", () => {
    const celPath = path.join(root, "ok.cel");
    const src = ["# Cases", 'library "OK".', 'covers "Lib".', 'fact "Pat":', '- name is "Pat".', '- birth date is "1970-01-01".', '- defined by "Patient".', 'case "c1":', '- subject is "Pat".', '- result is "D" is "A".'].join("\n");
    fs.writeFileSync(celPath, src);
    expect(computeCelDiagnostics(celPath, src, new Map(), validateCELFile)).toEqual([]);
  });

  it("a .cel with a bad result-is leaf → an error diagnostic on the .cel", () => {
    const celPath = path.join(root, "bad.cel");
    const src = ["# Cases", 'library "Bad".', 'covers "Lib".', 'fact "Pat":', '- name is "Pat".', '- birth date is "1970-01-01".', '- defined by "Patient".', 'case "c1":', '- subject is "Pat".', '- result is "Ghost" is "X".'].join("\n");
    fs.writeFileSync(celPath, src);
    const diags = computeCelDiagnostics(celPath, src, new Map(), validateCELFile);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags.every((d) => d.source === "crl-cel" && d.filePath === canonicalize(celPath) && d.severity === "error")).toBe(true);
  });
});
