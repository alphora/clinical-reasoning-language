/**
 * Resolve the PA disposition configuration for a content project.
 *
 * Two entry points, mirroring `fhir-emitter/metadata.ts` (readPackageMetadata → normalizePackageMetadata):
 *  - `normalizeDispositionConfig(raw)` — PURE: takes the raw `crl.dispositions` value, merges defaults, validates,
 *    returns the resolved config + a flat error list. Never throws. Unit-tested against mock config (no files).
 *  - `resolveDispositionConfig(projectRoot)` — reads `<projectRoot>/package.json`, extracts `crl.dispositions`,
 *    delegates to `normalizeDispositionConfig`. Never throws.
 *
 * Deliberately its OWN module (not part of `fhir-emitter/metadata.ts`, which is FHIR-emit-owned and hard-requires
 * canonicalBase/version/name): the validator, CRE, the kit surfacing, and emit all consume this without pulling in
 * FHIR-definition metadata. Structural validation only — mode-vs-finality policy checks (e.g. a standalone policy
 * using a non-final leaf) belong to the kit/authoring layer, not config resolution.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CATEGORY_BY_NAME,
  DEFAULT_MODE,
  DEFAULT_OPTIONS,
  DISPOSITION_CATEGORIES,
  DISPOSITION_CONFIG_VERSION,
} from "./categories";
import type {
  DispositionCode,
  DispositionConfigError,
  DispositionMode,
  DispositionResolution,
  ResolvedOption,
} from "./types";

/** The internal (validated) option shape carried between normalize and buildResolution. */
type NormalizedOption = { label: string; narrative?: string; code?: DispositionCode };

