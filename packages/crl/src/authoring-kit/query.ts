// REFACTOR:grounded (review642): focused delivery preserves prerequisites and evidence limits.
import { getAuthoringKit } from "./index";
import { kitEntryContent } from "./navigation";
import type { AuthoringKit, KitIndexEntry, KitQuery } from "./types";

const MIGRATION = "authoring_kit now has one kit, including authorization guidance. Use view: overview, search (query), entry (id), or full. Kit stage/useCase selectors were removed; emit_results runtime useCase is separate.";
const tokens = (text: string): string[] => text.toLowerCase().match(/[a-z0-9_$]+/g) ?? [];
const normalize = (text: string): string => tokens(text).join(" ");

function parseQuery(input: unknown): KitQuery {
  if (input === undefined) return {};
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(MIGRATION);
  const q = input as Record<string, unknown>;
  if (Object.keys(q).some(k => !["view", "id", "query"].includes(k))) throw new Error(MIGRATION);
  const view = q.view === undefined ? "overview" : q.view;
  if (!["overview", "search", "entry", "full"].includes(view as string)) throw new Error(MIGRATION);
  if (view === "search") {
    if (typeof q.query !== "string" || !q.query.trim() || q.id !== undefined) throw new Error("search requires a nonempty query and no id. " + MIGRATION);
  } else if (view === "entry") {
    if (typeof q.id !== "string" || !q.id.trim() || q.query !== undefined) throw new Error("entry requires a nonempty id and no query. " + MIGRATION);
  } else if (q.id !== undefined || q.query !== undefined) throw new Error("Only search accepts query; only entry accepts id. " + MIGRATION);
  return q as KitQuery;
}

function prerequisites(kit: AuthoringKit, id: string): KitIndexEntry[] {
  const byId = new Map(kit.navigation.map(e => [e.id, e]));
  const found = new Set<string>();
  const visit = (next: string) => {
    if (found.has(next)) return;
    const entry = byId.get(next);
    if (!entry) throw new Error(`Unknown kit entry "${next}". Use overview for the complete index.`);
    found.add(next);
    for (const dependency of entry.requires) visit(dependency);
  };
  visit(id);
  return [...found].map(key => byId.get(key)!);
}

/** All views identify the entire kit, but only full carries its legacy contentHash field. */
export function queryAuthoringKit(input?: unknown) {
  const args = parseQuery(input), kit = getAuthoringKit(), view = args.view ?? "overview";
  const identity = { view, complete: view === "full", schemaVersion: kit.schemaVersion,
    fullContentHash: kit.contentHash, audit: kit.audit };
  if (view === "full") return { ...kit, ...identity };
  const introduction = {
    ...kit.introduction,
    summary: kit.summary,
    forceLevels: kit.forceModel.levels,
    governingPrinciple: kit.forceModel.governingPrinciple,
    verificationLegend: kit.verificationLegend,
  };
  if (view === "overview") return { ...identity, introduction, index: kit.navigation };
  if (view === "entry") {
    const entries = prerequisites(kit, args.id!);
    return { ...identity, introduction, requestedId: args.id!,
      context: { forceModel: kit.forceModel, judgeLens: kit.judgeLens, verifyLoop: kit.verifyLoop,
        verificationLegend: kit.verificationLegend, boundary: kit.boundary },
      entries: entries.map(e => ({ ...e, content: e.members
        ? { memberIds: e.members, next: "Retrieve a member ID for full guidance and prerequisites, or view: full for the entire kit." }
        : kitEntryContent(kit, e.id) })) };
  }
  const query = normalize(args.query!), words = [...new Set(tokens(query))];
  const ranked = kit.navigation.map(entry => {
    const headings = normalize([entry.id, entry.title, ...entry.topics, ...entry.aliases].join(" "));
    const body = entry.members ? "" : normalize(JSON.stringify(kitEntryContent(kit, entry.id)));
    const exactAlias = entry.aliases.some(alias => normalize(alias) === query);
    const score = (exactAlias ? 1000 : 0) + (normalize(entry.id) === query ? 1000 : 0) +
      words.reduce((sum, word) => sum + (tokens(headings).includes(word) ? 10 : 0) + (tokens(body).includes(word) ? 1 : 0), 0);
    return { entry, score };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score ||
    Number(b.entry.id.startsWith("rule:")) - Number(a.entry.id.startsWith("rule:")) || a.entry.id.localeCompare(b.entry.id));
  return { ...identity, introduction, query: args.query!, total: ranked.length, truncated: ranked.length > 8,
    results: ranked.slice(0, 8).map(({ entry }) => ({ ...entry,
      summary: summary(kitEntryContent(kit, entry.id)).slice(0, 240) })),
    next: "Retrieve an entry ID for its complete instructions and prerequisites; overview lists every ID." };
}

function summary(content: unknown): string {
  if (typeof content === "string") return content;
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const c = content as Record<string, unknown>;
    for (const key of ["rule", "purpose", "note", "summary", "title"]) if (typeof c[key] === "string") return c[key] as string;
  }
  return "Structured kit section; retrieve this entry for complete guidance.";
}
