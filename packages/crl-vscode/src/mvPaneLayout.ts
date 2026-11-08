// REFACTOR:grounded: MV support panes share a compact default; the tree owns the remaining width.
export interface EditorLayoutGroup { size?: number; groups?: EditorLayoutGroup[] }
export interface EditorLayout { orientation: number; groups: EditorLayoutGroup[] }
export interface LayoutPanel { identity: object; column: number | undefined }
export interface MvLayoutSnapshot {
  epoch: string;
  tree: LayoutPanel;
  support: LayoutPanel[];
  groups: LayoutPanel[];
}

/** Resize existing horizontal siblings only. Never flatten a grid, move tabs, or change leaf count.
 * VS Code getEditorLayout serializes group sizes from grid box dimensions (CSS pixels).
 */
export function compactMvLayout(layout: EditorLayout, treeColumn: number, supportColumns: number[]): EditorLayout | undefined {
  const columns = [treeColumn, ...supportColumns];
  if (!supportColumns.length || new Set(columns).size !== columns.length || columns.some(c => !Number.isInteger(c) || c < 1)) return;
  const copy: EditorLayout = structuredClone(layout);
  let column = 0, changed = false;
  function visit(groups: EditorLayoutGroup[], orientation: number): void {
    const leaves = new Map<number, EditorLayoutGroup>();
    for (const group of groups) {
      if (group.groups) visit(group.groups, 1 - orientation);
      else leaves.set(++column, group);
    }
    if (orientation !== 0 || !columns.every(c => leaves.has(c))) return;
    const owned = columns.map(c => leaves.get(c)!);
    if (owned.some(g => !Number.isFinite(g.size) || g.size! <= 1)) return;
    const total = owned.reduce((sum, g) => sum + g.size!, 0);
    // Reserve the tree's useful working area where possible, sharing constrained space equally.
    const supportWidth = Math.min(380, Math.max(Math.min(220, total / columns.length), (total - 500) / supportColumns.length));
    owned[0].size = total - supportWidth * supportColumns.length;
    for (const group of owned.slice(1)) group.size = supportWidth;
    changed = true;
  }
  visit(copy.groups, copy.orientation);
  return changed && JSON.stringify(copy) !== JSON.stringify(layout) ? copy : undefined;
}

const samePanels = (a: LayoutPanel[], b: LayoutPanel[]) => a.length === b.length && a.every((p, i) => p.identity === b[i].identity && p.column === b[i].column);
const sameTopology = (a: MvLayoutSnapshot | undefined, b: MvLayoutSnapshot | undefined) => a === b || (!!a && !!b
  && samePanels([a.tree, ...a.support], [b.tree, ...b.support]) && samePanels(a.groups, b.groups));
const sameSnapshot = (a: MvLayoutSnapshot, b: MvLayoutSnapshot | undefined) => !!b && a.epoch === b.epoch && sameTopology(a, b);

/** Lifecycle requests are coalesced and serialized. Focus-only tab events and ordinary row updates do nothing. */
export function createMvPaneLayout(
  snapshot: () => MvLayoutSnapshot | undefined,
  command: <T>(name: string, value?: EditorLayout) => PromiseLike<T>,
  report: (error: unknown) => void,
) {
  let revision = 0, disposed = false, running = false, timer: ReturnType<typeof setTimeout> | undefined;
  let topology = snapshot();
  const request = () => {
    ++revision;
    if (disposed || running) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = undefined; void run(); }, 40);
  };
  async function run(): Promise<void> {
    if (disposed || running) return;
    running = true;
    const mine = revision;
    try {
      const before = snapshot();
      if (!before || before.tree.column === undefined) return;
      topology = before;
      const layout = await command<EditorLayout>('vscode.getEditorLayout');
      if (disposed || mine !== revision || !sameSnapshot(before, snapshot())) return;
      const count = (groups: EditorLayoutGroup[]): number => groups.reduce((n, g) => n + (g.groups ? count(g.groups) : 1), 0);
      if (!layout?.groups || count(layout.groups) !== before.groups.length) return;
      const next = compactMvLayout(layout, before.tree.column, before.support.flatMap(p => p.column === undefined ? [] : [p.column]));
      if (next) await command('vscode.setEditorLayout', next);
    } catch (error) { if (!disposed) report(error); }
    finally { running = false; if (!disposed && mine !== revision) request(); }
  }
  return {
    request,
    groupsChanged() {
      const next = snapshot();
      if (sameTopology(topology, next)) return;
      topology = next;
      request();
    },
    dispose() { disposed = true; ++revision; if (timer) clearTimeout(timer); },
  };
}
