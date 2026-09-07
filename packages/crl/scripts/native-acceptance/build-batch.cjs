#!/usr/bin/env node
'use strict';
// Maintainer-only build. Runtime uses committed Java17 classes and needs only a JRE.
const fs = require('node:fs'), path = require('node:path'), {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const digest = data => createHash('sha256').update(data).digest('hex');
const out = path.join(__dirname, 'batch-classes');
fs.mkdirSync(out, {recursive:true});
// javac writes only into this owned directory; build in a fresh child to detect stale extra classes.
const work = fs.mkdtempSync(path.join(out, 'build-'));
execFileSync(process.argv[2] || 'javac', ['--release','17','-d',work,path.join(__dirname,'BatchApplyDriver.java')], {stdio:'inherit',windowsHide:true});
const classes = fs.readdirSync(work).sort();
if (!classes.length || classes.some(n=>!/^BatchApplyDriver(?:\$\w+)?\.class$/.test(n))) throw new Error('Unexpected build output');
for (const n of classes) {
  const bytes = fs.readFileSync(path.join(work,n));
  if (bytes.readUInt32BE(0)!==0xcafebabe || bytes.readUInt16BE(6)!==61) throw new Error('Requires Java17 class files');
  fs.copyFileSync(path.join(work,n),path.join(out,n));
}
for (const n of fs.readdirSync(out).filter(n=>n.endsWith('.class')&&!classes.includes(n))) fs.unlinkSync(path.join(out,n));
const metadata = {sourceSha256:digest(fs.readFileSync(path.join(__dirname,'BatchApplyDriver.java'))),classFileMajor:61,
  classes:Object.fromEntries(classes.map(n=>[n,digest(fs.readFileSync(path.join(out,n)))]))};
fs.writeFileSync(path.join(out,'build.json'),JSON.stringify(metadata,null,2)+'\n');
// Exact generated files only; no recursive computed-path deletion.
for (const n of classes) fs.unlinkSync(path.join(work,n)); fs.rmdirSync(work);
console.log('Built '+classes.length+' Java17 test helper classes');
