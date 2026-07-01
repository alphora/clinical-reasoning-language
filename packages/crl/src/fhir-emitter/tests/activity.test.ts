import { describe, expect, it } from "@jest/globals";

import type { Activity, ActivityType } from "../../ast/types";
import { emitActivityDefinition, emitActivityDefinitionsForLibrary, type TerminologyResolver } from "../activity";
import { ALL_CPG_ACTIVITY_PROFILES, lookupCpgActivityProfile } from "../cpgActivityProfiles";
import type { CpgMetadata } from "../types";

const LOC = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } as const;

const METADATA: CpgMetadata = {
  version: "1.0.0",
  name: "cms22",
  title: "CMS22 Demo",
  description: "CMS22 Blood Pressure Control demonstration corpus",
  publisher: "Smile Digital Health",
  contact: [],
  canonicalBase: "http://hl7.org/fhir/us/cqfmeasures/crl/cms22",
  status: "draft",
  experimental: true,
  jurisdiction: [],
  useContext: [],
};

const FIXED_CLOCK = () => new Date("2026-06-04T15:30:00.000Z");

function activity(
  name: string,
  activityType: ActivityType,
  opts: {
    withTerm?: string;
    withText?: string;
    because?: string;
    doNotPerform?: boolean;
  } = {},
): Activity {
  return {
    type: "Activity",
    name,
    body: {
      type: "ActivityBody",
      request: {
        type: "ActivityRequest",
        activityType,
        ...(opts.doNotPerform ? { doNotPerform: true } : {}),
        location: LOC,
      },
      ...(opts.withTerm || opts.withText
        ? {
            withClause: {
              type: "ActivityWith",
              ...(opts.withTerm ? { terminologyReference: opts.withTerm } : {}),
              ...(opts.withText ? { activityTypeValue: opts.withText } : {}),
              location: LOC,
            },
          }
        : {}),
      ...(opts.because ? { becauseClause: { type: "ActivityBecause", rationale: opts.because, location: LOC } } : {}),
      location: LOC,
    },
    location: LOC,
  };
}

const RESOLVE_ALL: TerminologyResolver = (ref) =>
  typeof ref === "string" ? ref : `${ref.libraryName}.${ref.name}`;
const RESOLVE_NONE: TerminologyResolver = () => null;

