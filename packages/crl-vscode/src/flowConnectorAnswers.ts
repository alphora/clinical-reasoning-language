/// <reference lib="dom" />
/** REFACTOR:grounded: disclosures annotate real edges; opening one never changes layout or clinical state. */
export function installFlowConnectorAnswers(root: HTMLElement) {
  const opened = new Set<string>();
  const beforeRender = () => {
    opened.clear();
    for (const d of Array.from(root.querySelectorAll<HTMLDetailsElement>('details[data-connector-disclosure]')))
      if (d.open) opened.add(d.dataset.connectorDisclosure!);
  };
  const restore = () => {
    for (const d of Array.from(root.querySelectorAll<HTMLDetailsElement>('details[data-connector-disclosure]')))
      d.open = opened.has(d.dataset.connectorDisclosure!);
  };
  const reset = () => opened.clear();
  const update = () => {
    const svg = root.querySelector<SVGSVGElement>('.flow-svg'), matrix = svg?.getCTM();
    if (!svg || !matrix) return;
    const win = root.ownerDocument.defaultView!;
    const nodes = new Map(Array.from(root.querySelectorAll<SVGGElement>('[data-flow-key]')).map(n => [n.dataset.flowKey, n]));
    const box = (n: SVGGElement | undefined) => {
      const r = n?.querySelector<SVGRectElement>(':scope > rect'), m = r?.getCTM();
      if (!n?.getClientRects().length || !r || !m) return;
      const b = r.getBBox(), t = matrix.inverse().multiply(m);
      const a = new win.DOMPoint(b.x,b.y).matrixTransform(t), z = new win.DOMPoint(b.x+b.width,b.y+b.height).matrixTransform(t);
      return {left:a.x,right:z.x,center:(a.y+z.y)/2};
    };
    for (const group of Array.from(root.querySelectorAll<SVGGElement>('.flow-connector-answers'))) {
      const a = box(nodes.get(group.dataset.answerFrom)), b = box(nodes.get(group.dataset.answerTo));
      group.style.display = a && b ? '' : 'none';
      if (!a || !b) continue;
      const fo = group.querySelector('foreignObject')!;
      const width = Number(fo.getAttribute('width')), height = Number(group.dataset.answerHeight);
      const x = b.left - width - 20;
      fo.setAttribute('x',String(x)); fo.setAttribute('y',String(b.center-height/2));
      const edge = Array.from(root.querySelectorAll<SVGPathElement>('.flow-edge')).find(e=>e.dataset.flowFrom===group.dataset.answerFrom && e.dataset.flowTo===group.dataset.answerTo);
      // Approach the target-aligned panel through its center, rather than putting a list on a crossing curve.
      if (edge) edge.setAttribute('d',`M${a.right} ${a.center} C${a.right+20} ${a.center} ${x-20} ${b.center} ${x} ${b.center} H${b.left}`);
    }
  };
  return { beforeRender, restore, reset, update };
}
