/**
 * ⭐ THE PRODUCER LOOP — one bounded JVM per case, results written through the manifest.
 *
 * ⚠ ONE JVM PER CASE, not one per batch, and this is a deliberate deviation from the design rounds.
 * Both review arms specified a single batching JVM to avoid startup churn. Building it showed the
 * trade runs the other way:
 *
 *   - A hung case cannot be interrupted inside a shared JVM, so a batch design has to kill the whole
 *     process tree and mark every unreached case `not-run`. Per-case isolation makes a per-case timeout
 *     ACTUALLY ENFORCEABLE and costs only that case.
 *   - The repository is per-case anyway (each case has its own Patient compartment), so a batch JVM
 *     would still rebuild and reload state per case. The saving is JVM startup, not engine work.
 *   - One case cannot leak state into the next, which a shared engine cannot promise.
 *
 * The cost is real — JVM startup per case, seconds each — and it is the right trade for a KE-run tool
 * over tens of cases. If a suite grows to hundreds this is the first thing to revisit.
 */

import { uniqueCapSlug } from "../fhir-emitter/slug";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { caseResultsTypeDir } from "./useCases";
import { parseDriverStdout } from "./repoBundle";
import type { ProducerCaseEntry, ProducerCaseState } from "./manifest";
import { capTail, jvmFlags, type JvmBounds } from "./spawn";
import { driverArgs, driverReady } from "./driver";

export interface RunOneCase {
  caseName: string;
  compartmentId: string;
  subjectReference: string;
  /** Absolute path to the case's repository bundle. ⚠ A BUILD INPUT — never written to the results tree. */
  repoPath: string;
}

export interface RunContext {
  javaExe: string;
  /** ⚠ ONE JAR PATH, not a classpath. Nothing is extracted and the caller composes nothing. */
  engineJarPath: string;
  bounds: JvmBounds;
  planDefinitionId: string;
  /** Artifact root the results tree hangs from. */
  artifactRoot: string;
}

/** What the engine returned, reduced to the two things a result consumer needs. */
interface ExtractedResults {
  questionnaire?: Record<string, unknown>;
  questionnaireResponse?: Record<string, unknown>;
}

/**
 * Pull the Questionnaire and QuestionnaireResponse out of an `$apply` Parameters envelope.
 *
 * They arrive nested — `Parameters.parameter[].resource` is a Bundle whose entries include a
 * RequestGroup, and the Questionnaire may be a top-level entry OR contained on one. Both are searched,
 * because which one it is depends on engine version and is not worth coupling to.
 */
export function extractResults(params: Record<string, unknown>): ExtractedResults {
  const out: ExtractedResults = {};
  const visit = (r: unknown): void => {
    if (!r || typeof r !== "object") return;
    const res = r as Record<string, unknown>;
    if (res.resourceType === "Questionnaire" && !out.questionnaire) out.questionnaire = res;
    if (res.resourceType === "QuestionnaireResponse" && !out.questionnaireResponse) {
      out.questionnaireResponse = res;
    }
    for (const k of ["parameter", "entry", "contained"]) {
      const v = res[k];
      if (Array.isArray(v)) for (const child of v) visit(child);
    }
    if (res.resource) visit(res.resource);
  };
  visit(params);
  return out;
}

/**
 * The most explanatory line of a JVM stderr, appended to a failure reason.
 *
 * Prefers an explicit error/exception line over the tail, because the tail of a stack trace is
 * usually a frame rather than the message. Bounded, so a manifest entry stays one readable line.
 */
export function describeStderr(stderr: string, limit = 300): string {
  const lines = stderr
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const best =
    lines.find((l) => /^(Error|Exception|Caused by)|Could not find or load|(Error|Exception):/.test(l)) ??
    lines[lines.length - 1];
  if (!best) return "";
  return ` — ${best.length > limit ? `${best.slice(0, limit)}…` : best}`;
}

