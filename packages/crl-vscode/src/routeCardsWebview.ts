/// <reference lib="dom" />
// REFACTOR:grounded: operator mockups govern below-node question geometry and a compact detached questionnaire; data remains one pinned snapshot.
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
    toolbar.title = snapshot.label;
    for (const [key, name] of [["attached", "Attached"], ["column", "Questionnaire"]]) {
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
    const criterionPath = (n: SVGGElement) => {
      const path: string[] = [],seen=new Set<SVGGElement>();
      let current: SVGGElement | undefined=n;
      while(current&&!seen.has(current)) {seen.add(current);if(current.dataset.flowCriterion)path.unshift(current.dataset.flowCriterion);if(current.dataset.flowKey===n.dataset.flowWhen)break;current=byKey.get(current.dataset.flowParent!);}
      return path;
    };
    const primary = visible.filter(n => !n.dataset.flowOutline && base.get(n)!.width > 0);
    const primaryOwner = (n: SVGGElement): SVGGElement | undefined => {
      const seen = new Set<SVGGElement>();
      while (!primary.includes(n)) { if (seen.has(n)) return; seen.add(n); const parent=byKey.get(n.dataset.flowParent!); if (!parent) return; n=parent; }
      return n;
    };
    const placements: { card: any; owner: SVGGElement; height: number; form: HTMLDivElement; fo: Element }[] = [];
    const cardWidth = layout === "column" ? 480 : 260;
    const hidden = new Map<SVGGElement, number[]>();
    const panel = document.createElement("div"); panel.className = "route-questionnaire";
    let panelFo: Element | undefined;
    if (layout === "column") { panelFo=svgEl("foreignObject", {width:cardWidth, height:20000}); panelFo.append(panel); layer.append(panelFo); }
    // DOM textContent for every authored string; no authored HTML enters the canvas.
    for (const [index, card] of snapshot.cards.entries()) {
      const identity = JSON.stringify([card.library,card.concept]);
      const paths=(card.criterionPaths ?? [card.criteria ?? []]).map((p:any[])=>p.map(c=>JSON.stringify([c.lib,c.name])));
      const owners = visible.filter(n => n.dataset.flowWhen === card.ownerKey && n.dataset.flowQuestion === identity && paths.some((p:string[])=>JSON.stringify(p)===JSON.stringify(criterionPath(n))));
        for (const collapse of visible.filter(n => n.dataset.flowWhen === card.ownerKey && n.dataset.flowHiddenCriterion && paths.some((path:string[])=>{
          const prefix=criterionPath(n);return prefix.length>0 && prefix.length<=path.length && prefix.every((c,i)=>c===path[i]);
        }))) {
          hidden.set(collapse,[...(hidden.get(collapse) ?? []),index+1]);
        }
      // A repeated concept can have several actual occurrences within one condition.
      // Each gets the same question number, rather than choosing an arbitrary parent.
      for (const owner of owners) {
      const shared = layout === "column" ? placements.find(p=>p.card.id===card.id) : undefined;
      if (shared) { placements.push({...shared,owner}); continue; }
      const form = document.createElement("div"); form.className = "route-card"; form.dataset.cardId = card.id; form.style.width = layout === "column" ? "100%" : cardWidth + "px";
      const caption = document.createElement("div"); caption.className = "route-card-caption"; caption.textContent = String(index + 1); form.append(caption);
      const text = document.createElement("div"); text.className = "route-card-question"; text.textContent = card.text; form.append(text);
      if (card.description) {
        const toggle=document.createElement("button"); toggle.className="route-description-toggle"; toggle.textContent="Description"; toggle.setAttribute("aria-expanded", String(!!card.descriptionOpen));
        toggle.onclick=()=>{card.descriptionOpen=!card.descriptionOpen;render();root.querySelector<HTMLButtonElement>('[data-card-id="'+card.id+'"] .route-description-toggle')?.focus();}; form.append(toggle);
        if (card.descriptionOpen) { const desc=document.createElement("div");desc.className="route-card-description";desc.textContent=card.description;form.append(desc); }
      }
      const value = document.createElement("div"); value.className = "route-card-value"; value.textContent = card.value; value.setAttribute("aria-label", "Answer: " + card.value); form.insertBefore(value, form.querySelector(".route-description-toggle"));
      const status = document.createElement("div"); status.className = "route-card-status"; status.setAttribute("role", "status"); status.textContent = card.proposal ? "Saved for KE review" : ""; form.append(status);
      if (card.readOnlyReason) { const reason = document.createElement("p"); reason.textContent = card.readOnlyReason; form.append(reason); }
      if (card.editable) {
        const edit = document.createElement("button"); edit.className="route-card-edit"; edit.title="Edit question"; edit.setAttribute("aria-label","Edit question");
        const pencil = svgEl("svg",{viewBox:"0 0 24 24",width:14,height:14,"aria-hidden":"true"});
        pencil.append(svgEl("path",{d:"M4 16 L16 4 L20 8 L8 20 L4 20 Z M13 7 L17 11",fill:"none",stroke:"currentColor","stroke-width":1.7})); edit.append(pencil);form.append(edit);
        const editor = document.createElement("div"); editor.className="route-card-editor"; editor.hidden = true;
        const scope = document.createElement("p"); scope.textContent = "Saved for the KE to apply. Applies to: " + card.scopeLabel; editor.append(scope);
        const input = document.createElement("textarea"), desc = document.createElement("textarea");
        input.setAttribute("aria-label", "Question text"); desc.setAttribute("aria-label", "Question description");
        input.value = card.draftText ?? card.text; desc.value = card.draftDescription ?? card.description;
        input.oninput = () => { card.draftText = input.value; }; desc.oninput = () => { card.draftDescription = desc.value; };
        const questionLabel=document.createElement("label"); questionLabel.textContent="Question"; questionLabel.append(input);
        const descriptionLabel=document.createElement("label"); descriptionLabel.textContent="Description"; descriptionLabel.append(desc); editor.append(questionLabel,descriptionLabel);
        const save = document.createElement("button"); save.textContent = "Save change";
        save.onclick = () => { save.disabled = true; status.textContent = "Saving…"; api.postMessage({ type: "routeCardProposal", gen: generation(), token: snapshot.token, key: card.id, fields: { questionText: card.draftText ?? card.text, questionDescription: card.draftDescription ?? card.description } }); };
        const cancel = document.createElement("button"); cancel.textContent = "Cancel"; cancel.onclick = () => { card.editing = false; delete card.draftText; delete card.draftDescription; render(); };
        editor.append(save, cancel); form.append(editor);
        edit.onclick = () => { card.editing = true; card.editingOwner=owner.dataset.flowKey; render(); root.querySelector<HTMLTextAreaElement>('[data-card-id="'+card.id+'"] .route-card-editor:not([hidden]) textarea')?.focus(); };
        editor.hidden = !card.editing || (layout!=="column" && card.editingOwner!==owner.dataset.flowKey);
      }
      form.addEventListener("click", e => e.stopPropagation()); form.addEventListener("keydown", e => e.stopPropagation());
      const fo = layout === "column" ? panelFo! : svgEl("foreignObject", { width:cardWidth, height:20000 });
      if (layout === "column") panel.append(form); else { fo.append(form); layer.append(fo); }
      const height = Math.ceil(form.offsetHeight);
      placements.push({card: {...card, number:index+1}, owner, height, form, fo});
      }
    }
    // Align primary rows across columns; reserve each question below its own
    // body before laying out its children or the next sibling.
    const stackHeight = (n: SVGGElement) => placements.filter(p=>p.owner===n).reduce((h,p)=>h+p.height,0);
    const panelHeight=layout==="column" ? Math.ceil(panel.offsetHeight) : 0;
    const columns=[...new Set(primary.map(n=>base.get(n)!.x))].sort((a,b)=>a-b);
    const positions=new Map<SVGGElement,{x:number;y:number;width:number;height:number}>();
    const groups=columns.map(col=>primary.filter(n=>base.get(n)!.x===col).sort((a,b)=>base.get(a)!.y-base.get(b)!.y));
    const descendants=(n:SVGGElement)=>visible.filter(c=>c!==n&&primaryOwner(c)===n).sort((a,b)=>base.get(a)!.y-base.get(b)!.y);
    const widths=groups.map(group=>Math.max(260,...group.flatMap(n=>descendants(n).map(c=>base.get(c)!.x-base.get(n)!.x+260))));
    let right=40+widths.reduce((a,b)=>a+b+90,0),bottom=40;
    let cursor=40;
    for(let row=0;row<Math.max(0,...groups.map(g=>g.length));row++) {
      const y=cursor; let rowBottom=y;
      for(const [ci,group] of groups.entries()) {
        const n=group[row];if(!n)continue;
        const box=base.get(n)!,x=40+widths.slice(0,ci).reduce((a,b)=>a+b+90,0);
        positions.set(n,{x,y,width:260,height:box.height});
        let childCursor=y+box.height+(layout==="attached"?stackHeight(n):0)+24;
        for(const child of descendants(n)) {
          const b=base.get(child)!,h=layout==="attached"?stackHeight(child):0;
          positions.set(child,{x:x+b.x-box.x,y:childCursor,width:child.dataset.flowQuestion?260:b.width,height:b.height});
          childCursor+=b.height+h+18;
        }
        rowBottom=Math.max(rowBottom,childCursor);
      }
      cursor=rowBottom+40;bottom=Math.max(bottom,cursor);
    }
    for (const [n,pos] of positions) {
      const b=base.get(n)!; set(n,"transform",`translate(${pos.x-b.x} ${pos.y-b.y})`);
      if (!n.dataset.flowOutline || n.dataset.flowQuestion) {
        const rect=n.querySelector<SVGRectElement>(":scope > rect");if(rect)set(rect,"width",pos.width);
        for(const ring of Array.from(n.querySelectorAll<SVGRectElement>(":scope > .flow-ring > rect")))set(ring,"width",pos.width+(Number(ring.getAttribute("width"))-b.width));
        for(const text of Array.from(n.querySelectorAll<SVGTextElement>(":scope > text[text-anchor=middle]"))){set(text,"x",b.x+pos.width/2);for(const t of Array.from(text.querySelectorAll("tspan[x]")))set(t,"x",b.x+pos.width/2);}
        for(const adornment of Array.from(n.querySelectorAll(":scope > .flow-pin,:scope > .flow-false-stop")))set(adornment,"transform",`translate(${pos.width-b.width} 0)`);
      }
    }
    for(const edge of Array.from(root.querySelectorAll<SVGPathElement>("path[data-flow-from]"))) {
      const a=positions.get(byKey.get(edge.dataset.flowFrom!)!), b=positions.get(byKey.get(edge.dataset.flowTo!)!); if(!a||!b)continue;
      const x=a.x+a.width,y=a.y+a.height/2,ex=b.x,ey=b.y+b.height/2,m=(x+ex)/2;
      // Explanation lines use the left gutter so transparent questions below a
      // node never have a connector running through their text.
      set(edge,"d",edge.classList.contains("flow-def-edge") ? `M${a.x} ${y} H${Math.min(a.x,b.x)-12} V${ey} H${ex}` : `M${x} ${y} C${m} ${y} ${m} ${ey} ${ex} ${ey}`);
    }
    if(layout==="column") {
      const x=Math.max(40,(right-100-cardWidth)/2),y=bottom+20;
      panelFo!.setAttribute("x",String(x)); panelFo!.setAttribute("y",String(y));panelFo!.setAttribute("height",String(panelHeight));
      bottom=y+panelHeight+20;
      right=Math.max(right,x+cardWidth+40);
    } else {
      const used=new Map<SVGGElement,number>();
      for(const p of placements) {const box=positions.get(p.owner);if(!box)continue;
        const y=box.y+box.height+4+(used.get(p.owner)??0);used.set(p.owner,(used.get(p.owner)??0)+p.height);
        p.fo.setAttribute("x",String(box.x));p.fo.setAttribute("y",String(y));p.fo.setAttribute("height",String(p.height));
      }
    }
    const badge=(owner:SVGGElement,label:string,title:string)=>{
      const box=positions.get(owner);if(!box)return;
      const g=svgEl("g",{class:"route-question-badge",role:"img","aria-label":title});const t=svgEl("title",{});t.textContent=title;g.append(t);
      const width=Math.max(24,label.length*7+12),x=box.x+box.width-width,y=box.y-10;
      g.append(svgEl("rect",{x,y,width,height:19,rx:8}));const text=svgEl("text",{x:x+width/2,y:y+13,"text-anchor":"middle"});text.textContent=label;g.append(text);layer!.append(g);
    };
    if(layout==="column")for(const owner of new Set(placements.map(p=>p.owner))) {
      const numbers=[...new Set(placements.filter(p=>p.owner===owner).map(p=>p.card.number))];badge(owner,numbers.join(","),"Question "+numbers.join(", "));
    }
    for(const [owner,numbers] of hidden)badge(owner,"? "+numbers.length,"Hidden questions: "+numbers.join(", ")+". Expand this condition to show them.");
    svg.setAttribute("viewBox",`0 0 ${right} ${bottom}`);svg.setAttribute("width",String(right));svg.setAttribute("height",String(bottom));
    onLayout();
  }
  return {
    show(value: any) { if (snapshot?.token === value.token) for (const card of value.cards) {
      const previous = snapshot.cards.find((c: any) => c.id === card.id);
      if (previous) Object.assign(card, { editing: previous.editing, editingOwner: previous.editingOwner, draftText: previous.draftText, draftDescription: previous.draftDescription, proposal: previous.proposal, descriptionOpen: previous.descriptionOpen });
    } snapshot = value; render(); },
    reset() { snapshot = undefined; clear(); },
    rebind() { restore = []; originalBox = null; layer = undefined; toolbar?.remove(); render(); },
    result(message: any) { if (!snapshot || message.token !== snapshot.token) return; const card = snapshot.cards.find((c: any) => c.id === message.key); if (!card) return;
      card.proposal = message.ok; if (message.ok) card.editing = false; render();
      const status = root.querySelector<HTMLElement>('[data-card-id="'+card.id+'"] .route-card-status'); if (status) status.textContent = message.message; },
  };
}

