import { CRL } from "../ast/types";
import { isCaseFeatureEmittable } from "../fhir-model/caseFeatureResources";
import type { SourceContext } from "../imports/scopes";
import { resolveAgeConcept } from "../template-match/recencyProjectionOverride";

import { ValidationError } from "./validator";

// #189 / disc 495 Q6 — the authoring-time EMIT-CAPABILITY warning (the "#1" rider). A concept with a local
// `code is` whose effective resource type is NOT a case-feature-emittable registry resource would fail LOUD at
// emit (`unsupported-casefeature-resource`); this surfaces it EARLIER, at `validate_crl`, as a WARNING.
//
// WARNING, never an error (dispositions disc 494/495): the emit registry is a DELIBERATE SUBSET of capability,
// so a hard error would turn "not yet emittable" (`type is Immunization`) into "invalid CRL" — breaching the
// rule that the grammar (not the registry) defines the language. `conceptTypes` admits 33 resource types; the
// registry backs 6 (5 case-feature + Encounter's CEL-writer-only row), so ~27 grammar-valid types trip this.
//
// Gating MIRRORS the descriptor deriver's own gating (`effectiveRepresentation.ts`), so validate and emit cannot
// drift on which concepts derive a case feature:
//   - only LOCAL record-bearing concepts (a local `code is`) — a source-only / pure-derived concept has no local
//     code and derives no case-feature instance here, so it is skipped (never false-warned);
//   - patient-AGE concepts are Patient-backed (supported / supplied), classified by the SHARED lane-neutral
//     `resolveAgeConcept` (the same authority emit uses) — skipped.
// The effective resource type of a local concept is its `type is` (`conceptType`), DEFAULTED to the
// implicit-standard local `Observation` (charter §3), exactly as the deriver defaults it.

type Attribution = { libraryName?: string; filePath?: string };

const IMPLICIT_LOCAL_TYPE = "Observation";

export class EmitCapabilityValidator {
  public validate(ast: CRL, sources?: SourceContext[]): ValidationError[] {
    const errors: ValidationError[] = [];
    if (sources) {
      // Multi-file: attribute each finding to its owning scope so the squiggle lands on the right file.
      for (const { stmt, scope } of sources) {
        this.check(stmt, { libraryName: scope.currentLibrary, filePath: scope.filePath }, errors);
      }
    } else {
      for (const stmt of ast.statements) this.check(stmt, {}, errors);
    }
    return errors;
  }

  private check(
    stmt: CRL["statements"][number],
    attribution: Attribution,
    errors: ValidationError[],
  ): void {
    if (stmt.type !== "Concept") return;
    // Only a LOCAL record-bearing concept (a local `code is`) derives a case-feature instance here.
    if (!stmt.code) return;
    // Patient-age is Patient-backed (supported/supplied), classified by the shared age authority — not flagged.
    if (resolveAgeConcept(stmt).kind !== "not-age") return;

    const resourceType = stmt.conceptType ?? IMPLICIT_LOCAL_TYPE;
    if (isCaseFeatureEmittable(resourceType)) return;

    errors.push({
      kind: "unsupported-casefeature-resource",
      conceptName: stmt.name,
      resourceType,
      message:
        `Concept "${stmt.name}": resource type \`${resourceType}\` is not yet emittable as a case-feature ` +
        `datum — \`emit_cel\` will fail closed on it. Use a supported resource type (Observation, Condition, ` +
        `Procedure, ServiceRequest, MedicationRequest) for the local \`code is\`, or model it without one.`,
      location: stmt.location,
      severity: "warning",
      ...attribution,
    });
  }
}
