import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { installRouteCards, ROUTE_CARD_STYLE } from "./routeCardsWebview";

export const BRANCH_QUESTIONNAIRE_VIEW_TYPE = "crl.branchQuestionnaire";
export function nextQuestionnaireColumn(): vscode.ViewColumn {
  const columns = vscode.window.tabGroups?.all.map(group => group.viewColumn) ?? [];
  return columns.length ? Math.min(9, Math.max(...columns) + 1) : vscode.ViewColumn.Beside;
}

/** One pinned-branch pane. A replaced panel can neither send commands nor close its replacement. */
export function createBranchQuestionnairePanel(onMessage: (message: any) => void, onClosed: () => void) {
  let current: vscode.WebviewPanel | undefined, payload: any, ready = false, serial = 0;
  const post = (message: any) => { if (ready && current) void current.webview.postMessage({...message,gen:serial}); };
  const close = () => { const old=current;if(!old)return;current=undefined;payload=undefined;ready=false;old.dispose();onClosed(); };
  return {
    get isOpen() { return !!current; }, post, close,
    update(value: any) { payload=value;post({type:'routeCards',...value}); },
    open(value: any) {
      if(current){payload=value;post({type:'routeCards',...value});return;}
      payload=value;ready=false;const generation=++serial;
      const panel=vscode.window.createWebviewPanel(BRANCH_QUESTIONNAIRE_VIEW_TYPE,'Medical Validation — Result Questionnaire',
        {viewColumn:nextQuestionnaireColumn(),preserveFocus:true},{enableScripts:true,retainContextWhenHidden:true,localResourceRoots:[]});
      current=panel;
      const listener=panel.webview.onDidReceiveMessage(message=>{
        if(current!==panel || message?.gen!==generation)return;
        if(message.type==='ready'){ready=true;post({type:'routeCards',...payload});return;}
        if(message.token!==payload?.token)return;
        if(['routeCardProposal','routeCardDraft'].includes(message.type))onMessage(message);
      });
      panel.onDidDispose(()=>{listener.dispose();if(current!==panel)return;current=undefined;payload=undefined;ready=false;onClosed();});
      const nonce=randomUUID();
      panel.webview.html=`<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><style nonce="${nonce}">
        body{padding:12px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);font:var(--vscode-font-size) var(--vscode-font-family)}
        ${ROUTE_CARD_STYLE}
        .route-questionnaire{width:100%;max-width:720px}.route-branch-label{font-size:12px;color:var(--vscode-descriptionForeground)}
      </style></head><body><main id="root"></main><script nonce="${nonce}">
        const api=acquireVsCodeApi(),gen=${generation};
        const ui=(${installRouteCards.toString()})(document.getElementById('root'),api,()=>gen,()=>{},true);
        window.addEventListener('message',e=>{const m=e.data;if(m.gen!==gen)return;if(m.type==='routeCards')ui.show(m);else if(m.type==='routeCardProposalResult')ui.result(m);else if(m.type==='routeCardDraft')ui.draft(m);});
        api.postMessage({type:'ready',gen});
      </script></body></html>`;
    },
  };
}
