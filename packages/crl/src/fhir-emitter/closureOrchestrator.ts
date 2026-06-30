/**
 * CRL → FHIR Definition emit — closure orchestrator (Todo 4 of #73).
 *
 * Drives all 4 per-library emit lanes (Todo 1 ValueSet, Todo 2a Library,
 * Todo 2b ActivityDef, Todo 3 Recommendation + Decision PlanDefs) across
 * the full import closure, then runs 3 closure-level invariants:
 *
 *   1. relativePath uniqueness (skip both colliders) — subsumes cross-
 *      kind PlanDef collisions (Recommendation id vs Decision id both
 *      write to PlanDefinition/<id>.json).
 *   2. Library-existence guarantee + Library.relatedArtifact integrity.
 *   3. Definition-target existence for PlanDef.action.definitionCanonical.
 *
 * Per plan v3.2 [068]:
 *   - Locked sequence: Aggregate → Inv 1 (drop colliders) → Inv 2+3 in
 *     parallel over post-Inv-1 set. Inv 2/3 error messages include
 *     "(downstream of collision on <relPath>)" context when applicable.
 *
 *   - Per-source-library resolvers: built ONCE per closure
 *     (AllLibrariesIndex), then specialized per-source-library inside the
 *     emit loop so bare refs scope to the source library and qualified
 *     refs route to the target library (or null for foreign-unsupported
 *     in v0).
 *
 *   - Closure-level Decision classification: orchestrator computes
 *     root/sub via a closure-wide qualified-key dependency graph
 *     (instead of per-library, which misses cross-library `use decision`
 *     incoming edges). Calls low-level emitDecisionPlanDefinition
 *     directly with the closure-computed isRoot.
 *
 *   - Cross-library concept/terminology refs are UNSUPPORTED in v0 —
 *     resolvers return null → Todo 3 cascade-suppression surfaces the
 *     gap via unresolved-* UnmatchedReference + appropriate cascade
 *     errors. Same-library qualified refs ("CurrentLib"."X") still
 *     resolve locally via normalizeLocalRef.
 */

import type { Activity, BranchBlock, Concept, Decision, ReferenceName, Terminology } from "../ast/types";
import { getRefLibrary, getRefName, isQualifiedRef } from "../ast/types";
import { computeFhirEmitClosure } from "../imports/computeEmitClosure";
import { safeOutputFilename } from "../imports/safeOutputFilename";
import { resolveImports } from "../imports/index";
import type { ImportDiagnostic, ResolvedGraph } from "../imports/types";
import type { CRLError } from "../types/errors";

import { lowerLocalCodes } from "../cql-emitter/lowerLocalCodes";

import { emitActivityDefinitionsForLibrary, type TerminologyResolver } from "./activity";
import { emitLocalCodeSystem } from "./codeSystem";
import { emitDecisionPlanDefinition, type ActivityResolver, type ConceptResolver, type DecisionResolver } from "./decision";
import { emitLibrary } from "./library";
import { readPackageMetadata } from "./metadata";
import { resolveEmitClock } from "./reproDate";
import { emitRecommendationDefinitionsForLibrary } from "./recommendation";
import { isFhirDefError } from "./types";
import type { CpgMetadata, EmitOptions, EmittedResource, UnmatchedReference } from "./types";
import { emitValueSetsForLibrary } from "./valueSet";

export interface FhirDefClosureEmitResult {
  success: boolean;
  resources: EmittedResource[];
  errors: CRLError[];
  unmatched: UnmatchedReference[];
}

export interface FhirDefFromPathResult extends FhirDefClosureEmitResult {
  importDiagnostics: ImportDiagnostic[];
  metadataErrors: CRLError[];
}

/* ─── AllLibrariesIndex + qualifiedKey ─────────────────────────────── */

