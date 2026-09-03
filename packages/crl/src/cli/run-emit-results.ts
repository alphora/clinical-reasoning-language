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
  SingleFlight,
  buildEngineRepoBundle,
  buildProducerInputs,
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
  const cql = cqlIndex(two.cqlLibraries ?? []);
  const { inputs, diagnostics } = buildProducerInputs(emitCelToFhir(resolveCelImports(a.cel)));
  for (const d of diagnostics) process.stderr.write(`case "${d.caseName}": ${d.message}\n`);

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
  // ⚠ The DECISION PlanDefinition, not an activity-derived one. A library emits one `workflow-definition`
  // PD for the decision plus an `eca-rule` PD per activity, and applying an activity PD yields nothing
  // useful — it has no guard to evaluate.
  const pd = defs.find(
    (r) =>
      r.resourceType === "PlanDefinition" &&
      /determination|decision|coverage/i.test(String(r.id ?? "")),
  );
  if (!pd?.id) {
    process.stderr.write("no decision PlanDefinition found in the emitted definitions\n");
    process.exit(2);
  }

  let failed = 0;

  const classpath = process.env.CRL_PRODUCER_CLASSPATH;
  if (!classpath) {
    process.stderr.write(
      "CRL_PRODUCER_CLASSPATH is not set — point it at the compiled ApplyDriver plus the engine jars\n",
    );
    process.exit(2);
  }

  const manifest: ProducerManifest = {
    schemaVersion: 1,
    celLibrary: path.basename(a.cel, ".cel"),
    useCase: a.useCase,
    generatedAt: new Date().toISOString(),
    provenance: { crlVersion: "dev", producerJarSha256: jarCheck.sha256 },
    cases: [],
  };

  for (const input of inputs) {
    const repo = buildEngineRepoBundle({
      definitions: two.fhir.resources.map((w: { resource: unknown }) => w.resource) as never,
      cqlByLibraryFile: cql,
      caseInput: input,
    });
    for (const id of repo.missingCql) {
      process.stderr.write(`case "${input.caseName}": Library ${id} has no CQL available
`);
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
