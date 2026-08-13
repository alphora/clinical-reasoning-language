import { describe, it, expect } from "vitest";

import { relativeElementPath } from "../elementPath";

describe("relativeElementPath — the shared qualified→relative strip", () => {
  it("strips the leading resource segment", () => {
    expect(relativeElementPath("Patient.birthDate", "Patient")).toBe("birthDate");
    expect(relativeElementPath("Observation.value", "Observation")).toBe("value");
  });

  it("preserves an already-relative path", () => {
    expect(relativeElementPath("value", "Observation")).toBe("value");
  });

  it("strips ONLY the single leading resource segment; a nested remainder is preserved", () => {
    expect(relativeElementPath("Patient.meta.lastUpdated", "Patient")).toBe("meta.lastUpdated");
  });

  it("does not strip a non-matching prefix", () => {
    expect(relativeElementPath("Observation.value", "Patient")).toBe("Observation.value");
  });
});