describe("activity — emitActivityDefinition", () => {
  it("emits a CPGMedicationRequest ActivityDefinition with all required shareable fields", () => {
    const a = activity("Order Antihypertensive Medication", "CPGMedicationRequest" as ActivityType, {
      withTerm: "Antihypertensive Medications VS",
      because: "Patient has confirmed hypertension and an in-range encounter",
    });
    const { resource, errors, unmatched } = emitActivityDefinition(a, "CMS22 BP Control Cognitive Support Example", METADATA, RESOLVE_ALL, {
      clock: FIXED_CLOCK,
    });
    expect(errors).toEqual([]);
    expect(unmatched).toEqual([]);
    expect(resource).not.toBeNull();
    const r = resource!.resource as Record<string, unknown>;
    expect(r.resourceType).toBe("ActivityDefinition");
    // R1 — id BASE is the policy id ("cms22"), not the library-name slug.
    expect(r.id).toBe("cms22-order-antihypertensive-medication");
    // CPG activity profile + additive CRMI activitydefinition profiles (default publishable).
    expect((r.meta as { profile: string[] }).profile).toEqual([
      "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-medicationrequestactivity",
      "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-shareableactivitydefinition",
      "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-publishableactivitydefinition",
    ]);
    expect(r.url).toBe(
      `http://hl7.org/fhir/us/cqfmeasures/crl/cms22/ActivityDefinition/${r.id}`,
    );
    expect(r.kind).toBe("MedicationRequest");
    expect(r.profile).toBe("http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-medicationrequest");
    expect(r.intent).toBe("proposal");
    expect(r.doNotPerform).toBe(false);
    expect(r.description).toBe("Patient has confirmed hypertension and an in-range encounter");
    expect(r.code).toEqual({
      coding: [
        { system: "http://hl7.org/fhir/uv/cpg/CodeSystem/cpg-activity-type-cs", code: "order-medication" },
      ],
    });
    expect((r.library as string[])[0]).toBe(
      "http://hl7.org/fhir/us/cqfmeasures/crl/cms22/Library/cms22",
    );
    expect(r.dynamicValue).toEqual([
      {
        path: "medicationCodeableConcept",
        expression: {
          language: "text/cql-identifier",
          expression: "Antihypertensive Medications VS",
        },
      },
    ]);
  });

  it("F4: an activity `with` a terminology under an Interface-scoped library[] is a hard error", () => {
    // F4 — when the activity's `library[]` is rewired to the Interface re-export
    // (libraryReferenceSuffix === "interface", the decision-bearing split path) AND
    // it references a TERMINOLOGY via `with`, the dynamicValue would resolve against
    // the Interface library, which re-exports CONCEPTS not terminologies → dangling.
    // Guard it loudly rather than emit the dangling reference.
    const a = activity("Order Antihypertensive Medication", "CPGMedicationRequest" as ActivityType, {
      withTerm: "Antihypertensive Medications VS",
      because: "Patient has confirmed hypertension",
    });
    const { resource, errors } = emitActivityDefinition(
      a,
      "CMS22 BP Control Cognitive Support Example",
      METADATA,
      RESOLVE_ALL,
      { clock: FIXED_CLOCK },
      "Cms22Interface",
      true,
    );
    expect(resource).toBeNull();
    expect(errors.map((e) => e.kind)).toContain("emit-activity-terminology-interface-unsupported");
    expect(errors[0]?.message).toContain("Antihypertensive Medications VS");
  });

  it("F4: an activity with NO `with` terminology under an Interface-scoped library[] emits cleanly (guard is targeted)", () => {
    // The guard fires ONLY on a terminology `with`. A plain text-disposition
    // activity (the deliverable shape) under the Interface suffix is unaffected.
    const a = activity("Refer To GI", "CPGServiceRequest" as ActivityType, {
      because: "Suspected Crohn's disease",
    });
    const { resource, errors } = emitActivityDefinition(
      a,
      "Code Is Decision",
      METADATA,
      RESOLVE_ALL,
      { clock: FIXED_CLOCK },
      "Cms22Interface",
      true,
    );
    expect(errors).toEqual([]);
    expect(resource).not.toBeNull();
    // #186 — library[] resolves to the Interface Library by its unified `S`.
    expect((resource!.resource as { library: string[] }).library[0]).toBe(
      "http://hl7.org/fhir/us/cqfmeasures/crl/cms22/Library/Cms22Interface",
    );
  });

  it("all 14 CRL CPG tokens round-trip the lookup-table fixed fields", () => {
    for (const { token, profile } of ALL_CPG_ACTIVITY_PROFILES) {
      const a = activity(`Test ${token}`, token as ActivityType);
      const { resource, errors } = emitActivityDefinition(a, "Lib", METADATA, RESOLVE_NONE, {
        clock: FIXED_CLOCK,
      });
      expect(errors).toEqual([]);
      expect(resource).not.toBeNull();
      const r = resource!.resource as Record<string, unknown>;
      expect((r.meta as { profile: string[] }).profile).toEqual([
        profile.profileUrl,
        "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-shareableactivitydefinition",
        "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-publishableactivitydefinition",
      ]);
      expect(r.kind).toBe(profile.kind);
      expect(r.profile).toBe(profile.targetProfile);
      expect(r.intent).toBe("proposal");
      expect(r.doNotPerform).toBe(false);
      expect(r.code).toEqual({
        coding: [
          { system: "http://hl7.org/fhir/uv/cpg/CodeSystem/cpg-activity-type-cs", code: profile.activityTypeCode },
        ],
      });
    }
  });

  it("doNotPerform: true when CRL has `request do not perform`", () => {
    const a = activity("Contraindicated Antihypertensive", "CPGMedicationRequest" as ActivityType, {
      withTerm: "Antihypertensive Medications VS",
      doNotPerform: true,
    });
    const { resource } = emitActivityDefinition(a, "Lib", METADATA, RESOLVE_ALL, { clock: FIXED_CLOCK });
    const r = resource!.resource as Record<string, unknown>;
    expect(r.doNotPerform).toBe(true);
  });

  it("description defaults to title when becauseClause is absent", () => {
    const a = activity("Title Only Activity", "CPGServiceRequest" as ActivityType);
    const { resource } = emitActivityDefinition(a, "Lib", METADATA, RESOLVE_NONE, { clock: FIXED_CLOCK });
    const r = resource!.resource as Record<string, unknown>;
    expect(r.description).toBe("Title Only Activity");
    expect(r.title).toBe("Title Only Activity");
  });

  it("no `with` clause → no dynamicValue field on the resource", () => {
    const a = activity("Bare Activity", "CPGServiceRequest" as ActivityType);
    const { resource } = emitActivityDefinition(a, "Lib", METADATA, RESOLVE_NONE, { clock: FIXED_CLOCK });
    const r = resource!.resource as Record<string, unknown>;
    expect(r.dynamicValue).toBeUndefined();
  });

  it("`with` terminology not in closure → unresolved-terminology UnmatchedReference; resource emits without dynamicValue", () => {
    const a = activity("With Unresolved", "CPGServiceRequest" as ActivityType, {
      withTerm: "Unknown VS",
    });
    const { resource, unmatched } = emitActivityDefinition(a, "Lib", METADATA, RESOLVE_NONE, {
      clock: FIXED_CLOCK,
    });
    expect(unmatched.some((u) => u.kind === "unresolved-terminology")).toBe(true);
    const r = resource!.resource as Record<string, unknown>;
    expect(r.dynamicValue).toBeUndefined();
  });

  it("`with` free-text is IGNORED (#181) — NO unmatched, resource emits without dynamicValue, success not pinned", () => {
    const a = activity("With Text", "CPGCommunicationRequest" as ActivityType, {
      withText: "Confirm BP control remains adequate.",
    });
    const { resource, unmatched, errors } = emitActivityDefinition(a, "Lib", METADATA, RESOLVE_ALL, {
      clock: FIXED_CLOCK,
    });
    // A free-text `with` carries no machine signal — it is NOT routed to
    // `unmatched` (which would silently pin success:false) and NOT emitted.
    expect(unmatched).toEqual([]);
    expect(errors).toEqual([]);
    const r = resource!.resource as Record<string, unknown>;
    expect(r.dynamicValue).toBeUndefined();
  });

  it("CPGCommunicationRequest with terminology ref → unsupported-communication-with-terminology (distinct kind, round-2 Q9)", () => {
    const a = activity("CommReq With Term", "CPGCommunicationRequest" as ActivityType, {
      withTerm: "Some VS",
    });
    const { resource, unmatched } = emitActivityDefinition(a, "Lib", METADATA, RESOLVE_ALL, {
      clock: FIXED_CLOCK,
    });
    expect(unmatched.some((u) => u.kind === "unsupported-communication-with-terminology")).toBe(true);
    const r = resource!.resource as Record<string, unknown>;
    expect(r.dynamicValue).toBeUndefined();
  });

  it("CPGQuestionnaire with terminology ref → unsupported-questionnaire-with (distinct kind, round-2 Q9)", () => {
    const a = activity("Quest With Term", "CPGQuestionnaire" as ActivityType, {
      withTerm: "Some VS",
    });
    const { resource, unmatched } = emitActivityDefinition(a, "Lib", METADATA, RESOLVE_ALL, {
      clock: FIXED_CLOCK,
    });
    expect(unmatched.some((u) => u.kind === "unsupported-questionnaire-with")).toBe(true);
    const r = resource!.resource as Record<string, unknown>;
    expect(r.dynamicValue).toBeUndefined();
  });

  it("round-2 Q2 invariant: activity.library[0] byte-equals the URL the matching emitLibrary call produces", async () => {
    const { emitLibrary } = await import("../library");
    const a = activity("Test", "CPGServiceRequest" as ActivityType);
    const { resource: actResource } = emitActivityDefinition(a, "CMS22 Asserted", METADATA, RESOLVE_NONE, {
      clock: FIXED_CLOCK,
    });
    const { resource: libResource } = emitLibrary("CMS22 Asserted", METADATA, [], "cms22-asserted.cql", {
      clock: FIXED_CLOCK,
    });
    const aR = actResource!.resource as Record<string, unknown>;
    const lR = libResource!.resource as Record<string, unknown>;
    expect((aR.library as string[])[0]).toBe(lR.url as string);
  });

  it("invariant: emitted id is at most 64 chars even when names are huge", () => {
    const a = activity("X".repeat(80), "CPGServiceRequest" as ActivityType);
    const { resource } = emitActivityDefinition(a, "Y".repeat(80), METADATA, RESOLVE_NONE, {
      clock: FIXED_CLOCK,
    });
    const r = resource!.resource as Record<string, unknown>;
    expect((r.id as string).length).toBeLessThanOrEqual(64);
  });

  it("invariant: name conforms to FHIR name regex (leading X prefix for digit-leading library)", () => {
    const a = activity("Codes", "CPGServiceRequest" as ActivityType);
    const { resource } = emitActivityDefinition(a, "123 Lib", METADATA, RESOLVE_NONE, { clock: FIXED_CLOCK });
    const r = resource!.resource as Record<string, unknown>;
    expect(r.name).toMatch(/^[A-Z][A-Za-z0-9_]{0,254}$/);
  });

  it("invariant: url has no double-slash between base and ActivityDefinition", () => {
    const m: CpgMetadata = { ...METADATA, canonicalBase: "http://example.org/base" };
    const a = activity("Codes", "CPGServiceRequest" as ActivityType);
    const { resource } = emitActivityDefinition(a, "Lib", m, RESOLVE_NONE, { clock: FIXED_CLOCK });
    const r = resource!.resource as Record<string, unknown>;
    expect((r.url as string).indexOf("//ActivityDefinition/")).toBe(-1);
  });

  it("two activities referencing the SAME terminology → byte-identical dynamicValue expressions (round-1 I5)", () => {
    const a1 = activity("Activity 1", "CPGMedicationRequest" as ActivityType, {
      withTerm: "Antihypertensive Medications VS",
    });
    const a2 = activity("Activity 2", "CPGMedicationRequest" as ActivityType, {
      withTerm: "Antihypertensive Medications VS",
    });
    const r1 = emitActivityDefinition(a1, "Lib", METADATA, RESOLVE_ALL, { clock: FIXED_CLOCK })
      .resource!.resource as Record<string, unknown>;
    const r2 = emitActivityDefinition(a2, "Lib", METADATA, RESOLVE_ALL, { clock: FIXED_CLOCK })
      .resource!.resource as Record<string, unknown>;
    expect(r1.dynamicValue).toEqual(r2.dynamicValue);
  });

  it("defensive: both terminologyReference + activityTypeValue set → malformed-activity-with error; no dynamicValue", () => {
    const a = activity("Bad With", "CPGServiceRequest" as ActivityType, {
      withTerm: "Some VS",
      withText: "free-text",
    });
    const { resource, errors } = emitActivityDefinition(a, "Lib", METADATA, RESOLVE_ALL, {
      clock: FIXED_CLOCK,
    });
    expect(errors.some((e) => e.kind === "malformed-activity-with")).toBe(true);
    const r = resource!.resource as Record<string, unknown>;
    expect(r.dynamicValue).toBeUndefined();
  });

  it("non-ASCII activity name emits non-ascii-slug-fallback warning", () => {
    const a = activity("高血圧 Activity", "CPGServiceRequest" as ActivityType);
    const { errors } = emitActivityDefinition(a, "Lib", METADATA, RESOLVE_NONE, { clock: FIXED_CLOCK });
    expect(errors.some((e) => e.kind === "non-ascii-slug-fallback")).toBe(true);
  });
});

