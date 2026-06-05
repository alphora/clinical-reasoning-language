/**
 * Filesystem-safe filename derivation for emitted CRL libraries.
 *
 * Factored out of `imports/emit.ts:72` (was private there) so the
 * CRL→FHIR-def emit lane (#73) can derive matching `<libraryName>.cql`
 * filenames for `Library.content[0].attachment.url`. Both CQL emit and
 * FHIR-def emit produce relative paths that must agree byte-for-byte
 * so consumers' fetch logic resolves cross-references correctly.
 *
 * The character set is the intersection of safe-on-all-OSes filename
 * chars; spaces are PRESERVED because the CQL translator expects the
 * on-disk filename to match the `include "Lib Name"` declaration
 * verbatim.
 */

const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|]|\.\./;

/**
 * Derive a filesystem-safe filename for an emitted library. Library
 * names can plausibly include characters that are invalid on Windows
 * (`<`, `>`, `:`, `"`, `/`, `\`, `|`, `?`, `*`) or that would enable
 * path traversal (`..`).
 *
 * Throws when the name can't be safely represented.
 */
export function safeOutputFilename(libraryName: string): string {
  if (UNSAFE_FILENAME_CHARS.test(libraryName)) {
    throw new Error(
      `Cannot derive a safe output filename for library "${libraryName}" — name contains characters that are unsafe for the filesystem (one of: \\ / : * ? " < > | ..)`,
    );
  }
  return `${libraryName}.cql`;
}
