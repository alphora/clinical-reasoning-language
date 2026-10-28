import { clearGeneratedDirectory } from "../generated-output";
/**
 * ⭐⭐ THE ONE PRODUCTION PIPELINE. The CLI and the MCP tool are both thin wrappers over this.
 *
 * ⚠ WRITTEN AS ONE FUNCTION ON PURPOSE. Two entry points that each orchestrate their own emit → bundle →
 * spawn → write sequence is precisely the drift that produced every hard bug in this area: a helper that
 * was right and a caller that was wrong, with tests passing on the helper. There is one sequence; both
 * surfaces call it and differ only in how they report.
 */

import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {performance} from "node:perf_hooks";

import { emitCelSuite, type CelSuiteEmission } from "../cel/suiteEmit";
import { resolveCelSuite, type CelSuite } from "../cel/suite";
import { canonicalizeFsPath } from "../imports/paths";
import { emitResultDefinitionClosure, type DefinitionPublicationOptions } from './definitionClosure';
import { buildProducerInputs,type ProducerCaseInput } from "./caseInput";
import { isInsideResultsTree, scanOrphans, splitOrphans } from "./orphans";
import { suiteResultsManifestPath, type ProducerManifest,type ProducerCaseEntry } from "./manifest";
import { buildEngineRepoBundle } from "./repoBundle";
import { runOneCase } from "./runProducer";
import {
  DEFAULT_BOUNDS,
  LAUNCHER_ENTRY,
  MIN_JAVA_MAJOR,
  ENGINE_JAR_SOURCE,
  defaultEngineJarPath,
  engineJarFetchCommand,
  engineJarHelp,
  resolveJavaAsync,
  resultBounds,
  verifyJar,
  type JvmBounds,
} from "./spawn";
import {runNativeProcess,nativeQuarantined,reportNativeCleanup,subscribeNativeAbort} from "./nativeProcess";
import { driverReady } from "./driver";
import {withNativeRuntime,shutdownNativeRuntime,withNativeOperation,assertOutsideNativeJob,checkNativeAdmission,setNativeWorkerLimit,nativeWorkerPoolStatus,drainRetiredNativeWorkers,NativeRuntimeError,type NativeMode} from './nativeWorker';
import { digest, runtimeFingerprint } from "./runtimeFingerprint";
import { caseKey, readRetry, reusableCase, preflightOutputs, regressionRetryRoot, excludeMvDestination, canonicalOutputRoot } from "./retry";
import { isImplementedUseCase, type ResultUseCase } from "./useCases";

export interface ProduceRequest {
  nativeMode?:NativeMode;
  /** Independent case concurrency in the same reusable native pool. Default retains configured limit1. */
  workerLimit?:number;
  celPath: string;
  crlPath: string;
  /** MV captures these once and uses them for Save, freshness and native refresh. Omitted retains normal defaults. */
  definitionOptions?: DefinitionPublicationOptions;
  useCase: ResultUseCase;
  /** Deprecated: false is refused. Normal runs replace tests/results; explicit retry retains verified successes. */
  prune?: boolean;
  /** Artifact root the `tests/results/` tree hangs from. */
  outRoot: string;
  /**
   * ⚠ THE ENGINE JAR — ONE FILE, AND THE ONLY ONE. It is verified against `jarSha256` and then
   * executed; there is deliberately NO second path to override what runs. An `engineJarPath`
   * override briefly existed here and no caller ever set it — its only reachable effect was to let a
   * caller hash jar A, execute jar B, and record A's sha in the manifest as provenance for B.
   */
  /**
   * ⚠ OPTIONAL. Omitted → the CRL engine cache copy, if it is there. The consumer should not
   * have to restate a constant we own; requiring it is what made this tool unreachable in the field.
   */
  jarPath?: string;
  /** ⚠ OPTIONAL. Omitted → the sha256 this build pins. Pass one only to pin something else. */
  jarSha256?: string;
  bounds?: JvmBounds;
  caseTimeoutMs?: number;
  /** Retain compatible successful rows; retry the remaining cases. */
  retryFailed?: boolean;
  signal?: AbortSignal;
  crlVersion: string;
}

