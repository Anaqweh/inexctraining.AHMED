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
