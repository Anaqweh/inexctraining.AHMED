import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {setupExternalLinks,installExternalLinks,externalLinkSlug,externalLinksFolder} from '../external-links.js';

async function harness(t,extra={}){
 const db=new PGlite();t.after(()=>db.close());const pool={query:(sql,args)=>db.query(sql,args)};
 await db.exec('CREATE TABLE registrations(id int); INSERT INTO registrations VALUES(7)');await setupExternalLinks(pool);await setupExternalLinks(pool);
 const uploads=await fs.mkdtemp(path.join(os.tmpdir(),'inexc-external-links-test-'));t.after(()=>fs.rm(uploads,{recursive:true,force:true}));
 const app=express();app.use(express.json());
 app.use('/uploads',express.static(uploads,{index:false,dotfiles:'deny'}));
 installExternalLinks({app,pool,auth:(req,res,next)=>req.headers.authorization==='Bearer LOCAL'?next():res.sendStatus(401),uploadDir:uploads,...extra});
 app.use((e,_q,res,_n)=>res.status(e.status||400).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const origin='http://127.0.0.1:'+server.address().port;
 const json=async(route,method='GET',data,authenticated=true)=>{const r=await fetch(origin+'/api/'+route,{method,headers:{...(authenticated?{Authorization:'Bearer LOCAL'}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});return {status:r.status,data:await r.json().catch(()=>null)}};
 const send=async(route,fields,content,name='ملف تجريبي.pdf',authenticated=true)=>{const form=new FormData();for(const [k,v] of Object.entries(fields))form.append(k,v);if(content!=null)form.append('file',new Blob([content],{type:'application/pdf'}),name);const r=await fetch(origin+'/api/'+route,{method:'POST',headers:authenticated?{Authorization:'Bearer LOCAL'}:{},body:form});return {status:r.status,data:await r.json().catch(()=>null)}};
 const files=async()=>fs.readdir(path.join(uploads,externalLinksFolder));
 return {db,origin,uploads,json,send,files};
}

test('slug accepts simple latin names only',()=>{
 assert.equal(externalLinkSlug(' UAE 2031_Summary '),'uae-2031-summary');assert.equal(externalLinkSlug(''),'');
 for(const bad of ['ملف','a/b','../x','a.b','x'.repeat(61)])assert.throws(()=>externalLinkSlug(bad));
});

test('upload creates a link, serves the file with its original name and counts views and downloads',async t=>{
 const h=await harness(t);
 const created=await h.send('admin/external-links',{title:'ملخص 2031',slug:'uae-2031',description:'كتيّب'},'PDF-BYTES');
 assert.equal(created.status,201);assert.equal(created.data.slug,'uae-2031');assert.equal(created.data.file_name,'ملف تجريبي.pdf');assert.equal(Number(created.data.size_bytes),9);assert.equal(created.data.stored_name,undefined);
 const info=await h.json('external-links/uae-2031','GET',null,false);
 assert.equal(info.status,200);assert.deepEqual({title:info.data.title,fileName:info.data.fileName,sizeBytes:info.data.sizeBytes},{title:'ملخص 2031',fileName:'ملف تجريبي.pdf',sizeBytes:9});
 const file=await fetch(h.origin+'/api/external-links/UAE-2031/file');
 assert.equal(file.status,200);assert.equal(await file.text(),'PDF-BYTES');
 assert.match(file.headers.get('content-disposition'),/^attachment/);assert.match(file.headers.get('content-disposition'),/filename\*=UTF-8''%D9%85%D9%84%D9%81/);assert.equal(file.headers.get('x-content-type-options'),'nosniff');
 const resumed=await fetch(h.origin+'/api/external-links/uae-2031/file',{headers:{Range:'bytes=4-'}});assert.equal(resumed.status,206);assert.equal(await resumed.text(),'BYTES');
 const list=await h.json('admin/external-links');
 assert.equal(list.data.items.length,1);assert.equal(list.data.items[0].views,1);assert.equal(list.data.items[0].downloads,1);assert.equal(list.data.usedBytes,9);assert.equal(list.data.maxMb,300);
});

test('stored files are not reachable through the public uploads folder',async t=>{
 const h=await harness(t);await h.send('admin/external-links',{title:'خاص'},'SECRET');const [name]=await h.files();
 const direct=await fetch(h.origin+'/uploads/'+externalLinksFolder+'/'+name);assert.notEqual(direct.status,200);
});

test('admin routes need a session and leave nothing on disk when refused',async t=>{
 const h=await harness(t);
 assert.equal((await h.send('admin/external-links',{title:'x'},'DATA','a.pdf',false)).status,401);
 assert.equal((await h.json('admin/external-links','GET',null,false)).status,401);
 assert.equal((await h.json('admin/external-links/12345678-1234-1234-1234-123456789abc','DELETE',null,false)).status,401);
 assert.deepEqual(await h.files(),[]);
});

test('invalid uploads are rejected and cleaned up',async t=>{
 const h=await harness(t,{maxMb:1});
 assert.equal((await h.send('admin/external-links',{title:''},'DATA')).status,400);
 assert.equal((await h.send('admin/external-links',{title:'بدون ملف'},null)).status,400);
 assert.equal((await h.send('admin/external-links',{title:'اسم خاطئ',slug:'../etc'},'DATA')).status,400);
 const big=await h.send('admin/external-links',{title:'كبير'},Buffer.alloc(1024*1024+10));assert.equal(big.status,413);assert.match(big.data.error,/1 ميجابايت/);
 assert.equal((await h.send('admin/external-links',{title:'أول',slug:'same'},'A')).status,201);
 assert.equal((await h.send('admin/external-links',{title:'ثانٍ',slug:'same'},'B')).status,409);
 assert.equal((await h.files()).length,1);
});

test('a full disk refuses the upload',async t=>{
 const h=await harness(t,{reserveMb:1e12});const r=await h.send('admin/external-links',{title:'ممتلئ'},'DATA');
 assert.equal(r.status,507);assert.deepEqual(await h.files(),[]);
});

test('links can be renamed, paused, given a new file and deleted',async t=>{
 const h=await harness(t);const a=(await h.send('admin/external-links',{title:'قديم'},'OLD','old.docx')).data;
 assert.match(a.slug,/^[a-f0-9]{8}$/);
 const edited=await h.json('admin/external-links/'+a.id,'PUT',{title:'جديد',description:'',active:false});assert.equal(edited.data.title,'جديد');assert.equal(edited.data.active,false);
 assert.equal((await h.json('external-links/'+a.slug,'GET',null,false)).status,404);assert.equal((await fetch(h.origin+'/api/external-links/'+a.slug+'/file')).status,404);
 await h.json('admin/external-links/'+a.id,'PUT',{title:'جديد',description:'',active:true});
 const replaced=await h.send('admin/external-links/'+a.id+'/file',{},'NEW-FILE','new.zip');assert.equal(replaced.status,200);assert.equal(replaced.data.slug,a.slug);assert.equal(replaced.data.file_name,'new.zip');
 assert.equal((await h.files()).length,1);assert.equal(await (await fetch(h.origin+'/api/external-links/'+a.slug+'/file')).text(),'NEW-FILE');
 assert.equal((await h.json('admin/external-links/'+a.id,'PUT',{title:'x'})).status,400);
 assert.equal((await h.json('admin/external-links/'+a.id,'DELETE')).status,200);await new Promise(r=>setTimeout(r,50));
 assert.deepEqual(await h.files(),[]);assert.equal((await h.json('admin/external-links/'+a.id,'DELETE')).status,404);
 assert.equal((await h.db.query('SELECT count(*)::int n FROM registrations')).rows[0].n,1);
});
