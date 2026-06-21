// CEL hover adapter (#4 slice 2). Parses the buffer (buildCEL — a hover fires on a complete token, so the
// buffer is normally valid) for the fact `defined by` details + covered library, then resolves the token
// under the cursor via the headless computeCelHover. Registered on the `crl-cel` selector.
import * as vscode from "vscode";
import { buildCEL } from "@smile-digital-health/crl";
import {
  computeCelHover,
  celHoverContext,
  celDocContextFromSource,
  type CelHoverContext,
  type ProjectIndex,
} from "@smile-digital-health/crl/language-services";
import { celSymbolSource } from "./celSymbolSource";
import { CEL_DOCUMENT_SELECTOR } from "./celCompletion";
import { toVscodeHover } from "./toVscode";

export class CelHoverProvider implements vscode.HoverProvider {
  constructor(private readonly index: ProjectIndex) {}

  public provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
    const text = document.getText();
    // TOLERANT base (coveredLib + fact names survive a parse error ELSEWHERE in the buffer — e.g. a
    // half-typed line below the hovered token), mirroring the completion adapter. The fact's `defined by`
    // detail is best-effort from a full parse (shown when the buffer parses cleanly).
    const tol = celDocContextFromSource(text);
    const built = buildCEL(text);
    const refByName = new Map<string, string | undefined>();
    if (built.success && built.result) {
      for (const f of celHoverContext(built.result).facts) refByName.set(f.name, f.conceptRef);
    }
    const ctx: CelHoverContext = {
      coveredLib: tol.coveredLib,
      facts: tol.facts.map((name) => ({ name, conceptRef: refByName.get(name) })),
    };
    const symbols = celSymbolSource(document, this.index); // CRL symbols via the .cel's covered closure
    const h = computeCelHover(
      document.lineAt(position.line).text,
      { line: position.line, character: position.character },
      ctx,
      symbols,
      [],
    );
    return h ? toVscodeHover(h) : null;
  }
}

export { CEL_DOCUMENT_SELECTOR };
