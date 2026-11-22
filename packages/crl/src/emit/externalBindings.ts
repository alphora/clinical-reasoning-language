// REFACTOR:grounded — operation-local, source-informed external bindings (prototype v1).
// This is definition assembly, not source-side CRE/CEL evaluation or a general linker ABI.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import type { ReferenceName } from "../ast/types";
import { getRefLibrary, getRefName } from "../ast/types";
import { definitionLanesResult, type EmitCrlTwoLaneOptions } from "../emit-two-lane";
import { emitDefinitionLanesFromPrepared } from "../fhir-emitter/closureOrchestrator";
import { resolveImports } from "../imports/index";
import { publicationCaseFeatures } from "./publicationInputs";
import { createPresentationCatalog } from "./presentation";
import { buildCRL } from "../index";
import type { EmittedResource } from "../fhir-emitter/types";
import { normalizeEmissionMetadata } from "../fhir-emitter/metadata";
import { preparePublicationContext, type PreparedPublicationContext } from "../imports/preparePublicationContext";
import { buildLibraryScopes, lookupKnownLibrary } from "../imports/scopes";
import type { ResolvedGraph } from "../imports/types";
import type { PerLibraryEmit } from "../imports/emit";
import type { PublicationContext, PublicationConceptLookup } from "./publicationContext";
import type { PublicationDescriptor, PublicationProgram } from "./publicationProgram";
import { collectFhirDefEmitRefs, computeFhirEmitClosure } from "../imports/computeEmitClosure";

