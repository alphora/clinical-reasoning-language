import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SourceDocumentListing } from './sourceDocuments';

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function hasReviewEditHistory(src: string): boolean {
  for (const [folder, pattern] of [
    ['direct-edits', /^[a-f0-9-]{36}\.json$/],
    ['crl-patches', /\.crl\.patch\.json$/],
  ] as const) {
    try {
      if (readdirSync(join(src, 'medical-validation', folder)).some(name => pattern.test(name))) return true;
    } catch (error) {
      // An unreadable history must remain reachable through the history action.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return true;
    }
  }
  return false;
}

export interface MvTreeChrome {
  status: string;
  highlighting: string;
  explanation: string;
  tools: string;
  questionnaires: string;
  legend: string;
  documents: SourceDocumentListing;
  documentToken: string;
  history: boolean;
  recovery: boolean;
}

/** Host-owned document indices only: no file path from the webview is trusted. */
export function renderMvTreeChrome(input: MvTreeChrome): string {
  const group = (title: string, content: string) => `<section class="mv-toolbar-group mv-toolbar-${title.toLowerCase()}" aria-label="${title}"><h2 class="mv-toolbar-heading">${title}</h2>${content}</section>`;
  const documents = (['Source', 'Refined source'] as const).map(name => {
    const entries = input.documents.documents.map((document, index) => ({ document, index })).filter(entry => entry.document.group === name);
    if (!entries.length) return `<button class="fc-toggle-btn" disabled title="No ${name.toLowerCase()} documents available">${name}</button>`;
    return entries.map(({ document, index }) => `<button class="fc-toggle-btn" data-source-document="${index}" data-source-token="${escape(input.documentToken)}" title="Open ${escape(name + ': ' + document.relativePath)} read-only">${escape(entries.length === 1 ? name : name + ': ' + document.relativePath)}</button>`).join(' ');
  }).join(' ');
  const history = input.history ? '<button class="fc-toggle-btn" data-mv-edit-action="history">Edit history</button>' : '';
  const recovery = input.recovery ? '<button class="fc-toggle-btn mv-attention" data-mv-edit-action="recovery">Recover interrupted edit</button>' : '';
  const warning = !input.documents.complete ? `<div class="mv-toolbar-notice" role="status">${escape(input.documents.warnings.join(' '))}</div>` : '';
  const actions = `<div class="fc-toggle mv-document-buttons">${documents}</div>${input.tools}${input.questionnaires}<div class="mv-display-controls">${input.highlighting}${input.explanation}</div>` + (history || recovery ? `<div class="fc-toggle">${history}${recovery}</div>` : '');
  return `<div class="mv-toolbar">${group('Status', input.status + warning)}${group('Actions', actions)}${group('Legend', input.legend)}</div>`;
}

export const MV_TREE_CHROME_STYLE = `
.mv-toolbar{display:flex;flex-wrap:wrap;align-items:flex-start;gap:16px 26px;padding:8px 0 12px;margin-bottom:10px;border-bottom:1px solid var(--vscode-panel-border,#454545)}
.mv-toolbar-group{min-width:0;max-width:100%}.mv-toolbar-status{flex:0 1 180px}.mv-toolbar-actions{flex:1 1 400px}.mv-toolbar-legend{flex:0 1 345px}
.mv-toolbar-heading{font:600 13px var(--vscode-font-family,sans-serif);margin:0 0 9px;color:var(--vscode-foreground,#fff);text-shadow:0 0 3px #ffd54f,0 0 7px #ffd54f}
.mv-toolbar .fc-toggle{flex-wrap:wrap;gap:5px;padding:0 0 7px}.mv-toolbar .fc-toggle-label{opacity:1;color:var(--vscode-descriptionForeground,#aaa)}
.mv-toolbar .fc-toggle-btn{white-space:normal;overflow-wrap:anywhere;min-height:24px}.mv-toolbar .fc-toggle-btn:disabled{opacity:.5;cursor:default}
.mv-toolbar .fc-toggle-btn:focus-visible{outline:1px solid var(--vscode-focusBorder,#007fd4);outline-offset:2px}
.mv-toolbar .fc-legend{display:flex;flex-direction:column;gap:8px;padding:0;max-width:none}.mv-toolbar .fc-legend-group{gap:7px}
.mv-toolbar .mv-progress{margin:0 0 7px}.mv-toolbar-notice{font-size:12px;overflow-wrap:anywhere}.mv-toolbar .mv-attention{color:var(--vscode-foreground,#fff);text-shadow:0 0 3px #ffd54f,0 0 7px #ffd54f}
`;
