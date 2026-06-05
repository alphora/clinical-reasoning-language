import { conceptTypes, type ConceptType } from "../../grammar/conceptTypes";
import {
  isQualifiedRef,
  getRefName,
  getRefLibrary,
  type Decision,
  type WhenBlock,
  type WhenBlockBody,
  type BlockBody,
  type ActionStatement,
  type Location,
  type Statement,
} from "../../ast/types";
import { resolveCelImports, type ResolveCelImportsOptions } from "../imports";
import type { ResolvedCelGraph } from "../imports/types";
import type { CEL, CELFact, CELCase, CELDefinedByField, CELResultField, CELFactRefField, CELCrossResourceField, CELInclude } from "../ast/types";

import type {
  CELValidationError,
  CELValidationErrorKind,
  CELValidationOptions,
  CELValidationResult,
} from "./types";

const CONCEPT_TYPE_SET: Set<string> = new Set<string>(conceptTypes as readonly ConceptType[]);

/**
 * Build the candidate set of statements in a library that are valid
 * `defined by` targets. Excludes Terminology, Decision, Parameter — only
 * Concept and Activity are valid target kinds (per plan v2 rule table
 * Step 2). Returns a map for O(1) name lookup.
 */
function buildDefinedByCandidates(stmts: Statement[]): Map<string, Statement> {
  const out = new Map<string, Statement>();
  for (const s of stmts) {
    if (s.type === "Concept" || s.type === "Activity") {
      // First-write wins for cross-kind name collisions; within Concept+Activity
      // the filter still applies (both kinds remain candidates).
      if (!out.has(s.name)) out.set(s.name, s);
    }
  }
  return out;
}

/**
 * Build the leaf-resolution map: top-level statements of the covered
 * library's RegistryEntry. Direct children only (not include closure)
 * per plan v2 Step 2.
 */
function buildLeafCandidates(stmts: Statement[]): Map<string, Statement> {
  const out = new Map<string, Statement>();
  for (const s of stmts) {
    if (!out.has(s.name)) out.set(s.name, s);
  }
  return out;
}

function err(
  kind: CELValidationErrorKind,
  message: string,
  location?: Location,
  filePath?: string,
): CELValidationError {
  return { kind, severity: "error", message, ...(location ? { location } : {}), ...(filePath ? { filePath } : {}) };
}

function warn(
  kind: CELValidationErrorKind,
  message: string,
  location?: Location,
  filePath?: string,
): CELValidationError {
  return { kind, severity: "warning", message, ...(location ? { location } : {}), ...(filePath ? { filePath } : {}) };
}

/**
 * Main validator entry. Runs over a ResolvedCelGraph and returns
 * { errors, warnings }. Resolver/parser diagnostics are passed through
 * into the returned streams so callers see one unified set.
 */
