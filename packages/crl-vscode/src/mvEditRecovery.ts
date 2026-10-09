// REFACTOR:grounded (Medical Review): recover local filesystem publication; KELP owns lock and Save recovery.
import {readScopeOperation,writeScopeOperation} from './mvScopeCoordinator';
import {MvEditTransaction} from './mvEditTransaction';


export async function reconcileScopeOperation(file:string,root:string){
 const operation=readScopeOperation(file,root);
 if(['planning','locked','acquiring','scope-outcome-unknown'].includes(operation.phase) && !operation.transactionDirectory){
  operation.phase='no-live-change';operation.detail='No policy files were published. Manage retained scope locks through KELP.';
  writeScopeOperation(file,operation);return operation.detail;
 }
 if(operation.phase==='publishing' && operation.transactionDirectory){
  const tx=MvEditTransaction.load(operation.transactionDirectory,root),phase=tx.recover();
  operation.phase=phase==='rolled-back'?'no-live-change':'local-applied';operation.localComplete=phase!=='rolled-back';writeScopeOperation(file,operation);
  return phase==='rolled-back'?'Interrupted publication restored the original files.':'Publication completed locally.';
 }
 if(['local-applied','saved','save-failed','save-in-flight','save-outcome-unknown'].includes(operation.phase)){
  operation.localComplete=true;writeScopeOperation(file,operation);return 'The edit is already saved locally.';
 }
 return 'No local publication needs recovery.';
}
