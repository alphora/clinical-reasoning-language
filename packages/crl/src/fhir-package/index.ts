/** CRMI FHIR NPM packaging of already emitted definitions. No source mutation or registry access. */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { create } from "tar";
import { normalizePackageMetadata } from "../fhir-emitter/metadata";
import { pascalCaseName } from "../fhir-emitter/slug";
import spdxCodes from "./r4-spdx-license-codes.json";

export interface PackageFhirOptions {
  projectRoot: string;
  outputFile?: string;
  packageId?: string;
}
export type PackageFhirResult =
  | { success: true; outputFile: string; packageId: string; version: string; resourceCount: number; sha256: string; warnings?: string[] }
  | { success: false; errors: string[] };
type Json = Record<string, any>;

const packageName = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
// SemVer 2.0.0; numeric prerelease identifiers cannot have leading zeroes.
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const canonicalTypes = new Set(("ActivityDefinition CapabilityStatement ChargeItemDefinition CodeSystem CompartmentDefinition ConceptMap EffectEvidenceSynthesis EventDefinition Evidence EvidenceVariable ExampleScenario GraphDefinition ImplementationGuide Library Measure MessageDefinition NamingSystem OperationDefinition PlanDefinition Questionnaire ResearchDefinition ResearchElementDefinition RiskEvidenceSynthesis SearchParameter StructureDefinition StructureMap TerminologyCapabilities TestScript ValueSet").split(" "));
const externalPackages: [string, string][] = [
  ["http://hl7.org/fhir/uv/cpg/", "hl7.fhir.uv.cpg"],
  ["http://hl7.org/fhir/uv/crmi/", "hl7.fhir.uv.crmi"],
  ["http://hl7.org/fhir/uv/sdc/", "hl7.fhir.uv.sdc"],
  ["http://hl7.org/fhir/uv/cql/", "hl7.fhir.uv.cql"],
  ["http://terminology.hl7.org/", "hl7.terminology.r4"],
];
function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function inside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}
function object(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function json(value: unknown): string { return JSON.stringify(value, null, 2) + "\n"; }

async function readResources(directory: string): Promise<string[]> {
  requireThat(!(await fs.lstat(directory)).isSymbolicLink(), `Resource directory cannot be a symlink: ${directory}`);
  const files: string[] = [];
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const filename = path.join(directory, entry.name);
    requireThat(!entry.isSymbolicLink(), `Resource tree cannot contain symlinks: ${filename}`);
    if (entry.isDirectory()) files.push(...await readResources(filename));
    else if (entry.name.endsWith(".json")) {
      requireThat(entry.isFile(), `Expected a regular resource file: ${filename}`);
      files.push(filename);
    }
  }
  return files;
}

