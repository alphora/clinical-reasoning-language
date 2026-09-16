import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import type { ProducerManifest, ProducerCaseEntry } from "./manifest";
import { suiteResultsManifestPath } from "./manifest";
import type { ProducerCaseInput } from "./caseInput";

const fail = (why: string): never => { throw new Error("Cannot retry: " + why + ". Run once without retry to produce a compatible manifest."); };
const hash = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const timestamp = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
export const caseKey = (c: Pick<ProducerCaseEntry, "sourceFile" | "caseId" | "caseName" | "compartmentDir">): string =>
  JSON.stringify([c.sourceFile, c.caseId ?? c.caseName, c.compartmentDir]);

/** No linked write target may turn a damaged artifact into an escaping rerun. */
export function canonicalOutputRoot(root: string): string {
  let existing=path.resolve(root);
  const missing: string[]=[];
  while (!existsSync(existing)) {
    // A dangling link is not a missing directory.
    try { if (lstatSync(existing).isSymbolicLink()) throw new Error("Dangling native output root: " + existing); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    missing.unshift(path.basename(existing));
    const parent=path.dirname(existing);
    if (parent===existing) throw new Error("No existing ancestor for native output");
    existing=parent;
  }
  return path.join(realpathSync(existing),...missing);
}
export function assertSafePath(file: string, root: string): void {
  const relative=path.relative(path.resolve(root),path.resolve(file));
  if (path.isAbsolute(relative) || relative===".." || relative.startsWith(".."+path.sep)) throw new Error("Native output escapes selected root");
  let current=canonicalOutputRoot(root);
  const parts=relative.split(path.sep).filter(Boolean);
  for (let i=0; i<parts.length; i++) {
    current = path.join(current,parts[i]);
    let stat;
    try { stat = lstatSync(current); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return; throw e; }
    if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1)) throw new Error("Linked native output path is not supported: " + current);
    if (i < parts.length-1 && !stat.isDirectory()) throw new Error("Native output parent is not a directory: " + current);
  }
}
export function preflightOutputs(root: string, purpose: "mv" | "regression", inputs: ProducerCaseInput[]): void {
  assertSafePath(path.join(root,suiteResultsManifestPath(purpose)), root);
  for (const c of inputs) {
    if (!/^[A-Za-z0-9.-]+$/.test(c.compartmentId) || c.compartmentId === "." || c.compartmentId === "..") throw new Error("Invalid native case compartment");
    for (const type of ["questionnaire","questionnaireresponse"]) {
      const dir=path.join(root,"tests/results/fhir/patient",c.compartmentId,type);
      assertSafePath(dir, root);
      if (existsSync(dir)) for (const name of readdirSync(dir)) assertSafePath(path.join(dir,name), root);
    }
  }
}
export function readRetry(root: string, purpose: "mv" | "regression", useCase: string): ProducerManifest {
  const file=path.join(root,suiteResultsManifestPath(purpose)); assertSafePath(file, root);
  let m: ProducerManifest;
  try { m=JSON.parse(readFileSync(file,"utf8")); } catch { return fail("missing or unreadable manifest"); }
  if (!m || m.schemaVersion!==1 || m.celLibrary!==purpose || m.useCase!==useCase || !Array.isArray(m.cases) ||
      !timestamp(m.provenance?.inputClock) || !m.provenance.runtimeSha256 || !m.provenance.definitionClosureSha256) return fail("manifest lacks compatible provenance");
  const seen=new Set<string>();
  for (const c of m.cases) {
    if (!c || typeof c.caseName!=="string" || typeof c.sourceFile!=="string" || typeof c.compartmentDir!=="string" ||
        (c.caseId!==undefined && typeof c.caseId!=="string") || !["generated","no-questionnaire","populate-degraded","failed","timeout","not-run"].includes(c.state)) return fail("invalid case entry");
    const key=caseKey(c);
    if (seen.has(key)) return fail("duplicate case identity");
    seen.add(key);
  }
  return m;
}
export function regressionRetryRoot(manifest: string): string {
  const file=path.resolve(manifest);
  const root=path.dirname(path.dirname(path.dirname(file)));
  if (file !== path.join(root,suiteResultsManifestPath("regression"))) return fail("expected tests/results/questionnaire-manifest-regression.json");
  assertSafePath(file, root);
  return root;
}
export function excludeMvDestination(root: string, policyRoot: string): void {
  const candidate=path.join(root,"tests/results"), mv=path.join(policyRoot,"tests/results");
  const canonical=(p: string): string => {
    const resolved=existsSync(p) ? realpathSync(p) : path.join(realpathSync(path.dirname(p)),path.basename(p));
    return process.platform==="win32" ? resolved.toLowerCase() : resolved;
  };
  // Retry's existing root must not equal the selected policy root, even through an alias.
  if (canonical(root)===canonical(policyRoot) || (existsSync(mv) && canonical(candidate)===canonical(mv)) ||
      existsSync(path.join(root,suiteResultsManifestPath("mv")))) return fail("regression retry destination contains or is the policy's MV output");
}

/** A manifest is not permission to read arbitrary paths. Invalid artifacts cause a rerun. */
export function reusableCase(root: string, entry: ProducerCaseEntry | undefined, inputSha256: string): ProducerCaseEntry | undefined {
  if (!entry || entry.inputSha256!==inputSha256 || !timestamp(entry.producedAt)) return undefined;
  if (entry.state==="no-questionnaire") return !entry.artifacts?.length ? {...entry,reused:true} : undefined;
  if (entry.state!=="generated" || !Array.isArray(entry.artifacts) || entry.artifacts.length<1 || entry.artifacts.length>2) return undefined;
  const resources = new Map<string, Record<string, unknown>>();
  for (const a of entry.artifacts) {
    if (!a || !["Questionnaire","QuestionnaireResponse"].includes(a.resourceType) || resources.has(a.resourceType) ||
        !/^[A-Za-z0-9.-]{1,64}$/.test(a.id) || a.id==="." || a.id==="..") return undefined;
    const expected = `tests/results/fhir/${entry.compartmentDir}/${a.resourceType.toLowerCase()}/${a.id}.json`;
    if (a.path!==expected || !/^patient\/[A-Za-z0-9.-]+$/.test(entry.compartmentDir)) return undefined;
    const file=path.join(root,expected);
    try {
      assertSafePath(file, root);
      const bytes=readFileSync(file);
      if (hash(bytes)!==a.sha256) return undefined;
      const resource=JSON.parse(bytes.toString("utf8"));
      if (resource?.resourceType!==a.resourceType || resource.id!==a.id) return undefined;
      resources.set(a.resourceType,resource);
    } catch { return undefined; }
  }
  const q=resources.get("Questionnaire"),qr=resources.get("QuestionnaireResponse");
  if (!q) return undefined;
  if (qr && qr.questionnaire!==q.url && qr.questionnaire!==`Questionnaire/${q.id}` &&
      qr.questionnaire!==`${q.url}|${q.version}`) return undefined;
  return {...entry,reused:true};
}