describe("activity — emitActivityDefinitionsForLibrary (Δ5 collision)", () => {
  it("emits all activities when slugs are distinct", () => {
    const acts = [
      activity("Order BP", "CPGServiceRequest" as ActivityType),
      activity("Order Followup", "CPGServiceRequest" as ActivityType),
    ];
    const { resources, errors } = emitActivityDefinitionsForLibrary(acts, "Lib", METADATA, RESOLVE_NONE, {
      clock: FIXED_CLOCK,
    });
    expect(errors).toEqual([]);
    expect(resources).toHaveLength(2);
  });

  it("Δ5 errors on slug collision and skips colliding activities", () => {
    const acts = [
      activity("Same Name", "CPGServiceRequest" as ActivityType),
      activity("same name", "CPGServiceRequest" as ActivityType),
    ];
    const { resources, errors } = emitActivityDefinitionsForLibrary(acts, "Lib", METADATA, RESOLVE_NONE, {
      clock: FIXED_CLOCK,
    });
    expect(errors.some((e) => e.kind === "slug-collision")).toBe(true);
    expect(resources).toHaveLength(0);
  });

  it("verified table — lookupCpgActivityProfile returns the row used by the closure-level emit", () => {
    // Sanity that the activity emit's profile lookup is wired off the same
    // table as cpgActivityProfiles.test.ts asserts.
    const acts = [activity("Test", "CPGServiceRequest" as ActivityType)];
    const { resources } = emitActivityDefinitionsForLibrary(acts, "Lib", METADATA, RESOLVE_NONE, {
      clock: FIXED_CLOCK,
    });
    const r = resources[0]!.resource as Record<string, unknown>;
    expect(r.kind).toBe(lookupCpgActivityProfile("CPGServiceRequest")!.kind);
  });
});
