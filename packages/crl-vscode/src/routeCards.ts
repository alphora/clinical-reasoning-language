// REFACTOR:grounded: construct cards only after walking a selected execution route.
import type { CrlConceptNode, ScenarioViewModel } from "@smile-digital-health/crl";
import type { QExpr, Questionnaire } from "./questionnaireModel";
import type { WordingTarget } from "./presentationProposal";

export interface RouteCard {
  id: string; ownerKey: string; concept: string; library: string;
  text: string; description: string; value: string; determination: string;
  explanation: boolean; editable: boolean; scopeLabel?: string; readOnlyReason?: string;
}
export function formatAnswer(value: { type: string; value: unknown } | undefined, options: { code: string; display: string }[] = []): string | undefined {
  if (!value) return undefined;
  const v = value.value;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number" || typeof v === "string") return String(v);
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  if (value.type === "Quantity") return [r.value, r.unit ?? r.code].filter(x => x !== undefined).join(" ");
  if (value.type === "CodeableConcept") return typeof r.text === "string" ? r.text : Array.isArray(r.coding)
    ? r.coding.map(c => { const matches = options.filter(o => o.code === c.code); return c.display ?? (matches.length === 1 ? matches[0].display : c.code) ?? ""; }).filter(Boolean).join(", ") : undefined;
  return JSON.stringify(v);
}

/** Uncoded definition helpers expose their value inputs; projector arms are not display dependencies. */
export function definitionValueInputs(concepts: CrlConceptNode[]) {
  const byKey = new Map(concepts.map(c => [c.nodeKey, c]));
  const byName = new Map(concepts.map(c => [JSON.stringify([c.lib,c.name]), c]));
  return (lib: string, name: string): CrlConceptNode[] => {
    const c = byName.get(JSON.stringify([lib,name]));
    if (!c || c.hasLocalCode || c.definitionKind !== "definition-is" || c.hasValueProjection) return [];
    return c.definitionRefs.map(k => byKey.get(k)).filter((v): v is CrlConceptNode => !!v);
  };
}

export function buildRouteCards(q: Questionnaire, sv: ScenarioViewModel, keyFor: (id: string) => string | undefined,
  wording: (lib: string, name: string, nodeId: string, criteria: string[]) => WordingTarget | undefined,
  optionsFor: (lib: string, name: string) => { code: string; display: string }[] = () => [],
  valueInputs: (lib: string, name: string) => CrlConceptNode[] = () => []) {
  const cards: RouteCard[] = [], targets = new Map<string, WordingTarget>();
  const add = (nodeId: string, name: string, lib: string, answer: string | null, inferred: boolean, criteria: string[], explanation: boolean, valueOnly = false, seen = new Set<string>()) => {
    const identity = JSON.stringify([lib,name]);
    if (seen.has(identity)) return;
    seen = new Set([...seen,identity]);
    const ownerKey = keyFor(nodeId);
    if (!ownerKey) return;
    const target = wording(lib, name, nodeId, criteria);
    const evidence = sv.conceptValues?.find(r => r.libraryName === lib && r.name === name);
    const raw = formatAnswer(evidence?.answerValue, optionsFor(lib, name));
    const determination = valueOnly ? "" : answer === "yes" ? "True" : answer === "no" ? "False" : "Unknown";
    let value: string;
    if (valueOnly) value = raw ?? "Not answered";
    else if (answer !== "yes" && answer !== "no") value = `Determination: Unknown${raw ? " · Available value: " + raw : ""}`;
    else if (target && raw !== undefined) value = raw;
    else if (inferred || !target) value = `Determination: ${determination}`;
    else value = raw ?? (answer === "yes" ? "Yes" : "No");
    const id = `card-${cards.length}`;
    cards.push({ id, ownerKey, concept: name, library: lib, text: target?.questionText ?? name,
      description: target?.questionDescription ?? "", value,
      determination, explanation, editable: !!target && target.editable !== false, ...(target ? { scopeLabel: target.scopeLabel, readOnlyReason: target.readOnlyReason } : {}) });
    if (target && target.editable !== false) targets.set(id, target);
    for (const dependency of valueInputs(lib,name)) {
      const truth = sv.conceptTruth?.find(r => r.libraryName === dependency.lib && r.name === dependency.name)?.satisfied;
      add(nodeId,dependency.name,dependency.lib,truth === true ? "yes" : truth === false ? "no" : "unknown", !!dependency.definitionKind, criteria, true, dependency.hasLocalCode, seen);
    }
  };
  const expand = (e: QExpr, nodeId: string, criteria: string[]) => {
    if (e.kind === "leaf") { add(nodeId, e.name, e.lib, e.answer, e.isInferred, criteria, true); if (e.composite) expand(e.composite, nodeId, criteria); }
    else if (e.kind === "criterion") { if (e.body) expand(e.body, nodeId, [...criteria, e.name]); }
    else if (e.kind === "not") expand(e.operand, nodeId, criteria);
    else if (e.kind === "and" || e.kind === "or") e.operands.forEach(x => expand(x, nodeId, criteria));
  };
  for (const row of q.questions) {
    add(row.nodeId, row.conceptName, row.libraryName ?? sv.decision?.libraryName ?? "", row.answer, row.isInferred || row.rowKind === "guard", [], false);
    if (row.expansion) expand(row.expansion, row.nodeId, []);
  }
  return { cards, targets };
}
