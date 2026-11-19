import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {basename,dirname,relative,isAbsolute,sep} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import vm from 'node:vm';
import ts from 'typescript';
import {transformSync} from 'esbuild';
import {reviewCasesForRoute,interactiveQuestionWordingMatches,questionReviewOwners} from './interactiveReview.ts';
import {resolveSourceWordingTarget} from './presentationProposal.ts';
import {setAllReviewState} from './medicalValidationStore.ts';
import {overlayQaRequests,questionFlagTarget} from './qaFlagEditing.ts';
import {buildQaEditFlag,emitCrlBundle} from '@smile-digital-health/crl';
import {fileURLToPath} from 'node:url';
const file=readFileSync(new URL('./correspondenceCockpit.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('host.ts',file,ts.ScriptTarget.Latest,true);
const root=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='registerCorrespondenceCockpit');
const names=['interactiveContextCurrent','interactiveRoutes','interactiveVerdict','interactiveWordingTarget','interactiveQuestionAction','refreshInteractiveQuestionRequest','saveInteractiveQuestion','invalidateInteractiveEdit'];
const code=names.map(name=>root.body.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(ast)).join('\n');
function fixture(){
 const writes=[],paints=[],actions=[],payloads=[];let pick={state:'pass'},failPersist=false,allow=true;
 const route={nodeKeys:['root','terminal'],terminalKind:'produced'};
 const context={cel:'E:/fixture/src/cel/mv/policy.cel',prepared:{planId:'root',definitionOrigins:[]},result:{activities:['Met'],questionnaire:{item:[{linkId:'q',type:'boolean',text:'Question'}]},nativeResult:{}},current:()=>allow,outcomeCurrent:()=>allow};
 const target={view:{gen:2,focusNodes:{key:{owner:'owner'}},criterionOccurrences:[],reveals:{reveal:{nodeKey:'key'}}},session:undefined,key:'key',gid:'gid'};
 const wording={filePath:'E:/fixture/src/crl/policy.crl',library:'L',concept:'A',baseline:'source',questionText:'Question',questionDescription:'Description',owners:{questionText:{contexts:[]}},scopeLabel:'Default'};
 const c=vm.createContext({basename,dirname,relative,isAbsolute,sep,isDeepStrictEqual,randomUUID:()=>String(payloads.length+1),
  cockpitDisposed:false,indexVersion:1,mvRevision:1,mvSidecarPath:'sidecar',mode:'medical-validation',currentCel:context.cel,
  reviewByCaseId:{},notesByCaseId:{},crlStructure:[{nodeKey:'root',lib:'L',decision:'D',children:[{nodeKey:'owner',children:[]}]}],
  interactiveRouteCache:undefined,nativeReviewRoutes:()=>[{keys:route.nodeKeys}],reviewCasesForRoute,tableEntries:()=>c.entries,entries:[{caseId:'one',route},{caseId:'other',route:{nodeKeys:['different'],terminalKind:'produced'}}],
  pinnedVerdict:()=>({state:'unreviewed',label:'To do'}),REVIEW_ORDER:['unreviewed','pass','fail','pending'],REVIEW_LABEL:{unreviewed:'To do',pass:'Pass',fail:'Fail',pending:'Pending'},
  setAllReviewState,persistMv:map=>{if(failPersist)return false;writes.push(map);return true;},renderPane:p=>paints.push(p),renderTreeChrome:()=>paints.push('chrome'),driveDoneOverlay:()=>paints.push('tree'),cockpitAgentBridge:{notifyChanged:()=>{}},
  interactiveQuestionWordingMatches,questionReviewOwners:()=>new Map([['q',{library:'L',concept:'A'}]]),interactiveQuestionTarget:async()=>target,
  focusBranchSession:s=>actions.push(['row',s]),pinnedCards:undefined,focusTreeNode:key=>actions.push(['focus',key]),postBranch:(s,m)=>actions.push(['post',m]),views:new Map([['tree',{panel:{reveal:()=>actions.push(['reveal'])},gen:2}]]),
  isSubQuestionHit:()=>false,nodeFlagAction:async(...args)=>actions.push(['flag',...args]),wordingSources:new Map([['L',{filePath:wording.filePath,source:'source',packaged:false}]]),
  resolveSourceWordingTarget:()=>wording,findPolicySrc:()=> 'E:/fixture/src',vscode:{window:{showQuickPick:()=>pick,showWarningMessage:()=> 'Discard',setStatusBarMessage:message=>actions.push(['statusBar',message])},workspace:{textDocuments:[]}},assertMvWriteAllowed:()=>{if(!allow)throw Error('Not allowed');},
  interactiveEdit:undefined,interactiveEditPanel:{open:p=>payloads.push(p),update:p=>payloads.push(p),post:p=>payloads.push(p),layoutPanel:{reveal:()=>{}}},resolveCelSuite:()=>({ok:true,suite:{projectRoot:'E:/fixture'}}),flagStoreDir:()=> 'flags',saveQuestionRequest:(...args)=>{actions.push(['save',...args]);return {};},reloadReviewFlags:()=>{},driveFlagBadges:()=>{},overlayQaRequests,flagsList:[],changeQaRequest:(...args)=>actions.push(['status',...args]),
 });
 vm.runInContext(transformSync(code,{loader:'ts',target:'es2022'}).code,c);
 return{c,context,target,writes,paints,actions,payloads,pick:p=>pick=p,deny:()=>allow=false,failPersist:()=>failPersist=true};
}
it('actual cockpit verdict handler writes only the resolved route cases and paints after successful persistence',async()=>{
 const f=fixture();await f.c.interactiveVerdict(f.context,0);expect(f.writes).toEqual([{one:'pass'}]);expect(f.paints).toContain('tree');
 const failed=fixture();failed.failPersist();await failed.c.interactiveVerdict(failed.context,0);expect(failed.writes).toEqual([]);expect(failed.paints).toEqual([]);
});
it('actual cockpit verdict handler refuses changed coverage/review/form after the menu opens',async()=>{
 for(const change of [f=>f.c.indexVersion++,f=>f.c.mvRevision++,f=>f.deny(),f=>f.c.entries.push({caseId:'one',route:{nodeKeys:['other'],terminalKind:'paused'}})]){
  const f=fixture();let finish;f.pick(new Promise(resolve=>finish=resolve));const menu=f.c.interactiveVerdict(f.context,0);change(f);finish({state:'pass'});await expect(menu).rejects.toThrow();expect(f.writes).toEqual([]);expect(f.paints).toEqual([]);
 }
});
it('actual question handler routes focus to the chosen table row and flags to its exact reveal/gid',async()=>{
 const f=fixture();f.target.session={id:'row'};
 await f.c.interactiveQuestionAction(f.context,'focus','q');expect(f.actions[0]).toEqual(['row',f.target.session]);expect(f.actions.some(a=>a[0]==='post'&&a[1].type==='focusQuestionNode'&&a[1].key==='key')).toBe(true);
 await f.c.interactiveQuestionAction(f.context,'flag','q');expect(f.actions.at(-1)).toEqual(['flag','reveal','gid',2,'validation',f.target.session]);
});
it('actual pencil handler opens the existing editor expanded and saves an MV question request',async()=>{
 const f=fixture();await f.c.interactiveQuestionAction(f.context,'edit','q');const payload=f.payloads[0];expect(payload.cards[0].editing).toBe(true);expect(payload.cards[0].text).toBe('Question');
 await f.c.saveInteractiveQuestion({type:'routeCardSave',token:payload.token,key:payload.cards[0].id,fields:{questionText:'Updated',questionDescription:'More'}});
 expect(f.actions.find(a=>a[0]==='save').slice(-2)).toEqual(['Updated','More']);expect(f.payloads.at(-1).ok).toBe(true);
 expect(f.payloads.findLast(p=>p.cards)?.authoritativeDrafts).toBe(true);
});
it('opens pending requested wording and preserves it when saved unchanged or description-only edited',async()=>{
 for(const description of ['Requested description','Changed description']){
  const f=fixture(),target=f.c.resolveSourceWordingTarget(),identity=questionFlagTarget('E:/fixture',target);
  f.c.flagsList=[buildQaEditFlag({kind:'question-edit',target:identity,before:{text:'Question',description:'Description'},desired:{text:'Requested question',description:'Requested description'}})];
  await f.c.interactiveQuestionAction(f.context,'edit','q');const card=f.payloads[0].cards[0];expect(card.text).toBe('Requested question');expect(card.description).toBe('Requested description');expect(card.questionRequest.id).toBe(f.c.flagsList[0].id);
  await f.c.saveInteractiveQuestion({type:'routeCardSave',token:f.c.interactiveEdit.token,key:card.id,fields:{questionText:card.text,questionDescription:description}});
  expect(f.actions.find(a=>a[0]==='save').slice(-2)).toEqual(['Requested question',description]);
 }
});
it('rechecks dirty source on save and keeps the editor draft',async()=>{
 const f=fixture();await f.c.interactiveQuestionAction(f.context,'edit','q');const edit=f.c.interactiveEdit;
 await f.c.saveInteractiveQuestion({type:'routeCardDraft',token:edit.token,key:edit.card.id,fields:{draftText:'Unsaved draft'}});
 f.c.vscode.workspace.textDocuments.push({uri:{fsPath:edit.target.filePath},isDirty:true});
 await f.c.saveInteractiveQuestion({type:'routeCardSave',token:edit.token,key:edit.card.id,fields:{questionText:'Unsaved draft',questionDescription:'Description'}});
 expect(f.actions.some(a=>a[0]==='save')).toBe(false);expect(f.payloads.at(-1)).toMatchObject({ok:false,message:expect.stringMatching(/Save or revert/)});expect(edit.card.draftText).toBe('Unsaved draft');expect(edit.card.editing).toBe(true);
});
it('request status controls are bound to the captured request',async()=>{
 const f=fixture();await f.c.interactiveQuestionAction(f.context,'edit','q');const edit=f.c.interactiveEdit;edit.card.questionRequest={id:'request'};
 await f.c.saveInteractiveQuestion({type:'qaRequestAction',token:edit.token,key:edit.card.id,requestId:'wrong',value:'fixed'});expect(f.actions.some(a=>a[0]==='status')).toBe(false);
 edit.card.draftText='Keep unsaved intent';await f.c.saveInteractiveQuestion({type:'qaRequestAction',token:edit.token,key:edit.card.id,requestId:'request',value:'fixed'});expect(f.actions).toContainEqual(['status','flags','request','fixed']);expect(f.payloads.at(-1).note).toMatch(/unsaved wording draft is retained/);expect(edit.card.draftText).toBe('Keep unsaved intent');
});
it('actual occurrence chooser excludes off-row metadata and retains the shared prefix',async()=>{
 const f=fixture(),owner={library:'L',concept:'A'};
 const view={gen:2,focusNodes:{question:{owner:'branchA'}},criterionOccurrences:[],anchors:{question:{segmentIds:['gid']}},conceptOccurrences:[{lib:'L',name:'A',gid:'gid'}]};
 const a={id:'a',index:0n,expanded:new Set(),row:{pathKeys:['root','branchA'],label:'A'},view},b={id:'b',index:1n,expanded:new Set(),row:{pathKeys:['root','branchB'],label:'B'},view};
 Object.assign(f.c,{decisionTable:{suspended:false,visible:['a','b'],sessions:new Map([['a',a],['b',b]])},expandQuestionInputs:expanded=>expanded,treeRenderOptions:()=>({}),branchSessionCurrent:()=>true,renderBranchSession:()=>{}});
 const actual=root.body.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='interactiveQuestionTarget').getText(ast);
 vm.runInContext(transformSync(actual,{loader:'ts',target:'es2022'}).code,f.c);
 expect((await f.c.interactiveQuestionTarget(f.context,owner)).session.id).toBe('a');
 f.c.decisionTable.visible=['b'];await expect(f.c.interactiveQuestionTarget(f.context,owner)).rejects.toThrow(/no visible/);
 view.focusNodes.question.owner='root';expect((await f.c.interactiveQuestionTarget(f.context,owner)).session.id).toBe('b');
 f.c.decisionTable.visible=['a','b'];f.c.expandQuestionInputs=()=>new Set(['opened']);f.pick(undefined);
 expect(await f.c.interactiveQuestionTarget(f.context,owner)).toBeUndefined();expect(a.expanded.size).toBe(0);expect(b.expanded.size).toBe(0);
 let finish;f.pick(new Promise(resolve=>finish=resolve));const chooser=f.c.interactiveQuestionTarget(f.context,owner);f.c.indexVersion++;finish(undefined);expect(await chooser).toBeUndefined();expect(a.expanded.size).toBe(0);expect(b.expanded.size).toBe(0);
});
it('refuses editing a different presentation than the rendered question',async()=>{
 const f=fixture();f.context.result.questionnaire.item[0].text='Other scope question';
 await expect(f.c.interactiveQuestionAction(f.context,'edit','q')).rejects.toThrow(/does not match this source presentation/);expect(f.payloads).toEqual([]);
});
it('real imported choice-group emission opens its member pencil for ordinary and capable engine wording',async()=>{
 const root=new URL('../../crl/src/fhir-emitter/tests/fixtures/interactive-origin-owner/root.crl',import.meta.url),shared=new URL('./shared.crl',root);
 const emitted=emitCrlBundle(fileURLToPath(root),{sourceOrigins:true});expect(emitted.success).toBe(true);
 const inputTexts=[];const walk=value=>{if(!value||typeof value!=='object')return;for(const e of value.extension??[])if(e.url?.endsWith('cpg-input-text'))inputTexts.push(e.valueString);Object.values(value).forEach(v=>{if(v&&typeof v==='object')Array.isArray(v)?v.forEach(walk):walk(v);});};walk(emitted.bundle);
 expect(inputTexts).toContain('Choose applicable findings: Imported question?');
 const origin=emitted.definitionOrigins.find(o=>o.kind==='CaseFeature'&&o.name==='Imported Answer');
 for(const text of ['Imported question?',inputTexts.find(t=>t.startsWith('Choose applicable findings: '))]){
  const f=fixture();f.c.questionReviewOwners=questionReviewOwners;f.c.resolveSourceWordingTarget=resolveSourceWordingTarget;f.c.wordingSources=new Map([['Origin Shared',{filePath:'E:/fixture/src/crl/shared.crl',source:readFileSync(shared,'utf8'),packaged:false}]]);
  f.context.prepared.definitionOrigins=emitted.definitionOrigins;f.context.result.questionnaire={item:[{linkId:'q',type:'boolean',text,definition:origin.canonical+'#Observation.value[x]'}]};
  await f.c.interactiveQuestionAction(f.context,'edit','q');expect(f.payloads[0].cards[0].text).toBe('Imported question?');
 }
});
it('real presentation-less emission remains editable for any engine fallback label',async()=>{
 const root=new URL('../../crl/src/fhir-emitter/tests/fixtures/interactive-origin-owner/root.crl',import.meta.url),emitted=emitCrlBundle(fileURLToPath(root),{sourceOrigins:true});expect(emitted.success).toBe(true);
 const origin=emitted.definitionOrigins.find(o=>o.kind==='CaseFeature'&&o.name==='Unworded Answer');expect(origin).toBeDefined();
 const inputs=[];const walk=v=>{if(!v||typeof v!=='object')return;inputs.push(...(v.input??[]));Object.values(v).forEach(c=>{if(c&&typeof c==='object')Array.isArray(c)?c.forEach(walk):walk(c);});};walk(emitted.bundle);
 const own=inputs.filter(i=>i.profile?.includes(origin.canonical));expect(own.length).toBeGreaterThan(0);expect(own.every(i=>!(i.extension??[]).some(e=>e.url?.endsWith('cpg-input-text')))).toBe(true);
 const f=fixture();f.c.questionReviewOwners=questionReviewOwners;f.c.resolveSourceWordingTarget=resolveSourceWordingTarget;f.c.wordingSources=new Map([['Origin Shared',{filePath:'E:/fixture/src/crl/shared.crl',source:readFileSync(new URL('./shared.crl',root),'utf8'),packaged:false}]]);
 f.context.prepared.definitionOrigins=emitted.definitionOrigins;f.context.result.questionnaire={item:[{linkId:'q',type:'boolean',text:'Engine fallback label',definition:origin.canonical+'#Observation.value[x]'}]};
 await f.c.interactiveQuestionAction(f.context,'edit','q');expect(f.payloads[0].cards[0].text).toBe('Unworded Answer');expect(f.payloads[0].note).toMatch(/fallback.*add default/);
 expect(interactiveQuestionWordingMatches(undefined,f.c.interactiveEdit.target)).toBe(false);
});
it('pre-picker stale/mode/sidecar and invalidated question actions throw for the panel refusal router',async()=>{
 for(const change of [f=>f.c.mode='cockpit',f=>f.c.mvSidecarPath=undefined,f=>f.deny()]){const f=fixture();change(f);await expect(f.c.interactiveVerdict(f.context,0)).rejects.toThrow();expect(f.writes).toEqual([]);}
 const f=fixture();f.c.interactiveQuestionTarget=async()=>{f.c.mode='cockpit';return f.target;};await expect(f.c.interactiveQuestionAction(f.context,'focus','q')).rejects.toThrow();
});
it('a stale discard confirmation throws and preserves the previous draft',async()=>{
 const f=fixture();await f.c.interactiveQuestionAction(f.context,'edit','q');const edit=f.c.interactiveEdit;edit.card.draftText='Keep me';edit.target={...edit.target,baseline:'older source'};
 f.c.vscode.window.showWarningMessage=async()=>{f.c.mode='cockpit';return 'Discard';};
 await expect(f.c.interactiveQuestionAction(f.context,'edit','q')).rejects.toThrow(/confirmation was open/);expect(f.c.interactiveEdit.card.draftText).toBe('Keep me');
});
it('a scoped-only presentation cannot be edited through an unscoped or other-decision occurrence',async()=>{
 const source='library "L".\nconcept "A": - shape is Record. - type is Observation. - value type is boolean. - code is `a`. - shape reduction is most recent.\nactivity "Met": - request CPGTaskRequest.\ndecision "D": - when "A" then recommend activity "Met".\npresentation for "A": - in decision "D". - question text is "Scoped question?".\n';
 const f=fixture();f.c.resolveSourceWordingTarget=resolveSourceWordingTarget;f.c.wordingSources.set('L',{filePath:'E:/fixture/src/crl/policy.crl',source,packaged:false});f.context.result.questionnaire.item[0].text='Scoped question?';
 f.c.crlStructure[0].decision='Other';
 await expect(f.c.interactiveQuestionAction(f.context,'edit','q')).rejects.toThrow(/does not match/);expect(f.payloads).toEqual([]);
 const unscoped=resolveSourceWordingTarget(f.c.wordingSources.get('L'),'A');expect(unscoped.owners.questionText).toBeUndefined();expect(interactiveQuestionWordingMatches('Scoped question?',unscoped)).toBe(false);
 f.c.crlStructure[0].decision='D';await f.c.interactiveQuestionAction(f.context,'edit','q');expect(f.payloads[0].cards[0].text).toBe('Scoped question?');
});
it('a verdict save and unchanged-definition rebuild do not invalidate a wording draft',async()=>{
 const f=fixture();await f.c.interactiveQuestionAction(f.context,'edit','q');const edit=f.c.interactiveEdit;edit.card.draftText='Keep intent';
 f.c.persistMv=map=>{f.writes.push(map);f.c.mvRevision++;return true;};await f.c.interactiveVerdict(f.context,0);f.c.indexVersion++;
 await f.c.saveInteractiveQuestion({type:'routeCardSave',token:edit.token,key:edit.card.id,fields:{questionText:'Keep intent',questionDescription:'Description'}});
 expect(f.payloads.at(-1).ok).toBe(true);expect(f.actions.some(a=>a[0]==='save')).toBe(true);
});
it('retains an invalidated draft with save disabled and rebinds only after reopening its unchanged owner',async()=>{
 const f=fixture();await f.c.interactiveQuestionAction(f.context,'edit','q');const edit=f.c.interactiveEdit;
 await f.c.saveInteractiveQuestion({type:'routeCardDraft',token:edit.token,key:edit.card.id,fields:{draftText:'Keep this draft'}});
 f.c.invalidateInteractiveEdit();expect(f.c.interactiveEdit.card.draftText).toBe('Keep this draft');expect(f.payloads.at(-1).cards[0].editBlockedReason).toMatch(/draft is retained/);
 await f.c.interactiveQuestionAction(f.context,'edit','q');expect(f.c.interactiveEdit.card.draftText).toBe('Keep this draft');expect(f.c.interactiveEdit.card.editBlockedReason).toBeUndefined();
});
