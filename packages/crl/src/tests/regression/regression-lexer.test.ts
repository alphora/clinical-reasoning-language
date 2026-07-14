import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
const CRL_PKG_ROOT = path.resolve(__dirname, "..", "..", ".."); // = packages/crl (vitest runs from repo root; the `npm run cli:*` subprocess needs the crl cwd)

describe("Lexer regression test: IMMZ example", () => {
  const TMP_FILE = path.join(__dirname, "testdata", "regression-lexer-actual.tokens");
  const EXPECTED_FILE = path.join(__dirname, "testdata", "regression-lexer-expected.tokens");
  const MARKER = "[";

  // SKIPPED in v2.1.0: this snapshot was captured against the original
  // FSH-generated IMMZ_All_Decisions.crl content. The FSH → CRL
  // transformer is deprecated and that file is now a deprecation banner,
  // so the snapshot would only re-codify the banner. Matches the
  // already-skipped IMMZ snapshots in regression-{parser,ast}.test.ts.
  it.skip("should match the expected lexer output (ignoring header)", () => {
    // Run the lexer CLI and capture output
    const output = execSync(
      "npm run cli:lexer -- " + path.join(__dirname, "testdata", "smart-example-immz"),
      { encoding: "utf8", cwd: CRL_PKG_ROOT },
    );
    fs.writeFileSync(TMP_FILE, output, "utf8");

    // Read both files
    const actual = fs.readFileSync(TMP_FILE, "utf8");
    const expected = fs.readFileSync(EXPECTED_FILE, "utf8");

    // Find the marker in both files
    const actualStart = actual.indexOf(MARKER);
    const expectedStart = expected.indexOf(MARKER);
    expect(actualStart).toBeGreaterThanOrEqual(0);
    expect(expectedStart).toBeGreaterThanOrEqual(0);

    const actualBody = actual.slice(actualStart).replace(/\r\n/g, "\n").trimEnd();
    const expectedBody = expected.slice(expectedStart).replace(/\r\n/g, "\n").trimEnd();

    // Compare including whitespace
    expect(actualBody).toBe(expectedBody);
  });
});

describe("Lexer regression test: Example files run without error", () => {
  const EXAMPLES = [
    path.join(__dirname, "testdata", "clinical-reasoning-language-example.crl"),
    path.join(__dirname, "testdata", "IMMZ_All_Decisions.crl"),
  ];

  EXAMPLES.forEach((examplePath) => {
    it(`should lex ${path.basename(examplePath)} without error`, () => {
      expect(() => {
        execSync(`npm run cli:lexer -- ${examplePath}`, { encoding: "utf8", cwd: CRL_PKG_ROOT });
      }).not.toThrow();
    });
  });
});
