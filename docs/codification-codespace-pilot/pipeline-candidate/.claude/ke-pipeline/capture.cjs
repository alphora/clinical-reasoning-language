// capture.cjs — qualified passive observer of native engine exchanges (output root selected by CRL_OBSERVE_DIR).
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=process.env.CRL_OBSERVE_DIR||path.join(__dirname,'raw-native');fs.mkdirSync(root,{recursive:true});
const original=cp.spawn;let n=0;
cp.spawn=function(command,args,options){
 const child=original.apply(this,arguments);
 if(Array.isArray(args)&&args.some(a=>String(a).includes('windows-owned-process.ps1'))){
  const stem=path.join(root,Date.now()+'-'+process.pid+'-'+String(++n).padStart(2,'0'));
  const request=JSON.parse(Buffer.from(args.at(-1),'base64').toString('utf8'));
  fs.writeFileSync(stem+'.request.json',JSON.stringify({command,args,request,fixture:process.env.CRL_QUAL_FIXTURE,run:process.env.CRL_QUAL_RUN,at:new Date().toISOString()},null,2));
  const repo=request.arguments?.at(-3);if(repo&&fs.existsSync(repo)&&fs.statSync(repo).isFile())fs.copyFileSync(repo,stem+'.repository.json');
  fs.writeFileSync(stem+'.stdout.txt','');fs.writeFileSync(stem+'.stderr.txt','');
  child.stdout?.on('data',chunk=>fs.appendFileSync(stem+'.stdout.txt',chunk));child.stderr?.on('data',chunk=>fs.appendFileSync(stem+'.stderr.txt',chunk));
  child.on('close',(code,signal)=>fs.writeFileSync(stem+'.exit.json',JSON.stringify({code,signal,at:new Date().toISOString()},null,2)));
 }
 return child;
};
