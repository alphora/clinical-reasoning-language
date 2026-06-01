import type { CRL, Statement, Location } from "../ast/types";
import { Validator, ValidationError } from "../validator/validator";

import { resolveImports } from "./index";
import {
  ImportDiagnostic,
  ParseFailureDiagnostic,
  RegistryEntry,
  ResolvedGraph,
  emptyNamespace,
} from "./types";

export interface ValidateImportsOptions {
  soft?: boolean;
}

export interface ValidationErrorWithSource extends ValidationError {
  filePath?: string;
  libraryName?: string | null;
}

export interface ValidateImportsResult {
  success: boolean;
  graph: ResolvedGraph;
  importDiagnostics: ImportDiagnostic[];
  validationErrors: ValidationErrorWithSource[];
  validationWarnings: ValidationErrorWithSource[];
}

function locationContains(outer: Location, inner: { start: { line: number; column: number } }): boolean {
  const startsAfter =
    outer.start.line < inner.start.line ||
    (outer.start.line === inner.start.line && outer.start.column <= inner.start.column);
  const endsBefore =
    outer.end.line > inner.start.line ||
    (outer.end.line === inner.start.line && outer.end.column >= inner.start.column);
  return startsAfter && endsBefore;
}

function findOwningLibrary(
  errLoc: ValidationError["location"],
  sources: { stmt: Statement; entry: RegistryEntry }[],
): RegistryEntry | undefined {
  for (const { stmt, entry } of sources) {
    if (locationContains(stmt.location, errLoc)) return entry;
  }
  return undefined;
}

function attachSource(
  err: ValidationError,
  sources: { stmt: Statement; entry: RegistryEntry }[],
): ValidationErrorWithSource {
  const owner = findOwningLibrary(err.location, sources);
  if (!owner) return { ...err };
  return {
    ...err,
    filePath: owner.filePath,
    libraryName: owner.name,
  };
}

export function validateCRLImports(
  rootPath: string,
  sourcePaths: string[] = [],
  options: ValidateImportsOptions = {},
): ValidateImportsResult {
  let graph: ResolvedGraph;
  try {
    graph = resolveImports(rootPath, sourcePaths);
  } catch (err) {
    // Only known throw site today: scanSourcePaths on missing explicit source path.
    const diag: ParseFailureDiagnostic = {
      kind: "parse-failure",
      severity: "error",
      filePath: rootPath,
      errors: [
        {
          type: "Exception",
          message: err instanceof Error ? err.message : String(err),
        },
      ],
    };
    return {
      success: false,
      graph: {
        rootPath,
        resolvedLibraries: [],
        namespace: emptyNamespace(),
        diagnostics: [diag],
      },
      importDiagnostics: [diag],
      validationErrors: [],
      validationWarnings: [],
    };
  }

  // Root parse failure already populated diagnostics; short-circuit.
  if (graph.resolvedLibraries.length === 0) {
    return {
      success: false,
      graph,
      importDiagnostics: graph.diagnostics,
      validationErrors: [],
      validationWarnings: [],
    };
  }

  // Flatten with first-wins-per-(kind, name) dedup; track source per kept statement.
  const seen = new Set<string>();
  const flatStatements: Statement[] = [];
  const sources: { stmt: Statement; entry: RegistryEntry }[] = [];

  for (const entry of graph.resolvedLibraries) {
    for (const stmt of entry.ast.statements) {
      const key = `${stmt.type}|${stmt.name}`;
      if (seen.has(key)) continue; // resolver already emitted name-conflict
      seen.add(key);
      flatStatements.push(stmt);
      sources.push({ stmt, entry });
    }
  }

  // Root entry is last in topo order; its AST is the synthetic shell.
  const rootEntry = graph.resolvedLibraries[graph.resolvedLibraries.length - 1];
  const synthetic: CRL = {
    type: "CRL",
    ...(rootEntry.ast.header ? { header: rootEntry.ast.header } : {}),
    ...(rootEntry.ast.library ? { library: rootEntry.ast.library } : {}),
    includes: [],
    statements: flatStatements,
    location: rootEntry.ast.location,
  };

  const validator = new Validator();
  const result = validator.validate(synthetic, { soft: options.soft });

  const validationErrors = result.errors.map((e) => attachSource(e, sources));
  const validationWarnings = result.warnings.map((e) => attachSource(e, sources));

  const importErrorSeverity = graph.diagnostics.filter((d) => d.severity === "error");
  const success = validationErrors.length === 0 && importErrorSeverity.length === 0;

  return {
    success,
    graph,
    importDiagnostics: graph.diagnostics,
    validationErrors,
    validationWarnings,
  };
}
