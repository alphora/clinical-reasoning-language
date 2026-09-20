// REFACTOR:grounded: exercise the public session boundary with controlled native failures and artifact bytes.
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
const native = vi.hoisted(() => ({ run: vi.fn(), verify: vi.fn(), fingerprint: vi.fn() }));
vi.mock("../ownedProcess", () => ({ runOwnedProcess: native.run }));
vi.mock("../runtimeFingerprint", () => ({ runtimeFingerprint: native.fingerprint }));
vi.mock("../spawn", async importOriginal => ({ ...await importOriginal<typeof import("../spawn")>(), verifyJar: native.verify,
  resolveJavaAsync: async (_env: unknown, _windows: unknown, probe: (exe: string) => Promise<string | undefined>) =>
    await probe("java") ? { ok: true, javaExe: "java", major: 17 } : { ok: false, reason: "probe failed" } }));
import { applySession, type ApplySessionRequestV1 } from "../session";
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const roots: string[] = [];
let dir: string;
const request = (): ApplySessionRequestV1 => ({ schemaVersion: 1, requestId: "request-1", caseId: "case-1", stepId: "step-1", planDefinitionId: "test", subjectReference: "Patient/p1",
  repositoryJson: '{"resourceType":"Bundle","type":"collection","entry":[{"resource":{"resourceType":"PlanDefinition","id":"test"}}]}',
  requestDataJson: '{"resourceType":"Bundle","type":"collection","entry":[{"resource":{"resourceType":"Observation","valueQuantity":{"value":1.23456789012345678900}}}]}',
  engine: { path: "/explicit-engine.jar", sha256: "a".repeat(64) } });
