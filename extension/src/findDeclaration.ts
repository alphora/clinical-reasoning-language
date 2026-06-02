import type {
  IndexedDeclaration,
  IndexedLibrary,
  IndexedReference,
  ProjectIndex,
  ZeroBasedRange,
} from "./projectIndex";

/**
 * What does the cursor sit on? Used by Definition / References / Rename
 * to produce consistent results. AST-driven via the cached ProjectIndex
 * — never reads files or scans text.
 */
export type Resolution =
  | { kind: "declaration"; decl: IndexedDeclaration }
  | { kind: "library"; lib: IndexedLibrary }
  | { kind: "reference-name"; ref: IndexedReference }
  | { kind: "reference-qualifier"; ref: IndexedReference }
  | null;

/**
 * Find the entity the cursor is on. Position is 0-based line/character.
 * Falls through to null if cursor is outside any indexed range.
 */
export function findDeclarationAtPosition(
  filePath: string,
  position: { line: number; character: number },
  index: ProjectIndex,
): Resolution {
  // Declarations first — declaration headers are unique in their file.
  for (const decl of index.getDeclarations(filePath)) {
    if (decl.filePath !== filePath) continue;
    if (inRange(position, decl.nameRange)) {
      return { kind: "declaration", decl };
    }
  }
  // Then library declarations (the `library "X".` line).
  for (const lib of index.getLibraries(filePath)) {
    if (lib.filePath !== filePath) continue;
    if (inRange(position, lib.nameRange)) {
      return { kind: "library", lib };
    }
  }
  // Then references. Check qualifier first (more specific), then name.
  for (const ref of index.getReferences(filePath)) {
    if (ref.filePath !== filePath) continue;
    if (ref.qualifierRange && inRange(position, ref.qualifierRange)) {
      return { kind: "reference-qualifier", ref };
    }
    if (inRange(position, ref.nameRange)) {
      return { kind: "reference-name", ref };
    }
  }
  return null;
}

function inRange(pos: { line: number; character: number }, r: ZeroBasedRange): boolean {
  // Range is inclusive-start, exclusive-end. A cursor sitting exactly at
  // endCol is OUTSIDE the range (matches VS Code's Range semantics so
  // hover/goto don't trigger when adjacent to but not on the symbol).
  if (pos.line < r.startLine || pos.line > r.endLine) return false;
  if (pos.line === r.startLine && pos.character < r.startCol) return false;
  if (pos.line === r.endLine && pos.character >= r.endCol) return false;
  return true;
}
