import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep, win32 } from 'node:path';
import { findKelpProject, kelpArtifactRoot } from './kelpEditScopes';

export type MvReprocessLog =
  | { kind: 'available'; filePath: string; artifactRoot: string }
  | { kind: 'missing' | 'unavailable'; reason: string; message: string };

export const MV_REPROCESS_LOG_MAX_BYTES = 2 * 1024 * 1024;

const unavailable = (reason: string, message: string): MvReprocessLog => ({ kind: 'unavailable', reason, message });
const missing = (folder = false): MvReprocessLog => ({ kind: 'missing', reason: folder ? 'no-report-folder' : 'no-report', message: folder ? 'The configured qa folder is not present yet. Check report delivery and the project mapping.' : 'No MV fix log has been delivered for this artifact yet.' });
const inside = (root: string, file: string): boolean => {
  const rel = relative(root, file);
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep);
};

/** Read-only location lookup, not KELP graph/lock/permission validation. In particular, reading a
 * report must work on published artifacts without the mutation gates in parseKelpStatus.
 * Pipeline's agreed report contract is the configured entity key `qa`, not a guessed tests folder.
 */
export function resolveMvReprocessLog(policySrc: string): MvReprocessLog {
  try {
    const projectFile = findKelpProject(policySrc);
    if (!projectFile) return unavailable('no-project', 'This policy has no KELP project configuration for an MV fix log.');
    const project = JSON.parse(readFileSync(projectFile, 'utf8'));
    const rows = project.project.structure.entities.filter((row: unknown) =>
      row !== null && typeof row === 'object' && (row as { key?: unknown }).key === 'qa');
    if (rows.length !== 1) return unavailable(rows.length ? 'ambiguous-qa' : 'unmapped-qa', 'The KELP project must configure one qa entity for its MV fix log.');
    const folder: unknown = rows[0].folder;
    if (typeof folder !== 'string' || !folder || isAbsolute(folder) || win32.isAbsolute(folder) ||
      /[\\:\x00-\x1f]/.test(folder) || folder.split('/').some(part => !part || part === '.' || part === '..'))
      return unavailable('unsafe-folder', 'The configured qa folder is not a safe artifact-relative folder.');
    const artifactRoot = realpathSync(kelpArtifactRoot(policySrc, projectFile));
    if (!inside(artifactRoot, realpathSync(policySrc))) return unavailable('outside-artifact', 'The selected policy is outside its configured artifact.');
    const parts = [...folder.split('/'), 'reprocess-log.md'];
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
          ? unavailable('not-a-folder', 'The configured qa folder contains an entry that is not a directory. Check report delivery and the project mapping.')
          : unavailable('unsafe-file', 'The MV fix log must be a regular file inside its qa folder, without linked folders or files.');
      if (index === parts.length - 1 && entry.size > MV_REPROCESS_LOG_MAX_BYTES)
        return unavailable('too-large', 'The MV fix log exceeds the 2 MiB preview limit; its history remains unchanged.');
    }
    filePath = realpathSync(filePath);
    if (!inside(artifactRoot, filePath)) return unavailable('outside-artifact', 'The MV fix log is outside its configured artifact.');
    return { kind: 'available', filePath, artifactRoot };
  } catch {
    return unavailable('unreadable', 'The MV fix log location could not be read. Check the KELP project configuration and file access.');
  }
}
