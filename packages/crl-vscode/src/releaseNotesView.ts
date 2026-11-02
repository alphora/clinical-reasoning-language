import { randomBytes } from 'node:crypto'
import * as vscode from 'vscode'
import { parseReleaseCatalog, releaseMediaFiles, releaseNotesAutoEligible, ReleaseNotesCoordinator, renderReleaseNotesHtml, validateReleaseMedia, type ReleaseCatalog } from './releaseNotes'

export const RELEASE_NOTES_COMMAND = 'crl.showReleaseNotes'
export const RELEASE_NOTES_TITLE = 'CRL: Release Notes'
const SEEN_VERSION = 'crl.releaseNotes.seenVersion'
const workspaceIdentity = (): string => JSON.stringify((vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.toString()))

/** Independent, informational host adapter. Reads only its own packaged resources. */
export function createReleaseNotes(context: vscode.ExtensionContext, log: (message: string) => void): {
  beginDiscovery: () => (ready: boolean) => void
} {
  const root = vscode.Uri.joinPath(context.extensionUri, 'media', 'release-notes')
  const runningVersion = String(context.extension.packageJSON.version)
  let panel: vscode.WebviewPanel | undefined
  let readyIdentity: string | undefined
  let disposed = false
  let loadIdentity: string | undefined
  let assets: Promise<{ catalog: ReleaseCatalog; videos: Map<string, string> }> | undefined
  const eligible = (): boolean => !disposed && releaseNotesAutoEligible({
    ready: readyIdentity === workspaceIdentity(), trusted: vscode.workspace.isTrusted,
    production: context.extensionMode === vscode.ExtensionMode.Production,
    autoOpen: vscode.workspace.getConfiguration('crl.releaseNotes').get<boolean>('autoOpen', true), version: runningVersion,
  })
  const loadAssets = (): Promise<{ catalog: ReleaseCatalog; videos: Map<string, string> }> => assets ??= (async () => {
    const catalog = parseReleaseCatalog(JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, 'catalog.json'))).toString('utf8')))
    const names = releaseMediaFiles(catalog)
    const files = new Map(await Promise.all(names.map(async name => [name, await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, name))] as const)))
    validateReleaseMedia(catalog, files)
    const videos = new Map(names.filter(name => name.endsWith('.webm')).map(name => [name, 'data:video/webm;base64,' + Buffer.from(files.get(name)!).toString('base64')]))
    return { catalog, videos }
  })().catch(error => { assets = undefined; throw error })
  const coordinator = new ReleaseNotesCoordinator(runningVersion, {
    loadCatalog: async () => { loadIdentity = workspaceIdentity(); return (await loadAssets()).catalog },
    getSeen: () => context.globalState.get(SEEN_VERSION),
    setSeen: version => context.extensionMode === vscode.ExtensionMode.Production ? context.globalState.update(SEEN_VERSION, version) : Promise.resolve(),
    log,
    open: async view => {
      const { videos } = await loadAssets()
      if (disposed || view.automatic && (loadIdentity !== workspaceIdentity() || !eligible())) throw new Error('Automatic Release Notes opening cancelled because the workspace, trust or preference changed.')
      if (!panel) {
        const created = vscode.window.createWebviewPanel('crl.releaseNotes', 'CRL Release Notes', { viewColumn: vscode.ViewColumn.Active, preserveFocus: view.automatic }, {
          enableScripts: false, enableCommandUris: false, localResourceRoots: [root],
        })
        panel = created
        created.onDidDispose(() => { if (panel === created) panel = undefined })
      }
      panel.webview.html = renderReleaseNotesHtml(view, {
        nonce: randomBytes(16).toString('hex'), imageSource: panel.webview.cspSource,
        mediaUri: name => videos.get(name) ?? panel!.webview.asWebviewUri(vscode.Uri.joinPath(root, name)).toString(),
      })
      panel.reveal(vscode.ViewColumn.Active, view.automatic)
      log('Release Notes opened (' + (view.automatic ? 'automatic' : 'manual') + '): ' + view.runningVersion)
    },
  })
  const reconsider = (): void => coordinator.onProject(eligible())
  context.subscriptions.push(
    vscode.commands.registerCommand(RELEASE_NOTES_COMMAND, () => coordinator.show().catch(error => {
      log('Release Notes could not open: ' + String(error))
      void vscode.window.showErrorMessage('CRL Release Notes could not open. See the CRL output channel for details.')
    })),
    vscode.workspace.onDidGrantWorkspaceTrust(reconsider),
    vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('crl.releaseNotes.autoOpen')) reconsider() }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => { readyIdentity = undefined }),
    { dispose: () => { disposed = true; panel?.dispose() } },
  )
  return {
    // Capture identity before asynchronous content discovery begins, not when its result arrives.
    beginDiscovery: () => {
      const identity = workspaceIdentity()
      return ready => {
        if (disposed || identity !== workspaceIdentity()) return
        readyIdentity = ready ? identity : undefined
        reconsider()
      }
    },
  }
}
