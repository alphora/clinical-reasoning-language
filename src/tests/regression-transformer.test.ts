import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

import stripAnsi from "strip-ansi";

describe("Transformer regression test: IMMZ example", () => {
  const TMP_FILE = path.join(__dirname, "testdata", "regression-transformer-actual.cpg");
  const EXPECTED_FILE = path.join(__dirname, "testdata", "regression-transformer-expected.cpg");
  const MARKER = "// Instance: IMMZD2DTMeaslesDose0";

  const isCI = process.env.CI === "true";

  //TODO: figure out how to get this to work in CI
  (isCI ? it.skip : it)("should match the expected CRL output (ignoring header)", () => {
    // Run the transformer CLI and capture output
    let output = execSync(
      "npm run cli:transformer:fsh-to-crl -- " +
        path.join(__dirname, "testdata", "smart-example-immz"),
      { encoding: "utf8" },
    );

    // Filter out SUSHI/npm log lines (colored warn/info, npm script headers)
    output = output
      .split("\n")
      .map((line) => stripAnsi(line))
      .filter(
        (line) =>
          !line.startsWith("warn:") &&
          !line.startsWith("info:") &&
          !line.startsWith("> ") && // npm script header
          !line.startsWith("npm ") && // npm info lines
          !line.startsWith("Debugger attached.") && // node debug
          !line.startsWith("Waiting for the debugger to disconnect..."), // node debug
      )
      .join("\n"); // Do NOT remove empty lines

    fs.writeFileSync(TMP_FILE, output, "utf8");

    // Read both files
    const actual = fs.readFileSync(TMP_FILE, "utf8");
    const expected = fs.readFileSync(EXPECTED_FILE, "utf8");

    // Find the marker in both files
    const actualStart = actual.indexOf(MARKER);
    const expectedStart = expected.indexOf(MARKER);
    expect(actualStart).toBeGreaterThanOrEqual(0);
    expect(expectedStart).toBeGreaterThanOrEqual(0);

    const actualBody = actual.slice(actualStart).replace(/\r\n/g, "\n");
    const expectedBody = expected.slice(expectedStart).replace(/\r\n/g, "\n");

    // Compare including whitespace
    expect(actualBody).toBe(expectedBody);
  });
});
