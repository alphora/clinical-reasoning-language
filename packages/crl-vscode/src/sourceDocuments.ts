import { lstatSync, readdirSync, realpathSync, statSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';

export interface SourceDocument {
  group: 'Source' | 'Refined source';
  relativePath: string;
  filePath: string;
  sourceRoot: string;
}
export interface SourceDocumentListing {
  documents: SourceDocument[];
  complete: boolean;
  warnings: string[];
}
export interface SourceDocumentUi {
  choose(documents: readonly SourceDocument[], options: { title: string; incomplete: boolean }): PromiseLike<SourceDocument | undefined>;
  open(filePath: string): PromiseLike<unknown>;
  message(text: string, level: 'information' | 'warning'): void;
}

const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const housekeeping = (name: string) => name.startsWith('.') || name.startsWith('~$') || ['thumbs.db', 'desktop.ini'].includes(name.toLowerCase());
const within = (root: string, file: string) => {
  const path = relative(root, file);
  return !isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep);
};

/** Read current documents without parsing CEL or reading document contents.
 * Explicit source roots may be links; nested links are not traversed. */
export function listSourceDocuments(policySrc: string, limits: { maxEntries?: number; maxDepth?: number } = {}): SourceDocumentListing {
  const maxEntries = limits.maxEntries ?? 5000, maxDepth = limits.maxDepth ?? 32;
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || !Number.isInteger(maxDepth) || maxDepth < 0) throw Error('Invalid document-list bounds.');
  const result: SourceDocumentListing = { documents: [], complete: true, warnings: [] };
  let entries = 0;
  const warn = (text: string) => {
    result.complete = false;
    if (!result.warnings.includes(text)) result.warnings.push(text);
  };
  for (const [folder, group] of [['source', 'Source'], ['refined-source', 'Refined source']] as const) {
    let root: string;
    try {
      root = realpathSync(join(policySrc, folder));
      if (!statSync(root).isDirectory()) { warn(`${group} is not a folder.`); continue; }
    } catch (error) {
      if (!missing(error)) warn(`${group} documents could not be listed.`);
      continue;
    }
    const walk = (directory: string, depth: number): void => {
      if (depth > maxDepth) { warn('Some deeply nested source documents are not listed.'); return; }
      let children: Dirent[];
      try { children = readdirSync(directory, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name)); }
      catch { warn(`${group}/${relative(root, directory).split(sep).join('/')} could not be listed.`); return; }
      for (const child of children) {
        if (++entries > maxEntries) { warn(`${group} documents exceed the display limit; some are not listed.`); return; }
        if (housekeeping(child.name)) continue;
        const file = join(directory, child.name);
        if (child.isSymbolicLink()) { warn('Linked items inside source folders are not listed.'); continue; }
        if (child.isDirectory()) walk(file, depth + 1);
        else if (child.isFile()) result.documents.push({ group, relativePath: relative(root, file).split(sep).join('/'), filePath: file, sourceRoot: root });
      }
    };
    walk(root, 0);
  }
  result.documents.sort((a, b) => (a.group === b.group ? 0 : a.group === 'Source' ? -1 : 1) || compare(a.relativePath, b.relativePath));
  return result;
}

export async function showSourceDocuments(policySrc: string, ui: SourceDocumentUi): Promise<void> {
  try {
    const listing = listSourceDocuments(policySrc);
    if (!listing.complete) ui.message(listing.warnings.join(' '), 'warning');
    if (!listing.documents.length) {
      if (listing.complete) ui.message('No Source or Refined source documents were found for this policy.', 'information');
      return;
    }
    const document = await ui.choose(listing.documents, { title: `Source documents — ${basename(dirname(policySrc))}`, incomplete: !listing.complete });
    if (!document) return;
    let file: string;
    try {
      if (!listing.documents.includes(document) || !lstatSync(document.filePath).isFile()) throw Error();
      file = realpathSync(document.filePath);
    } catch { throw Error('That source document is no longer available. Reopen Source documents.'); }
    if (!within(document.sourceRoot, file)) throw Error('That source document moved outside its listed folder. Reopen Source documents.');
    await ui.open(file);
  } catch (error) {
    ui.message(`Could not open source documents: ${error instanceof Error ? error.message : String(error)}`, 'warning');
  }
}
