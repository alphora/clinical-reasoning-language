import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

import { describe, expect, it } from "vitest";

import type { EmittedResource, FhirDefEmitResult } from "../types";
import { writeFhirResources } from "../writer";

function tmpDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "fhir-writer-test-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function fakeResource(
  relativePath: string,
  resourceType: EmittedResource["resourceType"],
): EmittedResource {
  return {
    resourceType,
    relativePath,
    resource: { resourceType, id: "x" },
  };
}

describe("fhir-emitter writer.writeFhirResources", () => {
  it("writes each resource at its relativePath under outDir", () => {
    const { dir, cleanup } = tmpDir();
    try {
      const emit: FhirDefEmitResult = {
        success: true,
        resources: [
          fakeResource("ValueSet/a.json", "ValueSet"),
          fakeResource("ActivityDefinition/b.json", "ActivityDefinition"),
        ],
      };
      const paths = writeFhirResources(emit, dir);
      expect(paths).toHaveLength(2);
      expect(existsSync(join(dir, "ValueSet", "a.json"))).toBe(true);
      expect(existsSync(join(dir, "ActivityDefinition", "b.json"))).toBe(true);
      const json = JSON.parse(readFileSync(join(dir, "ValueSet", "a.json"), "utf8"));
      expect(json).toEqual({ resourceType: "ValueSet", id: "x" });
    } finally {
      cleanup();
    }
  });

  it("creates resource-type subdirectories as needed", () => {
    const { dir, cleanup } = tmpDir();
    try {
      const emit: FhirDefEmitResult = {
        success: true,
        resources: [fakeResource("ValueSet/x.json", "ValueSet")],
      };
      // ValueSet/ dir does not exist yet; writer should create it.
      writeFhirResources(emit, dir);
      expect(existsSync(join(dir, "ValueSet"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("round-2 F3: writes Library/<id>.json into a Library/ subdir (Todo 2a addition to the union)", () => {
    const { dir, cleanup } = tmpDir();
    try {
      const emit: FhirDefEmitResult = {
        success: true,
        resources: [fakeResource("Library/cms22-asserted.json", "Library")],
      };
      const paths = writeFhirResources(emit, dir);
      expect(paths).toHaveLength(1);
      expect(existsSync(join(dir, "Library", "cms22-asserted.json"))).toBe(true);
      const json = JSON.parse(readFileSync(join(dir, "Library", "cms22-asserted.json"), "utf8"));
      expect(json).toEqual({ resourceType: "Library", id: "x" });
    } finally {
      cleanup();
    }
  });

  it("round-2 (gpt55 important #5) throws on path traversal via ../ in relativePath", () => {
    const { dir, cleanup } = tmpDir();
    try {
      const emit: FhirDefEmitResult = {
        success: true,
        resources: [
          {
            resourceType: "ValueSet",
            relativePath: "../escape.json",
            resource: { resourceType: "ValueSet", id: "x" },
          },
        ],
      };
      expect(() => writeFhirResources(emit, dir)).toThrow(/Path traversal/);
    } finally {
      cleanup();
    }
  });

  it("returns absolute paths in input order", () => {
    const { dir, cleanup } = tmpDir();
    try {
      const emit: FhirDefEmitResult = {
        success: true,
        resources: [
          fakeResource("PlanDefinition/p.json", "PlanDefinition"),
          fakeResource("ValueSet/v.json", "ValueSet"),
        ],
      };
      const paths = writeFhirResources(emit, dir);
      expect(paths[0]!.endsWith("PlanDefinition" + sep + "p.json")).toBe(true);
      expect(paths[1]!.endsWith("ValueSet" + sep + "v.json")).toBe(true);
    } finally {
      cleanup();
    }
  });
});