/** Classify an engine outcome. ⚠ Every case gets exactly one terminal state; absence is never a state. */
export function classify(
  results: ExtractedResults,
  stderr: string,
  timedOut: boolean,
  exitCode: number | null,
  outputReadable = true,
): { state: ProducerCaseState; reason?: string } {
  if (timedOut) return { state: "timeout", reason: "per-case wall timeout" };
  if (exitCode !== 0) {
    // ⚠ CARRY THE CAUSE. `driver exited 1` is what a missing PropertiesLauncher, a driver compiled
    // against another engine (`NoSuchMethodError`), a class above the runtime floor
    // (`UnsupportedClassVersionError`) and a bad `loader.path` (`ClassNotFoundException: ApplyDriver`)
    // ALL look like. Reporting the bare exit code hands a user N identical lines and no cause, while
    // the JVM already said exactly what was wrong on a stderr we captured and then dropped.
    return { state: "failed", reason: `driver exited ${exitCode ?? "signal"}${describeStderr(stderr)}` };
  }
  // ⚠ UNREADABLE OUTPUT IS A FAILURE, NOT AN EMPTY RESULT. An earlier cut turned an unparseable stdout
  // into `{}` and then classified it `no-questionnaire` — recording "the policy asked nothing" for a run
  // whose output we could not read at all. Those are opposite facts.
  if (!outputReadable) {
    return { state: "failed", reason: "driver produced no readable JSON on stdout" };
  }
  // ⚠ An engine can exit 0 having reported errors in its OperationOutcome. Treating a clean exit as
  // proof of a clean run is what made the very first apply against our layout look successful.
  if (/ERROR|encountered exception/i.test(stderr) && !results.questionnaire) {
    return { state: "failed", reason: "engine reported an error and produced no questionnaire" };
  }
  // ⚠ The known `repeats` debt: ANY re-answered question (`most recent this` recency) trips this while
  // the disposition stays correct. Folding it into `failed` makes every recency case read as broken,
  // KEs learn to ignore the failure column, and that is how a real failure ships unnoticed.
  const populateError = /multiple values for a non repeating group/i.test(stderr);
  if (!results.questionnaire) {
    return populateError
      ? { state: "populate-degraded", reason: "populate error; no questionnaire produced" }
      : { state: "no-questionnaire", reason: "engine offered no questionnaire for this path" };
  }
  if (populateError) {
    return { state: "populate-degraded", reason: "multiple values for a non repeating group" };
  }
  return { state: "generated" };
}

