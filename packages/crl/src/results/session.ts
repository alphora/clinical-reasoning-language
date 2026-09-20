// REFACTOR:grounded: one explicit native apply per request; caller owns state and raw FHIR inputs.
import { mkdirSync, writeFileSync, readFileSync, lstatSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { JsonDocument, SessionInputError, sha256 } from "./sessionJson";
import { validateSessionBundles } from "./sessionValidation";
import { inspectSessionOutcome, type SessionDiagnostic } from "./sessionErrors";
import { driverArgs, driverDir, driverReady } from "./driver";
import { runOwnedProcess } from "./ownedProcess";
import { DEFAULT_BOUNDS, ENGINE_JAR_SOURCE, defaultEngineJarPath, verifyJar, resolveJavaAsync, jvmFlags } from "./spawn";
import { runtimeFingerprint } from "./runtimeFingerprint";
export { buildSessionResponse } from "./sessionResponse";
export type { SessionAnswerEdit, SessionResponseOptions } from "./sessionResponse";
export { SessionInputError } from "./sessionJson";
export interface ApplySessionRequestV1 {
  schemaVersion: 1; requestId: string; caseId: string; stepId: string;
  planDefinitionId: string; subjectReference: string;
  repositoryJson: string; requestDataJson: string;
  engine?: { path: string; sha256: string };
}
export interface SessionLimits { inputBytes: number; fileBytes: number; artifactBytes: number; logBytes: number; timeoutMs: number; maxHeapMb: number }
export const DEFAULT_SESSION_LIMITS: Readonly<SessionLimits> = Object.freeze({ inputBytes: 32 * 1024 * 1024, fileBytes: 32 * 1024 * 1024, artifactBytes: 96 * 1024 * 1024, logBytes: 1024 * 1024, timeoutMs: 600000, maxHeapMb: 1024 });
export interface SessionArtifact { path: string; bytes: number; sha256: string; jsonStatus?: "valid" | "invalid" | "not-validated" }
export interface SessionRuntime { packageVersion: string; enginePath: string; engineSha256: string; driverSha256: string; driverSourceSha256: string; javaExe: string; javaMajor: number; fingerprint: string }
interface SessionResultBase {
  schemaVersion: 1; requestId?: string; caseId?: string; stepId?: string; runtime?: SessionRuntime;
  artifacts: Record<string, SessionArtifact>; diagnostics: SessionDiagnostic[]; elapsedMs: number; nativeMs?: number; cleanupConfirmed: boolean;
}
export type ApplySessionResult = SessionResultBase & ({ ok: true } | { ok: false; error: { code: string; message: string; path?: string } });
export interface ApplySessionOptions { outDir: string; limits?: Partial<SessionLimits>; signal?: AbortSignal; originalRequestJson?: string }
const version: string = (require("../../package.json") as { version: string }).version;
function limitsFor(overrides?: Partial<SessionLimits>): SessionLimits {
  const limits = { ...DEFAULT_SESSION_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) if (!Number.isSafeInteger(value) || value <= 0 || value > (name === "maxHeapMb" ? 65536 : 268435456)) throw new SessionInputError("invalid-limit", "Invalid positive bounded integer for " + name);
  return limits;
}
export async function applySession(request: ApplySessionRequestV1, options: ApplySessionOptions): Promise<ApplySessionResult> {
  const started = performance.now();
  const base: SessionResultBase = { schemaVersion: 1, artifacts: {}, diagnostics: [], elapsedMs: 0, cleanupConfirmed: true };
  let output: string | undefined, limits: SessionLimits | undefined;
  const finish = (error?: { code: string; message: string; path?: string }): ApplySessionResult => {
    base.elapsedMs = performance.now() - started;
    const result: ApplySessionResult = error ? { ...base, ok: false, error } : { ...base, ok: true };
    if (output) writeFileSync(path.join(output, "result.json"), JSON.stringify(result, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    return result;
  };
  const save = (name: string, text: string | Buffer): string => {
    const file = path.join(output!, name); writeFileSync(file, text, { flag: "wx" });
    base.artifacts[name] = { path: file, bytes: Buffer.byteLength(text), sha256: sha256(text) }; return file;
  };
  try {
    // Snapshot execution fields before awaiting; the original AbortSignal stays live.
    request = request && { ...request, ...(request.engine ? { engine: { ...request.engine } } : {}) };
    options = options && { ...options, limits: options.limits && { ...options.limits } };
    const environment = { ...process.env };
    limits = limitsFor(options?.limits);
    if (!options?.outDir || typeof options.outDir !== "string") throw new SessionInputError("output-directory", "Supply a new output directory.");
    const destination = path.resolve(options.outDir);
    // A pre-existing path is never reused, including links; no rollback/overwrite semantics.
    mkdirSync(destination); output = destination;
    if (options.originalRequestJson !== undefined) {
      if (typeof options.originalRequestJson !== "string" || Buffer.byteLength(options.originalRequestJson) > limits.inputBytes * 2) throw new SessionInputError("input-limit", "Original request exceeds its byte limit.");
      save("original-request.json", options.originalRequestJson);
    }
    if (!request || request.schemaVersion !== 1) throw new SessionInputError("schema-version", "Expected session schemaVersion 1.");
    for (const key of ["requestId", "caseId", "stepId"] as const) {
      if (typeof request[key] !== "string" || !request[key].trim() || request[key].length > 256) throw new SessionInputError("correlation", "Supply " + key + " (1–256 characters).");
      base[key] = request[key];
    }
    if (typeof request.planDefinitionId !== "string" || !/^[A-Za-z0-9.-]{1,64}$/.test(request.planDefinitionId)) throw new SessionInputError("plan-id", "PlanDefinition id must be a FHIR logical id.");
    if (typeof request.repositoryJson !== "string" || typeof request.requestDataJson !== "string") throw new SessionInputError("invalid-input", "Supply raw repositoryJson and requestDataJson strings.");
    if (Buffer.byteLength(request.repositoryJson) + Buffer.byteLength(request.requestDataJson) > limits.inputBytes) throw new SessionInputError("input-limit", "Combined FHIR inputs exceed the byte budget.");
    const requestText = JSON.stringify(request);
    if (Buffer.byteLength(requestText) > limits.inputBytes * 2) throw new SessionInputError("input-limit", "Serialized request envelope exceeds its byte limit.");
    save("request.json", requestText);
    const repoPath = save("repository-input.json", request.repositoryJson), dataPath = save("data-input.json", request.requestDataJson);
    if (options.originalRequestJson !== undefined) new JsonDocument(options.originalRequestJson, limits.inputBytes * 2);
    const repository = new JsonDocument(request.repositoryJson, limits.inputBytes), data = new JsonDocument(request.requestDataJson, limits.inputBytes);
    validateSessionBundles(repository, data, request.planDefinitionId, request.subjectReference);
    const conflicting = Object.keys(environment).filter(key => environment[key] && /^(JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS|_JAVA_OPTIONS|CLASSPATH|LOADER_.*|SPRING_.*|LD_PRELOAD|DYLD_INSERT_LIBRARIES)$/i.test(key));
    if (conflicting.length) throw new SessionInputError("java-environment", "Unset Java or loader overrides for bounded session execution: " + conflicting.sort().join(", "));
    if (options.signal?.aborted) throw new SessionInputError("cancelled", "Cancelled before native execution.");
    if (request.engine !== undefined && (!request.engine || typeof request.engine.path !== "string" || !request.engine.path || typeof request.engine.sha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(request.engine.sha256))) throw new SessionInputError("engine-configuration", "An explicit engine requires both a path and SHA256.");
    const configuredJar = request.engine?.path ?? defaultEngineJarPath();
    const jarPath = configuredJar ? path.resolve(configuredJar) : undefined;
    const expectedHash = request.engine?.sha256 ?? ENGINE_JAR_SOURCE.sha256;
    if (!jarPath || !/^[a-fA-F0-9]{64}$/.test(expectedHash)) throw new SessionInputError("engine-configuration", "Supply a hash-pinned engine or install this package's default engine.");
    const jar = verifyJar(jarPath, expectedHash);
    if (!jar.ok || !jar.hasLauncher) throw new SessionInputError("engine-verification", "Engine jar failed verification: " + (jar.ok ? "missing launcher" : jar.reason));
    const driver = driverReady();
    if (!driver.ok) throw new SessionInputError("driver-unavailable", driver.reason);
    let probeFailure: string | undefined;
    const java = await resolveJavaAsync(environment, process.platform === "win32", async exe => {
      if (probeFailure || options.signal?.aborted) return undefined;
      const probe = await runOwnedProcess(exe, ["-version"], { timeoutMs: 15000, maxBytes: 65536, signal: options.signal, env: environment });
      if (!probe.cleanupConfirmed) { base.cleanupConfirmed = false; probeFailure = "cleanup-unconfirmed"; }
      return probe.failure || probe.status !== 0 ? undefined : probe.stderr + probe.stdout;
    });
    if (probeFailure) throw new SessionInputError(probeFailure, "Java probe cleanup could not be confirmed.");
    if (options.signal?.aborted) throw new SessionInputError("cancelled", "Cancelled during Java discovery.");
    if (!java.ok) throw new SessionInputError("java-unavailable", java.reason);
    const bounds = { ...DEFAULT_BOUNDS, maxHeapMb: limits.maxHeapMb, batchTimeoutMs: limits.timeoutMs, maxCapturedBytes: limits.logBytes };
    const fingerprint = await runtimeFingerprint(java.javaExe, jarPath, bounds, options.signal, environment);
    base.cleanupConfirmed = fingerprint.cleanupConfirmed;
    if (!fingerprint.sha256) throw new SessionInputError(options.signal?.aborted ? "cancelled" : "runtime-fingerprint", fingerprint.reason ?? "Native runtime fingerprint unavailable.");
    base.runtime = { packageVersion: version, enginePath: path.resolve(jarPath), engineSha256: jar.sha256, driverSha256: sha256(readFileSync(path.join(driverDir(), "ApplyDriver.class"))), driverSourceSha256: sha256(readFileSync(path.join(driverDir(), "ApplyDriver.java"))), javaExe: java.javaExe, javaMajor: java.major, fingerprint: fingerprint.sha256 };
    const args = driverArgs({ jvmFlags: [...jvmFlags(bounds), "-Djava.io.tmpdir=" + output], engineJarPath: path.resolve(jarPath), loaderPath: driver.loaderPath,
      repoPath, planDefinitionId: request.planDefinitionId, subjectReference: request.subjectReference,
      session: { dataPath, outputPrefix: path.join(output, "native"), fileByteLimit: limits.fileBytes, totalByteLimit: limits.artifactBytes } });
    const nativeStart = performance.now();
    const processResult = await runOwnedProcess(java.javaExe, args, { timeoutMs: limits.timeoutMs, maxBytes: limits.logBytes, signal: options.signal, env: environment });
    base.nativeMs = performance.now() - nativeStart; base.cleanupConfirmed = processResult.cleanupConfirmed;
    save("stdout.log", processResult.stdout); save("stderr.log", processResult.stderr);
    if (!processResult.cleanupConfirmed) throw new SessionInputError("cleanup-unconfirmed", "Native cleanup could not be confirmed; outputs may still be changing.");
    const names = ["native-result.json", "native-data.json", "native-repository.json"];
    let total = 0;
    let outputError: SessionInputError | undefined;
    const contents = new Map<string, Buffer>();
    // Inventory available bounded files before parsing or reporting native failure.
    for (const name of names) {
      try {
        const file = path.join(output, name), stat = lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new SessionInputError("invalid-output", "Native output must be a regular file.", name);
        if (stat.size > limits.fileBytes || total + stat.size > limits.artifactBytes) throw new SessionInputError("output-limit", "Native artifacts exceed the byte budget.", name);
        total += stat.size;
        const bytes = readFileSync(file);
        contents.set(name, bytes);
        base.artifacts[name] = { path: file, bytes: bytes.length, sha256: sha256(bytes), jsonStatus: "not-validated" };
      } catch (error) {
        outputError ??= error instanceof SessionInputError ? error : new SessionInputError("missing-output", "Native output is missing or unreadable.", name);
      }
    }
    if (processResult.failure) throw new SessionInputError(processResult.failure, "Native process failed: " + processResult.failure);
    if (processResult.status !== 0) throw new SessionInputError(processResult.stderr.includes("CRL_OUTPUT_LIMIT") ? "output-limit" : "native-exit", "Native process exited " + processResult.status + "; see stderr.log.");
    let result: unknown;
    for (const [name, bytes] of contents) {
      try {
        const document = new JsonDocument(bytes.toString("utf8"), limits.fileBytes);
        base.artifacts[name].jsonStatus = "valid";
        if (name === "native-result.json") result = JSON.parse(document.text);
      } catch (error) {
        base.artifacts[name].jsonStatus = "invalid";
        outputError ??= error instanceof SessionInputError ? error : new SessionInputError("invalid-json", "Native JSON is invalid.", name);
      }
    }
    if (outputError) throw outputError;
    base.diagnostics = inspectSessionOutcome(result, processResult.stdout, processResult.stderr);
    if (base.diagnostics.some(d => d.severity === "error")) throw new SessionInputError("native-error", "Native apply returned errors; see diagnostics and raw artifacts.");
    return finish();
  } catch (error) {
    const failure = error instanceof SessionInputError ? { code: error.code, message: error.message, ...(error.path ? { path: error.path } : {}) } : { code: "session-failure", message: error instanceof Error ? error.message : String(error) };
    try { return finish(failure); } catch (writeError) { return { ...base, elapsedMs: performance.now() - started, ok: false, error: { code: "evidence-write", message: failure.message + "; could not write result: " + String(writeError) } }; }
  }
}