export class ExternalBindingError extends Error {
  readonly kind: string;
  constructor(kind: string, message: string) { super(message); this.name = "ExternalBindingError"; this.kind = kind; }
}
function fail(kind: string, message: string): never { throw new ExternalBindingError(kind, message); }
const hash = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
function structural(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(structural).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${structural((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
export interface SnapshotProvenance {
  readonly snapshotId: string;
  readonly entrySourceIdentity: string;
  readonly sourceHashes: Readonly<Record<string, string>>;
  readonly metadataHash: string;
  readonly emitOptionsHash: string;
  readonly compilationRoles: readonly { source: string; physicalLibrary: string; role: PerLibraryEmit["role"]; layer?: string }[];
}
export interface Captured<T> { readonly value: T; readonly origins: readonly SnapshotProvenance[] }
export interface SupportSubset {
  readonly resources: readonly Captured<EmittedResource>[];
  readonly cql: readonly Captured<PerLibraryEmit>[];
}
export interface SelectedBooleanExport {
  readonly descriptor: PublicationDescriptor;
  readonly target: { readonly libraryName: string; readonly define: string };
  readonly canonical: string;
}
export interface ProviderSupportSnapshot {
  readonly version: 1;
  readonly kind: "support";
  readonly provenance: SnapshotProvenance;
  readonly prepared: PreparedPublicationContext;
  readonly selected: SelectedBooleanExport;
  readonly publicationTargets: readonly (readonly [string, { readonly libraryName: string; readonly define: string }])[];
  readonly support: SupportSubset;
  readonly canonicalBases: readonly string[];
}
export interface ProviderDecisionSnapshot {
  readonly version: 1;
  readonly kind: "decision";
  readonly provenance: SnapshotProvenance;
  readonly canonical: string;
  readonly library: string;
  readonly decision: string;
  readonly support: SupportSubset;
  readonly canonicalBases: readonly string[];
}
export interface ExternalPublicationBinding {
  readonly consumerSource: string;
  readonly reference: { readonly library: string; readonly concept: string };
  readonly provider: ProviderSupportSnapshot;
}
export interface ExternalDecisionBinding {
  readonly consumerSource: string;
  readonly reference: { readonly library: string; readonly decision: string };
  readonly provider: ProviderDecisionSnapshot;
}
export interface ExternalBindingsV1 {
  readonly version: 1;
  readonly publications: readonly ExternalPublicationBinding[];
  readonly decisions: readonly ExternalDecisionBinding[];
}
const snapshots = new WeakMap<object, string>();
function fingerprint(snapshot: ProviderSupportSnapshot | ProviderDecisionSnapshot): string {
  return hash(structural({ ...snapshot, prepared: snapshot.kind === "support" ? {
    libraries: snapshot.prepared.declarations.getLibraries(), descriptors: snapshot.prepared.publications.descriptors,
  } : undefined }));
}
function validateSnapshot(snapshot: ProviderSupportSnapshot | ProviderDecisionSnapshot): void {
  const original = snapshots.get(snapshot);
  if (original === undefined || original !== fingerprint(snapshot)) fail("external-binding-stale-snapshot", "External snapshot was not captured by this operation or its content changed.");
  for (const [path, expected] of Object.entries(snapshot.provenance.sourceHashes)) {
    let actual: string;
    try { actual = hash(readFileSync(path)); } catch { return fail("external-binding-stale-source", `Pinned provider source is unavailable: ${path}.`); }
    if (actual !== expected) fail("external-binding-stale-source", `Pinned provider source changed: ${path}.`);
  }
}
export function createExternalBindings(input: { publications?: readonly ExternalPublicationBinding[]; decisions?: readonly ExternalDecisionBinding[] }): ExternalBindingsV1 {
  return Object.freeze({ version: 1, publications: Object.freeze([...(input.publications ?? [])]), decisions: Object.freeze([...(input.decisions ?? [])]) });
}
function validatePath(path: string): void {
  if (!path || path.includes("\\") || path.startsWith("/") || path.split("/").some(x => x === ".." || x === ".") || /^[A-Za-z]:/.test(path))
    fail("external-binding-unsafe-path", `Unsafe emitted path: ${path}.`);
}
/** Checked union PRECEDES ordinary collision invariants. Never silently choose conflicting bytes. */
export function checkedArtifactUnion(parts: readonly SupportSubset[]): SupportSubset {
  const resources: Captured<EmittedResource>[] = [];
  const indexes = [new Map<string, number>(), new Map<string, number>(), new Map<string, number>()];
  for (const part of parts) for (const item of part.resources) {
    const r = item.value; validatePath(r.relativePath);
    if (r.resource.resourceType !== r.resourceType || typeof r.resource.id !== "string" || r.relativePath !== `${r.resourceType}/${r.resource.id}.json`)
      fail("external-binding-resource-identity", `Inconsistent emitted resource identity/path: ${r.relativePath}.`);
    const keys = [r.relativePath, `${r.resourceType}/${r.resource.id}`, typeof r.resource.url === "string" ? r.resource.url : ""];
    const matches = keys.flatMap((key, i) => key && indexes[i].has(key) ? [indexes[i].get(key)!] : []);
    if (new Set(matches).size > 1) fail("external-binding-resource-conflict", `Resource conflict across path/identity/canonical: ${r.relativePath}.`);
    const found = matches[0];
    if (found !== undefined) {
      const old = resources[found];
      if (old.value.relativePath !== r.relativePath || structural(old.value.resource) !== structural(r.resource)) fail("external-binding-resource-conflict", `Resource content conflict: ${r.relativePath}.`);
      resources[found] = { value: old.value, origins: [...old.origins, ...item.origins] };
    } else { const i = resources.length; resources.push({ value: r, origins: [...item.origins] }); keys.forEach((key, j) => { if (key) indexes[j].set(key, i); }); }
  }
  const cql: Captured<PerLibraryEmit>[] = [];
  const names = new Map<string, number>(), files = new Map<string, number>();
  for (const part of parts) for (const item of part.cql) {
    const v = item.value; validatePath(v.outputFilename);
    if (v.outputFilename.includes("/") || !v.outputFilename.endsWith(".cql")) fail("external-binding-unsafe-path", `Unsafe CQL filename: ${v.outputFilename}.`);
    const byName = names.get(v.libraryName), byFile = files.get(v.outputFilename);
    if (byName !== undefined && byFile !== undefined && byName !== byFile) fail("external-binding-cql-conflict", `CQL identity/path conflict: ${v.libraryName}.`);
    const found = byName ?? byFile;
    if (found !== undefined) {
      const old = cql[found];
      if (old.value.libraryName !== v.libraryName || old.value.outputFilename !== v.outputFilename || old.value.cql !== v.cql)
        fail("external-binding-cql-conflict", `CQL byte conflict: ${v.libraryName}/${v.outputFilename}.`);
      cql[found] = { value: old.value, origins: [...old.origins, ...item.origins] };
    } else { const i = cql.length; cql.push({ value: v, origins: [...item.origins] }); names.set(v.libraryName, i); files.set(v.outputFilename, i); }
  }
  for (const { value: r } of resources) if (r.resourceType === "Library") {
    const entry = cql.find(c => c.value.libraryName === r.resource.name)?.value;
    if (!entry) fail("external-binding-missing-cql", `No CQL file for ${r.relativePath}.`);
    const attachments = r.resource.content as { contentType?: string; url?: string; data?: string }[] | undefined;
    const cqlAttachments = attachments?.filter(a => a.contentType === "text/cql") ?? [];
    if (cqlAttachments.length !== 1) fail("external-binding-cql-attachment", `Expected one CQL attachment: ${r.relativePath}.`);
    const attachment = cqlAttachments[0];
    if (attachment.data !== undefined && !Buffer.from(attachment.data, "base64").equals(Buffer.from(entry.cql, "utf8"))) fail("external-binding-cql-conflict", `CQL attachment bytes conflict: ${r.relativePath}.`);
    if (attachment.url !== undefined && attachment.url !== `../../cql/${entry.outputFilename}`) fail("external-binding-cql-attachment", `Wrong CQL content URL: ${r.relativePath}.`);
  }
  return { resources, cql };
}
function prepareCapture(entryPath: string, opts: EmitCrlTwoLaneOptions, selected?: { library: string; concept: string }) {
  if (opts.sourceOverlays?.size) fail("external-binding-overlay-snapshot", "Capture requires original on-disk provider sources, not overlays.");
  const graph = resolveImports(entryPath);
  if (!graph.packageSnapshot) fail("external-binding-provider-metadata", "Provider metadata is unavailable.");
  const normalized = normalizeEmissionMetadata(graph.packageSnapshot);
  if (!normalized.fhir.metadata) fail("external-binding-provider-metadata", "Provider metadata is invalid.");
  const originalSources = computeFhirEmitClosure(graph);
  const original = preparePublicationContext(graph, { canonicalBase: normalized.fhir.metadata.canonicalBase, policyId: normalized.fhir.metadata.name,
    ...(opts.externalBindings ? { externalBindings: opts.externalBindings } : {}) });
  const prepared = selected ? closedSupportView(original, selected) : original;
  const selectedDescriptor = selected && prepared.publications.descriptors.find(d => d.identity.libraryName === selected.library && d.identity.conceptName === selected.concept);
  const requiredPublications = selectedDescriptor ? supportPublicationProfiles(original, selectedDescriptor) : [];
  // Pin the exact source bytes that produced the retained original context, before emission.
  const originalHashes: Record<string, string> = {};
  for (const entry of originalSources) {
    const bytes = readFileSync(entry.filePath);
    const parsed = buildCRL(bytes.toString("utf8"));
    if (!parsed.success || structural(parsed.result) !== structural(entry.ast)) fail("external-binding-stale-source", `Source changed during provider preparation: ${entry.filePath}.`);
    originalHashes[entry.filePath] = hash(bytes);
  }
  if (graph.projectRoot) {
    const path = join(graph.projectRoot, "package.json"), bytes = readFileSync(path);
    if (structural(JSON.parse(bytes.toString("utf8"))) !== structural(graph.packageSnapshot.raw)) fail("external-binding-stale-source", "Metadata changed during provider preparation.");
    originalHashes[path] = hash(bytes);
  }
  const result = definitionLanesResult(emitDefinitionLanesFromPrepared(prepared, opts, requiredPublications));
  if (!result.success) fail("external-binding-provider-emission", `Provider definition emission failed: ${JSON.stringify(result.hardErrors)}.`);
  for (const [path, digest] of Object.entries(originalHashes)) if (hash(readFileSync(path)) !== digest) fail("external-binding-stale-source", `Source changed during provider emission: ${path}.`);
  const sourceHashes: Record<string, string> = {};
  for (const origin of result.externalAssembly?.provenance ?? []) for (const [path, digest] of Object.entries(origin.sourceHashes)) {
    if (sourceHashes[path] !== undefined && sourceHashes[path] !== digest) fail("external-binding-stale-source", "Conflicting transitive source pins.");
    sourceHashes[path] = digest;
  }
  for (const [path, digest] of Object.entries(originalHashes)) {
    if (sourceHashes[path] !== undefined && sourceHashes[path] !== digest) fail("external-binding-stale-source", "Consumer preparation disagrees with a transitive provider pin.");
    sourceHashes[path] = digest;
  }
  const provenance: SnapshotProvenance = { snapshotId: hash(structural({ sourceHashes, resources: result.fhir.resources.map(r => r.resource), cql: result.cqlLibraries })),
    entrySourceIdentity: graph.rootPath, sourceHashes, metadataHash: hash(structural(graph.packageSnapshot)),
    emitOptionsHash: hash(structural({ date: opts.date, capability: opts.capability })),
    compilationRoles: result.cql.cqlByLibrary.map(e => ({ source: e.filePath, physicalLibrary: e.libraryName, role: e.role, layer: e.layer })) };
  const assembled = result.externalAssembly?.inventory;
  const support: SupportSubset = {
    resources: result.fhir.resources.map(value => ({ value, origins: [
      ...(assembled?.resources.find(item => item.value.relativePath === value.relativePath)?.origins ?? []), provenance] })),
    cql: result.cql.cqlByLibrary.map(value => ({ value, origins: [
      ...(assembled?.cql.find(item => item.value.libraryName === value.libraryName)?.origins ?? []), provenance] })),
  };
  return { result, graph, prepared, provenance, support, canonicalBases: [...new Set([normalized.fhir.metadata.canonicalBase, ...(result.externalAssembly?.canonicalBases ?? [])])] };
}
/** Match ordinary definition/question traversal, including authored presentation-only members. */
function supportPublicationProfiles(original: PreparedPublicationContext, selected: PublicationDescriptor): PublicationDescriptor[] {
  const definitions = new Map(publicationCaseFeatures(original.publications, selected.identity.sourceIdentity, selected.title, "definitions").map(d => [d.identity.key, d]));
  for (const question of publicationCaseFeatures(original.publications, selected.identity.sourceIdentity, selected.title, "questions")) {
    const owner = original.declarations.getLibrary(question.identity.sourceIdentity);
    if (!owner) fail("external-binding-support-missing", "Question presentation owner is unavailable.");
    const catalog = createPresentationCatalog(owner.ast, owner.sourceIdentity);
    const group = catalog.groupFor(question.title);
    for (const name of group?.members ?? []) for (const dependency of publicationCaseFeatures(original.publications, owner.sourceIdentity, name, "definitions")) definitions.set(dependency.identity.key, dependency);
  }
  return [...definitions.values()];
}
/** Source-scoped dependencies over the original admitted graph; no root or ownership remapping. */
function closedSupportView(original: PreparedPublicationContext, selected: { library: string; concept: string }): PreparedPublicationContext {
  const candidates = original.publications.descriptors.filter(d => d.identity.libraryName === selected.library && d.identity.conceptName === selected.concept);
  if (candidates.length !== 1) fail("external-binding-export-ambiguous", "Exactly one selected provider publication is required.");
  const descriptor = candidates[0];
  if (descriptor.resourceType !== "Observation" || descriptor.valueType !== "boolean") fail("external-binding-export-type", "External export must be a selected Boolean Observation.");
  const admitted = new Map(original.rawFhirClosure.map(e => [e.filePath, e]));
  const graph = original.graph;
  const scopes = buildLibraryScopes([...original.rawFhirClosure], graph.localLibraries, graph.registry ?? { byNameLocal: new Map(), byNamePackage: new Map() });
  const paths = new Set<string>();
  const visit = (path: string): void => {
    if (paths.has(path)) return;
    const entry = admitted.get(path), scope = scopes.get(path);
    if (!entry || !scope) fail("external-binding-support-missing", `Support source is outside the original prepared closure: ${path}.`);
    if (entry.ast.statements.some(s => s.type === "Decision" || s.type === "Activity")) fail("external-binding-support-mixed-source", "Support export depends on a decision/activity-bearing source.");
    paths.add(path);
    for (const name of collectFhirDefEmitRefs(entry, scope)) {
      if (entry.ast.includes.some(i => i.alias === name)) fail("external-binding-support-missing", `Unsupported include alias ${name}.`);
      const target = lookupKnownLibrary(scope, name);
      if (!target || (target.origin === "package" && !scope.explicitIncludes.has(name))) fail("external-binding-support-missing", `Support dependency is not visible in its original source: ${name}.`);
      visit(target.filePath);
    }
  };
  visit(descriptor.identity.sourceIdentity);
  return Object.freeze({ ...original,
    rawCqlClosure: Object.freeze(original.rawCqlClosure.filter(e => paths.has(e.filePath))),
    rawFhirClosure: Object.freeze(original.rawFhirClosure.filter(e => paths.has(e.filePath))),
  });
}
/** In-memory definition-only emit in ORIGINAL entry context; never translates or delivers its stub. */
export function captureExternalSupport(entryPath: string, selected: { library: string; concept: string }, opts: EmitCrlTwoLaneOptions = {}): ProviderSupportSnapshot {
  if (opts.externalBindings) fail("external-binding-support-context", "Initial helper capture must use its original compilation context without external replacements.");
  const capture = prepareCapture(entryPath, opts, selected);
  const candidates = capture.prepared.publications.descriptors.filter(d => d.identity.libraryName === selected.library && d.identity.conceptName === selected.concept);
  if (candidates.length !== 1) fail("external-binding-export-ambiguous", "Exactly one selected provider publication is required.");
  const descriptor = candidates[0];
  if (descriptor.resourceType !== "Observation" || descriptor.valueType !== "boolean") fail("external-binding-export-type", "External export must be a selected Boolean Observation.");
  const target = capture.result.cql.publicationTargets?.get(descriptor.identity.key);
  const entry = target && capture.result.cql.cqlByLibrary.find(e => e.libraryName === target.libraryName);
  if (!target || !entry || !entry.ledgerEntries?.some(e => e.name === target.define && e.visibility !== "impl" && e.result?.shape === "Record" && e.result.resourceType === "Observation")) fail("external-binding-export-missing", "The actual public emitted Library/define is missing.");
  const selectedNames = new Set<string>([target.libraryName]);
  const selectedPaths = new Set<string>([descriptor.identity.sourceIdentity]);
  const resourceUrls = new Set<string>();
  const selectedResources = new Set<EmittedResource>();
  const allCql = new Map(capture.result.cql.cqlByLibrary.map(e => [e.libraryName, e]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const name of [...selectedNames]) {
      const cql = allCql.get(name);
      if (!cql) { if (name !== "FHIRHelpers") fail("external-binding-support-missing", `Missing support Library ${name}.`); continue; }
      if (!selectedPaths.has(cql.filePath)) { selectedPaths.add(cql.filePath); changed = true; }
      // Whole physical libraries are immutable; all their source-owned support travels with them.
      for (const sibling of allCql.values()) if (sibling.filePath === cql.filePath && !selectedNames.has(sibling.libraryName)) { selectedNames.add(sibling.libraryName); changed = true; }
      for (const included of cqlIncludeNames(cql.cql)) if (included !== "FHIRHelpers" && !selectedNames.has(included)) { selectedNames.add(included); changed = true; }
    }
    for (const r of capture.result.fhir.resources) {
      const belongs = r.resourceType === "Library" ? selectedNames.has(String(r.resource.name))
        : selectedPaths.has(capture.prepared.declarations.getLibraries().find(l => l.libraryName === r.sourceLibraryName)?.sourceIdentity ?? "") || resourceUrls.has(String(r.resource.url));
      if (!belongs || selectedResources.has(r)) continue;
      if (r.resourceType === "PlanDefinition" || r.resourceType === "ActivityDefinition") fail("external-binding-support-not-closed", "Helper support reaches an activity/decision; a closed support-only export is required.");
      selectedResources.add(r); changed = true;
      for (const ref of ownedReferences(r.resource)) {
        const dependency = capture.result.fhir.resources.find(x => x.resource.url === ref);
        if (dependency) { resourceUrls.add(ref); if (dependency.resourceType === "Library") selectedNames.add(String(dependency.resource.name)); }
        else if (capture.canonicalBases.some(base => underBase(ref, base))) fail("external-binding-support-missing", `Missing owned support dependency ${ref}.`);
      }
    }
  }
  for (const p of selectedPaths) {
    const owner = capture.prepared.declarations.getLibrary(p);
    if (owner?.ast.statements.some(s => ["Decision", "Activity"].includes(s.type))) fail("external-binding-support-mixed-source", "Support export depends on a decision/activity-bearing source.");
  }
  const support = checkedArtifactUnion([{ resources: capture.support.resources.filter(x => selectedResources.has(x.value)), cql: capture.support.cql.filter(x => selectedNames.has(x.value.libraryName)) }]);
  const library = support.resources.find(x => x.value.resourceType === "Library" && x.value.resource.name === target.libraryName)!;
  if (!library) fail("external-binding-export-missing", "Selected public Library is absent from support inventory.");
  const snapshot: ProviderSupportSnapshot = { version: 1, kind: "support", provenance: capture.provenance, prepared: capture.prepared,
    selected: { descriptor, target, canonical: String(library.value.resource.url) },
    publicationTargets: [...(capture.result.cql.publicationTargets ?? new Map()).entries()]
      .filter(([identity]) => capture.prepared.publications.get(identity) !== undefined &&
        support.cql.some(c => c.value.filePath === capture.prepared.publications.get(identity)!.identity.sourceIdentity)),
    support, canonicalBases: capture.canonicalBases };
  assertCapturedClosure(support, capture.canonicalBases);
  snapshots.set(snapshot, fingerprint(snapshot)); return snapshot;
}
export function captureExternalDecision(entryPath: string, selected: { library: string; decision: string }, opts: EmitCrlTwoLaneOptions = {}): ProviderDecisionSnapshot {
  const capture = prepareCapture(entryPath, opts);
  const candidates = capture.result.fhir.resources.filter(r => r.sourceKind === "Decision" && r.sourceLibraryName === selected.library && r.sourceDecision?.name === selected.decision);
  if (candidates.length !== 1 || typeof candidates[0].resource.url !== "string") fail("external-binding-decision-missing", "Exactly one actual emitted decision target is required.");
  const support = checkedArtifactUnion([capture.support]);
  assertCapturedClosure(support, capture.canonicalBases);
  const snapshot: ProviderDecisionSnapshot = { version: 1, kind: "decision", provenance: capture.provenance, canonical: candidates[0].resource.url as string,
    library: selected.library, decision: selected.decision, support, canonicalBases: capture.canonicalBases };
  snapshots.set(snapshot, fingerprint(snapshot)); return snapshot;
}
/** Compiler-emitted include headers include implicit catalog dependencies. */
export function cqlIncludeNames(cql: string): string[] {
  return [...cql.matchAll(/^\s*include\s+(?:"((?:\\.|[^"\\])*)"|([A-Za-z_][A-Za-z_0-9]*(?:\.[A-Za-z_][A-Za-z_0-9]*)*))(?:\s|$)/gm)]
    .map(m => (m[1] ?? m[2]).replace(/\\(["\\])/g, "$1"))
    .map(name => name === "hl7.fhir.uv.cql.FHIRHelpers" ? "FHIRHelpers" : name);
}
export function assertCapturedClosure(support: SupportSubset, bases: readonly string[]): void {
  const urls = new Set(support.resources.flatMap(r => typeof r.value.resource.url === "string" ? [r.value.resource.url] : []));
  const names = new Set(support.cql.map(c => c.value.libraryName));
  for (const item of support.cql) {
    const header = item.value.cql.match(/^\s*library\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z_0-9]*))(?:\s|$)/m);
    if ((header?.[1] ?? header?.[2]) !== item.value.libraryName) fail("external-binding-library-identity", "Physical CQL header does not match its manifest identity.");
    for (const name of cqlIncludeNames(item.value.cql)) if (name !== "FHIRHelpers" && !names.has(name))
      fail("external-binding-support-missing", "Missing actual CQL include " + name + ".");
  }
  for (const item of support.resources) for (const ref of ownedReferences(item.value.resource)) {
    if (bases.some(base => underBase(ref, base)) && !urls.has(ref))
      fail("external-binding-support-missing", "Missing owned definition dependency " + ref + ".");
  }
}
export function underBase(url: string, base: string): boolean { return url.startsWith(base.replace(/\/$/, "") + "/"); }
/** Only typed reference slots; narrative strings/extension URLs are not artifact dependencies. */
export function ownedReferences(resource: Record<string, unknown>): string[] {
  const result = new Set<string>();
  const keys = new Set(["reference", "system", "valueSet", "profile", "baseDefinition", "library", "resource", "definitionCanonical"]);
  const visit = (v: unknown, key = "") => {
    if (typeof v === "string") { if (keys.has(key)) result.add(v); return; }
    if (Array.isArray(v)) { v.forEach(x => visit(x, key)); return; }
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) visit(x, k);
  };
  visit(resource); return [...result];
}
export interface ResolvedExternalBindings {
  readonly excludedSources: ReadonlySet<string>;
  readonly visibleSources: ReadonlyMap<string, ReadonlySet<string>>;
  readonly borrowedIdentityKeys: ReadonlySet<string>;
  readonly publications: PublicationProgram;
  readonly support: SupportSubset;
  readonly targets: ReadonlyMap<string, { libraryName: string; define: string }>;
  readonly canonicalByLibrary: ReadonlyMap<string, string>;
  readonly canonicalBases: readonly string[];
  readonly provenance: readonly SnapshotProvenance[];
  decision(source: string, ref: ReferenceName): string | undefined;
}
const key = (source: string, lib: string, name: string) => JSON.stringify([source, lib, name]);
export function bindExternalPublications(graph: ResolvedGraph, declarations: PublicationContext, original: PublicationProgram, bindings: ExternalBindingsV1): ResolvedExternalBindings {
  if (bindings.version !== 1) fail("external-binding-version", "Unsupported external binding version.");
  const allSources = [...new Map([...graph.resolvedLibraries, ...graph.localLibraries, ...[...(graph.registry?.byNamePackage.values() ?? [])]].map(e => [e.filePath, e])).values()];
  const scopes = buildLibraryScopes(allSources, graph.localLibraries, graph.registry ?? { byNameLocal: new Map(), byNamePackage: new Map() });
  const pub = new Map<string, { provider: ProviderSupportSnapshot; hit: PublicationConceptLookup }>();
  const decisions = new Map<string, string>();
  const excludedSources = new Set<string>();
  const visibleSources = new Map<string, Set<string>>();
  const providers = [...new Set([...bindings.publications.map(b => b.provider), ...bindings.decisions.map(b => b.provider)])];
  for (const provider of providers) validateSnapshot(provider);
  const exclude = (source: string) => {
    if (source === graph.rootPath) fail("external-binding-root-replacement", "Cannot replace the current source entry.");
    excludedSources.add(source);
  };
  for (const b of bindings.publications) {
    const source = resolve(b.consumerSource), owner = declarations.getLibrary(source);
    if (!owner) fail("external-binding-reference", "Consumer source is outside the prepared closure.");
    const ref = { type: "QualifiedReference" as const, libraryName: b.reference.library, name: b.reference.concept, location: owner.ast.location };
    const hit = declarations.lookupConcept(source, ref);
    if (hit.kind !== "hit") fail("external-binding-reference", `Consumer publication reference does not resolve uniquely: ${b.reference.library}.${b.reference.concept}.`);
    const placeholder = original.lookup(source, ref);
    if (placeholder.kind !== "publication" || placeholder.descriptor.resourceType !== "Observation" || placeholder.descriptor.valueType !== "boolean")
      fail("external-binding-placeholder-type", "The consumer placeholder must declare a selected Boolean Observation.");
    const k = key(source, b.reference.library, b.reference.concept);
    if (pub.has(k)) fail("external-binding-ambiguous", "More than one binding for the same consumer reference.");
    const actual = b.provider.prepared.declarations.lookupConcept(b.provider.selected.descriptor.identity.sourceIdentity, b.provider.selected.descriptor.title);
    if (actual.kind !== "hit") fail("external-binding-export-missing", "Provider declaration is missing.");
    pub.set(k, { provider: b.provider, hit: actual }); exclude(hit.identity.sourceIdentity);
    const visible = visibleSources.get(source) ?? new Set<string>();
    visible.add(b.provider.selected.descriptor.identity.sourceIdentity); visibleSources.set(source, visible);
  }
  for (const b of bindings.decisions) {
    const source = resolve(b.consumerSource), scope = scopes.get(source), target = scope && lookupKnownLibrary(scope, b.reference.library);
    const targetSource = target && allSources.find(e => e.filePath === target.filePath);
    if (!declarations.getLibrary(source) || !target || !targetSource ||
        (target.origin === "package" && !scope!.explicitIncludes.has(b.reference.library)) ||
        targetSource.ast.statements.filter(s => s.type === "Decision" && s.name === b.reference.decision).length !== 1)
      fail("external-binding-reference", "External decision reference does not resolve uniquely in its original scope.");
    const k = key(source, b.reference.library, b.reference.decision);
    if (decisions.has(k)) fail("external-binding-ambiguous", "More than one binding for the same decision reference.");
    decisions.set(k, b.provider.canonical); exclude(target.filePath);
  }
  // Validate all uses BEFORE removing a source. A producer must never reach a private envelope.
  const activeSources = computeFhirEmitClosure(graph, excludedSources);
  const seenPublications = new Set<string>(), seenDecisions = new Set<string>();
  for (const entry of activeSources) {
    const visit = (v: unknown, context: string, parentType = "") => {
      if (Array.isArray(v)) { v.forEach(x => visit(x, context, parentType)); return; }
      if (!v || typeof v !== "object") return;
      const node = v as Record<string, unknown>;
      if (node.type === "QualifiedReference") {
        const ref = v as Extract<ReferenceName, object>, scope = scopes.get(entry.filePath), target = scope && lookupKnownLibrary(scope, ref.libraryName);
        if (!target || !excludedSources.has(target.filePath)) return;
        const k = key(entry.filePath, ref.libraryName, ref.name);
        if (context === "Concept") fail("external-binding-producer-unsupported", "An external publication cannot be used by a producer/private-envelope consumer in prototype v1.");
        if (parentType === "UseDecision" && decisions.has(k)) { seenDecisions.add(k); return; }
        if (["BranchConditionRef", "ActionGuard"].includes(parentType) && pub.has(k) && ["Decision", "Criterion"].includes(context)) { seenPublications.add(k); return; }
        fail("external-binding-mixed-source", `Unsupported or unbound use of replaced source ${ref.libraryName}.${ref.name}.`);
      }
      for (const [k, child] of Object.entries(node)) if (!k.startsWith("__")) visit(child, context, String(node.type ?? parentType));
    };
    for (const stmt of entry.ast.statements) visit(stmt, stmt.type);
  }
  if ([...pub.keys()].some(k => !seenPublications.has(k)) || [...decisions.keys()].some(k => !seenDecisions.has(k)))
    fail("external-binding-unused-binding", "A declared external binding is not consumed by the active source closure.");
  const support = checkedArtifactUnion(providers.map(p => p.support));
  assertCapturedClosure(support, [...new Set(providers.flatMap(p => p.canonicalBases))]);
  const borrowed = bindings.publications.map(b => b.provider);
  const originalPrograms = [...new Set(borrowed.map(p => p.prepared.publications))];
  const declarationFor = (source: string) => originalPrograms.find(p => p.declarations.getLibrary(source))?.declarations ?? declarations;
  const resolvedDeclarations: PublicationContext = {
    getLibrary: source => declarationFor(source).getLibrary(source),
    getLibraries: () => [...new Map([...declarations.getLibraries().filter(l => !excludedSources.has(l.sourceIdentity)), ...originalPrograms.flatMap(p => p.declarations.getLibraries().filter(l => support.cql.some(c => c.value.filePath === l.sourceIdentity)))].map(l => [l.sourceIdentity, l])).values()],
    lookupConcept(source, ref, location) { const hit = typeof ref === "string" ? undefined : pub.get(key(source, ref.libraryName, ref.name)); return hit?.hit ?? declarationFor(source).lookupConcept(source, ref, location); },
    lookupTerminology: (source, ref, location) => declarationFor(source).lookupTerminology(source, ref, location),
  };
  const importedDescriptors = originalPrograms.flatMap(p => p.descriptors.filter(d => support.cql.some(c => c.value.filePath === d.identity.sourceIdentity)));
  const descriptors = [...new Map([...original.descriptors.filter(d => !excludedSources.has(d.identity.sourceIdentity)), ...importedDescriptors].map(d => [d.identity.key, d])).values()];
  const byIdentity = new Map(descriptors.map(d => [d.identity.key, d]));
  const publications: PublicationProgram = {
    declarations: resolvedDeclarations, descriptors,
    diagnostics: original.diagnostics, warnings: original.warnings,
    get: k => byIdentity.get(k),
    lookup(source, ref, location) {
      const hit = resolvedDeclarations.lookupConcept(source, ref, location);
      if (hit.kind === "hit" && byIdentity.has(hit.identity.key)) return { kind: "publication", descriptor: byIdentity.get(hit.identity.key)! };
      return (originalPrograms.find(p => p.declarations.getLibrary(source)) ?? original).lookup(source, ref, location);
    },
  };
  const targets = new Map<string, { libraryName: string; define: string }>();
  for (const p of borrowed) for (const [identity, target] of p.publicationTargets) {
    const previous = targets.get(identity);
    if (previous && structural(previous) !== structural(target)) fail("external-binding-export-conflict", "Conflicting physical targets for one publication identity.");
    if (!support.cql.some(c => c.value.libraryName === target.libraryName)) fail("external-binding-export-missing", "Captured publication target is outside the support subset.");
    targets.set(identity, target);
  }
  const canonicalByLibrary = new Map(support.resources.filter(r => r.value.resourceType === "Library").map(r => [String(r.value.resource.name), String(r.value.resource.url)]));
  return { excludedSources, visibleSources, borrowedIdentityKeys: new Set(importedDescriptors.map(d => d.identity.key)), publications, support, targets, canonicalByLibrary,
    canonicalBases: [...new Set(providers.flatMap(p => p.canonicalBases))], provenance: [...new Map(providers.flatMap(p => [p.provenance, ...p.support.resources.flatMap(r => r.origins), ...p.support.cql.flatMap(c => c.origins)]).map(p => [p.snapshotId, p])).values()],
    decision(source, ref) { const lib = getRefLibrary(ref); return lib === null ? undefined : decisions.get(key(source, lib, getRefName(ref))); } };
}
