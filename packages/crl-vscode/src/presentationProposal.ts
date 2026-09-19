// REFACTOR:grounded: MV proposes wording; the CRL owner applies and re-emits it.
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, renameSync, unlinkSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, isAbsolute } from "node:path";
import { buildCRL, type PresentationContext, resolveCelImports } from "@smile-digital-health/crl";

import { resolvePresentationTarget, planPresentationEdit } from "@smile-digital-health/crl/language-services";

type Ast = NonNullable<ReturnType<typeof buildCRL>["result"]>;
type Declaration = NonNullable<Ast["presentations"]>[number];
export interface WordingTarget {
  editable?: boolean;
  readOnlyReason?: string;
  filePath: string;
  library: string;
  concept: string;
  baseline: string;
  questionText: string;
  questionDescription: string;
  scopeLabel: string;
  context?: { decision: string; criteria: string[] };
  owners: { questionText?: Declaration; questionDescription?: Declaration };
}

export function resolveWordingTarget(filePath: string, source: string, concept: string, context?: PresentationContext): WordingTarget | undefined {
  try { const target=resolvePresentationTarget(source,concept,context); return target ? {...target,filePath} : undefined; }
  catch { return undefined; }
}

/** Resolve display owners from the same include closure used for evaluation, including packages. */
export function graphWordingSources(graph: ReturnType<typeof resolveCelImports>) {
  const sources = new Map<string, { filePath: string; source: string; packaged: boolean }>();
  const ambiguous = new Set<string>();
  const entries = [...[...(graph.crlRegistry?.byNameLocal.values() ?? [])].map(entry=>({entry,packaged:false})), ...[...(graph.crlRegistry?.byNamePackage.values() ?? [])].map(entry=>({entry,packaged:true}))];
  for (const {entry,packaged} of entries) {
    if (!graph.resolvedLibraryPaths?.has(entry.filePath)) continue;
    const name = entry.ast.library.name;
    if (sources.has(name) && sources.get(name)!.filePath !== entry.filePath) { ambiguous.add(name); continue; }
    sources.set(name, { filePath: entry.filePath, source: readFileSync(entry.filePath, "utf8"), packaged });
  }
  for (const name of ambiguous) sources.delete(name);
  return sources;
}

/** Package provenance governs editing even when node_modules is inside the policy directory. */
export function resolveSourceWordingTarget(source: {filePath:string; source:string; packaged:boolean}, concept: string, context?: PresentationContext): WordingTarget | undefined {
  const target=resolveWordingTarget(source.filePath, source.source, concept, context);
  return target && source.packaged ? {...target, editable:false, readOnlyReason: target.readOnlyReason ?? "Wording belongs to an imported library. Its CRL owner must propose the change."} : target;
}

/** Immutable proposal, with field-level ownership and exact baseline for the owning KE. */
export function createPresentationProposal(target: WordingTarget, questionText: string, questionDescription: string, policySrc: string,
  evidence: { caseId: string; routeId: string; unsavedBaseline: boolean }) {
  if (target.editable === false) throw new Error(target.readOnlyReason ?? "This question is read-only in this workspace.");
  if (!questionText.trim()) throw new Error("Question text is required.");
  if (questionText.length > 8000 || questionDescription.length > 16000) throw new Error("Presentation wording exceeds the editing limit.");
  const sourcePath = relative(dirname(policySrc), target.filePath).replace(/\\/g, "/");
  if (isAbsolute(sourcePath) || sourcePath === ".." || sourcePath.startsWith("../")) throw new Error("The owning CRL is outside this policy; propose that change in its owning workspace.");
  const plan=planPresentationEdit(target.baseline,{library:target.library,concept:target.concept,
    ...(target.context ? {context:target.context} : {}),questionText,questionDescription});
  const fields=plan.fields, proposedSource=plan.candidateSource;
  return { schemaVersion: 1, kind: "crl-presentation-patch", status: "proposed", id: randomUUID(), created: new Date().toISOString(),
    ownerScope: "crl", proposalScope: "medical-validation", target: { file: sourcePath, library: target.library, concept: target.concept },
    baseline: { sha256: plan.beforeSha256, content: target.baseline, unsaved: evidence.unsavedBaseline },
    evidence, fields, proposedSource, validation: "CRL parse and owning-library presentation checks passed; owning KE must run full emit and results validation after application.",
    application: "Owning KE: check the baseline and competing proposals; apply the targeted presentation edits in CRL scope, then emit CRL and regenerate CQL/FHIR results. This proposal has not changed CRL or deployed resources." };
}

/** New file per proposal: simultaneous/repeated proposals never overwrite another reviewer's work. */
export function savePresentationProposal(policySrc: string, proposal: ReturnType<typeof createPresentationProposal>): string {
  const dir = join(policySrc, "medical-validation", "crl-patches");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${proposal.id}.crl.patch.json`);
  const temporary = join(dir, `.${proposal.id}.${randomUUID()}.tmp`);
  if (existsSync(path)) throw new Error("This proposal already exists.");
  try {
    writeFileSync(temporary, JSON.stringify(proposal, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    renameSync(temporary, path); // per-proposal UUID, atomic publication on the same volume
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  return path;
}

/** Pending, malformed and unknown-status records cannot silently certify MV completion. */
export function pendingPresentationProposals(policySrc: string): { pending: number; unreadable: number } {
  const dir = join(policySrc, "medical-validation", "crl-patches");
  let pending = 0, unreadable = 0;
  if (!existsSync(dir)) return { pending, unreadable };
  try { for (const file of readdirSync(dir).filter(f => f.endsWith(".crl.patch.json"))) {
    try {
      const p = JSON.parse(readFileSync(join(dir,file),"utf8"));
      if (p.schemaVersion !== 1 || p.kind !== "crl-presentation-patch" || file !== `${p.id}.crl.patch.json`) { unreadable++; continue; }
      if (!["applied", "rejected", "withdrawn", "superseded"].includes(p.status)) pending++;
    } catch { unreadable++; }
  } } catch { unreadable++; }
  return { pending, unreadable };
}