export type ProduceOutcome =
  | { ok: false; reason: string; detail?: string[] }
  | {
      ok: true;
      manifest: ProducerManifest;
      manifestPath: string;
      /** Compatibility field: empty on success; incomplete suite emission returns ok:false before production. */
      notEmitted: string[];
      /** Q/QR this run DELETED from the results tree. Normal replacement precedes production; this lists post-run stale files removed during retry. */
      pruned: string[];
      /** Unclaimed files left after a failed removal. */
      orphaned: string[];
      /** Symlinks found under the results tree and deliberately not followed. */
      skippedLinks: string[];
      failed: number;
      workerPool?:{workerLimit:number;workerPids:number[];nativeCalls:number;peakActiveCases:number;elapsedMs:number};
      java: { exe: string; major: number };
      /**
       * The engine jar that actually ran, and whether it was DEFAULTED.
       *
       * ⚠ REPORTED, NEVER PUT IN THE MANIFEST. It is an absolute machine-local path, so committing it
       * would make the artifact machine-specific and re-break the idempotence just fixed. But a 215 MB
       * file resolved silently from `~/.m2` is a file the user does not know they have — so it goes in
       * the OUTPUT every run, where it is visible and costs the artifact nothing.
       */
      engineJar: { path: string; defaulted: boolean };
    };

/**
 * Run the producer over every emitted case.
 *
 * Refuses rather than degrades at each precondition, because every one of them, when skipped, produced a
 * plausible-looking empty success in an earlier cut of this code.
 */
let running = false;
let shuttingDown = false;
let activeAbort: AbortController | undefined;
let activeWork: Promise<ProduceOutcome> | undefined;

/** Cancel only for server lifecycle shutdown. Per-request cancellation uses req.signal. */
export async function shutdownProducer(): Promise<void> {
  assertOutsideNativeJob("shutdownProducer");
  shuttingDown = true;
  activeAbort?.abort();
  await activeWork;
  await shutdownNativeRuntime();
}
async function guardedProduction(req: Omit<ProduceRequest, "outRoot" | "celPath">, make: () => ProduceRequest, purpose: "mv" | "regression"): Promise<ProduceOutcome> {
  // Terminal lifecycle refusal remains ahead of operation/barrier admission.
  if (nativeQuarantined()) return { ok: false, reason: "Native cleanup was not confirmed; restart this server after checking its reported process failure." };
  if (running || shuttingDown) return { ok: false, reason: "Native producer is busy or shutting down." };
  if (req.signal?.aborted) return { ok: false, reason: "Native production cancelled." };
  if(req.workerLimit!==undefined){
    if(!Number.isSafeInteger(req.workerLimit)||req.workerLimit<1||req.workerLimit>32)return {ok:false,reason:"workerLimit must be an integer from1to32."};
    try{assertOutsideNativeJob("Producer worker-limit configuration");}catch(error){return {ok:false,reason:String(error)};}
  }
  running = true;
  const started=performance.now(),controller = new AbortController(); activeAbort = controller;
  const stopCancel=subscribeNativeAbort(req.signal,()=>controller.abort());
  const work:Promise<ProduceOutcome> = withNativeOperation<ProduceOutcome>(controller.signal,async signal=>{
    try {
      const bounds = resultBounds(req.bounds, req.caseTimeoutMs);
      if(signal?.aborted)return {ok:false,reason:"Native production cancelled."};
      if(req.workerLimit!==undefined)await setNativeWorkerLimit(req.workerLimit);
      return await produceSuiteResults({...make(),bounds,signal},purpose);
    } catch (error) { return { ok: false, reason: String(error) }; }
  }).catch(error=>({ok:false as const,reason:String(error)})).then(result=>{
    if(result.ok&&result.workerPool)result.workerPool.elapsedMs=performance.now()-started;
    return result;
  }).finally(()=>{
    stopCancel();activeAbort=undefined;
    if(!nativeQuarantined())running=false;
  });
  activeWork=work;return work;
}

export function produceResults(req: ProduceRequest): Promise<ProduceOutcome> {
  return guardedProduction(req, () => req, "mv");
}

