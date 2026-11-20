import type { DefinitionPublicationOptions } from "@smile-digital-health/crl";
import * as vscode from "vscode";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { InteractiveSession, nativeInteractiveRunner, prepareInteractivePolicy, type NativeApply } from "./interactiveQuestionnaire";
import { interactiveQuestionnaireHtml } from "./interactiveQuestionnaireHtml";
import { nextQuestionnaireColumn } from "./branchQuestionnairePanel";
import { interactiveQuestionnaireDependencies } from "./interactiveQuestionnaireDependencies";
import type { InteractiveResult } from './interactiveQuestionnaire';
import type { InteractiveQuestionControl } from './lformsReviewControls';

export interface QuestionReviewContext {
  cel:string; prepared:Pick<ReturnType<typeof prepareInteractivePolicy>,'definitionOrigins'>;
  result:Pick<InteractiveResult,'questionnaire'>; current():boolean;
}
export interface InteractiveReviewContext extends QuestionReviewContext {
  cel: string; prepared: ReturnType<typeof prepareInteractivePolicy>; result: InteractiveResult;
  current(): boolean; outcomeCurrent(): boolean;
}
export interface InteractiveReviewPresentation {
  questions: InteractiveQuestionControl[];
  outcomes: { label: string; reason?: string }[];
}
export interface InteractiveReviewHooks {
  describe(context: InteractiveReviewContext): InteractiveReviewPresentation;
  question(context: InteractiveReviewContext, action: 'focus'|'edit'|'flag', linkId: string): void | Promise<void>;
  verdict(context: InteractiveReviewContext, index: number): void | Promise<void>;
  invalidated?(): void;
}
// REFACTOR:grounded: Default explicitly evaluates the currently selected row, without automatic form replacement.
export interface InteractivePanelOptions {
  defaults?: {
    describe(cel:string): {label?:string;reason?:string};
    load(cel:string): {initial:NonNullable<InteractiveSession['initial']>;current():boolean} | Promise<{initial:NonNullable<InteractiveSession['initial']>;current():boolean}>;
  };
  column?(): vscode.ViewColumn;
}

