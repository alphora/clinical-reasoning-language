/**
 * ⭐⭐ THE ONE PRODUCTION PIPELINE. The CLI and the MCP tool are both thin wrappers over this.
 *
 * ⚠ WRITTEN AS ONE FUNCTION ON PURPOSE. Two entry points that each orchestrate their own emit → bundle →
 * spawn → write sequence is precisely the drift that produced every hard bug in this area: a helper that
 * was right and a caller that was wrong, with tests passing on the helper. There is one sequence; both
 * surfaces call it and differ only in how they report.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { emitCelToFhir } from "../cel/emitter";
import { resolveCelImports } from "../cel/imports";
import { emitCrlTwoLane } from "../emit-two-lane";
import { buildProducerInputs, casesMissingFromEmit } from "./caseInput";
import { producerManifestName, type ProducerManifest } from "./manifest";
import { buildEngineRepoBundle, cqlIndex } from "./repoBundle";
import { runOneCase } from "./runProducer";
import { DEFAULT_BOUNDS, resolveJava, verifyJar, type JvmBounds } from "./spawn";
import { isImplementedUseCase, type ResultUseCase } from "./useCases";

export interface ProduceRequest {
  celPath: string;
  crlPath: string;
  useCase: ResultUseCase;
  /** Artifact root the `tests/results/` tree hangs from. */
  outRoot: string;
  jarPath: string;
  jarSha256: string;
  /** Compiled `ApplyDriver` + the engine jars. */
  classpath: string;
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
      detail: jarCheck.reason === "sha-mismatch" ? [`actual sha256: ${jarCheck.actualSha256}`] : [],
    };
  }

  // ⚠ THE VERIFIED JAR MUST BE THE JAR EXECUTED. Hashing `--jar` and then launching whatever the
  // classpath happens to hold makes `producerJarSha256` a claim about an artifact that never ran — and a
  // provenance claim nobody checks is worse than none, because it is believed.
  const onClasspath = req.classpath
    .split(path.delimiter)
    .some(
      (seg) =>
        path.resolve(seg.replace(/[\\/]\*$/, "")) === path.resolve(path.dirname(req.jarPath)) ||
        path.resolve(seg) === path.resolve(req.jarPath),
    );
  if (!onClasspath) {
    return { ok: false, reason: "the verified jar is not on the producer classpath" };
  }

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
      reason: java.reason === "too-old" ? `JDK too old (${java.major})` : "no usable JDK found",
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
        classpath: req.classpath,
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

  return {
    ok: true,
    manifest,
    manifestPath,
    notEmitted,
    failed,
    java: { exe: java.javaExe, major: java.major },
  };
}
