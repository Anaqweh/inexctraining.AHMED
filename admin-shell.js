/* Layout adapter: preserve original tabs, handlers, forms and API workflows. */
(()=>{'use strict';
 const icons={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',book:'M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z M13 7a3 3 0 0 1 3-3h5v15h-4a4 4 0 0 0-4 2',award:'M6 3h12v14H6z M9 7h6 M9 11h6 M10 17l-1 5 3-2 3 2-1-5',list:'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',card:'M3 5h18v14H3z M3 9h18 M6 15h4',users:'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-2a7 7 0 0 1 14 0v2 M17 4a4 4 0 0 1 0 8 M19 15a6 6 0 0 1 3 6',mail:'M3 5h18v14H3z M3 6l9 7 9-7',bell:'M5 17h14l-2-4V9a5 5 0 0 0-10 0v4z M10 21h4',star:'m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',spark:'m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3z',paint:'M4 4h16v9H4z M12 13v8 M7 4v5 M17 4v5',menu:'M4 6h16 M4 12h16 M4 18h16',arrow:'M14 5l-7 7 7 7',close:'m6 6 12 12 M18 6 6 18',chev:'m8 10 4 4 4-4',gear:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2'};
 const icon=name=>`<svg data-shell-icon aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${icons[name]||icons.grid}"/></svg>`;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 /* مراكز موحّدة: كل مركز يضم أقسامًا قائمة كما هي، وتنقّلها يتم بوكالة النقر على أزرارها الأصلية. */
 const hubs={training:{title:'الدورات التدريبية',desc:'كل ما يخص الدورات في مكان واحد: المحتوى، المشروعات، البطاقات، والشهادات.',icon:'book',views:['courses','course-projects','board-cards','certificate-requests']},members:{title:'الباقات والمتدربون',desc:'الباقات التدريبية، المشترون، وبطاقات المتدربين.',icon:'users',views:['memberships','card-directory']},comms:{title:'التواصل',desc:'الرسائل والمشتركون والتنبيهات وآراء المتدربين.',icon:'mail',views:['message-center','new-subscribers','course-alerts','testimonials']},settings:{title:'الإعدادات',desc:'طرق الدفع وهوية الموقع.',icon:'gear',views:['payments','branding']}};
 const viewHub={};for(const [hubId,hub] of Object.entries(hubs))for(const v of hub.views)viewHub[v]=hubId;
 const shortNames={courses:'الدورات','course-projects':'المشروعات','board-cards':'بطاقات الدورات','certificate-requests':'طالبو الشهادات',memberships:'الباقات التدريبية','card-directory':'المشترون والبطاقات','message-center':'مركز الرسائل','new-subscribers':'المشتركون الجدد','course-alerts':'تنبيهات الدورات',testimonials:'آراء المتدربين',payments:'طرق الدفع',branding:'هوية الموقع'};
 const navOrder=['overview','registrations','hub:training','services','hub:members','hub:comms','hub:settings'];
 const HUBLAST='inexc_admin_hub_last_v1';const hubLast=()=>{try{const v=JSON.parse(sessionStorage.getItem(HUBLAST)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}catch{return {}}};
 const sections={'course-projects':['مشروعات الدورات','شارك تعليمات الدورة وملفاتها وتابع مشروعات المتدربين.',1,0.5,'book'],'board-cards':['بطاقات الدورات','نماذج البطاقات وأسعارها وروابط الدفع لكل دورة.',1,3,'card'],overview:['نظرة عامة','ملخص عملك والوصول السريع إلى الأقسام.',0,0,'grid'],registrations:['طلبات التسجيل','راجع الطلبات وتابع حالات التسجيل من مكان واحد.',0,1,'list'],courses:['الدورات التدريبية','إدارة الدورات ومحتواها ومواعيدها.',1,0,'book'],'certificate-requests':['طالبو الشهادات','طلبات الشهادات والأسماء المعتمدة وحالة الدفع لكل دورة.',1,2,'award'],services:['الخدمات','أضف خدماتك ورتّب ظهورها للزوار.',1,1,'spark'],memberships:['الباقات التدريبية','إدارة الباقات التدريبية وطلبات شرائها.',2,0,'card'],'card-directory':['الباقات وبطاقات المتدربين','المشترون والباقات الصادرة وسجلات المتدربين.',2,1,'users'],'message-center':['مركز الرسائل','جهّز رسائلك وتابع حملاتك البريدية.',3,0,'mail'],'new-subscribers':['المشتركون الجدد','تابع المشتركين الجدد في قائمتك البريدية.',3,1,'users'],'course-alerts':['تنبيهات الدورات','إعداد تنبيهات الدورات ومتابعة إرسالها.',3,2,'bell'],testimonials:['آراء المتدربين','راجع تجارب المتدربين التي تظهر على الموقع.',3,3,'star'],payments:['طرق الدفع','التحكم في طرق الدفع المتاحة للدورات.',4,0,'card'],branding:['هوية الموقع','الشعار وإعدادات الظهور على الموقع.',4,1,'paint']};
 function mount(){
  const app=document.getElementById('app'),tabs=app?.querySelector('.tabs'),main=app?.querySelector('main'),bar=app?.querySelector('.bar');if(!app||!tabs||!main||!bar||app.classList.contains('admin-shell'))return;
  app.classList.add('admin-shell');
  const sidebar=document.createElement('aside');sidebar.id='adminSidebar';sidebar.className='as-sidebar';sidebar.setAttribute('aria-label','قائمة الإدارة');
  const brand=bar.querySelector('.brand');sidebar.innerHTML='<div class="as-brand"><button type="button" class="as-close" aria-label="إغلاق القائمة">'+icon('close')+'</button></div><p class="as-caption">لوحة الإدارة</p><label class="as-nav-search"><span>ابحث عن قسم <kbd>/</kbd></span><input type="search" placeholder="اسم القسم…" aria-label="البحث في أقسام الإدارة" autocomplete="off"></label>';
  if(brand)sidebar.querySelector('.as-brand').prepend(brand);tabs.setAttribute('aria-label','أقسام الإدارة');sidebar.append(tabs);
  const noResults=document.createElement('p');noResults.className='as-nav-empty';noResults.hidden=true;noResults.textContent='لا يوجد قسم بهذا الاسم.';sidebar.append(noResults);
  const footer=document.createElement('div');footer.className='as-sidebar-footer';footer.innerHTML='<a href="/" target="_blank" rel="noopener noreferrer">عرض الموقع ↗</a>';sidebar.append(footer);app.prepend(sidebar);
  const menu=document.createElement('button');menu.type='button';menu.className='as-menu';menu.setAttribute('aria-label','فتح قائمة الإدارة');menu.setAttribute('aria-controls',sidebar.id);menu.setAttribute('aria-expanded','false');menu.innerHTML=icon('menu');
  const heading=document.createElement('div');heading.className='as-page-heading';heading.innerHTML='<span>INEXC · مساحة الإدارة</span><h1></h1>';
  bar.prepend(menu,heading);const draft=document.getElementById('admin-draft-status');if(draft)footer.append(draft);
  const session=document.createElement('p');session.className='as-session-note';session.hidden=true;footer.append(session);
  const tickSession=()=>{const left=Number(window.INEXCAdminSession?.expiresAt)-Date.now();if(!Number.isFinite(left)||left<=0){session.hidden=true;return}const m=Math.max(1,Math.round(left/60000));const next='تُقفل الجلسة تلقائيًا خلال '+m+' دقيقة تقريبًا.';if(session.textContent!==next)session.textContent=next;session.hidden=false};
  setInterval(tickSession,30000);window.addEventListener('inexc:unlocked',tickSession);window.addEventListener('inexc:locked',()=>{session.hidden=true});tickSession();
  const backdrop=document.createElement('button');backdrop.className='as-backdrop';backdrop.type='button';backdrop.tabIndex=-1;backdrop.setAttribute('aria-label','إغلاق قائمة الإدارة');backdrop.hidden=true;app.append(backdrop);
  const intro=document.createElement('p');intro.className='as-page-description';main.prepend(intro);
  const subnav=document.createElement('nav');subnav.className='as-subnav';subnav.hidden=true;subnav.setAttribute('aria-label','أقسام فرعية');intro.before(subnav);
  subnav.addEventListener('click',e=>{const b=e.target.closest('[data-as-sub]');if(b)tabs.querySelector(`button[data-view="${b.dataset.asSub}"]`)?.click()});
  const overview=document.createElement('section');overview.id='overview';overview.className='view as-overview';overview.innerHTML=`<div class="as-welcome"><div><span class="as-eyebrow">INEXC TRAINING</span><h2>كل ما تحتاجه لإدارة يومك.</h2><p>طلباتك، برامجك، خدماتك والتواصل مع متدربيك.</p></div><a href="/" target="_blank" rel="noopener noreferrer">زيارة الموقع ${icon('arrow')}</a></div><div class="as-stats">${[['total','إجمالي طلبات التسجيل'],['review','بانتظار مراجعة الوصل'],['paid','شهادات مسددة فعليًا'],['amount','دخل الشهادات المحصّل · د.إ']].map(([id,label])=>`<div class="as-stat"><span>${label}</span><strong data-as-metric="${id}">—</strong></div>`).join('')}</div><div class="as-section-title"><h2>جميع الأقسام</h2><span>مراكز موحّدة، كل مركز يضم أقسامه</span></div><div class="as-directory"></div><p class="as-overview-note">الأرقام حسب الطلبات والفلاتر الحالية. الدخل يخص رسوم الشهادات المسددة إلكترونيًا والمطابقة للطلبات.</p>`;main.append(overview);
  const overviewTab=document.createElement('button');overviewTab.type='button';overviewTab.className='light';overviewTab.dataset.view='overview';overviewTab.textContent='نظرة عامة';tabs.prepend(overviewTab);
  overviewTab.onclick=()=>{if(!window.INEXCAdminSession?.valid())return;app.querySelectorAll('.tabs button,.view').forEach(e=>e.classList.remove('active'));overviewTab.classList.add('active');overview.classList.add('active');};
  overview.addEventListener('click',e=>{const b=e.target.closest('[data-as-open]');if(b)tabs.querySelector(`[data-view="${b.dataset.asOpen}"]`)?.click()});
  function directory(){const dir=overview.querySelector('.as-directory');if(!dir)return;
   const mounted=v=>tabs.querySelector(`button[data-view="${v}"]`);
   const card=v=>{const meta=sections[v]||[mounted(v)?.textContent.trim()||v,'',4,99,'grid'];return `<button type="button" data-as-open="${esc(v)}"><span class="as-shortcut-icon">${icon(meta[4])}</span><strong>${esc(meta[0])}</strong><span>${esc(meta[1])}</span><small>فتح القسم ←</small></button>`};
   const solo=[...tabs.querySelectorAll('button[data-view]')].map(b=>b.dataset.view).filter(v=>v!=='overview'&&!viewHub[v]);
   const blocks=[['مساحة العمل',solo],...Object.values(hubs).map(h=>[h.title,h.views.filter(v=>mounted(v))])];
   const sig=blocks.map(([,views])=>views.join(',')).join('|');if(dir.dataset.views===sig)return;dir.dataset.views=sig;
   dir.innerHTML=blocks.map(([title,views])=>views.length?'<section class="as-dir-group"><h3>'+esc(title)+'</h3><div class="as-shortcuts">'+views.map(card).join('')+'</div></section>':'').join('')}
  let previousFocus,opened=false;const narrow=()=>window.matchMedia('(max-width: 1100px)').matches;
  function setDrawer(value){opened=value&&narrow();app.classList.toggle('as-nav-open',opened);backdrop.hidden=!opened;menu.setAttribute('aria-expanded',String(opened));sidebar.inert=narrow()&&!opened;sidebar.setAttribute('aria-hidden',String(narrow()&&!opened));if(opened)previousFocus=document.activeElement;bar.inert=opened;main.inert=opened;if(opened){sidebar.querySelector('.as-close').focus();(window.requestAnimationFrame||((fn)=>setTimeout(fn,0)))(()=>{if(opened)sidebar.querySelector('.as-close').focus()})}else if(previousFocus?.isConnected){previousFocus.focus();previousFocus=null}}
  document.addEventListener('keydown',e=>{if(opened&&e.key==='Escape'){e.preventDefault();setDrawer(false)}});menu.onclick=()=>setDrawer(!opened);sidebar.querySelector('.as-close').onclick=()=>setDrawer(false);backdrop.onclick=()=>setDrawer(false);
  sidebar.addEventListener('keydown',e=>{if(!opened)return;if(e.key==='Escape'){e.preventDefault();setDrawer(false)}if(e.key==='Tab'){const nodes=[...sidebar.querySelectorAll('button,input,a')].filter(n=>!n.disabled&&!n.hidden&&n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}});
  window.addEventListener('resize',()=>{if(!narrow())setDrawer(false);else if(!opened)setDrawer(false)});setDrawer(false);
  tabs.addEventListener('click',e=>{if(e.target.closest('button[data-view]')&&narrow())setDrawer(false)});
  const search=sidebar.querySelector('input');
  function filter(){const term=search.value.trim();
   for(const b of tabs.querySelectorAll('button[data-view]'))b.hidden=term?!b.textContent.includes(term):!!viewHub[b.dataset.view];
   for(const hb of tabs.querySelectorAll('[data-as-hub]'))hb.hidden=!!term&&!hb.textContent.includes(term);
   noResults.hidden=!term||[...tabs.querySelectorAll('button[data-view],[data-as-hub]')].some(b=>!b.hidden)}
  search.oninput=filter;
  document.addEventListener('keydown',e=>{if(e.key!=='/'||e.ctrlKey||e.metaKey||e.altKey)return;const t=document.activeElement;if(t&&(t.matches('input,textarea,select')||t.isContentEditable))return;if(!window.INEXCAdminSession?.valid?.())return;if(narrow()&&!opened)return;e.preventDefault();search.focus()});
  const hubBtns={};function hubBtn(id){if(hubBtns[id])return hubBtns[id];const h=hubs[id];const b=document.createElement('button');b.type='button';b.className='as-nav-item as-hub';b.dataset.asHub=id;b.title=h.title;b.innerHTML=icon(h.icon)+'<span>'+esc(h.title)+'</span>';
   b.onclick=()=>{const last=hubLast()[id];const pick=(viewHub[last]===id&&tabs.querySelector(`button[data-view="${last}"]`))?last:h.views.find(v=>tabs.querySelector(`button[data-view="${v}"]`));if(pick)tabs.querySelector(`button[data-view="${pick}"]`)?.click()};
   return hubBtns[id]=b}
  function decorate(){
   const buttons=[...tabs.querySelectorAll('button[data-view]')];for(const b of buttons){const meta=sections[b.dataset.view]||[b.textContent,'',4,99,'grid'];b.dataset.asGroup=String(meta[2]);b.title=meta[0];if(!b.querySelector('svg'))b.insertAdjacentHTML('afterbegin',icon(meta[4]));b.classList.add('as-nav-item');b.classList.toggle('as-merged',!!viewHub[b.dataset.view]);}
   const have=v=>buttons.find(b=>b.dataset.view===v);
   const seq=[];for(const entry of navOrder){if(entry.startsWith('hub:')){const id=entry.slice(4);if(hubs[id].views.some(v=>have(v)))seq.push(hubBtn(id))}else if(have(entry))seq.push(have(entry))}
   for(const b of buttons)if(!viewHub[b.dataset.view]&&!seq.includes(b))seq.push(b);
   for(const b of buttons)if(viewHub[b.dataset.view])seq.push(b);
   const current=[...tabs.children];if(current.length!==seq.length||seq.some((n,i)=>n!==current[i])){tabs.querySelectorAll('.as-group-label').forEach(n=>n.remove());seq.forEach(n=>tabs.append(n))}
   directory();filter();sync();
  }
  let activeId='';
  function renderSubnav(){const hubId=viewHub[activeId];if(!hubId){subnav.hidden=true;return}
   const views=hubs[hubId].views.filter(v=>tabs.querySelector(`button[data-view="${v}"]`));const sig=hubId+':'+views.join(',');
   if(subnav.dataset.sig!==sig){subnav.dataset.sig=sig;subnav.innerHTML=views.map(v=>`<button type="button" data-as-sub="${v}"><span>${esc(shortNames[v]||sections[v]?.[0]||v)}</span></button>`).join('')}
   for(const b of subnav.querySelectorAll('[data-as-sub]')){const on=b.dataset.asSub===activeId;b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
    const n=tabs.querySelector(`button[data-view="${b.dataset.asSub}"]`)?.querySelector('[data-new-subscriber-count]')?.textContent.trim();let badge=b.querySelector('.as-count');
    if(n){if(!badge){badge=document.createElement('span');badge.className='as-count';b.append(badge)}if(badge.textContent!==n)badge.textContent=n}else if(badge)badge.remove()}
   subnav.hidden=false}
  function sync(){const active=tabs.querySelector('button[data-view].active');
   if(active&&activeId!==active.dataset.view){activeId=active.dataset.view;const meta=sections[activeId]||[active.textContent,''];const hubId=viewHub[activeId];
    heading.querySelector('h1').textContent=meta[0];heading.querySelector('span').textContent='INEXC · '+(hubId?hubs[hubId].title:'مساحة الإدارة');
    intro.textContent=meta[1];intro.hidden=activeId==='overview';
    if(hubId){const last=hubLast();if(last[hubId]!==activeId){last[hubId]=activeId;try{sessionStorage.setItem(HUBLAST,JSON.stringify(last))}catch{}}}
    filter();}
   renderSubnav();
   for(const b of tabs.querySelectorAll('button[data-view]')){const value=b.classList.contains('active')?'page':null;if(value&&b.getAttribute('aria-current')!==value)b.setAttribute('aria-current',value);else if(!value&&b.hasAttribute('aria-current'))b.removeAttribute('aria-current');}
   const activeHub=active?viewHub[activeId]||'':'';for(const hb of Object.values(hubBtns)){if(hb.classList.contains('active'))hb.classList.remove('active');const on=hb.dataset.asHub===activeHub;if(on&&hb.getAttribute('aria-current')!=='page')hb.setAttribute('aria-current','page');else if(!on&&hb.hasAttribute('aria-current'))hb.removeAttribute('aria-current')}}
  let queued=false;new MutationObserver(records=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;if(records.some(r=>r.type==='childList'))decorate();else sync()})}).observe(tabs,{childList:true,subtree:false,attributes:false});
  new MutationObserver(()=>sync()).observe(tabs,{subtree:true,attributes:true,attributeFilter:['class']});
  function updateMetrics(){overview.querySelectorAll('[data-as-metric]').forEach(n=>{const value=document.getElementById(n.dataset.asMetric)?.textContent||'—';if(n.textContent!==value)n.textContent=value})}document.querySelector('#registrations .metrics')&&new MutationObserver(updateMetrics).observe(document.querySelector('#registrations .metrics'),{childList:true,subtree:true,characterData:true});
  function defaultView(){if(!window.INEXCAdminDrafts?.lastView&&!location.hash)overviewTab.click();updateMetrics();sync()}
  window.addEventListener('inexc:unlocked',defaultView);window.addEventListener('inexc:locked',()=>{setDrawer(false);search.value='';filter();subnav.hidden=true;overview.querySelectorAll('[data-as-metric]').forEach(n=>n.textContent='—')});
  decorate();if(window.INEXCAdminSession?.valid())defaultView();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