export function createInteractiveQuestionnairePanel(context: vscode.ExtensionContext, inspectQuestionnaire: (q: unknown) => string[] = () => [], publication: (cel:string)=>DefinitionPublicationOptions = ()=>({}), onOpenChanged: () => void = () => {}, reviewHooks?: InteractiveReviewHooks, options:InteractivePanelOptions={}) {
  let current: vscode.WebviewPanel | undefined, owner: string | undefined, session: InteractiveSession | undefined;
  let token = 0, markStale: (()=>void)|undefined, refreshReview: (()=>void)|undefined, refreshDefaults:(()=>void)|undefined;
  let candidate:InteractiveSession|undefined,cleanup:Promise<void>=Promise.resolve();
  let runner:ReturnType<typeof nativeInteractiveRunner>|undefined;
  const getRunner=()=>{if(!runner){const adapter=require(join(context.extensionPath,'dist','apply-session.js')) as {applySession:NativeApply};runner=nativeInteractiveRunner(adapter.applySession);}return runner;};
  const drain=()=>{const owned=[session,candidate].filter((s):s is InteractiveSession=>!!s);for(const s of owned)s.cancel();candidate=undefined;cleanup=Promise.all([cleanup,...owned.map(s=>s.cancelAndWait())]).then(()=>{});return cleanup;};
  const close = () => { reviewHooks?.invalidated?.(); refreshReview=undefined;refreshDefaults=undefined;markStale=undefined;++token;void drain();session = undefined; const old = current; current = undefined; owner = undefined; old?.dispose(); if(old)onOpenChanged(); };
  context.subscriptions.push({ dispose: close });
  return {
    close,
    refreshReview() { refreshReview?.(); },
    defaultsChanged() { refreshDefaults?.(); },
    get isOpen() { return !!current; },
    get layoutPanel() { return current; },
    toggle(cel: string) { if(current)close();else this.open(cel); },
    definitionsChanged(cel: string) { if(owner===cel)markStale?.(); },
    policyChanged(cel: string | undefined) { if (current && owner !== cel) close(); },
    open(cel: string) {
      if (current && owner === cel) { current.reveal(undefined, true); return; }
      close();
      const panel = vscode.window.createWebviewPanel("crl.interactiveQuestionnaire", "Medical Validation — FHIR Questionnaire",
        { viewColumn: options.column?.() ?? nextQuestionnaireColumn(), preserveFocus: false }, {
          enableScripts: true, retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media", "lforms")],
        });
      current = panel; owner = cel;
      const generation = ++token;
      let states: ReturnType<typeof prepareInteractivePolicy>["initialStates"] = [];
      let selected: typeof states[number] | undefined, busy = false, stale = false, restartActive=false;
      let preparedPolicy: ReturnType<typeof prepareInteractivePolicy> | undefined;
      let reviewContext: InteractiveReviewContext | undefined, evaluationId = '', outcomeValid = false;
      const invalidate = (notifyEditor=true) => { outcomeValid = false; if(notifyEditor)reviewHooks?.invalidated?.(); };
      const post = (m: any) => { if (current === panel) void panel.webview.postMessage({ ...m, token }); };
      const defaultsState=()=>{try{return options.defaults?.describe(cel)??{reason:'Select a covered Decision Table row to use Default.'};}catch(error){return {reason:String(error)};}};
      refreshDefaults=()=>post({type:'defaults',...defaultsState()});
      refreshReview=()=>{if(reviewContext?.current() && reviewHooks)try{post({type:'review',evaluationId,review:reviewHooks.describe(reviewContext)});}catch(error){post({type:'reviewError',message:error instanceof Error?error.message:String(error)});}};
      markStale=()=>{invalidate(true);stale=true;++token;void drain();if(!restartActive)busy=false;post({type:"definitionStale",message:"Policy definitions changed. This form is retained for inspection. Restart with current definitions to evaluate again."});};
      const initialize = () => {
        if (current !== panel || generation !== token) return;
        try {
          const prepared = prepareInteractivePolicy(cel, publication(cel),true);
          preparedPolicy = prepared;
          states = prepared.initialStates;
          selected = states[0];
          // Keep the prebuilt standalone adapter's asset paths; do not bundle another native runtime.
          session = new InteractiveSession(prepared.definitions, prepared.planId, getRunner());
          if (selected) session.reset(selected);
          post({ type: "initial", states: states.map(({ id, label }) => ({ id, label })), subject: selected?.subject,
            warnings: [...prepared.warnings,...(prepared.initialStateError?[prepared.initialStateError]:[])], initialStateError:prepared.initialStateError, defaults:defaultsState(), dependencies: interactiveQuestionnaireDependencies(prepared.definitions, prepared.planId) });
        } catch (e) { post({ type: "initial", states: [], error: String(e) }); }
      };
      const listener = panel.webview.onDidReceiveMessage(async message => {
        if (current !== panel) return;
        if (message?.type === "ready") { if(stale)markStale?.();else initialize(); return; }
        if(message?.type==='restart' && message.token===token && stale && !busy){
          busy=true;restartActive=true;const restartToken=token;
          try{
            // Prepare the replacement before disturbing the retained form; await old native cleanup.
            const prepared=prepareInteractivePolicy(cel,publication(cel),true),selectedId=selected?.id;
            await drain();
            if(!getRunner().cleanupSafe())throw new Error('Native cleanup was not confirmed. Reload the window after reconciling the reported process failure.');
            if(current!==panel || owner!==cel || token!==restartToken)return;
            states=prepared.initialStates;selected=states.find(s=>s.id===selectedId)??states[0];
            preparedPolicy=prepared;reviewContext=undefined;invalidate();
            session=new InteractiveSession(prepared.definitions,prepared.planId,getRunner());if(selected)session.reset(selected);
            stale=false;++token;
            post({type:'initial',states:states.map(({id,label})=>({id,label})),selectedId:selected?.id,subject:selected?.subject,warnings:[...prepared.warnings,...(prepared.initialStateError?[prepared.initialStateError]:[])],initialStateError:prepared.initialStateError,defaults:defaultsState(),dependencies:interactiveQuestionnaireDependencies(prepared.definitions,prepared.planId)});
          }catch(error){if(token===restartToken)post({type:'restartError',message:String(error)});}finally{restartActive=false;busy=false;}
          return;
        }
        if (message?.token !== token || !session) return;
        if(stale)return;
        if(message.type==='answersChanged' && message.evaluationId===evaluationId){invalidate(false);return;}
        if(message.type==='questionReviewAction' || message.type==='outcomeVerdict'){
          const captured=reviewContext;
          if(!captured || !reviewHooks || message.evaluationId!==evaluationId || !captured.current())return;
          try{
            if(message.type==='questionReviewAction' && ['focus','edit','flag'].includes(message.action) && typeof message.linkId==='string')
              await reviewHooks.question(captured,message.action,message.linkId);
            else if(message.type==='outcomeVerdict' && captured.outcomeCurrent() && Number.isInteger(message.index) && message.index>=0 && message.index<captured.result.activities.length)
              await reviewHooks.verdict(captured,message.index);
            refreshReview?.();
          }catch(error){const message=error instanceof Error?error.message:String(error);if(captured.current())post({type:'reviewError',message});else vscode.window.setStatusBarMessage(`Medical Validation: action not applied — ${message}`,5000);}
          return;
        }
        if (message.type === "cancel") {
          if(!candidate)invalidate();
          ++token; void drain(); busy = false;
          void panel.webview.postMessage({ type: "cancelled", token, id: selected?.id, message: "Evaluation cancelled. Your current answers are still available." });
          return;
        }
        if (message.type === "select" || message.type === "reset") {
          const next = message.type === "select" ? states.find(s => s.id === message.id) : selected;
          if (!next) return;
          invalidate();reviewContext=undefined;
          void drain();selected = next; ++token; busy = false; session.reset(next);
          post({ type: "reset", id: selected.id, subject: selected.subject,label:selected.label,emptyAssessment:selected.id.startsWith('row-default:') }); return;
        }
        if(message.type==='default' && !busy && preparedPolicy && options.defaults){
          const mine=token,previous=session;busy=true;
          // A distinct candidate owns Default's work; failed loads never replace the retained assessment.
          const active=candidate=new InteractiveSession(preparedPolicy.definitions,preparedPolicy.planId,getRunner());
          try{
            const loaded=await options.defaults.load(cel);
            if(current!==panel||token!==mine||candidate!==active)return;
            active.resetWithDefaults(loaded.initial,new Set(preparedPolicy.definitionOrigins.filter(o=>o.kind==='CaseFeature').map(o=>o.canonical.split('|')[0])));
            await Promise.all([cleanup,previous.cancelAndWait()]);
            if(current!==panel||token!==mine||candidate!==active)return;
            if(!getRunner().cleanupSafe())throw new Error('Native cleanup was not confirmed. Reload the window after reconciling the reported process failure.');
            if(!loaded.current())throw new Error('The selected row changed. Select Default again to load that row.');
            const result=await active.evaluate();
            if(current!==panel||token!==mine||candidate!==active||!result)return;
            if(!loaded.current())throw new Error('The selected row changed. The previous form was retained.');
            invalidate();session=active;candidate=undefined;selected={...active.initial!,label:`Empty assessment — ${loaded.initial.label}`};
            states=[...states.filter(s=>!s.id.startsWith('row-default:')),selected];
            publish(result,active,mine,{states:states.map(({id,label})=>({id,label})),selectedId:selected.id,defaulted:true,defaultLabel:loaded.initial.label});
          }catch(error){if(current===panel&&mine===token)post({type:'error',message:String(error)});}
          finally{if(candidate===active)candidate=undefined;if(current===panel&&mine===token)busy=false;}
          return;
        }
        if (!["start", "continue"].includes(message.type) || !selected || busy) return;
        if (message.type === "start" && session.result) return;
        if (message.type === "continue" && (!session.result?.questionnaire || message.response?.resourceType !== "QuestionnaireResponse" || message.questionnaire?.resourceType !== "Questionnaire")) {
          post({ type: "error", message: "A current Questionnaire and QuestionnaireResponse are required to continue." }); return;
        }
        if (message.type === "start") session.reset(selected);
        invalidate();reviewContext=undefined;
        busy = true;
        const mine = token, active = session;
        try {
          await cleanup;
          if(current!==panel||mine!==token)return;
          if(!getRunner().cleanupSafe())throw new Error('Native cleanup was not confirmed. Reload the window after reconciling the reported process failure.');
          const result = await active.evaluate(message.type === "continue" ? message.response : undefined,
            message.type === "continue" ? message.questionnaire : undefined);
          if (current !== panel || mine !== token || !result) return;
          publish(result,active,mine);
        } catch (e) { if (current === panel && mine === token) post({ type: "error", message: String(e) }); }
        finally { if (current === panel && mine === token) busy = false; }
      });
      function publish(result:InteractiveResult,active:InteractiveSession,mine:number,extra={}){
        if(current!==panel||mine!==token)return;
        const {nativeData:_data,nativeResult:_native,...display}=result;
        const currentEvaluation=evaluationId=randomUUID();outcomeValid=true;
        // Operation tokens reject late work; result ownership preserves controls after Default rollback/cancel.
        const isCurrent=()=>current===panel&&owner===cel&&session===active&&active.result===result&&!stale&&!busy&&evaluationId===currentEvaluation;
        reviewContext={cel,prepared:preparedPolicy!,result,current:isCurrent,outcomeCurrent:()=>isCurrent()&&outcomeValid};
        let review:InteractiveReviewPresentation|undefined;
        try{review=reviewHooks?.describe(reviewContext);}catch(error){post({type:'reviewError',message:String(error)});}
        post({type:'result',...display,...extra,evaluationId,review,subject:selected!.subject,unsupported:inspectQuestionnaire(result.questionnaire)});
      }
      panel.onDidDispose(() => { listener.dispose(); if (current === panel) { invalidate();refreshReview=undefined;refreshDefaults=undefined;void drain();session = undefined; current = undefined; owner = undefined; markStale=undefined;++token;onOpenChanged(); } });
      const root = vscode.Uri.joinPath(context.extensionUri, "media", "lforms");
      panel.webview.html = interactiveQuestionnaireHtml(randomUUID(), panel.webview.cspSource,
        name => panel.webview.asWebviewUri(vscode.Uri.joinPath(root, name)).toString(), inspectQuestionnaire);
      onOpenChanged();
    },
  };
}
