import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import zlib from 'node:zlib';
import {PGlite} from '@electric-sql/pglite';
import {readXlsxSheets} from '../schools-xlsx.js';
import {setupSchoolsOutreach,installSchoolsOutreach,parseSchoolSheets} from '../schools-outreach.js';
import {renderSchoolMail,schoolLanguage,schoolName,schoolSettings,schoolTemplates} from '../schools-mail.js';

// مصنف XLSX مصطنع (عناوين example.com فقط) يُبنى في الذاكرة: مدخلات مضغوطة ومخزّنة معًا.
function zip(files){
 const locals=[],central=[];let offset=0;
 for(const [name,text,deflate] of files){
  const data=Buffer.from(text,'utf8'),body=deflate?zlib.deflateRawSync(data):data,n=Buffer.from(name,'utf8'),head=Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50,0);head.writeUInt16LE(20,4);head.writeUInt16LE(0x800,6);head.writeUInt16LE(deflate?8:0,8);head.writeUInt32LE(zlib.crc32(data),14);head.writeUInt32LE(body.length,18);head.writeUInt32LE(data.length,22);head.writeUInt16LE(n.length,26);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(deflate?8:0,10);c.writeUInt32LE(zlib.crc32(data),16);c.writeUInt32LE(body.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
  locals.push(head,n,body);central.push(c,n);offset+=30+n.length+body.length;
 }
 const dir=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,dir,end]);
}
const x=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;');
function workbook(sheets){
 const strings=[],index=v=>{let i=strings.indexOf(v);if(i<0){strings.push(v);i=strings.length-1}return i};
 const sheetXml=rows=>'<worksheet><sheetData>'+rows.map((r,y)=>'<row r="'+(y+1)+'">'+r.map((v,i)=>v===''?'':i%2?`<c r="${String.fromCharCode(65+i)}${y+1}" t="inlineStr"><is><t>${x(v)}</t></is></c>`:`<c r="${String.fromCharCode(65+i)}${y+1}" t="s"><v>${index(v)}</v></c>`).join('')+'</row>').join('')+'</sheetData></worksheet>';
 const bodies=sheets.map(s=>sheetXml(s.rows));
 return zip([
  ['xl/workbook.xml','<workbook xmlns:r="x"><sheets>'+sheets.map((s,i)=>`<sheet name="${x(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')+'</sheets></workbook>',true],
  ['xl/_rels/workbook.xml.rels','<Relationships>'+sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Target="worksheets/sheet${i+1}.xml"/>`).join('')+'</Relationships>',false],
  ...bodies.map((b,i)=>['xl/worksheets/sheet'+(i+1)+'.xml',b,i%2===0]),
  ['xl/sharedStrings.xml','<sst>'+strings.map(s=>`<si><t>${x(s)}</t></si>`).join('')+'</sst>',true],
 ]);
}
const header=['المدرسة','البريد الإلكتروني','الهاتف','المنطقة','نوع العنوان','المنهج','التقييم وملاحظات','الموقع الإلكتروني','مصدر البريد','الأولوية','مصدر السجل','حالة التواصل'];
const school=(name,email,type,curriculum,priority)=>[name,email,'04 000 0000','المنطقة',type,curriculum,'','','دليل','' + priority,'اختبار',''];
const sample=()=>workbook([
 {name:'ملخص',rows:[['جهات التواصل'],['الإمارة','عدد المدارس']]},
 {name:'مدارس دبي',rows:[['مدارس دبي الخاصة'],['وصف'],[''],header,
  school('مدرسة الأمل الخاصة — Al Amal Private School','amal@example.com','عنوان عام للمدرسة','وزاري','1 - تقييم مقبول'),
  school('Bright & Future School','principal@example.com','مدير المدرسة (عنوان وظيفي)','بريطاني','3 - بقية المدارس'),
  school('مدرسة النور','sara.ali@example.com','يبدو شخصياً باسم موظف','','3 - بقية المدارس'),
  school('مدرسة بلا بريد','','بدون بريد (هاتف فقط)','وزاري','2 - وزاري عربي'),
  school('مدرسة التكرار','amal@example.com','عنوان عام للمدرسة','وزاري','2 - وزاري عربي'),
  school('مدرسة بريد خاطئ','not-an-email','غير مصنّف - راجعوه','','3 - بقية المدارس'),
  school('Bright & Future School','accounts@example.com','قسم آخر (حسابات وغيره)','بريطاني','3 - بقية المدارس')]},
 {name:'مدارس الشارقة',rows:[['مدارس الشارقة الخاصة'],header,school('مدرسة الشارقة النموذجية','shj@example.com','بريد رسمي للمدرسة من الهيئة','','3 - بقية المدارس')]},
 {name:'مراكز تدريب أخرى',rows:[['الجهة','البريد الإلكتروني'],['مركز','center@example.com']]},
]);