interface AllLibrariesIndex {
  /** Map<libraryName, Map<conceptName, Concept>>. */
  concepts: Map<string, Map<string, Concept>>;
  /** Map<libraryName, Map<activityName, Activity>>. */
  activities: Map<string, Map<string, Activity>>;
  /** Map<libraryName, Map<decisionName, Decision>>. */
  decisions: Map<string, Map<string, Decision>>;
  /** Map<libraryName, Map<terminologyName, Terminology>>. */
  terminologies: Map<string, Map<string, Terminology>>;
}

/** Tuple-safe qualified-key encoding (round-3 gpt55 nit). */
function qualifiedKey([libraryName, name]: [string, string]): string {
  return JSON.stringify([libraryName, name]);
}

function buildAllLibrariesIndex(
  libraries: ReadonlyArray<{ libraryName: string; ast: { statements: ReadonlyArray<unknown> } }>,
): AllLibrariesIndex {
  const concepts = new Map<string, Map<string, Concept>>();
  const activities = new Map<string, Map<string, Activity>>();
  const decisions = new Map<string, Map<string, Decision>>();
  const terminologies = new Map<string, Map<string, Terminology>>();
  for (const lib of libraries) {
    const conceptMap = new Map<string, Concept>();
    const activityMap = new Map<string, Activity>();
    const decisionMap = new Map<string, Decision>();
    const terminologyMap = new Map<string, Terminology>();
    for (const stmt of lib.ast.statements) {
      const s = stmt as { type: string; name?: string };
      if (s.type === "Concept" && s.name) conceptMap.set(s.name, stmt as Concept);
      else if (s.type === "Activity" && s.name) activityMap.set(s.name, stmt as Activity);
      else if (s.type === "Decision" && s.name) decisionMap.set(s.name, stmt as Decision);
      else if (s.type === "Terminology" && s.name) terminologyMap.set(s.name, stmt as Terminology);
    }
    concepts.set(lib.libraryName, conceptMap);
    activities.set(lib.libraryName, activityMap);
    decisions.set(lib.libraryName, decisionMap);
    terminologies.set(lib.libraryName, terminologyMap);
  }
  return { concepts, activities, decisions, terminologies };
}

/* ─── normalizeLocalRef (re-used; same semantics as decision.ts) ───── */

function normalizeLocalRef(ref: ReferenceName, libraryName: string): ReferenceName {
  if (!isQualifiedRef(ref)) return ref;
  if (getRefLibrary(ref) === libraryName) return getRefName(ref);
  return ref;
}

/* ─── per-source-library resolvers ─────────────────────────────────── */

function makeResolversForSourceLibrary(
  sourceLibraryName: string,
  index: AllLibrariesIndex,
  cycleMemberKeys: Set<string>,
  metadata: CpgMetadata,
): {
  conceptResolver: ConceptResolver;
  activityResolver: ActivityResolver;
  decisionResolver: DecisionResolver;
  terminologyResolver: TerminologyResolver;
} {
  const conceptResolver: ConceptResolver = (ref) => {
    const normalized = normalizeLocalRef(ref, sourceLibraryName);
    if (isQualifiedRef(normalized)) return null; // cross-library concept unsupported in v0
    const name = getRefName(normalized);
    return index.concepts.get(sourceLibraryName)?.has(name) ? name : null;
  };

  const activityResolver: ActivityResolver = (ref) => {
    const normalized = normalizeLocalRef(ref, sourceLibraryName);
    if (isQualifiedRef(normalized)) return null; // cross-library v0: unsupported
    const name = getRefName(normalized);
    if (!index.activities.get(sourceLibraryName)?.has(name)) return null;
    // Recommendation canonical URL for source library's activity
    return `${metadata.canonicalBase}/PlanDefinition/${recommendationIdForLib(sourceLibraryName, name)}`;
  };

  const decisionResolver: DecisionResolver = (ref) => {
    const normalized = normalizeLocalRef(ref, sourceLibraryName);
    if (isQualifiedRef(normalized)) {
      // cross-library — only emit a URL if target is in closure AND not cycle-skipped
      const targetLib = getRefLibrary(normalized)!;
      const targetName = getRefName(normalized);
      const key = qualifiedKey([targetLib, targetName]);
      if (cycleMemberKeys.has(key)) return null;
      if (!index.decisions.get(targetLib)?.has(targetName)) return null;
      return `${metadata.canonicalBase}/PlanDefinition/${decisionIdForLib(targetLib, targetName)}`;
    }
    const name = getRefName(normalized);
    const key = qualifiedKey([sourceLibraryName, name]);
    if (cycleMemberKeys.has(key)) return null;
    if (!index.decisions.get(sourceLibraryName)?.has(name)) return null;
    return `${metadata.canonicalBase}/PlanDefinition/${decisionIdForLib(sourceLibraryName, name)}`;
  };

  const terminologyResolver: TerminologyResolver = (ref) => {
    const normalized = normalizeLocalRef(ref, sourceLibraryName);
    if (isQualifiedRef(normalized)) return null; // cross-library terminology unsupported in v0
    const name = getRefName(normalized);
    if (!index.terminologies.get(sourceLibraryName)?.has(name)) return null;
    // Return the local CQL identifier (the terminology's quoted name in the source library's CQL).
    return name;
  };

  return { conceptResolver, activityResolver, decisionResolver, terminologyResolver };
}

