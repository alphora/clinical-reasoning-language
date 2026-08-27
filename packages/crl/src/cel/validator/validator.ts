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
  CELCodeField,
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
import { classifyCanonicalToken } from "../canonicalToken";
import { makeLocalDomainContext, localMemberOfConcept, memberKey, type LocalDomainContext } from "../localMembership";
import { sourceMembersOfConcept } from "../sourceMembership";
import { hasSourceBinding, isResourcelessDerived } from "../../emit/conceptDatumSignals";

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

  // 6. Fact body `defined by` resolution + #189 Piece 2 local-membership + Piece 3 source-membership warnings.
  const domainCtx = makeLocalDomainContext(graph);
  const { keys: sourceMemberKeys, types: sourceTypes } = buildSourceMembership(graph, domainCtx.base);
  for (const f of cel.statements) {
    if (f.type !== "CELFact") continue;
    for (const fb of f.body) {
      if (fb.type === "CELDefinedByField") {
        validateDefinedBy(fb, graph, errors, warnings, fp);
      }
    }
    validateFactCodeMembership(f, graph, domainCtx, errors, warnings, fp);
    validateSourceFactMembership(f, sourceMemberKeys, sourceTypes, warnings, fp);
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
        if (cb.intent !== undefined && factRefNamesLocalConcept(cb.factName, facts, graph)) {
          errors.push(
            err(
              "intent-modifier-on-local-fact",
              `Case "${c.name}" references local determination fact "${cb.factName}" with an "${cb.intent}" intent ` +
                `modifier. Membership sees only the code, so a negated/absent local fact would compute its concept ` +
                `PRESENT (the opposite of the intent), in both lanes. Negation semantics are deferred (#257); ` +
                `remove the intent modifier, or model the absence as its own local concept. (Intent on an ` +
                `activity/recommendation fact is fine — this applies only to local \`code is\` determinations.)`,
              cb.location,
              fp,
            ),
          );
        }
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
    // #224 ii: if the name is a `criterion` (not a Concept/Activity), say so —
    // a criterion is a decision-guard sub-expression, never a `defined by` target —
    // instead of the generic "no Concept or Activity named X".
    const isCriterion = lib.ast.statements.some(
      (s) => s.type === "Criterion" && s.name === declName,
    );
    errors.push(
      isCriterion
        ? err(
            "criterion-not-a-defined-by-target",
            `"${libName}"."${declName}" names a criterion, which is not a valid 'defined by' target (a criterion is a decision-guard sub-expression with no case-feature identity)`,
            fb.location,
            fp,
          )
        : err(
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
    // #189 (a) (disc 510) — a RESOURCELESS DERIVED concept (no `code is` and no source binding) is READ-ONLY: it has
    // no FHIR resource, so a fact cannot directly assert it and `$apply` has no equivalent (the `asserted ∪ composed`
    // magic #189 removes). Declaration-level ERROR — a fact `defined by` such a concept is invalid regardless of
    // whether any case references it (context-free: validity must not depend on use). This precedes the
    // `unsupported-yet` type-derivation warning (a resourceless concept may also be untyped; the read-only reject is
    // the right diagnosis, not "no derivable FHIR type").
    if (isResourcelessDerived(target)) {
      errors.push(
        err(
          "cannot-directly-assert-derived-concept",
          `Concept "${libName}"."${declName}" is read-only — it has no representation (no \`code is\` and no source binding), so it has no FHIR resource and cannot be directly asserted by a fact. Assert its operands instead, or give it a \`code is\` + \`type is\` to make it a real record assertable in both lanes.`,
          fb.location,
          fp,
        ),
      );
      return;
    }
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

/** #189 Piece 2 (disc 508 D5(3)) — does a fact name a LOCAL determination concept (one with `code is`)? Used to
 *  scope the intent-modifier reject: intent on such a fact silently inverts membership; intent on an activity /
 *  non-local target is legitimate. */
function factRefNamesLocalConcept(
  factName: string,
  facts: Map<string, CELFact>,
  graph: ResolvedCelGraph,
): boolean {
  const f = facts.get(factName);
  if (!f) return false;
  const db = f.body.find((b): b is CELDefinedByField => b.type === "CELDefinedByField");
  if (!db || !isQualifiedRef(db.ref)) return false;
  const reg = graph.crlRegistry;
  if (!reg) return false;
  const libName = getRefLibrary(db.ref);
  const lib = reg.byNameLocal.get(libName ?? "") ?? reg.byNamePackage.get(libName ?? "");
  if (!lib) return false;
  const target = buildDefinedByCandidates(lib.ast.statements).get(getRefName(db.ref));
  // A local DETERMINATION: `code is` + `type is` (the same shape the CRE's `isLocalShape` and the emitter's
  // local-role gate use), so all three lanes agree on what the reject applies to.
  return (
    !!target &&
    target.type === "Concept" &&
    typeof target.code === "string" &&
    typeof target.conceptType === "string"
  );
}

/** #189 Piece 2 (disc 508) — the local membership WARNING. A fact naming a LOCAL concept (`code is` + `type is`)
 *  that ALSO authors a `code is` token is checked against the NAMED concept's own local `{system, code}` set (the
 *  local-exact set — reference/source-set membership is Piece 3). A WELL-FORMED token that is not the concept's own
 *  coding is a non-member — allowed (the legitimate wrong-code datum), but WARNED. A bare fact (degenerate member)
 *  and a MALFORMED token (the emitter's error) do not warn here. Membership is computed via the SAME derivation the
 *  emitter/CRE use, so the three lanes agree on what "member" means. */
function validateFactCodeMembership(
  f: CELFact,
  graph: ResolvedCelGraph,
  domainCtx: LocalDomainContext,
  errors: CELValidationError[],
  warnings: CELValidationError[],
  fp: string,
): void {
  const codeField = f.body.find((b): b is CELCodeField => b.type === "CELCodeField");
  if (!codeField) return; // bare → degenerate member, nothing to check
  const db = f.body.find((b): b is CELDefinedByField => b.type === "CELDefinedByField");
  if (!db || !isQualifiedRef(db.ref)) return; // no named concept (bare-type fact) → not a local-concept membership
  const reg = graph.crlRegistry;
  if (!reg) return;
  const libName = getRefLibrary(db.ref);
  const declName = getRefName(db.ref);
  const lib = reg.byNameLocal.get(libName ?? "") ?? reg.byNamePackage.get(libName ?? "");
  if (!lib) return; // unresolved library — validateDefinedBy already reports it
  const target = buildDefinedByCandidates(lib.ast.statements).get(declName);
  if (!target || target.type !== "Concept") return;

  // PIECE-3: a both-representation concept (`code is` + `source representation`) has a SOURCE set too. An authored
  // code that is a member of the source set (not the local-exact set) is a legitimate populating datum once source
  // membership emits (Piece 3) — so we must NOT warn "not a member" against the local set alone here (the warning
  // text would lie). Skip the local-exact warning for source-bound concepts until source membership lands.
  if (hasSourceBinding(target)) return;

  const res = localMemberOfConcept(
    target,
    { filePath: lib.filePath, entryName: lib.name, fallbackLib: lib.ast.library.name },
    domainCtx,
  );
  if ("notLocal" in res) return; // not a local concept (no `code is`/`type is`) — no local membership to check
  if ("error" in res) return; // underivable base — the emitter/CRE own the loud floor; the validator stays advisory

  const cls = classifyCanonicalToken(codeField.value);
  if (cls.kind === "malformed") {
    errors.push(
      err(
        "fact-code-malformed-token",
        `Fact "${f.name}" authors a malformed \`code is\` token \`${codeField.value}\`: ${cls.reason}. A local ` +
          `fact's code must be \`<system>|<code>\` (or bare to default to the concept's own code).`,
        codeField.location,
        fp,
      ),
    );
    return;
  }
  const isMember =
    cls.kind === "coded" && cls.parts.system === res.member.system && cls.parts.code === res.member.code;
  if (!isMember) {
    warnings.push(
      warn(
        "fact-code-not-in-local-set",
        `Fact "${f.name}" authors code \`${codeField.value}\`, which is not a member of the local set of the ` +
          `concept it names ("${libName}"."${declName}" = \`${res.member.system}|${res.member.code}\`). If this is ` +
          `a deliberate wrong-code test datum, ignore; otherwise the fact will not populate "${declName}" (both ` +
          `lanes compute it absent / false).`,
        codeField.location,
        fp,
      ),
    );
  }
}

/** #189 Piece 3 — the compartment-global SOURCE membership: every `(fhirType, system, code)` any concept publishes
 *  across its `source representation:` posreps (the mechanical stub/inline set, `sourceMembersOfConcept`), plus the
 *  set of resource TYPES that appear as a source rep. A bare-type source fact is checked against these. */
function buildSourceMembership(
  graph: ResolvedCelGraph,
  base: string | undefined,
): { keys: Set<string>; types: Set<string> } {
  const keys = new Set<string>();
  const types = new Set<string>();
  const reg = graph.crlRegistry;
  if (!reg || !base) return { keys, types };
  for (const e of [...reg.byNamePackage.values(), ...reg.byNameLocal.values()]) {
    for (const s of e.ast.statements) {
      if (s.type !== "Concept") continue;
      for (const m of sourceMembersOfConcept(s, base, reg)) {
        keys.add(memberKey(m.fhirType, m.system, m.code));
        types.add(m.fhirType);
      }
    }
  }
  return { keys, types };
}

/** #189 Piece 3 — the SOURCE-membership WARNING. A BARE-TYPE fact (`defined by "<FhirType>"` + `code is <token>`,
 *  the sanctioned source authoring) whose FhirType matches a concept's source rep but whose code is a member of NO
 *  source set populates nothing. Scoped to source-rep TYPES so a plain bare-type resource (e.g. a context Encounter)
 *  is never warned. Advisory (a deliberate non-covered datum is legitimate), like the local wrong-code warning. */
function validateSourceFactMembership(
  f: CELFact,
  sourceMemberKeys: Set<string>,
  sourceTypes: Set<string>,
  warnings: CELValidationError[],
  fp: string,
): void {
  const codeField = f.body.find((b): b is CELCodeField => b.type === "CELCodeField");
  if (!codeField) return; // bare fact — no authored code to check
  const db = f.body.find((b): b is CELDefinedByField => b.type === "CELDefinedByField");
  if (!db || isQualifiedRef(db.ref)) return; // only a BARE-TYPE fact (a qualified concept ref is the local lane)
  const fhirType = getRefName(db.ref);
  if (!sourceTypes.has(fhirType)) return; // not a source-rep type → a plain bare-type resource, nothing to check
  const cls = classifyCanonicalToken(codeField.value);
  if (cls.kind !== "coded") return; // malformed / systemless → a non-member anyway, not this warning's concern
  const key = memberKey(fhirType, cls.parts.system ?? "", cls.parts.code);
  if (!sourceMemberKeys.has(key)) {
    warnings.push(
      warn(
        "fact-code-not-in-source-set",
        `Fact "${f.name}" (type ${fhirType}) authors code \`${codeField.value}\`, which is a member of no concept's ` +
          `source set. If this is a deliberate non-covered datum, ignore; otherwise it populates nothing (both lanes ` +
          `compute the concept absent / false). A reference-VS member is the STUB code ` +
          `\`<canonicalBase>/CodeSystem/reference-vs-stub|<valueset-url-tail>\`, not a real terminology code.`,
        codeField.location,
        fp,
      ),
    );
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
