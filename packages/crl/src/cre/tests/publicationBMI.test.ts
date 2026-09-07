import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect } from "vitest";
import { resolveCelImports } from "../../cel/imports";
import { runCel } from "../run";
import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";
import { emitCQLImports } from "../../imports/emit";

// REFACTOR:grounded (#320, plan589): actual CEL data follows both measurement dependencies.
describe("BMI CEL/CRE", () => {
  it("calculates, pauses and keeps selected assertions independent from production", () => {
    const parent = path.resolve(os.tmpdir()),
      dir = mkdtempSync(path.join(parent, "crl-bmi-"));
    if (path.dirname(dir) !== parent || !path.basename(dir).startsWith("crl-bmi-"))
      throw Error("Unexpected test path");
    try {
      writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({
          name: "bmi-publication",
          version: "0.0.0",
          crl: { canonicalBase: "http://example.org/bmi", date: "2026-09-07" },
        }),
      );
      const crl = path.join(dir, "policy.crl"),
        cel = path.join(dir, "cases.cel");
      writeFileSync(
        crl,
        readFileSync(path.join(__dirname, "../../emit/tests/fixtures/publication-bmi.crl")),
      );
      const facts = [
        ["W", "Weight", "36.3 'kg'"],
        ["H", "Height", "1.1 'm'"],
        ["Low", "Weight", "36.29999999 'kg'"],
        ["Clear", "Height", null],
        ["Override", "BMI", "20 'kg/m2'"],
      ];
      const cases = [
        ["Exact", ["W", "H"], '"Approve"'],
        ["Below", ["Low", "H"], '"Deny"'],
        ["MissingHeight", ["W"], "pause"],
        ["MissingWeight", ["H"], "pause"],
        ["Valueless", ["W", "Clear"], "pause"],
        ["Override", ["W", "H", "Override"], '"Deny"'],
      ];
      writeFileSync(
        cel,
        'library "BMI Cases".\ncovers "BMI Publication".\nfact "P":\n- defined by "Patient".\n' +
          facts
            .map(
              ([name, concept, value]) =>
                `fact "${name}":\n- defined by "BMI Publication"."${concept}".\n${value ? `- value is ${value}.\n` : ""}- date is "${name === "Override" ? "2026-09-02" : "2026-09-01"}".\n`,
            )
            .join("") +
          cases
            .map(
              ([name, inputs, want]) =>
                `case "${name}":\n- subject is "P".\n${(inputs as string[]).map((f) => `- fact is "${f}".\n`).join("")}- result is "D" is ${want}.\n`,
            )
            .join(""),
      );
      const runs = runCel(resolveCelImports(cel));
      expect(runs.runs.length).toBe(6);
      expect(runs.runs.map((r) => ({ status: r.status, diagnostics: r.diagnostics }))).toEqual(
        Array.from({ length: 6 }, () => ({ status: "pass", diagnostics: [] })),
      );
      const fhir = emitFhirDefFromPath(crl);
      expect(fhir.success, JSON.stringify(fhir.errors)).toBe(true);
      expect(
        fhir.resources
          .filter((r) => r.resource.resourceType === "StructureDefinition")
          .map((r) => r.resource.id)
          .sort(),
      ).toEqual(["bmi-publication-bmi", "bmi-publication-height", "bmi-publication-weight"]);
      // Both uncoded computation operands must retain their physical and answer dependencies in a sibling library.
      const full = readFileSync(crl, "utf8"),
        i = full.indexOf('concept "BMI":');
      writeFileSync(
        path.join(dir, "measurements.crl"),
        full.slice(0, i).replace('library "BMI Publication".', 'library "Measurements".'),
      );
      writeFileSync(
        crl,
        'library "BMI Publication".\n' +
          full
            .slice(i)
            .replace("- code is `bmi`.\n", "")
            .replace(
              '- source representation:\n  - type is Observation.\n  - coded from "BMI Source".\n',
              "",
            )
            .replace(
              'body mass index of "Weight" and "Height" using validity of "Weight"',
              'body mass index of "Measurements"."Weight" and "Measurements"."Height" using validity of "Measurements"."Weight"',
            ),
      );
      const cql = emitCQLImports(crl);
      expect(cql.success, JSON.stringify(cql.errors)).toBe(true);
      const foreign = emitFhirDefFromPath(crl);
      expect(foreign.success, JSON.stringify(foreign.errors)).toBe(true);
      expect(
        foreign.resources
          .filter((r) => r.resource.resourceType === "StructureDefinition")
          .map((r) => r.resource.id)
          .sort(),
      ).toEqual(["bmi-publication-measurements-height", "bmi-publication-measurements-weight"]);
      // A coded BMI is partitioned: both foreign physical includes must survive that second split.
      const block = (name: string, kind = "concept") => {
        const start = full.indexOf(`${kind} "${name}":`);
        const end = full.slice(start).search(/\n(?:concept|terminology|activity) "/);
        return full.slice(start, start + end + 1);
      };
      for (const name of ["Weight", "Height"])
        writeFileSync(
          path.join(dir, name.toLowerCase() + ".crl"),
          `library "${name} Library".\n` + block(name + " Source", "terminology") + block(name),
        );
      writeFileSync(
        crl,
        'library "BMI Publication".\n' +
          block("BMI Source", "terminology") +
          full
            .slice(i)
            .replace(
              'body mass index of "Weight" and "Height" using validity of "Weight"',
              'body mass index of "Weight Library"."Weight" and "Height Library"."Height" using validity of "Weight Library"."Weight"',
            ),
      );
      const split = emitCQLImports(crl);
      expect(split.success, JSON.stringify(split.errors)).toBe(true);
      const inference = split.cqlByLibrary.find(
        (c) => c.outputFilename === "BmiPublicationInferences.cql",
      )!.cql;
      expect(inference).toContain("include BmiPublicationWeightLibraryInferences");
      expect(inference).toContain("include BmiPublicationHeightLibraryInferences");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
