// #189 Piece 3 — the lane-neutral SOURCE-membership derivation, the twin of `localMembership.ts`. A both-rep (or
// source-only) concept's `source representation:` posrep binds a terminology via `coded from "VS"`; this derives the
// MECHANICAL emitted set of that terminology — a reference VS's single stub coding (via the shared
// `referenceStubCoding`, byte-identical to `valueSet.ts`) or an instantiated VS's inline codes — so the CRE compares
// a fact's code against the SAME set the FHIR ValueSet + CQL retrieve use. Charter §3/§4: membership is MECHANICAL,
// against the emitted set — NEVER a runtime resolution of the real external value set (the CRE is not a runtime).

import type {
  Concept,
  Terminology,
  TerminologyCode,
  TerminologySystem,
  TerminologyValueset,
} from "../ast/types";
import { matchNarrative } from "../template-match/matcher";
import { getRefName } from "../ast/types";
import { referenceStubCoding } from "../fhir-emitter/valueSet";
import type { Registry } from "../imports/types";

/** A concept's source-set element — the identity a fact's `(fhirType, {system,code})` is checked against. The
 *  `fhirType` is the POSREP's own `type is` (e.g. ServiceRequest), NOT the concept's local `type is`. */
export interface SourceConceptMember {
  fhirType: string;
  system: string;
  code: string;
  /**
   * ⭐ The matched pattern of the OWNING posrep's `value projection is`, or `undefined` when it has none.
   *
   * ⚠⚠ LOAD-BEARING FOR THE CRE, and its absence caused a silent wrong verdict. A candidate's boolean is the
   * PROJECTION's output — `exists this` yields `true` per retrieved record, `matches this` yields `true` for a
   * member. But a posrep with NO projection is read as the concept's VALUE (charter §3), so a member fact
   * carrying `value is false` must contribute `false`. Without this field the CRE assumed every source member
   * contributed `true`, and a stated denial on a projection-less coded posrep read as an approval.
   */
  projection?: string;
}

/** Resolve a terminology by name across the registry (same lookup the CQL/emit lane uses). Bare same-library ref for
 *  now; a qualified cross-library `coded from "Lib"."VS"` is a Piece-3 refinement (kept a simple by-name scan). */
function resolveTerminology(name: string, registry: Registry): Terminology | undefined {
  for (const e of [...registry.byNamePackage.values(), ...registry.byNameLocal.values()]) {
    for (const s of e.ast.statements) {
      if (s.type === "Terminology" && s.name === name) return s;
    }
  }
  return undefined;
}

/** The MECHANICAL emitted `{system, code}` set of a terminology: a PURE reference VS (`valueset is <url>`, no other
 *  lines) → the single stub coding (or `[]` when it has no FHIR-id-legal tail — a URN can't be stubbed); otherwise
 *  the inline `system is`/`code is` pairs (mirrors `valueSet.ts` `buildCompose`). No runtime resolution. */
function terminologyMembers(term: Terminology, base: string): { system: string; code: string }[] {
  const refLines = term.body.filter((l): l is TerminologyValueset => l.type === "TerminologyValueset");
  const isPureReference = refLines.length === 1 && term.body.every((l) => l.type === "TerminologyValueset");
  if (isPureReference) {
    const coding = referenceStubCoding(refLines[0].valuesetName, base);
    return coding ? [coding] : [];
  }
  const out: { system: string; code: string }[] = [];
  let lastSystem: string | null = null;
  for (const line of term.body) {
    if (line.type === "TerminologySystem") lastSystem = (line as TerminologySystem).system;
    // A `valueset is` line resets the current system to null — EXACTLY as `valueSet.ts buildCompose` does, so a
    // `code is` following it (a mixed/validator-bypassing body) is skipped in BOTH lanes rather than mis-paired to
    // the preceding system (panel sanity pass — a real drift the emit lane does not have).
    else if (line.type === "TerminologyValueset") lastSystem = null;
    else if (line.type === "TerminologyCode" && lastSystem !== null) {
      out.push({ system: lastSystem, code: (line as TerminologyCode).code });
    }
  }
  return out;
}

/** Every source-set member a concept publishes across its `source representation:` posreps that carry a `coded from`.
 *  A posrep with no `coded from` (an uncoded value read, e.g. Patient/birthDate) contributes no code set — it is the
 *  recency/value-read lane (#257), not membership. Returns `[]` when the base/registry is unavailable. */
export function sourceMembersOfConcept(
  concept: Concept,
  base: string | undefined,
  registry: Registry | undefined,
): SourceConceptMember[] {
  if (!base || !registry) return [];
  const members: SourceConceptMember[] = [];
  for (const rep of concept.representations) {
    if (!rep.terminologyName || typeof rep.conceptType !== "string") continue;
    const term = resolveTerminology(getRefName(rep.terminologyName), registry);
    if (!term) continue;
    const projection = rep.valueProjection ? matchNarrative(rep.valueProjection.body).pattern : undefined;
    for (const m of terminologyMembers(term, base)) {
      members.push({
        fhirType: rep.conceptType,
        system: m.system,
        code: m.code,
        ...(projection !== undefined ? { projection } : {}),
      });
    }
  }
  return members;
}