/** The stable id of a `(category, key)` determination leaf. */
export function leafId(category: string, key: string): string {
  return `${category}/${key}`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Category display-order index, so resolved leaves sort by framework category order. */
const CATEGORY_ORDER = new Map(DISPOSITION_CATEGORIES.map((c, i) => [c.name, i]));

/** Option keys that would pollute a prototype or break the `category/key` leaf-id space. */
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function buildResolution(
  version: number,
  mode: DispositionMode,
  options: Record<string, Record<string, NormalizedOption>>,
  errors: DispositionConfigError[],
): DispositionResolution {
  const leaves: ResolvedOption[] = [];
  // Iterate categories in framework order (stable), then option keys in ECMAScript enumeration order.
  const categoryNames = Object.keys(options).sort(
    (a, b) => (CATEGORY_ORDER.get(a) ?? 999) - (CATEGORY_ORDER.get(b) ?? 999),
  );
  for (const categoryName of categoryNames) {
    const category = CATEGORY_BY_NAME.get(categoryName);
    if (!category) continue; // an unknown-category error was already recorded during validation
    for (const [key, opt] of Object.entries(options[categoryName])) {
      leaves.push({
        category: category.name,
        key,
        label: opt.label,
        narrative: opt.narrative,
        code: opt.code,
        reviewActionCode: category.reviewActionCode,
        finality: category.finality,
      });
    }
  }
  // `Object.create(null)` — a leaf id like "certify/__proto__" is a safe own-property key here (it contains "/"),
  // but null-proto keeps byLeaf free of inherited members regardless.
  const byLeaf: Record<string, ResolvedOption> = Object.create(null);
  for (const leaf of leaves) byLeaf[leafId(leaf.category, leaf.key)] = leaf;
  return { config: { version, mode, options: leaves, byLeaf }, errors };
}

/**
 * Validate + merge a raw `crl.dispositions` value. Returns the resolved config plus the structural errors found.
 * Never throws. Best-effort: on a MALFORMED block it falls back to the default vocabulary; a DECLARED-but-
 * degenerate vocabulary (empty / all-invalid) is returned as-is with an `empty-vocabulary` WARNING (not silently
 * replaced with defaults — that would mask an intentional-but-wrong config). A consumer MUST treat any
 * `severity: "error"` as blocking rather than silently using the returned config.
 */
export function normalizeDispositionConfig(raw: unknown): DispositionResolution {
  const errors: DispositionConfigError[] = [];

  if (raw === undefined || raw === null) {
    return buildResolution(DISPOSITION_CONFIG_VERSION, DEFAULT_MODE, DEFAULT_OPTIONS, errors);
  }
  if (!isPlainObject(raw)) {
    errors.push({
      kind: "malformed-config",
      severity: "error",
      path: [],
      message: "`crl.dispositions` must be an object; falling back to the default Approve/Deny vocabulary.",
    });
    return buildResolution(DISPOSITION_CONFIG_VERSION, DEFAULT_MODE, DEFAULT_OPTIONS, errors);
  }

  // version
  let version = DISPOSITION_CONFIG_VERSION;
  if (raw.version !== undefined) {
    if (typeof raw.version !== "number" || !Number.isInteger(raw.version)) {
      errors.push({
        kind: "malformed-version",
        severity: "error",
        path: ["version"],
        message: "`crl.dispositions.version` must be an integer.",
      });
    } else if (raw.version !== DISPOSITION_CONFIG_VERSION) {
      // A WARNING, not fatal: best-effort-parse the rest so a version bump degrades gracefully; any genuinely
      // incompatible structure still surfaces via the specific mode/options/category checks below.
      errors.push({
        kind: "unknown-version",
        severity: "warning",
        path: ["version"],
        message: `Unknown \`crl.dispositions.version\` ${raw.version}; this build understands version ${DISPOSITION_CONFIG_VERSION}. Proceeding best-effort.`,
      });
      version = raw.version; // preserve what was declared so a caller can report it
    }
  }

  // mode
  let mode: DispositionMode = DEFAULT_MODE;
  if (raw.mode !== undefined) {
    if (raw.mode === "standalone" || raw.mode === "embedded") {
      mode = raw.mode;
    } else {
      errors.push({
        kind: "unknown-mode",
        severity: "error",
        path: ["mode"],
        message: `Unknown \`crl.dispositions.mode\` "${String(raw.mode)}"; valid modes: standalone, embedded. Using "${DEFAULT_MODE}".`,
      });
    }
  }

  // options — present → fully defines the vocabulary (no merge with defaults); absent → defaults.
  let options: Record<string, Record<string, NormalizedOption>>;
  const declaredOptions = raw.options !== undefined;
  if (!declaredOptions) {
    options = DEFAULT_OPTIONS;
  } else if (!isPlainObject(raw.options)) {
    errors.push({
      kind: "malformed-options",
      severity: "error",
      path: ["options"],
      message: "`crl.dispositions.options` must be an object of category → { key → { label } }.",
    });
    options = DEFAULT_OPTIONS;
  } else {
    options = Object.create(null);
    for (const [categoryName, keyed] of Object.entries(raw.options)) {
      if (!CATEGORY_BY_NAME.has(categoryName)) {
        errors.push({
          kind: "unknown-category",
          severity: "error",
          path: ["options", categoryName],
          message: `Unknown disposition category "${categoryName}"; valid categories: ${DISPOSITION_CATEGORIES.map((c) => c.name).join(", ")}.`,
        });
        continue;
      }
      if (!isPlainObject(keyed)) {
        errors.push({
          kind: "malformed-options",
          severity: "error",
          path: ["options", categoryName],
          message: `\`crl.dispositions.options.${categoryName}\` must be an object of key → { label }.`,
        });
        continue;
      }
      const resolvedKeyed: Record<string, NormalizedOption> = Object.create(null);
      for (const [key, opt] of Object.entries(keyed)) {
        const keyPath = ["options", categoryName, key];
        // These keys become the CRL authoring token `recommend <category>."<key>"` (a later todo) AND the
        // `category/key` leaf-id, so reject empty, "/" (leaf-id collision), and prototype-polluting names.
        if (key.trim() === "") {
          errors.push({ kind: "empty-key", severity: "error", path: keyPath, message: `Empty option key under "${categoryName}".` });
          continue;
        }
        if (key.includes("/") || RESERVED_KEYS.has(key)) {
          errors.push({
            kind: "malformed-key",
            severity: "error",
            path: keyPath,
            message: `Invalid option key "${key}" under "${categoryName}" (must not contain "/" or be a reserved name).`,
          });
          continue;
        }
        if (!isPlainObject(opt) || typeof opt.label !== "string" || opt.label.trim() === "") {
          errors.push({
            kind: "empty-label",
            severity: "error",
            path: keyPath,
            message: `Disposition option "${categoryName}"."${key}" must carry a non-empty \`label\`.`,
          });
          continue;
        }
        let code: DispositionCode | undefined;
        if (opt.code !== undefined) {
          if (
            isPlainObject(opt.code) &&
            typeof opt.code.system === "string" &&
            opt.code.system.trim() !== "" &&
            typeof opt.code.code === "string" &&
            opt.code.code.trim() !== ""
          ) {
            code = { system: opt.code.system.trim(), code: opt.code.code.trim() };
          } else {
            errors.push({
              kind: "malformed-code",
              severity: "error",
              path: [...keyPath, "code"],
              message: `Disposition option "${categoryName}"."${key}".code must be { system, code } with non-empty strings.`,
            });
          }
        }
        const narrative =
          typeof opt.narrative === "string" && opt.narrative.trim() !== "" ? opt.narrative.trim() : undefined;
        resolvedKeyed[key] = { label: opt.label.trim(), narrative, code };
      }
      options[categoryName] = resolvedKeyed;
    }
  }

  const resolution = buildResolution(version, mode, options, errors);
  // A declared-but-degenerate vocabulary (empty / all options invalid) is structurally usable but almost certainly
  // a mistake — flag it (a WARNING, since an embedded deployment could legitimately be mid-setup).
  if (declaredOptions && resolution.config.options.length === 0) {
    errors.push({
      kind: "empty-vocabulary",
      severity: "warning",
      path: ["options"],
      message: "`crl.dispositions.options` was declared but resolved to zero valid determination leaves.",
    });
  }
  return resolution;
}

/**
 * Resolve the disposition config for a content project: read `<projectRoot>/package.json`, extract
 * `crl.dispositions`, and normalize it. `projectRoot` is the nearest-package.json project root (the same root
 * every other lane resolves via `findProjectRoot`); a nested subpackage is its own project. Never throws.
 */
export function resolveDispositionConfig(projectRoot: string): DispositionResolution {
  let raw: unknown;
  try {
    const pkg = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")) as unknown;
    raw = isPlainObject(pkg) && isPlainObject(pkg.crl) ? pkg.crl.dispositions : undefined;
  } catch (e) {
    const resolution = normalizeDispositionConfig(undefined);
    resolution.errors.push({
      kind: "unreadable-package-json",
      severity: "error",
      path: [],
      message: `Could not read ${join(projectRoot, "package.json")}: ${(e as Error).message}. Using the default vocabulary.`,
    });
    return resolution;
  }
  return normalizeDispositionConfig(raw);
}