async function harness({mailEnabled=true}={}){
 const db=new PGlite();
 const query=async(sql,params)=>{const r=params?await db.query(sql,params):(await db.exec(sql)).at(-1);return {...r,rows:r?.rows||[],rowCount:r?.affectedRows??r?.rows?.length??0}};
 const pool={query,connect:async()=>({query,release(){}})};
 // أقل ما يلزم من جداول نظام الرسائل الحالي.
 await query(`CREATE TABLE email_campaigns(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),subject TEXT NOT NULL,body TEXT NOT NULL,audience TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',scheduled_at TIMESTAMPTZ,sent_at TIMESTAMPTZ,total_recipients INTEGER NOT NULL DEFAULT 0,skipped_unsubscribed INTEGER NOT NULL DEFAULT 0,course_name TEXT NOT NULL DEFAULT '',settings JSONB NOT NULL DEFAULT '{}',audience_snapshot JSONB NOT NULL DEFAULT '{}',submission_key TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE email_deliveries(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,email TEXT NOT NULL,recipient_name TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'sent',delivered_at TIMESTAMPTZ,opened_at TIMESTAMPTZ,clicked_at TIMESTAMPTZ,error TEXT NOT NULL DEFAULT '',unsubscribe_token TEXT NOT NULL DEFAULT gen_random_uuid()::text,payload_snapshot JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE message_suppressions(email TEXT PRIMARY KEY);
  CREATE TABLE email_preferences(email TEXT PRIMARY KEY,unsubscribe_token TEXT,marketing_opt_out BOOLEAN NOT NULL DEFAULT false);
  CREATE TABLE message_contacts(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),normalized_email TEXT,suppressed BOOLEAN NOT NULL DEFAULT false);`);
 await setupSchoolsOutreach(pool);await setupSchoolsOutreach(pool);
 const app=express();app.use(express.json({limit:'1mb'}));const sent=[];let worked=0;
 const auth=(req,res,next)=>req.headers.authorization==='Bearer ok'?next():res.status(401).json({error:'no'});
 installSchoolsOutreach({app,pool,auth,mailEnabled,sendEmail:async m=>{sent.push(m)},worker:()=>{worked++}});
 const server=await new Promise(r=>{const s=app.listen(0,()=>r(s))}),url='http://127.0.0.1:'+server.address().port+'/api/admin/schools';
 const api=async(path,method='GET',body,token='ok')=>{const init={method,headers:{Authorization:'Bearer '+token}};if(Buffer.isBuffer(body)){init.headers['Content-Type']='application/octet-stream';init.body=body}else if(body!==undefined){init.headers['Content-Type']='application/json';init.body=JSON.stringify(body)}const r=await fetch(url+path,init);return {status:r.status,data:await r.json()}};
 return {api,query,sent,worked:()=>worked,close:async()=>{server.close();await db.close()}};
}

test('xlsx reader returns every sheet with shared and inline strings',()=>{
 const sheets=readXlsxSheets(sample());
 assert.deepEqual(sheets.map(s=>s.name),['ملخص','مدارس دبي','مدارس الشارقة','مراكز تدريب أخرى']);
 assert.equal(sheets[1].rows[4][0],'مدرسة الأمل الخاصة — Al Amal Private School');
 assert.equal(sheets[1].rows[5][0],'Bright & Future School');
 assert.throws(()=>readXlsxSheets(Buffer.from('not a zip file at all, definitely')),/XLSX/);
});

test('only sheets named «مدارس …» become schools; emirate comes from the sheet name',()=>{
 const parsed=parseSchoolSheets(readXlsxSheets(sample()));
 assert.deepEqual(parsed.used.map(u=>[u.emirate,u.count]),[['دبي',6],['الشارقة',1]]);
 assert.deepEqual(parsed.skipped,['ملخص','مراكز تدريب أخرى']);
 assert.equal(parsed.invalidEmails,1);
 assert.equal(parsed.merged,1);assert.equal(parsed.rows.find(r=>r.name==='Bright & Future School').email,'principal@example.com','the principal address wins over accounts');
 assert.equal(parsed.rows.find(r=>r.name==='مدرسة بريد خاطئ').email,'');
 assert.equal(parsed.rows[0].priority,1);
});