export const ROUTE_CARD_STYLE = `
.route-card-toolbar { display:flex; flex-wrap:wrap; gap:6px; padding:6px 0; align-items:center; }
.route-card { position:relative; box-sizing:border-box; padding:5px 25px 5px 2px; border:0; background:transparent; color:var(--vscode-editor-foreground,#ddd); font:12px/1.35 var(--vscode-font-family,sans-serif); overflow-wrap:anywhere; }
.route-card-caption { display:inline-block; vertical-align:baseline; margin:0 6px 0 0; padding:0 4px; font-size:10px; line-height:1.1; border:1px solid var(--vscode-panel-border,#555); border-radius:3px; color:var(--vscode-descriptionForeground,#aaa); }
.route-card-question { display:inline; font-weight:600; white-space:pre-wrap; }
.route-card-description { margin:5px 0; white-space:pre-wrap; opacity:.9; } .route-card-value { display:inline-block; box-sizing:border-box; max-width:100%; margin:2px 0 0 6px; padding:1px 5px; border:1px solid var(--vscode-focusBorder,#3794ff); border-radius:3px; background:var(--vscode-editor-selectionBackground,#264f78); color:var(--vscode-editor-foreground,#ddd); vertical-align:baseline; white-space:pre-wrap; }
.route-card-status { font-size:11px; color:var(--vscode-editorWarning-foreground,#cca700); }
.route-card button,.route-card-toolbar button { cursor:pointer; padding:2px 5px; border:1px solid var(--vscode-button-border,transparent); background:var(--vscode-button-secondaryBackground,#333); color:var(--vscode-button-secondaryForeground,#eee); border-radius:3px; }
.route-card-toolbar button[aria-pressed=true] { background:var(--vscode-button-background,#0e639c);color:var(--vscode-button-foreground,#fff); }
.route-card button.route-card-edit { position:absolute; top:4px;right:3px; background:transparent; padding:3px;display:flex; }
.route-description-toggle { display:block; margin-top:4px; font-size:10px; } .route-description-toggle[aria-expanded=false]::before { content:'▸ '; } .route-description-toggle[aria-expanded=true]::before { content:'▾ '; }
.route-questionnaire .route-card { padding:5px 28px 5px 8px; }
.route-questionnaire { box-sizing:border-box; width:480px; border:1px solid var(--vscode-focusBorder,#3794ff); border-radius:4px; padding:4px; background:transparent; }
.route-card-note { flex-basis:100%; color:var(--vscode-editorWarning-foreground,#cca700); }
.route-card label { display:block; margin:6px 0; } .route-card textarea { display:block;box-sizing:border-box; width:100%; min-height:64px; resize:none; background:var(--vscode-input-background,#303030); color:var(--vscode-input-foreground,#ddd); }
.route-question-badge { pointer-events:none; } .route-question-badge rect {fill:var(--vscode-editorWidget-background,#252526);stroke:var(--vscode-focusBorder,#3794ff);stroke-width:1;} .route-question-badge text {fill:var(--vscode-foreground,#ddd);font:11px sans-serif;}
`;
