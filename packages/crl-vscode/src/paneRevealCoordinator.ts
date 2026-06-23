// Pane reveal COORDINATOR (vscode-free, unit-tested) — three-pane viewer C2a (#156).
// The reveal state machine for 3 independently-rebuilding webview panes: the engine emits SEMANTIC reveals; this
// coordinator queues the latest per pane and flushes it only when the pane acks a render whose generation AND
// indexVersion both match. Extracted from the (untested) vscode shell so the failure-prone logic is unit-tested.
// Design authority: .vibe-tools/discussions/118-c2a-source-spine.md.
export interface SemanticTarget {
  kind: "unit" | "crlNode" | "celCase";
  id: string;
}
export type PaneCapability = "renderable" | "placeholder";

interface PaneState {
  gen: number;
  capability: PaneCapability;
  pending?: { target: SemanticTarget; indexVersion: number };
}

export class PaneRevealCoordinator {
  private readonly panes = new Map<string, PaneState>();

  private get(pane: string): PaneState {
    let p = this.panes.get(pane);
    if (!p) {
      p = { gen: 0, capability: "renderable" };
      this.panes.set(pane, p);
    }
    return p;
  }

  setPaneCapability(pane: string, capability: PaneCapability): void {
    const p = this.get(pane);
    p.capability = capability;
    if (capability === "placeholder") p.pending = undefined; // placeholders never hold a queue
  }

  /** A pane begins a (re)render — supersedes prior renders. Returns the new generation to stamp the render with. */
  startRender(pane: string): number {
    const p = this.get(pane);
    p.gen += 1;
    return p.gen;
  }

  /** Queue the LATEST reveal for a pane (replaces, never stacks). Placeholders ignore it (no rot). */
  queueReveal(pane: string, target: SemanticTarget, indexVersion: number): void {
    const p = this.get(pane);
    if (p.capability === "placeholder") {
      p.pending = undefined;
      return;
    }
    p.pending = { target, indexVersion };
  }

  /** The shell clears a pane's queued reveal on setInputs (it re-queues the new selection's reveal afterward). */
  clearPending(pane: string): void {
    this.get(pane).pending = undefined;
  }

  disposePane(pane: string): void {
    this.panes.delete(pane);
  }

  /**
   * A pane reports its DOM is rendered at (gen, indexVersion). Returns the target to reveal, or undefined.
   * Flush iff: not superseded (gen === current) AND a pending reveal exists for THIS indexVersion. A render newer
   * than the pending reveal drops the (stale) pending; a render older than the pending keeps it (waits).
   */
  ready(pane: string, gen: number, indexVersion: number): SemanticTarget | undefined {
    const p = this.get(pane);
    if (gen !== p.gen) return undefined; // superseded render
    if (p.capability === "placeholder") {
      p.pending = undefined;
      return undefined; // placeholder: nothing to reveal
    }
    const q = p.pending;
    if (!q) return undefined;
    if (q.indexVersion === indexVersion) {
      p.pending = undefined;
      return q.target; // flush
    }
    if (indexVersion > q.indexVersion) {
      p.pending = undefined; // the render is for a newer index → the queued reveal is stale
      return undefined;
    }
    return undefined; // render older than the pending reveal → keep pending, wait
  }
}
