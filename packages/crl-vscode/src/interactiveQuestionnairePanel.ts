import type { DefinitionPublicationOptions } from "@smile-digital-health/crl";
import * as vscode from "vscode";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { InteractiveSession, nativeInteractiveRunner, prepareInteractivePolicy, type NativeApply } from "./interactiveQuestionnaire";
import { interactiveQuestionnaireHtml } from "./interactiveQuestionnaireHtml";
import { nextQuestionnaireColumn } from "./branchQuestionnairePanel";
import { interactiveQuestionnaireDependencies } from "./interactiveQuestionnaireDependencies";

export function createInteractiveQuestionnairePanel(context: vscode.ExtensionContext, inspectQuestionnaire: (q: unknown) => string[] = () => [], publication: (cel:string)=>DefinitionPublicationOptions = ()=>({})) {
  let current: vscode.WebviewPanel | undefined, owner: string | undefined, session: InteractiveSession | undefined;
  let token = 0, markStale: (()=>void)|undefined;
  const close = () => { markStale=undefined;++token;session?.cancel(); session = undefined; const old = current; current = undefined; owner = undefined; old?.dispose(); };
  context.subscriptions.push({ dispose: close });
  return {
    close,
    definitionsChanged(cel: string) { if(owner===cel)markStale?.(); },
    policyChanged(cel: string | undefined) { if (current && owner !== cel) close(); },
    open(cel: string) {
      if (current && owner === cel) { current.reveal(undefined, true); return; }
      close();
      const panel = vscode.window.createWebviewPanel("crl.interactiveQuestionnaire", "Medical Validation — Interactive FHIR Questionnaire",
        { viewColumn: nextQuestionnaireColumn(), preserveFocus: false }, {
          enableScripts: true, retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media", "lforms")],
        });
      current = panel; owner = cel;
      const generation = ++token;
      let states: ReturnType<typeof prepareInteractivePolicy>["initialStates"] = [];
      let selected: typeof states[number] | undefined, busy = false, stale = false, restartActive=false;
      let runner: ReturnType<typeof nativeInteractiveRunner> | undefined;
      const getRunner=()=>{
        if(!runner){const adapter=require(join(context.extensionPath,"dist","apply-session.js")) as {applySession:NativeApply};runner=nativeInteractiveRunner(adapter.applySession);}
        return runner;
      };
      const post = (m: any) => { if (current === panel) void panel.webview.postMessage({ ...m, token }); };
      markStale=()=>{stale=true;++token;session?.cancel();if(!restartActive)busy=false;post({type:"definitionStale",message:"Policy definitions changed. This form is retained for inspection. Restart with current definitions to evaluate again."});};
      const initialize = () => {
        if (current !== panel || generation !== token) return;
        try {
          const prepared = prepareInteractivePolicy(cel, publication(cel));
          states = prepared.initialStates;
          selected = states[0];
          // Keep the prebuilt standalone adapter's asset paths; do not bundle another native runtime.
          session = new InteractiveSession(prepared.definitions, prepared.planId, getRunner());
          if (selected) session.reset(selected);
          post({ type: "initial", states: states.map(({ id, label }) => ({ id, label })), subject: selected?.subject,
            warnings: prepared.warnings, dependencies: interactiveQuestionnaireDependencies(prepared.definitions, prepared.planId) });
        } catch (e) { post({ type: "initial", states: [], error: String(e) }); }
      };
      const listener = panel.webview.onDidReceiveMessage(async message => {
        if (current !== panel) return;
        if (message?.type === "ready") { if(stale)markStale?.();else initialize(); return; }
        if(message?.type==='restart' && message.token===token && stale && !busy){
          busy=true;restartActive=true;const restartToken=token;
          try{
            // Prepare the replacement before disturbing the retained form; await old native cleanup.
            const prepared=prepareInteractivePolicy(cel,publication(cel)),selectedId=selected?.id;
            await session?.cancelAndWait();
            if(!getRunner().cleanupSafe())throw new Error('Native cleanup was not confirmed. Reload the window after reconciling the reported process failure.');
            if(current!==panel || owner!==cel || token!==restartToken)return;
            states=prepared.initialStates;selected=states.find(s=>s.id===selectedId)??states[0];
            session=new InteractiveSession(prepared.definitions,prepared.planId,getRunner());if(selected)session.reset(selected);
            stale=false;++token;
            post({type:'initial',states:states.map(({id,label})=>({id,label})),selectedId:selected?.id,subject:selected?.subject,warnings:prepared.warnings,dependencies:interactiveQuestionnaireDependencies(prepared.definitions,prepared.planId)});
          }catch(error){if(token===restartToken)post({type:'restartError',message:String(error)});}finally{restartActive=false;busy=false;}
          return;
        }
        if (message?.token !== token || !session) return;
        if(stale)return;
        if (message.type === "cancel") {
          ++token; session.cancel(); busy = false;
          void panel.webview.postMessage({ type: "cancelled", token, id: selected?.id, message: "Evaluation cancelled. Your current answers are still available." });
          return;
        }
        if (message.type === "select" || message.type === "reset") {
          const next = message.type === "select" ? states.find(s => s.id === message.id) : selected;
          if (!next) return;
          selected = next; ++token; busy = false; session.reset(next);
          post({ type: "reset", id: selected.id, subject: selected.subject }); return;
        }
        if (!["start", "continue"].includes(message.type) || !selected || busy) return;
        if (message.type === "start" && session.result) return;
        if (message.type === "continue" && (!session.result?.questionnaire || message.response?.resourceType !== "QuestionnaireResponse" || message.questionnaire?.resourceType !== "Questionnaire")) {
          post({ type: "error", message: "A current Questionnaire and QuestionnaireResponse are required to continue." }); return;
        }
        if (message.type === "start") session.reset(selected);
        busy = true;
        const mine = token, active = session;
        try {
          const result = await active.evaluate(message.type === "continue" ? message.response : undefined,
            message.type === "continue" ? message.questionnaire : undefined);
          if (current !== panel || mine !== token || !result) return;
          post({ type: "result", ...result, subject: selected.subject, unsupported: inspectQuestionnaire(result.questionnaire) });
        } catch (e) { if (current === panel && mine === token) post({ type: "error", message: String(e) }); }
        finally { if (current === panel && mine === token) busy = false; }
      });
      panel.onDidDispose(() => { listener.dispose(); if (current === panel) { session?.cancel(); session = undefined; current = undefined; owner = undefined; markStale=undefined;++token; } });
      const root = vscode.Uri.joinPath(context.extensionUri, "media", "lforms");
      panel.webview.html = interactiveQuestionnaireHtml(randomUUID(), panel.webview.cspSource,
        name => panel.webview.asWebviewUri(vscode.Uri.joinPath(root, name)).toString(), inspectQuestionnaire);
    },
  };
}
