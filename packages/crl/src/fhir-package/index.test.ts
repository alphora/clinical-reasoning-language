vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rm: vi.fn(actual.rm), rename: vi.fn(actual.rename) };
});
import { mkdtemp, mkdir, writeFile, readFile, rm, rename, symlink, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extract } from "tar";
import { packageFhir } from "./index";

const roots: string[] = [];
const base = "https://example.org/fhir";
const metadata = () => ({ name: "example-policy", version: "1.2.3", description: "Synthetic package test", author: "Test Author", license: "Apache-2.0", crl: { canonicalBase: base, packageId: "org.example.policy" } });
const definition = (resourceType = "PlanDefinition", id = "example-policy") => ({ resourceType, id, url: `${base}/${resourceType}/${id}`, version: "1.2.3", status: "draft" });
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "crl-fhir-package-")); roots.push(root);
  await mkdir(join(root, "src", "fhir", "PlanDefinition"), { recursive: true });
  await mkdir(join(root, "src", "cql"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify(metadata()));
  await writeFile(join(root, "src", "fhir", "PlanDefinition", "policy.json"), JSON.stringify(definition()));
  return root;
}
async function resource(root: string, filename: string, value: unknown): Promise<void> {
  await writeFile(join(root, "src", "fhir", filename), JSON.stringify(value));
}
async function unpack(root: string): Promise<Record<string, any>> {
  const dest = join(root, "unpacked"); await mkdir(dest, { recursive: true });
  await extract({ file: join(root, "output", "package.tgz"), cwd: dest });
  const out: Record<string, any> = {};
  for (const name of await readdir(join(dest, "package"))) out[name] = JSON.parse(await readFile(join(dest, "package", name), "utf8"));
  return out;
}
async function failure(root: string, expression: RegExp, options = {}): Promise<void> {
  const result = await packageFhir({ projectRoot: root, ...options });
  expect(result.success).toBe(false);
  if (!result.success) expect(result.errors.join("\n")).toMatch(expression);
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

// @kit fhir-packaging:archive-identity
test("actual archive has matching manifest, IG inventory and string-only v2 index; deterministic; canonical identities unchanged", async () => {
  const root = await fixture();
  await resource(root, "questionnaire.json", definition("Questionnaire")); // Same ID across types is intentional.
  const cql = 'library Example version \'1.2.3\'\n// UTF-8: café\n';
  await writeFile(join(root, "src", "cql", "Example.cql"), cql);
  await mkdir(join(root, "src", "fhir", "Library"));
  const library = { ...definition("Library", "Example"), type: { coding: [{ code: "logic-library" }] }, content: [{ contentType: "text/cql", url: "../../cql/Example.cql" }] };
  const sourcePath = join(root, "src", "fhir", "Library", "Example.json");
  await writeFile(sourcePath, JSON.stringify(library));
  const before = await readFile(sourcePath);
  const first = await packageFhir({ projectRoot: root });
  expect(first.success).toBe(true);
  const second = await packageFhir({ projectRoot: root });
  expect(second).toEqual(first);
  expect(await readFile(sourcePath)).toEqual(before);
  const archive = await unpack(root);
  expect(Object.keys(archive).sort()).toEqual([".index.json", "ImplementationGuide-example-policy.json", "Library-Example.json", "PlanDefinition-example-policy.json", "Questionnaire-example-policy.json", "package.json"]);
  expect(archive["package.json"]).toMatchObject({ name: "org.example.policy", version: "1.2.3", type: "IG", fhirVersions: ["4.0.1"], dependencies: { "hl7.fhir.r4.core": "4.0.1" } });
  const ig = archive["ImplementationGuide-example-policy.json"];
  expect(ig).toMatchObject({ url: `${base}/ImplementationGuide/example-policy`, packageId: "org.example.policy", license: "Apache-2.0" });
  expect(ig.definition.resource).toHaveLength(3);
  expect(ig.definition.resource.every((r: any) => r.exampleBoolean === false)).toBe(true);
  expect(archive["PlanDefinition-example-policy.json"]).toEqual(definition());
  expect(archive["Questionnaire-example-policy.json"]).toEqual(definition("Questionnaire"));
  expect(archive["Library-Example.json"].content).toEqual([{ contentType: "text/cql", data: Buffer.from(cql).toString("base64") }]);
  expect(archive[".index.json"]["index-version"]).toBe(2);
  expect(archive[".index.json"].files).toHaveLength(4);
  for (const file of archive[".index.json"].files) expect(Object.values(file).every(v => typeof v === "string")).toBe(true);
});

// @kit fhir-packaging:metadata-refusals
test.each([
  ["package ID", (m: any) => { m.crl.packageId = "example-policy"; }, /package ID/],
  ["long package ID", (m: any) => { m.crl.packageId = "org." + "a".repeat(61); }, /64/],
  ["version", (m: any) => { m.version = "1.2"; }, /SemVer/],
  ["leading zero prerelease", (m: any) => { m.version = "1.2.3-01"; }, /SemVer/],
  ["author", (m: any) => { delete m.author; }, /author/],
  ["description", (m: any) => { delete m.description; }, /description/],
  ["SPDX expression", (m: any) => { m.license = "MIT OR Apache-2.0"; }, /SPDX/],
  ["core mismatch", (m: any) => { m.crl.fhirDependencies = { "hl7.fhir.r4.core": "4.3.0" }; }, /core dependency/],
  ["range dependency", (m: any) => { m.crl.fhirDependencies = { "hl7.fhir.uv.cpg": "^2.0.0" }; }, /exact SemVer/],
])("refuses invalid %s before replacing an existing archive", async (_label, edit, message) => {
  const root = await fixture(); const m = metadata(); edit(m);
  await writeFile(join(root, "package.json"), JSON.stringify(m));
  await mkdir(join(root, "output")); await writeFile(join(root, "output", "package.tgz"), "old archive");
  await failure(root, message);
  expect(await readFile(join(root, "output", "package.tgz"), "utf8")).toBe("old archive");
  expect(await readdir(join(root, "output"))).toEqual(["package.tgz"]);
});

test("explicit package ID overrides metadata and absent license remains absent", async () => {
  const root = await fixture(); const m: any = metadata(); delete m.crl.packageId; delete m.license;
  await writeFile(join(root, "package.json"), JSON.stringify(m));
  expect((await packageFhir({ projectRoot: root, packageId: "org.example.override" })).success).toBe(true);
  const archive = await unpack(root);
  expect(archive["package.json"].name).toBe("org.example.override");
  expect(archive["ImplementationGuide-example-policy.json"].license).toBeUndefined();
});

test.each([
  ["duplicate identity", definition(), /Duplicate resource identity/],
  ["case collision", definition("PlanDefinition", "EXAMPLE-policy"), /case-insensitive/],
  ["duplicate canonical", { ...definition("ValueSet", "other"), url: definition().url }, /Duplicate canonical/],
  ["generated guide collision", definition("ImplementationGuide"), /collision/],
  ["missing ID", { ...definition("ValueSet"), id: undefined }, /missing id/],
  ["patient data", { resourceType: "Patient", id: "example" }, /patient\/case/],
])("refuses %s", async (_label, value, message) => {
  const root = await fixture(); await resource(root, "other.json", value); await failure(root, message);
});

test("malformed JSON fails without output", async () => {
  const root = await fixture(); await writeFile(join(root, "src", "fhir", "bad.json"), "{");
  expect((await packageFhir({ projectRoot: root })).success).toBe(false);
});

test("known external references require authored dependencies, without fetching them", async () => {
  const root = await fixture();
  await resource(root, "profiled.json", { ...definition("ValueSet", "options"), meta: { profile: ["http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-shareablevalueset"] } });
  await failure(root, /hl7.fhir.uv.crmi/);
  const m: any = metadata(); m.crl.fhirDependencies = { "hl7.fhir.uv.crmi": "2.0.0" };
  await writeFile(join(root, "package.json"), JSON.stringify(m));
  expect((await packageFhir({ projectRoot: root })).success).toBe(true);
  expect((await unpack(root))["package.json"].dependencies["hl7.fhir.uv.crmi"]).toBe("2.0.0");
});

test.each(["file:///C:/local.cql", "C:\\local.cql", "\\\\host\\share\\local.cql", "/local.cql", "%2Fetc/passwd", "../cql/missing.cql", "../../../outside.cql"])("refuses nonportable or missing attachment %s", async url => {
  const root = await fixture();
  await resource(root, "library.json", { ...definition("Library", "Example"), content: [{ contentType: "text/cql", url }] });
  expect((await packageFhir({ projectRoot: root })).success).toBe(false);
});

test("conflicting local/inline attachment is refused; equal bytes are accepted; remote and inline-only survive", async () => {
  const root = await fixture(); const data = Buffer.from("library Example").toString("base64");
  await writeFile(join(root, "src", "cql", "Example.cql"), "library Example");
  const library = { ...definition("Library", "Example"), content: [{ contentType: "text/cql", url: "../cql/Example.cql", data: "ZGlmZmVyZW50" }] };
  await resource(root, "library.json", library); await failure(root, /conflicts/);
  library.content[0].data = data;
  await resource(root, "library.json", library);
  await resource(root, "remote.json", { ...definition("Library", "Remote"), content: [{ contentType: "text/cql", url: "https://example.org/Remote.cql" }, { contentType: "text/cql", data }] });
  expect((await packageFhir({ projectRoot: root })).success).toBe(true);
  const archive = await unpack(root);
  expect(archive["Library-Example.json"].content[0]).toEqual({ contentType: "text/cql", data });
  expect(archive["Library-Remote.json"].content[0].url).toBe("https://example.org/Remote.cql");
});

test("rejects output in src and through a directory junction into src", async () => {
  const root = await fixture();
  await failure(root, /inside project src/, { outputFile: join(root, "src", "package.tgz") });
  await symlink(join(root, "src"), join(root, "alias"), process.platform === "win32" ? "junction" : "dir");
  await failure(root, /inside project src/, { outputFile: join(root, "alias", "package.tgz") });
});

test("rejects attachment junction escaping src and resource-tree links", async () => {
  const root = await fixture(); await mkdir(join(root, "outside")); await writeFile(join(root, "outside", "Example.cql"), "outside");
  await symlink(join(root, "outside"), join(root, "src", "escape"), process.platform === "win32" ? "junction" : "dir");
  await resource(root, "library.json", { ...definition("Library", "Example"), content: [{ contentType: "text/cql", url: "../escape/Example.cql" }] });
  await failure(root, /escapes project src/);
  await symlink(join(root, "outside"), join(root, "src", "fhir", "linked"), process.platform === "win32" ? "junction" : "dir");
  await failure(root, /symlinks/);
});

test("bundled external canonical only satisfies its actual version", async () => {
  const root = await fixture();
  const url = "http://hl7.org/fhir/uv/crmi/StructureDefinition/example";
  await resource(root, "external.json", { ...definition("StructureDefinition", "example"), url, version: "1.0.0" });
  await resource(root, "uses.json", { ...definition("ValueSet", "uses"), meta: { profile: [`${url}|2.0.0`] } });
  await failure(root, /hl7.fhir.uv.crmi/);
  await resource(root, "uses.json", { ...definition("ValueSet", "uses"), meta: { profile: [`${url}|1.0.0`] } });
  expect((await packageFhir({ projectRoot: root })).success).toBe(true);
});

test("cleanup failure cannot hide a successful archive publication", async () => {
  const root = await fixture();
  vi.mocked(rm).mockRejectedValueOnce(new Error("injected cleanup failure"));
  const result = await packageFhir({ projectRoot: root });
  expect(result.success).toBe(true);
  if (result.success) expect(result.warnings?.join("\n")).toMatch(/injected cleanup failure/);
  expect((await readFile(join(root, "output", "package.tgz"))).length).toBeGreaterThan(0);
});

test("cleanup failure preserves the original publication failure and old archive", async () => {
  const root = await fixture();
  await mkdir(join(root, "output")); await writeFile(join(root, "output", "package.tgz"), "old archive");
  vi.mocked(rename).mockRejectedValueOnce(new Error("injected rename failure"));
  vi.mocked(rm).mockRejectedValueOnce(new Error("injected cleanup failure"));
  const result = await packageFhir({ projectRoot: root });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.errors[0]).toMatch(/injected rename failure/);
    expect(result.errors[1]).toMatch(/injected cleanup failure/);
  }
  expect(await readFile(join(root, "output", "package.tgz"), "utf8")).toBe("old archive");
});
