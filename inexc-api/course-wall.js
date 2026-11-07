// حائط الأعمال (لوحات مستقلة): أي شخص ينشئ لوحة ويصله مفتاح الإدارة على بريده؛ المتدربون يدخلون بالاسم فقط.
// كل ملف مرفوع يُحوَّل على الخادم إلى صور صفحات مختومة بتوقيع التميز، فيُعرض متطابقًا على كل الأجهزة مهما كان نوعه.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import multer from 'multer';

const uuid=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const codePattern=/^[a-z0-9]{8}$/;
const keyPattern=/^[a-f0-9]{64}$/;
const maxBytes=25*1024*1024,quotaBytes=2*1024*1024*1024,maxItems=500,maxComment=400;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const text=(value,max,required=false)=>{if(value==null)value='';if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw fail('تحقق من البيانات المطلوبة وطول النص.');return value.trim()};
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const newCode=()=>crypto.randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g,'').padEnd(8,'x').slice(0,8);
const defaultGroups=['المجموعة الأولى','المجموعة الثانية','المجموعة الثالثة'];
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const lockPassed=b=>!!(b.lock_at&&new Date(b.lock_at)<=new Date());
const defaultSettings={uploadsOpen:true,comments:true,reactions:true,requireApproval:false,stamp:true,closed:false,allowDownload:true};
const settingKeys=Object.keys(defaultSettings);
const scriptPath=fileURLToPath(new URL('./wall-render.py',import.meta.url));
const siteUrl='https://www.inexctraining.com';
const STAMP_VERSION=2; // يرتفع عند تغيير شكل الختم فتُعاد معالجة الأعمال القديمة تلقائيًا
const officeExt=/\.(docx?|pptx?|xlsx?|odt|odp|ods|rtf|csv)$/i;
const textExt=/\.(txt|md|json|html?|css|js|xml|log)$/i;
export function fileKind(name,mime=''){
 const n=String(name||'').toLowerCase();mime=String(mime||'').toLowerCase();
 if(/^image\//.test(mime)||/\.(png|jpe?g|webp|gif|bmp|tiff?)$/.test(n))return 'image';
 if(mime==='application/pdf'||n.endsWith('.pdf'))return 'pdf';
 if(officeExt.test(n))return 'office';
 if(/^video\//.test(mime)||/\.(mp4|webm|mov|m4v)$/.test(n))return 'video';
 if(/^audio\//.test(mime)||/\.(mp3|m4a|wav|ogg|aac)$/.test(n))return 'audio';
 if(/^text\//.test(mime)||textExt.test(n))return 'text';
 return 'other';
}
export const modeOf=v=>['groups','both'].includes(v)?v:'single';
// المجموعة: فردي دائمًا 0؛ مجموعات: فهرس صالح؛ كلاهما: -1 يعني دخولًا فرديًا بلا مجموعة
export function normGroup(board,value,fallback=0){const g=Number(value);if(board.mode==='single')return 0;if(board.mode==='both'&&g===-1)return -1;if(Number.isInteger(g)&&g>=0&&g<board.groups.length)return g;return board.mode==='both'?-1:(Number.isInteger(fallback)&&fallback>=0&&fallback<board.groups.length?fallback:0)}
export function publicSettings(settings){const s={...defaultSettings,...(settings||{})};const out={};for(const k of settingKeys)out[k]=!!s[k];return out}

export async function setupCourseWall(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS wall_boards(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),code TEXT UNIQUE NOT NULL,title TEXT NOT NULL,owner_email TEXT NOT NULL,owner_key_hash TEXT NOT NULL,mode TEXT NOT NULL DEFAULT 'single' CHECK(mode IN ('single','groups')),groups JSONB NOT NULL DEFAULT '[]',settings JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await pool.query(`CREATE TABLE IF NOT EXISTS wall_members(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),board_id UUID NOT NULL REFERENCES wall_boards(id) ON DELETE CASCADE,name TEXT NOT NULL,group_index INTEGER NOT NULL DEFAULT 0,token_hash TEXT UNIQUE NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await pool.query(`CREATE TABLE IF NOT EXISTS wall_items(id UUID PRIMARY KEY,board_id UUID NOT NULL REFERENCES wall_boards(id) ON DELETE CASCADE,member_id UUID REFERENCES wall_members(id) ON DELETE SET NULL,author_name TEXT NOT NULL,group_index INTEGER NOT NULL DEFAULT 0,title TEXT NOT NULL,file_name TEXT NOT NULL,mime TEXT NOT NULL DEFAULT '',size_bytes BIGINT NOT NULL,kind TEXT NOT NULL,stored_name TEXT NOT NULL,pages INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'processing',error TEXT NOT NULL DEFAULT '',approved BOOLEAN NOT NULL DEFAULT true,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await pool.query(`CREATE TABLE IF NOT EXISTS wall_comments(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),item_id UUID NOT NULL REFERENCES wall_items(id) ON DELETE CASCADE,member_id UUID REFERENCES wall_members(id) ON DELETE SET NULL,author_name TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',image_name TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await pool.query(`CREATE TABLE IF NOT EXISTS wall_reactions(item_id UUID NOT NULL REFERENCES wall_items(id) ON DELETE CASCADE,member_id UUID NOT NULL REFERENCES wall_members(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN ('like','idea')),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(item_id,member_id,kind))`);
 await pool.query('ALTER TABLE wall_items ADD COLUMN IF NOT EXISTS stamp_version INTEGER NOT NULL DEFAULT 0');
 await pool.query("ALTER TABLE wall_members ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT ''");
 await pool.query('ALTER TABLE wall_boards ADD COLUMN IF NOT EXISTS lock_at TIMESTAMPTZ');
 await pool.query('ALTER TABLE wall_comments ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES wall_comments(id) ON DELETE CASCADE');
 await pool.query(`CREATE TABLE IF NOT EXISTS wall_comment_reactions(comment_id UUID NOT NULL REFERENCES wall_comments(id) ON DELETE CASCADE,member_id UUID NOT NULL REFERENCES wall_members(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN ('like','logical','creative')),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(comment_id,member_id,kind))`);
 await pool.query('ALTER TABLE wall_boards DROP CONSTRAINT IF EXISTS wall_boards_mode_check');
 await pool.query("ALTER TABLE wall_boards ADD CONSTRAINT wall_boards_mode_check CHECK (mode IN ('single','groups','both'))");
 await pool.query('CREATE INDEX IF NOT EXISTS wall_items_board ON wall_items(board_id,created_at DESC)');
 await pool.query('CREATE INDEX IF NOT EXISTS wall_comments_item ON wall_comments(item_id,created_at)');
}

// تحويل ملف إلى صور صفحات عبر السكربت (poppler + LibreOffice + Pillow). يُعيد عدد الصفحات.
export function renderWithScript({python='python3'}={}){
 return (input,outDir,kind,stamp,originalName='')=>new Promise((resolve,reject)=>{
  const args=[scriptPath,input,outDir,kind,stamp?JSON.stringify(stamp):'null',String(originalName||'')];
  const child=spawn(python,args,{stdio:['ignore','pipe','pipe']});let out='',err='';
  child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('انتهت مهلة تحويل الملف'))},8*60*1000);
  child.on('error',e=>{clearTimeout(timer);reject(e)});
  child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(new Error(err.trim().slice(-400)||'فشل التحويل'));const m=out.match(/PAGES=(\d+)/);resolve(m?Number(m[1]):0)});
 });
}

export function installCourseWall({app,pool,uploadDir,sendEmail,emailShell,mailEnabled=false,render=renderWithScript(),origin=siteUrl,concurrency=2}){
 const dir=path.join(uploadDir,'trainee-private','wall');fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const itemDir=id=>path.join(dir,id);
 const uploader=multer({storage:multer.diskStorage({destination:(req,_f,cb)=>{const id=crypto.randomUUID();req.wallItemId=id;const d=itemDir(id);fs.mkdirSync(d,{recursive:true});cb(null,d)},filename:(_r,_f,cb)=>cb(null,'original.bin')}),limits:{fileSize:maxBytes,files:1,fields:6,fieldSize:4000,parts:8}}).single('file');
 const commentUploader=multer({storage:multer.diskStorage({destination:(req,_f,cb)=>cb(null,itemDir(req.params.id)),filename:(_r,f,cb)=>cb(null,'c-'+crypto.randomUUID()+({'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/gif':'.gif'}[f.mimetype]||'.img'))}),limits:{fileSize:6*1024*1024,files:1,fields:4,fieldSize:4000},fileFilter:(_r,f,cb)=>cb(null,/^image\/(png|jpeg|webp|gif)$/.test(f.mimetype))}).single('image');
 const wrap=fn=>async(req,res,next)=>{res.set('Cache-Control','no-store');try{await fn(req,res)}catch(e){next(e)}};
 const hits=new Map();const limit=(key,max,windowMs=3600e3)=>{const now=Date.now();const list=(hits.get(key)||[]).filter(t=>now-t<windowMs);if(list.length>=max)throw fail('طلبات كثيرة. حاول لاحقًا.',429);list.push(now);hits.set(key,list)};
 const ipOf=req=>hash(req.ip||'');
 const boardUrl=code=>`${origin}/wall/?b=${code}`;
 const adminUrl=(code,key)=>`${origin}/wall/?b=${code}&key=${key}`;

 const loadBoard=async(req,_res,next)=>{try{const code=String(req.params.code||'').toLowerCase();if(!codePattern.test(code))throw fail('اللوحة غير موجودة.',404);const b=(await pool.query('SELECT * FROM wall_boards WHERE code=$1',[code])).rows[0];if(!b)throw fail('اللوحة غير موجودة.',404);b.settings=publicSettings(b.settings);req.board=b;req.isOwner=keyPattern.test(req.get('X-Wall-Key')||'')&&hash(req.get('X-Wall-Key'))===b.owner_key_hash;const t=req.get('X-Wall-Member')||'';if(keyPattern.test(t)){req.member=(await pool.query('UPDATE wall_members SET last_seen_at=now() WHERE token_hash=$1 AND board_id=$2 RETURNING id,name,group_index',[hash(t),b.id])).rows[0]||null}next()}catch(e){next(e)}};
 const loadItem=async(req,_res,next)=>{try{if(!uuid.test(req.params.id))throw fail('العمل غير موجود.',404);const it=(await pool.query('SELECT * FROM wall_items WHERE id=$1',[req.params.id])).rows[0];if(!it)throw fail('العمل غير موجود.',404);req.item=it;req.params.code=(await pool.query('SELECT code FROM wall_boards WHERE id=$1',[it.board_id])).rows[0]?.code||'';next()}catch(e){next(e)}};
 const ownerOnly=(req,_res,next)=>req.isOwner?next():next(fail('هذه الصلاحية لمدير اللوحة فقط.',403));
 const memberOnly=(req,_res,next)=>req.member?next():next(fail('ادخل باسمك أولًا.',401));
 const canSee=(req,it)=>it.approved||req.isOwner||(req.member&&req.member.id===it.member_id);

 // ——— طابور التحويل ———
 let running=0;const queue=[];
 async function processItem(id){
  const it=(await pool.query('SELECT i.*,b.settings,b.title AS board_title FROM wall_items i JOIN wall_boards b ON b.id=i.board_id WHERE i.id=$1',[id])).rows[0];if(!it)return;
  const settings=publicSettings(it.settings);
  try{
   const pages=await render(path.join(itemDir(id),it.stored_name),itemDir(id),it.kind,settings.stamp?{name:it.author_name,board:it.board_title,company:'شركة التميز الابتكاري',brand:'INEXC TRAINING · inexctraining.com'}:null,it.file_name);
   await pool.query("UPDATE wall_items SET status='ready',pages=$2,error='',stamp_version=$3 WHERE id=$1",[id,pages,STAMP_VERSION]);
  }catch(e){await pool.query("UPDATE wall_items SET status='failed',error=$2 WHERE id=$1",[id,String(e.message||e).slice(0,300)])}
 }
 const pump=()=>{while(running<concurrency&&queue.length){const id=queue.shift();running++;processItem(id).catch(()=>{}).finally(()=>{running--;pump()})}};
 const enqueue=id=>{if(!queue.includes(id))queue.push(id);pump()};
 const resumeProcessing=async()=>{try{for(const r of (await pool.query("SELECT id FROM wall_items WHERE status='processing' OR (status='ready' AND pages>0 AND stamp_version<$1) ORDER BY created_at",[STAMP_VERSION])).rows)enqueue(r.id)}catch(e){console.error(e)}};

 const itemView=(req,it)=>({id:it.id,title:it.title,fileName:it.file_name,kind:it.kind,mime:it.mime,size:Number(it.size_bytes),pages:it.pages,status:it.status,approved:it.approved,author:it.author_name,group:it.group_index,createdAt:it.created_at,likes:Number(it.likes||0),ideas:Number(it.ideas||0),comments:Number(it.comment_count||0),mine:!!(req.member&&req.member.id===it.member_id),myLike:!!it.my_like,myIdea:!!it.my_idea,fileUrl:`/wall/items/${it.id}/file`,pageUrl:`/wall/items/${it.id}/pages/`,stampedUrl:it.pages>0?`/wall/items/${it.id}/stamped.pdf`:null});
 const listItems=async(req)=>{const mid=req.member?.id||null;const rows=(await pool.query(`SELECT i.*,(SELECT count(*) FROM wall_reactions r WHERE r.item_id=i.id AND r.kind='like') AS likes,(SELECT count(*) FROM wall_reactions r WHERE r.item_id=i.id AND r.kind='idea') AS ideas,(SELECT count(*) FROM wall_comments c WHERE c.item_id=i.id) AS comment_count,EXISTS(SELECT 1 FROM wall_reactions r WHERE r.item_id=i.id AND r.kind='like' AND r.member_id=$2) AS my_like,EXISTS(SELECT 1 FROM wall_reactions r WHERE r.item_id=i.id AND r.kind='idea' AND r.member_id=$2) AS my_idea FROM wall_items i WHERE i.board_id=$1 ORDER BY i.created_at DESC LIMIT $3`,[req.board.id,mid,maxItems])).rows;return rows.filter(it=>canSee(req,it)).map(it=>itemView(req,it))};
 const boardView=async req=>{const b=req.board;const members=(await pool.query('SELECT count(*) AS n FROM wall_members WHERE board_id=$1',[b.id])).rows[0];return {code:b.code,title:b.title,mode:b.mode,groups:b.groups,settings:b.settings,createdAt:b.created_at,lockAt:b.lock_at,url:boardUrl(b.code),members:Number(members.n),isOwner:req.isOwner,me:req.member?{id:req.member.id,name:req.member.name,group:req.member.group_index}:null,ownerEmail:req.isOwner?b.owner_email:undefined,maxBytes,items:await listItems(req)}};

 // إنشاء لوحة: يصل مفتاح الإدارة إلى البريد فقط (لا يُعرض في الاستجابة عندما يكون البريد مفعّلًا).
 app.post('/api/wall/boards',wrap(async(req,res)=>{
  limit('create:'+ipOf(req),10);
  const b=req.body||{},title=text(b.title,120,true),email=text(b.email,190,true).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail('البريد الإلكتروني غير صحيح.');if(b.website)throw fail('تعذّر إنشاء اللوحة.');
  const mode=modeOf(b.mode);
  const groups=Array.isArray(b.groups)&&b.groups.length?b.groups.slice(0,12).map(g=>text(g,60,true)):defaultGroups;if(mode!=='single'&&groups.length<2)throw fail('أضف مجموعتين على الأقل.');
  const key=crypto.randomBytes(32).toString('hex');let code,row;
  for(let i=0;i<5&&!row;i++){code=newCode();row=(await pool.query('INSERT INTO wall_boards(code,title,owner_email,owner_key_hash,mode,groups,settings) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(code) DO NOTHING RETURNING *',[code,title,email,hash(key),mode,JSON.stringify(groups),JSON.stringify(defaultSettings)])).rows[0]}
  if(!row)throw fail('تعذّر إنشاء اللوحة. حاول مجددًا.',500);
  let emailed=false;
  if(mailEnabled){try{await sendEmail({to:email,subject:`مفتاح إدارة لوحة «${title}»`,html:ownerMail({title,code,key}),text:`رابط إدارة اللوحة (احتفظ به ولا تشاركه): ${adminUrl(code,key)}\nرابط المشاركة مع المتدربين: ${boardUrl(code)}`,idempotencyKey:'wall-owner-'+row.id});emailed=true}catch(e){console.error(e)}}
  res.status(201).json({ok:true,code,url:boardUrl(code),emailed,...(emailed?{}:{adminUrl:adminUrl(code,key)})});
 }));
 function ownerMail({title,code,key}){
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const content=`<div style="font-size:23px;font-weight:800;color:#103b70">لوحتك جاهزة ✓</div><p style="margin:12px 0 0;font-size:15px">أنشأت لوحة <strong>${esc(title)}</strong>. هذا الرابط يجعلك <strong>مدير اللوحة</strong> — افتحه من هذا البريد وستظهر لك الإعدادات كاملة:</p><div style="margin:18px 0;text-align:center"><a href="${adminUrl(code,key)}" style="display:inline-block;background:#0866c6;color:#fff;text-decoration:none;padding:12px 22px;border-radius:9px;font-size:15px;font-weight:700">فتح اللوحة كمدير</a></div><p style="font-size:13px;color:#526c84">لا تشارك رابط الإدارة مع أحد. أما رابط المشاركة مع المتدربين فهو:</p><p style="direction:ltr;text-align:center;font-size:14px"><a href="${boardUrl(code)}">${boardUrl(code)}</a></p><p style="font-size:13px;color:#526c84">المتدرب يفتح الرابط ويكتب اسمه فقط ثم يرفع أعماله. إذا فقدت رابط الإدارة يمكنك طلب رابط جديد من صفحة اللوحة بنفس هذا البريد.</p>`;
  return emailShell?emailShell({title:'مفتاح إدارة اللوحة',preview:`رابط إدارة لوحة ${title}`,content}):content;
 }
 app.post('/api/wall/boards/:code/recover',loadBoard,wrap(async(req,res)=>{
  limit('recover:'+ipOf(req),10);const email=text(req.body?.email,190,true).toLowerCase();
  if(email!==req.board.owner_email){res.json({ok:true});return}
  const key=crypto.randomBytes(32).toString('hex');await pool.query('UPDATE wall_boards SET owner_key_hash=$2,updated_at=now() WHERE id=$1',[req.board.id,hash(key)]);
  if(mailEnabled)await sendEmail({to:email,subject:`رابط إدارة جديد للوحة «${req.board.title}»`,html:ownerMail({title:req.board.title,code:req.board.code,key}),text:adminUrl(req.board.code,key)});
  res.json({ok:true,...(mailEnabled?{}:{adminUrl:adminUrl(req.board.code,key)})});
 }));
 app.get('/api/wall/boards/:code',loadBoard,wrap(async(req,res)=>res.json(await boardView(req))));
 app.patch('/api/wall/boards/:code',loadBoard,ownerOnly,wrap(async(req,res)=>{
  const b=req.body||{},cur=req.board;const title=b.title===undefined?cur.title:text(b.title,120,true);const mode=b.mode===undefined?cur.mode:modeOf(b.mode);
  const groups=b.groups===undefined?cur.groups:(Array.isArray(b.groups)?b.groups.slice(0,12).map(g=>text(g,60,true)):cur.groups);if(mode!=='single'&&groups.length<2)throw fail('أضف مجموعتين على الأقل.');
  let lockAt=cur.lock_at;if(b.lockAt!==undefined){if(b.lockAt===null||b.lockAt==='')lockAt=null;else{const d=new Date(b.lockAt);if(isNaN(d))throw fail('تاريخ القفل غير صحيح.');lockAt=d.toISOString()}}
  const settings={...cur.settings};if(b.settings&&typeof b.settings==='object')for(const k of settingKeys)if(typeof b.settings[k]==='boolean')settings[k]=b.settings[k];
  req.board=(await pool.query('UPDATE wall_boards SET title=$2,mode=$3,groups=$4,settings=$5,lock_at=$6,updated_at=now() WHERE id=$1 RETURNING *',[cur.id,title,mode,JSON.stringify(groups),JSON.stringify(settings),lockAt])).rows[0];req.board.settings=publicSettings(req.board.settings);
  res.json(await boardView(req));
 }));
 app.post('/api/wall/boards/:code/join',loadBoard,wrap(async(req,res)=>{
  limit('join:'+ipOf(req),120);const b=req.board;if(b.settings.closed)throw fail('أغلق مدير اللوحة الدخول إليها.',409);
  const name=text(req.body?.name,60,true);const email=text(req.body?.email,190,true).toLowerCase();if(!emailPattern.test(email))throw fail('اكتب بريدًا إلكترونيًا صحيحًا.');const group=normGroup(b,req.body?.group);
  const token=crypto.randomBytes(32).toString('hex');const m=(await pool.query('INSERT INTO wall_members(board_id,name,group_index,token_hash,email) VALUES($1,$2,$3,$4,$5) RETURNING id,name,group_index',[b.id,name,group,hash(token),email])).rows[0];
  res.status(201).json({token,me:{id:m.id,name:m.name,group:m.group_index}});
 }));
 app.post('/api/wall/boards/:code/leave',loadBoard,memberOnly,wrap(async(req,res)=>{await pool.query('UPDATE wall_members SET token_hash=$2 WHERE id=$1',[req.member.id,hash(crypto.randomBytes(32))]);res.json({ok:true})}));
 app.get('/api/wall/boards/:code/qr',loadBoard,wrap(async(req,res)=>{const {default:QRCode}=await import('qrcode');res.type('png');res.set('Cache-Control','public,max-age=86400');res.send(await QRCode.toBuffer(boardUrl(req.board.code),{width:480,margin:1,color:{dark:'#0b2b55'}}))}));

 app.get('/api/wall/boards/:code/export.pdf',loadBoard,ownerOnly,wrap(async(req,res)=>{
  const items=(await pool.query("SELECT id,author_name,title,pages FROM wall_items WHERE board_id=$1 AND status='ready' AND pages>0 ORDER BY created_at",[req.board.id])).rows;
  if(!items.length)throw fail('لا توجد أعمال جاهزة للتصدير بعد.',409);
  const manifest={title:req.board.title,items:items.map(it=>({dir:itemDir(it.id),pages:it.pages,author:it.author_name,title:it.title}))};
  const tmp=path.join(dir,'export-'+crypto.randomUUID());fs.mkdirSync(tmp);
  const mf=path.join(tmp,'manifest.json'),out=path.join(tmp,'album.pdf');
  fs.writeFileSync(mf,JSON.stringify(manifest));
  await new Promise((resolve,reject)=>{const child=spawn('python3',[scriptPath,'export',mf,out],{stdio:['ignore','ignore','pipe']});let err='';child.stderr.on('data',d=>err+=d);const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('انتهت مهلة التصدير'))},5*60*1000);child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error(err.trim().slice(-300)||'فشل التصدير'))})});
  res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(req.board.title+' - الألبوم.pdf')}`,'Cache-Control':'no-store'});
  res.sendFile(out,e=>{fs.rm(tmp,{recursive:true,force:true},()=>{});if(e&&!res.headersSent)res.status(500).end()});
 }));
 // إرسال الملفات بالبريد: للجميع المسجلين أو لإيميلات محددة
 app.post('/api/wall/boards/:code/email',loadBoard,ownerOnly,wrap(async(req,res)=>{
  if(!mailEnabled)throw fail('البريد غير مفعّل على الخادم.',409);
  limit('bmail:'+req.board.id,20);const note=text(req.body?.note||'',500);
  let targets=[];
  if(req.body?.recipients==='all'){targets=(await pool.query("SELECT DISTINCT email FROM wall_members WHERE board_id=$1 AND email<>''",[req.board.id])).rows.map(r=>r.email)}
  else{const list=Array.isArray(req.body?.emails)?req.body.emails:[];targets=[...new Set(list.map(e=>String(e||'').trim().toLowerCase()).filter(e=>emailPattern.test(e)))].slice(0,100)}
  if(!targets.length)throw fail('لا يوجد مستلمون. تأكد من الإيميلات أو من دخول متدربين باللوحة.');
  const esc=v=>String(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const works=(await pool.query("SELECT i.title,i.author_name,i.id,m.email FROM wall_items i LEFT JOIN wall_members m ON m.id=i.member_id WHERE i.board_id=$1 AND i.status='ready' AND i.pages>0 ORDER BY i.created_at",[req.board.id])).rows;
  let sentCount=0;
  for(const to of targets){
   const mine=works.filter(w=>w.email===to);
   const mineHtml=mine.length?`<p style="font-size:14px;margin:14px 0 4px"><strong>أعمالك المختومة بتوقيع التميز:</strong></p>`+mine.map(w=>`<p style="margin:4px 0;font-size:14px">• <a href="${origin}/wall/?b=${req.board.code}&w=${w.id}">${esc(w.title)}</a></p>`).join(''):'';
   const content=`<div style="font-size:21px;font-weight:800;color:#103b70">ملفات لوحة «${esc(req.board.title)}»</div>${note?`<p style="font-size:15px;margin:12px 0 0">${esc(note)}</p>`:''}<p style="font-size:14px;margin:14px 0 0">جميع أعمال الدفعة معروضة ومختومة على الحائط:</p><div style="margin:14px 0;text-align:center"><a href="${boardUrl(req.board.code)}" style="display:inline-block;background:#0866c6;color:#fff;text-decoration:none;padding:11px 20px;border-radius:9px;font-size:14px;font-weight:700">فتح حائط الأعمال</a></div>${mineHtml}`;
   try{await sendEmail({to,subject:`ملفات لوحة «${req.board.title}» — ${'شركة التميز الابتكاري'}`,html:emailShell?emailShell({title:'حائط الأعمال',preview:'ملفات اللوحة',content}):content,text:`${boardUrl(req.board.code)}`});sentCount++}catch(e){console.error(e)}
  }
  res.json({ok:true,sent:sentCount,total:targets.length});
 }));
 app.post('/api/wall/boards/:code/items',loadBoard,memberOnly,(req,res,next)=>uploader(req,res,async uploadError=>{
  let keep=false;const id=req.wallItemId;try{
   if(uploadError)throw fail(uploadError.code==='LIMIT_FILE_SIZE'?'الحد الأقصى للملف 25 ميغابايت.':'تعذّر رفع الملف.');
   const b=req.board;if(!b.settings.uploadsOpen||b.settings.closed)throw fail('أوقف مدير اللوحة استقبال الأعمال حاليًا.',409);if(lockPassed(b))throw fail('انتهى موعد رفع الأعمال في هذه اللوحة.',409);if(!req.file)throw fail('اختر الملف أولًا.');
   limit('upload:'+ipOf(req),120);
   const fileName=path.basename(Buffer.from(req.file.originalname,'latin1').toString('utf8')).replace(/[\x00-\x1f\x7f]/g,'').slice(0,200)||'file';
   const title=text(req.body?.title||'',120)||fileName.replace(/\.[a-z0-9]{1,5}$/i,'');
   const group=normGroup(b,req.body?.group,req.member.group_index);
   const stats=(await pool.query('SELECT COALESCE(sum(size_bytes),0) AS bytes,count(*) AS n FROM wall_items WHERE board_id=$1',[b.id])).rows[0];if(Number(stats.bytes)+req.file.size>quotaBytes||Number(stats.n)>=maxItems)throw fail('امتلأت مساحة هذه اللوحة. تواصل مع مديرها.',409);
   const kind=fileKind(fileName,req.file.mimetype);
   const it=(await pool.query('INSERT INTO wall_items(id,board_id,member_id,author_name,group_index,title,file_name,mime,size_bytes,kind,stored_name,approved,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',[id,b.id,req.member.id,req.member.name,group,title,fileName,req.file.mimetype||'',req.file.size,kind,'original.bin',!b.settings.requireApproval,['video','audio','other'].includes(kind)?'ready':'processing'])).rows[0];
   keep=true;if(it.status==='processing')enqueue(id);
   res.status(201).json({ok:true,item:itemView(req,it)});
  }catch(e){next(e)}finally{if(!keep&&id)fs.rm(itemDir(id),{recursive:true,force:true},()=>{})}
 }));
 const replaceUploader=multer({storage:multer.diskStorage({destination:(req,_f,cb)=>cb(null,itemDir(req.params.id)),filename:(_r,_f,cb)=>cb(null,'incoming.bin')}),limits:{fileSize:maxBytes,files:1,fields:4,fieldSize:4000}}).single('file');
 app.post('/api/wall/items/:id/replace',loadItem,loadBoard,memberOnly,(req,res,next)=>replaceUploader(req,res,async uploadError=>{try{
  const it=req.item,b=req.board;if(!(req.isOwner||req.member.id===it.member_id))throw fail('استبدال الملف لصاحب العمل أو مدير اللوحة فقط.',403);
  if(uploadError)throw fail(uploadError.code==='LIMIT_FILE_SIZE'?'الحد الأقصى للملف 25 ميغابايت.':'تعذّر رفع الملف.');
  if(!req.file)throw fail('اختر الملف أولًا.');
  if(!req.isOwner&&(!b.settings.uploadsOpen||b.settings.closed||lockPassed(b)))throw fail('الرفع متوقف حاليًا.',409);
  const stats=(await pool.query('SELECT COALESCE(sum(size_bytes),0) AS bytes FROM wall_items WHERE board_id=$1 AND id<>$2',[b.id,it.id])).rows[0];
  if(Number(stats.bytes)+req.file.size>quotaBytes){fs.unlink(req.file.path,()=>{});throw fail('امتلأت مساحة هذه اللوحة.',409)}
  const fileName=path.basename(Buffer.from(req.file.originalname,'latin1').toString('utf8')).replace(/[\x00-\x1f\x7f]/g,'').slice(0,200)||'file';
  const kind=fileKind(fileName,req.file.mimetype);
  fs.renameSync(req.file.path,path.join(itemDir(it.id),'original.bin'));
  for(const p of fs.readdirSync(itemDir(it.id)))if(/^page-\d+\.png$|^stamped\.pdf$/.test(p))fs.unlink(path.join(itemDir(it.id),p),()=>{});
  const updated=(await pool.query("UPDATE wall_items SET file_name=$2,mime=$3,size_bytes=$4,kind=$5,pages=0,error='',status=$6 WHERE id=$1 RETURNING *",[it.id,fileName,req.file.mimetype||'',req.file.size,kind,['video','audio','other'].includes(kind)?'ready':'processing'])).rows[0];
  if(updated.status==='processing')enqueue(it.id);
  res.json({ok:true,item:itemView(req,updated)});
 }catch(e){if(req.file)fs.unlink(req.file.path,()=>{});next(e)}}));
 app.get('/api/wall/items/:id',loadItem,loadBoard,wrap(async(req,res)=>{const it=req.item;if(!canSee(req,it))throw fail('العمل غير متاح.',404);const [row]=(await pool.query(`SELECT i.*,(SELECT count(*) FROM wall_reactions r WHERE r.item_id=i.id AND r.kind='like') AS likes,(SELECT count(*) FROM wall_reactions r WHERE r.item_id=i.id AND r.kind='idea') AS ideas,(SELECT count(*) FROM wall_comments c WHERE c.item_id=i.id) AS comment_count FROM wall_items i WHERE i.id=$1`,[it.id])).rows;res.json({item:itemView(req,row)})}));
 const safeInline=/^(image\/|video\/|audio\/)|^application\/pdf$/;
 const sendFile=(res,file,headers)=>{const h={'X-Content-Type-Options':'nosniff',...headers};if(!safeInline.test(String(h['Content-Type']||'')))h['Content-Security-Policy']='sandbox';res.set(h);res.sendFile(file,{dotfiles:'deny',maxAge:'1h'})};
 app.get('/api/wall/items/:id/pages/:n',loadItem,loadBoard,wrap(async(req,res)=>{const it=req.item;if(!canSee(req,it))throw fail('العمل غير متاح.',404);const n=parseInt(req.params.n,10);if(!Number.isInteger(n)||n<1||n>it.pages)throw fail('الصفحة غير موجودة.',404);sendFile(res,path.join(itemDir(it.id),`page-${String(n).padStart(3,'0')}.png`),{'Content-Type':'image/png'})}));
 app.get('/api/wall/items/:id/stamped.pdf',loadItem,loadBoard,wrap(async(req,res)=>{const it=req.item;if(!canSee(req,it)||!it.pages)throw fail('العمل غير متاح.',404);const f=path.join(itemDir(it.id),'stamped.pdf');if(!fs.existsSync(f))throw fail('النسخة المختومة قيد التجهيز.',404);sendFile(res,f,{'Content-Type':'application/pdf','Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(it.title+' - توقيع التميز.pdf')}`})}));
 app.get('/api/wall/items/:id/file',loadItem,loadBoard,wrap(async(req,res)=>{const it=req.item;if(!canSee(req,it))throw fail('العمل غير متاح.',404);const inline=['video','audio','image','pdf','text'].includes(it.kind);if(!inline&&!req.board.settings.allowDownload&&!req.isOwner&&!(req.member&&req.member.id===it.member_id))throw fail('التحميل متاح لمدير اللوحة وصاحب العمل فقط.',403);const mime=/^(video|audio|image)\//.test(it.mime)||it.mime==='application/pdf'?it.mime:it.kind==='text'?'text/plain; charset=utf-8':'application/octet-stream';sendFile(res,path.join(itemDir(it.id),it.stored_name),{'Content-Type':mime,'Content-Disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(it.file_name)}`,'Accept-Ranges':'bytes'})}));
 app.delete('/api/wall/items/:id',loadItem,loadBoard,wrap(async(req,res)=>{const it=req.item;if(!(req.isOwner||(req.member&&req.member.id===it.member_id)))throw fail('لا تملك صلاحية حذف هذا العمل.',403);await pool.query('DELETE FROM wall_items WHERE id=$1',[it.id]);fs.rm(itemDir(it.id),{recursive:true,force:true},()=>{});res.json({ok:true})}));
 app.post('/api/wall/items/:id/approve',loadItem,loadBoard,ownerOnly,wrap(async(req,res)=>{await pool.query('UPDATE wall_items SET approved=$2 WHERE id=$1',[req.item.id,req.body?.approved!==false]);res.json({ok:true})}));
 app.post('/api/wall/items/:id/retry',loadItem,loadBoard,ownerOnly,wrap(async(req,res)=>{await pool.query("UPDATE wall_items SET status='processing',error='' WHERE id=$1",[req.item.id]);enqueue(req.item.id);res.json({ok:true})}));
 app.post('/api/wall/items/:id/react',loadItem,loadBoard,memberOnly,wrap(async(req,res)=>{if(!req.board.settings.reactions)throw fail('التفاعل متوقف في هذه اللوحة.',409);const kind=req.body?.kind==='idea'?'idea':'like';const del=await pool.query('DELETE FROM wall_reactions WHERE item_id=$1 AND member_id=$2 AND kind=$3',[req.item.id,req.member.id,kind]);if(!del.rowCount)await pool.query('INSERT INTO wall_reactions(item_id,member_id,kind) VALUES($1,$2,$3)',[req.item.id,req.member.id,kind]);const c=(await pool.query("SELECT count(*) FILTER(WHERE kind='like') AS likes,count(*) FILTER(WHERE kind='idea') AS ideas FROM wall_reactions WHERE item_id=$1",[req.item.id])).rows[0];res.json({kind,active:!del.rowCount,likes:Number(c.likes),ideas:Number(c.ideas)})}));
 const commentView=(req,c)=>({id:c.id,parent:c.parent_id||null,author:c.author_name,body:c.body,imageUrl:c.image_name?`/wall/comments/${c.id}/image`:null,createdAt:c.created_at,mine:!!(req.member&&req.member.id===c.member_id),reactions:{like:Number(c.r_like||0),logical:Number(c.r_logical||0),creative:Number(c.r_creative||0)},my:{like:!!c.my_like,logical:!!c.my_logical,creative:!!c.my_creative}});
 app.get('/api/wall/items/:id/comments',loadItem,loadBoard,wrap(async(req,res)=>{if(!canSee(req,req.item))throw fail('العمل غير متاح.',404);
  const mid=req.member?.id||null;
  const rows=(await pool.query(`SELECT c.*,
    (SELECT count(*) FROM wall_comment_reactions r WHERE r.comment_id=c.id AND r.kind='like') AS r_like,
    (SELECT count(*) FROM wall_comment_reactions r WHERE r.comment_id=c.id AND r.kind='logical') AS r_logical,
    (SELECT count(*) FROM wall_comment_reactions r WHERE r.comment_id=c.id AND r.kind='creative') AS r_creative,
    EXISTS(SELECT 1 FROM wall_comment_reactions r WHERE r.comment_id=c.id AND r.kind='like' AND r.member_id=$2) AS my_like,
    EXISTS(SELECT 1 FROM wall_comment_reactions r WHERE r.comment_id=c.id AND r.kind='logical' AND r.member_id=$2) AS my_logical,
    EXISTS(SELECT 1 FROM wall_comment_reactions r WHERE r.comment_id=c.id AND r.kind='creative' AND r.member_id=$2) AS my_creative
    FROM wall_comments c WHERE c.item_id=$1 ORDER BY c.created_at LIMIT 400`,[req.item.id,mid])).rows;
  const map=new Map(),top=[];for(const r of rows){const v=commentView(req,r);v.replies=[];map.set(v.id,v)}
  for(const v of map.values()){if(v.parent&&map.has(v.parent))map.get(v.parent).replies.push(v);else top.push(v)}
  res.json({comments:top})}));
 app.post('/api/wall/items/:id/comments',loadItem,loadBoard,memberOnly,(req,res,next)=>commentUploader(req,res,async uploadError=>{try{
  if(uploadError)throw fail('تعذّر رفع صورة التعليق (الحد 6 ميغابايت).');if(!req.board.settings.comments)throw fail('التعليقات متوقفة في هذه اللوحة.',409);if(!canSee(req,req.item))throw fail('العمل غير متاح.',404);
  const body=text(req.body?.body||'',maxComment);if(!body&&!req.file)throw fail('اكتب تعليقًا أو أرفق صورة.');limit('comment:'+ipOf(req),300);
  let parent=null;if(req.body?.parent){if(!uuid.test(req.body.parent))throw fail('التعليق غير موجود.',404);const p=(await pool.query('SELECT id,parent_id,item_id FROM wall_comments WHERE id=$1',[req.body.parent])).rows[0];if(!p||p.item_id!==req.item.id)throw fail('التعليق غير موجود.',404);parent=p.parent_id||p.id}
  const c=(await pool.query('INSERT INTO wall_comments(item_id,member_id,author_name,body,image_name,parent_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[req.item.id,req.member.id,req.member.name,body,req.file?.filename||'',parent])).rows[0];c.replies=[];res.status(201).json({comment:{...commentView(req,c),replies:[]}});
 }catch(e){if(req.file)fs.unlink(req.file.path,()=>{});next(e)}}));
 app.post('/api/wall/comments/:cid/react',wrap(async(req,res)=>{
  if(!uuid.test(req.params.cid))throw fail('غير موجود.',404);
  const c=(await pool.query('SELECT c.id,i.board_id,b.settings FROM wall_comments c JOIN wall_items i ON i.id=c.item_id JOIN wall_boards b ON b.id=i.board_id WHERE c.id=$1',[req.params.cid])).rows[0];
  if(!c)throw fail('غير موجود.',404);if(!publicSettings(c.settings).comments)throw fail('التعليقات متوقفة.',409);
  const t=req.get('X-Wall-Member')||'';const member=keyPattern.test(t)?(await pool.query('SELECT id FROM wall_members WHERE token_hash=$1 AND board_id=$2',[hash(t),c.board_id])).rows[0]:null;
  if(!member)throw fail('ادخل باسمك أولًا.',401);
  const kind=['logical','creative'].includes(req.body?.kind)?req.body.kind:'like';
  const del=await pool.query('DELETE FROM wall_comment_reactions WHERE comment_id=$1 AND member_id=$2 AND kind=$3',[c.id,member.id,kind]);
  if(!del.rowCount)await pool.query('INSERT INTO wall_comment_reactions(comment_id,member_id,kind) VALUES($1,$2,$3)',[c.id,member.id,kind]);
  const n=(await pool.query("SELECT count(*) FILTER(WHERE kind='like') AS l,count(*) FILTER(WHERE kind='logical') AS g,count(*) FILTER(WHERE kind='creative') AS v FROM wall_comment_reactions WHERE comment_id=$1",[c.id])).rows[0];
  res.json({kind,active:!del.rowCount,reactions:{like:Number(n.l),logical:Number(n.g),creative:Number(n.v)}})}));
 app.get('/api/wall/comments/:cid/image',wrap(async(req,res)=>{if(!uuid.test(req.params.cid))throw fail('غير موجود.',404);const c=(await pool.query('SELECT item_id,image_name FROM wall_comments WHERE id=$1',[req.params.cid])).rows[0];if(!c?.image_name||!/^c-[-a-f0-9]+\.(png|jpg|webp|gif|img)$/.test(c.image_name))throw fail('غير موجود.',404);sendFile(res,path.join(itemDir(c.item_id),c.image_name),{'Content-Type':{png:'image/png',jpg:'image/jpeg',webp:'image/webp',gif:'image/gif'}[c.image_name.split('.').pop()]||'application/octet-stream'})}));
 app.delete('/api/wall/comments/:cid',wrap(async(req,res)=>{if(!uuid.test(req.params.cid))throw fail('غير موجود.',404);const c=(await pool.query('SELECT c.*,b.owner_key_hash,b.id AS board_id FROM wall_comments c JOIN wall_items i ON i.id=c.item_id JOIN wall_boards b ON b.id=i.board_id WHERE c.id=$1',[req.params.cid])).rows[0];if(!c)throw fail('غير موجود.',404);const owner=keyPattern.test(req.get('X-Wall-Key')||'')&&hash(req.get('X-Wall-Key'))===c.owner_key_hash;const t=req.get('X-Wall-Member')||'';const member=keyPattern.test(t)?(await pool.query('SELECT id FROM wall_members WHERE token_hash=$1 AND board_id=$2',[hash(t),c.board_id])).rows[0]:null;if(!(owner||(member&&member.id===c.member_id)))throw fail('لا تملك صلاحية حذف هذا التعليق.',403);await pool.query('DELETE FROM wall_comments WHERE id=$1',[c.id]);if(c.image_name)fs.unlink(path.join(itemDir(c.item_id),c.image_name),()=>{});res.json({ok:true})}));
 return {resumeProcessing,processItem,enqueue};
}
