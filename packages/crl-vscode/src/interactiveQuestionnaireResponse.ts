/** Keep authoritative Q metadata and order. Accept hierarchical subsets; the caller chooses the prefix.
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
  retain = retainInteractiveQuestionnaire): { questionnaire: any; response: any; changed?: string; pruned: boolean } {
  const copy = (x: any) => JSON.parse(JSON.stringify(x));
  const value = (item: any) => JSON.stringify((item?.answer ?? []).map((a: any) =>
    Object.fromEntries(Object.keys(a).filter(k => k.startsWith("value")).sort().map(k => [k, a[k]]))));
  let changed: string | undefined, pruned = false;
  const hasAnswers = (v: any): boolean => !!v && typeof v === "object" &&
    (Array.isArray(v.answer) && v.answer.length > 0 || Object.values(v).some(x => typeof x === "object" && hasAnswers(x)));
  const walk = (questions: any[], before: any[], after: any[], prefix: string): any[] => {
    const result: any[] = [];
    for (const q of questions ?? []) {
      const old = (before ?? []).filter(x => x.linkId === q.linkId);
      const now = (after ?? []).filter(x => x.linkId === q.linkId);
      const count = q.type === "group" && q.repeats ? Math.max(old.length, now.length, 1) : 1;
      for (let i = 0; i < count; ++i) {
        const p = old[i], n = now[i], path = `${prefix}/${q.linkId}[${i}]`;
        if (changed) { if (hasAnswers(n) || hasAnswers(p)) pruned = true; continue; }
        const item = copy(n ?? { linkId: q.linkId });
        if (q.definition) item.definition = q.definition;
        delete item.item;
        if (item.answer) for (const a of item.answer) delete a.item;
        // An empty response item is intentional: preserve a clear even when LForms omits it.
        if (q.type !== "group" && q.type !== "display" && value(p) !== value(n)) {
          changed = path;
          if (hasAnswers(n?.item) || hasAnswers(p?.item) || [...(n?.answer ?? []), ...(p?.answer ?? [])].some((a: any) => hasAnswers(a.item))) pruned = true;
        } else if (q.item?.length) {
          if (item.answer?.length) {
            for (let a = 0; a < item.answer.length; ++a) {
              const children = walk(q.item, p?.answer?.[a]?.item, n?.answer?.[a]?.item, `${path}/answer[${a}]`);
              if (children.length) item.answer[a].item = children;
            }
          } else {
            const children = walk(q.item, p?.item, n?.item, path);
            if (children.length) item.item = children;
          }
        }
        result.push(item);
      }
    }
    return result;
  };
  const response = { ...copy(previous ?? {}), ...copy(incoming), item: walk(questionnaire.item, previous?.item, incoming.item, "") };
  const kept = changed ? retain(questionnaire, response) : copy(questionnaire);
  pruned ||= JSON.stringify(kept.item) !== JSON.stringify(questionnaire.item);
  return { questionnaire: kept, response, changed, pruned };
}

/** Rendering must not resurrect discarded initial values in the current retained Q. */
export function questionnaireWithoutDefaults(questionnaire: any): any {
  const q = JSON.parse(JSON.stringify(questionnaire));
  const walk = (items: any[]) => { for (const i of items ?? []) { delete i.initial; walk(i.item); } };
  walk(q.item);
  return q;
}
