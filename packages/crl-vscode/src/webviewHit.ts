// Webview click-hit classification (vscode-free, unit-tested) — three-pane viewer C2c-2 (#156).
// A pane's `reveals` map resolves an opaque data-reveal key to a WebviewHit. Three shapes are engine-SELECTABLE (they
// flow into mapHitToPrimary → a Selection): source spans, CRL rows, CEL cases. The fourth — a CEL fact — is a PEEK:
// transient, shell-side, never an engine selection. `isFactHit` is the discriminator that diverts a fact click off the
// selection path. The fact shape is deliberately kept OUT of `RevealHit` so it can never be passed to the engine mapping.
import type { ZeroBasedRange } from "@smile-digital-health/crl/language-services";

/** The engine-selectable click hits. */
export type RevealHit = { unitId: string; range: ZeroBasedRange } | { nodeKey: string } | { caseId: string };

/** A CEL fact peek hit: the concept to highlight across panes + the cel anchor of the clicked fact span (self-highlight). */
export interface FactHit {
  conceptKey: string;
  factAnchorKey: string;
}

/** Everything a webview click can resolve to. */
export type WebviewHit = RevealHit | FactHit;

/** True for a fact peek (→ peekConcept), false for an engine-selectable hit (→ mapHitToPrimary). */
export function isFactHit(hit: WebviewHit): hit is FactHit {
  return "conceptKey" in hit;
}