/* ─── slug helpers (mirror per-emit-module slug rules) ──────────────── */

import { capSlug, capSlugForSuffix, slugify } from "./slug";
import { tarjanSCC } from "./tarjan";

function decisionIdForLib(libraryName: string, decisionName: string): string {
  return capSlug(`${slugify(libraryName)}-${slugify(decisionName)}`);
}

function recommendationIdForLib(libraryName: string, activityName: string): string {
  return capSlugForSuffix(`${slugify(libraryName)}-${slugify(activityName)}`, "-recommendation");
}

/* ─── Closure-level Decision classification + cycle detection ───────── */

interface DecisionClassification {
  /** qualifiedKey set: classified as root */
  rootKeys: Set<string>;
  /** qualifiedKey set: in a cycle; emit skipped */
  cycleMemberKeys: Set<string>;
  /** errors generated by cycle detection */
  errors: CRLError[];
}

function classifyClosureDecisions(
  libraries: ReadonlyArray<{ libraryName: string; decisions: ReadonlyArray<Decision> }>,
  index: AllLibrariesIndex,
): DecisionClassification {
  const errors: CRLError[] = [];

  // (1) collect all decision keys
  const allKeys = new Set<string>();
  for (const lib of libraries) {
    for (const dec of lib.decisions) {
      allKeys.add(qualifiedKey([lib.libraryName, dec.name]));
    }
  }

  // (2) build outgoing edges per decision via closure-aware ref walking
  const outgoing = new Map<string, Set<string>>();
  for (const lib of libraries) {
    for (const dec of lib.decisions) {
      const edges = new Set<string>();
      const visitBranch = (branch: BranchBlock): void => {
        const body = branch.body;
        const visitUseDec = (ref: ReferenceName): void => {
          const normalized = normalizeLocalRef(ref, lib.libraryName);
          if (isQualifiedRef(normalized)) {
            const targetLib = getRefLibrary(normalized)!;
            const targetName = getRefName(normalized);
            const key = qualifiedKey([targetLib, targetName]);
            if (allKeys.has(key)) edges.add(key);
          } else {
            const name = getRefName(normalized);
            const key = qualifiedKey([lib.libraryName, name]);
            if (allKeys.has(key)) edges.add(key);
          }
        };
        if (body.type === "ActionStatement") {
          if (body.action.type === "UseDecision") visitUseDec(body.action.decisionName);
          return;
        }
        for (const stmt of body.statements) {
          if (stmt.type === "WhenBlock" || stmt.type === "OtherwiseBlock") visitBranch(stmt);
          else if (stmt.action.type === "UseDecision") visitUseDec(stmt.action.decisionName);
        }
      };
      for (const branch of dec.body.statements) visitBranch(branch);
      outgoing.set(qualifiedKey([lib.libraryName, dec.name]), edges);
    }
  }

  // (3) Tarjan SCC over qualified-key graph
  const nodes = Array.from(allKeys);
  const sccs = tarjanSCC(nodes, outgoing);
  const cycleMemberKeys = new Set<string>();
  for (const scc of sccs) {
    const isSelfLoop = scc.length === 1 && outgoing.get(scc[0]!)?.has(scc[0]!);
    if (scc.length > 1 || isSelfLoop) {
      for (const m of scc) cycleMemberKeys.add(m);
      const display = scc
        .map((k) => {
          const parsed = JSON.parse(k) as [string, string];
          return `"${parsed[1]}" (library "${parsed[0]}")`;
        })
        .join(", ");
      errors.push({
        type: "Validation",
        kind: "circular-decision-reference",
        message: `Circular decision reference among: ${display}. Skipping all members.`,
      });
    }
  }

  // (4) incoming computation → root classification
  const incoming = new Map<string, Set<string>>();
  for (const k of allKeys) incoming.set(k, new Set());
  for (const [from, tos] of outgoing) {
    for (const to of tos) incoming.get(to)?.add(from);
  }

  const rootKeys = new Set<string>();
  for (const k of allKeys) {
    if (cycleMemberKeys.has(k)) continue;
    if ((incoming.get(k)?.size ?? 0) === 0) rootKeys.add(k);
  }

  // (5) empty-strategy-entrypoint check (suppressed when cycle errors present)
  if (rootKeys.size === 0 && cycleMemberKeys.size === 0 && allKeys.size > 0) {
    errors.push({
      type: "Validation",
      kind: "empty-strategy-entrypoint",
      message:
        "Closure has no root decision. Every decision is referenced by another via 'use decision', and no cycles were detected. Modeling error?",
    });
  }

  // Silence unused warnings — index is structurally part of the API but
  // walked only via libraries here.
  void index;

  return { rootKeys, cycleMemberKeys, errors };
}

