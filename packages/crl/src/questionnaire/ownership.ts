/**
 * ⭐⭐ OWNERSHIP OF GENERATED ARTIFACTS. A producer concern, deliberately NOT in the CEL emitter.
 *
 * The producer and the CEL emitter share a directory: `QuestionnaireResponse` is in the emitter's
 * `SUBJECT_RESOURCES`, so a CEL fact whose `defined by` resolves to one is written to
 * `<compartment>/questionnaireresponse/` — exactly where generated QRs land. Something must decide which
 * files are the producer's. That decision belongs to the producer.
 *
 * What this module needs from the emitter is one FACT, not membership: an emitter-produced id can never
 * contain `--`, because `rawSlug` collapses every hyphen run to one and composite ids join those slugs
 * with single hyphens. A `q--` prefix is therefore a decidable test rather than a guess.
 *
 * ⚠ THE REJECTED ALTERNATIVE, recorded so it is not re-proposed: derive the id through the emitter's own
 * `celResourceId` with a "reserved" fact-name token. Every component of that id passes through `rawSlug`,
 * whose image is precisely the set of slugs an AUTHORED name can reach — so for any reserved token there
 * exists a fact name colliding with it and ownership becomes undecidable. It reads safe and is not.
 */

import { rawSlug, uniqueCapSlug } from "../fhir-emitter/slug";

/** Matches the CEL emitter's composite-id budget, less the marker. */
const PRODUCER_ID_BASE_MAX = 53;

/**
 * PREFIX, not suffix. `uniqueCapSlug` truncates the TAIL to fit its cap, so a suffix marker would be
 * sliced off exactly on the long names that most need disambiguating — silent failure on the hard cases.
 */
export const PRODUCER_ID_MARKER = "q--";

/** A generated-artifact id. Deterministic: a re-run overwrites its own file rather than accumulating. */
export function questionnaireArtifactId(
  celLibraryName: string,
  caseName: string,
  kind: "questionnaire" | "questionnaireresponse",
): string {
  return (
    PRODUCER_ID_MARKER +
    uniqueCapSlug(
      `${rawSlug(celLibraryName)}-${rawSlug(caseName)}-${rawSlug(kind)}`,
      PRODUCER_ID_BASE_MAX,
    )
  );
}

/** Decides ownership of an on-disk artifact. FALSE for everything the CEL emitter writes. */
export function isProducerOwnedId(id: string): boolean {
  return id.startsWith(PRODUCER_ID_MARKER);
}
