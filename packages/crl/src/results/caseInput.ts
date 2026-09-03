/**
 * ⭐⭐ THE PRODUCER'S INPUT, derived from the PARSER and the EMIT RESULT — never from the `.cel` text.
 *
 * ⚠ WHY THIS EXISTS RATHER THAN ADOPTING THE HANDED-OVER DERIVER. The working harness we were given
 * builds its case list by regexing `.cel` source (`matchAll(/^fact "([^"]+)":/gm)`,
 * `/- value is false\./`, …) into a hand-shaped JSON that a Java driver then consumes. Three
 * consequences, all measured by reading it:
 *
 *   1. It is boolean-only — `value: !/- value is false\./` — so a coded answer (`value is "x"`), a
 *      Quantity or a CodeableConcept has no representation at all.
 *   2. It keys answers by the Questionnaire GROUP TITLE (`"<Concept Name>?"`), which both review arms
 *      independently called out: a title is display text, not identity.
 *   3. It is a SECOND description of the suite. Any divergence between it and the `.cel` is silent, and
 *      "run_apply and run_decision are twins over one suite" is exactly the claim that divergence voids.
 *
 * We already hold the parsed graph, the run oracle and the emitted resources. Deriving from those makes
 * the two lanes twins by construction instead of by maintenance.
 */

import type { EmitResult } from "../cel/emitter";
import { compartmentIdOf } from "./useCases";

/** One case, ready for an engine driver. Everything an engine needs; nothing it has to re-derive. */
export interface ProducerCaseInput {
  /** The authored case name — the join key. ⚠ Never a slug: two names can slug alike. */
  caseName: string;
  /** From the emitter. `patient/<compartmentId>`. */
  compartmentDir: string;
  /** The bare compartment id, for addressing this case's RESULTS tree. */
  compartmentId: string;
  /**
   * ⚠ PER CASE. The handed-over driver takes ONE patient reference for a whole batch; our emitter mints
   * a distinct Patient per case (the compartment id IS that patient's id), so a batch-wide subject would
   * point every case at one case's patient.
   */
  subjectReference: string;
  /** The case's emitted FHIR — the engine's data payload. Already built; not re-read from disk. */
  resources: { resourceType: string; id: string; body: Record<string, unknown> }[];
}

export interface CaseInputDiagnostic {
  caseName: string;
  reason: "no-subject-patient";
  message: string;
}

/**
 * Build the producer input for every case the emitter actually produced.
 *
 * ⚠ THE CASE LIST COMES FROM `EmittedCase[]`, NOT FROM THE `.cel`. Emit is source-atomic per case: a case
 * with an unresolvable `defined by` is skipped whole. A `.cel`-derived list therefore hands the producer
 * cases that have no compartment on disk, and the failure surfaces as a confusing engine error rather
 * than the emit diagnostic it actually is.
 */
export function buildProducerInputs(emit: EmitResult): {
  inputs: ProducerCaseInput[];
  diagnostics: CaseInputDiagnostic[];
} {
  const inputs: ProducerCaseInput[] = [];
  const diagnostics: CaseInputDiagnostic[] = [];

  for (const c of emit.emittedCases) {
    // The subject Patient is emitted into the compartment it names; find it rather than recomposing an
    // id, for the same reason the compartment itself is read and not recomposed.
    const patient = c.resources.find((r) => r.resourceType === "Patient");
    if (!patient) {
      diagnostics.push({
        caseName: c.caseName,
        reason: "no-subject-patient",
        message:
          `Case "${c.caseName}" emitted resources but no Patient, so no engine subject can be named. ` +
          `This should be unreachable — the emitter requires a subject to emit a case at all.`,
      });
      continue;
    }
    inputs.push({
      caseName: c.caseName,
      compartmentDir: c.compartmentDir,
      compartmentId: compartmentIdOf(c.compartmentDir),
      subjectReference: `Patient/${patient.id}`,
      resources: c.resources.map((r) => ({
        resourceType: r.resourceType,
        id: r.id,
        body: r.body,
      })),
    });
  }
  return { inputs, diagnostics };
}

/**
 * Cases named in the CEL suite that the emitter did NOT produce.
 *
 * Reported so a case cannot vanish between the two lanes unnoticed: `run_decision` runs it, the producer
 * never sees it, and nothing says why. Every one of these is an emit diagnostic the caller should surface
 * rather than a case the producer may skip.
 */
export function casesMissingFromEmit(
  celCaseNames: readonly string[],
  emit: EmitResult,
): string[] {
  const emitted = new Set(emit.emittedCases.map((c) => c.caseName));
  return celCaseNames.filter((n) => !emitted.has(n));
}
