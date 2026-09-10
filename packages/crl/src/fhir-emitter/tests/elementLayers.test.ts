// REFACTOR:grounded - generated Elements identities must agree throughout the emitted closure.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emitCQLImports } from "../../imports/emit";
import { layerLibraryName } from "../../cql-emitter/layeredEmit";
import { emitFhirDefFromPath } from "../closureOrchestrator";

const fixture = join(__dirname, "fixtures/code-is-decision-vs");
const source = readFileSync(join(fixture, "code-is-decision-vs.crl"), "utf8");
const metadata = JSON.parse(readFileSync(join(fixture, "package.json"), "utf8"));

describe("Elements library identity through CQL and FHIR", () => {
  it.each(["elements-example", "a".repeat(60) + "x", "a".repeat(60) + "y"])(
    "resolves the complete closure for policy %s",
    (policyId) => {
      const dir = mkdtempSync(join(tmpdir(), "crl-elements-"));
      try {
        writeFileSync(join(dir, "package.json"), JSON.stringify({ ...metadata, name: policyId }));
        const path = join(dir, "policy.crl");
        writeFileSync(path, source);
        const cql = emitCQLImports(path);
        const fhir = emitFhirDefFromPath(path);
        expect(cql.success).toBe(true);
        expect(fhir.success).toBe(true);
        const libraries = fhir.resources.filter((r) => r.resourceType === "Library")
          .map((r) => r.resource as any);
        const urls = new Set(libraries.map((r) => r.url));
        const names = new Set(cql.cqlByLibrary.map((r) => r.libraryName));
        for (const layer of ["LocalElements", "ExternalElements"] as const) {
          const name = layerLibraryName(policyId, layer);
          expect(names.has(name)).toBe(true);
          expect(cql.cqlByLibrary.find((r) => r.libraryName === name)?.layer).toBe(layer);
        }
        expect(new Set(libraries.map((r) => r.id)).size).toBe(libraries.length);
        for (const entry of cql.cqlByLibrary.filter((r) => !r.isSharedCatalog)) {
          const lib = libraries.find((r) => r.name === entry.libraryName);
          expect(lib).toBeDefined();
          expect(lib.id).toBe(entry.libraryName);
          expect(lib.id).toMatch(/^[A-Za-z][A-Za-z0-9]{0,63}$/);
          expect(lib.url).toBe(`${metadata.crl.canonicalBase}/Library/${lib.id}`);
          expect(entry.outputFilename).toBe(`${lib.id}.cql`);
          expect(entry.cql).toContain(`library ${lib.id}`);
          const attachment = lib.content.find((a: any) => a.contentType === "text/cql");
          expect(attachment.url).toBe(`../../cql/${entry.outputFilename}`);
          if (attachment.data) expect(Buffer.from(attachment.data, "base64").toString("utf8")).toBe(entry.cql);
          for (const match of entry.cql.matchAll(/^include (\w+)/gm)) expect(names.has(match[1])).toBe(true);
        }
        const walk = (value: any): void => {
          if (typeof value === "string" && value.startsWith(`${metadata.crl.canonicalBase}/Library/`)) {
            expect(urls.has(value)).toBe(true);
          } else if (value && typeof value === "object") Object.values(value).forEach(walk);
        };
        fhir.resources.forEach((r) => walk(r.resource));
        expect(JSON.stringify(cql)).not.toMatch(/(?:Local|External)Primitives/);
        expect(JSON.stringify(fhir.resources)).not.toMatch(/(?:Local|External)Primitives/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it("distinguishes long shared-prefix policy and layer identities", () => {
    const names = ["x", "y"].flatMap((suffix) =>
      (["LocalElements", "ExternalElements"] as const).map((layer) => layerLibraryName("a".repeat(60) + suffix, layer)),
    );
    expect(new Set(names).size).toBe(4);
  });
});
