#!/usr/bin/env node
'use strict';
// Maintainer-only: explicit E:/... scratch parent on machines with a constrained system drive.
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {hash}=require('./check.cjs');
const {ENGINE_JAR_SOURCE}=require('../../dist/results/spawn');
const [jarArg, parentArg, jdkBin]=process.argv.slice(2);
assert.ok(jarArg&&parentArg&&jdkBin,'Usage: build-session.cjs engine.jar EXISTING_SCRATCH_PARENT JDK_BIN');
const jar=fs.realpathSync(jarArg),parent=fs.realpathSync(parentArg);
assert.equal(hash(fs.readFileSync(jar)),ENGINE_JAR_SOURCE.sha256);
const work=fs.mkdtempSync(path.join(parent,'crl-session-build-'));
const out=path.join(__dirname,'session-classes');fs.mkdirSync(out,{recursive:true});
const bin=n=>path.join(jdkBin,n+(process.platform==='win32'?'.exe':''));
try {
  execFileSync(bin('jar'),['xf',jar,'BOOT-INF/lib'],{cwd:work,stdio:'inherit',windowsHide:true});
  execFileSync(bin('javac'),['--release','17','-cp',path.join(work,'BOOT-INF/lib/*'),'-d',work,path.join(__dirname,'ApplySessionDriver.java')],{stdio:'inherit',windowsHide:true});
  const names=fs.readdirSync(work).filter(n=>n.endsWith('.class'));
  assert.deepEqual(names,['ApplySessionDriver.class']);
  const bytes=fs.readFileSync(path.join(work,names[0]));assert.equal(bytes.readUInt16BE(6),61);
  fs.writeFileSync(path.join(out,names[0]),bytes);
  fs.writeFileSync(path.join(out,'build.json'),JSON.stringify({engineSha256:ENGINE_JAR_SOURCE.sha256,sourceSha256:hash(fs.readFileSync(path.join(__dirname,'ApplySessionDriver.java'))),classFileMajor:61,classes:{[names[0]]:hash(bytes)}},null,2)+'\n');
} finally {
  // Resolve and verify the exact freshly created child before removing only this build's files.
  const resolved=fs.realpathSync(work);
  assert.equal(path.dirname(resolved),parent);assert.ok(path.basename(resolved).startsWith('crl-session-build-'));
  fs.rmSync(resolved,{recursive:true});
}
console.log('Built Java17 session helper');
