import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { canonicalizeFsPath } from "../imports/paths";
import { findProjectRoot } from "../imports/registry";
import { validateCRLImports } from "../imports/validate";
import {
  planPresentationEdit,
  revertPresentationEditInSource,
  sourceSha256,
  PresentationEditError,
  type PresentationEditRequest,
  type PresentationEditReceipt,
} from "./presentationEdit";

export interface PresentationFileTarget {
  projectRoot: string;
  filePath: string;
}
export interface PresentationFileReceipt extends PresentationFileTarget {
  edit: PresentationEditReceipt;
}
export interface PresentationFileOptions {
  overlays?: ReadonlyMap<string, string>;
}
const fail = (code: string, message: string): never => {
  throw new PresentationEditError(code, message);
};
const contains = (root: string, file: string): boolean => {
  const rel = path.relative(root, file);
  return rel !== "" && !path.isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + path.sep);
};
const ignored = new Set(["node_modules", "dist", "build"]);
const MAX_SOURCE_BYTES = 1_000_000;

/** The owning package is explicit. This is filesystem containment, not a workflow authorization credential. */
export function resolvePresentationFile(target: PresentationFileTarget): PresentationFileTarget {
  if (
    !target ||
    typeof target.projectRoot !== "string" ||
    typeof target.filePath !== "string" ||
    !path.isAbsolute(target.projectRoot) ||
    !path.isAbsolute(target.filePath)
  )
    return fail(
      "invalid-target",
      "An absolute owning project root and CRL file path are required.",
    );
  const root = canonicalizeFsPath(fs.realpathSync(target.projectRoot));
  const lexicalFile = canonicalizeFsPath(target.filePath),
    file = canonicalizeFsPath(fs.realpathSync(lexicalFile));
  if (
    !contains(root, lexicalFile) ||
    !contains(root, file) ||
    path.extname(file).toLowerCase() !== ".crl" ||
    !fs.statSync(file).isFile()
  )
    return fail("outside-owner", "The CRL file must be inside its explicit owning project.");
  if (
    [target.projectRoot, lexicalFile, root, file].some((name) =>
      path
        .resolve(name)
        .split(/[\\/]/)
        .some((part) => part.toLowerCase() === "node_modules"),
    )
  )
    return fail(
      "packaged-target",
      "Installed package files are not local editing targets, even when selected as the project root.",
    );
  const relative = path.relative(root, lexicalFile).split(path.sep);
  if (relative.some((part) => ignored.has(part) || part.startsWith(".")))
    return fail(
      "packaged-target",
      "Package, generated and hidden files are not local editing targets.",
    );
  // Refuse linked target paths: replacing a link is not editing its original entry.
  let current = root;
  for (const part of relative) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink())
      return fail(
        "linked-target",
        "Open the owning project through a direct file path before editing a linked target.",
      );
  }
  const owner = findProjectRoot(file);
  if (!owner || canonicalizeFsPath(fs.realpathSync(owner)) !== root)
    return fail(
      "wrong-project",
      "The selected file belongs to a different or missing package.json project.",
    );
  return { projectRoot: root, filePath: file };
}

