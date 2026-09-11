/// <reference lib="dom" />
// REFACTOR:grounded: operator mockups govern cap geometry and a compact detached questionnaire; data remains one pinned snapshot.
// Kept self-contained so the exact browser controller can be exercised in DOM tests.
export function installRouteCards(root: HTMLElement, api: { postMessage(m: unknown): void }, generation: () => number, onLayout: () => void = () => {}) {
  let snapshot: any, layout = "attached", layer: SVGGElement | undefined, originalBox: string | null = null;
  let toolbar: HTMLDivElement | undefined;
  let restore: (() => void)[] = [];
  const set = (el: Element, name: string, value: string | number) => {
    const before = el.getAttribute(name); restore.push(() => before === null ? el.removeAttribute(name) : el.setAttribute(name, before));
    el.setAttribute(name, String(value));
  };
  const ns = "http://www.w3.org/2000/svg";
  const svgEl = (tag: string, attrs: Record<string, string | number>) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, val] of Object.entries(attrs)) el.setAttribute(k, String(val));
    return el;
  };
  function clear() {
    for (const undo of restore.reverse()) undo(); restore = [];
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
    const visible = nodes.filter(n => getComputedStyle(n).display !== "none");
    const base = new Map(visible.map(n => [n, n.querySelector<SVGRectElement>(":scope > rect")?.getBBox() ?? n.getBBox()]));
    const byKey = new Map(nodes.map(n => [n.dataset.flowKey!, n]));
    const primary = visible.filter(n => !n.dataset.flowOutline && base.get(n)!.width > 0);
    const primaryOwner = (n: SVGGElement): SVGGElement | undefined => {
      const seen = new Set<SVGGElement>();
      while (!primary.includes(n)) { if (seen.has(n)) return; seen.add(n); const parent=byKey.get(n.dataset.flowParent!); if (!parent) return; n=parent; }
      return n;
    };
    const placements: { card: any; owner: SVGGElement; height: number; form: HTMLDivElement; fo: Element }[] = [];
    const cardWidth = layout === "column" ? 560 : 320;
    const panel = document.createElement("div"); panel.className = "route-questionnaire";
    let panelFo: Element | undefined;
    if (layout === "column") { panelFo=svgEl("foreignObject", {width:cardWidth, height:20000}); panelFo.append(panel); layer.append(panelFo); }
    // DOM textContent for every authored string; no authored HTML enters the canvas.
    for (const [index, card] of snapshot.cards.entries()) {
      const owner = nodes.find(n => n.dataset.flowKey === card.ownerKey);
      if (!owner) continue;
      if (!base.has(owner)) continue;
      const form = document.createElement("div"); form.className = "route-card"; form.dataset.cardId = card.id; form.style.width = cardWidth + "px";
      const caption = document.createElement("div"); caption.className = "route-card-caption"; caption.textContent = String(index + 1); form.append(caption);
      const text = document.createElement("div"); text.className = "route-card-question"; text.textContent = card.text; form.append(text);
      if (card.description) {
        const toggle=document.createElement("button"); toggle.className="route-description-toggle"; toggle.textContent="Description"; toggle.setAttribute("aria-expanded", String(!!card.descriptionOpen));
        toggle.onclick=()=>{card.descriptionOpen=!card.descriptionOpen;render();root.querySelector<HTMLButtonElement>('[data-card-id="'+card.id+'"] .route-description-toggle')?.focus();}; form.append(toggle);
        if (card.descriptionOpen) { const desc=document.createElement("div");desc.className="route-card-description";desc.textContent=card.description;form.append(desc); }
      }
      const value = document.createElement("div"); value.className = "route-card-value"; value.textContent = /^(Determination:|Not answered)/.test(card.value) ? card.value : "Answer: " + card.value; form.insertBefore(value, form.querySelector(".route-description-toggle"));
      const status = document.createElement("div"); status.className = "route-card-status"; status.setAttribute("role", "status"); status.textContent = card.proposal ? "Proposed wording saved — awaiting CRL owner and re-emit" : ""; form.append(status);
      const go = document.createElement("button"); go.textContent = "Show source"; go.onclick = () => api.postMessage({ type: "routeCardSource", gen: generation(), token: snapshot.token, key: card.id }); const actions=document.createElement("div"); actions.className="route-card-actions";form.append(actions);actions.append(go);
      if (card.readOnlyReason) { const reason = document.createElement("p"); reason.textContent = card.readOnlyReason; form.append(reason); }
      if (card.editable) {
        const edit = document.createElement("button"); edit.textContent = "Propose wording…"; actions.append(edit);
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
      const fo = layout === "column" ? panelFo! : svgEl("foreignObject", { width:cardWidth, height:20000 });
      if (layout === "column") panel.append(form); else { fo.append(form); layer.append(fo); }
      const height = Math.ceil(form.offsetHeight);
      placements.push({card, owner, height, form, fo});
    }
    // REFACTOR:grounded: reserve caps and outline extents in each graph column. Existing edges, never array order, define topology.
    const stackHeight = (n: SVGGElement) => placements.filter(p=>p.owner===n).reduce((h,p)=>h+p.height,0);
    const panelHeight=layout==="column" ? Math.ceil(panel.offsetHeight) : 0;
    const columns=[...new Set(primary.map(n=>base.get(n)!.x))].sort((a,b)=>a-b);
    const positions=new Map<SVGGElement,{x:number;y:number;width:number;height:number}>();
    let right=40, bottom=40;
    for (const col of columns) {
      const members=primary.filter(n=>base.get(n)!.x===col).sort((a,b)=>base.get(a)!.y-base.get(b)!.y);
      let cursor=40+panelHeight+(layout==="column"?100:0), extent=320;
      for (const n of members) {
        const box=base.get(n)!, cap=layout==="attached"?stackHeight(n):0;
        const y=cursor+cap, width=320;
        positions.set(n,{x:right,y,width,height:box.height});
        let groupBottom=y+box.height;
        for (const child of visible.filter(c=>c!==n&&primaryOwner(c)===n)) {
          const b=base.get(child)!;
          positions.set(child,{x:right+b.x-box.x,y:y+b.y-box.y,width:b.width,height:b.height});
          groupBottom=Math.max(groupBottom,y+b.y-box.y+b.height);
          extent=Math.max(extent,b.x-box.x+b.width);
        }
        cursor=groupBottom+60; bottom=Math.max(bottom,groupBottom+40);
      }
      right+=extent+100;
    }
    for (const [n,pos] of positions) {
      const b=base.get(n)!; set(n,"transform",`translate(${pos.x-b.x} ${pos.y-b.y})`);
      if (!n.dataset.flowOutline) {
        const rect=n.querySelector<SVGRectElement>(":scope > rect");if(rect)set(rect,"width",pos.width);
        for(const ring of Array.from(n.querySelectorAll<SVGRectElement>(":scope > .flow-ring > rect")))set(ring,"width",pos.width+(Number(ring.getAttribute("width"))-b.width));
        for(const text of Array.from(n.querySelectorAll<SVGTextElement>(":scope > text[text-anchor=middle]"))){set(text,"x",b.x+pos.width/2);for(const t of Array.from(text.querySelectorAll("tspan[x]")))set(t,"x",b.x+pos.width/2);}
        for(const adornment of Array.from(n.querySelectorAll(":scope > .flow-pin,:scope > .flow-false-stop")))set(adornment,"transform",`translate(${pos.width-b.width} 0)`);
      }
    }
    for(const edge of Array.from(root.querySelectorAll<SVGPathElement>("path[data-flow-from]"))) {
      const a=positions.get(byKey.get(edge.dataset.flowFrom!)!), b=positions.get(byKey.get(edge.dataset.flowTo!)!); if(!a||!b)continue;
      const x=a.x+a.width,y=a.y+a.height/2,ex=b.x,ey=b.y+b.height/2,m=(x+ex)/2;
      set(edge,"d",edge.classList.contains("flow-def-edge") ? `M${a.x+10} ${y} V${ey} H${ex}` : `M${x} ${y} C${m} ${y} ${m} ${ey} ${ex} ${ey}`);
    }
    if(layout==="column") {
      const x=Math.max(40,(right-100-cardWidth)/2); panelFo!.setAttribute("x",String(x)); panelFo!.setAttribute("y","20");panelFo!.setAttribute("height",String(panelHeight));
      let y=20;
      for(const p of placements) { const box=positions.get(p.owner);if(!box)continue;
        const line=svgEl("path",{d:`M${x+cardWidth} ${y+p.height/2} L${box.x+box.width/2} ${box.y}`,class:"route-card-connector"});layer.insertBefore(line,layer.firstChild);y+=p.height;
      }
      right=Math.max(right,x+cardWidth+40);
    } else {
      const used=new Map<SVGGElement,number>();
      for(const p of placements) {const box=positions.get(p.owner);if(!box)continue;
        const y=box.y-stackHeight(p.owner)+(used.get(p.owner)??0);used.set(p.owner,(used.get(p.owner)??0)+p.height);
        p.fo.setAttribute("x",String(box.x));p.fo.setAttribute("y",String(y));p.fo.setAttribute("height",String(p.height));
      }
    }
    svg.setAttribute("viewBox",`0 0 ${right} ${bottom}`);svg.setAttribute("width",String(right));svg.setAttribute("height",String(bottom));
    onLayout();
  }
  return {
    show(value: any) { if (snapshot?.token === value.token) for (const card of value.cards) {
      const previous = snapshot.cards.find((c: any) => c.id === card.id);
      if (previous) Object.assign(card, { editing: previous.editing, draftText: previous.draftText, draftDescription: previous.draftDescription, proposal: previous.proposal, descriptionOpen: previous.descriptionOpen });
    } snapshot = value; render(); },
    reset() { snapshot = undefined; clear(); },
    rebind() { restore = []; originalBox = null; layer = undefined; toolbar?.remove(); render(); },
    result(message: any) { if (!snapshot || message.token !== snapshot.token) return; const card = snapshot.cards.find((c: any) => c.id === message.key); if (!card) return;
      card.proposal = message.ok; if (message.ok) card.editing = false; render();
      const status = root.querySelector<HTMLElement>('[data-card-id="'+card.id+'"] .route-card-status'); if (status) status.textContent = message.message; },
  };
}

