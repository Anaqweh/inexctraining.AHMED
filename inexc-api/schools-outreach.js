// قسم «المدارس» في لوحة الإدارة: قائمة المدارس مقسّمة بالإمارة، وقوالب بريد خاصة بها،
// والإرسال عبر نظام الحملات الحالي (نفس الطابور، نفس تقارير الوصول، ونفس سجل إلغاء الاشتراك).
import crypto from 'node:crypto';
import express from 'express';
import { readXlsxSheets } from './schools-xlsx.js';
import { EMIRATES, schoolTemplates, templateById, schoolSettings, renderSchoolMail, schoolLanguage, contactDefaults } from './schools-mail.js';
import { blockedEmails, deliveryUnsubscribeUrl } from './message-suppression.js';

const clean = (v, n = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const uuid = v => /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(String(v));
const validEmail = v => /^[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)+$/i.test(v) && v.length <= 180 && !v.includes('..');
export const PERSONAL_TYPE = /شخصي/;
const HEADERS = { name: 'المدرسة', email: 'البريد الإلكتروني', phone: 'الهاتف', area: 'المنطقة', address_type: 'نوع العنوان', curriculum: 'المنهج', notes: 'التقييم وملاحظات', website: 'الموقع الإلكتروني', email_source: 'مصدر البريد', priority: 'الأولوية', record_source: 'مصدر السجل', contact_status: 'حالة التواصل' };

export async function setupSchoolsOutreach(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS outreach_schools (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, emirate TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', area TEXT NOT NULL DEFAULT '',
      address_type TEXT NOT NULL DEFAULT '', curriculum TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
      website TEXT NOT NULL DEFAULT '', email_source TEXT NOT NULL DEFAULT '', priority SMALLINT NOT NULL DEFAULT 3,
      record_source TEXT NOT NULL DEFAULT '', contact_status TEXT NOT NULL DEFAULT '', language TEXT NOT NULL DEFAULT '',
      excluded BOOLEAN NOT NULL DEFAULT false, send_count INTEGER NOT NULL DEFAULT 0, last_sent_at TIMESTAMPTZ,
      last_template TEXT NOT NULL DEFAULT '', last_delivery_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS outreach_schools_identity ON outreach_schools(emirate, name);
    CREATE INDEX IF NOT EXISTS outreach_schools_email ON outreach_schools(email);
    CREATE TABLE IF NOT EXISTS outreach_school_sends (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL REFERENCES outreach_schools(id) ON DELETE CASCADE,
      campaign_id UUID, delivery_id UUID, template TEXT NOT NULL DEFAULT '', language TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS outreach_school_sends_school ON outreach_school_sends(school_id);
    CREATE TABLE IF NOT EXISTS outreach_school_settings (id INTEGER PRIMARY KEY CHECK(id=1), value JSONB NOT NULL DEFAULT '{}');
  `);
}

// يحوّل أوراق المصنف إلى سجلات مدارس. تُقرأ فقط الأوراق التي يبدأ اسمها بكلمة «مدارس»، واسم الإمارة هو بقية اسم الورقة.
export function parseSchoolSheets(sheets) {
  const rows = [], used = [], skipped = [], seen = new Map();
  let invalidEmails = 0, merged = 0;
  // مدرسة واحدة بأكثر من عنوان تبقى سجلًا واحدًا بأنسب عنوان: المدير ثم العنوان الرسمي/العام، وآخرها الحسابات والقبول والشخصي.
  const rank = r => !r.email ? 9 : /مدير/.test(r.address_type) ? 0 : /رسمي|عام/.test(r.address_type) ? 1 : PERSONAL_TYPE.test(r.address_type) ? 4 : /قبول|قسم آخر|حسابات/.test(r.address_type) ? 3 : 2;
  for (const sheet of sheets) {
    const title = clean(sheet.name, 60);
    if (!/^مدارس\s+/.test(title)) { skipped.push(title); continue; }
    const emirate = clean(title.replace(/^مدارس\s+/, ''), 40);
    const headerIndex = sheet.rows.findIndex(r => r.some(c => c === HEADERS.name) && r.some(c => c === HEADERS.email));
    if (headerIndex < 0) { skipped.push(title); continue; }
    const header = sheet.rows[headerIndex], column = Object.fromEntries(Object.entries(HEADERS).map(([key, label]) => [key, header.indexOf(label)]));
    const cell = (row, key, n = 200) => column[key] < 0 ? '' : clean(row[column[key]], n);
    let count = 0;
    for (const row of sheet.rows.slice(headerIndex + 1)) {
      const name = cell(row, 'name', 220);
      if (!name) continue;
      const key = emirate + '\n' + name;
      let email = cell(row, 'email', 181).toLowerCase();
      if (email && !validEmail(email)) { invalidEmails++; email = ''; }
      const priority = Number(/^\s*([123])/.exec(cell(row, 'priority', 40))?.[1]) || 3;
      const record = { name, emirate, email, phone: cell(row, 'phone', 80), area: cell(row, 'area', 120), address_type: cell(row, 'address_type', 80), curriculum: cell(row, 'curriculum', 80), notes: cell(row, 'notes', 600), website: cell(row, 'website', 200), email_source: cell(row, 'email_source', 160), priority, record_source: cell(row, 'record_source', 120), contact_status: cell(row, 'contact_status', 200) };
      if (seen.has(key)) { merged++; const kept = seen.get(key); if (rank(record) < rank(kept)) Object.assign(kept, record); continue; }
      seen.set(key, record); rows.push(record);
      count++;
    }
    used.push({ sheet: title, emirate, count });
  }
  return { rows, used, skipped, invalidEmails, merged };
}

export function installSchoolsOutreach({ app, pool, auth, sendEmail, worker = () => {}, mailEnabled = false }) {
  const prefix = '/api/admin/schools';
  const route = (method, path, handler, middleware = []) => app[method](prefix + path, auth, ...middleware, async (req, res) => {
    try { await handler(req, res); }
    catch (error) {
      const reference = crypto.randomUUID().slice(0, 8);
      // الأخطاء المقصودة (برسالة عربية وحالة محددة) تُعرض كما هي؛ غيرها يُسجَّل ويُعرض برسالة عامة.
      const expected = Number.isInteger(error.status), status = expected ? error.status : error.code === '22P02' ? 400 : 500;
      if (!expected) console.error(`[schools:${reference}]`, error);
      res.status(status).json({ error: expected ? error.message : 'تعذرت العملية على الخادم. أعد المحاولة؛ إذا استمرت المشكلة شارك مرجع الخطأ.', reference });
    }
  });
  const getSettings = async () => schoolSettings((await pool.query('SELECT value FROM outreach_school_settings WHERE id=1')).rows[0]?.value);
  const emirateOrder = id => { const i = EMIRATES.findIndex(e => e.id === id); return i < 0 ? 99 : i; };
  const unavailable = async emails => {
    const list = [...new Set(emails.filter(Boolean))];
    if (!list.length) return new Set();
    const blocked = await blockedEmails(pool, list);
    const opted = await pool.query('SELECT email FROM email_preferences WHERE marketing_opt_out AND email=ANY($1::text[])', [list]);
    const contacts = await pool.query('SELECT normalized_email AS email FROM message_contacts WHERE suppressed AND normalized_email=ANY($1::text[])', [list]);
    for (const row of [...opted.rows, ...contacts.rows]) blocked.add(row.email);
    return blocked;
  };
  const filters = (raw = {}) => ({
    emirate: clean(raw.emirate, 40),
    priorities: [...new Set((Array.isArray(raw.priorities) ? raw.priorities : [1, 2, 3]).map(Number).filter(n => [1, 2, 3].includes(n)))],
    onlyNew: raw.onlyNew !== false, excludePersonal: raw.excludePersonal !== false,
    limit: Number.isInteger(Number(raw.limit)) && Number(raw.limit) > 0 ? Math.min(3000, Number(raw.limit)) : 0,
    ids: (Array.isArray(raw.ids) ? raw.ids : []).filter(uuid).slice(0, 3000),
  });
  // يحدد من سيستلم: بريد صالح، غير مستثنى، لم يلغِ الاشتراك، ولا يتكرر العنوان الواحد.
  async function audience(raw) {
    const f = filters(raw);
    if (!f.emirate) throw fail('اختر الإمارة أولًا.');
    if (!f.priorities.length) throw fail('اختر أولوية واحدة على الأقل.');
    const all = (await pool.query('SELECT * FROM outreach_schools WHERE emirate=$1 ORDER BY priority, name', [f.emirate])).rows;
    const counts = { total: all.length, noEmail: 0, excluded: 0, personal: 0, alreadySent: 0, otherPriority: 0, unsubscribed: 0, duplicate: 0 };
    // العنوان الذي وصلته رسالة باسم أي مدرسة (عناوين مشتركة بين فروع) يُعدّ مُراسَلًا.
    const sentEmails = new Set((await pool.query("SELECT DISTINCT email FROM outreach_schools WHERE send_count>0 AND email<>''")).rows.map(r => r.email));
    const candidates = [];
    for (const school of all) {
      if (f.ids.length && !f.ids.includes(school.id)) continue;
      if (!school.email) { counts.noEmail++; continue; }
      if (school.excluded) { counts.excluded++; continue; }
      if (!f.priorities.includes(school.priority)) { counts.otherPriority++; continue; }
      if (f.excludePersonal && PERSONAL_TYPE.test(school.address_type)) { counts.personal++; continue; }
      if (f.onlyNew && (school.send_count > 0 || sentEmails.has(school.email))) { counts.alreadySent++; continue; }
      candidates.push(school);
    }
    const blocked = await unavailable(candidates.map(s => s.email)), seen = new Set(), recipients = [];
    for (const school of candidates) {
      if (blocked.has(school.email)) { counts.unsubscribed++; continue; }
      if (seen.has(school.email)) { counts.duplicate++; continue; }
      seen.add(school.email); recipients.push(school);
    }
    counts.eligible = recipients.length;
    const limited = f.limit ? recipients.slice(0, f.limit) : recipients;
    counts.selected = limited.length;
    return { filters: f, counts, recipients: limited };
  }
  const sample = async (raw = {}) => {
    if (uuid(raw.schoolId)) { const row = (await pool.query('SELECT * FROM outreach_schools WHERE id=$1', [raw.schoolId])).rows[0]; if (row) return row; }
    const emirate = clean(raw.emirate, 40) || 'دبي';
    return (await pool.query("SELECT * FROM outreach_schools WHERE emirate=$1 ORDER BY (email<>'') DESC, priority, name LIMIT 1", [emirate])).rows[0] || { name: 'مدرسة النموذج الخاصة — Sample Private School', emirate, curriculum: '', email: '' };
  };
  const language = v => ['auto', 'ar', 'en', 'both'].includes(v) ? v : 'auto';
  const template = v => { const t = templateById(clean(v, 40)); if (!t) throw fail('اختر قالبًا من قوالب المدارس.'); return t; };

  route('get', '/overview', async (_req, res) => {
    const rows = (await pool.query(`SELECT emirate, count(*)::int AS total, count(*) FILTER (WHERE email<>'')::int AS with_email,
      count(*) FILTER (WHERE send_count>0)::int AS sent, count(*) FILTER (WHERE email<>'' AND send_count=0 AND NOT excluded)::int AS remaining,
      count(*) FILTER (WHERE priority=1)::int AS p1, count(*) FILTER (WHERE priority=2)::int AS p2, max(last_sent_at) AS last_sent_at
      FROM outreach_schools GROUP BY emirate`)).rows.sort((a, b) => emirateOrder(a.emirate) - emirateOrder(b.emirate) || a.emirate.localeCompare(b.emirate, 'ar'));
    res.json({ version: 1, mailEnabled, emirates: rows, templates: schoolTemplates.map(({ id, name, summary }) => ({ id, name, summary })), totals: rows.reduce((t, r) => ({ total: t.total + r.total, withEmail: t.withEmail + r.with_email, sent: t.sent + r.sent, remaining: t.remaining + r.remaining }), { total: 0, withEmail: 0, sent: 0, remaining: 0 }) });
  });

  route('post', '/import', async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw fail('ارفع ملف Excel بصيغة XLSX.');
    const parsed = parseSchoolSheets(readXlsxSheets(req.body));
    if (!parsed.rows.length) throw fail('لم نجد أوراقًا يبدأ اسمها بكلمة «مدارس» وتحتوي على عمودَي «المدرسة» و«البريد الإلكتروني».');
    if (parsed.rows.length > 5000) throw fail('الحد الأقصى 5000 مدرسة في الملف الواحد.');
    let added = 0, updated = 0;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const s of parsed.rows) {
        // تحديث بيانات المدرسة فقط؛ سجل الإرسال والاستثناء وحالة التواصل المدخلة يدويًا تبقى كما هي.
        const result = await client.query(`INSERT INTO outreach_schools(name,emirate,email,phone,area,address_type,curriculum,notes,website,email_source,priority,record_source,contact_status)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT(emirate,name) DO UPDATE SET email=EXCLUDED.email,phone=EXCLUDED.phone,area=EXCLUDED.area,address_type=EXCLUDED.address_type,curriculum=EXCLUDED.curriculum,
            notes=EXCLUDED.notes,website=EXCLUDED.website,email_source=EXCLUDED.email_source,priority=EXCLUDED.priority,record_source=EXCLUDED.record_source,
            contact_status=CASE WHEN outreach_schools.contact_status='' THEN EXCLUDED.contact_status ELSE outreach_schools.contact_status END,updated_at=now()
          RETURNING (xmax=0) AS inserted`, [s.name, s.emirate, s.email, s.phone, s.area, s.address_type, s.curriculum, s.notes, s.website, s.email_source, s.priority, s.record_source, s.contact_status]);
        if (result.rows[0]?.inserted) added++; else updated++;
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    res.status(201).json({ ok: true, added, updated, sheets: parsed.used, skippedSheets: parsed.skipped, invalidEmails: parsed.invalidEmails, merged: parsed.merged });
  }, [express.raw({ type: () => true, limit: '6mb' })]);

  route('get', '/list', async (req, res) => {
    const emirate = clean(req.query.emirate, 40);
    if (!emirate) throw fail('اختر الإمارة أولًا.');
    const rows = (await pool.query(`SELECT s.id,s.name,s.emirate,s.email,s.phone,s.area,s.address_type,s.curriculum,s.notes,s.website,s.priority,s.contact_status,s.language,s.excluded,s.send_count,s.last_sent_at,s.last_template,
      d.status AS delivery_status, d.error AS delivery_error FROM outreach_schools s LEFT JOIN email_deliveries d ON d.id=s.last_delivery_id WHERE s.emirate=$1 ORDER BY s.priority, s.name`, [emirate])).rows;
    const blocked = await unavailable(rows.map(r => r.email));
    res.json({ schools: rows.map(r => ({ ...r, unsubscribed: !!r.email && blocked.has(r.email), auto_language: schoolLanguage(r, 'auto') })) });
  });

  route('patch', '/:id', async (req, res) => {
    if (!uuid(req.params.id)) throw fail('معرّف المدرسة غير صالح.');
    const sets = [], params = [];
    const add = (column, value) => { params.push(value); sets.push(`${column}=$${params.length}`); };
    if (typeof req.body?.excluded === 'boolean') add('excluded', req.body.excluded);
    if (req.body?.contact_status !== undefined) add('contact_status', clean(req.body.contact_status, 200));
    if (req.body?.language !== undefined) add('language', ['ar', 'en', 'both'].includes(req.body.language) ? req.body.language : '');
    if (req.body?.email !== undefined) { const email = clean(req.body.email, 181).toLowerCase(); if (email && !validEmail(email)) throw fail('عنوان البريد غير صالح.'); add('email', email); }
    if (!sets.length) throw fail('لا يوجد تغيير للحفظ.');
    params.push(req.params.id);
    const row = (await pool.query(`UPDATE outreach_schools SET ${sets.join(',')},updated_at=now() WHERE id=$${params.length} RETURNING id,email,excluded,contact_status,language`, params)).rows[0];
    if (!row) throw fail('لم نجد المدرسة.', 404);
    res.json(row);
  });

  route('get', '/settings', async (_req, res) => res.json({ settings: await getSettings(), defaults: contactDefaults, emirates: EMIRATES.map(e => e.id), templates: schoolTemplates }));
  route('put', '/settings', async (req, res) => {
    const settings = schoolSettings(req.body);
    await pool.query('INSERT INTO outreach_school_settings(id,value) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET value=EXCLUDED.value', [settings]);
    res.json({ settings });
  });

  route('post', '/audience', async (req, res) => { const result = await audience(req.body); res.json({ counts: result.counts, sample: result.recipients.slice(0, 5).map(s => ({ id: s.id, name: s.name, email: s.email })) }); });

  route('post', '/preview', async (req, res) => {
    const t = template(req.body?.templateId), school = await sample(req.body);
    // معاينة نص لم يُحفظ بعد: تُدمج تعديلات المحرر فوق الإعدادات المحفوظة لهذه المعاينة فقط.
    const saved = await getSettings(), draft = req.body?.draft && typeof req.body.draft === 'object' ? schoolSettings({ ...saved, ...req.body.draft, templates: { ...saved.templates, ...(req.body.draft.templates || {}) } }) : saved;
    const mail = renderSchoolMail({ templateId: t.id, language: language(req.body?.language), school, settings: draft, unsubscribeUrl: 'https://www.inexctraining.com/' });
    res.json({ subject: mail.subject, html: mail.html, language: mail.language, school: { id: school.id || '', name: school.name, emirate: school.emirate } });
  });

  route('post', '/test', async (req, res) => {
    if (!mailEnabled) throw fail('خدمة البريد غير مهيأة على الخادم.', 503);
    const t = template(req.body?.templateId), email = clean(req.body?.email, 181).toLowerCase();
    if (!validEmail(email)) throw fail('اكتب بريدك الإلكتروني لاستلام التجربة.');
    const school = await sample(req.body), settings = await getSettings();
    const mail = renderSchoolMail({ templateId: t.id, language: language(req.body?.language), school, settings, unsubscribeUrl: 'https://www.inexctraining.com/', test: true });
    await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text, replyTo: mail.replyTo });
    res.json({ ok: true, email, school: school.name });
  });

  route('post', '/send', async (req, res) => {
    if (!mailEnabled) throw fail('خدمة البريد غير مهيأة على الخادم.', 503);
    const t = template(req.body?.templateId), mode = language(req.body?.language), requestId = clean(req.body?.requestId, 80);
    if (!/^[\w-]{12,80}$/.test(requestId)) throw fail('طلب الإرسال غير مكتمل. حدّث الصفحة وأعد المحاولة.');
    const submissionKey = 'schools/' + requestId;
    const previous = (await pool.query('SELECT id,status,total_recipients,scheduled_at FROM email_campaigns WHERE submission_key=$1', [submissionKey])).rows[0];
    if (previous) return res.json({ ok: true, campaignId: previous.id, status: previous.status, total: previous.total_recipients, scheduledAt: previous.scheduled_at, reused: true });
    let scheduledAt = null;
    if (req.body?.scheduledAt) {
      const date = new Date(req.body.scheduledAt);
      if (!Number.isFinite(date.getTime()) || date.getTime() < Date.now() + 30000) throw fail('اختر موعدًا مستقبليًا للإرسال.');
      scheduledAt = date.toISOString();
    }
    const resolved = await audience(req.body);
    if (!resolved.recipients.length) throw fail('لا توجد مدارس مؤهلة للإرسال ضمن هذا الاختيار.');
    // حماية من الإرسال غير المقصود: العدد الذي راجعه المسؤول يجب أن يطابق العدد الفعلي.
    if (Number(req.body?.confirmCount) !== resolved.recipients.length) throw fail('تغيّر عدد المدارس منذ المراجعة. راجع العدد ثم أكّد الإرسال من جديد.', 409);
    const settings = await getSettings(), emirate = resolved.filters.emirate;
    const title = `مدارس ${emirate} — ${t.name}`;
    const client = await pool.connect();
    let campaign;
    try {
      await client.query('BEGIN');
      campaign = (await client.query(`INSERT INTO email_campaigns(subject,body,audience,status,scheduled_at,total_recipients,skipped_unsubscribed,course_name,settings,audience_snapshot,submission_key)
        VALUES($1,$2,$3,$4,$5,$6,$7,'',$8,$9,$10) RETURNING id,status,total_recipients,scheduled_at`,
      [title, `رسالة قسم المدارس: قالب «${t.name}» إلى مدارس ${emirate}. المحتوى مخصّص لكل مدرسة ومحفوظ مع كل مستلم.`, 'schools', scheduledAt ? 'scheduled' : 'queued', scheduledAt, resolved.recipients.length, resolved.counts.unsubscribed,
        { schools: { templateId: t.id, language: mode, emirate } }, { audience: 'schools', schools: { ...resolved.filters, templateId: t.id, language: mode } }, submissionKey])).rows[0];
      for (const school of resolved.recipients) {
        const token = crypto.randomUUID(), unsubscribeUrl = deliveryUnsubscribeUrl(token);
        const mail = renderSchoolMail({ templateId: t.id, language: mode, school, settings, unsubscribeUrl });
        const payload = { subject: mail.subject, html: mail.html, text: mail.text, replyTo: mail.replyTo, headers: { 'List-Unsubscribe': '<' + unsubscribeUrl + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
        const delivery = (await client.query("INSERT INTO email_deliveries(campaign_id,email,recipient_name,status,unsubscribe_token,payload_snapshot) VALUES($1,$2,$3,'queued',$4,$5) RETURNING id", [campaign.id, school.email, clean(school.name, 160), token, payload])).rows[0];
        await client.query('INSERT INTO outreach_school_sends(school_id,campaign_id,delivery_id,template,language) VALUES($1,$2,$3,$4,$5)', [school.id, campaign.id, delivery.id, t.id, mail.language]);
        await client.query('UPDATE outreach_schools SET send_count=send_count+1,last_sent_at=now(),last_template=$2,last_delivery_id=$3,updated_at=now() WHERE id=$1', [school.id, t.id, delivery.id]);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    res.status(202).json({ ok: true, campaignId: campaign.id, status: campaign.status, total: campaign.total_recipients, scheduledAt: campaign.scheduled_at });
    if (campaign.status === 'queued') void worker();
  });

  route('get', '/campaigns', async (_req, res) => {
    const rows = (await pool.query(`SELECT c.id,c.subject,c.status,c.created_at,c.scheduled_at,c.sent_at,c.total_recipients,c.settings->'schools' AS schools,
      count(d.id) FILTER (WHERE d.status IN ('sent','delivered','opened','clicked'))::int AS sent,
      count(d.id) FILTER (WHERE d.delivered_at IS NOT NULL OR d.status IN ('delivered','opened','clicked'))::int AS delivered,
      count(d.id) FILTER (WHERE d.opened_at IS NOT NULL)::int AS opened, count(d.id) FILTER (WHERE d.clicked_at IS NOT NULL)::int AS clicked,
      count(d.id) FILTER (WHERE d.status IN ('failed','bounced','complained'))::int AS failed, count(d.id) FILTER (WHERE d.status='queued')::int AS queued
      FROM email_campaigns c LEFT JOIN email_deliveries d ON d.campaign_id=c.id WHERE c.audience='schools' GROUP BY c.id ORDER BY c.created_at DESC LIMIT 60`)).rows;
    res.json({ campaigns: rows });
  });
}
