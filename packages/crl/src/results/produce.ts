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

import { emitCelSuite, type CelSuiteEmission } from "../cel/suiteEmit";
import { resolveCelSuite, type CelSuite } from "../cel/suite";
import { canonicalizeFsPath } from "../imports/paths";
import { emitCrlTwoLane } from "../emit-two-lane";
import { buildProducerInputs } from "./caseInput";
import { isInsideResultsTree, scanOrphans, splitOrphans } from "./orphans";
import { suiteResultsManifestPath, type ProducerManifest } from "./manifest";
import { buildEngineRepoBundle, cqlIndex } from "./repoBundle";
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
import { runOwnedProcess } from "./ownedProcess";
import { driverReady } from "./driver";
import { digest, runtimeFingerprint } from "./runtimeFingerprint";
import { caseKey, readRetry, reusableCase, preflightOutputs, regressionRetryRoot, excludeMvDestination, canonicalOutputRoot } from "./retry";
import { isImplementedUseCase, type ResultUseCase } from "./useCases";

export interface ProduceRequest {
  celPath: string;
  crlPath: string;
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
let quarantined = false;
let shuttingDown = false;
let activeAbort: AbortController | undefined;
let activeWork: Promise<ProduceOutcome> | undefined;

/** Cancel only for server lifecycle shutdown. Per-request cancellation uses req.signal. */
export async function shutdownProducer(): Promise<void> {
  shuttingDown = true;
  activeAbort?.abort();
  await activeWork;
}
async function guardedProduction(req: Omit<ProduceRequest, "outRoot" | "celPath">, make: () => ProduceRequest, purpose: "mv" | "regression"): Promise<ProduceOutcome> {
  if (quarantined) return { ok: false, reason: "Native cleanup was not confirmed; restart this server after checking its reported process failure." };
  if (running || shuttingDown) return { ok: false, reason: "Native producer is busy or shutting down." };
  if (req.signal?.aborted) return { ok: false, reason: "Native production cancelled." };
  running = true;
  const controller = new AbortController(); activeAbort = controller;
  const cancel = () => controller.abort();
  req.signal?.addEventListener("abort", cancel, { once: true });
  if (req.signal?.aborted) cancel();
  const work = (async (): Promise<ProduceOutcome> => {
    try {
      const bounds = resultBounds(req.bounds, req.caseTimeoutMs);
      if (controller.signal.aborted) return { ok: false, reason: "Native production cancelled." };
      return await produceSuiteResults({ ...make(), bounds, signal: controller.signal }, purpose);
    } catch (error) { return { ok: false, reason: String(error) }; }
    finally {
      req.signal?.removeEventListener("abort", cancel);
      activeAbort = undefined;
      if (!quarantined) running = false;
    }
  })();
  activeWork = work;
  return work;
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
    if (req.signal?.aborted || quarantined) return { ok: false, reason: "Native production cancelled or cleanup unconfirmed." };
    if (!suite.files.length) clearGeneratedDirectory(path.join(req.outRoot, "tests/results"));
    const result = suite.files.length ? await produceCandidate(req, suite, emission, previous) : emptyResult(req, suite, emission);
    if (!result.ok) return result;
    mkdirSync(path.dirname(result.manifestPath), { recursive: true });
    writeFileSync(result.manifestPath, JSON.stringify(result.manifest, null, 2) + "\n");
    if (quarantined) return result; // Account for every case, but do not prune after uncertain cleanup.
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
  const jarPath = req.jarPath ?? defaultEngineJarPath();
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
  const probe = async (exe: string): Promise<string | undefined> => {
    if (req.signal?.aborted || quarantined) return undefined;
    const result = await runOwnedProcess(exe, ["-version"], { timeoutMs: 15000, maxBytes: 65536, signal: req.signal });
    if (!result.cleanupConfirmed) quarantined = true;
    return result.failure || result.status !== 0 ? undefined : result.stderr + result.stdout;
  };
  const java = await resolveJavaAsync(process.env, process.platform === "win32", probe);
  if (quarantined) return { ok: false, reason: "Java discovery cleanup could not be confirmed; native execution stopped." };
  if (req.signal?.aborted) return { ok: false, reason: "Native production cancelled during Java discovery." };
  if (!java.ok) {
    return {
      ok: false,
      reason: java.reason === "too-old" ? `Java too old (${java.major}); need ${MIN_JAVA_MAJOR}+ (a JRE is enough)` : "no usable Java runtime found",
    };
  }

  const two = emitCrlTwoLane(req.crlPath);
  // ⚠ A partial definition closure makes the engine evaluate a different artifact from the one the CEL
  // oracle describes, so every downstream state would be measured against the wrong definitions.
  if (two.success === false || (two.hardErrors?.length ?? 0) > 0) {
    return {
      ok: false,
      reason: "the CRL emit did not succeed",
      detail: (two.hardErrors ?? []).map((e) => String((e as { kind?: string }).kind ?? "error")),
    };
  }

  const cql = cqlIndex(two.cqlLibraries ?? []);
  const { inputs, diagnostics } = buildProducerInputs(emission.result);
  if (diagnostics.length) return { ok: false, reason: "CEL cases have no native input", detail: diagnostics.map(d => `${d.sourceFile}: ${d.message}`) };
  const notEmitted: string[] = [];

  const defs = (two.fhir.resources as unknown as { resource: Record<string, unknown> }[]).map(
    (w) => w.resource,
  );
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
  const runtime = await runtimeFingerprint(java.javaExe, jarPath, req.bounds ?? DEFAULT_BOUNDS, req.signal);
  if (!runtime.cleanupConfirmed) quarantined = true;
  if (!runtime.sha256) return { ok: false, reason: runtime.reason ?? "Native runtime probe failed." };
  const definitionClosureSha256 = digest({ defs, cql: Object.entries(cql).sort(([a],[b]) => a.localeCompare(b)) });
  const runtimeSha256 = digest({ runtime: runtime.sha256, crlVersion: req.crlVersion, jar: jarCheck.sha256 });
  if (previous && (previous.provenance.runtimeSha256 !== runtimeSha256 ||
      previous.provenance.definitionClosureSha256 !== definitionClosureSha256)) {
    return { ok: false, reason: "Cannot retry: definitions or runtime changed. Run without retry." };
  }
  if (req.signal?.aborted || quarantined) return { ok: false, reason: "Native production cancelled or cleanup unconfirmed." };
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

  let failed = 0;
  try {
  for (const input of inputs) {
    const inputSha256 = digest({ input, planDefinitionId });
    const retained = reusableCase(req.outRoot, prior.get(caseKey(input)), inputSha256);
    if (retained) { manifest.cases.push(retained); continue; }
    if (quarantined || req.signal?.aborted) {
      manifest.cases.push({ sourceFile: input.sourceFile, caseId: input.caseId, caseName: input.caseName,
        compartmentDir: `patient/${input.compartmentId}`, state: "not-run",
        reason: quarantined ? "Queue stopped: previous owned-process cleanup unconfirmed." : "Production cancelled before this case." });
      failed++; continue;
    }
    const repo = buildEngineRepoBundle({
      definitions: defs as never,
      cqlByLibraryFile: cql,
      caseInput: input,
    });
    if (repo.missingCql.length > 0) {
      // ⚠ FAIL the case. Launching without its CQL produces an expression-level engine error that never
      // names the missing library, which then reads as a legitimate empty result.
      manifest.cases.push({
        sourceFile: input.sourceFile,
        caseId: input.caseId,
        caseName: input.caseName,
        compartmentDir: `patient/${input.compartmentId}`,
        state: "failed",
        reason: `no CQL available for ${repo.missingCql.join(", ")}`,
      });
      failed++;
      continue;
    }
    const repoPath = path.join(scratch, `${input.compartmentId}.json`);
    writeFileSync(repoPath, JSON.stringify(repo.bundle));

    const producedAt = new Date().toISOString();
    const entry = await runOneCase(
      {
        javaExe: java.javaExe,
        signal: req.signal,
        engineJarPath: jarPath, // the VERIFIED jar, and nothing else, is what runs
        bounds: req.bounds ?? DEFAULT_BOUNDS,
        planDefinitionId,
        artifactRoot: req.outRoot,
      },
      {
        caseName: input.caseName,
        compartmentId: input.compartmentId,
        subjectReference: input.subjectReference,
        repoPath,
      },
    );
    if (entry.cleanupUncertain) quarantined = true;
    entry.sourceFile = input.sourceFile;
    entry.caseId = input.caseId;
    entry.inputSha256 = inputSha256;
    entry.producedAt = producedAt;
    manifest.cases.push(entry);
    if (entry.state !== "generated" && entry.state !== "no-questionnaire") failed++;
  }
  } finally { rmSync(scratch, { recursive: true, force: true, maxRetries: 3 }); }

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
    java: { exe: java.javaExe, major: java.major },
    engineJar: { path: jarPath, defaulted: req.jarPath === undefined },
  };
}
