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

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { caseResultsTypeDir } from "./useCases";
import { parseDriverStdout } from "./repoBundle";
import type { ProducerCaseEntry, ProducerCaseState } from "./manifest";
import { capTail, jvmFlags, type JvmBounds } from "./spawn";

export interface RunOneCase {
  caseName: string;
  compartmentId: string;
  subjectReference: string;
  /** Absolute path to the case's repository bundle. ⚠ A BUILD INPUT — never written to the results tree. */
  repoPath: string;
}

export interface RunContext {
  javaExe: string;
  classpath: string;
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

/** Classify an engine outcome. ⚠ Every case gets exactly one terminal state; absence is never a state. */
export function classify(
  results: ExtractedResults,
  stderr: string,
  timedOut: boolean,
  exitCode: number | null,
): { state: ProducerCaseState; reason?: string } {
  if (timedOut) return { state: "timeout", reason: "per-case wall timeout" };
  if (exitCode !== 0) {
    return { state: "failed", reason: `driver exited ${exitCode ?? "signal"}` };
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
  const proc = spawnSync(
    ctx.javaExe,
    [...jvmFlags(ctx.bounds), "-cp", ctx.classpath, "ApplyDriver", c.repoPath, ctx.planDefinitionId, c.subjectReference],
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
  const { state, reason } = classify(results, stderr, timedOut, proc.status);

  const entry: ProducerCaseEntry = {
    caseName: c.caseName,
    compartmentDir: `patient/${c.compartmentId}`,
    state,
    ...(reason ? { reason } : {}),
  };
  if (state !== "generated" && state !== "populate-degraded") return entry;

  const artifacts: NonNullable<ProducerCaseEntry["artifacts"]> = [];
  for (const [resource, type] of [
    [results.questionnaire, "Questionnaire"],
    [results.questionnaireResponse, "QuestionnaireResponse"],
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
