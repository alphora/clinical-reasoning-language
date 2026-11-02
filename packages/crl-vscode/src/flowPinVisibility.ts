/// <reference lib="dom" />
/** Mark the first result without a Pass check for the existing glow cue. */
export function installFlowPinVisibility(root: HTMLElement) {
  const update = () => {
    for (const node of Array.from(root.querySelectorAll('.flow-default-pin'))) node.classList.remove('flow-default-pin');
    const leaves = Array.from(root.querySelectorAll('.flow-activity'));
    (leaves.find(node => !node.classList.contains('leaf-allpass')) ?? leaves[0])?.classList.add('flow-default-pin');
  };
  update();
  return {update, dispose() {}};
}
