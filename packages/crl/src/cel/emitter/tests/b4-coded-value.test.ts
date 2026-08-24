import { readFileSync } from "fs";
import * as path from "path";

import { describe, expect, it } from "vitest";

import { canonicalizeFsPath } from "../../../imports/paths";
import { resolveCelImports } from "../../imports";
import { emitCelToFhir } from "../emitFhir";
import type { EmittedResource } from "../types";

/**
 * #189 B4 (disc 501, both crl-emit arms) — the CEL CodeableConcept value write.
 *
 * The value/interface convention's canonical LOCAL-OVERRIDE arm (disc 496): a `.cel` fact asserting WHICH covered
 * device was locally determined — an Observation whose `code` is the concept IDENTITY (`covered-device`, DERIVED
 * from the concept's `code is`) AND whose `value` is the case-specific device CodeableConcept (AUTHORED on the
 * fact). Pre-B4 the CEL lane could carry the identity but not the value. B4 resolves the value SHAPE from the
 * effective-representation descriptor (the single authority both lanes read) and writes `valueCodeableConcept`.
 *
 * Fixture: the real HCSC PA policy dme101-030 — its `Covered Device` concept is exactly the both-rep CC value
 * concept (`type is Observation`, `value type is CodeableConcept`, `code is covered-device`, `most recent this`).
 * We overlay a `value is "<system>|<code>"` onto the `Covered Stimulator Ordered` fact (non-invasive — the
 * committed fixture exercises the remote-default path; the overlay exercises the local override).
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DME_CEL = path.join(REPO_ROOT, "src/tests/fixtures/policies/dme101-030/dme101-030.cel");

const LOCAL_SYSTEM = "http://example.org/hcsc/dme101-030/CodeSystem/dme101-030-local";
const DEVICE_SYSTEM = "http://example.org/hcsc/dme101-030/CodeSystem/covered-devices";
const DEVICE_CODE = "ultrasonic-stimulator";

const ORDERED_FACT = `fact "Covered Stimulator Ordered":
- date is "2026-02-01".
- defined by "Ultrasonic Osteogenesis Stimulator Coverage"."Covered Device".`;

/** Emit dme101-030 with the `Covered Stimulator Ordered` fact's body replaced by `injectedBody`. */
function emitWithOrderedBody(injectedBody: string) {
  const original = readFileSync(DME_CEL, "utf-8");
  const replacement = `fact "Covered Stimulator Ordered":
${injectedBody}
- defined by "Ultrasonic Osteogenesis Stimulator Coverage"."Covered Device".`;
  const src = original.replace(ORDERED_FACT, replacement);
  expect(src).not.toBe(original); // the replace actually fired
  const canonical = canonicalizeFsPath(DME_CEL);
  const graph = resolveCelImports(DME_CEL, { overlays: new Map([[canonical, src]]) });
  return emitCelToFhir(graph);
}

/** The first coding entry off a resource element (`code` or `valueCodeableConcept`). */
function firstCoding(body: Record<string, unknown>, element: string): { system?: string; code?: string } | undefined {
  const cc = body[element] as { coding?: Array<{ system?: string; code?: string }> } | undefined;
  return cc?.coding?.[0];
}

/** Every emitted Observation whose IDENTITY code is `covered-device` (the `Covered Device` concept's instances). */
function coveredDeviceObservations(result: ReturnType<typeof emitCelToFhir>): EmittedResource[] {
  return result.emittedCases
    .flatMap((c) => c.resources)
    .filter((r) => r.resourceType === "Observation" && firstCoding(r.body, "code")?.code === "covered-device");
}

describe("#189 B4 — CEL CodeableConcept value write (local override arm, disc 496)", () => {
  describe("positive — a local CC datum emits `code` (identity) + `valueCodeableConcept` (device), independently", () => {
    const result = emitWithOrderedBody(
      `- date is "2026-02-01".\n- value is "${DEVICE_SYSTEM}|${DEVICE_CODE}".`,
    );

    it("emits with no error diagnostics", () => {
      expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    });

    it("each covered-device Observation carries the AUTHORED device as valueCodeableConcept", () => {
      const obs = coveredDeviceObservations(result);
      expect(obs.length).toBeGreaterThan(0);
      for (const r of obs) {
        // Identity axis — the DERIVED local concept code (NOT the device).
        expect(firstCoding(r.body, "code")).toEqual({ system: LOCAL_SYSTEM, code: "covered-device" });
        // Datum axis — the AUTHORED device CodeableConcept (NOT the identity), on value[x].
        expect(firstCoding(r.body, "valueCodeableConcept")).toEqual({ system: DEVICE_SYSTEM, code: DEVICE_CODE });
        // The two axes never bleed into each other (the disc-496 conflation guard).
        expect(firstCoding(r.body, "code")?.code).not.toBe(DEVICE_CODE);
        expect(firstCoding(r.body, "valueCodeableConcept")?.code).not.toBe("covered-device");
        // No sibling value shape was manufactured.
        expect(r.body.valueString).toBeUndefined();
        expect(r.body.valueBoolean).toBeUndefined();
        expect(r.body.valueQuantity).toBeUndefined();
      }
    });
  });

  describe("negative — a CodeableConcept-declared datum fails CLOSED (never a manufactured/partial value)", () => {
    it("a NON-STRING value on a CC concept is a typed error and the fact is SKIPPED (disc 501 gpt56 #2)", () => {
      const result = emitWithOrderedBody(`- date is "2026-02-01".\n- value is 42.`);
      const errs = result.diagnostics.filter((d) => d.kind === "local-coded-value-invalid");
      expect(errs.length).toBeGreaterThan(0);
      expect(errs[0].severity).toBe("error");
      // Skipped → no covered-device Observation manufactured a valueQuantity from the number.
      for (const r of coveredDeviceObservations(result)) {
        expect(r.body.valueQuantity).toBeUndefined();
      }
    });

    it("a MALFORMED token (no `<system>|<code>` pipe) is a typed error and the fact is SKIPPED (disc 501 #4)", () => {
      const result = emitWithOrderedBody(`- date is "2026-02-01".\n- value is "bareword".`);
      const errs = result.diagnostics.filter((d) => d.kind === "local-coded-value-invalid");
      expect(errs.length).toBeGreaterThan(0);
      // No covered-device Observation carries a system-less / partial value.
      for (const r of coveredDeviceObservations(result)) {
        expect(r.body.valueCodeableConcept).toBeUndefined();
      }
    });

    it("an EMPTY-system token (`|code`) is a typed error (a datum B5 membership could never match)", () => {
      const result = emitWithOrderedBody(`- date is "2026-02-01".\n- value is "|${DEVICE_CODE}".`);
      expect(result.diagnostics.some((d) => d.kind === "local-coded-value-invalid")).toBe(true);
    });
  });

  describe("inertness — the existing (no-value) local-override fact is byte-unchanged", () => {
    it("the committed fixture (no `value is`) still emits covered-device Observations with NO value element", () => {
      const graph = resolveCelImports(DME_CEL);
      const result = emitCelToFhir(graph);
      expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      const obs = coveredDeviceObservations(result);
      expect(obs.length).toBeGreaterThan(0);
      for (const r of obs) {
        // No value of any shape — the remote-default path is unchanged by B4 (fires for zero corpus facts).
        expect(r.body.valueCodeableConcept).toBeUndefined();
        expect(r.body.valueString).toBeUndefined();
        expect(r.body.valueQuantity).toBeUndefined();
        expect(r.body.valueBoolean).toBeUndefined();
      }
    });
  });
});
