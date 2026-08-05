/**
 * FHIR `id` conformance checker (#237/T3).
 *
 * Emit-time id derivation (#237/T1) guarantees every NEWLY emitted resource id
 * is `<= 64` chars and on-charset. But it cannot reach resources ALREADY
 * committed to a content repo with invalid ids (e.g. a pre-fix exemplar with a
 * 76-char id, `success:true`, no diagnostic). This scans committed FHIR JSON and
 * flags any resource `id` that violates the FHIR id rule so a content project can
 * find and fix the stragglers. It does NOT fix — fixing on-disk bytes is the
 * content repo's migration, not this tool's job.
 *
 * Scope (deliberate v1 boundary): each file's TOP-LEVEL resource id and, for a
 * Bundle, every `entry[].resource` id (recursively — a Bundle of Bundles). It
 * does NOT descend `contained[]` or `Parameters.parameter[].resource`.
 *
 * READ-ONLY. Single-threaded sync I/O, BOUNDED walk (skips
 * node_modules/.git/dist/dot-dirs; caps both JSON files collected and directory
 * entries visited; skips oversized files) — safe on the Dev Drive.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** FHIR R5 `id` datatype: `[A-Za-z0-9-.]{1,64}`. Mirrors the emit-side cap in `slug.ts` (SLUG_MAX_LEN). */
export const FHIR_ID_MAX_LEN = 64;
const FHIR_ID_CHARSET = /^[A-Za-z0-9.\-]+$/;

export type IdViolationReason = "too-long" | "invalid-char" | "empty" | "non-string";

export interface IdViolation {
  file: string;
  resourceType: string;
  id: string;
  idLength: number;
  reasons: IdViolationReason[];
  /** Where the resource sits in the file: "root", or an accumulated Bundle path. */
  location: string;
}

export interface CheckReadError {
  file: string;
  message: string;
}

