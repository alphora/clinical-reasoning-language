/**
 * ⭐⭐ THE ONE PRODUCTION PIPELINE. The CLI and the MCP tool are both thin wrappers over this.
 *
 * ⚠ WRITTEN AS ONE FUNCTION ON PURPOSE. Two entry points that each orchestrate their own emit → bundle →
 * spawn → write sequence is precisely the drift that produced every hard bug in this area: a helper that
 * was right and a caller that was wrong, with tests passing on the helper. There is one sequence; both
 * surfaces call it and differ only in how they report.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { emitCelToFhir } from "../cel/emitter";
import { resolveCelImports } from "../cel/imports";
import { emitCrlTwoLane } from "../emit-two-lane";
import { buildProducerInputs, casesMissingFromEmit } from "./caseInput";
import {
  heldBackCompartments,
  isInsideResultsTree,
  pruneRefusalReason,
  scanOrphans,
  splitOrphans,
} from "./orphans";
import { RESULTS_ROOT } from "./useCases";
import { producerManifestName, type ProducerManifest } from "./manifest";
import { buildEngineRepoBundle, cqlIndex } from "./repoBundle";
import { runOneCase } from "./runProducer";
import {
  DEFAULT_BOUNDS,
  LAUNCHER_ENTRY,
  MIN_JAVA_MAJOR,
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
  jarPath: string;
  jarSha256: string;
  bounds?: JvmBounds;
  crlVersion: string;
}

export type ProduceOutcome =
  | { ok: false; reason: string; detail?: string[] }
  | {
      ok: true;
      manifest: ProducerManifest;
      manifestPath: string;
      /** Cases the suite declares that the emitter did not produce — reported, never silently skipped. */
      notEmitted: string[];
      /**
       * Unclaimed files this run did NOT delete — types outside this use case, plus anything pruning
       * could not remove. Never emptied silently: a file we failed to delete is reported here rather
       * than counted as pruned.
       */
      orphaned: string[];
      /** Superseded artifacts this run DELETED. Empty when `prune: false`. */
      pruned: string[];
      /**
       * Directories/entries orphan detection could not read, and sibling manifests it could not parse.
       * ⚠ Non-empty means the orphan list is INCOMPLETE — "no orphans" from an unreadable tree would
       * claim it is clean.
       */
      unreadable: string[];
      /** Symlinks found under the results tree and deliberately not followed. */
      skippedLinks: string[];
      /** Why nothing was deleted, when pruning was skipped. Undefined when pruning ran. */
      pruneRefusal?: string;
      failed: number;
      java: { exe: string; major: number };
    };

/**
 * Run the producer over every emitted case.
 *
 * Refuses rather than degrades at each precondition, because every one of them, when skipped, produced a
 * plausible-looking empty success in an earlier cut of this code.
 */
export function produceResults(req: ProduceRequest): ProduceOutcome {
  if (!isImplementedUseCase(req.useCase)) {
    return { ok: false, reason: `use case "${req.useCase}" has no driver yet` };
  }

  const jarCheck = verifyJar(req.jarPath, req.jarSha256);
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
  const celGraph = resolveCelImports(req.celPath);
  const celEmit = emitCelToFhir(celGraph);
  const { inputs } = buildProducerInputs(celEmit);

  const declared = ((celGraph.cel?.statements ?? []) as { type: string; name?: string }[])
    .filter((st) => st.type === "CELCase")
    .map((st) => String(st.name ?? ""));
  const notEmitted = casesMissingFromEmit(declared, celEmit);

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
    celLibrary: path.basename(req.celPath, ".cel"),
    useCase: req.useCase,
    generatedAt: new Date().toISOString(),
    provenance: { crlVersion: req.crlVersion, producerJarSha256: jarCheck.sha256 },
    cases: [],
  };

  let failed = 0;
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
        engineJarPath: req.jarPath, // the VERIFIED jar, and nothing else, is what runs
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
    manifest.cases.push(entry);
    if (entry.state === "failed" || entry.state === "timeout") failed++;
  }

  // ⚠ MANIFEST LAST — the commit point. A reader that finds it can trust every path in it.
  mkdirSync(path.join(req.outRoot, "tests/results"), { recursive: true });
  const manifestPath = path.join(
    req.outRoot,
    "tests/results",
    producerManifestName(manifest.celLibrary),
  );
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  // AFTER the manifest is written: it is the definition of what this run claims, so orphans are
  // computed against the committed answer rather than an in-flight one.
  const scan = scanOrphans(req.outRoot, manifest);
  const { prunable, reportOnly } = splitOrphans(scan.orphans, req.useCase);
  const pruned: string[] = [];

  // The decision to delete is pure and lives in orphans.ts, so CI can exercise it without a JVM.
  const pruneRefusal = pruneRefusalReason(manifest, scan, req.prune);
  const heldBack = heldBackCompartments(manifest);

  if (pruneRefusal === undefined) {
    for (const rel of prunable) {
      if (heldBack.some((prefix) => rel.startsWith(prefix))) {
        reportOnly.push(rel);
        continue;
      }
      // ⚠ CONTAINMENT BEFORE DELETION. The scan already refuses to follow symlinks; this re-checks
      // that the path really is inside the results tree, because the cost of being wrong is
      // someone else’s file.
      if (!isInsideResultsTree(req.outRoot, rel)) {
        reportOnly.push(rel);
        continue;
      }
      try {
        rmSync(path.join(req.outRoot, rel));
        pruned.push(rel);
      } catch {
        // A file we could not remove stays REPORTED rather than silently claimed as pruned — the
        // caller must not be told the tree is clean when it is not.
        reportOnly.push(rel);
      }
    }
  } else {
    reportOnly.push(...prunable);
  }
  reportOnly.sort();

  return {
    ok: true,
    manifest,
    manifestPath,
    notEmitted,
    orphaned: reportOnly,
    pruned,
    unreadable: scan.unreadable,
    pruneRefusal,
    skippedLinks: scan.skippedLinks,
    failed,
    java: { exe: java.javaExe, major: java.major },
  };
}
