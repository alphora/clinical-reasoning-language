import type { CRL, Statement, Include } from "../ast/types";
import type { CRLError } from "../types/errors";

// === Diagnostics (the single union surfaced to all consumers) ===

export interface ParseFailureDiagnostic {
  kind: "parse-failure";
  severity: "warning" | "error";
  filePath: string;
  errors: CRLError[];
}

export interface RegistryDuplicateDiagnostic {
  kind: "registry-duplicate";
  severity: "error";
  name: string;
  version?: string;
  filePaths: string[];
}

export interface UnresolvedIncludeDiagnostic {
  kind: "unresolved-include";
  severity: "error";
  include: Include;
  from: { filePath: string; libraryName?: string };
}

export interface AmbiguousIncludeDiagnostic {
  kind: "ambiguous-include";
  severity: "error";
  include: Include;
  from: { filePath: string; libraryName?: string };
  candidates: RegistryEntry[];
}

export interface CycleDiagnostic {
  kind: "cycle";
  severity: "error";
  filePaths: string[];       // [A, B, ..., A] — closure
  includeChain: Include[];   // each include node that opens the next step
}

export interface NameConflictDiagnostic {
  kind: "name-conflict";
  severity: "error";
  name: string;
  nodeKind: NodeKind;
  sources: { libraryName: string | null; filePath: string }[];
}

export type ImportDiagnostic =
  | ParseFailureDiagnostic
  | RegistryDuplicateDiagnostic
  | UnresolvedIncludeDiagnostic
  | AmbiguousIncludeDiagnostic
  | CycleDiagnostic
  | NameConflictDiagnostic;

// === Registry ===

export interface RegistryEntry {
  name: string | null;
  version?: string;
  filePath: string;
  ast: CRL;
  isRoot: boolean;
}

export interface Registry {
  byName: Map<string, RegistryEntry[]>;
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

// === Top-level returned shape ===

export interface ResolvedGraph {
  rootPath: string;
  resolvedLibraries: RegistryEntry[];
  namespace: Namespace;
  diagnostics: ImportDiagnostic[];
}