export function validateCEL(
  graph: ResolvedCelGraph,
  options: CELValidationOptions = {},
): CELValidationResult {
  const errors: CELValidationError[] = [];
  const warnings: CELValidationError[] = [];
  const fp = graph.filePath;

  // 1. Passthrough: celParseErrors → errors (kind: "parse-failure").
  for (const e of graph.celParseErrors) {
    errors.push({
      kind: "parse-failure",
      severity: "error",
      message: e.message ?? "Parse failure",
      filePath: fp,
      ...(typeof e.line === "number" && typeof e.column === "number"
        ? { location: { start: { line: e.line, column: e.column }, end: { line: e.line, column: e.column } } }
        : {}),
    });
  }

  // 2. Passthrough: resolver diagnostics.
  for (const d of graph.diagnostics) {
    if (d.kind === "crl-import") {
      const sev = d.severity;
      const msg = `Underlying CRL import diagnostic: ${d.underlying.kind}`;
      (sev === "warning" ? warnings : errors).push({
        kind: "crl-import",
        severity: sev,
        message: msg,
        filePath: fp,
      });
    } else if (d.kind === "project-root-not-found") {
      errors.push({
        kind: "project-root-not-found",
        severity: "error",
        message: `No package.json found upward from ${d.fromPath}`,
        filePath: fp,
      });
    } else if (d.kind === "unresolved-covers") {
      errors.push({
        kind: "unresolved-covers",
        severity: "error",
        message: `Unresolved 'covers' reference to library "${d.coversName}"`,
        filePath: fp,
      });
    } else if (d.kind === "covers-missing-but-cases-present") {
      errors.push({
        kind: "covers-missing-but-cases-present",
        severity: "error",
        message: `'covers' declaration is required when the file has at least one case`,
        filePath: fp,
      });
    }
  }

  // 3. If we don't have a parsed CEL AST, bail — nothing further to check.
  const cel = graph.cel;
  if (!cel) {
    return finalize(errors, warnings, options);
  }

  // 4. Build per-file name maps.
  const facts = new Map<string, CELFact>();
  const cases = new Map<string, CELCase>();
  for (const s of cel.statements) {
    if (s.type === "CELFact") {
      if (facts.has(s.name)) {
        errors.push(
          err(
            "duplicate-fact-name",
            `Duplicate fact name "${s.name}"`,
            s.location,
            fp,
          ),
        );
      } else {
        facts.set(s.name, s);
      }
    } else if (s.type === "CELCase") {
      if (cases.has(s.name)) {
        errors.push(
          err(
            "duplicate-case-name",
            `Duplicate case name "${s.name}"`,
            s.location,
            fp,
          ),
        );
      } else {
        cases.set(s.name, s);
      }
    }
  }

  // 5. CEL includes.
  for (const inc of cel.includes) {
    validateInclude(inc, graph, errors, warnings, fp);
  }

  // 6. Fact body `defined by` resolution.
  for (const f of cel.statements) {
    if (f.type !== "CELFact") continue;
    for (const fb of f.body) {
      if (fb.type === "CELDefinedByField") {
        validateDefinedBy(fb, graph, errors, warnings, fp);
      }
    }
  }

  // 7. Case bodies.
  const coversTarget = graph.coversTarget;
  const leafCandidates = coversTarget
    ? buildLeafCandidates(coversTarget.ast.statements)
    : new Map<string, Statement>();
  for (const c of cel.statements) {
    if (c.type !== "CELCase") continue;
    for (const cb of c.body) {
      if (cb.type === "CELSubjectField" || cb.type === "CELEncounterField") {
        if (!facts.has(cb.factName)) {
          errors.push(
            err(
              "unresolved-fact-ref",
              `Unresolved fact reference "${cb.factName}" in case "${c.name}"`,
              cb.location,
              fp,
            ),
          );
        }
      } else if (cb.type === "CELFactRefField") {
        validateFactRef(cb, facts, c.name, errors, fp);
      } else if (cb.type === "CELResultField") {
        validateResult(cb, leafCandidates, coversTarget?.name ?? undefined, c.name, errors, warnings, fp);
      } else if (cb.type === "CELCrossResourceField") {
        validateCrossResource(cb, facts, c.name, errors, fp);
      }
    }
  }

  return finalize(errors, warnings, options);
}

function validateInclude(
  inc: CELInclude,
  graph: ResolvedCelGraph,
  errors: CELValidationError[],
  warnings: CELValidationError[],
  fp: string,
): void {
  if (inc.alias !== undefined) {
    warnings.push(
      warn(
        "alias-not-yet-supported",
        `Include alias "${inc.alias}" parses but is not yet supported`,
        inc.location,
        fp,
      ),
    );
  }
  const reg = graph.crlRegistry;
  if (!reg) return; // resolver already flagged project-root-not-found
  const found = reg.byNameLocal.get(inc.name) ?? reg.byNamePackage.get(inc.name);
  if (!found) {
    errors.push(
      err(
        "unresolved-cel-include",
        `Unresolved include of library "${inc.name}"`,
        inc.location,
        fp,
      ),
    );
  }
}

