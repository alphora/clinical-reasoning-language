// REFACTOR:grounded: MV proposes wording; the CRL owner applies and re-emits it.
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, renameSync, unlinkSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, isAbsolute } from "node:path";
import { buildCRL, createPresentationCatalog, type PresentationContext, resolveCelImports } from "@smile-digital-health/crl";

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

/** The parser currently preserves literal text; JavaScript escaping would change wording. */
function crlString(value: string): string {
  if (/[`\\]/.test(value)) throw new Error("Backticks and backslashes cannot be represented faithfully in presentation wording yet.");
  return /["\r\n]/.test(value) ? "`" + value + "`" : '"' + value + '"';
}
function refText(ref: Declaration["target"]): string {
  return typeof ref === "string" ? crlString(ref) : crlString(ref.libraryName) + "." + crlString(ref.name);
}
function declarationText(p: Declaration, eol: string) {
  return [`presentation for ${refText(p.target)}:`, ...p.contexts.map(c => `- in ${c.kind} ${refText(c.ref)}.`),
    `- question text is ${crlString(p.questionText!)}.`, ...(p.questionDescription ? [`- question description is ${crlString(p.questionDescription)}.`] : [])].join(eol);
}

export function resolveWordingTarget(filePath: string, source: string, concept: string, context?: PresentationContext): WordingTarget | undefined {
  const parsed = buildCRL(source);
  if (!parsed.success || !parsed.result) return undefined;
  const ast = parsed.result;
  if (!ast.statements.some(s => s.type === "Concept" && s.name === concept && s.code)) return undefined;
  const catalog = createPresentationCatalog(ast, filePath), resolved = catalog.resolveOccurrence(concept, context);
  if ([...catalog.diagnostics, ...resolved.diagnostics].some(d => d.severity === "error")) return undefined;
  const scopes = [resolved.fieldOwners.questionText, resolved.fieldOwners.questionDescription].filter((p): p is Declaration => !!p);
  const scopeLabel = [...new Set(scopes.map(p => p.contexts.length ? p.contexts.map(c => `${c.kind} ${JSON.stringify(c.ref)}`).join(", ") : "all uses in this library"))].join("; ") || "new default for all uses in this library";
  return { filePath, library: ast.library.name, concept, baseline: source,
    questionText: resolved.wording.questionText ?? concept, questionDescription: resolved.wording.questionDescription ?? "",
    scopeLabel, owners: { ...resolved.fieldOwners, questionDescription: resolved.fieldOwners.questionDescription?.questionDescription !== undefined ? resolved.fieldOwners.questionDescription : resolved.declaration },
    ...(context ? { context: { decision: context.decision, criteria: [...context.criteria] } } : {}) };
}

/** Resolve display owners from the same include closure used for evaluation, including packages. */
export function graphWordingSources(graph: ReturnType<typeof resolveCelImports>) {
  const sources = new Map<string, { filePath: string; source: string }>();
  const ambiguous = new Set<string>();
  const entries = [...(graph.crlRegistry?.byNameLocal.values() ?? []), ...(graph.crlRegistry?.byNamePackage.values() ?? [])];
  for (const entry of entries) {
    if (!graph.resolvedLibraryPaths?.has(entry.filePath)) continue;
    const name = entry.ast.library.name;
    if (sources.has(name) && sources.get(name)!.filePath !== entry.filePath) { ambiguous.add(name); continue; }
    sources.set(name, { filePath: entry.filePath, source: readFileSync(entry.filePath, "utf8") });
  }
  for (const name of ambiguous) sources.delete(name);
  return sources;
}

/** Immutable proposal, with field-level ownership and exact baseline for the owning KE. */
export function createPresentationProposal(target: WordingTarget, questionText: string, questionDescription: string, policySrc: string,
  evidence: { caseId: string; routeId: string; unsavedBaseline: boolean }) {
  if (!questionText.trim()) throw new Error("Question text is required.");
  if (questionText.length > 8000 || questionDescription.length > 16000) throw new Error("Presentation wording exceeds the editing limit.");
  const sourcePath = relative(dirname(policySrc), target.filePath).replace(/\\/g, "/");
  if (isAbsolute(sourcePath) || sourcePath === ".." || sourcePath.startsWith("../")) throw new Error("The owning CRL is outside this policy; propose that change in its owning workspace.");
  const fields = (["questionText", "questionDescription"] as const).flatMap(field => {
    const proposed = field === "questionText" ? questionText : questionDescription;
    if (proposed === target[field]) return [];
    const owner = target.owners[field];
    return [{ field, before: target[field], proposed,
      declaration: owner ? { contexts: owner.contexts, location: owner.location } : null,
      operation: field === "questionDescription" && proposed === "" ? "remove-field-from-owner" : owner ? "replace-field" : "add-default-field" }];
  });
  if (!fields.length) throw new Error("There are no wording changes to propose.");
  // Validate the proposed declarations against the complete owning library before exporting.
  const parsed = buildCRL(target.baseline);
  if (!parsed.success || !parsed.result) throw new Error("The baseline CRL is not parseable.");
  const declarations = parsed.result.presentations ?? [];
  const edits = new Map<string, Declaration>();
  let added: Declaration | undefined;
  for (const field of fields) {
    const owner = target.owners[field.field];
    const key = owner ? JSON.stringify(owner.location) : "new";
    let next = edits.get(key);
    if (!next) {
      next = owner ? { ...owner } : declarations.find(p => (typeof p.target === "string" ? p.target : p.target.name) === target.concept && p.contexts.length === 0);
      next = next ? { ...next } : { type: "Presentation", target: target.concept, contexts: [], questionText: target.questionText, location: parsed.result.location };
      if (!owner && !declarations.some(p => p.location === next!.location)) added = next;
      edits.set(key, next);
    }
    if (field.field === "questionDescription" && !field.proposed) delete next.questionDescription;
    else next[field.field] = field.proposed;
  }
  const eol = target.baseline.includes("\r\n") ? "\r\n" : "\n";
  const offset = (point: { line: number; column: number }) => {
    const lines = target.baseline.split(/\r?\n/); let n = 0;
    for (let i = 0; i < point.line - 1; i++) n += lines[i].length + eol.length;
    return n + point.column;
  };
  let proposedSource = target.baseline;
  const replacements = [...edits.values()].filter(p => p !== added).map(p => ({ start: offset(p.location.start), end: offset(p.location.end), text: declarationText(p, eol) }));
  for (const edit of replacements.sort((a,b) => b.start-a.start)) proposedSource = proposedSource.slice(0, edit.start) + edit.text + proposedSource.slice(edit.end);
  if (added) proposedSource += eol + eol + declarationText(added, eol) + eol;
  const check = buildCRL(proposedSource);
  if (!check.success || !check.result) throw new Error("The proposed presentation does not parse as CRL.");
  const errors = createPresentationCatalog(check.result).diagnostics.filter(d => d.severity === "error");
  if (errors.length) throw new Error(errors.map(d => d.message).join(" "));
  const effective = createPresentationCatalog(check.result).resolve(target.concept, target.context ? { decision: target.context.decision, criteria: new Set(target.context.criteria) } : undefined);
  if ((effective.questionText ?? target.concept) !== questionText || (effective.questionDescription ?? "") !== questionDescription) {
    throw new Error("This change would expose different inherited wording. Propose the change at its owning presentation instead.");
  }
  return { schemaVersion: 1, kind: "crl-presentation-patch", status: "proposed", id: randomUUID(), created: new Date().toISOString(),
    ownerScope: "crl", proposalScope: "medical-validation", target: { file: sourcePath, library: target.library, concept: target.concept },
    baseline: { sha256: createHash("sha256").update(target.baseline).digest("hex"), content: target.baseline, unsaved: evidence.unsavedBaseline },
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
