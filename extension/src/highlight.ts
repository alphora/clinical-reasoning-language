import { readFileSync } from "node:fs";

// Pure helpers for the CRL highlighting settings (no vscode dependency).
// The canonical color rules live in the grammar file's
// `__readme_token_color_customizations_snippet__` — we read them at runtime so
// there is a single source of truth (no duplicated/divergent color table).
//
// These settings are written at USER (global) scope: VS Code FULLY OVERRIDES
// (does not merge) `editor.tokenColorCustomizations.textMateRules` across
// scopes (microsoft/vscode#139503), so a workspace-scoped write would wipe the
// user's global token colors. We therefore merge our rules into the global
// value, preserving the user's, and remove only rules that are exactly ours.

export interface TmRule {
  scope: string | string[];
  settings: Record<string, unknown>;
}
export type Associations = Record<string, string>;
export interface TokenColors {
  textMateRules?: TmRule[];
  [k: string]: unknown;
}
export interface HighlightResult {
  associations: Associations;
  tokenColors: TokenColors;
  associationsChanged: boolean;
  tokenColorsChanged: boolean;
  warnings: string[];
  /**
   * Scopes whose existing user rule differed from CRL's canonical rule and
   * were therefore LEFT UNCHANGED. The caller (the extension host) is
   * expected to prompt the user about each one (replace / keep / don't ask
   * again) and re-call applyHighlight with `replaceScopes` populated for the
   * ones the user wants replaced. Empty array if every CRL scope is fresh
   * or already-matching.
   */
  customizedScopes: string[];
}

export interface ApplyOptions {
  /** Scopes the caller has decided to overwrite with CRL's canonical settings. */
  replaceScopes?: Set<string>;
}

// Both `.crl` and `.cel` files use the Markdown injection grammar pattern.
// The TextMate grammar injection is registered separately per DSL in
// extension/package.json; the file-association just routes both extensions
// to Markdown so VS Code applies the injections.
const ASSOCIATION_GLOBS = ["*.crl", "*.cel"] as const;
const ASSOCIATION_LANG = "markdown";

export function loadCrlRules(grammarJsonPath: string): TmRule[] {
  const json = JSON.parse(readFileSync(grammarJsonPath, "utf8")) as Record<string, unknown>;
  const snippet = json["__readme_token_color_customizations_snippet__"] as
    | { ["editor.tokenColorCustomizations"]?: { textMateRules?: unknown } }
    | undefined;
  const rules = snippet?.["editor.tokenColorCustomizations"]?.textMateRules;
  if (!Array.isArray(rules)) {
    throw new Error(`No textMateRules snippet found in ${grammarJsonPath}`);
  }
  return rules as TmRule[];
}

// Our canonical rules all use plain string scopes; this assumes no
// string-vs-array scope-key collision (none possible for our rule set).
const scopeKey = (scope: string | string[]): string => (Array.isArray(scope) ? scope.join(",") : scope);
const sameSettings = (a: TmRule, b: TmRule): boolean =>
  JSON.stringify(a.settings) === JSON.stringify(b.settings);

export function applyHighlight(
  curAssoc: Associations | undefined,
  curColors: TokenColors | undefined,
  rules: TmRule[],
  options: ApplyOptions = {}
): HighlightResult {
  const warnings: string[] = [];
  const replaceScopes = options.replaceScopes ?? new Set<string>();

  const associations: Associations = { ...(curAssoc ?? {}) };
  let associationsChanged = false;
  for (const glob of ASSOCIATION_GLOBS) {
    if (associations[glob] !== ASSOCIATION_LANG) {
      if (associations[glob] !== undefined) {
        warnings.push(
          `files.associations "${glob}" was "${associations[glob]}"; changed to "${ASSOCIATION_LANG}" for CRL highlighting.`,
        );
      }
      associations[glob] = ASSOCIATION_LANG;
      associationsChanged = true;
    }
  }

  const tokenColors: TokenColors = { ...(curColors ?? {}) };
  const existing: TmRule[] = Array.isArray(tokenColors.textMateRules) ? [...tokenColors.textMateRules] : [];
  const byScope = new Map(existing.map((r, idx) => [scopeKey(r.scope), idx]));
  let tokenColorsChanged = false;
  const customizedScopes: string[] = [];
  for (const rule of rules) {
    const key = scopeKey(rule.scope);
    const priorIdx = byScope.get(key);
    if (priorIdx === undefined) {
      existing.push(rule);
      byScope.set(key, existing.length - 1);
      tokenColorsChanged = true;
      continue;
    }
    const prior = existing[priorIdx];
    if (sameSettings(prior, rule)) continue; // already matches; no action
    if (replaceScopes.has(key)) {
      existing[priorIdx] = rule;
      tokenColorsChanged = true;
    } else {
      customizedScopes.push(key);
    }
  }
  tokenColors.textMateRules = existing;
  return { associations, tokenColors, associationsChanged, tokenColorsChanged, warnings, customizedScopes };
}

export function removeHighlight(
  curAssoc: Associations | undefined,
  curColors: TokenColors | undefined,
  rules: TmRule[]
): HighlightResult {
  const ruleByKey = new Map(rules.map((r) => [scopeKey(r.scope), r]));

  const associations: Associations = { ...(curAssoc ?? {}) };
  let associationsChanged = false;
  for (const glob of ASSOCIATION_GLOBS) {
    if (associations[glob] === ASSOCIATION_LANG) {
      delete associations[glob];
      associationsChanged = true;
    }
  }

  const tokenColors: TokenColors = { ...(curColors ?? {}) };
  let tokenColorsChanged = false;
  if (Array.isArray(tokenColors.textMateRules)) {
    // Remove only rules that are exactly ours (don't delete a user customization).
    // Trade-off: if a future version changes a color, an old applied rule won't
    // match and is left behind — acceptable for stable colors.
    const kept = tokenColors.textMateRules.filter((r) => {
      const ours = ruleByKey.get(scopeKey(r.scope));
      if (ours && sameSettings(r, ours)) {
        tokenColorsChanged = true;
        return false;
      }
      return true;
    });
    tokenColors.textMateRules = kept;
  }
  return { associations, tokenColors, associationsChanged, tokenColorsChanged, warnings: [], customizedScopes: [] };
}