const success = { status: 0, stdout: "", stderr: "", cleanupConfirmed: true };
function outputs(args: string[], result = '{"resourceType":"Parameters"}', data = '{"resourceType":"Bundle"}', repo = '{"resourceType":"Bundle"}') {
  const prefix = args[args.indexOf("--session") + 2];
  for (const [name, json] of [["result", result], ["data", data], ["repository", repo]]) writeFileSync(prefix + "-" + name + ".json", json);
}
function runWith(fn: (args: string[]) => unknown) {
  native.run.mockImplementation(async (_exe: string, args: string[]) => args[0] === "-version" ? { ...success, stderr: 'openjdk version "17.0.1"' } : fn(args));
}
beforeEach(() => {
  vi.clearAllMocks(); dir = mkdtempSync(path.join(tmpdir(), "crl-session-boundary-")); roots.push(dir);
  native.verify.mockReturnValue({ ok: true, hasLauncher: true, sha256: "a".repeat(64) });
  native.fingerprint.mockResolvedValue({ sha256: "b".repeat(64), cleanupConfirmed: true });
  runWith(args => { outputs(args); return success; });
});
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
// @kit native-apply-session:failure-boundary
describe("applySession boundary", () => {
  it("uses the validated snapshot when caller fields change during Java discovery", async () => {
    let release!: (value: unknown) => void;
    native.run.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const req = request(), controller = new AbortController();
    const options = { outDir: path.join(dir, "snapshot"), signal: controller.signal, limits: { maxHeapMb: 256 } };
    const pending = applySession(req, options);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    req.planDefinitionId = "different"; req.subjectReference = "Patient/other";
    req.engine!.path = "/changed.jar"; req.engine!.sha256 = "c".repeat(64);
    req.repositoryJson = "invalid"; options.outDir = path.join(dir, "changed"); options.limits.maxHeapMb = 8192;
    const replacement = new AbortController(); replacement.abort(); options.signal = replacement.signal;
    release({ ...success, stderr: 'openjdk version "17.0.1"' });
    const result = await pending;
    expect(result.ok).toBe(true);
    const args = native.run.mock.calls[1][1] as string[];
    expect(args).toContain("test"); expect(args).toContain("Patient/p1"); expect(args).not.toContain("different");
    expect(args).toContain("-Xmx256m");
    expect(native.run.mock.calls[1][2].signal).toBe(controller.signal);
    expect(result.runtime?.enginePath).toBe(path.resolve("/explicit-engine.jar"));
    expect(JSON.parse(readFileSync(result.artifacts["request.json"].path, "utf8")).planDefinitionId).toBe("test");
    expect(existsSync(options.outDir)).toBe(false);
  });
  it.each(["_JAVA_OPTIONS", "JAVA_TOOL_OPTIONS", "JDK_JAVA_OPTIONS", "LOADER_PATH", "CLASSPATH"])("rejects %s before starting Java", async key => {
    vi.stubEnv(key, "conflicting-private-value");
    const result = await applySession(request(), { outDir: path.join(dir, "env") });
    expect(result).toMatchObject({ ok: false, error: { code: "java-environment" } });
    expect(JSON.stringify(result)).not.toContain("conflicting-private-value");
    expect(native.run).not.toHaveBeenCalled();
  });
  it("shares a frozen-in-time environment across discovery, fingerprint and execution", async () => {
    vi.stubEnv("TZ", "UTC");
    native.run.mockImplementationOnce(async () => {
      vi.stubEnv("TZ", "America/New_York"); vi.stubEnv("_JAVA_OPTIONS", "-Xmx8g");
      return { ...success, stderr: 'openjdk version "17.0.1"' };
    });
    expect((await applySession(request(), { outDir: path.join(dir, "env-snapshot") })).ok).toBe(true);
    const env = native.run.mock.calls[0][2].env;
    expect(env.TZ).toBe("UTC"); expect(env._JAVA_OPTIONS).toBeUndefined();
    expect(native.fingerprint.mock.calls[0][4]).toBe(env);
    expect(native.run.mock.calls[1][2].env).toBe(env);
  });
  it("inventories bounded malformed inputs before parsing", async () => {
    const req = { ...request(), repositoryJson: '{"resourceType":' };
    const result = await applySession(req, { outDir: path.join(dir, "bad-input"), originalRequestJson: '{"original":true}' });
    expect(result).toMatchObject({ ok: false, error: { code: "invalid-json" } });
    expect(readFileSync(result.artifacts["repository-input.json"].path, "utf8")).toBe(req.repositoryJson);
    expect(result.artifacts["original-request.json"].sha256).toBe(sha('{"original":true}'));
    expect(native.run).not.toHaveBeenCalled();
  });
  it("inventories partial evidence when native exits unsuccessfully", async () => {
    runWith(args => { outputs(args, '{"partial":'); return { ...success, status: 1 }; });
    const result = await applySession(request(), { outDir: path.join(dir, "partial") });
    expect(result).toMatchObject({ ok: false, error: { code: "native-exit" } });
    expect(result.artifacts["native-result.json"]).toMatchObject({ sha256: sha('{"partial":'), jsonStatus: "not-validated" });
    expect(result.artifacts["native-data.json"]).toBeDefined();
  });
  it("inventories remaining files when an expected native output is missing", async () => {
    runWith(args => { outputs(args); const prefix = args[args.indexOf("--session") + 2]; rmSync(prefix + "-data.json"); return success; });
    const result = await applySession(request(), { outDir: path.join(dir, "missing") });
    expect(result).toMatchObject({ ok: false, error: { code: "missing-output" } });
    expect(result.artifacts["native-result.json"].jsonStatus).toBe("valid");
    expect(result.artifacts["native-repository.json"].jsonStatus).toBe("valid");
  });

  it("transports exact decimal tokens and records input/output hashes with correlation", async () => {
    const req = request(), outDir = path.join(dir, "step");
    const result = await applySession(req, { outDir });
    expect(result).toMatchObject({ ok: true, requestId: "request-1", caseId: "case-1", stepId: "step-1", cleanupConfirmed: true });
    expect(readFileSync(path.join(outDir, "data-input.json"), "utf8")).toBe(req.requestDataJson);
    for (const artifact of Object.values(result.artifacts)) expect(sha(readFileSync(artifact.path))).toBe(artifact.sha256);
    expect(JSON.parse(readFileSync(path.join(outDir, "result.json"), "utf8"))).toEqual(result);
    expect(native.verify).toHaveBeenCalledWith(path.resolve(req.engine!.path), req.engine!.sha256);
  });
  it("does not overwrite a prior run", async () => {
    const outDir = path.join(dir, "step"), first = await applySession(request(), { outDir });
    const prior = readFileSync(path.join(outDir, "result.json")); native.run.mockClear();
    expect(first.ok).toBe(true); expect((await applySession(request(), { outDir })).ok).toBe(false);
    expect(readFileSync(path.join(outDir, "result.json"))).toEqual(prior); expect(native.run).not.toHaveBeenCalled();
  });
  it("rejects invalid request association before launching Java", async () => {
    expect(await applySession({ ...request(), subjectReference: "Observation/p1" }, { outDir: path.join(dir, "bad") })).toMatchObject({ ok: false });
    expect(native.run).not.toHaveBeenCalled();
  });
  it("preserves pre-cancellation without launching Java", async () => {
    const controller = new AbortController(); controller.abort();
    expect(await applySession(request(), { outDir: path.join(dir, "cancel"), signal: controller.signal })).toMatchObject({ ok: false, error: { code: "cancelled" }, cleanupConfirmed: true });
    expect(native.run).not.toHaveBeenCalled();
  });
  it.each(["timeout", "cancelled", "output-limit", "cleanup-unconfirmed"] as const)("reports %s without accepting partial results", async failure => {
    runWith(args => { outputs(args); return { ...success, status: null, failure, cleanupConfirmed: failure !== "cleanup-unconfirmed" }; });
    expect(await applySession(request(), { outDir: path.join(dir, failure) })).toMatchObject({ ok: false, error: { code: failure }, cleanupConfirmed: failure !== "cleanup-unconfirmed" });
  });
  it("detects oversized quiet native output before parsing it", async () => {
    runWith(args => { outputs(args, " ".repeat(1001)); return success; });
    expect(await applySession(request(), { outDir: path.join(dir, "large"), limits: { fileBytes: 1000 } })).toMatchObject({ ok: false, error: { code: "output-limit", path: "native-result.json" } });
  });
  it("enforces aggregate files even when each file fits", async () => {
    runWith(args => { outputs(args, '{"resourceType":"Parameters"}', '{"resourceType":"Bundle"}', '{"resourceType":"Bundle"}'); return success; });
    expect(await applySession(request(), { outDir: path.join(dir, "aggregate"), limits: { fileBytes: 100, artifactBytes: 60 } })).toMatchObject({ ok: false, error: { code: "output-limit" } });
  });
  it("rejects truncated JSON and preserves its evidence", async () => {
    runWith(args => { outputs(args, '{"resourceType":'); return success; });
    const result = await applySession(request(), { outDir: path.join(dir, "truncated") });
    expect(result).toMatchObject({ ok: false, error: { code: "invalid-json" } });
    expect(result.artifacts["native-result.json"].jsonStatus).toBe("invalid");
    expect(result.artifacts["native-data.json"].jsonStatus).toBe("valid");
    expect(result.artifacts["native-repository.json"].jsonStatus).toBe("valid");
    expect(readFileSync(path.join(dir, "truncated/native-result.json"), "utf8")).toBe('{"resourceType":');
  });
  it("fails a nested native error even with a Questionnaire", async () => {
    runWith(args => { outputs(args, JSON.stringify({ resourceType: "Parameters", parameter: [{ name: "return", resource: { resourceType: "Questionnaire" } }, { name: "nested", resource: { resourceType: "OperationOutcome", issue: [{ severity: "error", diagnostics: "broken" }] } }] })); return success; });
    const result = await applySession(request(), { outDir: path.join(dir, "error") });
    expect(result).toMatchObject({ ok: false, error: { code: "native-error" } });
    expect(result.diagnostics.some(d => d.severity === "error")).toBe(true); expect(existsSync(result.artifacts["native-result.json"].path)).toBe(true);
  });
  it("fails stdout-only errors without hiding them behind clean output", async () => {
    runWith(args => { outputs(args); return { ...success, stdout: "ERROR evaluation failed\n" }; });
    expect(await applySession(request(), { outDir: path.join(dir, "log-error") })).toMatchObject({ ok: false, error: { code: "native-error" } });
  });
});