/** Capture discovery as well as content, including excluded nested-package boundaries and broken files. */
function projectSnapshot(target: PresentationFileTarget, overlays: ReadonlyMap<string, string>) {
  const entries: [string, string][] = [];
  let bytes = 0;
  const add = (key: string, value: string) => {
    if (entries.length >= 30_000)
      fail("snapshot-limit", "Project discovery exceeds the editing snapshot limit.");
    entries.push([key, value]);
  };
  const file = (name: string) => {
    if (!fs.existsSync(name)) {
      add(name, "missing");
      return;
    }
    const stat = fs.statSync(name);
    if (!stat.isFile())
      return fail("invalid-project-input", `Expected a regular project input: ${name}`);
    if (stat.size > MAX_SOURCE_BYTES || bytes + stat.size > 50_000_000)
      return fail("snapshot-limit", "Project input exceeds the editing snapshot size limit.");
    const raw = fs.readFileSync(name);
    bytes += raw.byteLength;
    add(
      name,
      JSON.stringify({
        real: fs.realpathSync(name),
        sha256: createHash("sha256").update(raw).digest("hex"),
      }),
    );
  };
  const local = (dir: string) => {
    const members = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => !e.name.startsWith(".") && !ignored.has(e.name));
    add(
      dir + "/discovery",
      JSON.stringify(
        members
          .filter((e) => e.isDirectory() || e.name.endsWith(".crl") || e.name === "package.json")
          .map((e) => [e.name, e.isDirectory(), e.isSymbolicLink()])
          .sort(),
      ),
    );
    for (const entry of members) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const boundary = path.join(full, "package.json");
        file(boundary);
        if (!fs.existsSync(boundary)) local(full);
      } else if (entry.isFile() && entry.name.endsWith(".crl")) file(full);
    }
  };
  file(path.join(target.projectRoot, "package.json"));
  local(target.projectRoot);
  const modules = path.join(target.projectRoot, "node_modules");
  const packages = (dir: string, scoped = false) => {
    if (!fs.existsSync(dir)) {
      add(dir, "missing");
      return;
    }
    const members = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."));
    add(dir + "/packages", JSON.stringify(members.map((e) => e.name).sort()));
    for (const member of members) {
      const full = path.join(dir, member.name);
      if (!scoped && member.name.startsWith("@")) {
        packages(full, true);
        continue;
      }
      const manifest = path.join(full, "package.json");
      file(manifest);
      if (!fs.existsSync(manifest)) continue;
      let data: any;
      try {
        data = JSON.parse(fs.readFileSync(manifest, "utf8"));
      } catch {
        continue;
      }
      const libraries = data?.crl?.libraries;
      if (Array.isArray(libraries))
        for (const name of libraries)
          if (typeof name === "string") {
            const resolved = path.resolve(full, name);
            if (contains(full, resolved)) file(resolved);
          }
    }
  };
  packages(modules);
  for (const [name, text] of overlays) add(name + "/overlay", sourceSha256(text));
  entries.sort(([a], [b]) => a.localeCompare(b));
  return {
    fingerprint: sourceSha256(JSON.stringify(entries)),
    inputs: entries.map(([name]) => name),
  };
}
function normalizedOverlays(overlays?: ReadonlyMap<string, string>) {
  const normalized = new Map<string, string>();
  for (const [file, text] of overlays ?? []) normalized.set(canonicalizeFsPath(file), text);
  return normalized;
}
function sourceOf(file: string, overlays: ReadonlyMap<string, string>) {
  const size = fs.statSync(file).size;
  if (size > MAX_SOURCE_BYTES)
    return fail("source-limit", "CRL source exceeds the 1 MB editing limit.");
  const bytes = fs.readFileSync(file);
  const saved = bytes.toString("utf8");
  if (!Buffer.from(saved, "utf8").equals(bytes))
    return fail(
      "invalid-encoding",
      "Saved CRL must be lossless UTF-8 before editing; no source was changed.",
    );
  const source = overlays.get(file) ?? saved;
  if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES)
    return fail("source-limit", "CRL source exceeds the 1 MB editing limit.");
  return source;
}
function validateCandidate(
  target: PresentationFileTarget,
  candidate: string,
  overlays: ReadonlyMap<string, string>,
) {
  if (Buffer.from(candidate, "utf8").toString("utf8") !== candidate)
    return fail("invalid-encoding", "Candidate CRL must be lossless UTF-8 before writing.");
  const candidateOverlays = new Map(overlays);
  candidateOverlays.set(target.filePath, candidate.replace(/^\uFEFF/, ""));
  const result = validateCRLImports(target.filePath, { overlays: candidateOverlays });
  const broken = result.importDiagnostics.filter(
    (d) => d.kind === "parse-failure" || d.kind === "package-resolution-failure",
  );
  if (!result.success || broken.length)
    return fail(
      "project-validation",
      JSON.stringify({
        message: "Candidate failed project source/import validation; no source was changed.",
        importDiagnostics: result.importDiagnostics,
        validationErrors: result.validationErrors,
      }),
    );
  return {
    coverage:
      "Project source/import validation, local presentation resolution and unrelated AST preservation",
    warnings: [...result.importDiagnostics, ...result.validationWarnings],
    remaining: [
      "Emission presentation coexistence checks",
      "Native display and renewed wording review",
    ],
  };
}