async function inlineAttachments(resource: Json, filename: string, sourceRoot: string): Promise<void> {
  if (resource.resourceType !== "Library" || !Array.isArray(resource.content)) return;
  for (const attachment of resource.content) {
    requireThat(object(attachment), `Invalid Library attachment in ${filename}`);
    if (attachment.url === undefined) continue;
    requireThat(nonempty(attachment.url), `Empty Library attachment URL in ${filename}`);
    const url: string = attachment.url;
    if (/^https?:\/\//i.test(url)) continue;
    // A local-machine URI cannot travel with a package. Do not interpret it as an external dependency.
    requireThat(!/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^[\\/]/.test(url), `Library attachment must use a relative src path or HTTP(S) URL: ${url}`);
    requireThat(!/[?#]/.test(url), `Local Library attachment URL cannot contain a query or fragment: ${url}`);
    const decoded = decodeURIComponent(url);
    requireThat(!/^[\\/]/.test(decoded) && !/^[a-z][a-z0-9+.-]*:/i.test(decoded) && !decoded.includes("\\"), `Invalid local Library attachment path: ${url}`);
    const target = await fs.realpath(path.resolve(path.dirname(filename), decoded));
    requireThat(inside(sourceRoot, target), `Library attachment escapes project src: ${url}`);
    requireThat((await fs.stat(target)).isFile(), `Library attachment is not a regular file: ${url}`);
    const bytes = await fs.readFile(target);
    if (attachment.data !== undefined) {
      requireThat(typeof attachment.data === "string" && Buffer.from(attachment.data, "base64").toString("base64") === attachment.data.replace(/\s/g, "") && Buffer.from(attachment.data, "base64").equals(bytes), `Library attachment data conflicts with local file: ${url}`);
    }
    attachment.data = bytes.toString("base64");
    delete attachment.url;
  }
}

function checkDependencies(value: unknown, dependencies: Json, included: Set<string>, location = ""): void {
  if (Array.isArray(value)) { for (const item of value) checkDependencies(item, dependencies, included, location); }
  else if (object(value)) {
    for (const [key, child] of Object.entries(value)) {
      // Reference-bearing FHIR fields, not prose, narrative or embedded CQL.
      if (["url", "uri", "canonical", "resource", "reference", "profile", "targetProfile", "valueCanonical", "valueUri", "system", "baseDefinition", "library", "valueSet", "definitionCanonical"].includes(key)) {
        const references = Array.isArray(child) ? child : [child];
        for (const reference of references) if (typeof reference === "string" && !included.has(reference)) {
          const dependency = externalPackages.find(([prefix]) => reference.startsWith(prefix));
          requireThat(!dependency || dependencies[dependency[1]], `${location}: reference ${reference} requires crl.fhirDependencies["${dependency?.[1]}"]. Declare its package version.`);
        }
      }
      checkDependencies(child, dependencies, included, location);
    }
  }
}

/** Resolve existing ancestors as well: an output path through a symlink must not alias src. */
async function physicalDestination(filename: string): Promise<string> {
  try { return await fs.realpath(filename); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = path.dirname(filename);
    requireThat(parent !== filename, `Cannot resolve output path: ${filename}`);
    return path.join(await physicalDestination(parent), path.basename(filename));
  }
}

export async function packageFhir(options: PackageFhirOptions): Promise<PackageFhirResult> {
  let staging: string | undefined;
  let stagingParent: string | undefined;
  let result: PackageFhirResult;
  try {
    requireThat(nonempty(options.projectRoot) && path.isAbsolute(options.projectRoot), "projectRoot must be an absolute project directory.");
    const root = await fs.realpath(options.projectRoot);
    const raw = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
    const normalized = normalizePackageMetadata(raw);
    requireThat(normalized.metadata, normalized.errors.map(e => e.message).join("\n"));
    const metadata = normalized.metadata;
    const packageId = options.packageId ?? raw.crl?.packageId;
    requireThat(typeof packageId === "string" && packageId.length <= 64 && packageName.test(packageId), "Provide crl.packageId (or packageId): a dotted lowercase FHIR package ID, at most 64 characters. Keep package.json name as the policy ID.");
    requireThat(semver.test(metadata.version), "package.json version must be a SemVer 2.0.0 version.");
    requireThat(nonempty(raw.author) || (object(raw.author) && nonempty(raw.author.name)), "package.json author is required for FHIR packaging.");
    requireThat(nonempty(raw.description), "package.json description is required for FHIR packaging.");
    requireThat(/^https?:\/\/[^\s]+$/.test(metadata.canonicalBase), "crl.canonicalBase must be an absolute HTTP(S) canonical base.");
    if (raw.license !== undefined) requireThat(typeof raw.license === "string" && (spdxCodes as string[]).includes(raw.license), "package.json license must be one exact R4 SPDX code (or not-open-source); npm license expressions are not IG license codes.");
    const dependencies: Json = { ...(metadata.fhirDependencies ?? {}) };
    for (const [id, version] of Object.entries(dependencies)) requireThat(packageName.test(id) && typeof version === "string" && semver.test(version), `FHIR dependency ${id} must have a dotted package ID and an exact SemVer version.`);
    requireThat(!dependencies[packageId], "A FHIR package cannot depend on itself.");
    requireThat(!dependencies["hl7.fhir.r4.core"] || dependencies["hl7.fhir.r4.core"] === "4.0.1", "FHIR R4 core dependency must be 4.0.1.");
    dependencies["hl7.fhir.r4.core"] = "4.0.1";
    const sourceRoot = await fs.realpath(path.join(root, "src"));
    requireThat(inside(root, sourceRoot), "Project src cannot resolve outside the project.");
    const files = await readResources(path.join(sourceRoot, "fhir"));
    requireThat(files.length > 0, "No emitted FHIR JSON resources found under src/fhir. Emit definitions first.");
    const resources: Json[] = [];
    for (const filename of files) {
      const resource = JSON.parse(await fs.readFile(filename, "utf8"));
      requireThat(object(resource) && canonicalTypes.has(resource.resourceType), `Expected a canonical FHIR R4 definition in ${filename}; patient/case data does not belong in this package.`);
      requireThat(nonempty(resource.url) && /^[a-z][a-z0-9+.-]*:[^\s]+$/i.test(resource.url), `Missing or invalid canonical url in ${filename}`);
      await inlineAttachments(resource, filename, sourceRoot);
      resources.push(resource);
    }
    const guide: Json = {
      resourceType: "ImplementationGuide", id: metadata.name,
      url: `${metadata.canonicalBase}/ImplementationGuide/${metadata.name}`,
      version: metadata.version, name: pascalCaseName(metadata.name),
      title: metadata.title || metadata.name, status: metadata.status,
      experimental: metadata.experimental, publisher: metadata.publisher,
      description: metadata.description, packageId, fhirVersion: ["4.0.1"],
      text: { status: "generated", div: '<div xmlns="http://www.w3.org/1999/xhtml"><p>FHIR definition package. The resource inventory is recorded in definition.resource.</p></div>' },
      definition: { resource: resources.map(r => ({ reference: { reference: `${r.resourceType}/${r.id}` }, exampleBoolean: false })) },
    };
    if (metadata.contact.length) guide.contact = [{ telecom: metadata.contact }];
    if (metadata.crlDate) guide.date = metadata.crlDate;
    if (raw.license !== undefined) guide.license = raw.license;
    if (nonempty(raw.copyright)) guide.copyright = raw.copyright;
    if (metadata.jurisdiction.length) guide.jurisdiction = metadata.jurisdiction;
    if (metadata.useContext.length) guide.useContext = metadata.useContext;
    resources.push(guide);
    const entries = new Map<string, string>();
    const filenames = new Set<string>();
    const canonicals = new Set<string>();
    const included = new Set<string>(resources.flatMap(r => r.version === undefined ? [r.url] : [r.url, `${r.url}|${r.version}`]));
    const index: Json[] = [];
    for (const resource of resources) {
      requireThat(typeof resource.id === "string" && /^[A-Za-z0-9.-]{1,64}$/.test(resource.id), `Invalid or missing id on ${resource.resourceType}: ${resource.url}`);
      const filename = `${resource.resourceType}-${resource.id}.json`;
      requireThat(!filenames.has(filename.toLowerCase()), `Duplicate resource identity or case-insensitive filename collision: ${filename}`);
      filenames.add(filename.toLowerCase());
      const canonical = `${resource.url}|${resource.version ?? ""}`;
      requireThat(!canonicals.has(canonical), `Duplicate canonical and version: ${canonical}`);
      canonicals.add(canonical);
      checkDependencies(resource, dependencies, included, filename);
      entries.set(filename, json(resource));
      const indexed: Json = { filename };
      for (const key of ["resourceType", "id", "url", "version", "kind", "type", "supplements", "content"]) if (typeof resource[key] === "string") indexed[key] = resource[key];
      index.push(indexed);
    }
    const manifest: Json = { name: packageId, version: metadata.version, type: "IG", canonical: metadata.canonicalBase, fhirVersions: ["4.0.1"], author: raw.author, description: metadata.description, dependencies };
    if (raw.license !== undefined) manifest.license = raw.license;
    entries.set("package.json", json(manifest));
    entries.set(".index.json", json({ "index-version": 2, files: index }));
    const outputFile = options.outputFile ?? path.join(root, "output", "package.tgz");
    requireThat(path.isAbsolute(outputFile) && outputFile.endsWith(".tgz"), "outputFile must be an absolute .tgz path.");
    const existingOutput = await fs.lstat(outputFile).catch(error => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    requireThat(!existingOutput || (existingOutput.isFile() && !existingOutput.isSymbolicLink()), "Package output must be a regular file, not a link or directory.");
    const destination = await physicalDestination(outputFile);
    requireThat(!inside(sourceRoot, destination), "Package output cannot be inside project src.");
    // All inputs are validated before creating staging or replacing the selected archive.
    stagingParent = path.dirname(destination);
    await fs.mkdir(stagingParent, { recursive: true });
    staging = await fs.mkdtemp(path.join(stagingParent, ".crl-package-"));
    await fs.mkdir(path.join(staging, "package"));
    for (const [filename, content] of entries) await fs.writeFile(path.join(staging, "package", filename), content, { mode: 0o644 });
    const archive = path.join(staging, "package.tgz");
    await create({ cwd: staging, file: archive, gzip: true, portable: true, mtime: new Date(0), strict: true }, [...entries.keys()].sort().map(f => `package/${f}`));
    const sha256 = createHash("sha256").update(await fs.readFile(archive)).digest("hex");
    await fs.rename(archive, destination);
    result = { success: true, outputFile: destination, packageId, version: metadata.version, resourceCount: resources.length, sha256 };
  } catch (error) {
    result = { success: false, errors: [(error as Error).message] };
  }
  if (staging && stagingParent && inside(stagingParent, staging) && path.dirname(staging) === stagingParent && path.basename(staging).startsWith(".crl-package-")) {
    try { await fs.rm(staging, { recursive: true, force: true }); }
    catch (error) {
      const warning = `Could not remove temporary package directory ${staging}: ${(error as Error).message}`;
      if (result.success) result.warnings = [warning];
      else result.errors.push(warning);
    }
  }
  return result;
}
