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
 const files=async()=>(await fs.readdir(path.join(uploads,externalLinksFolder))).filter(name=>name!=='badges');
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

const quiz=Array.from({length:10},(_,i)=>({q:'سؤال '+(i+1),options:['صحيح','خطأ','ربما'],answer:i%3}));
const right=quiz.map(item=>item.answer),half=right.map((a,i)=>i<5?a:(a+1)%3),four=right.map((a,i)=>i<4?a:(a+1)%3);
async function withQuiz(t,extra){const h=await harness(t,extra);const link=(await h.send('admin/external-links',{title:'ملخص 2031',slug:'uae-2031'},'PDF')).data;
 const saved=await h.json('admin/external-links/'+link.id,'PUT',{title:link.title,description:'',active:true,quiz});assert.equal(saved.status,200);assert.equal(saved.data.quiz.length,10);
 const post=async(route,data)=>{const r=await fetch(h.origin+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data||{})});return {status:r.status,data:await r.json().catch(()=>null)}};return {...h,link,post};}

test('quiz validation rejects malformed questions and keeps the quiz when omitted',async t=>{
 const {externalLinkQuiz,externalLinkPassMark,externalLinkPerson}=await import('../external-links.js');
 assert.equal(externalLinkQuiz(undefined),null);assert.deepEqual(externalLinkQuiz([]),[]);assert.equal(externalLinkPassMark(10),5);assert.equal(externalLinkPassMark(5),3);
 for(const bad of [[quiz[0]],[{q:'',options:['a','b'],answer:0},quiz[1]],[{q:'x',options:['a'],answer:0},quiz[1]],[{q:'x',options:['a','a'],answer:0},quiz[1]],[{q:'x',options:['a','b'],answer:2},quiz[1]],'x'])assert.throws(()=>externalLinkQuiz(bad));
 assert.deepEqual(externalLinkPerson({name:'  أحمد   محمد ',phone:'00971 50-123 4567'}),{name:'أحمد محمد',phone:'+971501234567'});assert.equal(externalLinkPerson({name:'سارة علي',phone:'+٩٧١٥٠١٢٣٤٥٦٧'}).phone,'+971501234567');
 for(const bad of [{name:'أ',phone:'+971501234567'},{name:'أحمد محمد',phone:'12345'},{name:'أحمد محمد',phone:'abc'}])assert.throws(()=>externalLinkPerson(bad));
 const h=await withQuiz(t);const kept=await h.json('admin/external-links/'+h.link.id,'PUT',{title:'عنوان جديد',description:'',active:true});assert.equal(kept.data.quiz.length,10);
 const off=await h.json('admin/external-links/'+h.link.id,'PUT',{title:'عنوان جديد',description:'',active:true,quiz:[]});assert.equal(off.data.quiz.length,0);
 assert.equal((await h.json('external-links/uae-2031/quiz','GET',null,false)).status,404);
});

