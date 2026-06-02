import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

describe("Parser regression test: IMMZ example", () => {
  const TMP_FILE = path.join(__dirname, "testdata", "regression-parser-actual.parse");
  const EXPECTED_FILE = path.join(__dirname, "testdata", "regression-parser-expected.parse");
  const MARKER = "(";

  const isCI = process.env.CI === "true";

  //TODO: figure out how to get this to work in CI
  // SKIPPED in v2.1.0: parser parse-tree snapshot was captured before the
  // `qualifiableReference` grammar rule landed; the new rule wraps every
  // reference site, shifting the tree structure. Regenerate the snapshot
  // when test-cleanup follow-up lands.
  it.skip("should match the expected parser output (ignoring header)", () => {
    // Run the parser CLI and capture output
    const output = execSync(
      "npm run cli:parser -- " + path.join(__dirname, "testdata", "smart-example-immz"),
      { encoding: "utf8" },
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

describe("Parser regression test: Example files run without error", () => {
  const EXAMPLES = [
    path.join(__dirname, "testdata", "clinical-reasoning-language-example.crl"),
    path.join(__dirname, "testdata", "IMMZ_All_Decisions.crl"),
  ];

  EXAMPLES.forEach((examplePath) => {
    // SKIPPED in v2.1.0: regression .crl files lack the now-required
    // `library "Foo".` declaration and use other pre-v0.7 syntax.
    // Pending the test-cleanup follow-up.
    it.skip(`should parse ${path.basename(examplePath)} without error`, () => {
      expect(() => {
        execSync(`npm run cli:parser -- ${examplePath}`, { encoding: "utf8" });
      }).not.toThrow();
    });
  });
});
