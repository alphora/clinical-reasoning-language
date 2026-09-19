import { buildCRL, createPresentationCatalog } from "@smile-digital-health/crl";
import {
  resolvePresentationTarget,
  type PresentationEditRequest,
} from "@smile-digital-health/crl/language-services";

type Ast = NonNullable<ReturnType<typeof buildCRL>["result"]>;
type Decision = Extract<Ast["statements"][number], { type: "Decision" }>;
type Member =
  | Decision["body"]["statements"][number]
  | { type: "ActionStatement" };
export interface WordingSelection {
  label: string;
  description: string;
  request: Pick<PresentationEditRequest, "library" | "concept" | "context">;
}
const nameOf = (ref: string | { name: string }) =>
  typeof ref === "string" ? ref : ref.name;

/** Offer declarations by identity, never by their possibly identical display wording. */
export function wordingSelections(
  source: string,
  concept: string,
): { choices: WordingSelection[]; unavailableScopes: string[] } {
  const parsed = buildCRL(source.replace(/^\uFEFF/, ""));
  if (!parsed.success || !parsed.result)
    throw new Error("Open valid CRL before editing question wording.");
  const ast = parsed.result,
    catalog = createPresentationCatalog(ast);
  const target = resolvePresentationTarget(source, concept);
  if (!target || !target.editable)
    throw new Error(
      target?.readOnlyReason ??
        "Select a locally owned question-enabled concept.",
    );
  const base = { library: ast.library.name, concept };
  const choices: WordingSelection[] = [
    {
      label: "Default wording",
      description: "Uses inheriting the default in this library",
      request: base,
    },
  ];
  const decisions = ast.statements.filter(
    (s): s is Decision => s.type === "Decision",
  );
  const unavailableScopes: string[] = [];
  const hasCriterion = (
    members: readonly Member[],
    criterion: string,
  ): boolean =>
    members.some(
      (m) =>
        (m.type === "WhenBlock" &&
          catalog.criteriaFor(m.condition).has(criterion)) ||
        ((m.type === "WhenBlock" || m.type === "OtherwiseBlock") &&
          m.body.type === "BlockBody" &&
          hasCriterion(m.body.statements, criterion)),
    );
  for (const p of ast.presentations ?? []) {
    if (nameOf(p.target) !== concept || !p.contexts.length) continue;
    const label = p.contexts
      .map((c) => `${c.kind} "${nameOf(c.ref)}"`)
      .join("; ");
    let context: PresentationEditRequest["context"];
    for (const c of p.contexts) {
      const name = nameOf(c.ref);
      const decision =
        c.kind === "decision"
          ? decisions.find((d) => d.name === name)
          : decisions.find((d) => hasCriterion(d.body.statements, name));
      if (decision) {
        context = {
          decision: decision.name,
          criteria: c.kind === "criterion" ? [name] : [],
        };
        break;
      }
    }
    if (!context) {
      unavailableScopes.push(label);
      continue;
    }
    const resolved = resolvePresentationTarget(source, concept, {
      decision: context.decision,
      criteria: new Set(context.criteria),
    });
    if (!resolved?.editable) {
      unavailableScopes.push(label);
      continue;
    }
    choices.push({
      label,
      description:
        "Edit this scoped presentation; inherited fields retain their shared owner",
      request: { ...base, context },
    });
  }
  return { choices, unavailableScopes };
}

type WordingTarget = NonNullable<ReturnType<typeof resolvePresentationTarget>>;
export type WordingDraft = {
  questionText: string;
  questionDescription: string;
};
const wordingFields = ["questionText", "questionDescription"] as const;
const ownerKey = (owner: WordingTarget["owners"]["questionText"]) =>
  owner
    ? JSON.stringify(
        owner.contexts.map((c) => `${c.kind}:${nameOf(c.ref)}`).sort(),
      )
    : "missing";

/** Preserve user intent when re-previewing; untouched populated values are never implicit edits. */
export function reconcileWordingDraft(
  base: WordingTarget,
  current: WordingTarget,
  draft: WordingDraft,
) {
  const changes: Partial<WordingDraft> = {},
    refreshed = { ...draft };
  const conflicts: {
    field: (typeof wordingFields)[number];
    before: string;
    current: string;
    proposed: string;
    ownerChanged: boolean;
  }[] = [];
  for (const field of wordingFields) {
    if (draft[field] === base[field]) {
      refreshed[field] = current[field];
      continue;
    }
    changes[field] = draft[field];
    const ownerChanged =
      ownerKey(base.owners[field]) !== ownerKey(current.owners[field]);
    if (current[field] !== base[field] || ownerChanged)
      conflicts.push({
        field,
        before: base[field],
        current: current[field],
        proposed: draft[field],
        ownerChanged,
      });
  }
  return { changes, refreshed, conflicts };
}
