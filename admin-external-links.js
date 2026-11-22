/* External links UI: upload any file and get a public download link. Uses only /admin/external-links endpoints. */
(()=>{'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const apiBase=window.INEXC_REGISTRATION_ENDPOINT,valid=()=>window.INEXCAdminSession?.valid()===true;
 const token=()=>sessionStorage.getItem('inexc_do_admin');
 let section,tab,form,records=[],limitMb=300,sequence=0,busy=false;
 const q=s=>section.querySelector(s);
 const size=bytes=>{const n=Number(bytes)||0;if(n>=1073741824)return (n/1073741824).toFixed(2)+' جيجابايت';if(n>=1048576)return (n/1048576).toFixed(1)+' ميجابايت';if(n>=1024)return Math.round(n/1024)+' كيلوبايت';return n+' بايت'};
 const publicLink=slug=>new URL('/download.html?f='+encodeURIComponent(slug),location.origin).href;
 const missing='قسم الروابط الخارجية يحتاج إلى تفعيل تحديث الخادم أولًا. بقية أقسام الإدارة متاحة كالمعتاد.';
 async function call(path,options={}){
  if(!valid())throw Error('سجّل الدخول للمتابعة.');const session=token();
  const response=await fetch(apiBase+'/admin/external-links'+path,{...options,cache:'no-store',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+session,...(options.body?{'Content-Type':'application/json'}:{})}});
  if(!valid()||session!==token())throw Error('انتهت جلسة الإدارة.');
  const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(response.status===404&&!path?missing:result.error||'تعذّر تنفيذ الطلب. أعد المحاولة.');return result;
 }
 /* XMLHttpRequest is used for uploads only, to show progress for large files. */
 function send(path,data,onProgress){return new Promise((resolve,reject)=>{
  if(!valid())return reject(Error('سجّل الدخول للمتابعة.'));const session=token(),xhr=new XMLHttpRequest();
  xhr.open('POST',apiBase+'/admin/external-links'+path);xhr.setRequestHeader('Authorization','Bearer '+session);xhr.responseType='text';
  xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(e.loaded/e.total)};
  xhr.onerror=()=>reject(Error('انقطع الاتصال أثناء الرفع. أعد المحاولة.'));
  xhr.onload=()=>{let result={};try{result=JSON.parse(xhr.responseText||'{}')}catch{}
   if(!valid()||session!==token())return reject(Error('انتهت جلسة الإدارة.'));
   if(xhr.status>=200&&xhr.status<300)return resolve(result);
   reject(Error(result.error||(xhr.status===413?'حجم الملف أكبر من الحد المسموح.':xhr.status===404?missing:'تعذّر رفع الملف. أعد المحاولة.')))};
  xhr.send(data)})}
 function notice(text,error=false){const el=q('[data-xl-notice]');el.textContent=text;el.hidden=!text;el.classList.toggle('is-error',error)}
 function progress(value){const bar=q('[data-xl-progress]');bar.hidden=value==null;if(value!=null){bar.value=Math.round(value*100);bar.textContent=Math.round(value*100)+'%'}}
 function render(){
  const list=q('[data-xl-list]');q('[data-xl-count]').textContent=records.length?`${records.length} ملف · المساحة المستخدمة ${size(records.reduce((s,r)=>s+Number(r.size_bytes),0))}`:'';
  if(!records.length){list.innerHTML='<p class="xl-empty">لا توجد ملفات بعد. ارفع أول ملف من النموذج أعلاه لتحصل على رابطه.</p>';return}
  list.innerHTML=records.map(r=>{const link=publicLink(r.slug);return `<article class="xl-card" data-xl-id="${esc(r.id)}"><div class="xl-card-main"><div class="xl-card-title"><strong>${esc(r.title)}</strong><span class="xl-tag${r.active?' is-live':''}">${r.active?'الرابط يعمل':'موقوف'}</span></div><p class="xl-file">${esc(r.file_name)} · ${esc(size(r.size_bytes))}</p><div class="xl-link"><input type="text" readonly dir="ltr" value="${esc(link)}" aria-label="رابط التحميل"><button type="button" class="primary" data-xl-copy>نسخ الرابط</button><a class="light" href="${esc(link)}" target="_blank" rel="noopener noreferrer">فتح ↗</a></div></div><div class="xl-card-side"><div class="xl-stats"><span><b>${Number(r.views)||0}</b> فتح للرابط</span><span><b>${Number(r.downloads)||0}</b> تحميل</span></div><div class="xl-card-actions"><button type="button" class="light" data-xl-toggle>${r.active?'إيقاف الرابط':'تشغيل الرابط'}</button><label class="light xl-replace">استبدال الملف<input type="file" data-xl-replace hidden></label><button type="button" class="light xl-danger" data-xl-delete>حذف</button></div></div></article>`}).join('');
 }
 async function load(){const current=++sequence;notice('جارٍ تحميل الملفات…');try{const result=await call('');if(current!==sequence)return;records=result.items||[];limitMb=Number(result.maxMb)||limitMb;q('[data-xl-limit]').textContent=`الحد الأقصى للملف الواحد ${limitMb} ميجابايت.`;q('[data-xl-submit]').disabled=false;notice('');render()}catch(err){if(current===sequence&&valid())notice(err.message,true)}}
 const tooBig=file=>file.size>limitMb*1024*1024?`حجم الملف ${size(file.size)} أكبر من الحد المسموح (${limitMb} ميجابايت).`:'';
 async function upload(event){
  event.preventDefault();if(busy||!valid())return;const file=form.elements.namedItem('file').files[0],title=form.elements.namedItem('title').value.trim();
  if(!title)return notice('اكتب عنوان الملف.',true);if(!file)return notice('اختر الملف المراد رفعه.',true);const big=tooBig(file);if(big)return notice(big,true);
  const data=new FormData();data.append('title',title);data.append('description',form.elements.namedItem('description').value.trim());data.append('slug',form.elements.namedItem('slug').value.trim());data.append('file',file);
  busy=true;q('[data-xl-submit]').disabled=true;notice('جارٍ رفع الملف… لا تغلق الصفحة.');progress(0);
  try{const result=await send('',data,progress);records=[result,...records.filter(r=>r.id!==result.id)];form.reset();render();notice('تم رفع الملف. انسخ الرابط من البطاقة أدناه.')}
  catch(err){if(valid())notice(err.message,true)}finally{busy=false;progress(null);q('[data-xl-submit]').disabled=!valid()}
 }
 async function act(event){
  const card=event.target.closest('[data-xl-id]');if(!card||busy)return;const record=records.find(r=>r.id===card.dataset.xlId);if(!record)return;
  if(event.target.closest('[data-xl-copy]')){const link=publicLink(record.slug),input=card.querySelector('.xl-link input');
   try{await navigator.clipboard.writeText(link);notice('نُسخ الرابط.')}catch{input.focus();input.select();notice('حدّدنا الرابط؛ انسخه بالضغط على Ctrl+C.')}return}
  if(event.target.closest('[data-xl-toggle]')){try{const result=await call('/'+record.id,{method:'PUT',body:JSON.stringify({title:record.title,description:record.description||'',active:!record.active})});records=records.map(r=>r.id===result.id?result:r);render();notice(result.active?'الرابط يعمل الآن.':'أُوقف الرابط؛ لن يستطيع أحد التحميل حتى تشغّله.')}catch(err){if(valid())notice(err.message,true)}return}
  if(event.target.closest('[data-xl-delete]')){if(!confirm(`حذف «${record.title}» نهائيًا؟ سيتوقف رابطه عن العمل ولا يمكن التراجع.`))return;
   try{await call('/'+record.id,{method:'DELETE'});records=records.filter(r=>r.id!==record.id);render();notice('حُذف الملف ورابطه.')}catch(err){if(valid())notice(err.message,true)}}
 }
 async function replace(event){
  const input=event.target.closest('[data-xl-replace]');if(!input)return;const card=input.closest('[data-xl-id]'),record=records.find(r=>r.id===card?.dataset.xlId),file=input.files[0];input.value='';
  if(!record||!file||busy||!valid())return;const big=tooBig(file);if(big)return notice(big,true);
  if(!confirm(`استبدال ملف «${record.title}» بالملف «${file.name}»؟ الرابط يبقى كما هو.`))return;
  const data=new FormData();data.append('file',file);busy=true;notice('جارٍ رفع الملف الجديد… لا تغلق الصفحة.');progress(0);
  try{const result=await send('/'+record.id+'/file',data,progress);records=records.map(r=>r.id===result.id?result:r);render();notice('استُبدل الملف، والرابط لم يتغيّر.')}
  catch(err){if(valid())notice(err.message,true)}finally{busy=false;progress(null)}
 }
 function mount(){
  const tabs=document.querySelector('#app .tabs');if(!tabs||document.getElementById('external-links'))return;
  const css=document.createElement('link');css.rel='stylesheet';css.href='/admin-external-links.css?v=20261123-links1';document.head.append(css);
  tab=document.createElement('button');tab.type='button';tab.className='light';tab.dataset.view='external-links';tab.textContent='الروابط الخارجية';tabs.append(tab);
  section=document.createElement('section');section.id='external-links';section.className='view';section.dir='rtl';
  section.innerHTML='<div class="xl-head"><div><h2>الروابط الخارجية</h2><p>ارفع أي ملف واحصل على رابط تحميل من موقعك تشاركه في الرسائل والمنشورات.</p></div><button class="light" type="button" data-xl-refresh>تحديث</button></div><form class="xl-form" novalidate><div class="xl-two"><label>عنوان الملف <span aria-hidden="true">*</span><input name="title" required maxlength="160" placeholder="مثال: ملخّص استراتيجية الإمارات 2031"></label><label>اسم الرابط بالإنجليزية (اختياري)<input name="slug" maxlength="60" dir="ltr" placeholder="uae-2031" pattern="[A-Za-z0-9 _-]*" autocomplete="off"><small>حروف إنجليزية وأرقام وشرطة. إن تركته فارغًا يُنشأ اسم تلقائي.</small></label></div><label>وصف قصير يظهر للزائر (اختياري)<input name="description" maxlength="600" placeholder="مثال: كتيّب من 12 صفحة من إعداد شركة التميّز الابتكاري"></label><label>الملف <span aria-hidden="true">*</span><input name="file" type="file" required><small data-xl-limit></small></label><div class="xl-form-actions"><button class="primary" type="submit" data-xl-submit disabled>رفع الملف وإنشاء الرابط</button><progress data-xl-progress max="100" value="0" hidden></progress></div></form><p class="xl-notice" data-xl-notice role="status" hidden></p><div class="xl-list-head"><h3>الملفات المرفوعة</h3><span data-xl-count role="status"></span></div><div class="xl-list" data-xl-list></div>';
  document.querySelector('#app main').append(section);form=q('form');
  tab.onclick=()=>{if(!valid())return;document.querySelectorAll('#app .tabs button,#app .view').forEach(n=>n.classList.remove('active'));tab.classList.add('active');section.classList.add('active');load()};
  q('[data-xl-refresh]').onclick=()=>{if(!busy)load()};form.onsubmit=upload;q('[data-xl-list]').addEventListener('click',act);q('[data-xl-list]').addEventListener('change',replace);
  window.addEventListener('inexc:locked',()=>{sequence++;records=[];busy=false;form.reset();q('[data-xl-list]').replaceChildren();q('[data-xl-count]').textContent='';q('[data-xl-submit]').disabled=true;progress(null);notice('')});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
