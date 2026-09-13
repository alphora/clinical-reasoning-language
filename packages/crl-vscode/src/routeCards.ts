// REFACTOR:grounded: construct cards only after walking a selected execution route.
import type { CrlConceptNode, ScenarioViewModel } from "@smile-digital-health/crl";
import type { QExpr, Questionnaire } from "./questionnaireModel";
import type { WordingTarget } from "./presentationProposal";

export interface RouteCard {
  id: string; ownerKey: string; concept: string; library: string;
  text: string; description: string; value: string; determination: string;
  explanation: boolean; editable: boolean; scopeLabel?: string; readOnlyReason?: string;
  criteria: { lib: string; name: string }[];
  criterionPaths: { lib: string; name: string }[][];
  answerChoices: { system?: string; code: string; display: string; selected: boolean }[];
  choicesFrom?: string;
}
// One identity rule for answer text and choice selection; never borrow a known different system.
export function resolveAnswerChoice(coding: {system?: string; code?: string}, options: {system?: string; code: string; display: string}[]) {
  const sameCode = options.filter(o => o.code === coding.code);
  const exact = coding.system ? sameCode.filter(o => o.system === coding.system) : [];
  if (exact.length) return exact.length === 1 ? exact[0] : undefined;
  if (sameCode.length !== 1) return undefined;
  const only = sameCode[0];
  return coding.system && only.system && coding.system !== only.system ? undefined : only;
}
export function formatAnswer(value: { type: string; value: unknown } | undefined, options: { system?: string; code: string; display: string }[] = []): string | undefined {
  if (!value) return undefined;
  const v = value.value;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number" || typeof v === "string") return String(v);
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  if (value.type === "Quantity") return [r.value, r.unit ?? r.code].filter(x => x !== undefined).join(" ");
  if (value.type === "CodeableConcept") return typeof r.text === "string" ? r.text : Array.isArray(r.coding)
    ? r.coding.map(c => { const match = resolveAnswerChoice(c, options); return c.display ?? match?.display ?? c.code ?? ""; }).filter(Boolean).join(", ") : undefined;
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
  optionsFor: (lib: string, name: string) => { system?: string; code: string; display: string }[] = () => [],
  valueInputs: (lib: string, name: string) => CrlConceptNode[] = () => [],
  questionEnabled?: (lib: string, name: string) => boolean,
  choicesFromFor: (lib: string, name: string) => string | undefined = () => undefined) {
  const cards: RouteCard[] = [], targets = new Map<string, WordingTarget>(), emitted = new Map<string, RouteCard>();
  const add = (nodeId: string, name: string, lib: string, answer: string | null, inferred: boolean, criteria: {lib: string; name: string}[], explanation: boolean, valueOnly = false, seen = new Set<string>()) => {
    const identity = JSON.stringify([lib,name]);
    if (seen.has(identity)) return;
    seen = new Set([...seen,identity]);
    const ownerKey = keyFor(nodeId);
    if (!ownerKey) return;
    const target = wording(lib, name, nodeId, criteria.map(c => c.name));
    const answerable = questionEnabled ? questionEnabled(lib,name) : !!target;
    const evidence = sv.conceptValues?.find(r => r.libraryName === lib && r.name === name);
    const options = optionsFor(lib, name);
    const raw = formatAnswer(evidence?.answerValue, options);
    const coded = evidence?.answerValue?.type === "CodeableConcept" ? evidence.answerValue.value as {coding?: {system?: string; code?: string}[]} : undefined;
    const selectedChoices = new Set(Array.isArray(coded?.coding) ? coded.coding.map(c=>resolveAnswerChoice(c, options)).filter(Boolean) : []);
    const determination = valueOnly ? "" : answer === "yes" ? "True" : answer === "no" ? "False" : "Unknown";
    let value: string;
    if (valueOnly) value = raw ?? "Not answered";
    else if (answer !== "yes" && answer !== "no") value = `Determination: Unknown${raw ? " · Available value: " + raw : ""}`;
    else if (answerable && raw !== undefined) value = raw;
    else if (inferred || !target) value = `Determination: ${determination}`;
    else value = raw ?? (answer === "yes" ? "Yes" : "No");
    // REFACTOR:grounded: conditions are tree nodes; only answer-enabled Case Features get cards.
    const occurrence = JSON.stringify([ownerKey,lib,name,target?.context,target?.questionText,target?.questionDescription]);
    if (answerable && !emitted.has(occurrence)) {
    const id = `card-${cards.length}`;
    cards.push({ id, ownerKey, concept: name, library: lib, text: target?.questionText ?? name,
      description: target?.questionDescription ?? "", value,
      answerChoices: options.map(o=>({...o, selected: selectedChoices.has(o)})),
      choicesFrom: choicesFromFor(lib,name),
      determination, explanation, criteria, criterionPaths: [criteria], editable: !!target && target.editable !== false, ...(target ? { scopeLabel: target.scopeLabel, readOnlyReason: target.readOnlyReason } : {readOnlyReason:"Question wording is unavailable. Ask the CRL owner to validate its presentation."}) });
    emitted.set(occurrence,cards[cards.length-1]);
    if (target && target.editable !== false) targets.set(id, target);
    } else if (answerable) {
      const prior = emitted.get(occurrence)!;
      if (!prior.criterionPaths.some(p=>JSON.stringify(p)===JSON.stringify(criteria))) prior.criterionPaths.push(criteria);
    }
    for (const dependency of valueInputs(lib,name)) {
      const truth = sv.conceptTruth?.find(r => r.libraryName === dependency.lib && r.name === dependency.name)?.satisfied;
      add(nodeId,dependency.name,dependency.lib,truth === true ? "yes" : truth === false ? "no" : "unknown", !!dependency.definitionKind, criteria, true, dependency.hasLocalCode, seen);
    }
  };
  const expand = (e: QExpr, nodeId: string, criteria: {lib: string; name: string}[]) => {
    if (e.kind === "leaf") { add(nodeId, e.name, e.lib, e.answer, e.isInferred, criteria, true); if (e.composite) expand(e.composite, nodeId, criteria); }
    else if (e.kind === "criterion") { if (e.body) expand(e.body, nodeId, [...criteria, {lib:e.lib, name:e.name}]); }
    else if (e.kind === "not") expand(e.operand, nodeId, criteria);
    else if (e.kind === "and" || e.kind === "or") e.operands.forEach(x => expand(x, nodeId, criteria));
  };
  for (const row of q.questions) {
    add(row.nodeId, row.conceptName, row.libraryName ?? sv.decision?.libraryName ?? "", row.answer, row.isInferred || row.rowKind === "guard", [], false);
    if (row.expansion) expand(row.expansion, row.nodeId, []);
  }
  return { cards, targets };
}
