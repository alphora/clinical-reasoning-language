/// <reference lib="dom" />
/** At rest offer the first result without a Pass check; Shift exposes every result. */
export function installFlowPinVisibility(root: HTMLElement) {
  const doc = root.ownerDocument, win = doc.defaultView!;
  const events = new win.AbortController();
  const shift = (held: boolean) => root.classList.toggle('flow-show-all-pins', held);
  const update = () => {
    for (const node of Array.from(root.querySelectorAll('.flow-default-pin'))) node.classList.remove('flow-default-pin');
    const leaves = Array.from(root.querySelectorAll('.flow-activity'));
    (leaves.find(node => !node.classList.contains('leaf-allpass')) ?? leaves[0])?.classList.add('flow-default-pin');
  };
  doc.addEventListener('keydown', e => { if (e.key === 'Shift') shift(true); }, {signal: events.signal});
  doc.addEventListener('keyup', e => { if (e.key === 'Shift' || !e.shiftKey) shift(false); }, {signal: events.signal});
  root.addEventListener('pointermove', e => shift(e.shiftKey), {signal: events.signal});
  root.addEventListener('pointerdown', e => shift(e.shiftKey), {signal: events.signal});
  win.addEventListener('blur', () => shift(false), {signal: events.signal});
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) shift(false); }, {signal: events.signal});
  update();
  return {update, dispose() { events.abort(); shift(false); }};
}
