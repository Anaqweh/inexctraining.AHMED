import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {setupCourseWall,installCourseWall,fileKind,publicSettings,normGroup} from '../course-wall.js';

async function harness(){
 const db=new PGlite(),uploadDir=await fs.mkdtemp(path.join(os.tmpdir(),'inexc-wall-'));
 const query=async(sql,params)=>{const r=await db.query(sql,params);return {...r,rowCount:r.affectedRows??r.rows.length}};
 const pool={query,connect:async()=>({query,release(){}})};
 await setupCourseWall(pool);await setupCourseWall(pool);
 const app=express();app.use(express.json({limit:'1mb'}));const sent=[];
 const wall=installCourseWall({app,pool,uploadDir,mailEnabled:true,sendEmail:async m=>{sent.push(m)},emailShell:({content})=>content,origin:'https://www.example.test'});
 app.use((e,_q,res,_n)=>res.status([400,401,403,404,409,429].includes(e.status)?e.status:500).json({error:e.message}));
 const server=await new Promise(r=>{const s=app.listen(0,()=>r(s))});const url='http://127.0.0.1:'+server.address().port;
 const api=async(p,method='GET',body,headers={})=>{const init={method,headers:{...headers}};if(body instanceof FormData)init.body=body;else if(body!==undefined){init.headers['Content-Type']='application/json';init.body=JSON.stringify(body)}const r=await fetch(url+p,init);const type=r.headers.get('content-type')||'';return {status:r.status,data:type.includes('json')?await r.json():Buffer.from(await r.arrayBuffer()),headers:r.headers}};
 return {pool,api,sent,wall,uploadDir,close:async()=>{server.close();await db.close();await fs.rm(uploadDir,{recursive:true,force:true})}};
}
const png1x1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const form=(fields,file)=>{const f=new FormData();for(const [k,v] of Object.entries(fields))f.append(k,v);if(file)f.append(file.field,new Blob([file.data],{type:file.type}),file.name);return f};
const waitReady=async(api,code,id,headers)=>{for(let i=0;i<200;i++){const it=(await api('/api/wall/boards/'+code,'GET',undefined,headers)).data.items.find(x=>x.id===id);if(it&&it.status!=='processing')return it;await new Promise(r=>setTimeout(r,100))}throw new Error('timeout')};

test('file kinds and settings normalisation',()=>{
 assert.equal(fileKind('a.PDF','application/octet-stream'),'pdf');assert.equal(fileKind('slides.pptx'),'office');assert.equal(fileKind('x.bin','image/png'),'image');assert.equal(fileKind('clip.mp4'),'video');assert.equal(fileKind('notes.md'),'text');assert.equal(fileKind('archive.zip'),'other');
 assert.deepEqual(publicSettings({comments:false,extra:1}),{uploadsOpen:true,comments:false,reactions:true,requireApproval:false,stamp:true,closed:false,allowDownload:true});
});