function validateDefinedBy(
  fb: CELDefinedByField,
  graph: ResolvedCelGraph,
  errors: CELValidationError[],
  warnings: CELValidationError[],
  fp: string,
): void {
  const ref = fb.ref;
  // Bare reference.
  if (!isQualifiedRef(ref)) {
    const name = getRefName(ref);
    if (!CONCEPT_TYPE_SET.has(name)) {
      errors.push(
        err(
          "unresolved-bare-type",
          `Bare 'defined by "${name}"' is not a valid FHIR type (must be one of conceptTypes)`,
          fb.location,
          fp,
        ),
      );
    }
    return;
  }

  // Qualified reference: Lib.Decl
  const libName = getRefLibrary(ref);
  const declName = getRefName(ref);
  const reg = graph.crlRegistry;
  if (!reg) return; // resolver flagged

  // Step 1: library lookup.
  const lib = reg.byNameLocal.get(libName ?? "") ?? reg.byNamePackage.get(libName ?? "");
  if (!lib) {
    errors.push(
      err(
        "unresolved-qualified-library",
        `Library "${libName}" not found in project closure (for 'defined by "${libName}"."${declName}"')`,
        fb.location,
        fp,
      ),
    );
    return;
  }

  // Step 2-3: candidate set (Concept + Activity only) + name lookup.
  const candidates = buildDefinedByCandidates(lib.ast.statements);
  const target = candidates.get(declName);
  if (!target) {
    errors.push(
      err(
        "unresolved-qualified-declaration",
        `No Concept or Activity declaration named "${declName}" in library "${libName}"`,
        fb.location,
        fp,
      ),
    );
    return;
  }

  // Step 4: dispatch on kind.
  if (target.type === "Activity") {
    // OK unconditionally (FHIR type derivation deferred to Todo 5 emitter).
    return;
  }
  // Concept:
  if (target.type === "Concept") {
    const cType = target.conceptType;
    if (cType === undefined || !CONCEPT_TYPE_SET.has(cType)) {
      warnings.push(
        warn(
          "unsupported-yet",
          `Concept "${libName}"."${declName}" has no derivable FHIR type (conceptType ${cType === undefined ? "absent" : `"${cType}" not in conceptTypes allowlist`})`,
          fb.location,
          fp,
        ),
      );
    }
  }
}

function validateFactRef(
  cb: CELFactRefField,
  facts: Map<string, CELFact>,
  caseName: string,
  errors: CELValidationError[],
  fp: string,
): void {
  if (!facts.has(cb.factName)) {
    errors.push(
      err(
        "unresolved-fact-ref",
        `Unresolved fact reference "${cb.factName}" in case "${caseName}"`,
        cb.location,
        fp,
      ),
    );
  }
}

function validateCrossResource(
  cb: CELCrossResourceField,
  facts: Map<string, CELFact>,
  caseName: string,
  errors: CELValidationError[],
  fp: string,
): void {
  if (!facts.has(cb.sourceName)) {
    errors.push(
      err(
        "unresolved-fact-ref",
        `Cross-resource source "${cb.sourceName}" in case "${caseName}" is not a fact in this file`,
        cb.location,
        fp,
      ),
    );
  }
  if (!facts.has(cb.targetName)) {
    errors.push(
      err(
        "unresolved-fact-ref",
        `Cross-resource target "${cb.targetName}" in case "${caseName}" is not a fact in this file`,
        cb.location,
        fp,
      ),
    );
  }
}

/**
 * T03 / #86: collect the set of bare names a CEL `result is "<D>" is "<X>"`
 * branch may target — the DIRECT arms of decision D. An arm is the bare
 * name of either a `recommend activity` target or a `use decision` target.
 * No transitive walk through sub-decisions: the branch identifies what
 * D's case landed at, not which leaves are eventually reachable.
 *
 * Mirrors the decision-body walk shape in src/validator/referenceResolver.ts:283-323
 * and src/validator/cycleDetector.ts (T02).
 */
function collectDecisionArms(decision: Decision): Set<string> {
  const arms = new Set<string>();
  for (const wb of decision.body.statements) {
    walkArmsWhenBlock(wb, arms);
  }
  return arms;
}

function walkArmsWhenBlock(wb: WhenBlock, arms: Set<string>): void {
  walkArmsWhenBlockBody(wb.body, arms);
}

function walkArmsWhenBlockBody(body: WhenBlockBody, arms: Set<string>): void {
  if (body.type === "BlockBody") {
    walkArmsBlockBody(body, arms);
  } else {
    walkArmsActionStatement(body as ActionStatement, arms);
  }
}

function walkArmsBlockBody(block: BlockBody, arms: Set<string>): void {
  for (const stmt of block.statements) {
    if (stmt.type === "WhenBlock") {
      walkArmsWhenBlock(stmt, arms);
    } else {
      walkArmsActionStatement(stmt, arms);
    }
  }
}

function walkArmsActionStatement(stmt: ActionStatement, arms: Set<string>): void {
  const action = stmt.action;
  if (action.type === "RecommendActivity") {
    const n = getRefName(action.activityName);
    if (n) arms.add(n);
  } else if (action.type === "UseDecision") {
    const n = getRefName(action.decisionName);
    if (n) arms.add(n);
  }
}

