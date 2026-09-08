import type { CRL, Concept, ReferenceName, Terminology } from "../ast/types";
import { localAnswerTerminology, resolveAnswerDomain, type AnswerDomainError, type AnswerMember } from "../emit/answerDomain";
import { emittedValueSetUrl } from "./valueSet";
import { pascalCaseName, rawSlug, uniqueCapSlugForSuffix } from "./slug";
import { crmiCapabilityProfiles, isPublishablePlus, knowledgeExtensions } from "./types";
import type { CpgMetadata, EmitOptions, EmittedResource } from "./types";

// REFACTOR:grounded (#320, 615): logical CRL ownership is independent of physical CQL splitting.
export function answerCodeSystemIdentity(libraryName: string, conceptName: string, canonicalBase: string): { id: string; url: string } {
  const id = uniqueCapSlugForSuffix(rawSlug(`${libraryName}-${conceptName}`), "-answer-codes");
  return { id, url: `${canonicalBase}/CodeSystem/${id}` };
}

export interface NamedAnswerSet {
  allOptions: { url: string };
  members: readonly AnswerMember[];
  qualifying: readonly AnswerMember[];
}

/** Owner-local adapter. General declaration resolution remains in the existing import context. */
export function namedAnswerSet(concept: Concept, ast: CRL, policyId: string, canonicalBase: string, onError?: (error: AnswerDomainError) => void, resolve?: (ref: ReferenceName) => Terminology | undefined): NamedAnswerSet | undefined {
  if (!concept.valueFrom) return undefined;
  const terminology = resolve ? resolve(concept.valueFrom.terminologyName) : localAnswerTerminology(ast, concept);
  if (!terminology) return undefined;
  // A plain opaque binding can still be emitted. It cannot supply a finite classification table.
  if (terminology.body.some((line) => line.type === "TerminologyValueset") && !concept.valueFrom.notQualifying?.length) return undefined;
  const result = resolveAnswerDomain(concept.valueFrom, terminology);
  if (result.kind === "error") { onError?.(result); return undefined; }
  const prefix = `${canonicalBase.replace(/\/$/, "")}/CodeSystem/`;
  const ownedMembers = result.members.filter((member) => member.system.startsWith(prefix));
  for (const url of new Set(ownedMembers.map((member) => member.system))) {
    const id = url.slice(prefix.length);
    if (!/^[A-Za-z0-9.-]{1,64}$/.test(id)) {
      const suggested = answerCodeSystemIdentity(ast.library.name, concept.name, canonicalBase);
      onError?.({ kind: "error", code: "answer-options-invalid-local-system", message: `Locally owned answer CodeSystem ${url} must have a valid FHIR id of at most 64 characters. For this concept, the shared formatter produces ${suggested.url}; update the authored system consistently.` });
      return undefined;
    }
  }
  return {
    allOptions: { url: emittedValueSetUrl(terminology, canonicalBase, policyId) },
    members: result.members, qualifying: result.qualifying,
  };
}

export function buildNamedAnswerSetMap(ast: CRL, policyId: string, canonicalBase: string, onError?: (error: AnswerDomainError) => void, resolve?: (ref: ReferenceName) => Terminology | undefined): Map<string, NamedAnswerSet> {
  const sets = new Map<string, NamedAnswerSet>();
  for (const statement of ast.statements) {
    if (statement.type !== "Concept") continue;
    const set = namedAnswerSet(statement, ast, policyId, canonicalBase, onError, resolve);
    if (set) sets.set(statement.name, set);
  }
  return sets;
}

/** Authored system identity, not whichever consumer happens to be visited first, owns metadata. */
function emitOwnedCodeSystem(system: { id: string; url: string; members: readonly { code: string; display?: string }[] }, metadata: CpgMetadata, opts: EmitOptions): EmittedResource {
  const level = opts.capability ?? "publishable";
  const title = system.id;
  const resource = {
    resourceType: "CodeSystem", id: system.id,
    meta: { profile: crmiCapabilityProfiles("codesystem", level) },
    extension: knowledgeExtensions(level), url: system.url, version: metadata.version,
    name: pascalCaseName(system.id), title, description: title,
    status: metadata.status, experimental: metadata.experimental, publisher: metadata.publisher,
    ...(isPublishablePlus(level) ? { date: (opts.clock ?? (() => new Date()))().toISOString() } : {}),
    ...(metadata.contact.length ? { contact: metadata.contact } : {}),
    ...(metadata.jurisdiction.length ? { jurisdiction: metadata.jurisdiction } : {}),
    ...(metadata.useContext.length ? { useContext: metadata.useContext } : {}),
    caseSensitive: true, content: "complete",
    concept: system.members.map(({ code, display }) => ({ code, display })),
  };
  return { resourceType: "CodeSystem", relativePath: `CodeSystem/${resource.id}.json`, resource,
    sourceKind: "AnswerOptions", sourceName: system.url };
}

/** Collect exactly the locally owned members actually emitted by every terminology route. */
export function emitOwnedValueSetCodeSystems(resources: readonly EmittedResource[], metadata: CpgMetadata, opts: EmitOptions,
  onError: (error: AnswerDomainError) => void): EmittedResource[] {
  const prefix = `${metadata.canonicalBase.replace(/\/$/, "")}/CodeSystem/`;
  const alreadyEmitted = new Map(resources.filter((r) => r.resourceType === "CodeSystem")
    .map((r) => r.resource as { url?: string; concept?: { code: string; display?: string }[] }).map((r) => [r.url, r]));
  const systems = new Map<string, Map<string, { code: string; display?: string }>>();
  for (const resource of resources) {
    if (resource.resourceType !== "ValueSet") continue;
    const includes = (resource.resource as { compose?: { include?: { system?: string; concept?: { code: string; display?: string }[] }[] } }).compose?.include ?? [];
    for (const include of includes) {
      const url = include.system;
      if (!url?.startsWith(prefix) || !include.concept?.length) continue;
      const id = url.slice(prefix.length);
      if (!/^[A-Za-z0-9.-]{1,64}$/.test(id)) {
        onError({ kind: "error", code: "answer-options-invalid-local-system", message: `Locally owned CodeSystem ${url} must have a valid FHIR id of at most 64 characters.` });
        continue;
      }
      const members = systems.get(url) ?? new Map((alreadyEmitted.get(url)?.concept ?? []).map((member) => [member.code, member]));
      systems.set(url, members);
      for (const member of include.concept) {
        const previous = members.get(member.code);
        if (previous?.display !== undefined && member.display !== undefined && previous.display !== member.display) {
          onError({ kind: "error", code: "answer-options-conflicting-display", message: `Locally owned ${url} declares conflicting displays for code ${member.code}.` });
        } else if (!previous || previous.display === undefined) members.set(member.code, member);
      }
    }
  }
  const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  return [...systems].sort(([a], [b]) => compare(a, b)).flatMap(([url, members]) => {
    const existing = alreadyEmitted.get(url);
    if (existing) {
      // Preserve metadata and existing code order; the authored local vocabulary can add members.
      existing.concept = [...members.values()].map(({ code, display }) => ({ code, display }));
      return [];
    }
    return [emitOwnedCodeSystem({ id: url.slice(prefix.length), url,
      members: [...members.values()].sort((a, b) => compare(a.code, b.code)),
    }, metadata, opts)];
  });
}