export const ROUTE_CARD_STYLE = `
.route-card-toolbar { display:flex; flex-wrap:wrap; gap:8px; padding:8px; align-items:center; }
.route-card { box-sizing:border-box; padding:10px 12px; border:1px solid var(--vscode-focusBorder,#3794ff); background:var(--vscode-editor-background,#202020); color:var(--vscode-editor-foreground,#ddd); font:14px/1.4 var(--vscode-font-family,sans-serif); overflow-wrap:anywhere; }
.route-card-caption { float:left; margin:2px 8px 0 0; font-size:11px; opacity:.75; border:1px solid var(--vscode-panel-border,#555); border-radius:3px; padding:0 4px; }
.route-card-question { font-weight:600; white-space:pre-wrap; }
.route-card-description { margin:6px 0; white-space:pre-wrap; } .route-card-value { margin:6px 0; }
.route-card-status { font-size:12px; color:var(--vscode-editorWarning-foreground,#cca700); }
.route-card button,.route-card-toolbar button { cursor:pointer; padding:2px 5px; border:1px solid var(--vscode-button-border,transparent); background:var(--vscode-button-secondaryBackground,#333); color:var(--vscode-button-secondaryForeground,#eee); border-radius:3px; }
.route-card-actions { display:flex; gap:8px; margin-top:4px; } .route-card-actions button,.route-description-toggle { font-size:11px; }
.route-description-toggle { margin-top:5px; } .route-description-toggle[aria-expanded=false]::before { content:'▸ '; } .route-description-toggle[aria-expanded=true]::before { content:'▾ '; }
.route-questionnaire .route-card { padding:7px 10px; font-size:13px; } .route-questionnaire .route-card-question { display:inline; } .route-questionnaire .route-card-value { display:inline-block; margin:0 0 0 8px; font-size:12px; } .route-questionnaire .route-description-toggle { display:block; } .route-questionnaire .route-card-actions { margin-top:2px; }
.route-questionnaire { width:560px; border-radius:6px; overflow:hidden; } .route-questionnaire .route-card { border-bottom:0; } .route-questionnaire .route-card:last-child { border-bottom:1px solid var(--vscode-focusBorder,#3794ff); }
.route-card-note { flex-basis:100%; color:var(--vscode-editorWarning-foreground,#cca700); }
.route-card textarea { box-sizing:border-box; width:100%; min-height:64px; resize:none; background:var(--vscode-input-background,#303030); color:var(--vscode-input-foreground,#ddd); }
.route-card-connector { fill:none; stroke:var(--vscode-descriptionForeground,#8c8c8c); stroke-width:1; pointer-events:none; vector-effect:non-scaling-stroke; }
`;
