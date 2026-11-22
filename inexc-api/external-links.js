/* External download links: standalone file hosting with short public links. No course, payment, registration or mail writes. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';

const uuid=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const slugPattern=/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const columns='id,slug,title,description,file_name,mime,size_bytes,views,downloads,active,created_at,updated_at';
/* Stored inside a dot-directory: the public /uploads static handler denies dotfiles, so files are reachable only through the counted download route. */
export const externalLinksFolder='.external-links';

export async function setupExternalLinks(pool){await pool.query(`CREATE TABLE IF NOT EXISTS external_links (
 id UUID PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 file_name TEXT NOT NULL, stored_name TEXT NOT NULL, mime TEXT NOT NULL DEFAULT 'application/octet-stream',
 size_bytes BIGINT NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0, downloads INTEGER NOT NULL DEFAULT 0,
 active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`)}

export function externalLinkSlug(value){
 const slug=String(value??'').trim().toLowerCase().replace(/[\s_]+/g,'-').replace(/-{2,}/g,'-').replace(/^-+|-+$/g,'');
 if(!slug)return '';
 if(!slugPattern.test(slug))throw fail('اسم الرابط يقبل الحروف الإنجليزية الصغيرة والأرقام والشرطة فقط، حتى 60 حرفًا.');
 return slug;
}
export function externalLinkText(body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw fail('بيانات الرابط غير صالحة.');
 const out={};
 for(const [key,max] of Object.entries({title:160,description:600})){
  if(body[key]!=null&&typeof body[key]!=='string')throw fail('تحقق من النصوص المدخلة.');
  out[key]=String(body[key]||'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim();
  if(out[key].length>max)throw fail('النص أطول من الحد المسموح.');
 }
 if(!out.title)throw fail('اكتب عنوان الملف.');
 return out;
}
const originalName=file=>path.basename(Buffer.from(file.originalname||'','latin1').toString('utf8')).replace(/[\u0000-\u001f\u007f"\\/]/g,'').slice(0,200)||'file';
const extension=name=>{const ext=path.extname(name).toLowerCase();return /^\.[a-z0-9]{1,10}$/.test(ext)?ext:'.bin'};

export function installExternalLinks({app,pool,auth,uploadDir,maxMb=Number(process.env.EXTERNAL_LINK_MAX_MB||300),reserveMb=Number(process.env.EXTERNAL_LINK_RESERVE_MB||100)}){
 const dir=path.join(uploadDir,externalLinksFolder);fs.mkdirSync(dir,{recursive:true});
 const route=fn=>async(req,res,next)=>{try{await fn(req,res)}catch(e){next(e)}};
 const remove=name=>{if(name)fs.unlink(path.join(dir,path.basename(name)),()=>{})};
 const free=async()=>{try{const s=await fs.promises.statfs(dir);return Number(s.bavail)*Number(s.bsize)}catch{return null}};
 const upload=multer({
  storage:multer.diskStorage({destination:(_req,_file,cb)=>cb(null,dir),filename:(_req,file,cb)=>cb(null,crypto.randomUUID()+extension(originalName(file)))}),
  limits:{fileSize:maxMb*1024*1024,files:1,fields:10}
 }).single('file');
 /* auth runs before the body is read, so an anonymous request never writes to disk. */
 const receive=(req,res,next)=>upload(req,res,error=>{
  if(!error)return next();
  if(req.file?.path)fs.unlink(req.file.path,()=>{});
  next(fail(error.code==='LIMIT_FILE_SIZE'?`حجم الملف أكبر من الحد المسموح (${maxMb} ميجابايت).`:'تعذّر استلام الملف. أعد المحاولة.',error.code==='LIMIT_FILE_SIZE'?413:400));
 });
 const stored=async req=>{
  if(!req.file)throw fail('اختر الملف المراد رفعه.');
  if(!req.file.size){remove(req.file.filename);throw fail('الملف فارغ.')}
  const left=await free();
  if(left!=null&&left<reserveMb*1024*1024){remove(req.file.filename);throw fail('مساحة التخزين في الموقع لا تكفي لهذا الملف. احذف ملفات قديمة أو كبّر مساحة التخزين.',507)}
  return {file_name:originalName(req.file),stored_name:req.file.filename,mime:String(req.file.mimetype||'application/octet-stream').slice(0,120),size_bytes:req.file.size};
 };
 const freshSlug=async wanted=>{
  if(wanted){if((await pool.query('SELECT 1 FROM external_links WHERE slug=$1',[wanted])).rows.length)throw fail('اسم الرابط مستخدم لملف آخر. اختر اسمًا مختلفًا.',409);return wanted}
  for(let i=0;i<6;i++){const slug=crypto.randomBytes(5).toString('hex').slice(0,8);if(!(await pool.query('SELECT 1 FROM external_links WHERE slug=$1',[slug])).rows.length)return slug}
  throw fail('تعذّر إنشاء الرابط. أعد المحاولة.',500);
 };

 app.get('/api/admin/external-links',auth,route(async(_req,res)=>{
  const result=await pool.query(`SELECT ${columns} FROM external_links ORDER BY created_at DESC,id`);
  const used=result.rows.reduce((sum,row)=>sum+Number(row.size_bytes),0);
  res.set('Cache-Control','no-store').json({version:1,maxMb,usedBytes:used,freeBytes:await free(),items:result.rows});
 }));
 app.post('/api/admin/external-links',auth,receive,route(async(req,res)=>{
  res.set('Cache-Control','no-store');let file;
  try{
   const text=externalLinkText(req.body),wanted=externalLinkSlug(req.body.slug);file=await stored(req);const slug=await freshSlug(wanted);
   const result=await pool.query(`INSERT INTO external_links(id,slug,title,description,file_name,stored_name,mime,size_bytes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${columns}`,
    [crypto.randomUUID(),slug,text.title,text.description,file.file_name,file.stored_name,file.mime,file.size_bytes]);
   res.status(201).json(result.rows[0]);
  }catch(error){remove(file?.stored_name||req.file?.filename);if(error.code==='23505')throw fail('اسم الرابط مستخدم لملف آخر. اختر اسمًا مختلفًا.',409);throw error}
 }));
 app.put('/api/admin/external-links/:id',auth,route(async(req,res)=>{
  res.set('Cache-Control','no-store');if(!uuid.test(req.params.id))throw fail('الرابط غير موجود.',404);
  const text=externalLinkText(req.body);if(typeof req.body.active!=='boolean')throw fail('حدد حالة الرابط.');
  const result=await pool.query(`UPDATE external_links SET title=$2,description=$3,active=$4,updated_at=now() WHERE id=$1 RETURNING ${columns}`,[req.params.id,text.title,text.description,req.body.active]);
  if(!result.rows[0])throw fail('الرابط غير موجود.',404);res.json(result.rows[0]);
 }));
 /* Replace the file behind an existing link: the public link stays the same. */
 app.post('/api/admin/external-links/:id/file',auth,receive,route(async(req,res)=>{
  res.set('Cache-Control','no-store');let file;
  try{
   if(!uuid.test(req.params.id))throw fail('الرابط غير موجود.',404);file=await stored(req);
   const old=(await pool.query('SELECT stored_name FROM external_links WHERE id=$1',[req.params.id])).rows[0];if(!old)throw fail('الرابط غير موجود.',404);
   const result=await pool.query(`UPDATE external_links SET file_name=$2,stored_name=$3,mime=$4,size_bytes=$5,updated_at=now() WHERE id=$1 RETURNING ${columns}`,[req.params.id,file.file_name,file.stored_name,file.mime,file.size_bytes]);
   if(!result.rows[0])throw fail('الرابط غير موجود.',404);
   remove(old.stored_name);res.json(result.rows[0]);
  }catch(error){if(!res.headersSent)remove(file?.stored_name||req.file?.filename);throw error}
 }));
 app.delete('/api/admin/external-links/:id',auth,route(async(req,res)=>{
  res.set('Cache-Control','no-store');if(!uuid.test(req.params.id))throw fail('الرابط غير موجود.',404);
  const result=await pool.query('DELETE FROM external_links WHERE id=$1 RETURNING stored_name',[req.params.id]);
  if(!result.rows[0])throw fail('الرابط غير موجود.',404);remove(result.rows[0].stored_name);res.json({ok:true});
 }));

 const find=async slug=>{
  const value=String(slug||'').toLowerCase();if(!slugPattern.test(value))return null;
  return (await pool.query('SELECT id,slug,title,description,file_name,stored_name,mime,size_bytes FROM external_links WHERE slug=$1 AND active=true',[value])).rows[0]||null;
 };
 app.get('/api/external-links/:slug',route(async(req,res)=>{
  res.set('Cache-Control','no-store');const row=await find(req.params.slug);if(!row)throw fail('هذا الرابط غير متاح.',404);
  await pool.query('UPDATE external_links SET views=views+1 WHERE id=$1',[row.id]);
  res.json({version:1,slug:row.slug,title:row.title,description:row.description,fileName:row.file_name,sizeBytes:Number(row.size_bytes)});
 }));
 app.get('/api/external-links/:slug/file',route(async(req,res)=>{
  const row=await find(req.params.slug);if(!row)throw fail('هذا الرابط غير متاح.',404);
  const file=path.join(dir,path.basename(row.stored_name));
  if(!fs.existsSync(file))throw fail('الملف غير موجود حاليًا. تواصل معنا للحصول عليه.',404);
  /* A ranged request is a resumed or chunked download of the same file: count the first byte range only. */
  if(!req.headers.range||/^bytes=0-/.test(req.headers.range))await pool.query('UPDATE external_links SET downloads=downloads+1 WHERE id=$1',[row.id]);
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':'sandbox','X-Robots-Tag':'noindex'});
  res.download(file,row.file_name,{dotfiles:'allow'},error=>{if(error&&!res.headersSent)res.status(404).json({error:'تعذّر تنزيل الملف.'})});
 }));
}