export interface CheckReport {
  /** True iff zero violations were found among the files actually parsed. See `complete`. */
  pass: boolean;
  /** True iff the scan finished with nothing skipped: not truncated AND no read/parse errors. */
  complete: boolean;
  filesChecked: number;
  resourcesChecked: number;
  violations: IdViolation[];
  readErrors: CheckReadError[];
  /** Present iff a cap was hit; carries the cap and a note. */
  truncated?: { cap: number; note: string };
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist"]);
const DEFAULT_FILE_CAP = 20000;
const DEFAULT_VISIT_CAP = 200000;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/**
 * The reasons an `id` FIELD is non-conformant, or `null` when it is fine. `present`
 * says whether the key exists at all: an ABSENT id is not this tool's concern
 * (many inline resources omit it), but a PRESENT id that is empty, non-string, too
 * long, or off-charset IS a violation.
 */
function idReasons(id: unknown, present: boolean): IdViolationReason[] | null {
  if (!present) return null;
  if (typeof id !== "string") return ["non-string"];
  if (id.length === 0) return ["empty"];
  const reasons: IdViolationReason[] = [];
  if (id.length > FHIR_ID_MAX_LEN) reasons.push("too-long");
  if (!FHIR_ID_CHARSET.test(id)) reasons.push("invalid-char");
  return reasons.length > 0 ? reasons : null;
}

/**
 * Collect id violations from ONE parsed JSON value: the top-level resource plus,
 * for a Bundle, each `entry[].resource` (recursively). Pure — no I/O. Returns the
 * violations and the count of resources actually inspected (has a `resourceType`).
 */
export function collectIdViolations(
  parsed: unknown,
  file: string,
): { violations: IdViolation[]; resourceCount: number } {
  const violations: IdViolation[] = [];
  let resourceCount = 0;

  const check = (res: unknown, location: string): void => {
    if (!res || typeof res !== "object") return;
    const r = res as { resourceType?: unknown; id?: unknown; entry?: unknown };
    if (typeof r.resourceType !== "string") return;
    resourceCount += 1;
    const present = Object.prototype.hasOwnProperty.call(r, "id");
    const reasons = idReasons(r.id, present);
    if (reasons) {
      violations.push({
        file,
        resourceType: r.resourceType,
        id: typeof r.id === "string" ? r.id : String(r.id),
        idLength: typeof r.id === "string" ? r.id.length : 0,
        reasons,
        location,
      });
    }
    if (r.resourceType === "Bundle" && Array.isArray(r.entry)) {
      const base = location === "root" ? "" : `${location}.`;
      r.entry.forEach((e: unknown, i: number) => {
        if (e && typeof e === "object" && "resource" in (e as object)) {
          check((e as { resource?: unknown }).resource, `${base}entry[${i}].resource`);
        }
      });
    }
  };

  check(parsed, "root");
  return { violations, resourceCount };
}

/**
 * Scan `rootPath` (an absolute directory to walk, or a single `.json` file) for
 * FHIR id violations. A JSON parse failure or an oversized file is a `readError`
 * (surfaced, does NOT flip `pass`, but DOES flip `complete`); a non-FHIR JSON file
 * (no `resourceType`) is silently skipped. Throws if the root is unreadable
 * (`statSync`) or a non-`.json` file (a wrong-extension single-file root is a
 * caller error, not a clean empty pass) — the caller maps it to an error.
 */
export function scanFhirIds(
  rootPath: string,
  opts: { fileCap?: number; visitCap?: number } = {},
): CheckReport {
  const fileCap = opts.fileCap ?? DEFAULT_FILE_CAP;
  const visitCap = opts.visitCap ?? DEFAULT_VISIT_CAP;
  const violations: IdViolation[] = [];
  const readErrors: CheckReadError[] = [];
  let truncated: CheckReport["truncated"];
  let visited = 0;

  const jsonFiles: string[] = [];
  const st = statSync(rootPath);

  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      readErrors.push({ file: dir, message: (e as Error).message });
      return;
    }
    // Sort for a deterministic (reproducible) scan order under truncation.
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const ent of entries) {
      if (jsonFiles.length >= fileCap || visited >= visitCap) {
        truncated = {
          cap: jsonFiles.length >= fileCap ? fileCap : visitCap,
          note:
            jsonFiles.length >= fileCap
              ? `scan stopped at the ${fileCap}-JSON-file cap; the tree was not fully checked`
              : `scan stopped at the ${visitCap}-entry visit cap; the tree was not fully checked`,
        };
        return;
      }
      visited += 1;
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name) || ent.name.startsWith(".")) continue;
        walk(full);
        if (truncated) return;
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith(".json")) {
        jsonFiles.push(full);
      }
    }
  };

  if (st.isDirectory()) {
    walk(rootPath);
  } else if (st.isFile()) {
    if (!rootPath.toLowerCase().endsWith(".json")) {
      throw new Error(`Not a .json file: "${rootPath}" (pass a directory or a .json file).`);
    }
    jsonFiles.push(rootPath);
  }

  let resourcesChecked = 0;
  for (const file of jsonFiles) {
    let size: number;
    try {
      size = statSync(file).size;
    } catch (e) {
      readErrors.push({ file, message: (e as Error).message });
      continue;
    }
    if (size > MAX_FILE_BYTES) {
      readErrors.push({ file, message: `skipped: ${size} bytes exceeds the ${MAX_FILE_BYTES}-byte cap` });
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, "utf-8"));
    } catch (e) {
      readErrors.push({ file, message: (e as Error).message });
      continue;
    }
    const collected = collectIdViolations(parsed, file);
    resourcesChecked += collected.resourceCount;
    violations.push(...collected.violations);
  }

  return {
    pass: violations.length === 0,
    complete: !truncated && readErrors.length === 0,
    filesChecked: jsonFiles.length,
    resourcesChecked,
    violations,
    readErrors,
    ...(truncated ? { truncated } : {}),
  };
}
