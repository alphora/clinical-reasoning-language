#!/usr/bin/env node
// REFACTOR:grounded: this CLI reports the same stateless session result as the public API.
import { readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applySession, DEFAULT_SESSION_LIMITS, type ApplySessionRequestV1, type ApplySessionResult } from "../results/session";
import { JsonDocument, SessionInputError, sha256 } from "../results/sessionJson";
function readBounded(file: string, limit: number): string {
  const stat = statSync(file);
  if (!stat.isFile() || stat.size > limit) throw new SessionInputError("input-limit", "Input must be a regular file within the byte limit.", file);
  return readFileSync(file, "utf8");
}
let preprocessing: { outDir: string; original?: string } | undefined;
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log("crl-apply-session --request <step.json> --out <new-directory>\nOne native apply step. schemaVersion:1, requestId/caseId/stepId, planDefinitionId, subjectReference, repositoryJson/requestDataJson or repositoryPath/requestDataPath. Paths resolve relative to step.json. Optional engine:{path,sha256}. Requires JRE17+ and the pinned engine; no compilation. See docs/apply-session.md.");
    return;
  }
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!["--request", "--out"].includes(args[i]) || !args[i + 1] || flags.has(args[i])) throw new SessionInputError("arguments", "Use --request <step.json> --out <new-directory>.");
    flags.set(args[i], args[i + 1]);
  }
  if (!flags.has("--request") || !flags.has("--out")) throw new SessionInputError("arguments", "Both --request and --out are required.");
  preprocessing = { outDir: path.resolve(flags.get("--out")!) };
  const requestPath = path.resolve(flags.get("--request")!), original = readBounded(requestPath, DEFAULT_SESSION_LIMITS.inputBytes * 2);
  preprocessing.original = original;
  new JsonDocument(original, DEFAULT_SESSION_LIMITS.inputBytes * 2);
  const request = JSON.parse(original);
  if (!request || typeof request !== "object" || Array.isArray(request)) throw new SessionInputError("request", "Request must be an object.");
  for (const [inline, file] of [["repositoryJson", "repositoryPath"], ["requestDataJson", "requestDataPath"]]) {
    if (request[file] !== undefined) {
      if (request[inline] !== undefined || typeof request[file] !== "string") throw new SessionInputError("ambiguous-input", "Supply exactly one of " + inline + " or " + file + ".");
      request[inline] = readBounded(path.resolve(path.dirname(requestPath), request[file]), DEFAULT_SESSION_LIMITS.inputBytes);
      delete request[file];
    }
  }
  if (request.engine && typeof request.engine.path === "string") request.engine.path = path.resolve(path.dirname(requestPath), request.engine.path);
  const controller = new AbortController(); let exitCode = 1;
  const interrupt = () => { exitCode = 130; controller.abort(); };
  const terminate = () => { exitCode = 143; controller.abort(); };
  process.once("SIGINT", interrupt); process.once("SIGTERM", terminate);
  try {
    preprocessing = undefined; // The API now owns evidence and its new-directory check.
    const result = await applySession(request as ApplySessionRequestV1, { outDir: path.resolve(flags.get("--out")!), originalRequestJson: original, signal: controller.signal });
    console.log(JSON.stringify(result)); process.exitCode = result.ok ? 0 : exitCode;
  } finally { process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", terminate); }
}
void main().catch(error => {
  const result: ApplySessionResult = { schemaVersion: 1, ok: false, artifacts: {}, diagnostics: [], elapsedMs: 0, cleanupConfirmed: true,
    error: { code: error instanceof SessionInputError ? error.code : "request-failure", message: error instanceof Error ? error.message : String(error) } };
  if (preprocessing) {
    try {
      mkdirSync(preprocessing.outDir); // Never reuse a prior run, even for CLI failures.
      if (preprocessing.original !== undefined) {
        const file = path.join(preprocessing.outDir, "original-request.json");
        writeFileSync(file, preprocessing.original, { encoding: "utf8", flag: "wx" });
        result.artifacts["original-request.json"] = { path: file, bytes: Buffer.byteLength(preprocessing.original), sha256: sha256(preprocessing.original) };
      }
      writeFileSync(path.join(preprocessing.outDir, "result.json"), JSON.stringify(result, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    } catch (evidenceError) {
      result.error = { code: "evidence-write", message: result.error.message + "; could not write CLI failure evidence: " + String(evidenceError) };
    }
  }
  console.log(JSON.stringify(result)); process.exitCode = 1;
});