/** Shared by the saved-file MCP and unsaved-buffer editor adapters. No mutation. */
export function previewPresentationFileEdit(
  input: PresentationFileTarget,
  request: PresentationEditRequest,
  options: PresentationFileOptions = {},
) {
  const target = resolvePresentationFile(input),
    overlays = normalizedOverlays(options.overlays);
  const snapshot = projectSnapshot(target, overlays),
    source = sourceOf(target.filePath, overlays);
  const plan = planPresentationEdit(source, request),
    validation = validateCandidate(target, plan.candidateSource, overlays);
  const after = projectSnapshot(target, overlays);
  if (snapshot.fingerprint !== after.fingerprint)
    return fail("stale-project", "Project inputs changed during preview. Preview again.");
  const previewToken = sourceSha256(
    JSON.stringify({
      target,
      request: plan.request,
      before: plan.beforeSha256,
      after: plan.afterSha256,
      project: snapshot.fingerprint,
    }),
  );
  return {
    ...plan,
    ...target,
    previewToken,
    projectFingerprint: snapshot.fingerprint,
    validation,
    source,
    validationInputs: snapshot.inputs,
    savedFileBoundary:
      "MCP sees saved files only. Save or reconcile open editor buffers before a filesystem apply.",
  };
}

/** One optimistic saved-file replacement; there are no locks or cross-process transaction claims. */
function writeCandidate(
  target: PresentationFileTarget,
  source: string,
  candidate: string,
  expectedProject: string,
) {
  const temporary = path.join(path.dirname(target.filePath), `.crl-wording-${randomUUID()}.tmp`);
  let owned = false;
  try {
    const descriptor = fs.openSync(temporary, "wx", fs.statSync(target.filePath).mode);
    owned = true;
    try {
      fs.writeFileSync(descriptor, candidate, { encoding: "utf8" });
    } finally {
      fs.closeSync(descriptor);
    }
    const current = resolvePresentationFile(target);
    if (
      current.filePath !== target.filePath ||
      projectSnapshot(target, new Map()).fingerprint !== expectedProject ||
      fs.readFileSync(target.filePath, "utf8") !== source
    )
      return fail(
        "stale-project",
        "Project inputs changed before apply. Preview again; no source was replaced.",
      );
    // A writer outside this protocol can still race the final check/rename syscall window.
    fs.renameSync(temporary, target.filePath);
    owned = false;
  } finally {
    if (owned) fs.unlinkSync(temporary);
  }
}
export function applyPresentationFileEdit(
  target: PresentationFileTarget,
  request: PresentationEditRequest,
  previewToken: string,
) {
  const preview = previewPresentationFileEdit(target, request);
  if (typeof previewToken !== "string" || preview.previewToken !== previewToken)
    return fail(
      "stale-preview",
      "Source, project inputs, or proposed wording changed since preview. Preview again.",
    );
  writeCandidate(preview, preview.source, preview.candidateSource, preview.projectFingerprint);
  return {
    filePath: preview.filePath,
    afterSha256: preview.afterSha256,
    validation: preview.validation,
    impact: preview.impact,
    receipt: {
      projectRoot: preview.projectRoot,
      filePath: preview.filePath,
      edit: preview.receipt,
    } satisfies PresentationFileReceipt,
  };
}
export function revertPresentationFileEdit(receipt: PresentationFileReceipt) {
  const target = resolvePresentationFile(receipt),
    overlays = new Map<string, string>();
  const snapshot = projectSnapshot(target, overlays),
    source = sourceOf(target.filePath, overlays);
  const candidate = revertPresentationEditInSource(source, receipt.edit),
    validation = validateCandidate(target, candidate, overlays);
  writeCandidate(target, source, candidate, snapshot.fingerprint);
  return { filePath: target.filePath, afterSha256: sourceSha256(candidate), validation };
}
