// #154/#203: collect FLAG instances (registry `flag:true` tags) from a CRL AST — the MV cockpit consumes this for
// the `mvComplete` gate (openFlags) + the flag list (collectFlags returns open AND resolved so the cockpit can
// reopen). Detection only: NO validation diagnostics (the `MetaTagValidator` owns those); a status the parser can't
// read defaults to `open` (so a malformed flag conservatively BLOCKS mvComplete rather than silently passing).
import type { CRL, Concept, Decision, Location, MetaEntry } from "../ast/types";

import { parseMetaTag } from "./parseMetaTag";
import { canonicalTag, flagCategory, isFlag } from "./registry";

export interface FlagInstance {
  /** raw tag id as written (may be a registered alias). */
  tag: string;
  /** the canonical tag id (aliases resolved). */
  canonicalTag: string;
  /** `extraction` (AI, narrative→CRL) | `validation` (human, in MV). */
  category?: string;
  /** parsed `status` field; absent → `open` (a flag with no status is open). */
  status: string;
  /** the `key` field — the re-detect / re-add-guard join key (stable source-span/hash). */
  key?: string;
  fields: Map<string, string>;
  body: string;
  scope: "concept" | "decision" | "library";
  /** the concept/decision name, or the library name. */
  targetName: string;
  libraryName?: string;
  filePath?: string;
  /** the FULL `- meta is `…`.` source-line span — the cockpit rewrites this line to change `; status`. */
  lineLocation: Location;
}

interface Attribution {
  libraryName?: string;
  filePath?: string;
}

function flagsFromMeta(
  meta: MetaEntry[] | undefined,
  scope: FlagInstance["scope"],
  targetName: string,
  attr: Attribution,
): FlagInstance[] {
  const out: FlagInstance[] = [];
  for (const entry of meta ?? []) {
    const res = parseMetaTag(entry.text);
    if (res.kind !== "tag" || !isFlag(res.parsed.tag)) continue;
    const { tag, body, fields } = res.parsed;
    out.push({
      tag,
      canonicalTag: canonicalTag(tag) ?? tag,
      category: flagCategory(tag),
      status: fields.get("status") ?? "open",
      key: fields.get("key"),
      fields,
      body,
      scope,
      targetName,
      libraryName: attr.libraryName,
      filePath: attr.filePath,
      lineLocation: entry.location,
    });
  }
  return out;
}

/** All flag instances (open AND resolved) in a single-file AST. Attribution (library/file) is best-effort here;
 *  the multi-file `MetaTagValidator` path supplies richer attribution. */
export function collectFlags(ast: CRL, attr: Attribution = {}): FlagInstance[] {
  const out: FlagInstance[] = [];
  const libAttr: Attribution = { libraryName: ast.library?.name ?? attr.libraryName, filePath: attr.filePath };
  if (ast.library) out.push(...flagsFromMeta(ast.library.meta, "library", ast.library.name, libAttr));
  for (const s of ast.statements) {
    if (s.type === "Concept") out.push(...flagsFromMeta((s as Concept).meta, "concept", s.name, libAttr));
    else if (s.type === "Decision") out.push(...flagsFromMeta((s as Decision).meta, "decision", s.name, libAttr));
  }
  return out;
}

/** The OPEN flags — the ones that block `mvComplete`. Conservative: only an EXPLICIT `; status resolved` clears; an
 *  absent status (defaulted to `open`) AND any unknown/variant status (`pending`, a stray ruling) are all treated as open
 *  so a malformed flag BLOCKS rather than silently passing. This matches the cockpit gate's `open = total − resolved`
 *  (Claude impl review: `status === "open"` would undercount a variant status and contradict this docstring). */
export function openFlags(ast: CRL, attr: Attribution = {}): FlagInstance[] {
  return collectFlags(ast, attr).filter((f) => f.status !== "resolved");
}