test('mode «both» lets a trainee enter alone (-1) or in a group',()=>{
 const g=['أ','ب','ج'];
 assert.equal(normGroup({mode:'single',groups:g},2),0);assert.equal(normGroup({mode:'groups',groups:g},-1),0);assert.equal(normGroup({mode:'groups',groups:g},2),2);assert.equal(normGroup({mode:'groups',groups:g},9,1),1);
 assert.equal(normGroup({mode:'both',groups:g},-1),-1);assert.equal(normGroup({mode:'both',groups:g},1),1);assert.equal(normGroup({mode:'both',groups:g},'x'),-1);
});
test('a board is created by anyone, its admin key arrives by email only, trainees join by name',async t=>{
 const h=await harness();t.after(()=>h.close());const {api,sent}=h;
 const created=await api('/api/wall/boards','POST',{title:'دبلوم التصميم',email:'Owner@Example.com'});
 assert.equal(created.status,201);assert.equal(created.data.emailed,true);assert.equal(created.data.adminUrl,undefined);
 const code=created.data.code;assert.match(code,/^[a-z0-9]{8}$/);assert.equal(created.data.url,'https://www.example.test/wall/?b='+code);
 assert.equal(sent.length,1);assert.equal(sent[0].to,'owner@example.com');const key=sent[0].text.match(/key=([a-f0-9]{64})/)[1];
 const owner={'X-Wall-Key':key};
 const pub=await api('/api/wall/boards/'+code);assert.equal(pub.status,200);assert.equal(pub.data.isOwner,false);assert.equal(pub.data.ownerEmail,undefined);assert.equal(pub.data.mode,'single');
 const asOwner=await api('/api/wall/boards/'+code,'GET',undefined,owner);assert.equal(asOwner.data.isOwner,true);assert.equal(asOwner.data.ownerEmail,'owner@example.com');
 assert.equal((await api('/api/wall/boards/'+code,'PATCH',{title:'x'})).status,403);
 const both=await api('/api/wall/boards/'+code,'PATCH',{mode:'both',groups:['أ','ب','ج']},owner);assert.equal(both.data.mode,'both');
 const solo=await api('/api/wall/boards/'+code+'/join','POST',{name:'منفرد',email:'solo@example.com',group:-1});assert.equal(solo.data.me.group,-1);
 assert.equal((await api('/api/wall/boards/'+code+'/join','POST',{name:'ضمن',email:'in@example.com',group:2})).data.me.group,2);
 const patched=await api('/api/wall/boards/'+code,'PATCH',{mode:'groups',groups:['أ','ب'],settings:{comments:false,nope:true}},owner);assert.equal(patched.status,200);assert.equal(patched.data.mode,'groups');assert.deepEqual(patched.data.groups,['أ','ب']);assert.equal(patched.data.settings.comments,false);
 const joined=await api('/api/wall/boards/'+code+'/join','POST',{name:'سارة',email:'sara@example.com',group:1});assert.equal(joined.status,201);assert.equal(joined.data.me.group,1);const member={'X-Wall-Member':joined.data.token};
 const me=await api('/api/wall/boards/'+code,'GET',undefined,member);assert.deepEqual(me.data.me,{id:joined.data.me.id,name:'سارة',group:1});assert.equal(me.data.members,3);
 // رفع صورة → تُحوَّل إلى صفحة مختومة
 const up=await api('/api/wall/boards/'+code+'/items','POST',form({title:'لوحتي',group:'1'},{field:'file',data:png1x1,type:'image/png',name:'لوحة.png'}),member);
 assert.equal(up.status,201);assert.equal(up.data.item.kind,'image');assert.equal(up.data.item.status,'processing');assert.equal(up.data.item.author,'سارة');assert.equal(up.data.item.group,1);
 const ready=await waitReady(api,code,up.data.item.id,member);assert.equal(ready.status,'ready');assert.equal(ready.pages,1);assert.equal(ready.mine,true);
 const page=await api(`/api/wall/items/${ready.id}/pages/1`);assert.equal(page.status,200);assert.equal(page.headers.get('content-type'),'image/png');assert.ok(page.data.length>100);
 assert.equal((await api(`/api/wall/items/${ready.id}/pages/2`)).status,404);
 const stamped=await api(`/api/wall/items/${ready.id}/stamped.pdf`);assert.equal(stamped.status,200);assert.equal(stamped.headers.get('content-type'),'application/pdf');assert.ok(stamped.data.slice(0,4).toString()==='%PDF');assert.equal(ready.stampedUrl,`/wall/items/${ready.id}/stamped.pdf`);
 const file=await api(`/api/wall/items/${ready.id}/file`);assert.equal(file.status,200);assert.match(file.headers.get('content-disposition'),/inline/);
 assert.equal((await api('/api/wall/boards/'+code+'/items','POST',form({},{field:'file',data:png1x1,type:'image/png',name:'x.png'}))).status,401);
 // تفاعل وتعليقات (التعليقات متوقفة من المدير ثم تُفعَّل)
 const like=await api(`/api/wall/items/${ready.id}/react`,'POST',{kind:'like'},member);assert.deepEqual(like.data,{kind:'like',active:true,likes:1,ideas:0});
 assert.equal((await api(`/api/wall/items/${ready.id}/react`,'POST',{kind:'like'},member)).data.likes,0);
 assert.equal((await api(`/api/wall/items/${ready.id}/comments`,'POST',form({body:'رائع'}),member)).status,409);
 await api('/api/wall/boards/'+code,'PATCH',{settings:{comments:true}},owner);
 const c1=await api(`/api/wall/items/${ready.id}/comments`,'POST',form({body:'عمل جميل'}),member);assert.equal(c1.status,201);assert.equal(c1.data.comment.author,'سارة');
 const c2=await api(`/api/wall/items/${ready.id}/comments`,'POST',form({body:''},{field:'image',data:png1x1,type:'image/png',name:'c.png'}),member);assert.equal(c2.status,201);assert.ok(c2.data.comment.imageUrl);
 assert.equal((await api('/api'+c2.data.comment.imageUrl)).headers.get('content-type'),'image/png');assert.equal(ready.pageUrl,`/wall/items/${ready.id}/pages/`);
 const list=await api(`/api/wall/items/${ready.id}/comments`);assert.equal(list.data.comments.length,2);
 assert.equal((await api(`/api/wall/comments/${c1.data.comment.id}`,'DELETE')).status,403);assert.equal((await api(`/api/wall/comments/${c1.data.comment.id}`,'DELETE',undefined,owner)).status,200);
 const board=await api('/api/wall/boards/'+code,'GET',undefined,member);assert.equal(board.data.items[0].comments,1);
 // الموافقة المسبقة: العمل الجديد لا يراه الآخرون حتى يوافق المدير
 await api('/api/wall/boards/'+code,'PATCH',{settings:{requireApproval:true}},owner);
 const other=(await api('/api/wall/boards/'+code+'/join','POST',{name:'زائر',email:'visitor@example.com'})).data;const otherH={'X-Wall-Member':other.token};
 const pending=await api('/api/wall/boards/'+code+'/items','POST',form({},{field:'file',data:Buffer.from('مرحبا'),type:'text/plain',name:'ملاحظة.txt'}),otherH);assert.equal(pending.data.item.approved,false);
 assert.equal((await api('/api/wall/boards/'+code,'GET',undefined,member)).data.items.some(i=>i.id===pending.data.item.id),false);
 assert.equal((await api('/api/wall/boards/'+code,'GET',undefined,otherH)).data.items.some(i=>i.id===pending.data.item.id),true);
 assert.equal((await api('/api/wall/boards/'+code,'GET',undefined,owner)).data.items.some(i=>i.id===pending.data.item.id),true);
 await api(`/api/wall/items/${pending.data.item.id}/approve`,'POST',{approved:true},owner);
 assert.equal((await api('/api/wall/boards/'+code,'GET',undefined,member)).data.items.some(i=>i.id===pending.data.item.id),true);
 await waitReady(api,code,pending.data.item.id,owner);
 // الدخول يتطلب بريدًا صحيحًا
 assert.equal((await api('/api/wall/boards/'+code+'/join','POST',{name:'بلا بريد'})).status,400);
 assert.equal((await api('/api/wall/boards/'+code+'/join','POST',{name:'س',email:'ليس-بريدًا'})).status,400);
 // رد على تعليق + تفاعلات التعليق
 const base=(await api(`/api/wall/items/${ready.id}/comments`,'POST',form({body:'تعليق أصلي'}),member)).data.comment;
 const reply=await api(`/api/wall/items/${ready.id}/comments`,'POST',form({body:'رد عليه',parent:base.id}),otherH);
 assert.equal(reply.status,201);assert.equal(reply.data.comment.parent,base.id);
 const nested=await api(`/api/wall/items/${ready.id}/comments`,'POST',form({body:'رد على الرد',parent:reply.data.comment.id}),member);
 assert.equal(nested.data.comment.parent,base.id); // مستوى واحد فقط
 const cr=await api(`/api/wall/comments/${base.id}/react`,'POST',{kind:'creative'},otherH);
 assert.deepEqual(cr.data.reactions,{like:0,logical:0,creative:1});
 assert.equal((await api(`/api/wall/comments/${base.id}/react`,'POST',{kind:'creative'},otherH)).data.reactions.creative,0);
 await api(`/api/wall/comments/${base.id}/react`,'POST',{kind:'logical'},otherH);
 const tree=(await api(`/api/wall/items/${ready.id}/comments`,'GET',undefined,otherH)).data.comments;
 const found=tree.find(x=>x.id===base.id);assert.equal(found.replies.length,2);assert.equal(found.reactions.logical,1);assert.equal(found.my.logical,true);
 // استبدال الملف يحافظ على التفاعل ويعيد المعالجة
 assert.equal((await api(`/api/wall/items/${ready.id}/replace`,'POST',form({},{field:'file',data:Buffer.from('نسخة محسنة'),type:'text/plain',name:'تحسين.txt'}),otherH)).status,403);
 const rep=await api(`/api/wall/items/${ready.id}/replace`,'POST',form({},{field:'file',data:Buffer.from('نسخة محسنة من العمل'),type:'text/plain',name:'تحسين.txt'}),member);
 assert.equal(rep.status,200);assert.equal(rep.data.item.kind,'text');
 const ready2=await waitReady(api,code,ready.id,member);assert.equal(ready2.pages,1);assert.ok(ready2.likes>=0);
 // قفل الرفع بموعد
 await api('/api/wall/boards/'+code,'PATCH',{lockAt:new Date(Date.now()-60000).toISOString()},owner);
 assert.equal((await api('/api/wall/boards/'+code+'/items','POST',form({},{field:'file',data:png1x1,type:'image/png',name:'late.png'}),member)).status,409);
 await api('/api/wall/boards/'+code,'PATCH',{lockAt:null},owner);
 assert.equal((await api('/api/wall/boards/'+code)).data.lockAt,null);
 // تصدير الألبوم PDF للمدير فقط
 assert.equal((await api('/api/wall/boards/'+code+'/export.pdf')).status,403);
 const album=await api('/api/wall/boards/'+code+'/export.pdf','GET',undefined,owner);
 assert.equal(album.status,200);assert.equal(album.headers.get('content-type'),'application/pdf');assert.ok(album.data.slice(0,4).toString()==='%PDF');
 // بريد اللوحة: للجميع وبقائمة محددة
 sent.length=0;
 const mailAll=await api('/api/wall/boards/'+code+'/email','POST',{recipients:'all',note:'شكرًا لمشاركتكم'},owner);
 assert.equal(mailAll.data.sent>=2,true);assert.ok(sent.some(m=>m.to==='sara@example.com'));
 // الحاضرون الآن: نجعل الجميع غائبين إلا سارة
 await h.pool.query("UPDATE wall_members SET last_seen_at=now()-interval '1 hour' WHERE board_id=(SELECT id FROM wall_boards WHERE code=$1) AND email<>'sara@example.com'",[code]);
 sent.length=0;const online=await api('/api/wall/boards/'+code+'/email','POST',{recipients:'online'},owner);
 assert.deepEqual({sent:online.data.sent,total:online.data.total},{sent:1,total:1});assert.equal(sent[0].to,'sara@example.com');
 // إرسال عمل محدد إلى إيميل محدد
 sent.length=0;const one=await api('/api/wall/boards/'+code+'/email','POST',{recipients:'list',emails:['target@example.com'],itemId:ready2.id,note:'شاهد هذا'},owner);
 assert.equal(one.data.sent,1);assert.match(sent[0].subject,/من لوحة/);assert.ok(sent[0].text.includes('w='+ready2.id));
 assert.equal((await api('/api/wall/boards/'+code+'/email','POST',{recipients:'list',emails:['x@example.com'],itemId:crypto.randomUUID()},owner)).status,404);
 const mailList=await api('/api/wall/boards/'+code+'/email','POST',{recipients:'list',emails:['one@example.com','bad','one@example.com']},owner);
 assert.deepEqual({sent:mailList.data.sent,total:mailList.data.total},{sent:1,total:1});
 // الحذف: صاحب العمل أو المدير فقط؛ والخروج يبطل الجلسة
 assert.equal((await api(`/api/wall/items/${ready.id}`,'DELETE',undefined,otherH)).status,403);
 assert.equal((await api(`/api/wall/items/${ready.id}`,'DELETE',undefined,member)).status,200);
 assert.equal((await api('/api/wall/boards/'+code+'/leave','POST',{},member)).status,200);
 assert.equal((await api('/api/wall/boards/'+code,'GET',undefined,member)).data.me,null);
 // استرجاع مفتاح الإدارة: فقط لبريد المالك، ويُبطل المفتاح القديم
 sent.length=0;await api('/api/wall/boards/'+code+'/recover','POST',{email:'someone@else.test'});assert.equal(sent.length,0);
 await api('/api/wall/boards/'+code+'/recover','POST',{email:'owner@example.com'});assert.equal(sent.length,1);
 assert.equal((await api('/api/wall/boards/'+code,'GET',undefined,owner)).data.isOwner,false);
 const newKey=sent[0].text.match(/key=([a-f0-9]{64})/)[1];assert.equal((await api('/api/wall/boards/'+code,'GET',undefined,{'X-Wall-Key':newKey})).data.isOwner,true);
 const qr=await api('/api/wall/boards/'+code+'/qr');assert.equal(qr.headers.get('content-type'),'image/png');
 assert.equal((await api('/api/wall/boards/zzzzzzzz')).status,404);
});
