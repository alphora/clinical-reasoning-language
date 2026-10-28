import {it,expect} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {SessionInputQueue} from '../../cli/sessionInputQueue';

it('holds the loaded-byte allowance until the caller releases its completed operation',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'session-input-budget-'));
 try{
  const file=path.join(root,'input');writeFileSync(file,'12345');
  const queue=new SessionInputQueue(8),a=queue.lease(),b=queue.lease();
  expect(await a.load(read=>read(file,8))).toBe('12345');
  let loaded=false;const pending=b.load(async read=>{const value=await read(file,8);loaded=true;return value;});
  await new Promise(resolve=>setTimeout(resolve,15));expect(loaded).toBe(false);
  a.release();expect(await pending).toBe('12345');expect(loaded).toBe(true);b.release();
 }finally{rmSync(root,{recursive:true,force:true});}
});
it('cancels queued loading without starting its file reads or blocking later loaders',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'session-input-cancel-'));
 try{
  const file=path.join(root,'input');writeFileSync(file,'12345');
  const queue=new SessionInputQueue(8),a=queue.lease(),b=queue.lease(),abort=new AbortController(),c=queue.lease(abort.signal);
  await a.load(read=>read(file,8));const second=b.load(read=>read(file,8));
  let invoked=false;const third=c.load(async()=>{invoked=true;return 'wrong';});
  const refused=expect(third).rejects.toMatchObject({code:'cancelled'});abort.abort();await refused;expect(invoked).toBe(false);c.release();
  a.release();expect(await second).toBe('12345');b.release();
 }finally{rmSync(root,{recursive:true,force:true});}
});
it('rejects one control exceeding the combined input allowance and preserves the caller lease for failure evidence',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'session-input-limit-'));
 try{
  const file=path.join(root,'input');writeFileSync(file,'12345');const queue=new SessionInputQueue(8),a=queue.lease();
  await expect(a.load(async read=>{await read(file,8);return read(file,8);})).rejects.toMatchObject({code:'input-limit'});
  a.release();const next=queue.lease();expect(await next.load(read=>read(file,8))).toBe('12345');next.release();
 }finally{rmSync(root,{recursive:true,force:true});}
});