// tarjanSCC factored to ./tarjan for shared use between per-library
// (decision.ts) and closure-level (this file) cycle detection — v2.4.0
// round-5 Gemini disposition.

/* ─── Closure invariants ────────────────────────────────────────────── */

function isUnderCanonicalBase(url: string, base: string): boolean {
  return url === base || url.startsWith(base + "/");
}

/**
 * Inv 1 — relativePath uniqueness across the closure. Skip both colliders.
 * Returns the post-Inv-1 surviving resources + errors emitted.
 */
export function applyInvariant1(resources: ReadonlyArray<EmittedResource>): {
  surviving: EmittedResource[];
  errors: CRLError[];
  /** map of dropped relativePaths for "(downstream of collision on X)" annotations */
  droppedPaths: Set<string>;
} {
  const byPath = new Map<string, EmittedResource[]>();
  for (const r of resources) {
    const list = byPath.get(r.relativePath) ?? [];
    list.push(r);
    byPath.set(r.relativePath, list);
  }
  const errors: CRLError[] = [];
  const surviving: EmittedResource[] = [];
  const droppedPaths = new Set<string>();
  for (const [path, list] of byPath) {
    if (list.length === 1) {
      surviving.push(list[0]!);
      continue;
    }
    droppedPaths.add(path);
    const colliderDescriptions = list
      .map((r) => {
        const loc = r.location?.start;
        const locStr = loc ? ` (line ${loc.line})` : "";
        return `${r.sourceKind ?? "?"} "${r.sourceName ?? "?"}"${locStr}`;
      })
      .join(" vs ");
    errors.push({
      type: "Validation",
      kind: "closure-resource-collision",
      message: `Collision on ${path} between ${colliderDescriptions}. Skipping all colliders.`,
    });
  }
  return { surviving, errors, droppedPaths };
}

/**
 * Inv 0 (slice 4) — canonical `url` uniqueness across the closure. A cross-
 * library canonicalBase-slug collision would otherwise produce two resources
 * (e.g. two local CodeSystems) sharing the same canonical `url`, which is
 * invalid FHIR (a canonical url must resolve to ONE resource). The CQL lane's
 * slug-collision preflight catches the codesystem-slug case on its side; this is
 * the FHIR-side guard, and it covers ANY resource kind with a duplicated url.
 *
 * This only ERRORS — it does not drop. Inv 1 (relativePath uniqueness) handles
 * dropping the colliders when their ids also collide (the common case); when two
 * distinct relativePaths somehow carry the same url, this is the only signal.
 */
