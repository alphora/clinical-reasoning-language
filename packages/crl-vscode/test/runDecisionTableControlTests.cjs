// REFACTOR:grounded: maintained production-runtime/host/panel regressions replace obsolete manual CDP oracles.
const {execFileSync}=require('node:child_process');
const {mkdirSync}=require('node:fs');
const {resolve,join}=require('node:path');
module.exports=()=>{
 const workspace=resolve(__dirname,'../../..'),storage=resolve(process.env.CRL_TEST_STORAGE_ROOT||join(workspace,'tmp','decision-table-controls-tests'));
 mkdirSync(storage,{recursive:true});
 execFileSync(process.execPath,[join(workspace,'node_modules/vitest/vitest.mjs'),'run','--project','crl-vscode','--no-file-parallelism','decisionTableWebview.test','decisionTableHost.test','branchQuestionnairePanel.test','routeCardsWebview.test'],{
  cwd:workspace,stdio:'inherit',env:{...process.env,TEMP:storage,TMP:storage,NODE_DISABLE_COMPILE_CACHE:'1',npm_config_cache:join(storage,'npm-cache')}});
};
