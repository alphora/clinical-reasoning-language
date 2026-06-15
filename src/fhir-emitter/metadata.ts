/**
 * package.json → CpgMetadata loader for the CRL→FHIR-def lane.
 *
 * Per Todo-1-discussion-057 Δ7: one CpgMetadata per emit closure,
 * sourced from `<projectRoot>/package.json`. Per Δ3: `crl.canonicalBase`
 * is the SOLE source for the FHIR canonical URL base — no `homepage`
 * fallback. Per Δ12: malformed `crl.useContext` / `crl.jurisdiction`
 * surface as `malformed-crl-metadata` diagnostics in the result envelope.
 *
 * Round-2 review tightening (gpt55 important #3 + Δ14 clarification):
 * neither `readPackageMetadata` nor `normalizePackageMetadata` ever
 * throw. ALL error conditions — filesystem unreadable, JSON parse
 * failure, missing required fields, malformed crl block — return a
 * non-null `errors` array with `metadata: null`. Callers consume the
 * envelope; the CLI / MCP boundary in Todo 4 reads `errors[]` rather
 * than wrapping in try/catch.
 *
 * `title` and `description` from package.json are stored as empty
 * strings when absent; the emitter defaults them to the CRL library
 * name at emit time so this module stays library-agnostic.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { CRLError } from "../types/errors";

import type {
  CpgMetadata,
  CodeableConcept,
  ContactPoint,
  UsageContext,
} from "./types";

export type MetadataResult =
  | { metadata: CpgMetadata; errors: CRLError[] }
  | { metadata: null; errors: CRLError[] };

/**
 * Read + normalize CPG metadata from a project root's package.json.
 * Never throws — returns a result envelope for ALL failure modes
 * (filesystem error, JSON parse error, malformed content, missing
 * required fields).
 */
export function readPackageMetadata(projectRoot: string): MetadataResult {
  const path = join(projectRoot, "package.json");
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    return {
      metadata: null,
      errors: [
        {
          type: "Exception",
          kind: "unreadable-package-json",
          message: `Cannot read ${path}: ${(e as Error).message}`,
        },
      ],
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return {
      metadata: null,
      errors: [
        {
          type: "Exception",
          kind: "unreadable-package-json",
          message: `Cannot parse ${path}: ${(e as Error).message}`,
        },
      ],
    };
  }
  return normalizePackageMetadata(raw);
}

/**
 * Pure normalizer — accepts a parsed package.json object and produces
 * CpgMetadata + diagnostics. Never throws. Single source of truth for
 * the package.json → CpgMetadata field-by-field mapping.
 */
