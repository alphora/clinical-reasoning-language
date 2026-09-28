/** Runs unchanged in the webview and in unit tests. Only Q/QR structures are edited. */
export function pruneInteractiveResponse(questionnaire: any, previous: any, incoming: any): { response: any; changed?: string; pruned: boolean } {
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
  return { response, changed, pruned };
}

/** Returned Q remains authoritative for $apply; rendering must not resurrect discarded initial values. */
export function questionnaireWithoutDefaults(questionnaire: any): any {
  const q = JSON.parse(JSON.stringify(questionnaire));
  const walk = (items: any[]) => { for (const i of items ?? []) { delete i.initial; walk(i.item); } };
  walk(q.item);
  return q;
}
