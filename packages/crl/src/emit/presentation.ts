import { conceptRefsOfConcept } from "../ast/conceptDependencies";
import { getRefLibrary, getRefName, type BlockMember, type BranchCondition, type CRL, type Location, type Presentation, type ReferenceName } from "../ast/types";

export interface PresentationText { questionText?: string; questionDescription?: string }
export interface PresentationDiagnostic {
  filePath?: string;
  libraryName?: string;
  kind: "presentation-reference" | "presentation-overlap" | "presentation-empty" | "presentation-override-unsupported" | "presentation-target-not-question-enabled" | "presentation-question-text-missing";
  severity: "error" | "warning";
  message: string;
  location: Location;
}
export interface PresentationContext { decision: string; criteria: ReadonlySet<string> }

/** Authored presentation has its own namespace; it never enters CQL's declaration index. */
export function createPresentationCatalog(ast: CRL, filePath?: string) {
  const declarations = ast.presentations ?? [];
  const diagnostics: PresentationDiagnostic[] = [];
  const byTarget = new Map<string, Presentation[]>();
  const concepts = new Map(ast.statements.filter((s) => s.type === "Concept").map((s) => [s.name, s]));
  const criteria = new Map(ast.statements.filter((s) => s.type === "Criterion").map((s) => [s.name, s]));
  const decisions = new Map(ast.statements.filter((s) => s.type === "Decision").map((s) => [s.name, s]));
  const fail = (kind: PresentationDiagnostic["kind"], message: string, location: Location) => {
    if (!diagnostics.some((d) => d.kind === kind && d.message === message)) diagnostics.push({ kind, severity: "error", message, location, libraryName: ast.library.name, filePath });
  };
  const local = (ref: ReferenceName) => !getRefLibrary(ref) || getRefLibrary(ref) === ast.library.name;
  for (const presentation of declarations) {
    if (!local(presentation.target) || presentation.contexts.some((context) => !local(context.ref))) {
      fail("presentation-override-unsupported", "Cross-library presentation scopes and overrides are not implemented; see #321. Declare presentation in the owning library.", presentation.location);
      continue;
    }
    const name = getRefName(presentation.target);
    if (!concepts.has(name)) fail("presentation-reference", `Presentation target "${name}" must resolve to a concept.`, presentation.location);
    const target = concepts.get(name);
    if (target?.type === "Concept" && !target.code) fail("presentation-target-not-question-enabled", `Presentation target "${name}" must declare code is to provide a local Case Feature answer.`, presentation.location);
    if (!presentation.questionText?.trim()) {
      fail("presentation-empty", `Presentation for "${name}" requires nonempty question text.`, presentation.location);
    }
    const seen = new Set<string>();
    for (const context of presentation.contexts) {
      const contextName = getRefName(context.ref);
      if (!(context.kind === "decision" ? decisions : criteria).has(contextName)) fail("presentation-reference", `Presentation context "${contextName}" must resolve to a ${context.kind}.`, context.location);
      const key = `${context.kind}:${contextName}`;
      if (seen.has(key)) fail("presentation-overlap", `Presentation for "${name}" repeats context ${key}.`, context.location);
      seen.add(key);
    }
    byTarget.set(name, [...(byTarget.get(name) ?? []), presentation]);
  }
  for (const [name, list] of byTarget) {
    if (list.filter((p) => p.contexts.length === 0).length > 1) fail("presentation-overlap", `Concept "${name}" has multiple default presentations.`, list[1].location);
    const contexts = new Set<string>();
    for (const p of list) for (const context of p.contexts) {
      const key = `${context.kind}:${getRefName(context.ref)}`;
      if (contexts.has(key)) fail("presentation-overlap", `Concept "${name}" has overlapping presentation context ${key}.`, context.location);
      contexts.add(key);
    }
  }
  for (const concept of ast.statements) {
    if (concept.type === "Concept" && concept.code && !byTarget.has(concept.name)) diagnostics.push({
      kind: "presentation-question-text-missing", severity: "warning",
      libraryName: ast.library.name, filePath, location: concept.location,
      message: `Question-enabled concept "${ast.library.name}"."${concept.name}" has no presentation. Add question text and optional question description.`,
    });
  }
  const fields = (p?: Presentation): PresentationText => p ? {
    ...(p.questionText !== undefined ? { questionText: p.questionText } : {}),
    ...(p.questionDescription !== undefined ? { questionDescription: p.questionDescription } : {}),
  } : {};
  const resolveOccurrence = (name: string, context?: PresentationContext) => {
    const list = byTarget.get(name) ?? [];
    const defaults = list.find((p) => p.contexts.length === 0);
    const matches = context ? list.flatMap((p) => p.contexts.filter((scope) => scope.kind === "decision"
      ? getRefName(scope.ref) === context.decision : context.criteria.has(getRefName(scope.ref))).map(() => p)) : [];
    const findings: PresentationDiagnostic[] = matches.length > 1 ? [{ kind: "presentation-overlap", severity: "error", libraryName: ast.library.name, filePath,
        message: `Concept "${name}" has overlapping presentation scopes in decision "${context!.decision}". Remove redundant scopes (for example a criterion already covered by its decision) so only one scoped presentation applies.`, location: matches[1].location }] : [];
    return { wording: { ...fields(defaults), ...(matches.length === 1 ? fields(matches[0]) : {}) }, diagnostics: findings };

  };
  const resolve = (name: string, context?: PresentationContext): PresentationText => resolveOccurrence(name, context).wording;
  const criteriaFor = (condition: BranchCondition | undefined): ReadonlySet<string> => {
    const found = new Set<string>();
    const visit = (node: BranchCondition | undefined): void => {
      if (!node) return;
      if (node.type === "BranchConditionCriterionRef" || (node.type === "BranchConditionRef" && criteria.has(getRefName(node.ref)))) {
        const name = getRefName(node.ref);
        if (!local(node.ref) || found.has(name)) return;
        found.add(name);
        const criterion = criteria.get(name);
        if (criterion?.type === "Criterion") visit(criterion.condition);
      } else if (node.type === "BranchConditionAnd" || node.type === "BranchConditionOr") node.operands.forEach(visit);
      else if (node.type === "BranchConditionNot") visit(node.operand);
    };
    visit(condition);
    return found;
  };
  /** Preserve the criterion ancestry of each actual input occurrence, including producer operands. */
  const contextsForInput = (condition: BranchCondition | undefined, inputIdentity: string,
    inputs: (ref: ReferenceName) => readonly { canonical: string }[]): ReadonlySet<string>[] => {
    const contexts: ReadonlySet<string>[] = [];
    const visit = (node: BranchCondition | undefined, ancestors: ReadonlySet<string>): void => {
      if (!node) return;
      if (node.type === "BranchConditionRef" || node.type === "BranchConditionCriterionRef") {
        const name = getRefName(node.ref);
        const declaration = local(node.ref) ? criteria.get(name) : undefined;
        if (declaration?.type === "Criterion") {
          if (ancestors.has(name)) return;
          visit(declaration.condition, new Set([...ancestors, name]));
        } else if (inputs(node.ref).some((input) => input.canonical === inputIdentity)) contexts.push(ancestors);
      } else if (node.type === "BranchConditionAnd" || node.type === "BranchConditionOr") node.operands.forEach((operand) => visit(operand, ancestors));
      else if (node.type === "BranchConditionNot") visit(node.operand, ancestors);
    };
    visit(condition, new Set());
    return contexts.length ? contexts : [new Set()];
  };
  // Validate declared scope intersections on authored input dependencies. Runtime form co-occurrence
  // is checked separately against final emitted actions and actual profile identities.
  const rawInputs = (ref: ReferenceName): { canonical: string }[] => {
    const found = new Set<string>();
    const visit = (r: ReferenceName): void => {
      const name = getRefName(r);
      if (!local(r) || found.has(name)) return;
      const concept = concepts.get(name);
      if (!concept) return;
      found.add(name);
      conceptRefsOfConcept(concept).forEach(visit);
    };
    visit(ref);
    return [...found].map((canonical) => ({ canonical }));
  };
  for (const decision of decisions.values()) {
    const walk = (members: readonly BlockMember[]): void => {
      for (const member of members) {
        if (member.type === "WhenBlock") for (const name of byTarget.keys()) {
          for (const ancestry of contextsForInput(member.condition, name, rawInputs)) for (const d of resolveOccurrence(name, { decision: decision.name, criteria: ancestry }).diagnostics) fail(d.kind, d.message, d.location);
        }
        if ((member.type === "WhenBlock" || member.type === "OtherwiseBlock") && member.body.type === "BlockBody") walk(member.body.statements);
      }
    };
    walk(decision.body.statements);
  }
  return { diagnostics, resolve, resolveOccurrence, criteriaFor, contextsForInput,
    hasDeclaration: (name: string) => byTarget.has(name), libraryName: ast.library.name };
}

export type PresentationCatalog = ReturnType<typeof createPresentationCatalog>;
