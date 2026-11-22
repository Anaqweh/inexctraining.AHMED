import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../../admin-external-links.js',import.meta.url),'utf8'),page=readFileSync(new URL('../../download.html',import.meta.url),'utf8'),portal=readFileSync(new URL('../../admin-portal.html',import.meta.url),'utf8'),tick=()=>new Promise(r=>setTimeout(r,0));
const record={id:'12345678-1234-1234-1234-123456789abc',slug:'uae-2031',title:'<b>ملخص</b> 2031',description:'',file_name:'summary.pdf',size_bytes:3145728,views:4,downloads:2,active:true};
async function harness(t,handler){
 const dom=new JSDOM('<head></head><body><section id="app"><main><div class="tabs"><button class="active" data-view="old"></button></div><section class="view active" id="old"></section></main></section></body>',{url:'https://www.inexctraining.com/admin-portal.html',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window,calls=[];w.INEXC_REGISTRATION_ENDPOINT='https://api.example.invalid/api';let valid=true;w.INEXCAdminSession={valid:()=>valid};w.sessionStorage.setItem('inexc_do_admin','LOCAL');w.confirm=()=>true;w.AbortSignal=AbortSignal;
 w.fetch=async(url,init)=>{calls.push({url,init});const result=handler?await handler(url,init):{version:1,maxMb:300,items:[record]};return {ok:!result.error,status:result.status||(result.error?409:200),json:async()=>result}};
 w.eval(source);await tick();const q=s=>w.document.querySelector(s);
 return {w,calls,q,open:async()=>{q('.tabs button[data-view="external-links"]').click();await tick();await tick()},lock:()=>{valid=false;w.dispatchEvent(new w.Event('inexc:locked'))}};
}
test('admin portal loads the section script before the shell',()=>{const a=portal.indexOf('admin-external-links.js'),b=portal.indexOf('admin-shell.js');assert.ok(a>0&&a<b)});
test('section mounts its own tab and view without touching existing ones',async t=>{
 const h=await harness(t);assert.equal(h.q('.tabs button[data-view="external-links"]').textContent,'الروابط الخارجية');assert.ok(h.q('#external-links.view'));assert.equal(h.calls.length,0);
 assert.ok(h.q('#old').classList.contains('active'));assert.equal(h.w.document.querySelectorAll('.tabs button').length,2);
});
test('opening the section lists files with escaped titles, site links and counters',async t=>{
 const h=await harness(t);await h.open();
 assert.equal(h.calls[0].url,'https://api.example.invalid/api/admin/external-links');assert.equal(h.calls[0].init.headers.Authorization,'Bearer LOCAL');
 assert.ok(h.q('#external-links').classList.contains('active'));assert.ok(!h.q('#old').classList.contains('active'));
 const card=h.q('[data-xl-id]');assert.equal(card.querySelector('strong').textContent,'<b>ملخص</b> 2031');assert.equal(card.querySelector('strong b'),null);
 assert.equal(card.querySelector('.xl-link input').value,'https://www.inexctraining.com/download.html?f=uae-2031');
 assert.match(card.querySelector('.xl-file').textContent,/summary\.pdf · 3\.0 ميجابايت/);assert.match(card.querySelector('.xl-stats').textContent,/4.*2/s);
 assert.equal(h.q('[data-xl-submit]').disabled,false);assert.match(h.q('[data-xl-limit]').textContent,/300/);
});
test('pause and delete call only the external-links endpoints',async t=>{
 const h=await harness(t,(url,init)=>init?.method==='PUT'?{...record,active:false}:init?.method==='DELETE'?{ok:true}:{version:1,maxMb:300,items:[record]});await h.open();
 h.q('[data-xl-toggle]').click();await tick();await tick();assert.equal(h.calls[1].init.method,'PUT');assert.equal(JSON.parse(h.calls[1].init.body).active,false);assert.equal(h.q('.xl-tag').textContent,'موقوف');
 h.q('[data-xl-delete]').click();await tick();await tick();assert.equal(h.calls[2].init.method,'DELETE');assert.equal(h.q('[data-xl-id]'),null);
 for(const call of h.calls)assert.ok(call.url.startsWith('https://api.example.invalid/api/admin/external-links'));
});
test('server without the update shows a clear notice and locking clears the list',async t=>{
 const h=await harness(t,()=>({error:'x',status:404}));await h.open();assert.match(h.q('[data-xl-notice]').textContent,/تحديث الخادم/);assert.equal(h.q('[data-xl-submit]').disabled,true);
 const g=await harness(t);await g.open();assert.ok(g.q('[data-xl-id]'));g.lock();assert.equal(g.q('[data-xl-id]'),null);assert.equal(g.q('[data-xl-submit]').disabled,true);
});
async function visit(t,search,handler){
 const dom=new JSDOM(page.replace('<script src="/inexc-registration-config.js"></script>',''),{url:'https://www.inexctraining.com/download.html'+search,runScripts:'dangerously',beforeParse(w){w.INEXC_REGISTRATION_ENDPOINT='https://api.example.invalid/api';w.fetch=async url=>{w.__url=url;const r=await handler(url);return {ok:r.status===200,status:r.status,json:async()=>r.body}}}});
 t.after(()=>dom.window.close());await tick();await tick();await tick();return dom.window;
}
test('download page shows the file and points the button at the counted file route',async t=>{
 const w=await visit(t,'?f=UAE-2031',async()=>({status:200,body:{slug:'uae-2031',title:'ملخص <i>2031</i>',description:'',fileName:'summary.pdf',sizeBytes:2048}}));
 assert.equal(w.__url,'https://api.example.invalid/api/external-links/uae-2031');assert.equal(w.document.querySelector('[data-dl-ready]').hidden,false);
 assert.equal(w.document.querySelector('[data-dl-title]').textContent,'ملخص <i>2031</i>');assert.equal(w.document.querySelector('[data-dl-title] i'),null);
 assert.equal(w.document.querySelector('[data-dl-button]').href,'https://api.example.invalid/api/external-links/uae-2031/file');assert.match(w.document.querySelector('[data-dl-file]').textContent,/summary\.pdf · 2 كيلوبايت/);
});
test('download page reports missing or malformed links without calling the server for bad names',async t=>{
 const missing=await visit(t,'?f=gone',async()=>({status:404,body:{}}));assert.equal(missing.document.querySelector('[data-dl-error]').hidden,false);assert.equal(missing.document.querySelector('[data-dl-ready]').hidden,true);
 const bad=await visit(t,'?f=../x',async()=>({status:200,body:{}}));assert.equal(bad.__url,undefined);assert.equal(bad.document.querySelector('[data-dl-error]').hidden,false);
});

test('admin quiz editor parses the text format, saves through PUT and reports format errors',async t=>{
 const withQuiz={...record,badges:3,quiz:[{q:'ما الهدف؟',options:['أ','ب'],answer:1}, {q:'ثانٍ؟',options:['ج','د','هـ'],answer:0}]};
 const h=await harness(t,(url,init)=>init?.method==='PUT'?{...withQuiz,quiz:JSON.parse(init.body).quiz}:{version:1,maxMb:300,items:[withQuiz]});
 h.w.HTMLDialogElement.prototype.showModal=function(){this.open=true};h.w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new h.w.Event('close'))};await h.open();
 assert.match(h.q('[data-xl-quiz]').textContent,/\(2\)/);assert.match(h.q('.xl-stats').textContent,/3\s*إفادة/);
 h.q('[data-xl-quiz]').click();const area=h.q('[data-xl-quiz-text]');assert.equal(area.value,'ما الهدف؟\n- أ\n* ب\n\nثانٍ؟\n* ج\n- د\n- هـ');
 area.value='سؤال بلا إجابة\n- أ\n- ب\n\nثانٍ\n* ج\n- د';h.q('[data-xl-quiz-save]').click();await tick();assert.match(h.q('[data-xl-dialog-error]').textContent,/السؤال 1.*\*/);assert.equal(h.calls.length,1);
 area.value='س1: أول؟\n* نعم\n- لا\n\n2. ثانٍ؟\n- لا\n* نعم\n- ربما';h.q('[data-xl-quiz-save]').click();await tick();await tick();
 const sent=JSON.parse(h.calls[1].init.body);assert.deepEqual(sent.quiz,[{q:'أول؟',options:['نعم','لا'],answer:0},{q:'ثانٍ؟',options:['لا','نعم','ربما'],answer:1}]);assert.equal(sent.active,true);assert.equal(h.q('.xl-dialog').open,false);
 assert.match(h.q('.xl-stats').textContent,/3\s*إفادة/);
});
test('admin lists badge holders with escaped names',async t=>{
 const h=await harness(t,url=>url.endsWith('/badges')?{version:1,items:[{code:'INX-ABCDEFGH',name:'<i>سارة</i>',phone:'+971501234567',created_at:'2026-11-23T00:00:00Z'}]}:{version:1,maxMb:300,items:[record]});
 h.w.HTMLDialogElement.prototype.showModal=function(){this.open=true};h.w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new h.w.Event('close'))};await h.open();
 h.q('[data-xl-badges]').click();await tick();await tick();assert.ok(h.calls[1].url.endsWith('/admin/external-links/'+record.id+'/badges'));
 const row=h.q('.xl-table tbody tr');assert.equal(row.children[0].textContent,'<i>سارة</i>');assert.equal(row.querySelector('i'),null);assert.equal(row.children[1].textContent,'+971501234567');
});
async function journey(t,responses){
 const dom=new JSDOM(page.replace('<script src="/inexc-registration-config.js"></script>',''),{url:'https://www.inexctraining.com/download.html?f=uae-2031',runScripts:'dangerously',beforeParse(w){w.scrollTo=()=>{};w.__calls=[];w.INEXC_REGISTRATION_ENDPOINT='https://api.example.invalid/api';w.fetch=async(url,init)=>{w.__calls.push({url,body:init?.body?JSON.parse(init.body):null});const r=await responses(url,init,w.__calls.length);return {ok:(r.status||200)<300,status:r.status||200,json:async()=>r.body}}}});
 t.after(()=>dom.window.close());await tick();await tick();await tick();const w=dom.window;return {w,q:s=>w.document.querySelector(s),visible:name=>!w.document.querySelector('[data-dl-'+name+']').hidden};
}
const info={slug:'uae-2031',title:'ملخص 2031',description:'',fileName:'s.pdf',sizeBytes:10,quizCount:2,passMark:1};
const questions={title:'ملخص 2031',passMark:1,questions:[{q:'<b>أول</b>؟',options:['أ','ب']},{q:'ثانٍ؟',options:['ج','د']}]};
test('visitor shares, fails, retries, passes and receives a badge with PDF and share links',async t=>{
 let attempt=0;const h=await journey(t,async(url,init)=>{
  if(url.endsWith('/share'))return {body:{ok:true}};if(url.endsWith('/quiz'))return {body:questions};
  if(url.endsWith('/badge')){const data=JSON.parse(init.body);if(data.name)return {status:201,body:{passed:true,badge:{code:'INX-ABCDEFGH',name:data.name,title:'ملخص 2031',date:'23 / 11 / 2026'}}};return {body:{passed:++attempt>1}}}
  return {body:info}});
 assert.ok(h.visible('ready'));assert.equal(h.q('[data-dl-quiz-intro]').hidden,false);
 const share=new URL(h.q('[data-dl-share]').href);assert.equal(share.host,'wa.me');assert.match(share.searchParams.get('text'),/ملخص 2031\nhttps:\/\/www\.inexctraining\.com\/download\.html\?f=uae-2031$/);
 h.q('[data-dl-share]').addEventListener('click',e=>e.preventDefault());h.q('[data-dl-share]').click();await tick();assert.ok(h.w.__calls.some(c=>c.url.endsWith('/external-links/uae-2031/share')));
 h.q('[data-dl-quiz-start]').click();await tick();await tick();assert.ok(h.visible('quiz'));assert.equal(h.q('.dl-q').textContent,'<b>أول</b>؟');assert.equal(h.q('.dl-q b'),null);
 const submit=()=>h.q('[data-dl-quiz-form]').dispatchEvent(new h.w.Event('submit',{cancelable:true,bubbles:true}));
 submit();await tick();assert.match(h.q('[data-dl-quiz-msg]').textContent,/السؤال رقم 1/);
 h.q('input[name=q0][value="1"]').checked=true;h.q('input[name=q1][value="0"]').checked=true;submit();await tick();await tick();
 assert.match(h.q('[data-dl-quiz-msg]').textContent,/لم تجتز/);assert.ok(h.visible('quiz'));assert.doesNotMatch(h.w.document.body.textContent,/\d\s*من\s*\d/);
 submit();await tick();await tick();assert.ok(h.visible('person'));
 h.q('[name=name]').value='سارة علي';h.q('[name=phone]').value='+971501234567';h.q('[data-dl-person-form]').dispatchEvent(new h.w.Event('submit',{cancelable:true,bubbles:true}));await tick();await tick();
 const last=h.w.__calls.at(-1);assert.deepEqual(last.body,{answers:[1,0],name:'سارة علي',phone:'+971501234567'});
 assert.ok(h.visible('badge'));assert.equal(h.q('[data-dl-badge-name]').textContent,'سارة علي');assert.equal(h.q('[data-dl-badge-code]').textContent,'INX-ABCDEFGH');assert.match(h.q('.dl-badge-grade').textContent,/التقدير: ناجح/);
 assert.equal(h.q('[data-dl-badge-pdf]').href,'https://api.example.invalid/api/external-badges/INX-ABCDEFGH/pdf');assert.equal(h.w.location.search,'?b=INX-ABCDEFGH');
 assert.equal(new URL(h.q('[data-dl-badge-linkedin]').href).searchParams.get('url'),'https://www.inexctraining.com/download.html?b=INX-ABCDEFGH');
});
test('a file without questions shows no assessment, and a badge link opens the badge directly',async t=>{
 const plain=await journey(t,async()=>({body:{...info,quizCount:0}}));assert.ok(plain.visible('ready'));assert.equal(plain.q('[data-dl-quiz-intro]').hidden,true);
 const dom=new JSDOM(page.replace('<script src="/inexc-registration-config.js"></script>',''),{url:'https://www.inexctraining.com/download.html?b=inx-abcdefgh',runScripts:'dangerously',beforeParse(w){w.scrollTo=()=>{};w.INEXC_REGISTRATION_ENDPOINT='https://api.example.invalid/api';w.fetch=async url=>{w.__url=url;return {ok:true,status:200,json:async()=>({code:'INX-ABCDEFGH',name:'سارة علي',title:'ملخص 2031',date:'23 / 11 / 2026'})}}}});
 t.after(()=>dom.window.close());await tick();await tick();await tick();assert.equal(dom.window.__url,'https://api.example.invalid/api/external-badges/INX-ABCDEFGH');assert.equal(dom.window.document.querySelector('[data-dl-badge]').hidden,false);assert.equal(dom.window.document.querySelector('[data-dl-badge-title]').textContent,'ملخص 2031');
});