/** Public API is asynchronous: await completion, including owned-process cleanup. */
export function produceRegressionResults(req: Omit<ProduceRequest, "outRoot" | "celPath"> & { projectPath: string; retryFrom?: string }): Promise<ProduceOutcome> {
  return guardedProduction(req, () => {
    if (req.retryFailed && !req.retryFrom) throw new Error("Regression retry requires retryFrom.");
    return { ...req, celPath: req.projectPath, retryFailed: Boolean(req.retryFrom),
      outRoot: req.retryFrom ? regressionRetryRoot(req.retryFrom) : mkdtempSync(path.join(tmpdir(), "crl-regression-")) };
  }, "regression");
}

// REFACTOR:grounded: case-set selection is the only difference between these operations.
async function produceSuiteResults(req: ProduceRequest, purpose: "mv" | "regression"): Promise<ProduceOutcome> {
  if (!isImplementedUseCase(req.useCase)) return { ok: false, reason: `use case "${req.useCase}" has no driver yet` };
  if (req.prune === false) return { ok: false, reason: "prune:false is no longer supported. Generated output is replaced; use Git for recovery or an explicit scratch output root." };
  req = { ...req, outRoot: canonicalOutputRoot(req.outRoot) };
  const selection = resolveCelSuite(req.celPath, purpose);
  if (!selection.ok) return { ok: false, reason: "Invalid CEL suite", detail: selection.diagnostics.map(d => d.message) };
  try {
    const suite = selection.suite;
    if (suite.policyPath && canonicalizeFsPath(req.crlPath) !== canonicalizeFsPath(suite.policyPath)) return { ok: false, reason: "crlPath must be the policy covered by every selected CEL file." };
    if (purpose === "regression" && req.retryFailed) excludeMvDestination(req.outRoot, suite.projectRoot);
    const previous = req.retryFailed ? readRetry(req.outRoot, purpose, req.useCase) : undefined;
    const emission = emitCelSuite(suite, previous ? new Date(previous.provenance.inputClock!) : undefined);
    if (emission.result.diagnostics.some(d => d.severity === "error")) return { ok: false, reason: "CEL suite did not emit completely", detail: emission.result.diagnostics.map(d => d.message) };
    preflightOutputs(req.outRoot, purpose, []);
    if (previous && !suite.files.length) throw new Error("Cannot retry an empty suite; run without retry.");
    if (req.signal?.aborted || nativeQuarantined()) return { ok: false, reason: "Native production cancelled or cleanup unconfirmed." };
    if (!suite.files.length) clearGeneratedDirectory(path.join(req.outRoot, "tests/results"));
    const result = suite.files.length ? await produceCandidate(req, suite, emission, previous) : emptyResult(req, suite, emission);
    if (!result.ok) return result;
    mkdirSync(path.dirname(result.manifestPath), { recursive: true });
    writeFileSync(result.manifestPath, JSON.stringify(result.manifest, null, 2) + "\n");
    if (nativeQuarantined()) return result; // Account for every case, but do not prune after uncertain cleanup.
    // Existing results-tree cleanup, once for the complete selected case set.
    const scan = scanOrphans(req.outRoot, result.manifest);
    const { prunable, reportOnly } = splitOrphans(scan.orphans, req.useCase);
    // Report superseded per-file manifests; readers use only the returned suite manifest.
    for (const name of readdirSync(path.dirname(result.manifestPath))) {
      if (/^questionnaire-manifest-.*\.json$/.test(name) && name !== path.basename(result.manifestPath)) prunable.push(`tests/results/${name}`);
    }
    const pruned: string[] = [];
    for (const rel of prunable) {
      if (!isInsideResultsTree(req.outRoot, rel) && !/^tests\/results\/questionnaire-manifest-[^/]+\.json$/.test(rel)) { reportOnly.push(rel); continue; }
      try { rmSync(path.join(req.outRoot, rel)); pruned.push(rel); }
      catch { reportOnly.push(rel); }
    }
    return { ...result, pruned, orphaned: reportOnly.sort(), skippedLinks: scan.skippedLinks };
  } catch (error) { return { ok: false, reason: String(error) }; }
}

function emptyResult(req: ProduceRequest, suite: CelSuite, emission: CelSuiteEmission): Extract<ProduceOutcome, { ok: true }> {
  return { ok: true, manifest: { schemaVersion: 1, celLibrary: suite.purpose, useCase: req.useCase, generatedAt: emission.clock, provenance: { crlVersion: req.crlVersion }, cases: [] }, manifestPath: path.join(req.outRoot, suiteResultsManifestPath(suite.purpose)), notEmitted: [], pruned: [], orphaned: [], skippedLinks: [], failed: 0, java: { exe: "not invoked (empty suite)", major: 0 }, engineJar: { path: "not invoked (empty suite)", defaulted: req.jarPath === undefined } };
}