export function normalizePackageMetadata(raw: unknown): MetadataResult {
  if (raw === null || typeof raw !== "object") {
    return {
      metadata: null,
      errors: [
        {
          type: "Exception",
          kind: "unreadable-package-json",
          message: "package.json is not an object",
        },
      ],
    };
  }
  const errors: CRLError[] = [];
  const obj = raw as Record<string, unknown>;
  const crl = (obj.crl as Record<string, unknown> | undefined) ?? {};

  // Δ3 — crl.canonicalBase required.
  // Round-2 (gpt55 important #4): strip trailing slashes to avoid
  // `http://example.org/base//ValueSet/...` double-slash drift when
  // the URL is concatenated downstream.
  let canonicalBase = typeof crl.canonicalBase === "string" ? crl.canonicalBase.trim() : "";
  canonicalBase = canonicalBase.replace(/\/+$/, "");
  if (!canonicalBase) {
    errors.push({
      type: "Validation",
      kind: "missing-canonical-url-base",
      message:
        "package.json `crl.canonicalBase` is required for FHIR Definition emit (cpg-shareableValueSet etc. mandate a canonical URL base). " +
        "Add e.g. `\"crl\": { \"canonicalBase\": \"http://example.org/crl/myproject\" }` to your project root's package.json.",
    });
    return { metadata: null, errors };
  }

  // CRMI requires `version` (1..1) at the shareable floor → it lands on every
  // emitted definitional resource, sourced from the npm package (authoritative).
  // Missing version is a hard error, not a "0.0.0" default.
  const version = typeof obj.version === "string" && obj.version.trim() ? obj.version.trim() : "";
  if (!version) {
    errors.push({
      type: "Validation",
      kind: "missing-package-version",
      message:
        "package.json `version` is required — CRMI requires `version` (1..1) at the shareable level on emitted FHIR, and the npm package is the authoritative source of truth.",
    });
  }
  const name = typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : "";

  // Reproducible-emit managed publication date (`crl.date`, ISO). Optional here;
  // the date-resolution chain (env / clock) covers the rest. Validate parseability
  // so a malformed value fails loudly at metadata load, not at serialization.
  let crlDate: string | undefined;
  if (crl.date !== undefined) {
    if (typeof crl.date !== "string" || Number.isNaN(Date.parse(crl.date))) {
      errors.push({
        type: "Validation",
        kind: "invalid-emit-date",
        message: `\`crl.date\` must be a parseable ISO date string; got ${JSON.stringify(crl.date)}`,
      });
    } else {
      crlDate = crl.date;
    }
  }

  // Targeted FHIR IG dependency versions (`crl.fhirDependencies`) — provenance /
  // assembly-manifest deps; NEVER stamped onto a resource.
  const fhirDependencies = normalizeFhirDependencies(crl.fhirDependencies, errors);

  const rawDescription = typeof obj.description === "string" ? obj.description.trim() : "";
  const title = rawDescription ? rawDescription.split(/\r?\n/)[0]!.trim() : "";
  const description = rawDescription;

  const { publisher, contact } = normalizeAuthor(obj.author);

  const status = normalizeStatus(crl.status, errors);
  const experimental = typeof crl.experimental === "boolean" ? crl.experimental : true;

  const jurisdiction = normalizeCodeableConceptList(crl.jurisdiction, "crl.jurisdiction", errors);
  const useContext = normalizeUseContextList(crl.useContext, errors);

  // If any blocking metadata error fired, abort — don't ship half-baked metadata.
  // A malformed `crl.date` blocks too: emitting with a silently-dropped managed
  // date would defeat reproducibility.
  if (
    errors.some(
      (e) =>
        e.kind === "malformed-crl-metadata" ||
        e.kind === "missing-package-version" ||
        e.kind === "invalid-emit-date",
    )
  ) {
    return { metadata: null, errors };
  }

  const metadata: CpgMetadata = {
    version,
    name,
    title,
    description,
    publisher,
    contact,
    canonicalBase,
    status,
    experimental,
    jurisdiction,
    useContext,
    ...(crlDate ? { crlDate } : {}),
    ...(fhirDependencies ? { fhirDependencies } : {}),
  };
  return { metadata, errors };
}

/**
 * Normalize `crl.fhirDependencies` — a flat map of FHIR IG package id → version
 * string (e.g. `{ "hl7.fhir.uv.cpg": "2.0.0", "hl7.fhir.uv.crmi": "2.0.0-ballot" }`). Provenance only; not emitted.
 * Returns undefined when absent; pushes `malformed-crl-metadata` on bad shape.
 */
function normalizeFhirDependencies(
  raw: unknown,
  errors: CRLError[],
): Record<string, string> | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push({
      type: "Validation",
      kind: "malformed-crl-metadata",
      message: `\`crl.fhirDependencies\` must be an object of "<package-id>": "<version>"; got ${Array.isArray(raw) ? "array" : typeof raw}`,
    });
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "string" || !v.trim()) {
      errors.push({
        type: "Validation",
        kind: "malformed-crl-metadata",
        message: `\`crl.fhirDependencies["${k}"]\` must be a non-empty version string`,
      });
      continue;
    }
    out[k] = v.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeStatus(
  raw: unknown,
  errors: CRLError[],
): CpgMetadata["status"] {
  if (raw === undefined) return "draft";
  if (typeof raw !== "string") {
    errors.push({
      type: "Validation",
      kind: "malformed-crl-metadata",
      message: `\`crl.status\` must be a string; got ${typeof raw}`,
    });
    return "draft";
  }
  const allowed = ["draft", "active", "retired", "unknown"] as const;
  if (!allowed.includes(raw as (typeof allowed)[number])) {
    errors.push({
      type: "Validation",
      kind: "malformed-crl-metadata",
      message: `\`crl.status\` = "${raw}" not allowed; expected one of ${allowed.join(", ")}`,
    });
    return "draft";
  }
  return raw as CpgMetadata["status"];
}