export function applyUrlUniquenessInvariant(resources: ReadonlyArray<EmittedResource>): CRLError[] {
  const byUrl = new Map<string, EmittedResource[]>();
  for (const r of resources) {
    const url = (r.resource as { url?: string }).url;
    if (typeof url !== "string" || url === "") continue;
    const list = byUrl.get(url) ?? [];
    list.push(r);
    byUrl.set(url, list);
  }
  const errors: CRLError[] = [];
  for (const [url, list] of byUrl) {
    if (list.length < 2) continue;
    const desc = list
      .map((r) => `${r.sourceKind ?? "?"} "${r.sourceName ?? "?"}" (${r.relativePath})`)
      .join(" vs ");
    errors.push({
      type: "Validation",
      kind: "closure-resource-url-collision",
      message: `Two or more emitted resources share the canonical url "${url}": ${desc}. A canonical url must resolve to a single resource — rename one of the colliding CRL libraries/declarations.`,
    });
  }
  return errors;
}

/**
 * Inv 2 — Library-existence guarantee + Library.relatedArtifact integrity.
 */
function applyInvariant2(
  resources: ReadonlyArray<EmittedResource>,
  droppedPaths: Set<string>,
  metadata: CpgMetadata,
): CRLError[] {
  const errors: CRLError[] = [];
  const emittedUrls = new Set<string>();
  for (const r of resources) {
    const url = (r.resource as { url?: string }).url;
    if (typeof url === "string") emittedUrls.add(url);
  }

  // (a) library[] integrity
  for (const r of resources) {
    if (r.resourceType !== "ActivityDefinition" && r.resourceType !== "PlanDefinition") continue;
    const libArr = (r.resource as { library?: unknown }).library;
    if (!Array.isArray(libArr)) continue;
    for (const url of libArr) {
      if (typeof url !== "string") continue;
      if (!emittedUrls.has(url)) {
        const context = downstreamContext(url, droppedPaths);
        errors.push({
          type: "Validation",
          kind: "unresolved-library-reference",
          message: `${r.resourceType} "${r.sourceName ?? r.relativePath}" library[] references "${url}" which was not emitted${context}.`,
        });
      }
    }
  }

  // (b) Library.relatedArtifact[depends-on] integrity (under canonicalBase only)
  for (const r of resources) {
    if (r.resourceType !== "Library") continue;
    const ra = (r.resource as { relatedArtifact?: Array<{ type?: string; resource?: string }> }).relatedArtifact;
    if (!Array.isArray(ra)) continue;
    for (const entry of ra) {
      if (entry.type !== "depends-on") continue;
      const url = entry.resource;
      if (typeof url !== "string") continue;
      if (!isUnderCanonicalBase(url, metadata.canonicalBase)) continue; // external — exempt
      if (!emittedUrls.has(url)) {
        const context = downstreamContext(url, droppedPaths);
        errors.push({
          type: "Validation",
          kind: "unresolved-related-artifact",
          message: `Library "${r.sourceName ?? r.relativePath}" depends-on "${url}" which was not emitted${context}.`,
        });
      }
    }
  }

  return errors;
}

/**
 * Inv 3 — definition-target existence for PlanDef.action.definitionCanonical.
 */
