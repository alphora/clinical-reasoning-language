/// <reference lib="dom" />
/** Serialized into the webview; data comes from the generation-checked host message. */
export function paintFlagBadges(doc: Document, message: any): void {
  for (const id of message.flaggableGids ?? []) {
    const row=doc.getElementById(id); if(!row)continue;
    row.classList.remove('has-flag');
    const badge=row.querySelector<SVGGElement>('.flow-flag-badge');if(!badge)continue;
    badge.dataset.flagState='none';
    const authoring=badge.querySelector<SVGGElement>('.flow-flag-authoring');if(authoring){
      authoring.dataset.flagState='none';authoring.setAttribute('aria-label','Review KE flags');
      const title=authoring.querySelector('title');if(title)title.textContent='Review KE flags';
    }
    badge.querySelector('.flow-flag-glyph')!.textContent='⚑';
    const label=badge.classList.contains('flow-flag-create')?'Add flag':'No MV flags';
    (badge.querySelector('.flow-flag-control')??badge).setAttribute('aria-label',label);badge.querySelector('title')!.textContent=label;
  }
  for (const summary of message.summaries ?? []) {
    const row=doc.getElementById(summary.gid);if(!row)continue;
    row.classList.add('has-flag');
    const badge=row.querySelector<SVGGElement>('.flow-flag-badge');if(!badge)continue;
    const open=summary.open-summary.authoringOpen,resolved=summary.resolved-summary.authoringResolved;
    badge.dataset.flagState=open>0?'open':resolved>0?'resolved':'none';
    badge.querySelector('.flow-flag-glyph')!.textContent='⚑';
    const authoring=badge.querySelector<SVGGElement>('.flow-flag-authoring');
    if(authoring){
      authoring.dataset.flagState=summary.authoringOpen>0?'open':summary.authoringResolved>0?'resolved':'none';
      const label=`KE flags: ${summary.authoringOpen} open, ${summary.authoringResolved} resolved — click to review`;
      authoring.setAttribute('aria-label',label);
      const title=authoring.querySelector('title');if(title)title.textContent=label;
    }
    const label=open+resolved>0?`MV flags: ${open} open, ${resolved} resolved — click to review`:badge.classList.contains('flow-flag-create')?'Add flag':'No MV flags';
    (badge.querySelector('.flow-flag-control')??badge).setAttribute('aria-label',label);badge.querySelector('title')!.textContent=label;
  }
  const start=message.startNodeGid?doc.getElementById(message.startNodeGid):null;
  if(!start)return;
  const badge=start.querySelector<SVGGElement>('.flow-startflag-badge');if(!badge)return;
  const text=badge.querySelector('.flow-startflag-text');
  let label=message.flagError?'⚠':message.open>0?'⚑ '+message.open:message.resolved>0?'✓':'';
  if(message.unplaced>0)label+=' · '+message.unplaced+'⚠';
  badge.dataset.flagState=message.flagError||message.open>0?'open':'resolved';
  const title=`Flags: ${message.open} open, ${message.resolved} resolved`+
    (message.unplaced>0?`; ${message.unplaced} open flag(s) could not be placed (target moved/removed)`:'')+
    (message.flagError?'; flag state could not be fully read':'')+' — click to review';
  badge.querySelector('title')!.textContent=title;badge.setAttribute('aria-label',title);
  if(text)text.textContent=label;start.classList.toggle('has-startflag',label!=='');
}