async function produceCandidate(req: ProduceRequest, suite: CelSuite, emission: CelSuiteEmission, previous?: ProducerManifest): Promise<ProduceOutcome> {
  if (!isImplementedUseCase(req.useCase)) {
    return { ok: false, reason: `use case "${req.useCase}" has no driver yet` };
  }

  // ⭐ RESOLVE THE JAR BEFORE VERIFYING IT. Both parameters used to be REQUIRED, which meant a
  // consumer could not construct the call at all without already possessing a 215 MB artifact and its
  // hash — and the refusal that names the download URL sits AFTER the call they cannot make. As the
  // IEHP KE put it: "the gate is not the failure path — it is the signature." They recovered the URL
  // by reading back an agent-to-agent message thread, because it existed nowhere in the shipped tool.
  const environment={...process.env};
  const jarPath = req.jarPath ?? defaultEngineJarPath(environment);
  if (!jarPath) {
    return {
      ok: false,
      reason: "no engine jar: none was given and none is in the CRL engine cache",
      detail: [...engineJarHelp(), "", "fetch it with:", `  ${engineJarFetchCommand()}`],
    };
  }
  const jarCheck = verifyJar(jarPath, req.jarSha256 ?? ENGINE_JAR_SOURCE.sha256);
  if (!jarCheck.ok) {
    return {
      ok: false,
      reason: `engine jar unusable (${jarCheck.reason})`,
      detail: [
        ...(jarCheck.reason === "sha-mismatch" ? [`actual sha256: ${jarCheck.actualSha256}`] : []),
        ...engineJarHelp(),
      ],
    };
  }

  // ⚠ PRECONDITIONS BELONG HERE, NOT IN THE PER-CASE LOOP. A missing driver or a launcher-less jar
  // is one fact about the run, not N facts about N cases: checked per-case it yields a manifest of N
  // identical `failed` entries and an `ok: true` envelope, which reads as "the policy produced
  // nothing" rather than "we could not start". That mistranslation is the exact shape this file
  // exists to prevent.
  if (!jarCheck.hasLauncher) {
    return {
      ok: false,
      reason: "engine jar has no Spring Boot PropertiesLauncher — it is not a supported engine build",
      detail: [
        `expected the zip entry ${LAUNCHER_ENTRY}`,
        "that package moved in Spring Boot 3.2; a jar built against an older Boot will not launch this way",
        ...engineJarHelp(),
      ],
    };
  }

  const driver = driverReady();
  if (!driver.ok) {
    return {
      ok: false,
      reason: `the compiled driver did not ship (${driver.reason})`,
      detail: [`expected at ${driver.expectedAt}`, ...(driver.detail ?? [])],
    };
  }

  // ⚠ The verified jar IS the jar executed — it goes on `-cp` directly. The classpath-containment
  // check this replaces existed only because the user supplied a separate classpath that need not
  // have contained it, which made `producerJarSha256` a claim about an artifact that never ran.
  checkNativeAdmission((req.bounds??DEFAULT_BOUNDS).maxHeapMb);
  const probe = async (exe: string): Promise<string | undefined> => {
    if (req.signal?.aborted || nativeQuarantined()) return undefined;
    const result = await runNativeProcess(exe, ["-version"], { timeoutMs: 15000, maxBytes: 65536, signal: req.signal,env:environment });
    if (!result.cleanupConfirmed) reportNativeCleanup(false);
    return result.failure || result.status !== 0 ? undefined : result.stderr + result.stdout;
  };
  const java = await resolveJavaAsync(environment, process.platform === "win32", probe);
  if (nativeQuarantined()) return { ok: false, reason: "Java discovery cleanup could not be confirmed; native execution stopped." };
  if (req.signal?.aborted) return { ok: false, reason: "Native production cancelled during Java discovery." };
  if (!java.ok) {
    return {
      ok: false,
      reason: java.reason === "too-old" ? `Java too old (${java.major}); need ${MIN_JAVA_MAJOR}+ (a JRE is enough)` : "no usable Java runtime found",
    };
  }

  const closure = emitResultDefinitionClosure(req.crlPath, req.definitionOptions);
  const two = closure.emitted;
  // ⚠ A partial definition closure makes the engine evaluate a different artifact from the one the CEL
  // oracle describes, so every downstream state would be measured against the wrong definitions.
  if (two.success === false || (two.hardErrors?.length ?? 0) > 0) {
    return {
      ok: false,
      reason: "the CRL emit did not succeed",
      detail: (two.hardErrors ?? []).map((e) => String((e as { kind?: string }).kind ?? "error")),
    };
  }

  const cql = closure.cql;
  const { inputs, diagnostics } = buildProducerInputs(emission.result);
  if (diagnostics.length) return { ok: false, reason: "CEL cases have no native input", detail: diagnostics.map(d => `${d.sourceFile}: ${d.message}`) };
  const notEmitted: string[] = [];

  const defs = closure.definitions;
  // ⚠ Select by the emitter's own `type` coding, never by a regex over ids: a root decision named "TAR"
  // matches no name heuristic, and an included artifact can match one by accident.
  const roots = defs.filter(
    (r) =>
      r.resourceType === "PlanDefinition" &&
      ((r.type as { coding?: { code?: string }[] } | undefined)?.coding ?? []).some(
        (c) => c.code === "workflow-definition",
      ),
  );
  if (roots.length !== 1) {
    return {
      ok: false,
      reason:
        roots.length === 0
          ? "no root PlanDefinition (type `workflow-definition`) in the emitted definitions"
          : `ambiguous root: ${roots.length} PlanDefinitions carry type \`workflow-definition\``,
      detail: roots.map((r) => String(r.id)),
    };
  }
  const planDefinitionId = String(roots[0].id);

  preflightOutputs(req.outRoot, suite.purpose, inputs);
  const spec={javaExe:java.javaExe,engineJarPath:jarPath,engineSha256:jarCheck.sha256,bounds:req.bounds??DEFAULT_BOUNDS,signal:req.signal,nativeMode:req.nativeMode,env:environment};
  const workerPids=new Set<number>();
  // Release this short borrow before queueing cases: there is no suite-long reservation.
  const runtime=await withNativeRuntime(spec,async native=>{
    if(native.pid)workerPids.add(native.pid);
    return runtimeFingerprint(java.javaExe,jarPath,spec.bounds,req.signal,environment,native);
  });
  if(!runtime.cleanupConfirmed)reportNativeCleanup(false);
  if(!runtime.sha256)return {ok:false,reason:runtime.reason??"Native runtime probe failed."};
  const definitionClosureSha256 = closure.definitionClosureSha256!;
  const runtimeSha256 = digest({ runtime: runtime.sha256, crlVersion: req.crlVersion, jar: jarCheck.sha256 });
  if (previous && (previous.provenance.runtimeSha256 !== runtimeSha256 ||
      previous.provenance.definitionClosureSha256 !== definitionClosureSha256)) {
    return { ok: false, reason: "Cannot retry: definitions or runtime changed. Run without retry." };
  }
  if (req.signal?.aborted || nativeQuarantined()) return { ok: false, reason: "Native production cancelled or cleanup unconfirmed." };
  if (!previous) clearGeneratedDirectory(path.join(req.outRoot, "tests/results"));
  const prior = new Map(previous?.cases.map(c => [caseKey(c), c]) ?? []);
  // ⚠ Build inputs go to scratch, never into the results tree.
  const scratch = mkdtempSync(path.join(tmpdir(), "crl-produce-"));

  const manifest: ProducerManifest = {
    schemaVersion: 1,
    celLibrary: suite.purpose,
    useCase: req.useCase,
    generatedAt: new Date().toISOString(),
    provenance: {
      crlVersion: req.crlVersion, producerJarSha256: jarCheck.sha256,
      inputClock: emission.clock, runtimeSha256, definitionClosureSha256,
    },
    cases: [],
  };

  let activeCases=0,peakActiveCases=0,nativeCalls=0;
  const notRun=(input:ProducerCaseInput,reason:string):ProducerCaseEntry=>({sourceFile:input.sourceFile,caseId:input.caseId,caseName:input.caseName,compartmentDir:`patient/${input.compartmentId}`,state:"not-run",reason});
  const execute=async(input:ProducerCaseInput,index:number):Promise<ProducerCaseEntry>=>{
    const inputSha256=digest({input,planDefinitionId});
    const retained=reusableCase(req.outRoot,prior.get(caseKey(input)),inputSha256);if(retained)return retained;
    if(nativeQuarantined()||req.signal?.aborted)return notRun(input,nativeQuarantined()?"Queue stopped: previous owned-process cleanup unconfirmed.":"Production cancelled before this case.");
    let started=false;
    try{
      const repo=buildEngineRepoBundle({definitions:defs as never,cqlByLibraryFile:cql,caseInput:input});
      if(repo.missingCql.length)return {...notRun(input,`no CQL available for ${repo.missingCql.join(", ")}`),state:"failed"};
      // Index-keyed even if a malformed compartment identity were repeated.
      const repoPath=path.join(scratch,index+".json");writeFileSync(repoPath,JSON.stringify(repo.bundle));
      const entry=await withNativeRuntime(spec,async native=>{
        const actual=await runtimeFingerprint(java.javaExe,jarPath,spec.bounds,req.signal,environment,native);
        if(!actual.cleanupConfirmed)reportNativeCleanup(false);
        if(!actual.sha256||actual.sha256!==runtime.sha256)throw new NativeRuntimeError("runtime-fingerprint","Case owner differs from the frozen preflight runtime.",actual.cleanupConfirmed);
        if(nativeQuarantined()||req.signal?.aborted)return notRun(input,nativeQuarantined()?"Queue stopped: native cleanup unconfirmed.":"Production cancelled before this case.");
        activeCases++;peakActiveCases=Math.max(peakActiveCases,activeCases);started=true;
        const before=native.calls??0;let counted=false;
        try{
          const result=await runOneCase({javaExe:java.javaExe,signal:req.signal,engineJarPath:jarPath,bounds:spec.bounds,planDefinitionId,artifactRoot:req.outRoot,runtime:native},
            {caseName:input.caseName,compartmentId:input.compartmentId,subjectReference:input.subjectReference,repoPath});
          nativeCalls+=(native.calls===undefined?1:native.calls-before);counted=true;
          if(result.cleanupUncertain)reportNativeCleanup(false);
          return result;
        }finally{
          if(!counted)nativeCalls+=(native.calls===undefined?1:native.calls-before);
          if(native.pid)workerPids.add(native.pid);activeCases--;
        }
      });
      return {...entry,sourceFile:input.sourceFile,caseId:input.caseId,inputSha256,producedAt:new Date().toISOString()};
    }catch(error){
      const stopped=error instanceof NativeRuntimeError&&(error.code==='cancelled'||error.code==='cleanup-unconfirmed');
      return {...notRun(input,String(error)),state:!started&&stopped?"not-run":"failed",inputSha256,
        ...(started&&error instanceof NativeRuntimeError&&!error.cleanupConfirmed?{cleanupUncertain:true}:{})};
    }
  };
  const jobs=inputs.map((input,index)=>execute(input,index));
  try{
    // No early Promise.all unwind may delete a sibling's input or omit a queued case.
    const settled=await Promise.allSettled(jobs);
    manifest.cases=settled.map((row,index)=>row.status==='fulfilled'?row.value:{...notRun(inputs[index],String(row.reason)),state:"failed"});
  }finally{await Promise.allSettled(jobs);rmSync(scratch,{recursive:true,force:true,maxRetries:3});}
  await drainRetiredNativeWorkers();
  const failed=manifest.cases.filter(entry=>entry.state!=="generated"&&entry.state!=="no-questionnaire").length;

  const manifestPath = path.join(req.outRoot, suiteResultsManifestPath(suite.purpose));

  return {
    ok: true,
    manifest,
    manifestPath,
    notEmitted,
    orphaned: [],
    pruned: [],
    skippedLinks: [],
    failed,
    workerPool:{workerLimit:nativeWorkerPoolStatus().workerLimit,workerPids:[...workerPids].sort((a,b)=>a-b),nativeCalls,peakActiveCases,elapsedMs:0},
    java: { exe: java.javaExe, major: java.major },
    engineJar: { path: jarPath, defaulted: req.jarPath === undefined },
  };
}
