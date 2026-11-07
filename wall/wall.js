/* حائط الأعمال — واجهة اللوحة: إنشاء لوحة، دخول المتدرب بالاسم، رفع الأعمال وعرضها مختومة، التعليقات والتفاعل، ولوحة المدير. */
(()=>{
const API=(window.INEXC_REGISTRATION_ENDPOINT||'https://api.inexctraining.com/api').replace(/\/$/,'');
const $=id=>document.getElementById(id);
const qs=new URLSearchParams(location.search);
const code=String(qs.get('b')||'').toLowerCase();
const store={get(k){try{return localStorage.getItem(k)}catch{return null}},set(k,v){try{localStorage.setItem(k,v)}catch{}},del(k){try{localStorage.removeItem(k)}catch{}}};
const KEY_ME='wall-me-'+code,KEY_ADMIN='wall-admin-'+code;
if(code&&/^[a-f0-9]{64}$/.test(qs.get('key')||'')){store.set(KEY_ADMIN,qs.get('key'));qs.delete('key');history.replaceState(null,'',location.pathname+'?'+qs.toString())}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hue=n=>{let h=0;for(const ch of String(n))h=(h*31+ch.codePointAt(0))%360;return h};
const colorOf=n=>`hsl(${hue(n)} 62% 38%)`;
const icons={image:'🖼️',pdf:'📄',office:'📊',text:'📝',video:'🎬',audio:'🎧',other:'📦'};
const kindLabel={image:'صورة',pdf:'PDF',office:'مستند',text:'نص',video:'فيديو',audio:'صوت',other:'ملف'};
const settingLabels={uploadsOpen:'الرفع مفتوح',comments:'التعليقات',reactions:'التفاعل (أعجبني / يستحق التطوير)',requireApproval:'موافقة المدير قبل الظهور',stamp:'ختم توقيع التميز تلقائيًا',allowDownload:'السماح بتنزيل الملف الأصلي',closed:'إغلاق اللوحة بالكامل'};
const say=(m,ms=2600)=>{const t=$('toast');t.textContent=m;t.classList.add('show');clearTimeout(say.t);say.t=setTimeout(()=>t.classList.remove('show'),ms)};
const state={board:null,items:[],me:null,token:'',admin:store.get(KEY_ADMIN)||'',afterJoin:null,pollTimer:null};
try{const saved=JSON.parse(store.get(KEY_ME)||'null');if(saved?.token){state.token=saved.token;state.me=saved.me}}catch{}
const headers=()=>{const h={};if(state.token)h['X-Wall-Member']=state.token;if(state.admin)h['X-Wall-Key']=state.admin;return h};
async function api(path,{method='GET',body,form}={}){
 const init={method,headers:headers()};
 if(form)init.body=form;else if(body!==undefined){init.headers['Content-Type']='application/json';init.body=JSON.stringify(body)}
 const r=await fetch(API+path,init);let data=null;try{data=await r.json()}catch{}
 if(!r.ok)throw Object.assign(new Error(data?.error||'تعذّر الاتصال بالخادم. حاول مجددًا.'),{status:r.status});
 return data;
}

/* ——— إنشاء لوحة ——— */
function initCreate(){
 $('create-view').hidden=false;document.title='إنشاء لوحة أعمال | INEXC Training';
 let mode='single';const seg=m=>{mode=m;for(const k of ['single','groups','both'])$('c-'+k).setAttribute('aria-pressed',String(m===k));$('c-groups-wrap').hidden=m==='single'};
 for(const k of ['single','groups','both'])$('c-'+k).addEventListener('click',()=>seg(k));
 $('create-form').addEventListener('submit',async e=>{
  e.preventDefault();const st=$('c-status');st.className='status';st.textContent='جارٍ إنشاء اللوحة…';$('c-go').disabled=true;
  try{
   const groups=$('c-groups-names').value.split(/[،,\n]/).map(s=>s.trim()).filter(Boolean);
   const r=await api('/wall/boards',{method:'POST',body:{title:$('c-title').value.trim(),email:$('c-email').value.trim(),mode,groups:mode!=='single'&&groups.length>=2?groups:undefined,website:$('c-website').value}});
   st.textContent='';const ok=$('c-ok');ok.hidden=false;
   ok.innerHTML=`<h2>تم إنشاء اللوحة ✓</h2>${r.emailed?`<p>أرسلنا <b>رابط الإدارة</b> إلى <span dir="ltr">${esc($('c-email').value.trim())}</span>. افتحه من بريدك لتدخل كمدير وتضبط الإعدادات.</p>`:`<p>البريد غير مفعّل على الخادم حاليًا؛ هذا رابط الإدارة — احفظه ولا تشاركه:</p><p class="share"><code>${esc(r.adminUrl)}</code></p>`}<p>رابط المشاركة مع المتدربين:</p><div class="share"><code id="c-share">${esc(r.url)}</code><button type="button" id="c-copy">نسخ</button></div><p style="margin-top:12px"><a href="${esc(r.url)}">افتح اللوحة الآن ←</a></p>`;
   $('c-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(r.url);say('🔗 نُسخ الرابط')}catch{say(r.url,5000)}});
   ok.scrollIntoView({behavior:'smooth',block:'center'});
  }catch(err){st.className='status err';st.textContent=err.message}finally{$('c-go').disabled=false}
 });
}

/* ——— اللوحة ——— */
async function load(){
 try{const b=await api('/wall/boards/'+code);state.board=b;state.me=b.me;if(!b.me&&state.token){state.token='';store.del(KEY_ME)}if(!b.isOwner&&state.admin&&qs.has('b')){/* مفتاح قديم */}render();schedulePoll()}
 catch(err){$('b-status').className='status err';$('b-status').textContent=err.status===404?'هذه اللوحة غير موجودة أو حُذفت.':err.message;$('board').innerHTML=''}
}
function schedulePoll(){clearTimeout(state.pollTimer);const busy=state.board?.items.some(i=>i.status==='processing');state.pollTimer=setTimeout(()=>{if(document.visibilityState==='visible')load();else schedulePoll()},busy?4000:25000)}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&code)load()});
function render(){
 const b=state.board;document.title=b.title+' | حائط الأعمال';$('b-title').textContent=b.title;
 $('c-works').textContent=b.items.length;paintLock(b);$('c-people').textContent=b.members;$('c-state').textContent=b.settings.closed?'مغلقة':b.settings.uploadsOpen?'الرفع مفتوح':'الرفع متوقف';
 $('who-bar').hidden=!state.me;if(state.me)$('who-name').textContent=state.me.name;
 $('enter').hidden=!!state.me;$('upload-btn').hidden=!(state.me&&b.settings.uploadsOpen&&!b.settings.closed);
 $('b-status').className='status';$('b-status').textContent=b.settings.closed?'أغلق مدير اللوحة الدخول إليها حاليًا.':(!state.me?'ادخل باسمك لتتمكن من رفع عملك والتعليق على الأعمال.':'');
 renderAdmin();
 const liked=[...b.items].filter(i=>i.likes>0).sort((x,y)=>y.likes-x.likes)[0];state.topId=liked?liked.id:null;
 const board=$('board');board.replaceChildren();board.classList.toggle('single',b.mode==='single');state.items=[];
 const cols=b.mode==='single'?[{name:'حائط الدفعة',index:0}]:[...(b.mode==='both'?[{name:'أعمال فردية',index:-1}]:[]),...b.groups.map((g,i)=>({name:g,index:i}))];
 for(const c of cols){
  const items=b.items.filter(it=>b.mode==='single'||it.group===c.index);
  const col=document.createElement('div');col.className='col';col.innerHTML=`<h2>${esc(c.name)} <small>${items.length} ${items.length===1?'عمل':'أعمال'}</small></h2><div class="cards"></div>`;
  const cards=col.querySelector('.cards');
  for(const it of items){const idx=state.items.push(it)-1;cards.append(cardEl(it,idx))}
  if(b.settings.uploadsOpen&&!b.settings.closed){const add=document.createElement('button');add.type='button';add.className='add';add.innerHTML=`<span>+</span><b>ارفع عملك</b><i>العمل رقم ${String(b.items.length+1).padStart(2,'0')} في المعرض</i><em>PDF · Word · PowerPoint · صور · فيديو — يُختم تلقائيًا بتوقيع التميز</em>`;add.addEventListener('click',()=>startUpload(c.index));cards.append(add)}
  else if(!items.length)cards.innerHTML='<p class="empty">لا أعمال بعد.</p>';
  board.append(col);
 }
 if(qs.get('w')&&!render.opened){const i=state.items.findIndex(x=>x.id===qs.get('w'));if(i>=0){render.opened=true;openViewer(i)}}
}
function cardEl(it,idx){
 const el=document.createElement('article');el.className='card'+(it.mine?' mine':'')+(it.pages>1?' stack':'');el.style.setProperty('--pc',colorOf(it.author));el.tabIndex=0;
 const thumb=it.status==='ready'&&it.pages>0?`<img loading="lazy" alt="" src="${API}${it.pageUrl}1">`:`<span class="ico">${icons[it.kind]||icons.other}</span><span class="fname"><bdi>${esc(it.fileName)}</bdi></span>`;
 const badge=it.status==='processing'?'<span class="badge warn">جارٍ تجهيز الصفحات…</span>':it.status==='failed'?'<span class="badge bad">تعذّر تحويل الملف</span>':!it.approved?'<span class="badge warn">بانتظار اعتماد المدير</span>':'';
 const top=state.topId===it.id?'<span class="badge star">الأكثر إعجابًا</span>':'';
 const no=String(state.board.items.length-state.board.items.indexOf(it)).padStart(2,'0');
 el.innerHTML=`<div class="thumb">${thumb}<span class="open">افتح العمل</span></div>${badge||top||(it.mine?'<span class="badge me">عملك</span>':'')}<span class="no" dir="ltr">№ ${no}</span><div class="meta"><b>${esc(it.author)}</b><span class="ttl"><bdi>${esc(it.title)}</bdi></span><small><span>${metaOf(it)}</span><span>👍 ${it.likes} &nbsp; 💬 ${it.comments}</span></small></div>`;
 el.addEventListener('click',()=>openViewer(idx));el.addEventListener('keydown',e=>{if(e.key==='Enter')openViewer(idx)});return el;
}
async function downloadFile(url,filename){
 try{say('جارٍ تجهيز التنزيل…',8000);const r=await fetch(API+url,{headers:headers()});if(!r.ok)throw 0;
  const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),30000);say('✓ بدأ التنزيل');}
 catch(e){window.open(API+url,'_blank','noopener')}
}
const metaOf=it=>it.pages>1?`${it.pages} صفحة`:it.pages===1?'صفحة واحدة':kindLabel[it.kind]||'ملف';