function applyInvariant3(resources: ReadonlyArray<EmittedResource>, droppedPaths: Set<string>): CRLError[] {
  const errors: CRLError[] = [];
  const emittedUrls = new Set<string>();
  for (const r of resources) {
    const url = (r.resource as { url?: string }).url;
    if (typeof url === "string") emittedUrls.add(url);
  }

  function walkActions(
    actions: ReadonlyArray<Record<string, unknown>>,
    source: EmittedResource,
  ): void {
    for (const a of actions) {
      const dc = a.definitionCanonical;
      if (typeof dc === "string" && !emittedUrls.has(dc)) {
        const context = downstreamContext(dc, droppedPaths);
        errors.push({
          type: "Validation",
          kind: "unresolved-definition-target",
          message: `${source.resourceType} "${source.sourceName ?? source.relativePath}" action references definitionCanonical "${dc}" which was not emitted${context}.`,
        });
      }
      const nested = a.action;
      if (Array.isArray(nested)) {
        walkActions(nested as ReadonlyArray<Record<string, unknown>>, source);
      }
    }
  }

  for (const r of resources) {
    if (r.resourceType !== "PlanDefinition") continue;
    const actions = (r.resource as { action?: ReadonlyArray<Record<string, unknown>> }).action;
    if (!Array.isArray(actions)) continue;
    walkActions(actions, r);
  }
  return errors;
}

function downstreamContext(url: string, droppedPaths: Set<string>): string {
  // Tightened per round-5 Claude nit: require BOTH the resource-type
  // prefix AND the id stem to match, so a dropped `ValueSet/foo.json`
  // doesn't false-positive-annotate an unrelated PlanDefinition URL
  // that happens to end in `/foo`.
  for (const dropped of droppedPaths) {
    const [resourceType, idJson] = dropped.split("/");
    if (!resourceType || !idJson) continue;
    const id = idJson.replace(/\.json$/, "");
    if (url.includes(`/${resourceType}/${id}`)) {
      return ` (downstream of collision on ${dropped})`;
    }
  }
  return "";
}

/* ─── Public API ────────────────────────────────────────────────────── */

/**
 * Closure-level FHIR Definition emit. Takes a resolved import graph +
 * package metadata; returns the aggregated resource set + errors +
 * unmatched references.
 */
