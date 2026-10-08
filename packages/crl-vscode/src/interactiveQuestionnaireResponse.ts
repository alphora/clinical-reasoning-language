/** Keep authoritative Q metadata and order. Accept hierarchical subsets chosen by the caller.
 * Host submission and browser edit preparation both reject invalid trees; the browser blocks Continue on failure. */
export function retainInteractiveQuestionnaire(questionnaire: any, retained: any): any {
  const q = JSON.parse(JSON.stringify(questionnaire));
  const walk = (questions: any[], items: any[]): any[] => {
    for (const item of items ?? []) {
      if (!(questions ?? []).some(q => q.linkId === item.linkId)) throw new Error("Retained questionnaire contains an unknown item.");
    }
    return (questions ?? []).filter(q => (items ?? []).some(i => i.linkId === q.linkId)).map(q => {
      const matches = (items ?? []).filter(i => i.linkId === q.linkId);
      const children = matches.flatMap(i => [...(i.item ?? []), ...(i.answer ?? []).flatMap((a: any) => a.item ?? [])]);
      const kept = walk(q.item, children);
      if (kept.length) q.item = kept; else delete q.item;
      return q;
    });
  };
  q.item = walk(q.item, retained.item);
  const all: any[] = [];
  const collect = (items: any[]) => { for (const item of items ?? []) { all.push(item); collect(item.item); } };
  collect(q.item);
  const ids = new Set(all.map(item => item.linkId));
  if (all.some(item => item.enableWhen?.some((condition: any) => !ids.has(condition.question))))
    throw new Error("Cannot trim this questionnaire: a retained question depends on a removed question through enableWhen. Undo the edit or Reset.");
  return q;
}

/** Runs unchanged in the webview and in unit tests. Only Q/QR structures are edited.
 * Serialized browser callers must pass retain explicitly; the default exists only in module scope. */
export function pruneInteractiveResponse(questionnaire: any, previous: any, incoming: any,
  retain = retainInteractiveQuestionnaire, dependencies: Record<string, string[]> = {}): { questionnaire: any; response: any; changed?: string; pruned: boolean } {
  const copy = (x: any) => JSON.parse(JSON.stringify(x));
  const value = (item: any) => JSON.stringify((item?.answer ?? []).map((a: any) =>
    Object.fromEntries(Object.keys(a).filter(k => k.startsWith("value")).sort().map(k => [k, a[k]]))));
  let changed: string | undefined, pruned = false;
  const changedProfiles = new Set<string>(), counts = new Map<string, number>();
  const profile = (q: any): string | undefined => typeof q.definition === "string" ? q.definition.split("#")[0] : undefined;
  const count = (items: any[], repeated = false) => { for (const q of items ?? []) {
    const p = profile(q); if (p) counts.set(p, repeated || q.repeats ? Infinity : (counts.get(p) ?? 0) + 1);
    count(q.item, repeated || !!q.repeats);
  } };
  count(questionnaire.item);
  const walk = (questions: any[], before: any[], after: any[], prefix: string): { items: any[]; definitions: any[] } => {
    const result: any[] = [], definitions: any[] = [];
    for (const q of questions ?? []) {
      const old = (before ?? []).filter(x => x.linkId === q.linkId);
      const now = (after ?? []).filter(x => x.linkId === q.linkId);
      // Array positions do not identify repeated occurrences after an add/remove/reorder.
      // Preserve the supplied occurrences and the full template; Continue resolves applicability.
      if (q.type === "group" && q.repeats) {
        if (JSON.stringify(old) !== JSON.stringify(now)) changed ??= `${prefix}/${q.linkId}`;
        for (const occurrence of now) {
          const item = copy(occurrence);
          if (q.definition) item.definition = q.definition;
          const children = walk(q.item, occurrence.item, occurrence.item, `${prefix}/${q.linkId}`);
          if (children.items.length) item.item = children.items; else delete item.item;
          result.push(item);
        }
        definitions.push(copy(q));
        continue;
      }
      const p = old[0], n = now[0], path = `${prefix}/${q.linkId}[0]`;
      const definition = copy(q);
      const item = copy(n ?? { linkId: q.linkId });
      if (q.definition) item.definition = q.definition;
      delete item.item;
      if (item.answer) for (const a of item.answer) delete a.item;
      // An empty response item is intentional: preserve a clear even when LForms omits it.
      if (q.type !== "group" && q.type !== "display" && value(p) !== value(n)) {
        changed ??= path;
        const identity = profile(q);
        if (identity && counts.get(identity) === 1) changedProfiles.add(identity);
        if (q.item?.length) pruned = true;
        delete definition.item;
      } else if (q.item?.length) {
        if (item.answer?.length) {
          const retained: any[] = [];
          for (let a = 0; a < item.answer.length; ++a) {
            const children = walk(q.item, p?.answer?.[a]?.item, n?.answer?.[a]?.item, `${path}/answer[${a}]`);
            if (children.items.length) item.answer[a].item = children.items;
            retained.push(...children.definitions);
          }
          // One template is shared by all answer occurrences.
          definition.item = retained;
        } else {
          const children = walk(q.item, p?.item, n?.item, path);
          if (children.items.length) item.item = children.items;
          definition.item = children.definitions;
        }
      }
      result.push(item);
      definitions.push(definition);
    }
    return { items: result, definitions };
  };
  const tree = walk(questionnaire.item, previous?.item, incoming.item, "");
  const response = { ...copy(previous ?? {}), ...copy(incoming), item: tree.items };
  let kept = changed ? retain(questionnaire, { item: tree.definitions }) : copy(questionnaire);
  const removed = new Set<string>();
  const removeTree = (q: any) => { removed.add(q.linkId); for (const child of q.item ?? []) removeTree(child); };
  const collect = (items: any[]) => { for (const q of items ?? []) {
    const p = profile(q);
    if (p && counts.get(p) === 1 && (dependencies[p] ?? []).some(parent => changedProfiles.has(parent))) removeTree(q);
    collect(q.item);
  } };
  collect(kept.item);
  const references = (items: any[]): boolean => (items ?? []).some(q => !removed.has(q.linkId) &&
    ((q.enableWhen ?? []).some((c: any) => removed.has(c.question)) || references(q.item) ||
      (q.extension ?? []).some((e: any) => e.url === "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-enableWhenExpression")));
  // Optional flat pruning must never break literal references or an opaque expression.
  if (removed.size && !references(kept.item)) {
    const trim = (items: any[]): any[] => (items ?? []).filter(i => !removed.has(i.linkId)).map(i => {
      const x = copy(i); if (x.item) x.item = trim(x.item);
      if (x.answer) for (const a of x.answer) if (a.item) a.item = trim(a.item);
      return x;
    });
    kept = retain(kept, { item: trim(kept.item) }); response.item = trim(response.item); pruned = true;
  }
  return { questionnaire: kept, response, changed, pruned };
}

/** Rendering must not resurrect discarded initial values in the current retained Q. */
export function questionnaireWithoutDefaults(questionnaire: any): any {
  const q = JSON.parse(JSON.stringify(questionnaire));
  const walk = (items: any[]) => { for (const i of items ?? []) { delete i.initial; walk(i.item); } };
  walk(q.item);
  return q;
}
