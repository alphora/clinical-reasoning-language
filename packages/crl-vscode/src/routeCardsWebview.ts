/// <reference lib="dom" />
import { VERDICT_ICON_STYLE } from './branchVerdict';
// REFACTOR:grounded: operator mockups govern below-node question geometry and a compact detached questionnaire; data remains one pinned snapshot.
// Kept self-contained so the exact browser controller can be exercised in DOM tests.
export function installRouteCards(root: HTMLElement, api: { postMessage(m: unknown): void }, generation: () => number, onLayout: () => void = () => {}, standalone = false) {
  let snapshot: any, external = false, layer: SVGGElement | undefined, originalBox: string | null = null;
  let questionsVisible = true;
  let verdictFocusToken: string | undefined;
  let nextQuestionnaireFocus = 0;
  let questionnaireFocus: {id: string; token: string; schedule(): void} | undefined;
  let cancelQuestionnaireFocus = () => {};
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
  const paintVerdict = () => {
    const badge=root.querySelector<SVGGElement>('.route-verdict-badge');if(!badge)return;
    const verdict=snapshot?.verdict ?? {state:'unreviewed',label:'To do',count:0};
    badge.dataset.verdict=verdict.state;
    const title=`Verdict: ${verdict.label} — set all ${verdict.count} cases reaching this result`;
    badge.setAttribute('aria-label',title);badge.querySelector('title')!.textContent=title;
  };
  function requestQuestionnaire() {
    cancelQuestionnaireFocus();
    const captured=snapshot,expectedGen=generation(),doc=root.ownerDocument,win=doc.defaultView!;
    let timer: number;
    const cancel=()=>{
      win.clearTimeout(timer);win.removeEventListener('resize',resize);
      for(const type of ['pointerdown','keydown','wheel'])doc.removeEventListener(type,cancel,true);
      if(questionnaireFocus===request)questionnaireFocus=undefined;
    };
    const finish=()=>{
      const current=questionnaireFocus===request;cancel();
      if(!current || snapshot!==captured || generation()!==expectedGen || !doc.hasFocus())return;
      const owner=root.querySelector<SVGGElement>('.flow-pinned'),active=doc.activeElement;
      if(owner && (!active || active===doc.body || active===doc.documentElement || active===owner || active.classList.contains('route-layout-toggle'))){
        set(owner,'tabindex','-1');owner.focus({preventScroll:true});owner.scrollIntoView({block:'nearest',inline:'nearest'});
      }
    };
    let acknowledged=false;
    const schedule=()=>{acknowledged=true;win.clearTimeout(timer);timer=win.setTimeout(finish,150);};
    const resize=()=>{if(acknowledged)schedule();};
    const request={id:String(++nextQuestionnaireFocus),token:captured.token,schedule};
    questionnaireFocus=request;cancelQuestionnaireFocus=cancel;
    win.addEventListener('resize',resize);
    for(const type of ['pointerdown','keydown','wheel'])doc.addEventListener(type,cancel,true);
    api.postMessage({type:'toggleBranchQuestionnaire',gen:generation(),token:captured.token,requestId:request.id});
  }
  // Measure in SVG user units so label fitting is independent of canvas zoom.
  function fitLabel(node: SVGGElement, box: { x: number; y: number; height: number }, width: number) {
    const label = node.querySelector<SVGTextElement>(":scope > text[data-flow-label]");
    if (!label) return;
    const centered = label.getAttribute("text-anchor") === "middle";
    const x = Number(label.getAttribute("x"));
    const available = centered ? width - 80 : width - (x - box.x) - 24;
    if (available <= 0) return;
    const original = Array.from(label.childNodes);
    const probe = svgEl("tspan", {}) as SVGTSpanElement;
    label.replaceChildren(probe);
    const measure = (text: string) => { probe.textContent = text; return probe.getComputedTextLength(); };
    const full = label.dataset.flowLabel!.trim();
    if (full && measure(full) <= 0) { label.replaceChildren(...original); return; }
    restore.push(() => label.replaceChildren(...original));
    const prefix = (text: string, suffix = "") => {
      const chars = Array.from(text); let lo = 0, hi = chars.length;
      while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (measure(chars.slice(0, mid).join("") + suffix) <= available) lo = mid; else hi = mid - 1; }
      return chars.slice(0, lo).join("");
    };
    let lines = [full];
    if (measure(full) > available) {
      let first = prefix(full); const space = first.lastIndexOf(" ");
      if (space > 0) first = first.slice(0, space);
      const rest = full.slice(first.length).trimStart();
      lines = [first, measure(rest) <= available ? rest : prefix(rest, "…").trimEnd() + "…"];
    }
    label.replaceChildren(...lines.map((line, i) => {
      const span = svgEl("tspan", { x, y: box.y + box.height / 2 + (lines.length === 1 ? 4 : i === 0 ? -4 : 11) });
      span.textContent = line; return span;
    }));
  }
  function rerenderAtControl(control: HTMLElement, cardId: string, ownerKey: string, selector: string) {
    const before = control.getBoundingClientRect();
    render();
    const form = Array.from(root.querySelectorAll<HTMLElement>('.route-card')).find(n => n.dataset.cardId === cardId && n.dataset.ownerKey === ownerKey);
    const replacement = form?.querySelector<HTMLElement>(selector);
    if (!replacement) return;
    replacement.focus({ preventScroll: true });
    const after = replacement.getBoundingClientRect();
    const scroller = root.ownerDocument.scrollingElement ?? root.ownerDocument.documentElement;
    scroller.scrollLeft += after.left - before.left;
    scroller.scrollTop += after.top - before.top;
  }
  function clear() {
    if (standalone) root.replaceChildren();
    for (const undo of restore.reverse()) undo(); restore = [];
    layer?.remove(); layer = undefined; toolbar?.remove(); toolbar = undefined;
    const svg = root.querySelector<SVGSVGElement>(".flow-svg");
    if (svg && originalBox) { svg.setAttribute("viewBox", originalBox); const b = originalBox.split(" ").map(Number); svg.setAttribute("width", String(b[2])); svg.setAttribute("height", String(b[3])); }
    originalBox = null;
  }
  function sendDraft(card: any) {
    api.postMessage({type:'routeCardDraft',gen:generation(),token:snapshot.token,key:card.id,fields:{editing:!!card.editing,editingOwner:card.editingOwner??null,draftText:card.draftText??null,draftDescription:card.draftDescription??null}});
  }
  function cardForm(card: any, index: number, ownerKey: string, cardWidth: number): HTMLDivElement {
      const form = document.createElement("div"); form.className = "route-card"; form.dataset.cardId = card.id; form.dataset.ownerKey = ownerKey; form.style.width = standalone ? "100%" : cardWidth + "px";
      const caption = document.createElement("div"); caption.className = "route-card-caption"; caption.textContent = (!standalone ? "Q" : "") + String(index + 1); form.append(caption);
      const text = document.createElement("div"); text.className = "route-card-question"; text.textContent = card.text; form.append(text);
      if (card.description) {
        const toggle=document.createElement("button"); toggle.className="route-description-toggle"; toggle.textContent="Description"; toggle.setAttribute("aria-expanded", String(!!card.descriptionOpen));
        toggle.onclick=()=>{card.descriptionOpen=!card.descriptionOpen;rerenderAtControl(toggle,card.id,ownerKey,'.route-description-toggle');}; form.append(toggle);
        if (card.descriptionOpen) { const desc=document.createElement("div");desc.className="route-card-description";desc.textContent=card.description;form.append(desc); }
      }
      const value = document.createElement("div"); value.className = "route-card-value"; value.textContent = card.value; value.setAttribute("aria-label", "Answer: " + card.value); form.insertBefore(value, form.querySelector(".route-description-toggle"));
      if(card.answerChoices?.length || card.choicesFrom){
        const toggle=document.createElement("button");toggle.className="route-choices-toggle";toggle.textContent="Answer choices"+(card.answerChoices?.length ? " ("+card.answerChoices.length+")" : "");toggle.setAttribute("aria-expanded",String(!!card.choicesOpen));
        toggle.onclick=()=>{card.choicesOpen=!card.choicesOpen;rerenderAtControl(toggle,card.id,ownerKey,'.route-choices-toggle');};form.append(toggle);
        if(card.choicesOpen){
          const list=document.createElement("ul");list.className="route-answer-choices";
          for(const choice of card.answerChoices ?? []){const row=document.createElement("li");row.textContent=choice.display;if(choice.selected){row.className="is-selected";const mark=document.createElement("span");mark.className="route-choice-selected";mark.textContent="Selected";row.append(mark);}list.append(row);}
          if(!card.answerChoices?.length){const row=document.createElement("li");row.textContent="Choices from "+card.choicesFrom;list.append(row);}
          form.append(list);
        }
      }
      const status = document.createElement("div"); status.className = "route-card-status"; status.setAttribute("role", "status"); status.textContent = card.proposal ? "Saved for KE review" : ""; form.append(status);
      if (card.readOnlyReason) { const reason = document.createElement("p"); reason.textContent = card.readOnlyReason; form.append(reason); }
      if (card.editable) {
        const edit = document.createElement("button"); edit.className="route-card-edit"; edit.title="Edit question"; edit.setAttribute("aria-label","Edit question");
        const pencil = svgEl("svg",{viewBox:"0 0 24 24",width:14,height:14,"aria-hidden":"true"});
        pencil.append(svgEl("path",{d:"M4 16 L16 4 L20 8 L8 20 L4 20 Z M13 7 L17 11",fill:"none",stroke:"currentColor","stroke-width":1.7})); edit.append(pencil);form.append(edit);
        const editor = document.createElement("div"); editor.className="route-card-editor"; editor.hidden = true;
        const scope = document.createElement("p"); scope.textContent = "Edit Question:"; editor.append(scope);
        const input = document.createElement("textarea"), desc = document.createElement("textarea");
        input.setAttribute("aria-label", "Question text"); desc.setAttribute("aria-label", "Question description");
        input.value = card.draftText ?? card.text; desc.value = card.draftDescription ?? card.description;
        input.oninput = () => { card.draftText = input.value; sendDraft(card); }; desc.oninput = () => { card.draftDescription = desc.value; sendDraft(card); };
        const questionLabel=document.createElement("label"); questionLabel.textContent="Question"; questionLabel.append(input);
        const descriptionLabel=document.createElement("label"); descriptionLabel.textContent="Description"; descriptionLabel.append(desc); editor.append(questionLabel,descriptionLabel);
        const save = document.createElement("button"); save.textContent = "Save change";
        save.onclick = () => { save.disabled = true; status.textContent = "Saving…"; api.postMessage({ type: "routeCardProposal", gen: generation(), token: snapshot.token, key: card.id, fields: { questionText: card.draftText ?? card.text, questionDescription: card.draftDescription ?? card.description } }); };
        const cancel = document.createElement("button"); cancel.textContent = "Cancel"; cancel.onclick = () => { card.editing = false; delete card.draftText; delete card.draftDescription; sendDraft(card); render(); };
        editor.append(save, cancel); form.append(editor);
        edit.onclick = () => { card.editing = true; card.editingOwner=standalone?undefined:ownerKey; sendDraft(card); render(); root.querySelector<HTMLTextAreaElement>('[data-card-id="'+card.id+'"] .route-card-editor:not([hidden]) textarea')?.focus(); };
        editor.hidden = !card.editing || (!standalone && card.editingOwner!==ownerKey);
      }
      form.addEventListener("click", e => e.stopPropagation()); form.addEventListener("keydown", e => e.stopPropagation());
    return form;
  }
  function render() {
    clear();
    if (!snapshot) return;
    if (standalone) {
      const heading=document.createElement('p');heading.className='route-branch-label';heading.textContent=snapshot.label;root.append(heading);
      if(snapshot.note){const note=document.createElement('p');note.className='route-card-note';note.setAttribute('role','status');note.textContent=snapshot.note;root.append(note);}
      const panel=document.createElement('div');panel.className='route-questionnaire';root.append(panel);
      for(const [index,card] of snapshot.cards.entries())panel.append(cardForm(card,index,card.ownerKey,480));
      return;
    }
    const svg = root.querySelector<SVGSVGElement>(".flow-svg");
    if (!svg) return;
    originalBox = svg.getAttribute("viewBox");
    toolbar = document.createElement("div");toolbar.className="route-card-toolbar";
    const visibility=document.createElement("button");visibility.className="route-questions-toggle";visibility.textContent="Questions";visibility.title=questionsVisible?"Hide questions":"Show questions";visibility.setAttribute("aria-pressed",String(questionsVisible));
    visibility.onclick=()=>{questionsVisible=!questionsVisible;render();root.querySelector<HTMLButtonElement>('.route-questions-toggle')?.focus();};toolbar.append(visibility);
    if(snapshot.note){const note=document.createElement("span");note.className="route-card-note";note.setAttribute("role","status");note.textContent=snapshot.note;toolbar.append(note);}
    root.prepend(toolbar);
    layer = svgEl("g", { class: "route-cards" }) as SVGGElement; svg.append(layer);
    const nodes = Array.from(root.querySelectorAll<SVGGElement>("[data-flow-key]"));
    const byKey = new Map(nodes.map(n => [n.dataset.flowKey!, n]));
    const hide = (el: Element) => set(el,"display","none");
    // Questions on: choices live in cards. Questions off: preserve their dotted tree disclosure.
    // INPUT is a display-only grouping; preserve its actual dependency edge.
    const elided = new Set(nodes.filter(n=>n.dataset.flowDecoration === "input" || (questionsVisible && n.dataset.flowDecoration === "choices")));
    for(const n of elided)hide(n);
    if(questionsVisible)for(const toggle of Array.from(root.querySelectorAll('[data-flow-choices-toggle]')))hide(toggle);
    for(const option of nodes.filter(n=>n.dataset.flowChoice)) {
      const choice=JSON.parse(option.dataset.flowChoice!);
      const card=snapshot.cards.find((c:any)=>JSON.stringify([c.library,c.concept])===option.dataset.flowChoiceFor && c.ownerKey===option.dataset.flowWhen);
      if(card?.answerChoices?.some((c:any)=>c.selected && c.code===choice.code && c.system===choice.system)) {
        const hadSelected=option.classList.contains('flow-choice-selected');option.classList.add('flow-choice-selected');restore.push(()=>{if(!hadSelected)option.classList.remove('flow-choice-selected');});set(option,'aria-label',(option.querySelector('title')?.textContent??'')+' — Selected answer');
      }
    }
    for(const edge of Array.from(root.querySelectorAll<SVGPathElement>('path[data-flow-from]'))){
      if(elided.has(byKey.get(edge.dataset.flowTo!)!)){hide(edge);continue;}
      let from=byKey.get(edge.dataset.flowFrom!);const seen=new Set<SVGGElement>();
      while(from&&elided.has(from)&&!seen.has(from)){seen.add(from);from=byKey.get(from.dataset.flowParent!);}
      if(from)set(edge,"data-flow-from",from.dataset.flowKey!);
    }
    const visible = nodes.filter(n => getComputedStyle(n).display !== "none");
    const base = new Map(visible.map(n => [n, n.querySelector<SVGRectElement>(":scope > rect")?.getBBox() ?? n.getBBox()]));
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
    const placements: { card: any; owner: SVGGElement; height: number; form?: HTMLDivElement; fo?: Element }[] = [];
    const nodeWidth = questionsVisible && !external ? 320 : 260;
    const cardWidth = nodeWidth;
    const hidden = new Map<SVGGElement, number[]>();
    // DOM textContent for every authored string; no authored HTML enters the canvas.
    for (const [index, card] of (questionsVisible || external ? snapshot.cards : []).entries()) {
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
      if (external) { placements.push({card:{...card,number:index+1},owner,height:0}); continue; }
      if(card.editing && !card.editingOwner)card.editingOwner=owner.dataset.flowKey;
      const form = cardForm(card,index,owner.dataset.flowKey!,cardWidth);
      const fo = svgEl("foreignObject", { width:cardWidth, height:20000 });
      fo.append(form); layer.append(fo);
      const height = Math.ceil(form.offsetHeight);
      placements.push({card: {...card, number:index+1}, owner, height, form, fo});
      }
    }
    // Align primary rows across columns; reserve each question below its own
    // body before laying out its children or the next sibling.
    const stackHeight = (n: SVGGElement) => placements.filter(p=>p.owner===n).reduce((h,p)=>h+p.height,0);
    const columns=[...new Set(primary.map(n=>base.get(n)!.x))].sort((a,b)=>a-b);
    const positions=new Map<SVGGElement,{x:number;y:number;width:number;height:number}>();
    const groups=columns.map(col=>primary.filter(n=>base.get(n)!.x===col).sort((a,b)=>base.get(a)!.y-base.get(b)!.y));
    const descendants=(n:SVGGElement)=>visible.filter(c=>c!==n&&primaryOwner(c)===n).sort((a,b)=>base.get(a)!.y-base.get(b)!.y);
    // REFACTOR:grounded: nested reusable components need distinct closing borders and sibling clearance.
    const componentsOf=(n:SVGGElement)=>{
      const result:SVGGElement[]=[],seen=new Set<SVGGElement>();let current:SVGGElement|undefined=n;
      while(current&&!seen.has(current)){seen.add(current);if(current.dataset.flowComponent==='expanded')result.push(current);current=byKey.get(current.dataset.flowParent!);}
      return result;
    };
    const widthFor = (n: SVGGElement) => n.classList.contains("flow-activity") || n.dataset.flowComponent === "collapsed" ? base.get(n)!.width : !n.dataset.flowOutline || n.dataset.flowQuestion ? nodeWidth : base.get(n)!.width;
    const widths=groups.map(group=>Math.max(nodeWidth,...group.flatMap(n=>descendants(n).map(c=>base.get(c)!.x-base.get(n)!.x+widthFor(c)+componentsOf(c).length*12))));
    let right=40+widths.reduce((a,b)=>a+b+90,0),bottom=40;
    let cursor=40;
    for(let row=0;row<Math.max(0,...groups.map(g=>g.length));row++) {
      const y=cursor; let rowBottom=y;
      for(const [ci,group] of groups.entries()) {
        const n=group[row];if(!n)continue;
        const box=base.get(n)!,x=40+widths.slice(0,ci).reduce((a,b)=>a+b+90,0);
        positions.set(n,{x,y,width:widthFor(n),height:box.height});
        let childCursor=y+box.height+(!external?stackHeight(n):0)+24;
        const children=descendants(n);
        for(const [index,child] of children.entries()) {
          const b=base.get(child)!,h=!external?stackHeight(child):0;
          positions.set(child,{x:x+b.x-box.x,y:childCursor,width:widthFor(child),height:b.height});
          childCursor+=b.height+h+18+(!questionsVisible && child.dataset.flowHasChoices ? 24 : 0);
          const next=children[index+1],nextComponents=next?componentsOf(next):[];
          childCursor+=componentsOf(child).filter(c=>!nextComponents.includes(c)).length*12;
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
        for(const adornment of Array.from(n.querySelectorAll(":scope > .flow-pin,:scope > .flow-false-stop,:scope > .flow-allpass-badge,:scope > .flow-crit-verdict,:scope > .flow-startflag-badge")))set(adornment,"transform",`translate(${pos.width-b.width} 0)`);
        if(n.dataset.flowComponent!=="expanded")for(const badge of Array.from(n.querySelectorAll(":scope > .flow-flag-badge")))set(badge,"transform",`translate(${pos.width-b.width} 0)`);
        fitLabel(n, { x:b.x, y:b.y, height:b.height }, pos.width);
      }
    }
    for(const edge of Array.from(root.querySelectorAll<SVGPathElement>("path[data-flow-from]"))) {
      const a=positions.get(byKey.get(edge.dataset.flowFrom!)!), b=positions.get(byKey.get(edge.dataset.flowTo!)!); if(!a||!b)continue;
      const x=a.x+a.width,y=a.y+a.height/2,ex=b.x,ey=b.y+b.height/2,m=(x+ex)/2;
      // Explanation lines use the left gutter so transparent questions below a
      // node never have a connector running through their text.
      set(edge,"d",edge.classList.contains("flow-def-edge") ? `M${a.x} ${y} H${Math.min(a.x,b.x)-12} V${ey} H${ex}` : `M${x} ${y} C${m} ${y} ${m} ${ey} ${ex} ${ey}`);
    }
    if(!external) {
      const used=new Map<SVGGElement,number>();
      for(const p of placements) {const box=positions.get(p.owner);if(!box)continue;
        const y=box.y+box.height+4+(used.get(p.owner)??0);used.set(p.owner,(used.get(p.owner)??0)+p.height);
        p.fo!.setAttribute("x",String(box.x));p.fo!.setAttribute("y",String(y));p.fo!.setAttribute("height",String(p.height));
      }
    }
    const badge=(owner:SVGGElement,label:string,title:string)=>{
      const box=positions.get(owner);if(!box)return;
      const g=svgEl("g",{class:"route-question-badge",role:"img","aria-label":title});const t=svgEl("title",{});t.textContent=title;g.append(t);
      const verdictSpace=owner.querySelector(':scope > .flow-crit-verdict')?24:0;
      const width=Math.max(24,label.length*7+12),x=box.x+box.width-width-3-verdictSpace,y=box.y-10;
      g.append(svgEl("rect",{x,y,width,height:19,rx:8}));const text=svgEl("text",{x:x+width/2,y:y+13,"text-anchor":"middle"});text.textContent=label;g.append(text);layer!.append(g);
    };
    for(const owner of new Set(external?placements.map(p=>p.owner):[])) {
      const questions=placements.filter(p=>p.owner===owner);
      const answers=[...new Set(questions.map(p=>"Q"+String(p.card.number)+(/^(Yes|No)$/.test(p.card.value)?" "+p.card.value:"")))];
      const complex=questions.some(p=>p.card.value && !/^(Yes|No|Not answered|Determination: (True|False|Unknown))$/.test(p.card.value));
      badge(owner,answers.join(", ")+(complex?' …':''),(complex?'See questionnaire for the full answer. ':'')+questions.map(p=>`Question ${p.card.number}: ${p.card.value}`).join(", "));
    }
    for(const [owner,numbers] of hidden)badge(owner,"? "+numbers.length,"Hidden questions: "+numbers.map(n=>"Q"+n).join(", ")+". Expand this condition to show them.");
    const pinned = root.querySelector<SVGGElement>(".flow-pinned") ?? byKey.get(snapshot.pinKey);
    const pinBox = pinned && positions.get(pinned);
    if (pinBox) {
      const cx=pinBox.x+pinBox.width-22,cy=pinBox.y+10;
      const verdict=svgEl('g',{class:'route-verdict-badge review-verdict-icon',role:'button',tabindex:0});
      verdict.append(svgEl('title',{}),svgEl('circle',{cx,cy,r:8}),svgEl('path',{d:`M${cx-4} ${cy} l2.6 2.9 l5 -5.6`}));
      verdict.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();verdictFocusToken=snapshot.token;if(pinned){set(pinned,'tabindex','-1');pinned.focus({preventScroll:true});}api.postMessage({type:'routeVerdictMenu',gen:generation(),token:snapshot.token});});
      layer!.append(verdict);paintVerdict();
      const navigation=snapshot.navigation;
      const count=navigation?.current>0 && navigation.current<=navigation.total ? `${navigation.current} of ${navigation.total}` : '';
      const navCenter=pinBox.x+pinBox.width/2+(count?count.length*6+8:0)/2;
      if(count){const progress=svgEl('text',{class:'route-leaf-nav-count',x:navCenter-64,y:pinBox.y-15,'text-anchor':'end','aria-label':`Result ${navigation.current} of ${navigation.total}`});progress.textContent=count;layer!.append(progress);}
      const navLabel=svgEl('text',{class:'route-leaf-nav-label',x:navCenter,y:pinBox.y-15,'text-anchor':'middle'});navLabel.textContent='Next';layer!.append(navLabel);
      for (const [direction,enabled,offset] of [['previous',snapshot.navigation?.previous,-56],['next',snapshot.navigation?.next,32]] as const) {
        const x=navCenter+offset,y=pinBox.y-30;
        const button=svgEl('g',{class:'route-branch-nav',role:'button',tabindex:enabled?0:-1,'aria-label':direction==='previous'?'Previous result':'Next result','aria-disabled':String(!enabled)});
        button.append(svgEl('rect',{x,y,width:24,height:22,rx:4}));
        const title=svgEl('title',{});title.textContent=direction==='previous'?'Previous result — first route':'Next result — first route';button.append(title);
        button.append(svgEl('path',{d:direction==='previous'?`M${x+15} ${y+5} l-6 6 l6 6`:`M${x+9} ${y+5} l6 6 l-6 6`}));
        const go=()=>{if(enabled)api.postMessage({type:'navigatePinnedBranch',gen:generation(),token:snapshot.token,dir:direction});};
        button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();go();});
        button.addEventListener('keydown',e=>{const k=e as KeyboardEvent;if(!k.altKey&&!k.ctrlKey&&!k.metaKey&&!k.shiftKey&&(k.key==='Enter'||k.key===' ')){e.preventDefault();e.stopPropagation();go();}});
        layer!.append(button);
      }
      const x=pinBox.x+pinBox.width+6,y=pinBox.y+10;
      const label=external?"Close Result Questionnaire":"Open Result Questionnaire";
      const toggle=svgEl("g",{class:"route-layout-toggle",role:"button",tabindex:0,"aria-label":label,"aria-pressed":String(external)});
      const title=svgEl("title",{});title.textContent=label;toggle.append(title);
      toggle.append(svgEl("rect",{x,y,width:22,height:22,rx:4}));
      const drawing=!external?"M5 6 H7 M10 6 H17 M5 11 H7 M10 11 H17 M5 16 H7 M10 16 H17":"M5 4 H17 V10 H5 Z M5 14 H17 M5 18 H14";
      toggle.append(svgEl("path",{d:drawing,transform:`translate(${x} ${y})`}));
      const change=()=>requestQuestionnaire();
      toggle.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();change();});
      toggle.addEventListener("keydown",e=>{const k=e as KeyboardEvent;if(k.shiftKey||k.ctrlKey||k.altKey||k.metaKey)return;if(k.key==="Enter"||k.key===" "){e.preventDefault();e.stopPropagation();change();}});
      layer!.append(toggle);right=Math.max(right,x+22+20);bottom=Math.max(bottom,y+22+20);
    }
    svg.setAttribute("viewBox",`0 0 ${right} ${bottom}`);svg.setAttribute("width",String(right));svg.setAttribute("height",String(bottom));
    onLayout();
  }
  return {
    show(value: any) { if(value.showQuestions && snapshot?.token !== value.token) questionsVisible = true; if (snapshot?.token === value.token) for (const card of value.cards) {
      const previous = snapshot.cards.find((c: any) => c.id === card.id);
      if(previous)Object.assign(card,{descriptionOpen:previous.descriptionOpen,choicesOpen:previous.choicesOpen});
      if (previous && !value.authoritativeDrafts) Object.assign(card, { editing: previous.editing, editingOwner: previous.editingOwner, draftText: previous.draftText, draftDescription: previous.draftDescription, proposal: previous.proposal, descriptionOpen: previous.descriptionOpen, choicesOpen: previous.choicesOpen });
    } snapshot = value; render(); },
    token() { return snapshot?.token; },
    isExternal() { return external; },
    reset() { cancelQuestionnaireFocus();snapshot = undefined; external = false; clear(); },
    questionnaireState(open: boolean, focusToken?: string, requestId?: string) {
      if(external!==open){external=open;render();}
      // State synchronization alone never takes focus. A particular click owns
      // the one pan, cancelled by user interaction even before the host replies.
      if(focusToken===snapshot?.token && questionnaireFocus?.id===requestId && questionnaireFocus?.token===focusToken)questionnaireFocus?.schedule();
    },
    verdict(message: any) { if(!snapshot || message.token!==snapshot.token)return;snapshot.verdict=message.verdict;paintVerdict(); },
    verdictFocus(message: any) {
      const captured=snapshot;
      if(!captured || message.token!==captured.token || verdictFocusToken!==message.token)return;
      root.ownerDocument.defaultView!.requestAnimationFrame(()=>{
        if(snapshot!==captured || verdictFocusToken!==message.token)return;
        verdictFocusToken=undefined;
        const owner=root.querySelector<SVGGElement>('.flow-pinned');
        const doc=root.ownerDocument,active=doc.activeElement;
        if(owner && (!active || active===doc.body || active===doc.documentElement || active===owner)){
          set(owner,'tabindex','-1');owner.focus({preventScroll:true});
        }
      });
    },
    draft(message: any) { if (!snapshot || snapshot.token!==message.token) return; const card=snapshot.cards.find((c:any)=>c.id===message.key);if(!card)return;for(const key of ['editing','editingOwner','draftText','draftDescription']){const value=message.fields[key];if(value===null)delete card[key];else card[key]=value;} },
    rebind() { restore = []; originalBox = null; layer = undefined; toolbar?.remove(); render(); },
    result(message: any) { if (!snapshot || message.token !== snapshot.token) return; const card = snapshot.cards.find((c: any) => c.id === message.key); if (!card) return;
      card.proposal = message.ok; if (message.ok) card.editing = false; render();
      const status = root.querySelector<HTMLElement>('[data-card-id="'+card.id+'"] .route-card-status'); if (status) status.textContent = message.message; },
  };
}

