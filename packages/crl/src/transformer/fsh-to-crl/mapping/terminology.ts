import { toIdentifier, toCode } from "../utils/fshPathFunctions";

/**
 * Emits CRL terminology blocks for each unique identifier.
 * @param identifiers Array of unique concept identifiers (strings)
 */
export function mapTerminology(identifiers: string[]): string {
  return identifiers
    .map(
      (id) =>
        `terminology ${toIdentifier(id)} system \`http://sdh.com/cqis/kalm\` code ${toCode(id)}.`,
    )
    .join("\n");
}
