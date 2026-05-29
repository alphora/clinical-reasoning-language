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
}

const ASSOCIATION_GLOB = "*.crl";
const ASSOCIATION_LANG = "markdown"; // the grammar injects into Markdown

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
  rules: TmRule[]
): HighlightResult {
  const warnings: string[] = [];

  const associations: Associations = { ...(curAssoc ?? {}) };
  let associationsChanged = false;
  if (associations[ASSOCIATION_GLOB] !== ASSOCIATION_LANG) {
    if (associations[ASSOCIATION_GLOB] !== undefined) {
      warnings.push(
        `files.associations "${ASSOCIATION_GLOB}" was "${associations[ASSOCIATION_GLOB]}"; changed to "${ASSOCIATION_LANG}" for CRL highlighting.`
      );
    }
    associations[ASSOCIATION_GLOB] = ASSOCIATION_LANG;
    associationsChanged = true;
  }

  const tokenColors: TokenColors = { ...(curColors ?? {}) };
  const existing: TmRule[] = Array.isArray(tokenColors.textMateRules) ? [...tokenColors.textMateRules] : [];
  const byScope = new Map(existing.map((r) => [scopeKey(r.scope), r]));
  let tokenColorsChanged = false;
  for (const rule of rules) {
    const key = scopeKey(rule.scope);
    const prior = byScope.get(key);
    if (!prior) {
      existing.push(rule);
      byScope.set(key, rule);
      tokenColorsChanged = true;
    } else if (!sameSettings(prior, rule)) {
      // The user (or a stale README copy) customized one of our scopes — leave it.
      warnings.push(`Left your customized token color for "${key}" unchanged.`);
    }
  }
  tokenColors.textMateRules = existing;
  return { associations, tokenColors, associationsChanged, tokenColorsChanged, warnings };
}

export function removeHighlight(
  curAssoc: Associations | undefined,
  curColors: TokenColors | undefined,
  rules: TmRule[]
): HighlightResult {
  const ruleByKey = new Map(rules.map((r) => [scopeKey(r.scope), r]));

  const associations: Associations = { ...(curAssoc ?? {}) };
  let associationsChanged = false;
  if (associations[ASSOCIATION_GLOB] === ASSOCIATION_LANG) {
    delete associations[ASSOCIATION_GLOB];
    associationsChanged = true;
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
  return { associations, tokenColors, associationsChanged, tokenColorsChanged, warnings: [] };
}
