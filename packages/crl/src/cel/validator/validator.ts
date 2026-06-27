import { collectDecisionArmsTransitive } from "../../ast/decisionArms";
import { buildGlobalDecisionMap, makeResolveDecision } from "../../ast/decisionResolver";
import type { LibAwareDecisionResolver } from "../../ast/decisionSpine";
import {
  isQualifiedRef,
  getRefName,
  getRefLibrary,
  type Decision,
  type Location,
  type Statement,
} from "../../ast/types";
import { conceptTypes, type ConceptType } from "../../grammar/conceptTypes";
import { CASE_ID_RE, DERIVED_CASE_ID_RE } from "../ast/caseId";
import type {
  CELFact,
  CELCase,
  CELIdField,
  CELDefinedByField,
  CELResultField,
  CELFactRefField,
  CELCrossResourceField,
  CELInclude,
} from "../ast/types";
import { buildDefinedByCandidates } from "../definedByResolve";
import { resolveCelImports, type ResolveCelImportsOptions } from "../imports";
import type { ResolvedCelGraph } from "../imports/types";

import type {
  CELValidationError,
  CELValidationErrorKind,
  CELValidationOptions,
  CELValidationResult,
} from "./types";

const CONCEPT_TYPE_SET: Set<string> = new Set<string>(conceptTypes as readonly ConceptType[]);

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
  return {
    kind,
    severity: "error",
    message,
    ...(location ? { location } : {}),
    ...(filePath ? { filePath } : {}),
  };
}

function warn(
  kind: CELValidationErrorKind,
  message: string,
  location?: Location,
  filePath?: string,
): CELValidationError {
  return {
    kind,
    severity: "warning",
    message,
    ...(location ? { location } : {}),
    ...(filePath ? { filePath } : {}),
  };
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
        ? {
            location: {
              start: { line: e.line, column: e.column },
              end: { line: e.line, column: e.column },
            },
          }
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
        errors.push(err("duplicate-fact-name", `Duplicate fact name "${s.name}"`, s.location, fp));
      } else {
        facts.set(s.name, s);
      }
    } else if (s.type === "CELCase") {
      if (cases.has(s.name)) {
        errors.push(err("duplicate-case-name", `Duplicate case name "${s.name}"`, s.location, fp));
      } else {
        cases.set(s.name, s);
      }
    }
  }

  // 4b. Case ids (provenance spec §7): at-most-one per case, bounded format, reserved namespace, per-file uniqueness.
  const seenCaseIds = new Map<string, CELCase>();
  for (const s of cel.statements) {
    if (s.type !== "CELCase") continue;
    const idFields = s.body.filter((b): b is CELIdField => b.type === "CELIdField");
    for (const extra of idFields.slice(1)) {
      errors.push(
        err(
          "multiple-case-ids",
          `Case "${s.name}" has more than one 'id is' field`,
          extra.location,
          fp,
        ),
      );
    }
    if (s.caseId === undefined) continue;
    const idLoc = idFields[0]?.location ?? s.location;
    if (!CASE_ID_RE.test(s.caseId)) {
      errors.push(
        err(
          "malformed-case-id",
          `Case id "${s.caseId}" must be alphanumeric-start, [A-Za-z0-9_-], ≤128 chars`,
          idLoc,
          fp,
        ),
      );
    } else if (DERIVED_CASE_ID_RE.test(s.caseId)) {
      errors.push(
        err(
          "reserved-case-id",
          `Case id "${s.caseId}" is reserved for derived ids (k<number>); choose another`,
          idLoc,
          fp,
        ),
      );
    } else if (seenCaseIds.has(s.caseId)) {
      errors.push(err("duplicate-case-id", `Duplicate case id "${s.caseId}"`, idLoc, fp));
    } else {
      seenCaseIds.set(s.caseId, s);
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
  // Lib-aware resolver for transitive `use decision` arms over the WHOLE graph (#172) — IDENTICAL to the CRE's, so the
  // arms surface spans the same cross-library closure run_decision evaluates (else valid cross-lib cases fail
  // validate_cel). A BARE target binds in the covered library, a QUALIFIED one in its explicit library. (Cyclic and
  // unresolved targets contribute NO arm — collectDecisionArmsTransitive drops their name, matching the runtime, which
  // produces nothing for them.)
  const coveredDecisions: Decision[] = coversTarget
    ? coversTarget.ast.statements.filter((s): s is Decision => s.type === "Decision")
    : [];
  const globalDecisionMap = buildGlobalDecisionMap({
    crlRegistry: graph.crlRegistry,
    coveredLib: coversTarget?.name ?? "",
    coveredFilePath: coversTarget?.filePath ?? fp,
    coveredStatements: coveredDecisions,
  });
  const resolveDecision = makeResolveDecision(globalDecisionMap);
  const coveredLibName = coversTarget?.name ?? "";
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
        validateResult(
          cb,
          leafCandidates,
          coversTarget?.name ?? undefined,
          c.name,
          errors,
          warnings,
          fp,
          resolveDecision,
          coveredLibName,
        );
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

// collectDecisionArms (T03/#86) extracted to ../../ast/decisionArms (shared with the language-services
// index, which needs it WITHOUT pulling the CEL validator into the lean subpath). Re-exported for the
// existing consumers (the CRE tests import it from here).
export { collectDecisionArms } from "../../ast/decisionArms";

function validateResult(
  cb: CELResultField,
  leafCandidates: Map<string, Statement>,
  coversName: string | undefined,
  caseName: string,
  errors: CELValidationError[],
  _warnings: CELValidationError[],
  fp: string,
  resolveDecision: LibAwareDecisionResolver,
  coveredLibName: string,
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
      // T03 / #86 + transitive `use decision` (#166): cross-check the branch string against the decision's
      // TRANSITIVE arms — direct RecommendActivity.activityName PLUS, for a BARE same-library `use decision`
      // target, that sub-decision's arms (the bare sub-name is REPLACED, not kept: a delegation isn't a
      // disposition). A QUALIFIED (cross-library), cyclic, or unresolved target contributes NO arm — its name is
      // dropped, matching the runtime (which produces nothing for it), so validate_cel and run_decision reject alike.
      const arms = collectDecisionArmsTransitive(leaf as Decision, resolveDecision, coveredLibName);
      if (!arms.has(cb.value.branchName)) {
        errors.push(
          err(
            "unresolved-result-branch",
            `Result branch "${cb.value.branchName}" in case "${caseName}" is not a reachable arm of decision "${cb.leafName}". Reachable arms: ${
              arms.size === 0
                ? "(none)"
                : Array.from(arms)
                    .sort()
                    .map((a) => `"${a}"`)
                    .join(", ")
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
              valueTypes.length === 0 ? "absent" : valueTypes.map((v) => `"${v}"`).join("/")
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
