import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep, win32 } from 'node:path';
import { findKelpProject, kelpArtifactRoot, KelpEditError } from './kelpEditScopes';

export type MvReprocessLog =
  | { kind: 'available'; filePath: string; artifactRoot: string }
  | { kind: 'missing' | 'unavailable'; reason: string; message: string };

export const MV_REPROCESS_LOG_MAX_BYTES = 2 * 1024 * 1024;

const unavailable = (reason: string, message: string): MvReprocessLog => ({ kind: 'unavailable', reason, message });
const missing = (folder = false): MvReprocessLog => ({ kind: 'missing', reason: folder ? 'no-report-folder' : 'no-report', message: 'No Nautilus log has been delivered for this policy yet.' });
const inside = (root: string, file: string): boolean => {
  const rel = relative(root, file);
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep);
};

/** Read-only location lookup, not KELP graph/lock/permission validation. In particular, reading a
 * report must work on published artifacts without the mutation gates in parseKelpStatus.
 * Managed projects use the configured medical-validation entity. Standalone policy examples
 * use their local medical-validation folder so the same read-only action works in F5.
 */
export function resolveMvReprocessLog(policySrc: string): MvReprocessLog {
  try {
    const projectFile = findKelpProject(policySrc);
    let artifactRoot: string;
    let folder: unknown;
    if (!projectFile) {
      artifactRoot = realpathSync(policySrc);
      folder = 'medical-validation';
    } else {
      // Keep the managed artifacts boundary consistent with kelpEditScopes.kelpArtifactRoot.
      const artifacts = join(dirname(projectFile), 'artifacts');
      if (!relative(artifacts, policySrc) || !inside(artifacts, policySrc))
        return unavailable('no-artifact', 'No Nautilus log has been delivered for this policy yet.');
      const project = JSON.parse(readFileSync(projectFile, 'utf8'));
      const rows = project.project.structure.entities.filter((row: unknown) =>
        row !== null && typeof row === 'object' && (row as { key?: unknown }).key === 'medical-validation');
      if (rows.length !== 1) return unavailable(rows.length ? 'ambiguous-mv' : 'unmapped-mv', 'The project must configure one medical-validation entity for its Nautilus log.');
      folder = rows[0].folder;
      artifactRoot = realpathSync(kelpArtifactRoot(policySrc, projectFile));
    }
    if (typeof folder !== 'string' || !folder || isAbsolute(folder) || win32.isAbsolute(folder) ||
      /[\\:\x00-\x1f]/.test(folder) || folder.split('/').some(part => !part || part === '.' || part === '..'))
      return unavailable('unsafe-folder', 'The configured medical-validation folder is not a safe policy-relative folder.');
    if (!inside(artifactRoot, realpathSync(policySrc))) return unavailable('outside-artifact', 'The selected policy is outside its configured artifact.');
    const parts = [...folder.split('/'), 'nautilus-log.md'];
    let filePath = artifactRoot;
    for (let index = 0; index < parts.length; index++) {
      filePath = join(filePath, parts[index]);
      let entry;
      try { entry = lstatSync(filePath); }
      catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return missing(index < parts.length - 1);
        throw error;
      }
      if (entry.isSymbolicLink() || (index === parts.length - 1 ? !entry.isFile() : !entry.isDirectory()))
        return index < parts.length - 1 && !entry.isSymbolicLink()
          ? unavailable('not-a-folder', 'The configured medical-validation folder contains an entry that is not a directory. Check log delivery and the project mapping.')
          : unavailable('unsafe-file', 'The Nautilus log must be a regular file inside its medical-validation folder, without linked folders or files.');
      if (index === parts.length - 1 && entry.size > MV_REPROCESS_LOG_MAX_BYTES)
        return unavailable('too-large', 'The Nautilus log exceeds the 2 MiB preview limit; its history remains unchanged.');
    }
    filePath = realpathSync(filePath);
    if (!inside(artifactRoot, filePath)) return unavailable('outside-artifact', 'The Nautilus log is outside its configured artifact.');
    return { kind: 'available', filePath, artifactRoot };
  } catch (error) {
    if (error instanceof KelpEditError && error.code === 'artifact-layout')
      return unavailable('artifact-layout', 'This policy\'s managed KELP artifact package is incomplete; check artifact delivery.');
    if (error instanceof KelpEditError && error.code === 'invalid-project')
      return unavailable('invalid-project', 'The KELP project configuration is invalid or unreadable; check its format and file access.');
    return unavailable('unreadable', 'The Nautilus log location could not be read. Check the project configuration and file access.');
  }
}
