/// <reference lib="dom" />
/** End connectors at the visible stroke, including a selected node's outer ring. */
export function alignFlowConnectorBorders(root: HTMLElement) {
  const svg = root.querySelector<SVGSVGElement>('.flow-svg');
  const matrix = svg?.getCTM();
  if (!svg || !matrix) return;
  const win = root.ownerDocument.defaultView!;
  const nodes = new Map(Array.from(root.querySelectorAll<SVGGElement>('[data-flow-key]')).map(n => [n.dataset.flowKey, n]));
  const border = (node: SVGGElement | undefined) => {
    if (!node || !node.getClientRects().length) return;
    const body = node.querySelector<SVGRectElement>(':scope > rect');
    const ring = node.querySelector<SVGRectElement>(':scope > .flow-ring > rect');
    const rect = ring && win.getComputedStyle(ring.parentElement!).display !== 'none' ? ring : body;
    const transform = rect?.getCTM();
    if (!rect || !transform) return;
    const box = rect.getBBox(), stroke = parseFloat(win.getComputedStyle(rect).strokeWidth) / 2 || 0;
    const toSvg = matrix.inverse().multiply(transform);
    const point = (x: number, y: number) => new win.DOMPoint(x, y).matrixTransform(toSvg);
    const bottomX = (body?.getBBox().x ?? box.x) + (node.dataset.flowOutline ? 8 : 10);
    return { left: point(box.x - stroke, box.y + box.height / 2), right: point(box.x + box.width + stroke, box.y + box.height / 2), bottom: point(bottomX, box.y + box.height + stroke) };
  };
  for (const edge of Array.from(root.querySelectorAll<SVGPathElement>('path[data-flow-from][data-flow-to]'))) {
    const from = border(nodes.get(edge.dataset.flowFrom)), to = border(nodes.get(edge.dataset.flowTo));
    if (edge.classList.contains('flow-edge') && from && to) {
      const a = from.right, b = to.left, mid = (a.x + b.x) / 2;
      edge.setAttribute('d', `M${a.x} ${a.y} C${mid} ${a.y} ${mid} ${b.y} ${b.x} ${b.y}`);
    } else if (edge.classList.contains('flow-def-edge')) {
      const d = edge.getAttribute('d') ?? '';
      // Full-tree elbows descend from the parent's bottom; attached-card elbows use a left gutter.
      const elbow = d.match(/^M([\d.e+-]+) ([\d.e+-]+) (?:H([\d.e+-]+) )?V([\d.e+-]+) H([\d.e+-]+)$/);
      if (!elbow) continue;
      const a = from ? (elbow[3] === undefined ? from.bottom : from.left) : { x: Number(elbow[1]), y: Number(elbow[2]) };
      const b = to?.left ?? { x: Number(elbow[5]), y: Number(elbow[4]) };
      const gutter = elbow[3] === undefined ? '' : `H${from ? Math.min(a.x, b.x) - 12 : elbow[3]} `;
      edge.setAttribute('d', `M${a.x} ${a.y} ${gutter}V${b.y} H${b.x}`);
    }
  }
}
