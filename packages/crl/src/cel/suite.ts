// REFACTOR:grounded: project emission selects the complete MV suite; regression
// selection is explicit and never changes the meaning of a CEL graph.
import { existsSync, lstatSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { findProjectRoot } from "../imports/registry";
import { canonicalizeFsPath } from "../imports/paths";
import { findPolicySrcNear } from "../provenance/policyLayout";
import { resolveCelImports } from "./imports";
import type { ResolvedCelGraph } from "./imports/types";
import type { CELCase } from "./ast/types";

export type CelSuitePurpose = "mv" | "regression";
export interface CelSuiteDiagnostic {
  kind: "cel-suite-invalid";
  code: "layout" | "selection" | "unreadable" | "duplicate-library" | "duplicate-case-id" | "policy-mismatch" | "invalid-cel";
  severity: "error";
  message: string;
  filePath?: string;
  location?: never;
}
export interface CelSuiteFile {
  path: string;
  sourceFile: string;
  role: CelSuitePurpose;
  graph: ResolvedCelGraph;
}
export interface CelSuite {
  projectRoot: string;
  policySrc: string;
  purpose: CelSuitePurpose;
  files: CelSuiteFile[];
  policyPath?: string;
}
export type CelSuiteResolution = { ok: true; suite: CelSuite } | { ok: false; diagnostics: CelSuiteDiagnostic[] };

const portable = (p: string): string => p.split(sep).join("/");
export function pathWithin(root: string, target: string): boolean {
  const normalize = (p: string): string => process.platform === "win32" ? resolve(p).toLowerCase() : resolve(p);
  const rel = relative(normalize(root), normalize(target));
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}
/** Classify against the owning policy using the same filesystem case rules as selection. */
export function celSuiteRole(filePath: string, policySrc = findPolicySrcNear(dirname(resolve(filePath)))): CelSuitePurpose | undefined {
  if (!policySrc) return undefined;
  if (pathWithin(join(policySrc, "cel/mv"), filePath)) return "mv";
  if (pathWithin(join(policySrc, "cel/regression"), filePath)) return "regression";
  return undefined;
}
function failure(code: CelSuiteDiagnostic["code"], message: string, filePath?: string): CelSuiteResolution {
  return { ok: false, diagnostics: [{ kind: "cel-suite-invalid", code, severity: "error", message, ...(filePath ? { filePath } : {}) }] };
}

/** Source+name is internal identity. Display names remain exactly authored. */
export const suiteCaseKey = (sourceFile: string, caseName: string): string => JSON.stringify([sourceFile, caseName]);

/** REFACTOR:grounded: incomplete enumeration cannot masquerade as an empty suite. */
function walkCels(root: string, skip?: string): string[] {
  const files: string[] = [];
  let budget = 5000;
  const walk = (dir: string): void => {
    if (lstatSync(dir).isSymbolicLink()) throw new Error(`CEL suite directories cannot be symlinks: ${dir}`);
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      if (--budget < 0) throw new Error(`CEL suite enumeration exceeded 5000 entries at ${dir}`);
      const full = join(dir, entry.name);
      if (skip && resolve(full) === resolve(skip)) continue;
      if (entry.isSymbolicLink()) throw new Error(`CEL suite entries cannot be symlinks: ${full}`);
      if (entry.isDirectory()) {
        if (existsSync(join(full, "package.json"))) throw new Error(`Nested project is not part of this CEL suite: ${full}`);
        walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".cel")) files.push(canonicalizeFsPath(full));
    }
  };
  walk(root);
  return files;
}