test('public quiz hides answers, passes at half and issues one badge per person',async t=>{
 const h=await withQuiz(t);
 const info=await h.json('external-links/uae-2031','GET',null,false);assert.equal(info.data.quizCount,10);assert.equal(info.data.passMark,5);
 const shown=await h.json('external-links/uae-2031/quiz','GET',null,false);assert.equal(shown.data.questions.length,10);assert.ok(shown.data.questions.every(q=>!('answer' in q)&&q.options.length===3));
 assert.deepEqual((await h.post('external-links/uae-2031/badge',{answers:four})).data,{passed:false});
 assert.deepEqual((await h.post('external-links/uae-2031/badge',{answers:four,name:'أحمد محمد',phone:'+971501234567'})).data,{passed:false});
 assert.deepEqual((await h.post('external-links/uae-2031/badge',{answers:half})).data,{passed:true});
 assert.equal((await h.post('external-links/uae-2031/badge',{answers:[0,1]})).status,400);
 assert.equal((await h.post('external-links/uae-2031/badge',{answers:half,name:'أ',phone:'+971501234567'})).status,400);
 const made=await h.post('external-links/uae-2031/badge',{answers:half,name:'أحمد محمد العلي',phone:'0097150 123 4567'});
 assert.equal(made.status,201);assert.match(made.data.badge.code,/^INX-[A-Z0-9]{8}$/);assert.equal(made.data.badge.name,'أحمد محمد العلي');assert.equal(made.data.badge.title,'ملخص 2031');assert.match(made.data.badge.date,/^\d\d \/ \d\d \/ \d{4}$/);assert.equal(made.data.badge.phone,undefined);
 const again=await h.post('external-links/uae-2031/badge',{answers:right,name:'أحمد محمد العلي',phone:'+971501234567'});assert.equal(again.status,200);assert.equal(again.data.badge.code,made.data.badge.code);
 const pub=await h.json('external-badges/'+made.data.badge.code.toLowerCase(),'GET',null,false);assert.equal(pub.status,200);assert.deepEqual(Object.keys(pub.data).sort(),['code','date','name','title','version']);
 assert.equal((await h.json('external-badges/INX-AAAAAAAA','GET',null,false)).status,404);assert.equal((await h.json('external-badges/nope','GET',null,false)).status,404);
 const list=await h.json('admin/external-links/'+h.link.id+'/badges');assert.equal(list.data.items.length,1);assert.equal(list.data.items[0].phone,'+971501234567');
 assert.equal((await h.json('admin/external-links/'+h.link.id+'/badges','GET',null,false)).status,401);
 assert.equal((await h.json('admin/external-links')).data.items[0].badges,1);
});

test('badge PDF is rendered once, cached and removed with its link; shares are counted',async t=>{
 const h=await withQuiz(t);const code=(await h.post('external-links/uae-2031/badge',{answers:right,name:'سارة علي',phone:'+971501234567'})).data.badge.code;
 const pdf=await fetch(h.origin+'/api/external-badges/'+code+'/pdf');assert.equal(pdf.status,200);const bytes=Buffer.from(await pdf.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.ok(bytes.length>20000);
 assert.match(pdf.headers.get('content-disposition'),new RegExp('INEXC-Badge-'+code+'\\.pdf'));
 const cached=path.join(h.uploads,externalLinksFolder,'badges',code+'.pdf');const first=(await fs.stat(cached)).mtimeMs;
 assert.equal((await fetch(h.origin+'/api/external-badges/'+code+'/pdf')).status,200);assert.equal((await fs.stat(cached)).mtimeMs,first);
 assert.notEqual((await fetch(h.origin+'/uploads/'+externalLinksFolder+'/badges/'+code+'.pdf')).status,200);
 assert.equal((await h.post('external-links/uae-2031/share')).status,200);assert.equal((await h.post('external-links/uae-2031/share')).status,200);assert.equal((await h.post('external-links/none/share')).status,404);
 assert.equal((await h.json('admin/external-links')).data.items[0].shares,2);
 assert.equal((await h.json('admin/external-links/'+h.link.id,'DELETE')).status,200);await new Promise(r=>setTimeout(r,80));
 await assert.rejects(fs.stat(cached));assert.equal((await h.json('external-badges/'+code,'GET',null,false)).status,404);
});

test('badge issuing is rate limited and a broken renderer reports a clear error',async t=>{
 const h=await withQuiz(t,{badgeLimit:2,python:'/nonexistent/python'});
 for(const n of [1,2])assert.equal((await h.post('external-links/uae-2031/badge',{answers:right,name:'متدرب رقم '+n,phone:'+97150123456'+n})).status,201);
 assert.equal((await h.post('external-links/uae-2031/badge',{answers:right,name:'متدرب رقم 3',phone:'+971501234563'})).status,429);
 const code=(await h.json('admin/external-links/'+h.link.id+'/badges')).data.items[0].code;assert.equal((await fetch(h.origin+'/api/external-badges/'+code+'/pdf')).status,503);
});
