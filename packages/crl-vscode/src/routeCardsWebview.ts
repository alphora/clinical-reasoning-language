/// <reference lib="dom" />
// REFACTOR:grounded: both arrangements render one host-constructed pinned snapshot.
// Kept self-contained so the exact browser controller can be exercised in DOM tests.
export function installRouteCards(root: HTMLElement, api: { postMessage(m: unknown): void }, generation: () => number, onLayout: () => void = () => {}) {
  let snapshot: any, layout = "attached", layer: SVGGElement | undefined, originalBox: string | null = null;
  let toolbar: HTMLDivElement | undefined;
  const ns = "http://www.w3.org/2000/svg";
  const svgEl = (tag: string, attrs: Record<string, string | number>) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, val] of Object.entries(attrs)) el.setAttribute(k, String(val));
    return el;
  };
  function clear() {
    layer?.remove(); layer = undefined; toolbar?.remove(); toolbar = undefined;
    const svg = root.querySelector<SVGSVGElement>(".flow-svg");
    if (svg && originalBox) { svg.setAttribute("viewBox", originalBox); const b = originalBox.split(" ").map(Number); svg.setAttribute("width", String(b[2])); svg.setAttribute("height", String(b[3])); }
    originalBox = null;
  }
  function render() {
    clear();
    const svg = root.querySelector<SVGSVGElement>(".flow-svg");
    if (!snapshot || !svg) return;
    originalBox = svg.getAttribute("viewBox");
    toolbar = document.createElement("div"); toolbar.className = "route-card-toolbar";
    const title = document.createElement("span"); title.textContent = snapshot.label + " · CRL / CEL inspection"; toolbar.append(title);
    for (const [key, name] of [["attached", "Cards above nodes"], ["column", "Cards in column"]]) {
      const b = document.createElement("button"); b.textContent = name; b.setAttribute("aria-pressed", String(layout === key));
      b.onclick = () => { layout = key; render(); }; toolbar.append(b);
    }
    if (snapshot.note) { const note = document.createElement("div"); note.className = "route-card-note"; note.setAttribute("role", "status"); note.textContent = snapshot.note; toolbar.append(note); }
    root.prepend(toolbar);
    layer = svgEl("g", { class: "route-cards" }) as SVGGElement; svg.append(layer);
    const nodes = Array.from(root.querySelectorAll<SVGGElement>("[data-flow-key]"));
    const visibleBoxes = nodes.filter(n => getComputedStyle(n).display !== "none").map(n => n.querySelector("rect")?.getBBox()).filter((b): b is DOMRect => !!b);
    const cardBandBottom = Math.min(0, ...visibleBoxes.map(b => b.y)) - 28;
    const placements: { card: any; box: DOMRect; x: number; y: number; height: number; form: HTMLDivElement; fo: Element }[] = [];
    let columnY = -32, minY = 0, minX = 0, maxX = Number(svg.getAttribute("width")), stacks = new Map<string, number>();
    // DOM textContent for every authored string; no authored HTML enters the canvas.
    for (const card of snapshot.cards) {
      const owner = nodes.find(n => n.dataset.flowKey === card.ownerKey);
      if (!owner) continue;
      const box = owner.querySelector("rect")?.getBBox(); if (!box) continue;
      const form = document.createElement("div"); form.className = "route-card"; form.dataset.cardId = card.id;
      const caption = document.createElement("div"); caption.className = "route-card-caption"; caption.textContent = card.explanation ? "Supporting value" : "Condition"; form.append(caption);
      const text = document.createElement("div"); text.className = "route-card-question"; text.textContent = card.text; form.append(text);
      if (card.description) { const desc = document.createElement("div"); desc.className = "route-card-description"; desc.textContent = card.description; form.append(desc); }
      const value = document.createElement("div"); value.className = "route-card-value"; value.textContent = card.value; form.append(value);
      const status = document.createElement("div"); status.className = "route-card-status"; status.setAttribute("role", "status"); status.textContent = card.proposal ? "Proposed wording saved — awaiting CRL owner and re-emit" : ""; form.append(status);
      const go = document.createElement("button"); go.textContent = "Show source"; go.onclick = () => api.postMessage({ type: "routeCardSource", gen: generation(), token: snapshot.token, key: card.id }); form.append(go);
      if (card.readOnlyReason) { const reason = document.createElement("p"); reason.textContent = card.readOnlyReason; form.append(reason); }
      if (card.editable) {
        const edit = document.createElement("button"); edit.textContent = "Propose wording…"; form.append(edit);
        const editor = document.createElement("div"); editor.hidden = true;
        const scope = document.createElement("p"); scope.textContent = "MV proposal only. Scope: " + card.scopeLabel; editor.append(scope);
        const input = document.createElement("textarea"), desc = document.createElement("textarea");
        input.setAttribute("aria-label", "Question text"); desc.setAttribute("aria-label", "Question description");
        input.value = card.draftText ?? card.text; desc.value = card.draftDescription ?? card.description;
        input.oninput = () => { card.draftText = input.value; }; desc.oninput = () => { card.draftDescription = desc.value; };
        editor.append(input, desc);
        const save = document.createElement("button"); save.textContent = "Save MV patch";
        save.onclick = () => { save.disabled = true; status.textContent = "Saving proposal…"; api.postMessage({ type: "routeCardProposal", gen: generation(), token: snapshot.token, key: card.id, fields: { questionText: input.value, questionDescription: desc.value } }); };
        const cancel = document.createElement("button"); cancel.textContent = "Cancel"; cancel.onclick = () => { card.editing = false; delete card.draftText; delete card.draftDescription; render(); };
        editor.append(save, cancel); form.append(editor);
        edit.onclick = () => { card.editing = true; render(); root.querySelector<HTMLTextAreaElement>('[data-card-id="'+card.id+'"] textarea')?.focus(); };
        editor.hidden = !card.editing;
      }
      form.addEventListener("click", e => e.stopPropagation()); form.addEventListener("keydown", e => e.stopPropagation());
      const fo = svgEl("foreignObject", { width: 200, height: 1000, x: box.x, y: -1000 }); fo.append(form); layer.append(fo);
      const height = Math.ceil(form.getBoundingClientRect().height / (svg.getScreenCTM()?.d || 1)) + 8;
      const x = layout === "column" ? 24 : box.x - 16;
      const y = layout === "column" ? columnY - height : Math.min(cardBandBottom, stacks.get(card.ownerKey) ?? Infinity) - height;
      columnY = y - 16; stacks.set(card.ownerKey, y - 16);
      placements.push({ card, box, x, y, height, form, fo });
    }
    if (layout === "column") { let y = -placements.reduce((n,p) => n+p.height+16, 32); for (const p of placements) { p.y=y; y+=p.height+16; } }
    // Attached cards on close adjacent nodes occupy separate vertical tiers to avoid overlap.
    const placed: typeof placements = [];
    for (const p of placements) {
      if (layout === "attached") { let collision; do { collision = placed.find(other => p.x < other.x + 216 && p.x + 216 > other.x && p.y < other.y + other.height + 16 && p.y + p.height + 16 > other.y); if (collision) p.y = collision.y-p.height-16; } while(collision); }
      p.fo.setAttribute("x", String(p.x)); p.fo.setAttribute("y", String(p.y)); p.fo.setAttribute("height", String(p.height));
      const line = svgEl("path", { d: `M ${p.x + 100} ${p.y + p.height} L ${p.box.x + p.box.width / 2} ${p.box.y}`, class: "route-card-connector" });
      layer.insertBefore(line, layer.firstChild); placed.push(p);
      minY = Math.min(minY, p.y - 16); minX = Math.min(minX, p.x - 16); maxX = Math.max(maxX, p.x + 216);
    }
    const b = (originalBox ?? "0 0 1000 800").split(" ").map(Number);
    svg.setAttribute("viewBox", `${minX} ${minY} ${maxX-minX} ${b[3]-minY}`); svg.setAttribute("width", String(maxX-minX)); svg.setAttribute("height", String(b[3]-minY));
    onLayout();
  }
  return {
    show(value: any) { if (snapshot?.token === value.token) for (const card of value.cards) {
      const previous = snapshot.cards.find((c: any) => c.id === card.id);
      if (previous) Object.assign(card, { editing: previous.editing, draftText: previous.draftText, draftDescription: previous.draftDescription, proposal: previous.proposal });
    } snapshot = value; render(); },
    reset() { snapshot = undefined; clear(); },
    rebind() { originalBox = null; layer = undefined; toolbar?.remove(); render(); },
    result(message: any) { if (!snapshot || message.token !== snapshot.token) return; const card = snapshot.cards.find((c: any) => c.id === message.key); if (!card) return;
      card.proposal = message.ok; if (message.ok) card.editing = false; render();
      const status = root.querySelector<HTMLElement>('[data-card-id="'+card.id+'"] .route-card-status'); if (status) status.textContent = message.message; },
  };
}

