import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
const require = createRequire(import.meta.url)
const built = await build({ entryPoints: [fileURLToPath(new URL('../../src/provenancePanel.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['vscode', '@smile-digital-health/crl', '@smile-digital-health/crl/language-services'] })
const tick = () => new Promise(resolve => setImmediate(resolve))
function setup(findFiles: any, executeCommand: any) {
  let changed: () => void = () => {}
  const commands = new Map<string, Function>()
  const sdk = { EventEmitter: class { event = () => ({ dispose() {} }); fire() {} }, commands: { executeCommand, registerCommand: (id: string, callback: Function) => { commands.set(id, callback); return { dispose() {} } } }, window: { activeTextEditor: { document: { uri: { scheme: 'file', fsPath: '/synthetic-standalone/loose.cel' } } }, createTreeView: () => ({ dispose() {}, message: '' }) }, workspace: { findFiles, onDidChangeWorkspaceFolders: (callback: () => void) => { changed = callback; return { dispose() {} } }, onDidSaveTextDocument: () => ({ dispose() {} }) } }
  const m = { exports: {} as any }
  new Function('require', 'module', 'exports', built.outputFiles[0]!.text)((id: string) => id === 'vscode' ? sdk : require(id), m, m.exports)
  m.exports.registerProvenancePanel({ subscriptions: [] })
  return { changed: () => changed(), show: () => commands.get('crl.showProvenance')!() }
}

describe('provenance discovery stays independent of Release Notes', () => {
  it.each(['find', 'context'])('contains a %s rejection without breaking activation', async failure => {
    const find = vi.fn(async () => { if (failure === 'find') throw new Error('discovery failed'); return [{}] })
    const execute = vi.fn(async () => { if (failure === 'context') throw new Error('context failed') })
    setup(find, execute); await tick()
    if (failure === 'find') expect(execute).not.toHaveBeenCalled()
    else expect(execute).toHaveBeenCalledWith('setContext', 'crl.active', true)
  })
  it('ignores an older discovery result after workspace folders change', async () => {
    let finish!: (hits: unknown[]) => void
    const find = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValueOnce([])
    const execute = vi.fn(async () => {})
    const h = setup(find, execute); h.changed(); await tick(); finish([{}]); await tick()
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenLastCalledWith('setContext', 'crl.active', false)
  })
  it('keeps an established context when a later discovery is empty', async () => {
    const execute = vi.fn(async () => {})
    const h = setup(vi.fn().mockResolvedValueOnce([{}]).mockResolvedValueOnce([]), execute)
    await tick(); h.changed(); await tick()
    expect(execute).toHaveBeenLastCalledWith('setContext', 'crl.active', true)
  })
  it('manual loose-CEL opening invalidates the older pending discovery', async () => {
    let finish!: (hits: unknown[]) => void
    const execute = vi.fn(async () => {})
    const h = setup(vi.fn(() => new Promise(resolve => { finish = resolve })), execute)
    h.show(); finish([]); await tick()
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenLastCalledWith('setContext', 'crl.active', true)
  })
})