test('language follows curriculum, with a bilingual fallback',()=>{
 assert.equal(schoolLanguage({curriculum:'وزاري / أمريكي',name:'x'}),'ar');
 assert.equal(schoolLanguage({curriculum:'بريطاني',name:'مدرسة'}),'en');
 assert.equal(schoolLanguage({curriculum:'',name:'مدرسة النور — Al Noor'}),'both');
 assert.equal(schoolLanguage({curriculum:'',name:'Bright School'}),'en');
 assert.equal(schoolLanguage({curriculum:'وزاري',language:'en'}),'en');
 assert.equal(schoolLanguage({curriculum:'وزاري'},'both'),'both');
 assert.equal(schoolName('مدرسة الأمل — Al Amal School','ar'),'مدرسة الأمل');
 assert.equal(schoolName('مدرسة الأمل — Al Amal School','en'),'Al Amal School');
 assert.equal(schoolName('Bright School','ar'),'Bright School');
});

test('every template renders per school and emirate, escapes names and carries the unsubscribe link',()=>{
 for(const t of schoolTemplates)for(const language of ['ar','en','both']){
  const mail=renderSchoolMail({templateId:t.id,language,school:{name:'مدرسة <b>الأمل</b> — Al Amal School',emirate:'الشارقة',curriculum:'وزاري'},unsubscribeUrl:'https://api.example.test/u?token=abc'});
  assert.ok(mail.subject&&!mail.subject.includes('{{'),t.id+' subject');
  assert.ok(!mail.html.includes('{{')&&!mail.text.includes('{{'),t.id+' leaves no placeholders');
  assert.ok(!mail.html.includes('<b>الأمل</b>'),'school name is escaped');
  assert.ok(mail.html.includes('https://api.example.test/u?token=abc')&&mail.text.includes('https://api.example.test/u?token=abc'));
  assert.ok(mail.html.includes('inexc-logo-email.png'));
  if(language!=='en')assert.ok(mail.html.includes('هيئة الشارقة للتعليم الخاص'),t.id+' names the emirate regulator');
  if(language!=='ar')assert.ok(mail.html.includes('SPEA')&&mail.html.includes('Al Amal School'));
  if(language==='both')assert.ok(mail.html.includes('dir="rtl"')&&mail.html.includes('dir="ltr"'));
 }
 assert.throws(()=>renderSchoolMail({templateId:'nope',school:{}}),/غير معروف/);
});