let lockTimer=null;
function paintLock(b){
 clearInterval(lockTimer);let line=document.getElementById('lockline');
 if(!b.lockAt){line?.remove();return}
 if(!line){line=document.createElement('span');line.id='lockline';line.className='lockline';document.querySelector('.counts').append(line)}
 const tick=()=>{const ms=new Date(b.lockAt)-Date.now();
  if(ms<=0){line.className='lockline closed';line.textContent='أُغلق رفع الأعمال في هذه اللوحة';clearInterval(lockTimer);return}
  const d=Math.floor(ms/864e5),hh=Math.floor(ms%864e5/36e5),mm=Math.floor(ms%36e5/6e4);
  line.className='lockline';line.innerHTML='';line.append('يُغلق الرفع بعد ');const bEl=document.createElement('b');bEl.textContent=(d?d+' يوم ':'')+(hh?hh+' ساعة ':'')+mm+' دقيقة';line.append(bEl)};
 tick();lockTimer=setInterval(tick,30000);
}
/* ——— المدير ——— */
async function patch(body){try{const b=await api('/wall/boards/'+code,{method:'PATCH',body});state.board=b;render();say('✓ حُفظت الإعدادات')}catch(err){say(err.message,4000)}}
function renderAdmin(){
 const b=state.board,a=$('admin');a.hidden=!b.isOwner;if(!b.isOwner)return;
 const chips=$('admin-chips');chips.replaceChildren();
 for(const [k,label] of Object.entries(settingLabels)){const c=document.createElement('button');c.type='button';c.className='chip';c.textContent=(b.settings[k]?'● ':'○ ')+label;c.setAttribute('aria-pressed',String(!!b.settings[k]));c.addEventListener('click',()=>patch({settings:{[k]:!b.settings[k]}}));chips.append(c)}
 for(const k of ['single','groups','both'])$('a-'+k).setAttribute('aria-pressed',String(b.mode===k));
 $('a-groups-row').hidden=b.mode==='single';if(document.activeElement!==$('a-groups-names'))$('a-groups-names').value=b.groups.join('، ');
 if(document.activeElement!==$('a-title'))$('a-title').value=b.title;

 const la=$('a-lock');if(document.activeElement!==la)la.value=b.lockAt?new Date(new Date(b.lockAt).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'';
 $('a-lock-clear').hidden=!b.lockAt;
 $('a-qr').src=`${API}/wall/boards/${code}/qr`;$('a-link').textContent=b.url;$('a-email').textContent=b.ownerEmail||'';
}
function initAdmin(){
 $('a-present').addEventListener('click',startShow);
 $('a-export').addEventListener('click',()=>downloadFile(`/wall/boards/${code}/export.pdf`,`${state.board.title} - الألبوم.pdf`));
 $('a-lock-save').addEventListener('click',()=>{const v=$('a-lock').value;if(!v)return say('اختر التاريخ والوقت أولًا');patch({lockAt:new Date(v).toISOString()})});
 $('a-lock-clear').addEventListener('click',()=>patch({lockAt:null}));
 let mMode='all';const seg=m=>{mMode=m;$('m-all').setAttribute('aria-pressed',String(m==='all'));$('m-custom').setAttribute('aria-pressed',String(m==='custom'));$('m-emails').hidden=m!=='custom'};
 $('m-all').addEventListener('click',()=>seg('all'));$('m-custom').addEventListener('click',()=>seg('custom'));
 $('m-send').addEventListener('click',async()=>{
  const body={recipients:mMode==='all'?'all':'list',note:$('m-note').value.trim()};
  if(mMode==='custom')body.emails=$('m-emails').value.split(/[،,;\s]+/).filter(Boolean);
  $('m-send').disabled=true;
  try{const r=await api(`/wall/boards/${code}/email`,{method:'POST',body});say(`✓ أُرسل البريد إلى ${r.sent} من ${r.total}`,5000)}catch(err){say(err.message,5000)}finally{$('m-send').disabled=false}});

 $('a-single').addEventListener('click',()=>patch({mode:'single'}));
 for(const k of ['groups','both'])$('a-'+k).addEventListener('click',()=>{const groups=$('a-groups-names').value.split(/[،,\n]/).map(s=>s.trim()).filter(Boolean);patch({mode:k,groups:groups.length>=2?groups:undefined})});
 $('a-groups-save').addEventListener('click',()=>{const groups=$('a-groups-names').value.split(/[،,\n]/).map(s=>s.trim()).filter(Boolean);if(groups.length<2)return say('أضف مجموعتين على الأقل');patch({groups})});
 $('a-title-save').addEventListener('click',()=>patch({title:$('a-title').value.trim()}));
 $('a-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(state.board.url);say('🔗 نُسخ رابط المتدربين')}catch{say(state.board.url,5000)}});
 $('recover').addEventListener('click',async e=>{e.preventDefault();const email=prompt('اكتب بريد مدير اللوحة لإرسال رابط إدارة جديد:');if(!email)return;try{const r=await api(`/wall/boards/${code}/recover`,{method:'POST',body:{email:email.trim()}});say(r.adminUrl?'هذا رابط الإدارة: '+r.adminUrl:'إن كان البريد صحيحًا فقد وصله رابط إدارة جديد ✓',6000)}catch(err){say(err.message,4000)}});
}

/* ——— الدخول والخروج ——— */
function groupPicker(container,b,selected,onPick){
 const opts=[...(b.mode==='both'?[{name:'فردي — بلا مجموعة',index:-1}]:[]),...b.groups.map((name,i)=>({name,index:i}))];
 for(const o of opts){const btn=document.createElement('button');btn.type='button';btn.textContent=o.name;btn.dataset.index=o.index;btn.setAttribute('aria-pressed',String(o.index===selected));btn.addEventListener('click',()=>{onPick(o.index);container.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(Number(x.dataset.index)===o.index)))});container.append(btn)}
}
const jd=$('join-dialog');let joinGroup=0;
function openJoin(after){
 const b=state.board;state.afterJoin=after||null;$('join-sub').textContent=b.title;
 const wrap=$('join-groups-wrap');wrap.hidden=b.mode==='single';const g=$('join-groups');g.replaceChildren();joinGroup=b.mode==='both'?-1:0;
 if(b.mode!=='single')groupPicker(g,b,joinGroup,v=>joinGroup=v);
 jd.showModal();setTimeout(()=>$('join-name').focus(),50);
}
$('join-form').addEventListener('submit',async e=>{
 e.preventDefault();const name=$('join-name').value.trim(),email=$('join-email').value.trim();if(!name||!email)return;$('join-go').disabled=true;
 try{const r=await api(`/wall/boards/${code}/join`,{method:'POST',body:{name,email,group:joinGroup}});state.token=r.token;state.me=r.me;store.set(KEY_ME,JSON.stringify({token:r.token,me:r.me}));jd.close();say(`أهلًا ${r.me.name} ✨`);await load();const f=state.afterJoin;state.afterJoin=null;if(f)f()}
 catch(err){say(err.message,4000)}finally{$('join-go').disabled=false}
});
$('enter').addEventListener('click',()=>openJoin());
$('logout').addEventListener('click',async()=>{try{await api(`/wall/boards/${code}/leave`,{method:'POST',body:{}})}catch{}state.token='';state.me=null;store.del(KEY_ME);say('خرجت من الحائط. إلى اللقاء 👋');load()});
jd.addEventListener('click',e=>{if(e.target===jd)jd.close()});