export function emitFhirDefClosure(
  graph: ResolvedGraph,
  metadata: CpgMetadata,
  opts: EmitOptions = {},
): FhirDefClosureEmitResult {
  const errors: CRLError[] = [];
  const unmatched: UnmatchedReference[] = [];
  const resources: EmittedResource[] = [];

  // `executable` is not supported: emit produces design-time forms (text/cql
  // Library content, value-set `compose`), not the run-time forms `executable`
  // requires (compiled ELM, value-set `expansion`). Max capability = publishable.
  // Tracked in #113.
  if ((opts.capability ?? "publishable") === "executable") {
    return {
      success: false,
      resources: [],
      errors: [
        {
          type: "Validation",
          kind: "executable-capability-unsupported",
          message:
            "`--capability executable` is not supported: CRL→FHIR emit produces design-time forms (text/cql Library content, value-set `compose`), not the run-time forms `executable` requires (compiled ELM for Library, an `expansion` for ValueSet). Max capability is `publishable`. Track: alphora/clinical-reasoning-language#113.",
        },
      ],
      unmatched: [],
    };
  }

  // Reproducible emit: resolve the publication date ONCE (opts.date →
  // SOURCE_DATE_EPOCH → crl.date → clock → wall clock) and inject it as a fixed
  // clock so every per-resource emitter stamps the identical timestamp with no
  // intra-emit drift. Invalid explicit/env inputs surface as hard errors.
  const { clock, errors: dateErrors } = resolveEmitClock(opts, metadata);
  errors.push(...dateErrors);
  const resolvedOpts: EmitOptions = { ...opts, clock };

  const expandedClosure = computeFhirEmitClosure(graph);

  // Filter out parse-error placeholders (null/empty names — parse-failure
  // diagnostic is the real signal).
  const libraries = expandedClosure
    .filter((entry) => entry.name !== null && entry.name !== "")
    .map((entry) => {
      const libraryName = entry.name as string;
      const statements = entry.ast.statements;
      const activities = statements.filter((s): s is Activity => s.type === "Activity");
      const concepts = statements.filter((s): s is Concept => s.type === "Concept");
      const decisions = statements.filter((s): s is Decision => s.type === "Decision");
      const terminologies = statements.filter((s): s is Terminology => s.type === "Terminology");
      let cqlFileName: string;
      try {
        cqlFileName = `../../cql/${safeOutputFilename(libraryName)}`;
      } catch (e) {
        // Round-5 Claude [important]: unsafe library names can throw out
        // of safeOutputFilename. Surface as a structured CRLError instead
        // of crashing the orchestrator boundary.
        errors.push({
          type: "Validation",
          kind: "unsafe-library-filename",
          message: `Library "${libraryName}" cannot be safely written as a CQL filename: ${(e as Error).message}`,
        });
        cqlFileName = `../../cql/${libraryName}.cql`; // best-effort placeholder; the error already flagged
      }
      return { libraryName, ast: entry.ast, activities, concepts, decisions, terminologies, cqlFileName };
    });

  // Build the index ONCE (O(N) over closure).
  const index = buildAllLibrariesIndex(libraries);

  // Closure-level Decision classification + cycle detection.
  const classification = classifyClosureDecisions(libraries, index);
  errors.push(...classification.errors);

  // Per-library emit (1-4) + per-decision emit with closure-aware resolvers.
  for (const lib of libraries) {
    // Build per-source-library resolvers.
    const sourceLibResolvers = makeResolversForSourceLibrary(
      lib.libraryName,
      index,
      classification.cycleMemberKeys,
      metadata,
    );

    // (1) ValueSets
    const vsResult = emitValueSetsForLibrary(lib.terminologies, lib.libraryName, metadata, resolvedOpts);
    resources.push(...vsResult.resources);
    errors.push(...vsResult.errors);
    unmatched.push(...vsResult.unmatched);
    const emittedDependsOnCanonicals: string[] = vsResult.resources
      .map((r) => (r.resource as { url?: string }).url)
      .filter((u): u is string => typeof u === "string");

    // (1b) Local CodeSystem for concept-level `code is` codes (slice 4).
    //
    // FIRST run `lowerLocalCodes` for its DIAGNOSTICS — the slice-3 hard errors
    // (mixed code+definition, empty code, missing type, duplicate code) would
    // otherwise be skipped on the FHIR-only path (MCP `emit_crl_fhir`), which
    // never goes through the CQL lane. We use the SAME pass's `localCodes` to
    // select which codes to materialize, so the CodeSystem carries EXACTLY the
    // codes the CQL emits (one source of truth, no second predicate to drift).
    // The lowering kinds are already hard errors (not in FHIR_DEF_WARNING_KINDS),
    // so push them as-is — re-keying would only lose the actionable subtype. On
    // a lowering error, surface it and emit NO CodeSystem for this library.
    const lowered = lowerLocalCodes(lib.ast, { canonicalBase: metadata.canonicalBase });
    if (lowered.errors.length > 0) {
      errors.push(...lowered.errors);
    } else {
      const codeConcepts = lowered.localCodes;
      if (codeConcepts.length > 0) {
        const csResult = emitLocalCodeSystem(lib.libraryName, codeConcepts, metadata, resolvedOpts);
        if (csResult.resource) {
          resources.push(csResult.resource);
          const csUrl = (csResult.resource.resource as { url?: string }).url;
          if (typeof csUrl === "string") emittedDependsOnCanonicals.push(csUrl);
        }
        errors.push(...csResult.errors);
        unmatched.push(...csResult.unmatched);
      }
    }

    // (2) Library — post-decorate with sourceKind/sourceName/location after emit
    const libResult = emitLibrary(
      lib.libraryName,
      metadata,
      emittedDependsOnCanonicals,
      lib.cqlFileName,
      resolvedOpts,
    );
    if (libResult.resource) {
      // Plan v3.2 §"emitLibrary post-decorate"
      libResult.resource.sourceKind = "Library";
      libResult.resource.sourceName = lib.libraryName;
      if (lib.ast.library?.location) libResult.resource.location = lib.ast.library.location;
      resources.push(libResult.resource);
    }
    errors.push(...libResult.errors);
    unmatched.push(...libResult.unmatched);

    // (3) ActivityDefinitions
    const actResult = emitActivityDefinitionsForLibrary(
      lib.activities,
      lib.libraryName,
      metadata,
      sourceLibResolvers.terminologyResolver,
      resolvedOpts,
    );
    resources.push(...actResult.resources);
    errors.push(...actResult.errors);
    unmatched.push(...actResult.unmatched);

    // (4) Recommendation PlanDefs
    const recResult = emitRecommendationDefinitionsForLibrary(lib.activities, lib.libraryName, metadata, resolvedOpts);
    resources.push(...recResult.resources);
    errors.push(...recResult.errors);
    unmatched.push(...recResult.unmatched);

    // (5) Decision PlanDefs — closure-aware via low-level emitDecisionPlanDefinition
    for (const decision of lib.decisions) {
      const decKey = qualifiedKey([lib.libraryName, decision.name]);
      if (classification.cycleMemberKeys.has(decKey)) continue;
      const isRoot = classification.rootKeys.has(decKey);
      const decResult = emitDecisionPlanDefinition(
        decision,
        lib.libraryName,
        metadata,
        sourceLibResolvers.conceptResolver,
        sourceLibResolvers.activityResolver,
        sourceLibResolvers.decisionResolver,
        isRoot,
        resolvedOpts,
      );
      if (decResult.resource) resources.push(decResult.resource);
      errors.push(...decResult.errors);
      unmatched.push(...decResult.unmatched);
    }
  }

  // Closure invariants — locked sequence per plan v3.2 (+ slice 4 Inv 0).
  // Inv 0: url uniqueness across the FULL emitted set (before Inv 1 drops on
  // relativePath) so a same-url collision is reported even if the two colliders'
  // relativePaths somehow differ.
  errors.push(...applyUrlUniquenessInvariant(resources));
  const inv1 = applyInvariant1(resources);
  errors.push(...inv1.errors);
  const inv2errors = applyInvariant2(inv1.surviving, inv1.droppedPaths, metadata);
  const inv3errors = applyInvariant3(inv1.surviving, inv1.droppedPaths);
  errors.push(...inv2errors, ...inv3errors);

  // Round-5 gpt55 [important]: severity-aware success (warnings don't sink
  // success). Hard errors (non-warning CRLErrors) + any unmatched still flip
  // success to false; warning-kind errors do not.
  const success = errors.filter(isFhirDefError).length === 0 && unmatched.length === 0;

  return {
    success,
    resources: inv1.surviving,
    errors,
    unmatched,
  };
}

