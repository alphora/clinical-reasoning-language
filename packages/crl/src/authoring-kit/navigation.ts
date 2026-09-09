// REFACTOR:grounded (review642): navigation references canonical content; it never selects a use case.
import type { AuthoringKit, KitIndexEntry, KitRule, KitTopic } from "./types";

export type KitContent = Omit<AuthoringKit, "contentHash" | "navigation" | "audit">;

/** Authored discovery terms, hashed with the kit. Retired spellings lead to current guidance. */
const ALIASES: Record<string, string[]> = {
  "concept-form": ["concept", "case feature", "Scalar", "remove scalar", "Observation", "code is", "absence", "completeness", "evidence completeness"],
  "value-type": ["value type is", "boolean", "Quantity", "CodeableConcept"],
  "publication-selection": ["shape reduction is", "most recent", "override", "local external inferred", "recency"],
  "named-answer-options": ["dropdown with a none answer", "coded answers", "answer options", "value from", "ValueSet answers", "not qualifying is", "in qualifying", "none of the above"],
  "concept-presentation": ["question wording", "presentation", "question text", "question description", "label", "questionnaire"],
  "bmi-publication": ["BMI", "height weight calculation", "body mass index"],
  "patient-age-projection": ["Patient age", "age today", "birth date", "same day override"],
  "decision-composition": ["decision tree", "sem-or", "sem-and", "defined as", "alternatives"],
  "criterion": ["criterion", "reusable condition"],
  "guards": ["guard", "only if"],
  "branch-guards": ["pause", "unknown", "null", "missing answer", "explicit false"],
  "review-flags": ["narrative completeness", "source fidelity", "narrative coverage"],
  "pa-disposition-set": ["authorization determination", "coverage determination", "recommendation", "approve deny", "PA without configuration"],
  "configure-dispositions": ["crl.dispositions", "missing configuration", "empty vocabulary"],
  "terminology-forms": ["codes", "terminology", "code system", "valueset is", "external ValueSet"],
  "library-scoping": ["import", "include library", "qualified reference"],
  "cel-cases": ["test cases", "CEL", "data", "expected activity"],
  "produce-results": ["emit_results", "$apply", "QuestionnaireResponse", "MV", "medical validation"],
  "verify-loop": ["verify", "run_decision", "CRE", "acceptance", "native engine"],
};

const RELATED: Record<string, string[]> = {
  "guards": ["rule:branch-guards", "rule:decision-composition"],
  "branch-guards": ["rule:publication-selection", "rule:cel-cases"],
  "concept-form": ["rule:publication-selection"],
  "dispositions": ["section:dispositionModel"],
  "named-answer-options": ["rule:concept-form", "rule:terminology-forms", "rule:concept-presentation", "artifact:named-answer-reference.crl"],
  "concept-presentation": ["rule:concept-form"],
  "bmi-publication": ["rule:publication-selection", "artifact:publication-reference.crl"],
  "patient-age-projection": ["rule:publication-selection", "artifact:patient-age-both-rep-reference.crl"],
  "publication-selection": ["artifact:selection-reference.crl"],
  "pa-disposition-set": ["rule:configure-dispositions", "rule:disposition-mode", "rule:dispositions", "rule:pa-answers-not-records", "section:dispositionModel", "artifact:pa-determination-reference.crl"],
  "configure-dispositions": ["rule:pa-disposition-set"],
  "disposition-mode": ["rule:pa-disposition-set"],
  "pa-answers-not-records": ["rule:named-answer-options"],
  "decision-composition": ["rule:criterion", "rule:guards", "rule:branch-guards", "rule:chaining-necessity"],
  "chaining-necessity": ["artifact:source-delegated-decision-reference.crl"],
};

/** Direct examples need their semantic guidance as well as runnable files/configuration. */
const EXAMPLE_RULES: Record<string, string[]> = {
  "source-field-order": ["concept-form"],
  "quantity-declaration": ["value-type", "concept-form"],
  "quantity-answer": ["cel-cases", "cel-quantity"],
  "terminology-displays": ["terminology-forms"],
  "local-answer": ["concept-form"],
  "decision-alternatives": ["decision-composition"],
  "vacuity-trap": ["decision-composition"],
  "menu-less-guard": ["guards"],
  "any-when": ["decision-qualifiers"],
  "compound-guard": ["branch-guards", "decision-composition", "pa-disposition-set"],
  "criterion-reuse": ["criterion", "pa-disposition-set"],
  "open-fork-flag": ["review-flags"],
  "fidelity-defect-flag": ["review-flags"],
  "gap-filed": ["review-flags"],
  "library-flag": ["review-flags", "library-scoping"],
};

const ARTIFACT_RULES: Record<string, string[]> = {
  "selection-reference": ["publication-selection"],
  "named-answer-reference": ["named-answer-options"],
  "named-answer-terms": ["named-answer-options", "terminology-forms"],
  "patient-age-both-rep-reference": ["patient-age-projection"],
  "publication-reference": ["bmi-publication", "concept-form"],
  "pa-determination-reference": ["pa-disposition-set"],
  "source-delegated-decision-reference": ["chaining-necessity", "pa-disposition-set"],
  "disposition-arbitration-reference": ["decision-composition", "pa-disposition-set"],
};

