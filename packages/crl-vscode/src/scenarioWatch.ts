// vscode-free helper for the scenario-runner's live re-run (roadmap item #3). Separate module so it's
// unit-testable under node (scenarioRunner.ts itself imports vscode). The watcher re-renders on a save of
// the active .cel (canonicalized compare — the graph's paths are canonical but `doc.uri.fsPath` is not, so a
// raw === misses on Windows drive-case) OR ANY .crl save: runCel pulls concept defs from the WHOLE crl
// registry, not just the covered file, so a qualified ref into another library can change results without the
// covered file changing — re-resolving on any .crl save is cheaper + more correct than tracking the exact set,
// and it also recovers the case where `covers` was unresolved (no coversTarget to track).
import { canonicalize } from "@smile-digital-health/crl/language-services";

export function isRelevantSave(savedPath: string, celPath: string | undefined): boolean {
  if (savedPath.toLowerCase().endsWith(".crl")) return true;
  if (!celPath) return false;
  return canonicalize(savedPath) === canonicalize(celPath);
}