/* ——— الرفع ——— */
const ud=$('up-dialog'),upFile=$('up-file');let upGroup=0,upBusy=false;
function startUpload(gi){
 if(!state.me)return openJoin(()=>startUpload(gi));
 const b=state.board;if(!b.settings.uploadsOpen||b.settings.closed)return say('الرفع متوقف حاليًا');
 upGroup=Number.isInteger(gi)?gi:(Number.isInteger(state.me.group)?state.me.group:0);$('up-as').textContent=`سيظهر العمل باسم: ${state.me.name}`;
 const wrap=$('up-groups-wrap');wrap.hidden=b.mode==='single';const g=$('up-groups');g.replaceChildren();
 if(b.mode!=='single')groupPicker(g,b,upGroup,v=>upGroup=v);
 upFile.value='';$('up-title-in').value='';$('up-preview').hidden=true;$('up-go').disabled=true;$('up-bar').hidden=true;$('up-status').textContent='';ud.showModal();
}
$('upload-btn').addEventListener('click',()=>startUpload());
upFile.addEventListener('change',()=>{const f=upFile.files[0];if(!f)return;const kind=kindOf(f);$('up-preview').innerHTML=`<div class="fico">${icons[kind]}</div><div><b><bdi>${esc(f.name)}</bdi></b><small>${kindLabel[kind]} · ${(f.size/1024/1024).toFixed(2)} MB · ${f.size>25*1024*1024?'<span style="color:#b00">أكبر من الحد المسموح (25 MB)</span>':'سيُحوَّل ويُختم تلقائيًا'}</small></div>`;$('up-preview').hidden=false;$('up-go').disabled=f.size>25*1024*1024});
function kindOf(f){const n=f.name.toLowerCase(),m=f.type;if(/^image\//.test(m))return 'image';if(m==='application/pdf'||n.endsWith('.pdf'))return 'pdf';if(/\.(docx?|pptx?|xlsx?|odt|odp|ods|rtf|csv)$/.test(n))return 'office';if(/^video\//.test(m))return 'video';if(/^audio\//.test(m))return 'audio';if(/^text\//.test(m)||/\.(txt|md|json|html?|css|js|xml)$/.test(n))return 'text';return 'other'}
$('up-form').addEventListener('submit',e=>{
 e.preventDefault();const f=upFile.files[0];if(!f||upBusy)return;upBusy=true;$('up-go').disabled=true;$('up-bar').hidden=false;const bar=$('up-bar').querySelector('i');$('up-status').textContent='جارٍ الرفع…';
 const fd=new FormData();fd.append('title',$('up-title-in').value.trim());fd.append('group',String(upGroup));fd.append('file',f,f.name);
 const x=new XMLHttpRequest();x.open('POST',`${API}/wall/boards/${code}/items`);for(const [k,v] of Object.entries(headers()))x.setRequestHeader(k,v);
 x.upload.onprogress=ev=>{if(ev.lengthComputable)bar.style.width=Math.round(ev.loaded/ev.total*100)+'%'};
 x.onload=async()=>{upBusy=false;let data=null;try{data=JSON.parse(x.responseText)}catch{}
  if(x.status===201){bar.style.width='100%';ud.close();say(data.item.status==='processing'?'✓ وصل عملك — جارٍ تجهيز صفحاته المختومة…':'✓ نُشر عملك على الحائط',3500);await load();document.querySelector('.card.mine')?.scrollIntoView({behavior:'smooth',block:'center'})}
  else{$('up-status').textContent=data?.error||'تعذّر رفع الملف.';$('up-go').disabled=false;$('up-bar').hidden=true}};
 x.onerror=()=>{upBusy=false;$('up-status').textContent='انقطع الاتصال أثناء الرفع. حاول مجددًا.';$('up-go').disabled=false;$('up-bar').hidden=true};
 x.send(fd);
});
ud.addEventListener('click',e=>{if(e.target===ud&&!upBusy)ud.close()});

/* ——— العارض ——— */
const vw=$('viewer');let vIdx=0,page=1,vItem=null,vPoll=null;
function openViewer(i){vIdx=i;page=1;paintViewer();if(!vw.open)vw.showModal()}
function current(){return state.items[vIdx]}
async function paintViewer(){
 const it=current();if(!it)return;vItem=it;clearTimeout(vPoll);
 const c=colorOf(it.author);$('v-owner').textContent=it.author;$('v-title').textContent=it.title;$('v-title').dir=/^[؀-ۿ]/.test(it.title)?'rtl':'ltr';$('v-by').textContent=`${metaOf(it)} · ${new Date(it.createdAt).toLocaleDateString('ar-AE',{day:'numeric',month:'long'})}`;
 $('v-nav').hidden=state.items.length<2;$('v-count').textContent=`${vIdx+1} / ${state.items.length}`;
 const own=state.board.isOwner;$('v-del').hidden=!(own||it.mine);$('v-del').textContent='حذف';$('v-approve').hidden=!(own&&!it.approved);
 const stamped=it.status==='ready'&&it.pages>0&&it.stampedUrl;$('v-dl').hidden=!(stamped||((state.board.settings.allowDownload||own||it.mine)&&['office','other','pdf','text','image'].includes(it.kind)));$('v-dl').textContent=stamped?'تنزيل بختم التميز (PDF)':'الملف الأصلي';$('v-dl').onclick=()=>stamped?downloadFile(it.stampedUrl,`${it.title} - توقيع التميز.pdf`):downloadFile(it.fileUrl,it.fileName);
 $('v-orig').hidden=!(stamped&&(own||it.mine));$('v-replace').hidden=!(own||it.mine);$('v-orig').onclick=()=>downloadFile(it.fileUrl,it.fileName);
 const stage=$('v-stage');const fileUrl=API+it.fileUrl;
 if(it.status==='processing'){stage.innerHTML=`<div class="v-file" style="--pc:${c}"><div class="big">⏳</div><b>جارٍ تجهيز صفحات هذا العمل…</b><small>يُحوَّل الملف على الخادم إلى صفحات مختومة بتوقيع التميز، وتظهر هنا تلقائيًا خلال لحظات.</small></div>`;vPoll=setTimeout(async()=>{try{const r=await api('/wall/items/'+it.id);Object.assign(it,r.item);if(vItem===it)paintViewer()}catch{}},3000)}
 else if(it.status==='failed'){stage.innerHTML=`<div class="v-file" style="--pc:${c}"><div class="big">⚠️</div><b>تعذّر تحويل هذا الملف</b><small>${esc(it.error||'')} ${own?'<br>يمكنك إعادة المحاولة من الزر أدناه.':''}</small>${own?'<p><button type="button" id="v-retry">إعادة المحاولة</button></p>':''}<p><a href="${fileUrl}" target="_blank" rel="noopener">فتح الملف الأصلي</a></p></div>`;$('v-retry')?.addEventListener('click',async()=>{try{await api(`/wall/items/${it.id}/retry`,{method:'POST',body:{}});it.status='processing';paintViewer()}catch(err){say(err.message)}})}
 else if(it.pages>0){stage.innerHTML=`<div class="pg-box"><img class="pg" id="v-page" alt="${esc(it.title)} — صفحة ${page}" src="${API}${it.pageUrl}${page}">${it.pages>1?`<div class="pg-nav"><button type="button" data-pg="prev" aria-label="الصفحة السابقة">›</button><span>${page} / ${it.pages}</span><button type="button" data-pg="next" aria-label="الصفحة التالية">‹</button></div>`:''}</div>`}
 else if(it.kind==='video')stage.innerHTML=`<video src="${fileUrl}" controls playsinline></video>`;
 else if(it.kind==='audio')stage.innerHTML=`<div class="v-file" style="--pc:${c}"><div class="big">🎧</div><b><bdi>${esc(it.title)}</bdi></b><audio src="${fileUrl}" controls style="margin-top:12px;width:100%"></audio></div>`;
 else stage.innerHTML=`<div class="v-file" style="--pc:${c}"><div class="big">${icons[it.kind]||icons.other}</div><b><bdi>${esc(it.fileName)}</bdi></b><small>${kindLabel[it.kind]} · ${(it.size/1024/1024).toFixed(2)} MB — لا يمكن عرض هذا النوع كصفحات</small><p><a href="${fileUrl}" target="_blank" rel="noopener">تنزيل الملف</a></p></div>`;
 if(document.getElementById('v-dl-other'))document.getElementById('v-dl-other').onclick=()=>downloadFile(it.fileUrl,it.fileName);
 paintSocial(it);loadComments(it);
}
$('v-stage').addEventListener('click',e=>{const b=e.target.closest('[data-pg]');if(!b)return;const it=current();page=Math.min(Math.max(1,page+(b.dataset.pg==='next'?1:-1)),it.pages);paintViewer()});
$('v-close').addEventListener('click',()=>vw.close());vw.addEventListener('click',e=>{if(e.target===vw)vw.close()});
vw.addEventListener('close',()=>{clearTimeout(vPoll);try{if(document.fullscreenElement)document.exitFullscreen?.()}catch{}vw.classList.remove('fs');$('v-fs').textContent='⛶ شاشة كاملة';if(qs.get('w')){qs.delete('w');history.replaceState(null,'',location.pathname+'?'+qs.toString())}});
$('v-prev').addEventListener('click',()=>{vIdx=(vIdx-1+state.items.length)%state.items.length;page=1;paintViewer()});
$('v-next').addEventListener('click',()=>{vIdx=(vIdx+1)%state.items.length;page=1;paintViewer()});
vw.addEventListener('keydown',e=>{if(e.target.closest('input,textarea'))return;const it=current();if(!it)return;if(e.key==='ArrowLeft'){if(it.pages>1&&page<it.pages){page++;paintViewer()}else $('v-next').click()}if(e.key==='ArrowRight'){if(it.pages>1&&page>1){page--;paintViewer()}else $('v-prev').click()}});
$('v-fs').addEventListener('click',e=>{const on=vw.classList.toggle('fs');try{if(on&&!document.fullscreenElement)vw.requestFullscreen?.().catch(()=>{});if(!on&&document.fullscreenElement)document.exitFullscreen?.().catch(()=>{})}catch{}e.currentTarget.textContent=on?'⤡ تصغير العرض':'⛶ شاشة كاملة'});
$('v-link').addEventListener('click',async()=>{const link=`${location.origin}/wall/?b=${code}&w=${current().id}`;try{await navigator.clipboard.writeText(link);say('🔗 نُسخ رابط العمل')}catch{say(link,6000)}});
$('v-del').addEventListener('click',async e=>{const it=current();if(e.currentTarget.dataset.arm!==it.id){e.currentTarget.dataset.arm=it.id;e.currentTarget.textContent='تأكيد الحذف؟';setTimeout(()=>{if($('v-del').dataset.arm===it.id){$('v-del').dataset.arm='';$('v-del').textContent='حذف'}},4000);return}try{await api('/wall/items/'+it.id,{method:'DELETE'});vw.close();say('حُذف العمل');load()}catch(err){say(err.message,4000)}});
$('v-approve').addEventListener('click',async()=>{const it=current();try{await api(`/wall/items/${it.id}/approve`,{method:'POST',body:{approved:true}});it.approved=true;say('✓ اعتُمد العمل وصار ظاهرًا للجميع');paintViewer();load()}catch(err){say(err.message,4000)}});

/* ——— العرض على الشاشة ——— */
let shIdx=0,shTimer=null,shPaused=false;
const shItems=()=>state.items.filter(i=>i.status==='ready'&&i.pages>0);
function startShow(){if(!shItems().length)return say('لا أعمال جاهزة للعرض بعد');shIdx=0;shPaused=false;$('show').hidden=false;try{$('show').requestFullscreen?.()}catch{}paintShow();shLoop()}
function shLoop(){clearInterval(shTimer);shTimer=setInterval(()=>{if(!shPaused){shIdx=(shIdx+1)%shItems().length;paintShow()}},8000)}
function paintShow(){const list=shItems();const it=list[shIdx];if(!it)return endShow();
 $('show').classList.remove('fade');void $('show').offsetWidth;$('show').classList.add('fade');
 $('sh-stage').innerHTML=`<img src="${API}${it.pageUrl}1" alt="">`;
 $('sh-name').textContent=it.author;$('sh-title').textContent=it.title;$('sh-count').textContent=`${shIdx+1} / ${list.length}`}
function endShow(){clearInterval(shTimer);$('show').hidden=true;try{if(document.fullscreenElement)document.exitFullscreen?.()}catch{}}
$('sh-exit').addEventListener('click',endShow);
$('sh-prev').addEventListener('click',()=>{shIdx=(shIdx-1+shItems().length)%shItems().length;paintShow();shLoop()});
$('sh-next').addEventListener('click',()=>{shIdx=(shIdx+1)%shItems().length;paintShow();shLoop()});
$('sh-pause').addEventListener('click',e=>{shPaused=!shPaused;e.currentTarget.textContent=shPaused?'▶':'⏸'});
document.addEventListener('keydown',e=>{if($('show').hidden)return;if(e.key==='Escape')endShow();if(e.key==='ArrowLeft')$('sh-next').click();if(e.key==='ArrowRight')$('sh-prev').click()});
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&!$('show').hidden&&!vw.open)endShow()});
/* ——— استبدال الملف ——— */
$('v-replace').addEventListener('click',()=>$('v-replace-file').click());
$('v-replace-file').addEventListener('change',async e=>{
 const f=e.target.files[0];e.target.value='';const it=current();if(!f||!it)return;
 if(f.size>25*1024*1024)return say('الحد الأقصى للملف 25 ميغابايت');
 const fd=new FormData();fd.append('file',f,f.name);say('جارٍ رفع النسخة الجديدة…',10000);
 try{const r=await api(`/wall/items/${it.id}/replace`,{method:'POST',form:fd});Object.assign(it,r.item);say('✓ استُبدل الملف — جارٍ ختم النسخة الجديدة');paintViewer();load()}catch(err){say(err.message,5000)}});
