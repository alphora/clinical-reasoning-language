// Thin vscode adapters over the headless hover logic (#132 step 3). All matching/markdown
// logic lives in `@smile-digital-health/crl/language-services` (computeNarrativeHover /
// computeTypeValuetypeHover / computeConceptRefHover); these classes just feed in the
// document line + position (+ injected catalog data / the ProjectIndex) and convert the
// LsHover result to vscode via toVscodeHover.
import * as vscode from "vscode";
import {
  compileNarrativeMatcher,
  CONCEPT_TYPES,
  CONCEPT_VALUETYPES,
  PARAMETER_TYPES,
  ACTIVITY_TYPES,
  type Pattern,
} from "@smile-digital-health/crl/language-services";
import {
  computeNarrativeHover,
  computeTypeValuetypeHover,
  computeConceptRefHover,
  type CompiledNarrativePattern,
  type ProjectIndex,
} from "@smile-digital-health/crl/language-services";
import { toVscodeHover } from "./toVscode";

/** Hover over a narrative pattern in a `- definition is ` body. Compiles the catalog once
 *  (the matcher cache the core logic walks at hover time). */
export class NarrativeHoverProvider implements vscode.HoverProvider {
  private readonly compiled: CompiledNarrativePattern[];

  constructor(patterns: Pattern[]) {
    this.compiled = patterns.map((p) => ({
      canonical: p.canonical,
      category: p.category,
      narrative: p.narrative,
      signature: p.signature,
      cqlFunction: p.cqlFunction,
      matcher: compileNarrativeMatcher(p.narrative),
    }));
  }

  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.Hover> {
    const ls = computeNarrativeHover(document.lineAt(position.line).text, position, this.compiled);
    return ls ? toVscodeHover(ls) : null;
  }
}

/** Hover over a `type is`/`value type is`/`param type is` token. Injects the grammar
 *  allowlists (which live in the extension's catalog mirror). */
export class TypeValuetypeHoverProvider implements vscode.HoverProvider {
  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.Hover> {
    const ls = computeTypeValuetypeHover(document.lineAt(position.line).text, position, {
      conceptTypes: CONCEPT_TYPES,
      valueTypes: CONCEPT_VALUETYPES,
      paramTypes: PARAMETER_TYPES,
      activityTypes: ACTIVITY_TYPES,
    });
    return ls ? toVscodeHover(ls) : null;
  }
}

/** Hover over a quoted concept reference — resolves via the project index (multi-file) or
 *  the file-local scan (orphan file). */
export class ConceptRefHoverProvider implements vscode.HoverProvider {
  constructor(private readonly index: ProjectIndex) {}

  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.Hover> {
    const ls = computeConceptRefHover(
      document.getText(),
      document.uri.fsPath,
      document.lineAt(position.line).text,
      position,
      this.index,
    );
    return ls ? toVscodeHover(ls) : null;
  }
}
