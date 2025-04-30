import { toIdentifier } from "../utils/fshPathFunctions";

/**
 * Emits CRL concept blocks for each unique identifier.
 * @param identifiers Array of unique concept identifiers (strings)
 */
export function mapConcept(identifiers: string[]): string {
  return identifiers
    .map(
      (id) =>
        `concept ${toIdentifier(id)}:
    has type Observation.
    has valuetype boolean.
    coded by ${toIdentifier(id)}.
done\n`,
    )
    .join("\n");
}