export const ROUTE_CARD_STYLE = `
.route-card-toolbar { display:flex; flex-wrap:wrap; gap:8px; padding:8px; align-items:center; }
.route-card { box-sizing:border-box; width:200px; padding:12px; border:2px solid var(--vscode-focusBorder,#3794ff); border-radius:8px; background:var(--vscode-editor-background,#202020); color:var(--vscode-editor-foreground,#ddd); font:13px/1.45 var(--vscode-font-family,sans-serif); overflow-wrap:anywhere; }
.route-card-caption { font-size:11px; opacity:.8; } .route-card-question { font-weight:600; white-space:pre-wrap; }
.route-card-description { margin-top:5px; white-space:pre-wrap; } .route-card-value { margin:8px 0; font-weight:bold; }
.route-card-status { font-size:12px; color:var(--vscode-editorWarning-foreground,#cca700); }
.route-card button,.route-card-toolbar button { cursor:pointer; margin:3px; padding:4px 6px; border:1px solid var(--vscode-button-border,transparent); background:var(--vscode-button-secondaryBackground,#333); color:var(--vscode-button-secondaryForeground,#eee); border-radius:3px; }
.route-card-note { flex-basis:100%; color:var(--vscode-editorWarning-foreground,#cca700); }
.route-card textarea { box-sizing:border-box; width:100%; min-height:64px; resize:vertical; background:var(--vscode-input-background,#303030); color:var(--vscode-input-foreground,#ddd); }
.route-card-connector { fill:none; stroke:var(--vscode-focusBorder,#3794ff); stroke-width:2.5; pointer-events:none; }
`;