function normalizeAuthor(raw: unknown): {
  publisher: string;
  contact: ContactPoint[];
} {
  if (raw === undefined || raw === null) {
    return { publisher: "unknown", contact: [] };
  }
  if (typeof raw === "string") {
    // Round-2 (gpt55 important #6): handle email-only form `<email>`
    // (no name preceding the angle brackets) — the main regex's
    // [^<(]+? requires at least one non-angle char before `<email>`.
    const emailOnly = raw.match(/^\s*<([^>]+)>\s*(?:\(([^)]+)\))?\s*$/);
    if (emailOnly) {
      const contact: ContactPoint[] = [{ system: "email", value: emailOnly[1]!.trim() }];
      if (emailOnly[2]) contact.push({ system: "url", value: emailOnly[2]!.trim() });
      return { publisher: "unknown", contact };
    }
    // npm permits "Name <email> (url)" — parse loosely.
    const m = raw.match(/^([^<(]+?)(?:\s*<([^>]+)>)?(?:\s*\(([^)]+)\))?\s*$/);
    if (!m) return { publisher: raw.trim(), contact: [] };
    const publisher = (m[1] ?? "").trim() || "unknown";
    const contact: ContactPoint[] = [];
    if (m[2]) contact.push({ system: "email", value: m[2]!.trim() });
    if (m[3]) contact.push({ system: "url", value: m[3]!.trim() });
    return { publisher, contact };
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const publisher =
      typeof o.name === "string" && o.name.trim() ? o.name.trim() : "unknown";
    const contact: ContactPoint[] = [];
    if (typeof o.email === "string" && o.email.trim()) {
      contact.push({ system: "email", value: o.email.trim() });
    }
    if (typeof o.url === "string" && o.url.trim()) {
      contact.push({ system: "url", value: o.url.trim() });
    }
    return { publisher, contact };
  }
  return { publisher: "unknown", contact: [] };
}

function normalizeCodeableConceptList(
  raw: unknown,
  field: string,
  errors: CRLError[],
): CodeableConcept[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    errors.push({
      type: "Validation",
      kind: "malformed-crl-metadata",
      message: `\`${field}\` must be an array; got ${typeof raw}`,
    });
    return [];
  }
  const out: CodeableConcept[] = [];
  for (const [i, entry] of raw.entries()) {
    if (entry === null || typeof entry !== "object") {
      errors.push({
        type: "Validation",
        kind: "malformed-crl-metadata",
        message: `\`${field}[${i}]\` must be an object`,
      });
      continue;
    }
    const e = entry as Record<string, unknown>;
    if (!Array.isArray(e.coding)) {
      errors.push({
        type: "Validation",
        kind: "malformed-crl-metadata",
        message: `\`${field}[${i}].coding\` must be an array`,
      });
      continue;
    }
    // Round-2 (gpt55 important #7): validate each coding entry's
    // shape, not just that `coding` is an array. A malformed
    // package can pass shallow normalization and emit non-conformant
    // FHIR downstream.
    let codingOk = true;
    for (const [j, c] of e.coding.entries()) {
      if (c === null || typeof c !== "object") {
        errors.push({
          type: "Validation",
          kind: "malformed-crl-metadata",
          message: `\`${field}[${i}].coding[${j}]\` must be an object`,
        });
        codingOk = false;
        continue;
      }
      const co = c as Record<string, unknown>;
      if (typeof co.system !== "string" || typeof co.code !== "string") {
        errors.push({
          type: "Validation",
          kind: "malformed-crl-metadata",
          message: `\`${field}[${i}].coding[${j}]\` requires string \`system\` and string \`code\``,
        });
        codingOk = false;
      }
    }
    if (codingOk) out.push(entry as CodeableConcept);
  }
  return out;
}

function normalizeUseContextList(raw: unknown, errors: CRLError[]): UsageContext[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    errors.push({
      type: "Validation",
      kind: "malformed-crl-metadata",
      message: `\`crl.useContext\` must be an array; got ${typeof raw}`,
    });
    return [];
  }
  const out: UsageContext[] = [];
  for (const [i, entry] of raw.entries()) {
    if (entry === null || typeof entry !== "object") {
      errors.push({
        type: "Validation",
        kind: "malformed-crl-metadata",
        message: `\`crl.useContext[${i}]\` must be an object`,
      });
      continue;
    }
    const e = entry as Record<string, unknown>;
    const code = e.code as Record<string, unknown> | undefined;
    const value = e.valueCodeableConcept as Record<string, unknown> | undefined;
    if (
      !code ||
      typeof code.system !== "string" ||
      typeof code.code !== "string" ||
      !value ||
      !Array.isArray(value.coding)
    ) {
      errors.push({
        type: "Validation",
        kind: "malformed-crl-metadata",
        message:
          `\`crl.useContext[${i}]\` must shape { code: { system, code }, valueCodeableConcept: { coding: […] } }`,
      });
      continue;
    }
    out.push(entry as UsageContext);
  }
  return out;
}