test('edited texts and per-emirate lines override defaults; unsafe settings fall back',()=>{
 const settings=schoolSettings({whatsapp:'+971 50 000 0000',email:'bad',requestUrl:'javascript:alert(1)',emirateLines:{'دبي':{ar:'سطر خاص بدبي عن {{authority}}'}},templates:{letter:{ar:{greeting:'مرحبًا {{school}}',unknown:'x'}},ghost:{ar:{a:'b'}}}});
 assert.equal(settings.whatsapp,'971500000000');assert.equal(settings.email,'info@inexc.com');assert.match(settings.requestUrl,/^https:\/\/www\.inexctraining\.com\//);
 assert.deepEqual(settings.templates,{letter:{ar:{greeting:'مرحبًا {{school}}'}}});
 const mail=renderSchoolMail({templateId:'letter',language:'ar',school:{name:'مدرسة الأمل',emirate:'دبي'},settings});
 assert.ok(mail.html.includes('مرحبًا مدرسة الأمل')&&mail.html.includes('سطر خاص بدبي عن هيئة المعرفة والتنمية البشرية'));
 assert.ok(renderSchoolMail({templateId:'question',language:'ar',school:{name:'مدرسة الأمل',emirate:'دبي'},settings}).html.includes('https://wa.me/971500000000?text='));
});

test('every part of the message is editable: blank fields disappear, footer, WhatsApp text and emirate names follow settings',()=>{
 const school={name:'مدرسة الأمل',emirate:'دبي'},unsubscribeUrl='https://api.example.test/u?token=abc';
 const settings=schoolSettings({senderTitle:'',footerAr:'تذييل خاص',reasonAr:'',unsubscribeAr:'',websiteLabel:'موقعنا',emirateLines:{'دبي':{nameAr:'إمارة دبي',authorityAr:'الهيئة'}},
  templates:{letter:{ar:{ps:'',pointsTitle:'',subject:''}},day:{ar:{cta:'',eyebrow:'',headline:'',intro:''}},question:{ar:{waText:'من {{school}}: {{answer}}',answers:'إجابة جديدة'}},menu:{ar:{waText:'نختار من {{emirate}}',items:'برنامج وحيد | وصفه'}}}});
 assert.equal(settings.templates.letter.ar.ps,'');assert.equal(settings.unsubscribeAr,'إلغاء استلام رسائلنا','the unsubscribe link can be reworded but never removed');
 const letter=renderSchoolMail({templateId:'letter',language:'ar',school,settings,unsubscribeUrl});
 assert.ok(!letter.html.includes('ملاحظة: يمكن البدء')&&!letter.html.includes('ما الذي يمكن أن نقدمه'),'blank fields are hidden, not reset');
 assert.match(letter.subject,/إلى إدارة مدرسة الأمل/,'a blank subject falls back to the original');
 assert.ok(letter.html.includes('تذييل خاص')&&letter.html.includes('>موقعنا<')&&!letter.html.includes('وصلتكم هذه الرسالة')&&letter.html.includes('إلغاء استلام رسائلنا'));
 assert.ok(letter.html.includes('مدارس إمارة دبي تعمل ضمن متطلبات الهيئة')&&!letter.html.includes('شركة التميز الابتكاري (INEXC) — دبي'));
 const day=renderSchoolMail({templateId:'day',language:'ar',school,settings,unsubscribeUrl});
 assert.ok(!day.html.includes('register.html?type=institution')&&!day.html.includes('يوم واحد. مخرجات'),'empty button and hero are removed');
 const question=renderSchoolMail({templateId:'question',language:'ar',school,settings,unsubscribeUrl});
 assert.ok(question.html.includes(encodeURIComponent('من مدرسة الأمل: إجابة جديدة'))&&!question.html.includes('تحضير الدروس والأنشطة'));
 const menu=renderSchoolMail({templateId:'menu',language:'ar',school,settings,unsubscribeUrl});
 assert.ok(menu.html.includes(encodeURIComponent('نختار من إمارة دبي'))&&menu.html.includes('برنامج وحيد')&&!menu.html.includes('>02<'));
 for(const mail of [letter,day,question,menu])assert.ok(!mail.html.includes('{{')&&!mail.html.includes('undefined')&&!mail.text.includes('undefined'));
});

test('import, audience rules and sending by emirate through the existing campaign queue',async t=>{
 const h=await harness();t.after(h.close);
 assert.equal((await h.api('/overview','GET',undefined,'bad')).status,401);
 assert.equal((await h.api('/import','POST',Buffer.from('junk junk junk junk junk junk'))).status,400);
 const imported=await h.api('/import','POST',sample());
 assert.equal(imported.status,201);assert.equal(imported.data.added,7);assert.equal(imported.data.updated,0);
 const again=await h.api('/import','POST',sample());assert.equal(again.data.added,0);assert.equal(again.data.updated,7);
 const overview=(await h.api('/overview')).data;
 assert.deepEqual(overview.emirates.map(e=>[e.emirate,e.total,e.with_email]),[['دبي',6,4],['الشارقة',1,1]]);
 assert.equal(overview.templates.length,4);

 await h.query("INSERT INTO message_suppressions(email) VALUES('principal@example.com')");
 const base={emirate:'دبي',templateId:'letter',language:'auto'};
 let a=(await h.api('/audience','POST',base)).data.counts;
 // amal (مرة واحدة)، principal ملغى الاشتراك، sara شخصي، واحدة بلا بريد، واحدة بريدها خاطئ.
 assert.deepEqual([a.total,a.noEmail,a.personal,a.unsubscribed,a.duplicate,a.eligible],[6,2,1,1,1,1]);
 a=(await h.api('/audience','POST',{...base,excludePersonal:false})).data.counts;assert.equal(a.eligible,2);
 assert.equal((await h.api('/audience','POST',{...base,excludePersonal:false,priorities:[3]})).data.counts.eligible,1);
 assert.equal((await h.api('/audience','POST',{templateId:'letter'})).status,400);

 const preview=await h.api('/preview','POST',{...base,draft:{templates:{letter:{ar:{greeting:'تحية تجريبية غير محفوظة'}}}}});
 assert.equal(preview.status,200);assert.ok(preview.data.html.includes('تحية تجريبية غير محفوظة'));
 assert.ok(!(await h.api('/preview','POST',base)).data.html.includes('تحية تجريبية غير محفوظة'),'draft text is not saved by previewing');

 const tested=await h.api('/test','POST',{...base,email:'owner@example.com'});
 assert.equal(tested.status,200);assert.equal(h.sent.length,1);assert.equal(h.sent[0].to,'owner@example.com');assert.match(h.sent[0].subject,/^\[تجربة\]/);assert.equal(h.sent[0].replyTo,'info@inexc.com');

 const request={...base,excludePersonal:false,requestId:'request-0001-abcd'};
 assert.equal((await h.api('/send','POST',{...request,confirmCount:5})).status,409,'count mismatch blocks the send');
 assert.equal((await h.query('SELECT count(*)::int AS n FROM email_campaigns')).rows[0].n,0);
 const sent=await h.api('/send','POST',{...request,confirmCount:2});
 assert.equal(sent.status,202);assert.equal(sent.data.total,2);assert.equal(h.worked(),1);
 const repeat=await h.api('/send','POST',{...request,confirmCount:2});assert.equal(repeat.data.reused,true);assert.equal(repeat.data.campaignId,sent.data.campaignId);
 const deliveries=(await h.query('SELECT email,status,unsubscribe_token,payload_snapshot FROM email_deliveries ORDER BY email')).rows;
 assert.deepEqual(deliveries.map(d=>[d.email,d.status]),[['amal@example.com','queued'],['sara.ali@example.com','queued']]);
 for(const d of deliveries){
  assert.ok(d.payload_snapshot.html.includes(encodeURIComponent(d.unsubscribe_token)),'each school gets its own unsubscribe link');
  assert.match(d.payload_snapshot.headers['List-Unsubscribe'],/^<https:\/\/api\.inexctraining\.com\/api\/messages\/unsubscribe\?token=/);
  assert.equal(d.payload_snapshot.replyTo,'info@inexc.com');
 }
 assert.ok(deliveries[0].payload_snapshot.html.includes('مدرسة الأمل الخاصة')&&!deliveries[0].payload_snapshot.html.includes('Al Amal Private School'),'Arabic-curriculum school gets the Arabic name only');
 const campaign=(await h.query('SELECT audience,status,total_recipients,settings FROM email_campaigns')).rows[0];
 assert.equal(campaign.audience,'schools');assert.equal(campaign.settings.schools.emirate,'دبي');

 // بعد الإرسال: لا تتكرر الرسالة لنفس المدارس، والإمارات الأخرى لم تتأثر.
 assert.equal((await h.api('/audience','POST',{...base,excludePersonal:false})).data.counts.eligible,0);
 assert.equal((await h.api('/send','POST',{...base,excludePersonal:false,requestId:'request-0002-abcd',confirmCount:0})).status,400);
 assert.equal((await h.api('/audience','POST',{...base,emirate:'الشارقة'})).data.counts.eligible,1);
 const list=(await h.api('/list?emirate='+encodeURIComponent('دبي'))).data.schools;
 assert.equal(list.find(s=>s.email==='amal@example.com'&&s.send_count===1).delivery_status,'queued');
 assert.equal(list.find(s=>s.name==='Bright & Future School').unsubscribed,true);
 const row=list.find(s=>s.name==='مدرسة النور');
 assert.equal((await h.api('/'+row.id,'PATCH',{excluded:true,contact_status:'تم الاتصال هاتفيًا'})).data.excluded,true);
 assert.equal((await h.api('/'+row.id,'PATCH',{email:'x'})).status,400);
 // إعادة الاستيراد لا تمسح سجل الإرسال ولا الاستثناء ولا الملاحظة.
 await h.api('/import','POST',sample());
 const kept=(await h.api('/list?emirate='+encodeURIComponent('دبي'))).data.schools.find(s=>s.id===row.id);
 assert.deepEqual([kept.excluded,kept.contact_status,kept.send_count],[true,'تم الاتصال هاتفيًا',1]);
 const campaigns=(await h.api('/campaigns')).data.campaigns;assert.equal(campaigns.length,1);assert.equal(campaigns[0].queued,2);
});

test('batch limit takes the highest priority first; sending is refused when mail is off',async t=>{
 const h=await harness({mailEnabled:false});t.after(h.close);
 await h.api('/import','POST',sample());
 const counts=(await h.api('/audience','POST',{emirate:'دبي',excludePersonal:false,limit:1})).data;
 assert.equal(counts.counts.eligible,3);assert.equal(counts.counts.selected,1);assert.equal(counts.sample[0].email,'amal@example.com');
 assert.equal((await h.api('/send','POST',{emirate:'دبي',templateId:'menu',requestId:'request-0003-abcd',confirmCount:1})).status,503);
 assert.equal((await h.api('/test','POST',{emirate:'دبي',templateId:'menu',email:'owner@example.com'})).status,503);
 const saved=await h.api('/settings','PUT',{senderName:'أحمد',templates:{menu:{ar:{headline:'قائمتنا'}}}});
 assert.equal(saved.data.settings.senderName,'أحمد');
 assert.equal((await h.api('/settings')).data.settings.templates.menu.ar.headline,'قائمتنا');
});