const SECTIONS: Record<keyof KitContent, [string, KitTopic]> = {
  introduction: ["Purpose and how to use this reference", "orientation"],
  schemaVersion: ["Kit content version", "orientation"],
  summary: ["Start here", "orientation"],
  forceModel: ["How strongly rules bind", "orientation"],
  conceptLayerModel: ["Concept forms and introductory coverage", "concepts"],
  rules: ["All authoring rules", "orientation"],
  typeAllowlist: ["Types: grammar vocabulary and recommended publications", "concepts"],
  referenceArtifacts: ["Complete executable examples and prerequisites", "orientation"],
  verificationLegend: ["What each proof method establishes", "testing"],
  examples: ["Short examples and counterexamples", "orientation"],
  verifyLoop: ["Validation and native acceptance workflow", "testing"],
  judgeLens: ["Narrative fidelity and waiver review", "review"],
  feedbackUrl: ["Report a language or tooling gap", "review"],
  boundary: ["Known coverage and implementation limits", "limitations"],
  dispositionModel: ["Authorization and coverage determination configuration", "dispositions"],
};

const CATEGORY_TOPIC: Record<KitRule["category"], KitTopic> = {
  "concept-model": "concepts", "decision-shape": "decisions", guards: "decisions",
  dispositions: "dispositions", minimalism: "review", cel: "testing", process: "review",
};

function ruleTopics(rule: KitRule | undefined): KitTopic[] {
  if (!rule) return ["orientation"];
  if (rule.id === "named-answer-options") return ["answers", "terminology"];
  if (rule.id === "concept-presentation") return ["questions", "concepts"];
  if (rule.id === "terminology-forms") return ["terminology"];
  if (rule.id === "library-scoping") return ["libraries"];
  if (rule.id === "cel-cases") return ["testing", "answers"];
  if (rule.id === "produce-results") return ["testing", "review"];
  return [CATEGORY_TOPIC[rule.category]];
}

export function buildKitIndex(kit: KitContent): KitIndexEntry[] {
  const rules = new Map(kit.rules.map(r => [r.id, r]));
  for (const key of [...Object.keys(ALIASES), ...Object.keys(RELATED)]) {
    if (!rules.has(key)) throw new Error(`Kit navigation refers to missing rule "${key}".`);
  }
  const scope = (ids: string[]) => [...new Set(ids.map(id => rules.get(id)?.applicability)
    .filter((value): value is string => !!value && value !== "All CRL authoring"))].join("; ") || "All CRL authoring";
  const topics = (ids: string[]) => [...new Set(ids.flatMap(id => ruleTopics(rules.get(id))))];
  const sections = Object.entries(SECTIONS).map(([key, [title, topic]]) => ({
    id: `section:${key}`, title, topics: [topic], status: key === "boundary" ? "limitation" as const : "current" as const,
    applicability: key === "dispositionModel" ? scope(["pa-disposition-set"]) : "All CRL authoring; check each member's applicability",
    aliases: [], requires: key === "conceptLayerModel" ? ["rule:concept-form", "rule:value-type", "rule:publication-selection"]
      : key === "dispositionModel" ? ["rule:configure-dispositions", "rule:pa-disposition-set"] : [] as string[],
    members: key === "rules" ? kit.rules.map(r => `rule:${r.id}`)
      : key === "referenceArtifacts" ? kit.referenceArtifacts.map(a => `artifact:${a.name}`)
      : key === "examples" ? kit.examples.map(e => `example:${e.id}`) : undefined,
  }));
  return [
    ...sections,
    ...kit.rules.map(r => ({ id: `rule:${r.id}`, title: r.id.replace(/-/g, " "), topics: ruleTopics(r),
      applicability: r.applicability,
      status: "current" as const, aliases: ALIASES[r.id] ?? [], requires: RELATED[r.id] ?? [] })),
    ...kit.examples.map(e => ({ id: `example:${e.id}`, title: e.title, topics: topics(EXAMPLE_RULES[e.id] ?? []),
      applicability: (EXAMPLE_RULES[e.id]?.includes("pa-disposition-set") ? "General decision syntax illustrated with configured authorization dispositions. Example context: " : "") + scope(EXAMPLE_RULES[e.id] ?? []),
      status: e.valid ? "current" as const : "counterexample" as const, aliases: e.expectRule ? [e.expectRule] : [],
      requires: (EXAMPLE_RULES[e.id] ?? []).map(id => `rule:${id}`) })),
    ...kit.referenceArtifacts.map(a => ({ id: `artifact:${a.name}`, title: a.name,
      topics: topics(ARTIFACT_RULES[a.name.replace(/\.(crl|cel)$/, "")] ?? []),
      applicability: a.applicability,
      status: "current" as const, aliases: [], requires: [...a.requires.artifacts,
        ...(ARTIFACT_RULES[a.name.replace(/\.(crl|cel)$/, "")] ?? []).map(id => `rule:${id}`)] })),
  ];
}

/** Each index entry resolves to one canonical unit, never a separately authored copy. */
export function kitEntryContent(kit: AuthoringKit, id: string): unknown {
  const colon = id.indexOf(":");
  const kind = id.slice(0, colon), key = id.slice(colon + 1);
  switch (kind) {
    case "section": return Object.prototype.hasOwnProperty.call(SECTIONS, key) ? kit[key as keyof KitContent] : undefined;
    case "rule": return kit.rules.find(r => r.id === key);
    case "example": return kit.examples.find(e => e.id === key);
    case "artifact": return kit.referenceArtifacts.find(a => a.name === key);
    default: return undefined;
  }
}
