import type { CRL, Statement, Include } from "../ast/types";
import type { CRLError } from "../types/errors";

// === Diagnostics ===

export interface ParseFailureDiagnostic {
  kind: "parse-failure";
  severity: "warning" | "error";
  filePath: string;
  errors: CRLError[];
}

export interface ProjectRootNotFoundDiagnostic {
  kind: "project-root-not-found";
  severity: "error";
  // The path the resolver started from (root .crl) — included for diagnostic
  // surface so callers can render "no package.json found upward from <path>".
  fromPath: string;
}

export interface PackageResolutionFailureDiagnostic {
  kind: "package-resolution-failure";
  severity: "warning";
  // The npm package whose crl.libraries entry was problematic. Absolute path
  // to the package directory.
  packagePath: string;
  // The crl.libraries entry that failed (when applicable; absent if the whole
  // crl field is malformed).
  listedPath?: string;
  reason:
    | "missing-file"            // listed file doesn't exist
    | "invalid-json"            // package.json failed to parse
    | "crl-libraries-not-array" // crl field exists but crl.libraries isn't an array of strings
    | "no-library-declaration"  // listed file parsed but has no library "X". line
    | "path-escapes-package"    // listed path used .. to escape the package dir
    | "parse-error";            // listed file failed to parse
  message: string;
}

export interface RegistryDuplicateDiagnostic {
  kind: "registry-duplicate";
  severity: "error";
  // The library name declared by both files.
  name: string;
  filePaths: string[];
}

export interface UnresolvedIncludeDiagnostic {
  kind: "unresolved-include";
  severity: "error";
  include: Include;
  from: { filePath: string; libraryName?: string };
}

export interface CycleDiagnostic {
  kind: "cycle";
  severity: "error";
  filePaths: string[];       // [A, B, ..., A] closure
  includeChain: Include[];
}

/**
 * Warning: an `include` statement names a library whose alias clause
 * (`as "X"`) is present in the AST but not yet honored by the resolver.
 * v2.1.0 ships with alias semantics deferred to v2.2; the warning prevents
 * silent semantic failure when a user writes `include "Foo" as "Ext".`.
 * Producer: `src/imports/resolver.ts` `walkIncludes`.
 */
export interface AliasNotYetSupportedDiagnostic {
  kind: "alias-not-yet-supported";
  severity: "warning";
  include: Include;
  from: { filePath: string; libraryName: string };
}

/**
 * Warning: an `include` statement names a LOCAL-origin library. Per v2.1.0
 * lock 026, local sibling libraries auto-resolve via qualified refs without
 * an `include`; writing one is redundant. Producer lands in commit 2e (fires
 * when the local-fallback path of `resolveIncludeTarget` is hit).
 */
export interface RedundantLocalIncludeDiagnostic {
  kind: "redundant-local-include";
  severity: "warning";
  include: Include;
  from: { filePath: string; libraryName: string };
}

export type ImportDiagnostic =
  | ParseFailureDiagnostic
  | ProjectRootNotFoundDiagnostic
  | PackageResolutionFailureDiagnostic
  | RegistryDuplicateDiagnostic
  | UnresolvedIncludeDiagnostic
  | CycleDiagnostic
  | AliasNotYetSupportedDiagnostic
  | RedundantLocalIncludeDiagnostic;

// === Registry ===

export interface RegistryEntry {
  name: string | null;       // null only when isRoot && root is anonymous
  filePath: string;          // absolute canonical
  ast: CRL;
  isRoot: boolean;
  // Source: where this library came from. "local" = scanned from the project
  // directory; "package" = scanned from a node_modules package's crl.libraries.
  origin: "local" | "package" | "root";
}

// Two separate indexes per origin (local vs package). v2.1.0 lock per
// discussion 027 C2 + 030: local and package may declare the same library
// name without firing `registry-duplicate`. `include "Foo"` from a local/root
// file checks `byNamePackage` first then falls back to `byNameLocal`; from a
// package file it checks `byNamePackage` only (packages cannot depend on
// consumer locals).
//
// Within each map, second-write collisions still emit `registry-duplicate` and
// the second is rejected (local-vs-local or package-vs-package).
export interface Registry {
  byNameLocal: Map<string, RegistryEntry>;
  byNamePackage: Map<string, RegistryEntry>;
}

// === Combined namespace (kind-separated) ===

export type NodeKind = "Concept" | "Decision" | "Activity" | "Terminology";

export interface NamespaceEntry {
  kind: NodeKind;
  libraryName: string | null;
  filePath: string;
  node: Statement;
}

export interface Namespace {
  concepts: Map<string, NamespaceEntry>;
  terminologies: Map<string, NamespaceEntry>;
  decisions: Map<string, NamespaceEntry>;
  activities: Map<string, NamespaceEntry>;
}

export function emptyNamespace(): Namespace {
  return {
    concepts: new Map(),
    terminologies: new Map(),
    decisions: new Map(),
    activities: new Map(),
  };
}

// === Top-level ===

export interface ResolvedGraph {
  rootPath: string;
  // The project root directory (the one containing package.json). Absent
  // when project-root-not-found.
  projectRoot?: string;
  // Topological order: leaves first, root last. Include-walked closure from
  // root — every entry was reached via an `include` chain starting at root.
  resolvedLibraries: RegistryEntry[];
  // Local-origin libraries that exist in the project but are NOT in
  // `resolvedLibraries` (root didn't include them; v2.1.0 lock 026 allows
  // qualified refs to local siblings without an include). Path-sorted for
  // determinism. Empty for projects where every local file is reachable via
  // includes.
  localLibraries: RegistryEntry[];
  // The full registry indexed by `buildRegistry` (all local files + all
  // node_modules packages). Surfaced on the graph so downstream consumers
  // (validate.ts, future autocomplete) can build scopes from the entire
  // universe of known libraries — not just what include-walking reached
  // from root. Absent when project-root-not-found.
  registry?: Registry;
  namespace: Namespace;
  diagnostics: ImportDiagnostic[];
}
