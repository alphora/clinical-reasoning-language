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

export interface NameConflictDiagnostic {
  kind: "name-conflict";
  severity: "error";
  // Statement name (concept/decision/activity/terminology) declared in
  // multiple resolved libraries.
  name: string;
  nodeKind: NodeKind;
  sources: { libraryName: string | null; filePath: string }[];
}

export type ImportDiagnostic =
  | ParseFailureDiagnostic
  | ProjectRootNotFoundDiagnostic
  | PackageResolutionFailureDiagnostic
  | RegistryDuplicateDiagnostic
  | UnresolvedIncludeDiagnostic
  | CycleDiagnostic
  | NameConflictDiagnostic;

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

// Single entry per library name (second-write collisions emit registry-duplicate
// and the second is rejected).
export interface Registry {
  byName: Map<string, RegistryEntry>;
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
  // Topological order: leaves first, root last.
  resolvedLibraries: RegistryEntry[];
  namespace: Namespace;
  diagnostics: ImportDiagnostic[];
}