/* ——— التفاعل والتعليقات ——— */
function paintSocial(it){
 const s=state.board.settings;$('v-social').hidden=!(s.reactions||s.comments);
 $('r-like').hidden=!s.reactions;$('r-idea').hidden=!s.reactions;$('v-composer').hidden=!s.comments;
 $('r-like').querySelector('b').textContent=it.likes;$('r-idea').querySelector('b').textContent=it.ideas;
 $('r-like').setAttribute('aria-pressed',String(!!it.myLike));$('r-idea').setAttribute('aria-pressed',String(!!it.myIdea));
}
async function react(kind){const it=current();if(!state.me)return openJoin(()=>{vw.showModal();react(kind)});try{const r=await api(`/wall/items/${it.id}/react`,{method:'POST',body:{kind}});it.likes=r.likes;it.ideas=r.ideas;if(kind==='like')it.myLike=r.active;else it.myIdea=r.active;paintSocial(it)}catch(err){say(err.message,4000)}}
$('r-like').addEventListener('click',()=>react('like'));$('r-idea').addEventListener('click',()=>react('idea'));
async function loadComments(it){const list=$('v-comments');list.replaceChildren();setReply(null);if(!state.board.settings.comments)return;try{const r=await api(`/wall/items/${it.id}/comments`);if(current()!==it)return;for(const c of r.comments)list.append(commentEl(c));it.comments=r.comments.length}catch{}}
let replyTo=null;
function setReply(c){replyTo=c?{id:c.id,name:c.author}:null;$('vc-replying').hidden=!replyTo;if(replyTo){$('vc-replying').querySelector('span').textContent='رد على '+replyTo.name;$('vc-text').focus()}}
$('vc-cancel').addEventListener('click',()=>setReply(null));
const C_REACTS=[['like','👍 أعجبني'],['logical','🧠 منطقي'],['creative','✨ إبداعي']];
function commentEl(c,isReply){
 const d=document.createElement('div');d.className='v-comment';
 const b=document.createElement('b');b.textContent=c.author;const sm=document.createElement('small');sm.textContent=' · '+new Date(c.createdAt).toLocaleTimeString('ar-AE',{hour:'2-digit',minute:'2-digit'});d.append(b,sm);
 if(c.body){const p=document.createElement('p');p.textContent=c.body;d.append(p)}
 if(c.imageUrl){const im=document.createElement('img');im.alt='صورة مرفقة';im.loading='lazy';im.src=API+c.imageUrl;d.append(im)}
 const bar=document.createElement('div');bar.className='reacts';
 for(const [kind,label] of C_REACTS){const btn=document.createElement('button');btn.type='button';btn.dataset.kind=kind;btn.setAttribute('aria-pressed',String(!!c.my?.[kind]));btn.textContent=label+(c.reactions?.[kind]?' '+c.reactions[kind]:'');
  btn.addEventListener('click',async()=>{if(!state.me)return openJoin(()=>{vw.showModal()});try{const r=await api(`/wall/comments/${c.id}/react`,{method:'POST',body:{kind}});c.reactions=r.reactions;c.my=c.my||{};c.my[kind]=r.active;for(const x of bar.querySelectorAll('button[data-kind]')){const k=x.dataset.kind;x.setAttribute('aria-pressed',String(!!c.my[k]));x.textContent=C_REACTS.find(e=>e[0]===k)[1]+(c.reactions[k]?' '+c.reactions[k]:'')}}catch(err){say(err.message,4000)}});
  bar.append(btn)}
 if(!isReply&&state.board.settings.comments){const rb=document.createElement('button');rb.type='button';rb.textContent='↩ رد';rb.addEventListener('click',()=>setReply(c));bar.append(rb)}
 d.append(bar);
 if(c.mine||state.board.isOwner){const x=document.createElement('button');x.type='button';x.className='del';x.textContent='حذف';x.addEventListener('click',async()=>{try{await api('/wall/comments/'+c.id,{method:'DELETE'});d.remove()}catch(err){say(err.message)}});d.append(x)}
 if(c.replies?.length){const rw=document.createElement('div');rw.className='replies';for(const r of c.replies)rw.append(commentEl(r,true));d.append(rw)}
 return d;
}
async function postComment(body,file){const it=current();if(!state.me)return openJoin(()=>{vw.showModal();postComment(body,file)});if(!body&&!file)return;const fd=new FormData();fd.append('body',body);if(replyTo)fd.append('parent',replyTo.id);if(file)fd.append('image',file,file.name);$('vc-send').disabled=true;try{const r=await api(`/wall/items/${it.id}/comments`,{method:'POST',form:fd});if(replyTo){loadComments(it)}else{$('v-comments').append(commentEl(r.comment))}setReply(null);$('vc-text').value='';$('v-comments').lastElementChild.scrollIntoView({block:'nearest'});it.comments++}catch(err){say(err.message,4000)}finally{$('vc-send').disabled=false}}
$('vc-send').addEventListener('click',()=>postComment($('vc-text').value.trim(),null));
$('vc-text').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();postComment(e.target.value.trim(),null)}});
$('vc-file').addEventListener('change',e=>{const f=e.target.files[0];e.target.value='';if(f)postComment($('vc-text').value.trim(),f)});

/* ——— البداية ——— */
if(!code)initCreate();else{$('board-view').hidden=false;initAdmin();load()}
})();
