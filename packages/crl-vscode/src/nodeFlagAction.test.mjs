import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { expect, test } from 'vitest';

// Execute the actual host action with controlled async chooser/discard boundaries.
const source = readFileSync(new URL('./correspondenceCockpit.ts', import.meta.url), 'utf8');
const action = source.match(/async function nodeFlagAction\([\s\S]*?\n  \}/)[0];
const js = transformSync(action, { loader: 'ts', target: 'es2022' }).code;
function setup() {
  const tree = { gen: 3, reveals: { r: { nodeKey: 'n' } }, flaggableGids: ['g'] };
  const created = [], opened = [], choices = [{ kind: 'concept', label: 'Concept' }, { kind: 'decision', label: 'This condition' }];
  const state = {
    views: new Map([['tree', tree]]), mode: 'medical-validation', indexVersion: 1, currentCel: 'policy.cel',
    flagsByGid: new Map(), flagTargetChoices: () => choices,
    flagNote: () => {}, openNodeFlags: gid => opened.push(gid), openFlagDrawer: draft => created.push(draft),
    guardDrawerDiscard: async () => true,
    vscode: { window: { showQuickPick: async items => items[1] } },
  };
  const run = runInNewContext(js + '\nnodeFlagAction', state);
  return { tree, state, run, created, opened, choices };
}
test('grey flag retains concept versus occurrence choice; yellow opens without creating', async () => {
  const s = setup(); await s.run('r','g',3); expect(s.created[0].target).toBe(s.choices[1]);
  s.state.flagsByGid.set('g', [{}]); await s.run('r','g',3); expect(s.opened).toEqual(['g']); expect(s.created).toHaveLength(1);
});
test('stale generation and unknown targets cannot create flags', async () => {
  const s = setup(); await s.run('r','g',2); await s.run('missing','g',3); await s.run('r','missing',3);
  s.state.flagTargetChoices = () => []; await s.run('r','g',3); expect(s.created).toEqual([]); expect(s.opened).toEqual([]);
});
test('rebuild while choosing a target does not create a stale draft', async () => {
  const s = setup(); s.state.vscode.window.showQuickPick = async items => { s.tree.gen++; return items[0]; };
  await s.run('r','g',3); expect(s.created).toEqual([]);
});
test('retarget while confirming draft discard does not create a stale draft', async () => {
  const s = setup(); s.state.guardDrawerDiscard = async () => { s.state.currentCel = 'another.cel'; return true; };
  await s.run('r','g',3); expect(s.created).toEqual([]);
});
test('flag appearing during chooser opens the existing flag instead of creating another', async () => {
  const s = setup(); s.state.vscode.window.showQuickPick = async items => { s.state.flagsByGid.set('g',[{}]); return items[0]; };
  await s.run('r','g',3); expect(s.created).toEqual([]); expect(s.opened).toEqual(['g']);
});
test('single target skips scope picker and discard cancellation preserves the draft', async () => {
  const s = setup(); s.state.flagTargetChoices = () => [s.choices[0]];
  s.state.vscode.window.showQuickPick = async () => { throw Error('Unexpected scope picker'); };
  s.state.guardDrawerDiscard = async () => false; await s.run('r','g',3); expect(s.created).toEqual([]);
  s.state.guardDrawerDiscard = async () => true; await s.run('r','g',3); expect(s.created[0].target).toBe(s.choices[0]);
});