/** Read-only selection; normal project tools must use purpose mv. */
export function resolveCelSuite(inputPath: string, purpose: CelSuitePurpose = "mv"): CelSuiteResolution {
  const input = canonicalizeFsPath(inputPath);
  try {
    const stat = statSync(input);
    const policySrc = findPolicySrcNear(stat.isDirectory() ? input : dirname(input));
    if (!policySrc) return failure("layout", "Expected a policy with src/crl and src/cel/mv. Classify clinician cases in mv/ and engineering cases in regression/.", input);
    const projectRoot = findProjectRoot(input);
    if (!projectRoot || canonicalizeFsPath(projectRoot) !== canonicalizeFsPath(dirname(policySrc))) {
      return failure("layout", "Each policy suite needs its own package.json beside src/ so generated output has one policy owner.", input);
    }
    const celRoot = join(policySrc, "cel"), mvRoot = join(celRoot, "mv"), regressionRoot = join(celRoot, "regression");
    const role = celSuiteRole(input, policySrc);
    if (stat.isFile()) {
      if (!input.toLowerCase().endsWith(".cel")) return failure("selection", "Select an MV CEL file or its policy folder.", input);
      if (role === "regression" && purpose === "mv") return failure("selection", "Regression CEL is for the isolated regression runner; normal emission and Medical Validation use src/cel/mv.", input);
      if (!role) return failure("layout", "This CEL file is unclassified. Move clinician cases to src/cel/mv and engineering controls to src/cel/regression.", input);
    } else if (purpose === "mv" && role === "regression") {
      return failure("selection", "Regression folders cannot be opened or emitted as Medical Validation.", input);
    }
    if (!existsSync(mvRoot)) return failure("layout", "Missing src/cel/mv. Create the MV folder and classify the policy's CEL cases before normal emission.", input);
    const allPaths = walkCels(celRoot, purpose === "mv" ? regressionRoot : undefined);
    const unclassified = allPaths.filter(p => !celSuiteRole(p, policySrc));
    if (unclassified.length) return failure("layout", `Unclassified CEL files must be moved to mv/ or regression/: ${unclassified.map(p => portable(relative(projectRoot, p))).join(", ")}`, input);
    const selected = allPaths.filter(p => purpose === "regression" || celSuiteRole(p, policySrc) === "mv");
    const files: CelSuiteFile[] = selected.map(p => ({ path: p, sourceFile: portable(relative(projectRoot, p)), role: celSuiteRole(p, policySrc)!, graph: resolveCelImports(p) }));
    const libraries = new Map<string, string>(), ids = new Map<string, string>();
    let policyPath: string | undefined;
    for (const file of files) {
      const graph = file.graph;
      if (!graph.cel || graph.celParseErrors.length || graph.diagnostics.some(d => d.severity === "error") || !graph.coversTarget) {
        return failure("invalid-cel", `Cannot resolve ${file.sourceFile}; validate its CEL and covered CRL before emitting the suite.`, file.path);
      }
      if (policyPath && policyPath !== graph.coversTarget.filePath) return failure("policy-mismatch", `All files in one policy suite must cover the same CRL root. ${file.sourceFile} covers ${graph.cel.covers?.name}.`, file.path);
      policyPath = graph.coversTarget.filePath;
      const name = graph.cel.library.name;
      if (libraries.has(name)) return failure("duplicate-library", `CEL library "${name}" occurs in both ${libraries.get(name)} and ${file.sourceFile}; give independent suites distinct library identities.`, file.path);
      libraries.set(name, file.sourceFile);
      for (const c of graph.cel.statements.filter((s): s is CELCase => s.type === "CELCase")) {
        if (c.caseId === undefined) continue;
        if (ids.has(c.caseId)) return failure("duplicate-case-id", `Case id "${c.caseId}" occurs in both ${ids.get(c.caseId)} and ${file.sourceFile}; review identities must be unique across selected files.`, file.path);
        ids.set(c.caseId, file.sourceFile);
      }
    }
    return { ok: true, suite: { projectRoot, policySrc, purpose, files, policyPath } };
  } catch (error) {
    return failure("unreadable", `Cannot resolve CEL suite: ${(error as Error).message}`, input);
  }
}
