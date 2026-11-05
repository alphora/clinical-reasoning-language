/** Host-owned identity. Webview-supplied fields never update this record. */
export interface BranchSessionIdentity {
  id: string;
  epoch: string;
  sourceVersion: number;
  generation: number;
  renderToken: string;
  ready: boolean;
  mounted: boolean;
}

/** REFACTOR:grounded: only current mounted row messages reach semantic handlers. */
export function branchMessageIsCurrent(
  session: BranchSessionIdentity, epoch: string, sourceVersion: number,
  message: { epoch?: unknown; rowId?: unknown; gen?: unknown },
): boolean {
  return session.mounted && session.epoch === epoch && session.sourceVersion === sourceVersion
    && message.epoch === epoch && message.rowId === session.id && message.gen === session.generation;
}

/** REFACTOR:grounded: outer pane readiness cannot establish that every displayed branch has its final layout. */
export function branchCaptureManifest(
  epoch: string, sourceVersion: number, scopeKey: string, offset: bigint,
  displayed: readonly BranchSessionIdentity[],
): string | undefined {
  if (!displayed.length || displayed.some(row => !row.ready || !row.mounted || row.epoch !== epoch || row.sourceVersion !== sourceVersion)) return;
  return JSON.stringify([epoch, sourceVersion, scopeKey, String(offset),
    displayed.map(row => [row.id, row.generation, row.renderToken])]);
}
