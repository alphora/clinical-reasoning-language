import type { Fhir, InteractiveResult } from "./interactiveQuestionnaire";

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const items = (value: any): any[] => Array.isArray(value) ? value : [];
const answered = (item: any): boolean => items(item.answer).some(a =>
  Object.keys(a).some(k => k.startsWith("value") && a[k] !== undefined && a[k] !== null) ||
  items(a.item).some(answered)) || items(item.item).some(answered);
const identity = (q: any): string => q.definition ? "definition:" + q.definition : "linkId:" + q.linkId;
const fail = (detail: string): never => { throw new Error("Cannot retain submitted answers: " + detail + ". The submitted form is still available for correction or Reset."); };

/** Reconcile only the successfully submitted pair, never an earlier answer state.
 * Native values win for questions still returned. Missing answered branches stay editable. */
export function retainSubmittedAnswers(submittedQ: Fhir | undefined, submittedR: Fhir | undefined,
  result: InteractiveResult): InteractiveResult {
  if (!submittedQ || !submittedR || !items(submittedR.item).some(answered)) return result;
  const hasQ = !!result.questionnaire, hasR = !!result.response;
  if (hasQ !== hasR) fail("native returned an incomplete Q/QR pair");
  if (hasQ && result.questionnaire!.url !== submittedQ.url) fail("the questionnaire canonical changed");
  const q = copy(result.questionnaire ?? { ...submittedQ, item: [] });
  const r = copy(result.response ?? { ...submittedR, item: [] });
  const used = new Set<string>(), mapping = new Map<string, string>(), restored: any[] = [];
  const ancestorConditions: Array<{ before: any[]; after: any[] }> = [];
  let nextId = 1;
  const all = (qs: any[]): any[] => qs.flatMap(q => [q, ...all(items(q.item))]);
  for (const item of all(items(q.item))) {
    if (used.has(item.linkId)) fail("native question identifiers are ambiguous");
    used.add(item.linkId);
  }
  const oldIds = new Set<string>();
  for (const item of all(items(submittedQ.item))) {
    if (oldIds.has(item.linkId)) fail("submitted question identifiers are ambiguous");
    oldIds.add(item.linkId);
  }
  const matching = (old: any, qs: any[]): any => {
    const matches = qs.filter(q => identity(q) === identity(old));
    if (matches.length > 1) fail("a definition has multiple occurrences in the same context");
    const found = matches[0];
    if (found && (found.type !== old.type || !!found.repeats !== !!old.repeats ||
      (!old.definition && (found.text !== old.text || q.version !== submittedQ.version))))
      fail("question identity or type changed");
    return found;
  };
  const bind = (old: any[], current: any[]) => {
    for (const item of old) {
      const found = matching(item, current);
      if (found) { mapping.set(item.linkId, found.linkId); bind(items(item.item), items(found.item)); }
    }
  };
  bind(items(submittedQ.item), items(q.item));
  // A question template is cloned once even when its response has repeated occurrences.
  const trim = (qs: any[], rs: any[]): { questions: any[]; responses: any[] } => {
    const flattenResponses = (rs: any[]): any[] => rs.flatMap(r => [r,
      ...flattenResponses(items(r.item)), ...items(r.answer).flatMap(a => flattenResponses(items(a.item)))]);
    const submitted = flattenResponses(rs), keptIds = new Set<string>();
    const definitions = (qs: any[]): any[] => qs.flatMap(question => {
      if (!submitted.some(r => r.linkId === question.linkId && answered(r))) return [];
      if (question.type !== "group" && !question.definition && hasQ)
        fail("a disappearing question has no stable definition");
      const retained = copy(question), oldId = question.linkId;
      while (used.has(retained.linkId)) retained.linkId = "retained-" + nextId++;
      used.add(retained.linkId); mapping.set(oldId, retained.linkId); keptIds.add(oldId);
      delete retained.initial;
      const children = definitions(items(question.item));
      if (children.length) retained.item = children; else delete retained.item;
      restored.push(retained);
      return [retained];
    });
    const questions = definitions(qs);
    const responses = (rs: any[]): any[] => rs.filter(r => keptIds.has(r.linkId) && answered(r)).map(r => {
      const kept = copy(r); kept.linkId = mapping.get(r.linkId)!;
      const children = responses(items(r.item));
      if (children.length) kept.item = children; else delete kept.item;
      for (const answer of items(kept.answer)) {
        const children = responses(items(answer.item));
        if (children.length) answer.item = children; else delete answer.item;
      }
      return kept;
    });
    return { questions, responses: responses(rs) };
  };
  const missingAnswered = (old: any[], rs: any[], current: any[]): boolean =>
    old.some(item => {
      const answers = rs.filter(r => r.linkId === item.linkId && answered(r));
      if (!answers.length) return false;
      const found = matching(item, current);
      return !found || missingAnswered(items(item.item),
        answers.flatMap(r => [...items(r.item), ...items(r.answer).flatMap(a => items(a.item))]), items(found.item));
    });
  const merge = (old: any[], submitted: any[], current: any[], responses: any[]) => {
    for (const item of old) {
      const oldResponses = submitted.filter(r => r.linkId === item.linkId && answered(r));
      if (!oldResponses.length) continue;
      const found = matching(item, current);
      if (!found) {
        const retained = trim([item], oldResponses);
        current.push(...retained.questions); responses.push(...retained.responses);
        continue;
      }
      if (!missingAnswered(items(item.item),
        oldResponses.flatMap(r => [...items(r.item), ...items(r.answer).flatMap(a => items(a.item))]), items(found.item))) continue;
      const nativeResponses = responses.filter(r => r.linkId === found.linkId);
      if (item.type !== "group" || item.repeats || oldResponses.length !== 1 || nativeResponses.length > 1)
        fail("partial retention inside repeated or answer-bearing parents needs occurrence identity");
      // REFACTOR:grounded: a stable group identity does not establish a stable extraction context.
      // Only a merge of missing descendants needs this check; wholly native branches stay native.
      // Defensive support for supplied group conditions, not a claim that CRL emits them.
      // Conservative equality refuses reordered metadata; literal gate IDs are mapped below.
      for (const key of ["extension", "modifierExtension", "code", "enableBehavior"])
        if (JSON.stringify(item[key] ?? []) !== JSON.stringify(found[key] ?? []))
          fail("ancestor evaluation or extraction context changed");
      ancestorConditions.push({ before: items(item.enableWhen), after: items(found.enableWhen) });
      let target = nativeResponses[0];
      if (!target) { target = { linkId: found.linkId }; responses.push(target); }
      target.item ??= []; found.item ??= [];
      merge(items(item.item), items(oldResponses[0].item), found.item, target.item);
    }
  };
  q.item ??= []; r.item ??= [];
  merge(items(submittedQ.item), items(submittedR.item), q.item, r.item);
  // A later omitted gate can retain its original ID, repairing a native condition's target.
  // Defer for that case. If collision forces a new gate ID, refuse rather than rewrite native conditions.
  for (const { before, after } of ancestorConditions) {
    const mapped = before.map(condition => {
      const question = mapping.get(condition.question);
      if (!question) fail("ancestor enableWhen references an unavailable question");
      return { ...condition, question };
    });
    if (JSON.stringify(mapped) !== JSON.stringify(after))
      fail("ancestor evaluation or extraction context changed");
  }
  if (!restored.length) return result;
  if (hasQ && JSON.stringify(submittedQ.extension ?? []) !== JSON.stringify(q.extension ?? []))
    fail("questionnaire-level evaluation or extraction context changed");
  const changedIds = [...mapping].some(([old, current]) => old !== current);
  const hasExpression = (value: any): boolean => {
    if (!value || typeof value !== "object") return false;
    if (typeof value.expression === "string") {
      // These emitted extraction expressions do not address Questionnaire item identities.
      if (value.language === "text/fhirpath" && ["%resource.subject", "%resource.authored"].includes(value.expression)) return false;
      return true;
    }
    return Object.values(value).some(hasExpression);
  };
  const generatedPopulation = (extension: any, item: any): boolean => {
    if (extension.url !== "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-questionnaire-definitionPopulationContext") return false;
    const children = items(extension.extension);
    if (children.length !== 2) return false;
    const definition = children.find(e => e.url === "definition")?.valueCanonical;
    const expression = children.find(e => e.url === "expression")?.valueExpression;
    const profile = item.definition?.split("#")[0], marker = "/StructureDefinition/";
    if (!profile?.includes(marker) || typeof definition !== "string" ||
      !(definition === profile || definition.startsWith(profile + "|"))) return false;
    const libraryBase = profile.slice(0, profile.indexOf(marker)) + "/Library/";
    return expression?.language === "text/cql-identifier" &&
      typeof expression.expression === "string" && !!expression.expression &&
      expression.name === expression.expression && typeof expression.reference === "string" &&
      expression.reference.startsWith(libraryBase) &&
      /^[A-Za-z][A-Za-z0-9]*Inferences$/.test(expression.reference.slice(libraryBase.length));
  };
  // Arbitrary expression strings cannot be safely rewritten after positional IDs change.
  if (changedIds && (hasExpression(submittedQ.extension) ||
    restored.some(item => items(item.extension).some(extension =>
      !generatedPopulation(extension, item) && hasExpression(extension)))))
    fail("renumbered retained metadata contains expression references");
  for (const item of restored) {
    for (const condition of items(item.enableWhen)) {
      const target = mapping.get(condition.question);
      if (!target) fail("a retained enableWhen references an unavailable question");
      condition.question = target;
    }
  }
  r.questionnaire = q.url + (q.version ? "|" + q.version : "");
  return { ...result, questionnaire: q, response: r };
}
