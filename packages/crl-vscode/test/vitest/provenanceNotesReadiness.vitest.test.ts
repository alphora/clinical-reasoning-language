import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
const require = createRequire(import.meta.url)
const built = await build({ entryPoints: [fileURLToPath(new URL('../../src/provenancePanel.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['vscode', '@smile-digital-health/crl', '@smile-digital-health/crl/language-services'] })
const tick = () => new Promise(resolve => setImmediate(resolve))
function setup(findFiles: any, executeCommand: any) {
  let changed: () => void = () => {}
  const ready: ReturnType<typeof vi.fn>[] = []
  const commands = new Map<string, Function>()
  const sdk = { EventEmitter: class { event = () => ({ dispose() {} }); fire() {} }, commands: { executeCommand, registerCommand: (id: string, callback: Function) => { commands.set(id, callback); return { dispose() {} } } }, window: { activeTextEditor: { document: { uri: { scheme: 'file', fsPath: '/synthetic-standalone/loose.cel' } } }, createTreeView: () => ({ dispose() {}, message: '' }) }, workspace: { findFiles, onDidChangeWorkspaceFolders: (callback: () => void) => { changed = callback; return { dispose() {} } }, onDidSaveTextDocument: () => ({ dispose() {} }) } }
  const m = { exports: {} as any }
  new Function('require', 'module', 'exports', built.outputFiles[0]!.text)((id: string) => id === 'vscode' ? sdk : require(id), m, m.exports)
  m.exports.registerProvenancePanel({ subscriptions: [] }, () => { const fn = vi.fn(); ready.push(fn); return fn })
  return { ready, changed: () => changed(), show: () => commands.get('crl.showProvenance')!() }
}
describe('actual provenance discovery / notes readiness wiring', () => {
  it.each(['find', 'context'])('settles a %s rejection as ineligible without unhandled rejection', async failure => {
    const find = vi.fn(async () => { if (failure === 'find') throw new Error('discovery failed'); return [{}] })
    const execute = vi.fn(async () => { if (failure === 'context') throw new Error('context failed') })
    const h = setup(find, execute); await tick(); expect(h.ready[0]).toHaveBeenCalledWith(false)
  })
  it('does not notify stale readiness when a folder changes while setContext is pending', async () => {
    const completions: (() => void)[] = []
    const h = setup(vi.fn(async () => [{}]), vi.fn(() => new Promise<void>(resolve => completions.push(resolve))))
    await tick(); h.changed(); await tick()
    completions[0]!(); await tick(); expect(h.ready[0]).not.toHaveBeenCalled()
    completions[1]!(); await tick(); expect(h.ready[1]).toHaveBeenCalledWith(true)
  })
})

it('keeps an established view context active when folder discovery later finds no CRL content', async () => {
  const find = vi.fn().mockResolvedValueOnce([{}]).mockResolvedValueOnce([]), execute = vi.fn(async () => {})
  const h = setup(find, execute); await tick(); h.changed(); await tick()
  expect(execute).toHaveBeenLastCalledWith('setContext', 'crl.active', true)
  expect(h.ready[1]).toHaveBeenCalledWith(false)
})
it('manual loose-CEL readiness invalidates the older pending discovery', async () => {
  let finish!: (hits: unknown[]) => void
  const h = setup(vi.fn(() => new Promise(resolve => { finish = resolve })), vi.fn(async () => {}))
  h.show(); finish([]); await tick()
  expect(h.ready[0]).not.toHaveBeenCalled()
  expect(h.ready[1]).toHaveBeenCalledWith(true)
})