function validateResult(
  cb: CELResultField,
  leafCandidates: Map<string, Statement>,
  coversName: string | undefined,
  caseName: string,
  errors: CELValidationError[],
  _warnings: CELValidationError[],
  fp: string,
): void {
  if (coversName === undefined) return; // resolver flagged unresolved-covers
  const leaf = leafCandidates.get(cb.leafName);
  if (!leaf) {
    errors.push(
      err(
        "unresolved-result-leaf",
        `Result leaf "${cb.leafName}" in case "${caseName}" is not a top-level declaration of covered library "${coversName}"`,
        cb.location,
        fp,
      ),
    );
    return;
  }
  // Step 3: value-shape check.
  if (leaf.type === "Decision") {
    if (cb.value.type !== "CELBranchResult") {
      errors.push(
        err(
          "invalid-result-shape",
          `Result leaf "${cb.leafName}" is a Decision; expected a branch (string) result value, got boolean`,
          cb.location,
          fp,
        ),
      );
    } else {
      // T03 / #86: cross-check the branch string against the decision's
      // reachable arms (direct RecommendActivity.activityName +
      // UseDecision.decisionName). No transitive walk — a `use decision "D1"`
      // arm of D7 makes "D1" a valid branch for D7, but D1's own arms are
      // NOT valid branches for D7. Per issue #86's "real but unreachable
      // arm" example.
      const arms = collectDecisionArms(leaf as Decision);
      if (!arms.has(cb.value.branchName)) {
        errors.push(
          err(
            "unresolved-result-branch",
            `Result branch "${cb.value.branchName}" in case "${caseName}" is not a reachable arm of decision "${cb.leafName}". Reachable arms: ${
              arms.size === 0
                ? "(none)"
                : Array.from(arms).sort().map((a) => `"${a}"`).join(", ")
            }.`,
            cb.value.location,
            fp,
          ),
        );
      }
    }
  } else if (leaf.type === "Concept") {
    if (cb.value.type !== "CELBooleanResult") {
      errors.push(
        err(
          "invalid-result-shape",
          `Result leaf "${cb.leafName}" is a Concept; expected a boolean result value, got branch (string)`,
          cb.location,
          fp,
        ),
      );
    } else {
      // T04 / #100: cross-check the concept's CRL `value type`. A boolean
      // result assertion is only meaningful against a boolean-valued
      // concept. Quantity/CodeableConcept/Reference/absent value types
      // raise `result-leaf-not-boolean-valued`.
      const valueTypes = leaf.valueTypes ?? [];
      if (!valueTypes.includes("boolean")) {
        errors.push(
          err(
            "result-leaf-not-boolean-valued",
            `Result leaf "${cb.leafName}" in case "${caseName}" is a Concept with value type ${
              valueTypes.length === 0
                ? "absent"
                : valueTypes.map((v) => `"${v}"`).join("/")
            }; only boolean-valued concepts accept a true/false result assertion.`,
            cb.value.location,
            fp,
          ),
        );
      }
    }
  } else {
    // Activity / Terminology / Parameter — not valid result leaves.
    errors.push(
      err(
        "invalid-result-leaf-kind",
        `Result leaf "${cb.leafName}" is a ${leaf.type}; only Concept or Decision leaves are supported as result targets`,
        cb.location,
        fp,
      ),
    );
  }
}

function finalize(
  errors: CELValidationError[],
  warnings: CELValidationError[],
  options: CELValidationOptions,
): CELValidationResult {
  if (options.soft === true) {
    const filtered = warnings.filter(
      (w) => w.kind !== "unsupported-yet" && w.kind !== "alias-not-yet-supported",
    );
    return { errors, warnings: filtered };
  }
  return { errors, warnings };
}

/**
 * Convenience: resolve + validate in one shot. The returned graph is
 * the same object the validator consumed; useful for callers that want
 * both diagnostic surfaces in one go.
 */
export function validateCELFile(
  filePath: string,
  options: CELValidationOptions & ResolveCelImportsOptions = {},
): CELValidationResult & { graph: ResolvedCelGraph } {
  const graph = resolveCelImports(filePath, { overlays: options.overlays });
  const result = validateCEL(graph, { soft: options.soft });
  return { ...result, graph };
}