/**
 * High-level entry point for CLI + MCP. Walks imports from the given root
 * path, loads package metadata, and runs the closure emit pipeline.
 */
export function emitFhirDefFromPath(
  rootPath: string,
  opts: EmitOptions = {},
): FhirDefFromPathResult {
  const graph = resolveImports(rootPath);

  // Try to load metadata; metadataErrors surface separately for CLI/MCP exit code computation.
  const metadataErrors: CRLError[] = [];
  let metadata: CpgMetadata | null = null;
  if (graph.projectRoot) {
    const metaResult = readPackageMetadata(graph.projectRoot);
    if (metaResult.metadata) {
      metadata = metaResult.metadata;
    }
    metadataErrors.push(...metaResult.errors);
  }

  if (!metadata) {
    return {
      success: false,
      resources: [],
      errors: [],
      unmatched: [],
      importDiagnostics: graph.diagnostics,
      metadataErrors,
    };
  }

  const closureResult = emitFhirDefClosure(graph, metadata, opts);
  // Round-5 gpt55 [important]: fold importDiagnostics + metadataErrors
  // into success. Otherwise MCP can return success:true with fatal
  // import-time errors.
  const importErrors = graph.diagnostics.filter((d) => d.severity === "error");
  const success = closureResult.success && metadataErrors.length === 0 && importErrors.length === 0;
  return {
    ...closureResult,
    success,
    importDiagnostics: graph.diagnostics,
    metadataErrors,
  };
}