/** Run one case. Bounded, isolated, and it writes nothing unless the engine produced something. */
export function runOneCase(ctx: RunContext, c: RunOneCase): ProducerCaseEntry {
  const ready = driverReady();
  if (!ready.ok) {
    return {
      caseName: c.caseName,
      compartmentDir: `patient/${c.compartmentId}`,
      state: "failed",
      reason: `the shipped driver class is missing at ${ready.expectedAt}`,
    };
  }
  const proc = spawnSync(
    ctx.javaExe,
    driverArgs({
      jvmFlags: jvmFlags(ctx.bounds),
      engineJarPath: ctx.engineJarPath,
      loaderPath: ready.loaderPath,
      repoPath: c.repoPath,
      planDefinitionId: ctx.planDefinitionId,
      subjectReference: c.subjectReference,
    }),
    {
      timeout: ctx.bounds.batchTimeoutMs,
      maxBuffer: ctx.bounds.maxCapturedBytes * 4,
      encoding: "buffer",
      // ⚠ NEVER "inherit": under MCP the parent's stdout is the JSON-RPC transport, and the driver's
      // stdout carries a third-party `kotlin-logging` banner regardless.
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const stdout = capTail([proc.stdout ?? Buffer.alloc(0)], ctx.bounds.maxCapturedBytes);
  const stderr = capTail([proc.stderr ?? Buffer.alloc(0)], ctx.bounds.maxCapturedBytes);
  const timedOut = proc.error !== undefined && /ETIMEDOUT|timed? ?out/i.test(String(proc.error));

  const params = parseDriverStdout(stdout);
  const results = params ? extractResults(params) : {};
  const { state, reason } = classify(results, stderr, timedOut, proc.status, params !== undefined);

  const entry: ProducerCaseEntry = {
    caseName: c.caseName,
    compartmentDir: `patient/${c.compartmentId}`,
    state,
    ...(reason ? { reason } : {}),
  };
  if (state !== "generated" && state !== "populate-degraded") return entry;

  // ⚠ Normalise BEFORE writing: the engine stamps every case's Questionnaire with the PlanDefinition's
  // id and points the response at a timestamped canonical the Questionnaire does not carry.
  const norm = normalizePersistedPair(results.questionnaire, results.questionnaireResponse, c.compartmentId);
  if (!pairIsConsistent(norm.questionnaire, norm.questionnaireResponse)) {
    return { ...entry, state: "failed", reason: "persisted Q/QR pair does not resolve to itself" };
  }

  const artifacts: NonNullable<ProducerCaseEntry["artifacts"]> = [];
  for (const [resource, type] of [
    [norm.questionnaire, "Questionnaire"],
    [norm.questionnaireResponse, "QuestionnaireResponse"],
  ] as const) {
    if (!resource) continue;
    const dir = caseResultsTypeDir(c.compartmentId, type);
    mkdirSync(path.join(ctx.artifactRoot, dir), { recursive: true });
    const id = String(resource.id ?? c.compartmentId);
    const rel = `${dir}/${id}.json`;
    const bytes = `${JSON.stringify(resource, null, 2)}\n`;
    writeFileSync(path.join(ctx.artifactRoot, rel), bytes, "utf8");
    artifacts.push({
      id,
      path: rel,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      resourceType: type,
    });
  }
  return { ...entry, artifacts };
}

/**
 * Remove a trailing engine run-timestamp (`-YYYY-MM-DD-HH.MM.SS`) from a version string.
 *
 * Deliberately a SUFFIX strip rather than a reconstruction: the rest of the version is the engine’s to
 * compose, and rebuilding it here would silently drop anything it adds later. A version that carries no
 * timestamp is returned untouched.
 */
export function stripRunTimestamp(version: unknown): string | undefined {
  if (typeof version !== "string") return undefined;
  const stripped = version.replace(/-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}[.][0-9]{2}[.][0-9]{2}$/, "");
  return stripped.length > 0 ? stripped : undefined;
}

/**
 * ⭐⭐ NORMALISE THE PERSISTED PAIR so it is internally consistent and reproducible.
 *
 * ⚠ TWO DEFECTS, BOTH MEASURED on real engine output, both invisible until someone asked what identity a
 * per-case Questionnaire carries:
 *
 *  1. EVERY case's Questionnaire arrives with the SAME id — the PlanDefinition's — while carrying
 *     DIFFERENT content per case (each form holds only what its path reached). N distinct resources
 *     claiming one identity. They do not collide on disk only because each sits in its own compartment
 *     directory; anything that flattened them, or resolved by id, would bind whichever it saw first.
 *
 *  2. The QuestionnaireResponse references a VERSIONED canonical that embeds the RUN TIMESTAMP:
 *         …/Questionnaire/<pd-id>|1.0.0-<compartmentId>-2026-09-03-03.22.02
 *     while the persisted Questionnaire's `url` carries no version at all. So the pair does not resolve
 *     to itself, and a re-run rewrites the reference — churning the diff of a committed artifact on every
 *     execution, with nothing about the content having changed.
 *
 * Both are fixed here rather than in the driver: the engine's output is what it is, and the producer owns
 * what gets written down.
 */
export function normalizePersistedPair(
  questionnaire: Record<string, unknown> | undefined,
  questionnaireResponse: Record<string, unknown> | undefined,
  compartmentId: string,
): { questionnaire?: Record<string, unknown>; questionnaireResponse?: Record<string, unknown> } {
  if (!questionnaire) return { questionnaire, questionnaireResponse };

  // Compartment-derived, so a case's form has an identity that is its own and is stable across runs.
  //
  // ⚠ CAP WITH A HASH, NEVER `.slice(64)`. A bare truncation silently DELETES the discriminator when
  // the engine id already fills the FHIR id ceiling — and a CRL PlanDefinition id is
  // `<package>-<decision>-<hash>`, so reaching 64 is ordinary for a real policy, not an edge case.
  // MEASURED by the IEHP KE: a 64-char engine id gave all 44 of their compartments ONE id, which is
  // exactly the collision compartment-suffixing exists to prevent. It survived our own tests because
  // the fixture id is 36 chars, and it is invisible from the pane because `caseResultsTypeDir` keys on
  // the compartment DIRECTORY — it only bites when something loads these into a repository keyed by
  // `id`, at which point 43 of 44 are clobbered in silence.
  //
  // `uniqueCapSlug` hashes the FULL string, so two compartments sharing a stem still separate.
  // (`uniqueCapSlugForSuffix` is the wrong tool here: it guarantees <= 64 only for a suffix of <= 52
  // chars, and a compartmentId is capped at 56.)
  const qId = uniqueCapSlug(`${String(questionnaire.id ?? "questionnaire")}-${compartmentId}`, 64);
  const baseUrl = String(questionnaire.url ?? "");
  const qUrl = baseUrl ? `${baseUrl}-${compartmentId}` : undefined;

  // ⚠ STRIP THE RUN CLOCK. The engine stamps `version` as `<base>-<compartmentId>-YYYY-MM-DD-HH.MM.SS`
  // and `authored` as the instant that case was applied. These are COMMITTED artifacts, so every
  // re-run rewrites every file with no semantic change: the IEHP KE measured all 88 of theirs churning
  // across two identical runs. That buries a real diff under timestamp noise and defeats the obvious
  // integrity check — re-run and compare — because the comparison can never succeed.
  //
  // It is not even stable WITHIN one run: our own fixture emits 10.56.41, 10.56.54 and 10.57.02 for
  // three cases of a single invocation, because each `$apply` reads the clock as it runs.
  //
  // The run time is not lost — the manifest records `generatedAt` ONCE for the run, which is where a
  // fact about the run belongs, rather than restamped into 88 artifacts that did not change.
  // This is the same defect as the versioned `QR.questionnaire` reference, in the two fields that
  // fix did not reach.
  const q: Record<string, unknown> = { ...questionnaire, id: qId, ...(qUrl ? { url: qUrl } : {}) };
  const version = stripRunTimestamp(q.version);
  if (version === undefined) delete q.version;
  else q.version = version;

  if (!questionnaireResponse) return { questionnaire: q, questionnaireResponse };

  // ⚠ Rewrite the REFERENCE in the same pass. Restamping the Questionnaire's identity while leaving the
  // response pointing at the old one produces a pair that is individually valid and jointly broken —
  // the failure mode is silence, since nothing validates the link at write time.
  const qr = {
    ...questionnaireResponse,
    ...(qUrl ? { questionnaire: qUrl } : {}),
  };
  // `authored` is 0..1 in FHIR, and an accurate "when this artifact was produced" already lives in
  // the manifest. A per-case wall-clock here buys nothing and costs idempotence.
  delete (qr as Record<string, unknown>).authored;

  return { questionnaire: q, questionnaireResponse: qr };
}

/** The pair a consumer binds must resolve to itself. Cheap to assert; expensive to discover later. */
export function pairIsConsistent(
  questionnaire: Record<string, unknown> | undefined,
  questionnaireResponse: Record<string, unknown> | undefined,
): boolean {
  if (!questionnaire || !questionnaireResponse) return true;
  const url = questionnaire.url;
  const ref = questionnaireResponse.questionnaire;
  return typeof url !== "string" || typeof ref !== "string" || ref === url;
}
