/* قسم «المدارس» في لوحة الإدارة: المدارس مقسّمة بالإمارة، قوالب بريد خاصة بها، وإرسال حسب الإمارة. يستخدم مسارات /admin/schools فقط. */
(()=>{'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const apiBase=window.INEXC_REGISTRATION_ENDPOINT,valid=()=>window.INEXCAdminSession?.valid()===true;
 const num=n=>Number(n||0).toLocaleString('ar-AE');
 const when=v=>v?new Date(v).toLocaleString('ar-AE',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Dubai'}):'';
 const languages=[['auto','تلقائي حسب المنهج'],['ar','العربية'],['en','English'],['both','باللغتين معًا']];
 const languageName=Object.fromEntries(languages);
 const priorityNames={1:'1 · تقييم مقبول',2:'2 · وزاري عربي',3:'3 · بقية المدارس'};
 const deliveryNames={queued:'في الطابور',sent:'أُرسلت',delivered:'وصلت',opened:'فُتحت',clicked:'نُقر رابطها',failed:'تعذّر الإرسال',bounced:'ارتدّت',complained:'شكوى',skipped:'تخطّيناها',cancelled:'أُلغيت'};
 const campaignNames={queued:'في الطابور',sending:'جارٍ الإرسال',scheduled:'مجدولة',sent:'اكتملت',partial:'اكتملت جزئيًا',failed:'تعذّرت',completed:'اكتملت',cancelled:'أُلغيت'};
 let section,tab,dialog,overview=null,settings=null,definitions=[],emirateDefaults=[],schools=[],sequence=0,previewTimer,audienceTimer,audienceCount=null,requestId='';
 const state={emirate:'',panel:'send',templateId:'letter',language:'auto',editTemplate:'letter',editLanguage:'ar'};
 const q=s=>section.querySelector(s),qa=s=>[...section.querySelectorAll(s)];
 async function call(path,options={}){
  if(!valid())throw Error('سجّل الدخول للمتابعة.');const session=sessionStorage.getItem('inexc_do_admin'),raw=options.body instanceof Blob;
  const response=await fetch(apiBase+'/admin/schools'+path,{...options,cache:'no-store',signal:AbortSignal.timeout(raw?60000:25000),headers:{Authorization:'Bearer '+session,...(raw?{'Content-Type':'application/octet-stream'}:options.body?{'Content-Type':'application/json'}:{})}});
  if(!valid()||session!==sessionStorage.getItem('inexc_do_admin'))throw Error('انتهت جلسة الإدارة.');
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(response.status===404&&!result.error?'قسم المدارس يحتاج إلى اكتمال تحديث الخادم. انتظر دقيقتين ثم اضغط «تحديث».':result.error||'تعذّر تنفيذ الطلب. أعد المحاولة.');
  return result;
 }
 const post=(path,body,method='POST')=>call(path,{method,body:JSON.stringify(body)});
 function notice(text,error=false){const el=q('[data-sc-notice]');el.textContent=text;el.hidden=!text;el.classList.toggle('is-error',error)}
 const emirateRow=()=>overview?.emirates.find(e=>e.emirate===state.emirate);
 const sendFilters=()=>({emirate:state.emirate,templateId:state.templateId,language:state.language,priorities:qa('[data-sc-priority]:checked').map(n=>Number(n.value)),onlyNew:q('[data-sc-only-new]').checked,excludePersonal:q('[data-sc-no-personal]').checked,limit:Number(q('[data-sc-limit]').value)||0});

 function renderOverview(){
  const t=overview.totals,has=overview.emirates.length>0;
  q('[data-sc-totals]').innerHTML=[['مدرسة في القائمة',t.total],['لها بريد إلكتروني',t.withEmail],['وصلتها رسالة',t.sent],['لم تُراسَل بعد',t.remaining]].map(([label,value])=>`<div class="sc-stat"><span>${label}</span><strong>${num(value)}</strong></div>`).join('');
  q('[data-sc-empty]').hidden=has;q('[data-sc-emirates-wrap]').hidden=!has;
  q('[data-sc-emirates]').innerHTML=overview.emirates.map(e=>{const done=e.with_email?Math.round(100*(e.with_email-e.remaining)/e.with_email):0;return `<button type="button" class="sc-emirate${e.emirate===state.emirate?' is-active':''}" data-sc-emirate="${esc(e.emirate)}" aria-pressed="${e.emirate===state.emirate}"><strong>${esc(e.emirate)}</strong><span>${num(e.total)} مدرسة · ${num(e.with_email)} ببريد</span><span class="sc-bar" aria-hidden="true"><i style="width:${done}%"></i></span><small>${e.sent?`أُرسل إلى ${num(e.sent)} · بقي ${num(e.remaining)}`:`لم يبدأ الإرسال · ${num(e.remaining)} جاهزة`}</small></button>`}).join('');
  q('[data-sc-work]').hidden=!has||!state.emirate;
  q('[data-sc-mail-off]').hidden=overview.mailEnabled!==false;
 }
 function renderTemplates(){
  q('[data-sc-templates]').innerHTML=overview.templates.map((t,i)=>`<label class="sc-template${t.id===state.templateId?' is-active':''}"><input type="radio" name="sc-template" value="${esc(t.id)}"${t.id===state.templateId?' checked':''}><span class="sc-template-no">${i+1}</span><span><strong>${esc(t.name)}</strong><small>${esc(t.summary)}</small></span></label>`).join('');
 }
 function showPanel(name){state.panel=name;qa('[data-sc-tab]').forEach(b=>{const on=b.dataset.scTab===name;b.classList.toggle('is-active',on);b.setAttribute('aria-selected',String(on))});qa('[data-sc-panel]').forEach(p=>p.hidden=p.dataset.scPanel!==name);
  if(name==='list')loadList();if(name==='texts')loadSettings();if(name==='log')loadCampaigns();if(name==='send'){refreshAudience();refreshPreview()}}
 function selectEmirate(name){state.emirate=name;schools=[];audienceCount=null;renderOverview();q('[data-sc-current]').textContent='مدارس '+name;q('[data-sc-sample]').innerHTML='<option value="">أول مدرسة في القائمة</option>';showPanel(state.panel);loadSampleOptions()}

 async function load(){
  if(!valid())return;const current=++sequence;q('[data-sc-refresh]').disabled=true;notice('جارٍ تحميل بيانات المدارس…');
  try{const data=await call('/overview');if(current!==sequence)return;overview=data;if(state.emirate&&!emirateRow())state.emirate='';renderOverview();renderTemplates();notice('');if(state.emirate)showPanel(state.panel)}
  catch(e){if(valid()&&current===sequence)notice(e.message,true)}finally{q('[data-sc-refresh]').disabled=false}
 }
 async function importFile(file){
  if(!file)return;if(file.size>6*1024*1024)return notice('حجم الملف أكبر من 6MB.',true);
  notice('جارٍ قراءة الملف وحفظ المدارس…');q('[data-sc-import]').disabled=true;
  try{const r=await call('/import',{method:'POST',body:file});await load();notice(`تم الاستيراد: ${num(r.added)} مدرسة جديدة، وتحديث ${num(r.updated)}. الأوراق المقروءة: ${r.sheets.map(s=>s.emirate+' ('+num(s.count)+')').join('، ')}.`+(r.invalidEmails?` عناوين غير صالحة تُركت بلا بريد: ${num(r.invalidEmails)}.`:'')+(r.merged?` سجلات مكررة لنفس المدرسة دُمجت بأنسب عنوان: ${num(r.merged)}.`:'')+(r.skippedSheets.length?` أوراق لم تُستورد لأنها ليست مدارس: ${r.skippedSheets.join('، ')}.`:''))}
  catch(e){if(valid())notice(e.message,true)}finally{q('[data-sc-import]').disabled=false;q('[data-sc-file]').value=''}
 }
 async function loadSampleOptions(){
  const emirate=state.emirate;try{const data=await call('/list?emirate='+encodeURIComponent(emirate));if(emirate!==state.emirate)return;schools=data.schools;
   q('[data-sc-sample]').innerHTML='<option value="">أول مدرسة في القائمة</option>'+schools.filter(s=>s.email).slice(0,400).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');if(state.panel==='list')renderList()}catch{}
 }
 function refreshAudience(){clearTimeout(audienceTimer);audienceTimer=setTimeout(async()=>{
  if(!state.emirate||!valid())return;const body=sendFilters(),box=q('[data-sc-audience]'),send=q('[data-sc-send]');send.disabled=true;audienceCount=null;
  try{const {counts}=await post('/audience',body);if(JSON.stringify(body)!==JSON.stringify(sendFilters()))return;audienceCount=counts.selected;
   const skipped=[[counts.alreadySent,'سبقت مراسلتها'],[counts.noEmail,'بلا بريد'],[counts.personal,'عنوان شخصي'],[counts.unsubscribed,'ألغت الاستلام'],[counts.excluded,'مستثناة يدويًا'],[counts.otherPriority,'أولوية غير مختارة'],[counts.duplicate,'عنوان مكرر']].filter(([n])=>n).map(([n,label])=>`${label}: ${num(n)}`).join(' · ');
   box.innerHTML=`<strong>${num(counts.selected)}</strong><span>مدرسة ستصلها الرسالة من أصل ${num(counts.total)} في ${esc(state.emirate)}${counts.selected<counts.eligible?` (دفعة من ${num(counts.eligible)} مؤهلة)`:''}</span>${skipped?`<small>لن تُرسل إلى — ${skipped}</small>`:''}`;
   send.textContent=counts.selected?`إرسال إلى ${num(counts.selected)} مدرسة في ${state.emirate}`:'لا توجد مدارس مؤهلة';send.disabled=!counts.selected||overview.mailEnabled===false}
  catch(e){if(valid())box.innerHTML=`<small class="sc-error">${esc(e.message)}</small>`}
 },250)}
 function refreshPreview(draft){clearTimeout(previewTimer);previewTimer=setTimeout(async()=>{
  if(!state.emirate||!valid())return;const editing=state.panel==='texts',frame=q(editing?'[data-sc-edit-frame]':'[data-sc-frame]'),subject=q(editing?'[data-sc-edit-subject]':'[data-sc-subject]');
  const body={emirate:state.emirate,templateId:editing?state.editTemplate:state.templateId,language:editing?state.editLanguage:state.language,schoolId:q('[data-sc-sample]').value,...(draft?{draft}:{})};
  try{const mail=await post('/preview',body);subject.textContent=mail.subject;frame.srcdoc=mail.html;const note=q('[data-sc-preview-note]');if(!editing)note.textContent=`معاينة باسم: ${mail.school.name} · اللغة: ${languageName[mail.language]||mail.language}`}
  catch(e){if(valid())subject.textContent=e.message}
 },300)}

 function renderList(){
  const term=q('[data-sc-search]').value.trim().toLowerCase(),filter=q('[data-sc-list-filter]').value;
  const rows=schools.filter(s=>(!term||[s.name,s.email,s.area,s.curriculum].join(' ').toLowerCase().includes(term))&&(filter===''||(filter==='new'&&s.email&&!s.send_count&&!s.excluded)||(filter==='sent'&&s.send_count>0)||(filter==='noemail'&&!s.email)||(filter==='excluded'&&(s.excluded||s.unsubscribed))||(['1','2','3'].includes(filter)&&String(s.priority)===filter)));
  q('[data-sc-list-count]').textContent=`${num(rows.length)} من ${num(schools.length)} مدرسة`;
  q('[data-sc-list]').innerHTML=rows.length?'<table><thead><tr><th>المدرسة</th><th>البريد</th><th>نوع العنوان</th><th>المنهج</th><th>الأولوية</th><th>لغة الرسالة</th><th>آخر إرسال</th><th></th></tr></thead><tbody>'+rows.map(s=>`<tr class="${s.excluded||s.unsubscribed?'is-off':''}"><td><strong>${esc(s.name)}</strong>${s.area?`<small>${esc(s.area)}</small>`:''}</td><td dir="ltr">${s.email?esc(s.email):'<span class="sc-muted">—</span>'}${s.phone?`<small>${esc(s.phone)}</small>`:''}</td><td>${esc(s.address_type||'—')}</td><td>${esc(s.curriculum||'غير معروف')}</td><td>${esc(priorityNames[s.priority]||s.priority)}</td><td>${esc(languageName[s.auto_language]||'')}</td><td>${s.send_count?`<span class="sc-pill is-${esc(s.delivery_status||'sent')}">${esc(deliveryNames[s.delivery_status]||'أُرسلت')}</span><small>${esc(when(s.last_sent_at))}</small>`:s.unsubscribed?'<span class="sc-pill is-failed">ألغت الاستلام</span>':'<span class="sc-muted">لم تُراسَل</span>'}</td><td>${s.email?`<button type="button" class="light" data-sc-exclude="${esc(s.id)}">${s.excluded?'إعادة للقائمة':'استثناء'}</button>`:''}</td></tr>`).join('')+'</tbody></table>':'<p class="sc-muted">لا توجد مدارس مطابقة.</p>';
 }
 async function loadList(){q('[data-sc-list]').innerHTML='<p class="sc-muted">جارٍ التحميل…</p>';const emirate=state.emirate;try{const data=await call('/list?emirate='+encodeURIComponent(emirate));if(emirate!==state.emirate)return;schools=data.schools;renderList()}catch(e){if(valid())q('[data-sc-list]').innerHTML=`<p class="sc-error">${esc(e.message)}</p>`}}

 const definition=()=>definitions.find(t=>t.id===state.editTemplate);
 function renderEditor(){
  const t=definition();if(!t||!settings)return;const lang=state.editLanguage,saved=settings.templates?.[t.id]?.[lang]||{};
  q('[data-sc-edit-template]').innerHTML=definitions.map(d=>`<option value="${esc(d.id)}"${d.id===t.id?' selected':''}>${esc(d.name)}</option>`).join('');
  q('[data-sc-fields]').innerHTML=t.fields.map(f=>{const value=saved[f.key]??f[lang],rows=f.type==='list'?Math.min(9,String(value).split('\n').length+1):f.type==='text'?3:1;
   return `<label><span>${esc(f.label)}${saved[f.key]!==undefined?' <em>معدّل</em>':''}</span>${f.type==='line'?`<input data-sc-field="${esc(f.key)}" dir="${lang==='en'?'ltr':'rtl'}" value="${esc(value)}" maxlength="220">`:`<textarea data-sc-field="${esc(f.key)}" dir="${lang==='en'?'ltr':'rtl'}" rows="${rows}" maxlength="2400">${esc(value)}</textarea>`}${f.hint?`<small>${esc(f.hint)}</small>`:''}</label>`}).join('');
  const line=settings.emirateLines?.[state.emirate]||{},info=emirateDefaults.find(e=>e.id===state.emirate)||{};
  q('[data-sc-contact]').innerHTML=[['senderName','اسم المرسل (عربي)'],['senderNameEn','اسم المرسل (English)','ltr'],['senderTitle','الصفة تحت الاسم (عربي)'],['senderTitleEn','الصفة تحت الاسم (English)','ltr'],['whatsapp','رقم واتساب مع رمز الدولة','ltr'],['email','البريد الظاهر في التوقيع','ltr'],['replyTo','البريد الذي تصله ردود المدارس','ltr'],['requestUrl','رابط زر «اطلبوا مقترحًا»','ltr'],['website','رابط الموقع (الشعار والتذييل)','ltr'],['websiteLabel','نص رابط الموقع في التذييل','ltr'],['footerAr','سطر الشركة في التذييل (عربي)'],['footerEn','سطر الشركة في التذييل (English)','ltr'],['reasonAr','سبب وصول الرسالة (عربي)'],['reasonEn','سبب وصول الرسالة (English)','ltr'],['unsubscribeAr','نص رابط إلغاء الاستلام (عربي)'],['unsubscribeEn','نص رابط إلغاء الاستلام (English)','ltr']].map(([key,label,dir])=>`<label><span>${label}</span><input data-sc-setting="${key}" dir="${dir||'rtl'}" value="${esc(settings[key]??'')}" maxlength="400"></label>`).join('')
   +`<label class="sc-wide"><span>سطر الإمارة العام (عربي) — يُستبدل فيه {{emirate}} و{{authority}}</span><textarea data-sc-setting="emirateLineAr" rows="2" maxlength="400">${esc(settings.emirateLineAr)}</textarea></label><label class="sc-wide"><span>سطر الإمارة العام (English)</span><textarea data-sc-setting="emirateLineEn" dir="ltr" rows="2" maxlength="400">${esc(settings.emirateLineEn)}</textarea></label>`
   +`<h4 class="sc-wide sc-sub">خاص بمدارس ${esc(state.emirate)}</h4>`+[['nameAr','اسم الإمارة كما يظهر في الرسالة (عربي)','rtl',state.emirate==='الظفرة'?'منطقة الظفرة':state.emirate],['nameEn','اسم الإمارة (English)','ltr',info.en||''],['authorityAr','الجهة التعليمية (عربي)','rtl',info.authorityAr||''],['authorityEn','الجهة التعليمية (English)','ltr',info.authorityEn||'']].map(([key,label,dir,hint])=>`<label><span>${label}</span><input data-sc-line="${key}" dir="${dir}" value="${esc(line[key]||'')}" placeholder="${esc(hint)}" maxlength="120"></label>`).join('')+`<label class="sc-wide"><span>سطر خاص بمدارس ${esc(state.emirate)} فقط (عربي) — اتركه فارغًا لاستخدام السطر العام</span><textarea data-sc-line="ar" rows="2" maxlength="400">${esc(line.ar||'')}</textarea></label><label class="sc-wide"><span>سطر خاص بمدارس ${esc(state.emirate)} فقط (English)</span><textarea data-sc-line="en" dir="ltr" rows="2" maxlength="400">${esc(line.en||'')}</textarea></label>`;
  refreshPreview(collect());
 }
 // يجمع ما في المحرر فوق الإعدادات المحفوظة. الحقل المطابق للنص الأصلي لا يُحفظ كتعديل.
 function collect(){
  const next=JSON.parse(JSON.stringify(settings)),t=definition(),lang=state.editLanguage,values={};
  qa('[data-sc-field]').forEach(n=>{const field=t.fields.find(f=>f.key===n.dataset.scField),value=n.value.trim();if(value!==String(field[lang]).trim())values[field.key]=value});
  next.templates={...next.templates,[t.id]:{...(next.templates?.[t.id]||{}),[lang]:values}};
  qa('[data-sc-setting]').forEach(n=>{next[n.dataset.scSetting]=n.value.trim()});
  const line=Object.fromEntries(qa('[data-sc-line]').map(n=>[n.dataset.scLine,n.value.trim()]));next.emirateLines={...next.emirateLines};if(Object.values(line).some(Boolean))next.emirateLines[state.emirate]=line;else delete next.emirateLines[state.emirate];
  return next;
 }
 async function loadSettings(){try{if(!settings){const data=await call('/settings');settings=data.settings;definitions=data.templates;emirateDefaults=data.emirates||[]}renderEditor()}catch(e){if(valid())notice(e.message,true)}}
 async function saveSettings(){const b=q('[data-sc-save]');b.disabled=true;try{const data=await post('/settings',collect(),'PUT');settings=data.settings;renderEditor();notice('حُفظت النصوص. كل رسالة قادمة ستستخدمها.')}catch(e){if(valid())notice(e.message,true)}finally{b.disabled=false}}
 async function loadCampaigns(){const box=q('[data-sc-log]');box.innerHTML='<p class="sc-muted">جارٍ التحميل…</p>';try{const {campaigns}=await call('/campaigns');
  box.innerHTML=campaigns.length?'<table><thead><tr><th>الرسالة</th><th>التاريخ</th><th>الحالة</th><th>العدد</th><th>أُرسلت</th><th>وصلت</th><th>فُتحت</th><th>نُقرت</th><th>تعذّرت</th></tr></thead><tbody>'+campaigns.map(c=>`<tr><td><strong>${esc(c.subject)}</strong></td><td>${esc(when(c.status==='scheduled'?c.scheduled_at:c.created_at))}</td><td><span class="sc-pill is-${esc(c.status)}">${esc(campaignNames[c.status]||c.status)}</span></td><td>${num(c.total_recipients)}</td><td>${num(c.sent)}</td><td>${num(c.delivered)}</td><td>${num(c.opened)}</td><td>${num(c.clicked)}</td><td>${num(c.failed)}</td></tr>`).join('')+'</tbody></table><p class="sc-muted">تفاصيل كل مستلم متاحة في «مركز الرسائل» ضمن سجل الإرسال.</p>':'<p class="sc-muted">لم تُرسل أي رسالة للمدارس بعد.</p>'}catch(e){if(valid())box.innerHTML=`<p class="sc-error">${esc(e.message)}</p>`}}

 function confirmSend(){
  if(!audienceCount)return;const template=overview.templates.find(t=>t.id===state.templateId),schedule=q('[data-sc-schedule]').value;requestId=(crypto.randomUUID?.()||String(Date.now())+Math.random().toString(16).slice(2)).replace(/[^\w-]/g,'');
  dialog.querySelector('[data-sc-confirm-text]').innerHTML=`ستُرسل رسالة <strong>«${esc(template.name)}»</strong> إلى <strong>${num(audienceCount)} مدرسة</strong> في <strong>${esc(state.emirate)}</strong>، بلغة: ${esc(languageName[state.language])}.<br>${schedule?'موعد الإرسال: '+esc(when(schedule)):'يبدأ الإرسال فورًا، رسالة كل ثانية تقريبًا.'}<br>كل مدرسة تصلها نسخة باسمها، ولا يمكن استرجاع الرسالة بعد خروجها.`;
  dialog.querySelector('[data-sc-confirm-error]').textContent='';dialog.showModal();
 }
 async function send(){
  const ok=dialog.querySelector('[data-sc-confirm-ok]'),error=dialog.querySelector('[data-sc-confirm-error]'),schedule=q('[data-sc-schedule]').value;ok.disabled=true;error.textContent='';
  try{const r=await post('/send',{...sendFilters(),confirmCount:audienceCount,requestId,...(schedule?{scheduledAt:new Date(schedule).toISOString()}:{})});dialog.close();q('[data-sc-schedule]').value='';await load();notice(r.status==='scheduled'?`جُدولت الرسالة إلى ${num(r.total)} مدرسة في ${state.emirate}. تابعها من «سجل الإرسال».`:`بدأ الإرسال إلى ${num(r.total)} مدرسة في ${state.emirate}. تابع الوصول والفتح من «سجل الإرسال».`)}
  catch(e){error.textContent=e.message;if(/تغيّر عدد/.test(e.message))refreshAudience()}finally{ok.disabled=false}
 }
 async function sendTest(){const input=q('[data-sc-test-email]'),b=q('[data-sc-test]'),email=input.value.trim();if(!email)return input.focus();b.disabled=true;
  try{const r=await post('/test',{emirate:state.emirate,templateId:state.templateId,language:state.language,schoolId:q('[data-sc-sample]').value,email});try{localStorage.setItem('inexc_sc_test_email',email)}catch{}notice(`أُرسلت تجربة إلى ${r.email} كما ستصل إلى «${r.school}».`)}catch(e){if(valid())notice(e.message,true)}finally{b.disabled=false}}

 function mount(){
  const tabs=document.querySelector('#app .tabs'),main=document.querySelector('#app main')||document.querySelector('#app .wrap');if(!tabs||!main||!apiBase||document.getElementById('schools'))return;
  tab=document.createElement('button');tab.type='button';tab.className='light';tab.dataset.view='schools';tab.textContent='المدارس';tabs.append(tab);
  section=document.createElement('section');section.id='schools';section.className='view';section.dir='rtl';
  section.innerHTML=`<div class="sc-head"><div><h2>مراسلة المدارس</h2><p>مدارس الدولة مقسّمة بالإمارة. اختر الإمارة والقالب، راجع المعاينة، ثم أرسل.</p></div><div class="sc-actions"><button type="button" class="light" data-sc-import>استيراد ملف المدارس (Excel)</button><input type="file" data-sc-file accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden><button type="button" class="light" data-sc-refresh>تحديث</button></div></div>
<p class="sc-notice" data-sc-notice role="status" hidden></p><p class="sc-notice is-error" data-sc-mail-off hidden>خدمة البريد غير مهيأة على الخادم حاليًا؛ يمكنك التجهيز والمعاينة، والإرسال يتفعّل بعد ضبطها.</p>
<div class="sc-stats" data-sc-totals></div>
<div class="sc-empty" data-sc-empty hidden><h3>ابدأ برفع ملف المدارس</h3><p>ارفع ملف Excel الذي فيه ورقة لكل إمارة (مدارس دبي، مدارس أبوظبي، …). تُقرأ أوراق المدارس فقط، وإعادة الرفع لاحقًا تحدّث البيانات دون أن تمسح سجل الإرسال.</p><button type="button" data-sc-import-2>اختيار الملف</button></div>
<div data-sc-emirates-wrap hidden><h3 class="sc-step"><span>1</span>اختر الإمارة</h3><div class="sc-emirates" data-sc-emirates></div></div>
<div data-sc-work hidden>
 <div class="sc-tabs" role="tablist"><strong data-sc-current></strong><button type="button" role="tab" data-sc-tab="send">الإرسال</button><button type="button" role="tab" data-sc-tab="list">قائمة المدارس</button><button type="button" role="tab" data-sc-tab="texts">نصوص القوالب</button><button type="button" role="tab" data-sc-tab="log">سجل الإرسال</button></div>
 <div class="sc-send" data-sc-panel="send"><div class="sc-controls">
  <h3 class="sc-step"><span>2</span>اختر شكل الرسالة</h3><div class="sc-templates" data-sc-templates></div>
  <label><span>لغة الرسالة</span><select data-sc-language>${languages.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select><small>تلقائي: العربية للمنهج الوزاري، الإنجليزية للمناهج الأجنبية، وباللغتين حين لا يُعرف المنهج.</small></label>
  <h3 class="sc-step"><span>3</span>من يستلم؟</h3>
  <div class="sc-checks">${[1,2,3].map(p=>`<label><input type="checkbox" data-sc-priority value="${p}" checked> أولوية ${priorityNames[p]}</label>`).join('')}<label><input type="checkbox" data-sc-only-new checked> المدارس التي لم تُراسَل من قبل فقط</label><label><input type="checkbox" data-sc-no-personal checked> استثناء العناوين التي تبدو شخصية باسم موظف</label></div>
  <div class="sc-two"><label><span>حجم الدفعة</span><input type="number" data-sc-limit min="1" max="3000" inputmode="numeric" placeholder="الكل"><small>يبدأ بالأولوية الأعلى.</small></label><label><span>موعد الإرسال (اختياري)</span><input type="datetime-local" data-sc-schedule><small>اتركه فارغًا للإرسال الآن.</small></label></div>
  <div class="sc-audience" data-sc-audience aria-live="polite"></div>
  <h3 class="sc-step"><span>4</span>جرّب ثم أرسل</h3>
  <div class="sc-test"><input type="email" data-sc-test-email dir="ltr" placeholder="بريدك لاستلام التجربة" autocomplete="email"><button type="button" class="light" data-sc-test>أرسل تجربة إلى بريدي</button></div>
  <button type="button" class="sc-send-button" data-sc-send disabled>إرسال</button>
 </div><div class="sc-preview"><div class="sc-preview-bar"><label><span>المعاينة باسم مدرسة</span><select data-sc-sample></select></label><button type="button" class="light" data-sc-edit-this>تعديل نصوص هذا القالب</button></div><p class="sc-subject"><span>العنوان:</span> <strong data-sc-subject></strong></p><iframe data-sc-frame title="معاينة رسالة المدارس" sandbox=""></iframe><small data-sc-preview-note class="sc-muted"></small></div></div>
 <div data-sc-panel="list" hidden><div class="sc-toolbar"><label><span>بحث</span><input type="search" data-sc-search placeholder="اسم المدرسة أو البريد أو المنطقة"></label><label><span>عرض</span><select data-sc-list-filter><option value="">كل المدارس</option><option value="new">لم تُراسَل بعد</option><option value="sent">وصلتها رسالة</option><option value="1">أولوية 1</option><option value="2">أولوية 2</option><option value="3">أولوية 3</option><option value="noemail">بلا بريد</option><option value="excluded">مستثناة أو ألغت الاستلام</option></select></label><span data-sc-list-count class="sc-muted"></span></div><div class="sc-table" data-sc-list></div></div>
 <div class="sc-send" data-sc-panel="texts" hidden><div class="sc-controls"><div class="sc-two"><label><span>القالب</span><select data-sc-edit-template></select></label><label><span>نسخة اللغة</span><select data-sc-edit-language><option value="ar">العربية</option><option value="en">English</option></select></label></div><p class="sc-muted">كل ما يظهر في الرسالة يُعدَّل من هنا، والمعاينة تتحدث مع الكتابة. اترك أي حقل فارغًا ليختفي من الرسالة، وأضف أو احذف أسطر القوائم كما تشاء. يمكن استخدام {{school}} لاسم المدرسة، {{emirate}} للإمارة، و{{authority}} للجهة التعليمية فيها.</p><div class="sc-fields" data-sc-fields></div><h3 class="sc-step">التوقيع والتذييل وبيانات التواصل (لكل القوالب)</h3><div class="sc-fields sc-contact" data-sc-contact></div><div class="sc-test"><button type="button" data-sc-save>حفظ النصوص</button><button type="button" class="light" data-sc-reset>استعادة النص الأصلي لهذا القالب</button></div></div><div class="sc-preview"><p class="sc-subject"><span>العنوان:</span> <strong data-sc-edit-subject></strong></p><iframe data-sc-edit-frame title="معاينة النص أثناء التعديل" sandbox=""></iframe></div></div>
 <div data-sc-panel="log" hidden><div class="sc-table" data-sc-log></div></div>
</div>`;
  main.append(section);
  dialog=document.createElement('dialog');dialog.className='sc-dialog';dialog.dir='rtl';dialog.innerHTML='<h3>تأكيد الإرسال</h3><p data-sc-confirm-text></p><p class="sc-error" data-sc-confirm-error role="alert"></p><div class="sc-test"><button type="button" data-sc-confirm-ok>نعم، أرسل الآن</button><button type="button" class="light" data-sc-confirm-cancel>رجوع</button></div>';document.body.append(dialog);
  dialog.querySelector('[data-sc-confirm-cancel]').onclick=()=>dialog.close();dialog.querySelector('[data-sc-confirm-ok]').onclick=send;
  tab.onclick=()=>{if(!valid())return;document.querySelectorAll('#app .tabs button,#app .view').forEach(n=>n.classList.remove('active'));tab.classList.add('active');section.classList.add('active');load()};
  q('[data-sc-refresh]').onclick=load;q('[data-sc-import]').onclick=q('[data-sc-import-2]').onclick=()=>q('[data-sc-file]').click();q('[data-sc-file]').onchange=e=>importFile(e.target.files[0]);
  q('[data-sc-emirates]').onclick=e=>{const b=e.target.closest('[data-sc-emirate]');if(b)selectEmirate(b.dataset.scEmirate)};
  qa('[data-sc-tab]').forEach(b=>b.onclick=()=>showPanel(b.dataset.scTab));
  q('[data-sc-templates]').onchange=e=>{state.templateId=e.target.value;renderTemplates();refreshAudience();refreshPreview()};
  q('[data-sc-language]').onchange=e=>{state.language=e.target.value;refreshAudience();refreshPreview()};
  qa('[data-sc-priority],[data-sc-only-new],[data-sc-no-personal]').forEach(n=>n.onchange=refreshAudience);q('[data-sc-limit]').oninput=refreshAudience;
  q('[data-sc-sample]').onchange=()=>refreshPreview(state.panel==='texts'?collect():undefined);
  q('[data-sc-test]').onclick=sendTest;q('[data-sc-send]').onclick=confirmSend;
  q('[data-sc-search]').oninput=renderList;q('[data-sc-list-filter]').onchange=renderList;
  q('[data-sc-list]').onclick=async e=>{const b=e.target.closest('[data-sc-exclude]');if(!b)return;const school=schools.find(s=>s.id===b.dataset.scExclude);if(!school)return;b.disabled=true;try{const r=await post('/'+school.id,{excluded:!school.excluded},'PATCH');school.excluded=r.excluded;renderList()}catch(err){if(valid())notice(err.message,true)}};
  q('[data-sc-edit-template]').onchange=e=>{state.editTemplate=e.target.value;renderEditor()};q('[data-sc-edit-language]').onchange=e=>{state.editLanguage=e.target.value;renderEditor()};
  q('[data-sc-fields]').oninput=q('[data-sc-contact]').oninput=()=>refreshPreview(collect());
  q('[data-sc-save]').onclick=saveSettings;
  q('[data-sc-edit-this]').onclick=()=>{state.editTemplate=state.templateId;if(['ar','en'].includes(state.language)){state.editLanguage=state.language;q('[data-sc-edit-language]').value=state.language}showPanel('texts')};
  q('[data-sc-reset]').onclick=()=>{const t=definition();qa('[data-sc-field]').forEach(n=>{n.value=t.fields.find(f=>f.key===n.dataset.scField)[state.editLanguage]});refreshPreview(collect());notice('عاد النص الأصلي في المحرر. اضغط «حفظ النصوص» لاعتماده.')};
  try{q('[data-sc-test-email]').value=localStorage.getItem('inexc_sc_test_email')||''}catch{}
  window.addEventListener('inexc:locked',()=>{sequence++;overview=settings=null;schools=[];state.emirate='';audienceCount=null;if(dialog.open)dialog.close();for(const s of ['[data-sc-totals]','[data-sc-emirates]','[data-sc-list]','[data-sc-log]','[data-sc-audience]'])q(s).replaceChildren();qa('iframe').forEach(f=>f.srcdoc='');q('[data-sc-work]').hidden=true;notice('')});
  window.addEventListener('inexc:unlocked',()=>{if(section.classList.contains('active'))load()});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
