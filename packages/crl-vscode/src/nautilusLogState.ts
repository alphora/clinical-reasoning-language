import { randomUUID } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative, isAbsolute, sep } from 'node:path';
import { resolveMvReprocessLog, type MvReprocessLog } from './mvReprocessLog';

export interface NautilusLogSnapshot {
  cel: string; src: string; sourceIdentity: string; token: string; report: MvReprocessLog;
}

/** Log tokens belong to the selected policy, not the changing source-document button indices. */
export function captureNautilusLog(previous: NautilusLogSnapshot | undefined, cel: string, src: string, sourceIdentity: string): NautilusLogSnapshot {
  if (previous?.cel === cel && previous.src === src && previous.sourceIdentity === sourceIdentity) return previous;
  return { cel, src, sourceIdentity, token: randomUUID(), report: resolveMvReprocessLog(src) };
}

export function refreshNautilusLog(previous: NautilusLogSnapshot): NautilusLogSnapshot | undefined {
  let identity: string;
  try { identity = realpathSync(previous.src); } catch { return undefined; }
  if (identity !== previous.sourceIdentity) return captureNautilusLog(undefined, previous.cel, previous.src, identity);
  const report = resolveMvReprocessLog(previous.src);
  return JSON.stringify(report) === JSON.stringify(previous.report) ? previous : { ...previous, report };
}

/** A safely located regular history still exists when it exceeds the preview limit. */
export const hasNautilusLog = (report: MvReprocessLog | undefined): boolean => report?.kind === 'available' || report?.reason === 'too-large';

/** Watch existing roots, including package/config repairs, without rebuilding the policy model. */
export function watchNautilusLog(src: string, changed: () => void, api: Pick<typeof import('vscode'), 'workspace' | 'RelativePattern'>): { dispose(): void } {
  let projectRoot: string | undefined;
  for (let dir = src;; dir = dirname(dir)) {
    if (existsSync(join(dir, 'kelp.project.json'))) { projectRoot = dir; break; }
    if (dirname(dir) === dir) break;
  }
  const patterns: { root: string; pattern: string }[] = [];
  if (projectRoot) {
    patterns.push({ root: projectRoot, pattern: 'kelp.project.json' });
    const artifacts = join(projectRoot, 'artifacts'), rel = relative(artifacts, src);
    if (rel && !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep)) {
      const artifact = join(artifacts, rel.split(sep)[0]);
      // Folder deletion can emit only the folder event, without child-file events.
      patterns.push({ root: artifact, pattern: '**' });
    }
  } else {
    // Observe the bounded candidate parent even before its package is repaired. The reader
    // still requires positive package ownership before opening anything outside src.
    patterns.push({ root: basename(src) === 'src' ? dirname(src) : src, pattern: '**' });
  }
  const watchers: { dispose(): void }[] = [];
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onChange = () => {
    if (disposed) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => { timer = undefined; if (!disposed) changed(); }, 100);
  };
  try {
    for (const { root, pattern } of patterns) {
      const watcher = api.workspace.createFileSystemWatcher(new api.RelativePattern(root, pattern));
      watchers.push(watcher);
      watcher.onDidCreate(onChange); watcher.onDidDelete(onChange);
      watcher.onDidChange(uri => {
        if (pattern !== '**' || ['nautilus-log.md', 'package.json'].includes(basename(uri.fsPath))) onChange();
      });
    }
  } catch (error) { disposed = true; watchers.forEach(w => w.dispose()); throw error; }
  return { dispose() { disposed = true; if (timer !== undefined) clearTimeout(timer); watchers.forEach(w => w.dispose()); } };
}
