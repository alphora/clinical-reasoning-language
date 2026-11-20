import * as vscode from 'vscode';
import { isAbsolute } from 'node:path';

/** Only fixed, application-owned messages use this type; filesystem/provider errors remain opaque. */
export class ReadonlyDocumentError extends Error {}

/** VS Code glob matching needs literal metacharacters escaped, not a broad folder glob. */
export const readonlyDocumentPattern = (file: string): string => file.replace(/\\/g, '/').replace(/[?*\[\]{}]/g, char => `[${char}]`);

/** Keep original URIs/default viewer associations. Editor-default read-only, not a filesystem permission change.
 * The resource-scoped setting is persistent and can create/update .vscode/settings.json.
 */
export function createReadonlySourceOpener(api: typeof vscode = vscode) {
  let pending: Promise<unknown> = Promise.resolve();
  return async (file: string, validate: () => void = () => {}, view: 'document' | 'markdown-preview' = 'document'): Promise<void> => {
    // Capability discovery must not hold the settings queue or stall unrelated source opens.
    if (view === 'markdown-preview') {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;
      try {
        await Promise.race([
          (async () => {
            if (!(await api.commands.getCommands(true)).includes('markdown.showLockedPreviewToSide')) {
              const markdown = api.extensions.getExtension('vscode.markdown-language-features');
              if (!markdown) throw Error('Unavailable');
              await markdown.activate();
              if (!(await api.commands.getCommands(true)).includes('markdown.showLockedPreviewToSide')) throw Error('Unavailable');
            }
          })(),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => { timedOut = true; reject(Error('Unavailable')); }, 10_000); }),
        ]);
      } catch { throw new ReadonlyDocumentError(timedOut ? 'Markdown preview startup timed out. Try again.' : 'Markdown preview is unavailable. Enable the built-in Markdown extension and try again.'); }
      finally { if (timeout !== undefined) clearTimeout(timeout); }
    }
    const open = async () => {
      const uri = api.Uri.file(file);
      const dirty = () => api.workspace.textDocuments.some(doc => doc.uri.toString() === uri.toString() && doc.isDirty)
        || api.window.tabGroups.all.some(group => group.tabs.some(tab => tab.isDirty && (tab.input as { uri?: vscode.Uri })?.uri?.toString() === uri.toString()));
      validate();
      if (dirty()) throw new ReadonlyDocumentError('This source document has unsaved edits. Save or revert them before opening it read-only.');
      const folder = api.workspace.getWorkspaceFolder(uri);
      if (!folder && !api.workspace.workspaceFile && !api.workspace.workspaceFolders?.length) throw new ReadonlyDocumentError('Open the policy workspace before opening source documents read-only.');
      const config = api.workspace.getConfiguration('files', uri);
      const excludes = config.get<Record<string, boolean>>('readonlyExclude', {});
      for (const [pattern, enabled] of Object.entries(excludes)) {
        if (!enabled) continue;
        const selector = !isAbsolute(pattern) && folder ? new api.RelativePattern(folder, pattern) : pattern;
        if (api.languages.match({ pattern: selector }, { uri, languageId: '' } as vscode.TextDocument))
          throw new ReadonlyDocumentError('A files.readonlyExclude setting permits editing this document. Remove that exception before opening it read-only.');
      }
      const pattern = readonlyDocumentPattern(file);
      const target = folder ? api.ConfigurationTarget.WorkspaceFolder : api.ConfigurationTarget.Workspace;
      if (config.get<Record<string, boolean>>('readonlyInclude', {})[pattern] !== true) {
        const values = config.inspect<Record<string, boolean>>('readonlyInclude');
        const scoped = folder ? values?.workspaceFolderValue : values?.workspaceValue;
        await config.update('readonlyInclude', { ...scoped, [pattern]: true }, target);
      }
      // The queue/configuration await must not reopen a different policy or a replaced source-root junction.
      validate();
      if (dirty()) throw new ReadonlyDocumentError('This source document acquired unsaved edits before it could be opened read-only.');
      if (view === 'markdown-preview') await api.commands.executeCommand('markdown.showLockedPreviewToSide', uri);
      else await api.commands.executeCommand('vscode.open', uri, { viewColumn: api.ViewColumn.Beside, preview: false });
    };
    const result = pending.then(open);
    pending = result.catch(() => {});
    return result;
  };
}

export const openReadonlySourceDocument = createReadonlySourceOpener();
