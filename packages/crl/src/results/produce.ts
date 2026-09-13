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
  resolveJava,
  verifyJar,
  type JvmBounds,
} from "./spawn";
import { driverReady } from "./driver";
import { isImplementedUseCase, type ResultUseCase } from "./useCases";

export interface ProduceRequest {
  celPath: string;
  crlPath: string;
  useCase: ResultUseCase;
  /**
   * Delete superseded Questionnaire/QuestionnaireResponse files this run did not write. Default TRUE.
   *
   * The results tree is regenerated output, so a stale artifact in it is superseded by definition —
   * and a stale one is not inert: a renamed CEL case leaves a complete pair behind that the viewer
   * offers a medical reviewer as a real case. Only types this use case OWNS are ever removed.
   */
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
      /** Q/QR this run DELETED from the results tree. Empty when `prune: false`. */
      pruned: string[];
      /** Unclaimed files LEFT alone: types we do not own, or a delete that failed. */
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
export function produceResults(req: ProduceRequest): ProduceOutcome {
  return produceSuiteResults(req, "mv");
}

/** Engineering runs reuse the producer in a newly created temporary directory. */
export function produceRegressionResults(req: Omit<ProduceRequest, "outRoot" | "celPath"> & { projectPath: string }): ProduceOutcome {
  const outRoot = mkdtempSync(path.join(tmpdir(), "crl-regression-"));
  return produceSuiteResults({ ...req, celPath: req.projectPath, outRoot }, "regression");
}

// REFACTOR:grounded: case-set selection is the only difference between these operations.
function produceSuiteResults(req: ProduceRequest, purpose: "mv" | "regression"): ProduceOutcome {
  if (!isImplementedUseCase(req.useCase)) return { ok: false, reason: `use case "${req.useCase}" has no driver yet` };
  const selection = resolveCelSuite(req.celPath, purpose);
  if (!selection.ok) return { ok: false, reason: "Invalid CEL suite", detail: selection.diagnostics.map(d => d.message) };
  try {
    const suite = selection.suite;
    if (suite.policyPath && canonicalizeFsPath(req.crlPath) !== canonicalizeFsPath(suite.policyPath)) return { ok: false, reason: "crlPath must be the policy covered by every selected CEL file." };
    const emission = emitCelSuite(suite);
    if (emission.result.diagnostics.some(d => d.severity === "error")) return { ok: false, reason: "CEL suite did not emit completely", detail: emission.result.diagnostics.map(d => d.message) };
    const result = suite.files.length ? produceCandidate(req, suite, emission) : emptyResult(req, suite, emission);
    if (!result.ok) return result;
    mkdirSync(path.dirname(result.manifestPath), { recursive: true });
    writeFileSync(result.manifestPath, JSON.stringify(result.manifest, null, 2) + "\n");
    // Existing results-tree cleanup, once for the complete selected case set.
    const scan = scanOrphans(req.outRoot, result.manifest);
    const { prunable, reportOnly } = splitOrphans(scan.orphans, req.useCase);
    // Report superseded per-file manifests; readers use only the returned suite manifest.
    for (const name of readdirSync(path.dirname(result.manifestPath))) {
      if (/^questionnaire-manifest-.*\.json$/.test(name) && name !== path.basename(result.manifestPath)) reportOnly.push(`tests/results/${name}`);
    }
    const pruned: string[] = [];
    for (const rel of prunable) {
      if (req.prune === false || !isInsideResultsTree(req.outRoot, rel)) { reportOnly.push(rel); continue; }
      try { rmSync(path.join(req.outRoot, rel)); pruned.push(rel); }
      catch { reportOnly.push(rel); }
    }
    return { ...result, pruned, orphaned: reportOnly.sort(), skippedLinks: scan.skippedLinks };
  } catch (error) { return { ok: false, reason: String(error) }; }
}

function emptyResult(req: ProduceRequest, suite: CelSuite, emission: CelSuiteEmission): Extract<ProduceOutcome, { ok: true }> {
  return { ok: true, manifest: { schemaVersion: 1, celLibrary: suite.purpose, useCase: req.useCase, generatedAt: emission.clock, provenance: { crlVersion: req.crlVersion }, cases: [] }, manifestPath: path.join(req.outRoot, suiteResultsManifestPath(suite.purpose)), notEmitted: [], pruned: [], orphaned: [], skippedLinks: [], failed: 0, java: { exe: "not invoked (empty suite)", major: 0 }, engineJar: { path: "not invoked (empty suite)", defaulted: req.jarPath === undefined } };
}

function produceCandidate(req: ProduceRequest, suite: CelSuite, emission: CelSuiteEmission): ProduceOutcome {
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
  const probe = (exe: string): string => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
    const r = spawnSync(exe, ["-version"], { encoding: "utf8" });
    // ⚠ `java -version` writes to STDERR.
    return (r.stderr ?? "") + (r.stdout ?? "");
  };
  const java = resolveJava(process.env, process.platform === "win32", probe);
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

  // ⚠ Build inputs go to scratch, never into the results tree.
  const scratch = mkdtempSync(path.join(tmpdir(), "crl-produce-"));

  const manifest: ProducerManifest = {
    schemaVersion: 1,
    celLibrary: suite.purpose,
    useCase: req.useCase,
    generatedAt: emission.clock,
    provenance: {
      crlVersion: req.crlVersion, producerJarSha256: jarCheck.sha256,
    },
    cases: [],
  };

  let failed = 0;
  try {
  for (const input of inputs) {
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

    const entry = runOneCase(
      {
        javaExe: java.javaExe,
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
    entry.sourceFile = input.sourceFile;
    entry.caseId = input.caseId;
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
