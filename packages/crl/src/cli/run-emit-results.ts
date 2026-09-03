#!/usr/bin/env node
/**
 * `crl-emit-results` — run an engine over an emitted artifact and write what it produced.
 *
 * ⚠ NOT AN `emit_*` IN THE PURE SENSE, and named `emit-results` rather than `emit-questionnaire` for two
 * reasons. First, every other `emit_*` here is a pure function of source; this one RUNS AN ENGINE and
 * needs a JDK. Second, questionnaires are one use case: prior auth produces Questionnaire +
 * QuestionnaireResponse, a measure will produce MeasureReport. The use case is an argument, not a tool.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  DEFAULT_BOUNDS,
  MIN_JDK_MAJOR,
  RESULT_USE_CASES,
  IMPLEMENTED_USE_CASES,
  isImplementedUseCase,
  SingleFlight,
  buildEngineRepoBundle,
  buildProducerInputs,
  casesMissingFromEmit,
  cqlIndex,
  emitCelToFhir,
  emitCrlTwoLane,
  isResultUseCase,
  jvmFlags,
  resolveCelImports,
  resolveJava,
  verifyJar,
  producerManifestName,
  type ProducerManifest,
} from "../index";
import { runOneCase } from "../results/runProducer";

// Provenance must name the version that actually ran, not a placeholder.
const CRL_VERSION: string = (require("../../package.json") as { version: string }).version;

const HELP_TEXT = `crl-emit-results — run an engine over an emitted artifact and write the results

USAGE:
  crl-emit-results --cel <file.cel> --crl <file.crl> --use-case <${RESULT_USE_CASES.join("|")}>
                   --jar <producer.jar> --jar-sha256 <hex> --enable [--out <dir>]
  crl-emit-results --help

WHAT IT DOES
  Emits the definition closure and the case data, builds one in-memory repository PER CASE
  (CQL inlined — an emitted Library points at a relative .cql url that an in-memory repo
  cannot follow), runs the engine, and writes what came back to

      tests/results/fhir/patient/<compartmentId>/<resourceType>/

  Case DATA stays where the CEL emitter puts it (tests/data/fhir/patient/...). Results are
  what an ENGINE produced and live in their own tree.

⚠ DISABLED BY DEFAULT. This downloads nothing, but it does execute a JVM, so it runs only
  with --enable. Medical-validation users read committed results and never need this;
  knowledge engineers producing them turn it on.

FLAGS:
  --cel <file>         The CEL suite. Required.
  --crl <file>         The CRL library the suite covers. Required.
  --use-case <name>    ${RESULT_USE_CASES.join(" | ")}. Required.
  --jar <path>         Engine jar. Required with --enable.
  --jar-sha256 <hex>   Expected sha256, verified BEFORE EVERY LAUNCH. Required with --jar.
  --out <dir>          Artifact root. Default: the .cel file's project root.
  --enable             Opt in to running a JVM. Without it, nothing runs.
  --help               Show this message and exit 0.

EXIT CODES:
  0  Every case reached a terminal state and none FAILED.
  2  At least one case failed, or the engine could not be run.
  1  Bad arguments, or --enable was not given.
`;

interface Args {
  cel?: string; crl?: string; useCase?: string; jar?: string; jarSha?: string;
  out?: string; enable: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { enable: false };
  const need = (i: number, flag: string): string => {
    const v = argv[i + 1];
    if (!v || v.startsWith("--")) {
      process.stderr.write(`${flag} requires a value\n`);
      process.exit(1);
    }
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    if (f === "--help" || f === "-h") { process.stdout.write(HELP_TEXT); process.exit(0); }
    else if (f === "--cel") a.cel = need(i++, f);
    else if (f === "--crl") a.crl = need(i++, f);
    else if (f === "--use-case") a.useCase = need(i++, f);
    else if (f === "--jar") a.jar = need(i++, f);
    else if (f === "--jar-sha256") a.jarSha = need(i++, f);
    else if (f === "--out") a.out = need(i++, f);
    else if (f === "--enable") a.enable = true;
    else { process.stderr.write(`unknown flag ${f}\n`); process.exit(1); }
  }
  return a;
}

function main(): void {
  const a = parseArgs(process.argv.slice(2));
  if (!a.cel || !a.crl || !a.useCase) {
    process.stderr.write("--cel, --crl and --use-case are required\n");
    process.exit(1);
  }
  if (!isResultUseCase(a.useCase)) {
    process.stderr.write(`unknown --use-case "${a.useCase}"; valid: ${RESULT_USE_CASES.join(", ")}\n`);
    process.exit(1);
  }
  // ⚠ REFUSE A DECLARED-BUT-UNDRIVEN USE CASE. `measure` has a layout and a type mapping but no
  // `$evaluate-measure` driver: running it would apply the prior-auth path, find no Questionnaire, and
  // record `no-questionnaire` — a missing feature disguised as a legitimate empty result.
  if (!isImplementedUseCase(a.useCase)) {
    process.stderr.write(
      `--use-case "${a.useCase}" has no driver yet; implemented: ${IMPLEMENTED_USE_CASES.join(", ")}\n`,
    );
    process.exit(1);
  }
  if (!a.enable) {
    // ⚠ Named, not implied: a KE who has not opted in must be told the exact flag rather than left to
    // infer that "nothing happened" is a failure.
    process.stderr.write(
      "refusing to run: this executes a JVM and is disabled by default. Pass --enable.\n",
    );
    process.exit(1);
  }
  if (!a.jar || !a.jarSha) {
    process.stderr.write("--jar and --jar-sha256 are required with --enable\n");
    process.exit(1);
  }

  const jarCheck = verifyJar(a.jar, a.jarSha);
  if (!jarCheck.ok) {
    process.stderr.write(
      `engine jar unusable (${jarCheck.reason})` +
        (jarCheck.reason === "sha-mismatch" ? `: got ${jarCheck.actualSha256}` : "") + "\n",
    );
    process.exit(2);
  }

  const probe = (exe: string): string => {
    const r = spawnSync(exe, ["-version"], { encoding: "utf8" });
    // ⚠ `java -version` writes to STDERR.
    return (r.stderr ?? "") + (r.stdout ?? "");
  };
  const java = resolveJava(process.env, process.platform === "win32", probe);
  if (!java.ok) {
    process.stderr.write(
      java.reason === "too-old"
        ? `JDK ${java.major} at ${java.javaExe} is too old; ${MIN_JDK_MAJOR}+ required\n`
        : `no JDK found; set JAVA_HOME or put java on PATH (${MIN_JDK_MAJOR}+ required)\n`,
    );
    process.exit(2);
  }

  const two = emitCrlTwoLane(a.crl);
  // ⚠ A FAILED EMIT MUST NOT PRODUCE A "SUCCESSFUL" EMPTY RUN. Applying a partial definition closure
  // makes the engine evaluate a different artifact from the one the CEL oracle describes, and every
  // downstream state would be measured against the wrong definitions.
  if (two.success === false || (two.hardErrors?.length ?? 0) > 0) {
    for (const e of two.hardErrors ?? []) {
      process.stderr.write(`emit: ${String((e as { kind?: string }).kind ?? "error")}\n`);
    }
    process.stderr.write("refusing to run: the CRL emit did not succeed\n");
    process.exit(2);
  }

  const cql = cqlIndex(two.cqlLibraries ?? []);
  const celGraph = resolveCelImports(a.cel);
  const celEmit = emitCelToFhir(celGraph);
  const { inputs, diagnostics } = buildProducerInputs(celEmit);
  for (const d of diagnostics) process.stderr.write(`case "${d.caseName}": ${d.message}\n`);

  // ⚠ ACCOUNT FOR EVERY CASE. Emit is source-atomic per case, so a case the emitter skipped has no
  // compartment and would simply be absent from the run — indistinguishable from a suite that never
  // declared it. The DECLARED names come from the parsed suite; comparing the emitted set against
  // ITSELF (an earlier cut of this line) can never find anything, which is worse than not checking
  // at all because it looks checked.
  const declaredCases = ((celGraph.cel?.statements ?? []) as { type: string; name?: string }[])
    .filter((st) => st.type === "CELCase")
    .map((st) => String(st.name ?? ""));
  const missing = casesMissingFromEmit(declaredCases, celEmit);
  for (const name of missing) {
    process.stderr.write(`case "${name}": present in the suite but not emitted; skipped\n`);
  }

  const root = a.out ?? path.dirname(a.cel);
  const flight = new SingleFlight();
  if (!flight.tryAcquire()) { process.stderr.write("another run is in flight\n"); process.exit(2); }

  // ⚠ THE REPOSITORY BUNDLE IS A BUILD INPUT, NOT A RESULT. It goes to scratch, never into
  // `tests/results/` — committing the engine's input beside its output invites the next reader to treat
  // it as an artifact, and a later bundler to feed it back in as case data.
  const scratch = mkdtempSync(path.join(tmpdir(), "crl-emit-results-"));

  const defs = (two.fhir.resources as unknown as { resource: Record<string, unknown> }[]).map(
    (w) => w.resource,
  );
  // ⚠ SELECT BY `type`, NOT BY NAME. An earlier cut matched ids against /determination|decision|coverage/,
  // which is a heuristic over authored names: a root decision called "TAR" would not match, and an
  // included artifact could match by accident. The emitter's own authority is the type coding —
  // `fhir-emitter/decision.ts` stamps `workflow-definition` on the ROOT decision and `eca-rule` on every
  // sub/recommendation PD. Applying an `eca-rule` PD yields nothing useful: it has no guard to evaluate.
  const isWorkflowDefinition = (r: Record<string, unknown>): boolean => {
    const coding = (r.type as { coding?: { code?: string }[] } | undefined)?.coding ?? [];
    return coding.some((c) => c.code === "workflow-definition");
  };
  const roots = defs.filter((r) => r.resourceType === "PlanDefinition" && isWorkflowDefinition(r));
  if (roots.length !== 1) {
    process.stderr.write(
      roots.length === 0
        ? "no root PlanDefinition (type `workflow-definition`) in the emitted definitions\n"
        : `ambiguous root: ${roots.length} PlanDefinitions carry type \`workflow-definition\` (${roots
            .map((r) => String(r.id))
            .join(", ")})\n`,
    );
    process.exit(2);
  }
  const pd = roots[0];

  let failed = 0;

  const classpath = process.env.CRL_PRODUCER_CLASSPATH;
  if (!classpath) {
    process.stderr.write(
      "CRL_PRODUCER_CLASSPATH is not set — point it at the compiled ApplyDriver plus the engine jars\n",
    );
    process.exit(2);
  }

  // ⚠ THE VERIFIED JAR MUST BE THE JAR EXECUTED. An earlier cut hashed `--jar`, recorded that hash as
  // provenance, and then launched with only CRL_PRODUCER_CLASSPATH — which need not contain it. A KE
  // could verify jar A while running jar B, and the manifest would assert a hash for something that never
  // ran. A provenance claim nobody checks is worse than none, because it is believed.
  const jarPath: string = a.jar;
  const jarOnClasspath = classpath
    .split(path.delimiter)
    .some((seg) => path.resolve(seg.replace(/[\\/]\*$/, "")) === path.resolve(path.dirname(jarPath))
      || path.resolve(seg) === path.resolve(jarPath));
  if (!jarOnClasspath) {
    process.stderr.write(
      `the verified jar (${jarPath}) is not on CRL_PRODUCER_CLASSPATH — refusing to record a provenance ` +
        `hash for an artifact that will not be loaded\n`,
    );
    process.exit(2);
  }

  const manifest: ProducerManifest = {
    schemaVersion: 1,
    celLibrary: path.basename(a.cel, ".cel"),
    useCase: a.useCase,
    generatedAt: new Date().toISOString(),
    provenance: { crlVersion: CRL_VERSION, producerJarSha256: jarCheck.sha256 },
    cases: [],
  };

  for (const input of inputs) {
    const repo = buildEngineRepoBundle({
      definitions: two.fhir.resources.map((w: { resource: unknown }) => w.resource) as never,
      cqlByLibraryFile: cql,
      caseInput: input,
    });
    if (repo.missingCql.length > 0) {
      // ⚠ FAIL THE CASE. `buildEngineRepoBundle` says a missing Library is "NOT a warning to log and
      // continue past", and an earlier cut did exactly that: the engine then fails with an
      // expression-level error that never mentions the missing CQL, and `classify` reads it as
      // `no-questionnaire` — a broken run recorded as a legitimate empty one.
      const reason = `no CQL available for ${repo.missingCql.join(", ")}`;
      process.stderr.write(`case "${input.caseName}": ${reason}
`);
      manifest.cases.push({
        caseName: input.caseName,
        compartmentDir: `patient/${input.compartmentId}`,
        state: "failed",
        reason,
      });
      failed++;
      continue;
    }
    const repoPath = path.join(scratch, `${input.compartmentId}.json`);
    writeFileSync(repoPath, JSON.stringify(repo.bundle));

    const entry = runOneCase(
      {
        javaExe: java.javaExe,
        classpath,
        bounds: DEFAULT_BOUNDS,
        planDefinitionId: String(pd.id),
        artifactRoot: root,
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
    process.stdout.write(
      `${entry.state.padEnd(18)} ${input.caseName}` +
        (entry.artifacts?.length ? ` (${entry.artifacts.length} artifact)` : "") +
        (entry.reason ? ` — ${entry.reason}` : "") +
        "\n",
    );
  }

  // ⚠ MANIFEST LAST — it is the commit point. A reader that finds it can trust every path in it,
  // because those files were written before it existed.
  mkdirSync(path.join(root, "tests/results"), { recursive: true });
  writeFileSync(
    path.join(root, "tests/results", producerManifestName(manifest.celLibrary)),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
  flight.release();

  process.stdout.write(
    `\njava ${java.major} at ${java.javaExe} (${java.source})\n` +
      `jvm bounds: ${jvmFlags(DEFAULT_BOUNDS).join(" ")}\n` +
      `cases: ${inputs.length}, failed: ${failed}\n`,
  );
  process.exit(failed > 0 ? 2 : 0);
}

main();
