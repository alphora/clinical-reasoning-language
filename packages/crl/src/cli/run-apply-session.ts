#!/usr/bin/env node
// REFACTOR:grounded: this CLI reports the same stateless session result as the public API.
import { readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applySession, shutdownNativeRuntime, DEFAULT_SESSION_LIMITS, type ApplySessionRequestV1, type ApplySessionResult } from "../results/session";
import { JsonDocument, SessionInputError, sha256 } from "../results/sessionJson";
function readBounded(file: string, limit: number): string {
  const stat = statSync(file);
  if (!stat.isFile() || stat.size > limit) throw new SessionInputError("input-limit", "Input must be a regular file within the byte limit.", file);
  return readFileSync(file, "utf8");
}
let preprocessing: { outDir: string; original?: string } | undefined;
async function main(args=process.argv.slice(2)): Promise<void> {
  if (args.length === 1 && args[0] === "--help") {
    console.log('For repeated calls: --serve reads NDJSON {request: request-file, out: new-directory} and returns one result per line, reusing its JVM.');
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
function reportError(error:unknown):void {
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
}
// Yield bounded controls lazily, pausing stdin consumption while native work runs.
async function* controls():AsyncGenerator<string|SessionInputError>{
  let pending=Buffer.alloc(0),discarding=false;
  for await(const chunk of process.stdin){
    const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
    let start=0;
    while(start<bytes.length){
      const newline=bytes.indexOf(10,start),end=newline<0?bytes.length:newline,part=bytes.subarray(start,end);
      if(!discarding){
        if(pending.length+part.length>65536){pending=Buffer.alloc(0);discarding=true;yield new SessionInputError('input-limit','Control line exceeds 65536 bytes.');}
        else pending=Buffer.concat([pending,part]);
      }
      if(newline>=0){if(!discarding)yield pending.toString('utf8');pending=Buffer.alloc(0);discarding=false;}
      start=end+1;
    }
  }
  if(pending.length)yield pending.toString('utf8');
}
// REFACTOR:grounded: one tool process owns a reusable JVM; clinical inputs stay explicit per line.
async function entry():Promise<void>{
  const args=process.argv.slice(2);
  if(args.length!==1||args[0]!=='--serve'){await main().catch(reportError);return;}
  let stopped=false,exitCode=0;
  const stop=(code:number)=>{stopped=true;exitCode=code;process.stdin.destroy();};
  const interrupt=()=>stop(130),terminate=()=>stop(143);
  process.once('SIGINT',interrupt);process.once('SIGTERM',terminate);
  try{
    for await(const line of controls()){
      if(stopped)break;
      preprocessing=undefined;
      try{
        if(line instanceof SessionInputError)throw line;
        new JsonDocument(line,65536);const call=JSON.parse(line);
        if(!call||typeof call.request!=='string'||typeof call.out!=='string'||Object.keys(call).some(k=>!['request','out'].includes(k)))throw new SessionInputError('arguments','Each line requires request and out paths.');
        await main(['--request',call.request,'--out',call.out]);
      }catch(error){reportError(error);}
      exitCode=Math.max(exitCode,Number(process.exitCode??0));
    }
  }catch(error){if(!stopped)throw error;}
  finally{process.stdin.destroy();process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',terminate);process.exitCode=exitCode||process.exitCode;}
}
void entry().catch(reportError).finally(()=>shutdownNativeRuntime()).catch(error=>{console.error(String(error));process.exitCode=1;});