export const ROUTE_CARD_STYLE = `
${VERDICT_ICON_STYLE}
.route-card{user-select:text}
.flow-row.flow-pinned.leaf-allpass>.flow-allpass-badge{display:none}
.route-card { position:relative; box-sizing:border-box; padding:5px 25px 5px 2px; border:0; border-radius:3px; background:rgba(180,180,180,.15); color:var(--vscode-editor-foreground,#ddd); font:12px/1.35 var(--vscode-font-family,sans-serif); overflow-wrap:anywhere; }
.route-card-caption { display:inline-block; vertical-align:baseline; margin:0 6px 0 0; padding:0 4px; font-size:10px; line-height:1.1; border:1px solid var(--vscode-panel-border,#555); border-radius:3px; background:var(--vscode-button-secondaryBackground,#333); color:var(--vscode-descriptionForeground,#aaa); }
.route-card-question { display:inline; font-weight:600; white-space:pre-wrap; }
.route-card .route-choices-toggle {display:block;margin-top:5px;} .route-answer-choices {margin:6px 0 0;padding-left:16px;white-space:pre-wrap;} .route-answer-choices li {margin:5px 0;} .route-choice-selected {display:inline-block;margin-left:6px;font-size:10px;font-weight:600;color:var(--vscode-textLink-foreground,#75beff);}
.route-card-description { margin:5px 0; white-space:pre-wrap; opacity:.9; } .route-card-value { display:inline-block; box-sizing:border-box; max-width:100%; margin:2px 0 0 6px; padding:1px 5px; border:1px solid var(--vscode-focusBorder,#3794ff); border-radius:3px; background:var(--vscode-editor-selectionBackground,#264f78); color:var(--vscode-editor-foreground,#ddd); vertical-align:baseline; white-space:pre-wrap; }
.route-card-status { font-size:11px; color:var(--vscode-editorWarning-foreground,#cca700); }
.route-card button { cursor:pointer; padding:2px 5px; border:1px solid var(--vscode-button-border,transparent); background:var(--vscode-button-secondaryBackground,#333); color:var(--vscode-button-secondaryForeground,#eee); border-radius:3px; }
.route-card button.route-card-edit { position:absolute; top:4px;right:3px; background:transparent; padding:3px;display:flex; }
.route-description-toggle { display:block; margin-top:4px; font-size:10px; } .route-description-toggle[aria-expanded=false]::before { content:'▸ '; } .route-description-toggle[aria-expanded=true]::before { content:'▾ '; }
.route-questionnaire .route-card { padding:5px 28px 5px 8px; }
.route-questionnaire { box-sizing:border-box; width:480px; border:3px solid var(--vscode-focusBorder,#3794ff); border-radius:6px; padding:8px; background:transparent; }
.route-questionnaire .route-card + .route-card { margin-top:8px; }
.route-card-note { flex-basis:100%; color:var(--vscode-editorWarning-foreground,#cca700); }
.route-card-toolbar {display:flex;align-items:center;gap:8px;margin:6px 0;} .route-questions-toggle {cursor:pointer;background:var(--vscode-button-secondaryBackground,#333);color:var(--vscode-button-secondaryForeground,#eee);border:1px solid transparent;border-radius:3px;padding:3px 7px;} .route-questions-toggle[aria-pressed=true] {border-color:var(--vscode-focusBorder,#3794ff);}
.route-card label { display:block; margin:6px 0; } .route-card textarea { display:block;box-sizing:border-box; width:100%; min-height:64px; resize:none; background:var(--vscode-input-background,#303030); color:var(--vscode-input-foreground,#ddd); }
.route-leaf-nav-label,.route-leaf-nav-count{fill:var(--vscode-foreground,#ddd);font:12px var(--vscode-font-family,sans-serif);pointer-events:none}.route-branch-nav{cursor:pointer}.route-branch-nav[aria-disabled=true]{opacity:.3;cursor:default}.route-branch-nav rect{fill:var(--vscode-editorWidget-background,#252526);stroke:var(--vscode-descriptionForeground,#8c8c8c)}.route-branch-nav path{fill:none;stroke:var(--vscode-foreground,#ddd);stroke-width:2}.route-branch-nav:focus-visible{outline:1px solid var(--vscode-focusBorder,#3794ff)}.route-layout-toggle {cursor:pointer;} .route-layout-toggle rect {fill:var(--vscode-editorWidget-background,#252526);stroke:var(--vscode-descriptionForeground,#8c8c8c);} .route-layout-toggle path {fill:none;stroke:var(--vscode-foreground,#ddd);stroke-width:1.5;pointer-events:none;} .route-layout-toggle[aria-pressed=true] rect {stroke:var(--vscode-focusBorder,#3794ff);stroke-width:2;}
.route-question-badge { pointer-events:none; } .route-question-badge rect {fill:var(--vscode-editorWidget-background,#252526);stroke:var(--vscode-focusBorder,#3794ff);stroke-width:1;} .route-question-badge text {fill:var(--vscode-foreground,#ddd);font:11px sans-serif;}
`;

export const ROUTE_POINTER_STYLE = `
.flow-pointer-interaction .flow-crit-toggle:focus,.flow-pointer-interaction .route-layout-toggle:focus {outline:none;}

`;
