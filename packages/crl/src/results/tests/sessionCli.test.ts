import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { buildSync } from "esbuild";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync,spawn } from "node:child_process";
import { sha256 } from "../sessionJson";
let root: string, cli: string;
beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "crl-session-cli-")); cli = path.join(root, "cli.cjs");
  buildSync({ entryPoints: [path.resolve(__dirname, "../../cli/run-apply-session.ts")], outfile: cli, bundle: true, platform: "node", format: "cjs", alias: { "jsonc-parser": require.resolve("jsonc-parser/lib/esm/main.js") }, logLevel: "silent" });
});
afterAll(() => { if (root) rmSync(root, { recursive: true, force: true }); });
function run(name: string, original: string, existing = false) {
  const request = path.join(root, name + ".json"), outDir = path.join(root, name);
  writeFileSync(request, original);
  if (existing) { mkdirSync(outDir); writeFileSync(path.join(outDir, "result.json"), "prior evidence"); }
  const child = spawnSync(process.execPath, [cli, "--request", request, "--out", outDir], { encoding: "utf8", timeout: 30000, windowsHide: true });
  expect(child.error).toBeUndefined(); expect(child.status).toBe(1);
  expect(child.stdout, child.stderr).not.toBe("");
  return { result: JSON.parse(child.stdout), outDir };
}
it.each([
  ["malformed", '{"schemaVersion":', "invalid-json"],
  ["unreadable", '{"repositoryPath":"missing.json"}', "request-failure"],
  ["ambiguous", '{"repositoryJson":"{}","repositoryPath":"missing.json"}', "ambiguous-input"],
])("preserves CLI %s failure evidence", (name, original, code) => {
  const { result, outDir } = run(name, original);
  expect(result).toMatchObject({ ok: false, error: { code } });
  expect(result.artifacts["original-request.json"].sha256).toBe(sha256(original));
  expect(readFileSync(path.join(outDir, "original-request.json"), "utf8")).toBe(original);
  expect(JSON.parse(readFileSync(path.join(outDir, "result.json"), "utf8"))).toEqual(result);
});
it("never overwrites prior evidence when CLI preprocessing fails", () => {
  const { result, outDir } = run("existing", "{", true);
  expect(result.error.code).toBe("evidence-write");
  expect(readFileSync(path.join(outDir, "result.json"), "utf8")).toBe("prior evidence");
});

// @kit native-apply-session:streaming-cli
it('streaming CLI reports each request and continues after malformed control input',()=>{
 const calls=['not json',JSON.stringify({request:path.join(root,'missing-serve.json'),out:path.join(root,'serve-missing')}),JSON.stringify({unexpected:true})].join('\n')+'\n';
 const child=spawnSync(process.execPath,[cli,'--serve'],{input:calls,encoding:'utf8',timeout:30000,windowsHide:true});
 expect(child.error).toBeUndefined();expect(child.status).toBe(1);const results=child.stdout.trim().split('\n').map(line=>JSON.parse(line));expect(results).toHaveLength(3);expect(results.every(r=>r.ok===false)).toBe(true);expect(results[0].error.code).toBe('invalid-json');expect(results[2].error.code).toBe('arguments');
});
// @kit native-apply-session:bounded-controls
it('rejects oversized controls before newline and resumes at the next control',async()=>{
 const child=spawn(process.execPath,[cli,'--serve'],{stdio:['pipe','pipe','pipe'],windowsHide:true});let output='';
 child.stdout.on('data',chunk=>{output+=chunk.toString('utf8');});
 const closed=new Promise<number|null>(resolve=>child.once('close',resolve));
 try{
  child.stdin.write('x'.repeat(65537));
  await vi.waitFor(()=>expect(output).toContain('\n'),{timeout:10000});
  expect(JSON.parse(output.trim()).error.code).toBe('input-limit');
  child.stdin.end('\n'+JSON.stringify({request:path.join(root,'missing-after-limit.json'),out:path.join(root,'after-limit')})+'\n');
  expect(await closed).toBe(1);const results=output.trim().split('\n').map(line=>JSON.parse(line));expect(results).toHaveLength(2);expect(results[1].error.code).toBe('request-failure');
 }finally{child.kill();}
});
