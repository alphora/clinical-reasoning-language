import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
const require = createRequire(import.meta.url)
const built = await build({ entryPoints: [fileURLToPath(new URL('../../src/releaseNotesView.ts', import.meta.url))], platform: 'node', format: 'cjs', bundle: true, write: false, external: ['vscode'], logLevel: 'silent' })
const flush = () => new Promise(resolve => setImmediate(resolve))
function host(version = '6.4.46', mode = 1) {
  const commands = new Map<string, () => Promise<void>>(), state = new Map<string, unknown>(), events = new Map<string, Function>()
  const settings = { autoOpen: true }, panels: any[] = []
  const uri = (path: string) => ({ path, toString: () => path })
  const subscribe = (name: string) => (callback: Function) => { events.set(name, callback); return { dispose() {} } }
  const catalog = { baselineVersion: '6.4.44', deployedBaselineVersion: '6.4.45', releases: [{ version: '6.4.46', title: 'New release', features: [{ title: 'Sample', description: 'Use this feature.', image: 'sample.png', alt: 'Sample image', video: 'sample.webm', poster: 'sample.png', caption: 'Silent sample' }] }] }
  const sdk = {
    ExtensionMode: { Production: 1, Development: 2, Test: 3 }, ViewColumn: { Active: -1 },
    Uri: { joinPath: (parent: { path: string }, ...parts: string[]) => uri([parent.path, ...parts].join('/')) },
    commands: { registerCommand: (key: string, callback: () => Promise<void>) => { commands.set(key, callback); return { dispose() {} } } },
    workspace: { isTrusted: true, workspaceFolders: [{ uri: uri('/sample') }], onDidGrantWorkspaceTrust: subscribe('trust'), onDidChangeConfiguration: subscribe('config'), onDidChangeWorkspaceFolders: subscribe('folders'), getConfiguration: () => ({ get: () => settings.autoOpen }), fs: {
      readDirectory: vi.fn(async () => ['catalog.json', 'README.md', 'sample.png', 'sample.webm'].map(name => [name, 1])),
      readFile: vi.fn(async (value: { path: string }) => value.path.endsWith('.json') ? Buffer.from(JSON.stringify(catalog)) : Buffer.from(value.path.endsWith('.png') ? [137,80,78,71,13,10,26,10] : [26,69,223,163])),
    } },
    window: { showErrorMessage: vi.fn(), createWebviewPanel: vi.fn((_type, _title, showOptions, webOptions) => {
      let disposed = () => {}
      const panel = { showOptions, webOptions, webview: { html: '', cspSource: "'self' https://*.vscode-cdn.net", asWebviewUri: (value: { path: string }) => uri('https://file+.vscode-resource.vscode-cdn.net' + value.path) }, reveal: vi.fn(), onDidDispose: (callback: () => void) => { disposed = callback }, dispose: () => disposed() }
      panels.push(panel); return panel
    }) },
  }
  const context = { extensionUri: uri('/installed-extension'), extension: { packageJSON: { version } }, extensionMode: mode, subscriptions: [] as any[], globalState: { get: (key: string) => state.get(key), update: vi.fn(async (key: string, value: unknown) => { state.set(key, value) }) } }
  const module = { exports: {} as any }
  new Function('require', 'module', built.outputFiles[0]!.text)((key: string) => key === 'vscode' ? sdk : require(key), module)
  const log = vi.fn(), notes = module.exports.createReleaseNotes(context, log)
  return { sdk, context, settings, state, notes, panels, log, events, ready: () => notes.beginDiscovery()(true), show: () => commands.get('crl.showReleaseNotes')!() }
}
describe('independent CRL Release Notes host', () => {
  it('waits for settled CRL readiness, preserves automatic focus and reuses its panel', async () => {
    const h = host(); await flush(); expect(h.panels).toHaveLength(0)
    h.ready(); h.ready(); await flush()
    expect(h.panels).toHaveLength(1)
    expect(h.panels[0].showOptions).toEqual({ viewColumn: -1, preserveFocus: true })
    expect(h.panels[0].webOptions).toMatchObject({ enableScripts: false, enableCommandUris: false })
    expect(h.panels[0].webOptions.localResourceRoots[0].path).toBe('/installed-extension/media/release-notes')
    expect(h.panels[0].webview.html).toContain('data:video/webm;base64,')
    expect(h.panels[0].webview.html).toContain('https://file+.vscode-resource.vscode-cdn.net/installed-extension/media/release-notes/sample.png')
    expect(h.panels[0].webview.html).toContain('&#39;self&#39; https://*.vscode-cdn.net')
    expect(h.state.get('crl.releaseNotes.seenVersion')).toBe('6.4.46')
    await h.show(); expect(h.panels).toHaveLength(1)
    expect(h.panels[0].reveal).toHaveBeenLastCalledWith(-1, false)
    expect(h.sdk.workspace.fs.readFile.mock.calls.filter(([path]) => path.path.endsWith('.webm'))).toHaveLength(1)
  })
  it.each([['6.4.46-dev.1+abc', 1], ['6.4.46+build.1', 1], ['6.4.46', 2], ['6.4.46', 3]])('isolates development/test history for %s/%s', async (version, mode) => {
    const h = host(version, mode); h.ready(); await flush(); expect(h.panels).toHaveLength(0)
    await h.show(); expect(h.panels).toHaveLength(1)
    expect(h.context.globalState.update).not.toHaveBeenCalled()
  })
  it('reconsiders readiness on trust grant and a preference change', async () => {
    const h = host(); h.sdk.workspace.isTrusted = false; h.settings.autoOpen = false
    h.ready(); await flush(); expect(h.panels).toHaveLength(0)
    h.sdk.workspace.isTrusted = true; h.events.get('trust')!(); await flush(); expect(h.panels).toHaveLength(0)
    h.settings.autoOpen = true; h.events.get('config')!({ affectsConfiguration: () => true }); await flush()
    expect(h.panels).toHaveLength(1)
  })
  it('discards a discovery result from a removed workspace before consuming an attempt', async () => {
    const h = host(), settle = h.notes.beginDiscovery()
    h.sdk.workspace.workspaceFolders[0]!.uri = { path: '/changed', toString: () => '/changed' }; h.events.get('folders')!()
    settle(true); await flush(); expect(h.panels).toHaveLength(0)
    h.ready(); await flush(); expect(h.panels).toHaveLength(1)
  })
  it('reports an explicit read error, keeps auto errors quiet, and allows recovery', async () => {
    const h = host(), read = h.sdk.workspace.fs.readFile.getMockImplementation()!
    h.sdk.workspace.fs.readFile.mockRejectedValue(new Error('missing catalog'))
    h.ready(); await flush(); expect(h.panels).toHaveLength(0); expect(h.state.size).toBe(0)
    expect(h.sdk.window.showErrorMessage).not.toHaveBeenCalled()
    await h.show(); expect(h.sdk.window.showErrorMessage).toHaveBeenCalledOnce()
    h.sdk.workspace.fs.readFile.mockImplementation(read); await h.show(); expect(h.panels).toHaveLength(1)
  })
  it.each(['setting', 'workspace', 'trust'])('cancels during async load on %s change; queued manual recovers', async change => {
    const h = host(), read = h.sdk.workspace.fs.readFile.getMockImplementation()!
    let finish!: () => void
    const pending = new Promise<void>(resolve => { finish = resolve })
    h.sdk.workspace.fs.readFile.mockImplementationOnce(async uri => { await pending; return read(uri) })
    h.ready(); await flush()
    if (change === 'setting') h.settings.autoOpen = false
    else if (change === 'trust') h.sdk.workspace.isTrusted = false
    else { h.sdk.workspace.workspaceFolders[0]!.uri = { path: '/changed', toString: () => '/changed' }; h.events.get('folders')!() }
    finish(); await flush(); await flush()
    if (change === 'setting') h.settings.autoOpen = true
    else if (change === 'trust') h.sdk.workspace.isTrusted = true
    h.events.get('config')!({ affectsConfiguration: () => true }); h.ready(); await flush()
    expect(h.panels).toHaveLength(0)
    await h.show()
    expect(h.panels).toHaveLength(1); expect(h.panels[0].showOptions.preserveFocus).toBe(false)
    expect(h.sdk.window.showErrorMessage).not.toHaveBeenCalled()
  })
})

it('reads only referenced media at runtime and tolerates unrelated installed sidecars', async () => {
  const h = host(); h.sdk.workspace.fs.readDirectory.mockResolvedValue([['desktop.ini',1]])
  await h.show(); expect(h.panels).toHaveLength(1)
  expect(h.sdk.workspace.fs.readDirectory).not.toHaveBeenCalled()
})
