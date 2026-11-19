// قوالب بريد المدارس: أربعة أشكال غير تقليدية للتعريف بشركة التميز الابتكاري وخدماتها.
// كل النصوص قابلة للتعديل من لوحة الإدارة؛ التصميم جداول HTML بأنماط داخلية لتعمل في كل برامج البريد.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (v, n) => String(v ?? '').trim().slice(0, n);
const BLUE = '#074ab2', NAVY = '#0b2d5c', INK = '#1d2f45', MUTED = '#5b6f86', LINE = '#d9e4f1', TINT = '#f1f6fd', PAGE = '#eef2f7';
const SITE = 'https://www.inexctraining.com';
export const LOGO_URL = SITE + '/assets/inexc-logo-email.png';

export const EMIRATES = [
  { id: 'دبي', en: 'Dubai', authorityAr: 'هيئة المعرفة والتنمية البشرية', authorityEn: 'KHDA' },
  { id: 'أبوظبي', en: 'Abu Dhabi', authorityAr: 'دائرة التعليم والمعرفة', authorityEn: 'ADEK' },
  { id: 'العين', en: 'Al Ain', authorityAr: 'دائرة التعليم والمعرفة', authorityEn: 'ADEK' },
  { id: 'الظفرة', en: 'Al Dhafra', authorityAr: 'دائرة التعليم والمعرفة', authorityEn: 'ADEK' },
  { id: 'الشارقة', en: 'Sharjah', authorityAr: 'هيئة الشارقة للتعليم الخاص', authorityEn: 'SPEA' },
  { id: 'عجمان', en: 'Ajman', authorityAr: 'وزارة التربية والتعليم', authorityEn: 'the Ministry of Education' },
  { id: 'رأس الخيمة', en: 'Ras Al Khaimah', authorityAr: 'وزارة التربية والتعليم', authorityEn: 'the Ministry of Education' },
  { id: 'أم القيوين', en: 'Umm Al Quwain', authorityAr: 'وزارة التربية والتعليم', authorityEn: 'the Ministry of Education' },
  { id: 'الفجيرة', en: 'Fujairah', authorityAr: 'وزارة التربية والتعليم', authorityEn: 'the Ministry of Education' },
];
export const emirateInfo = id => EMIRATES.find(e => e.id === id) || { id, en: id, authorityAr: 'الجهة التعليمية المختصة', authorityEn: 'your education regulator' };

export const contactDefaults = {
  senderName: 'فريق التميز الابتكاري', senderNameEn: 'The INEXC Team', senderTitle: 'شركة التميز الابتكاري (INEXC) — دبي', senderTitleEn: 'INEXC Innovative Excellence — Dubai',
  whatsapp: '971543475500', email: 'info@inexc.com', replyTo: 'info@inexc.com', website: SITE + '/', requestUrl: SITE + '/register.html?type=institution',
  emirateLineAr: 'ولأن مدارس {{emirate}} تعمل ضمن متطلبات {{authority}}، نربط كل ورشة بمخرجات يمكن توثيقها في ملف التطوير المهني للمعلم.',
  emirateLineEn: 'Because schools in {{emirate}} work within {{authority}} expectations, every workshop ends with outputs a teacher can file as evidence of professional development.',
  footerAr: 'شركة التميز الابتكاري INEXC · دبي، الإمارات العربية المتحدة', footerEn: 'INEXC Innovative Excellence · Dubai, United Arab Emirates',
  reasonAr: 'وصلتكم هذه الرسالة على البريد المنشور لـ{{school}}.', reasonEn: 'You are receiving this at the published contact address of {{school}}.',
  unsubscribeAr: 'إلغاء استلام رسائلنا', unsubscribeEn: 'Unsubscribe', websiteLabel: 'inexctraining.com',
  emirateLines: {},
};
// حقول الإعدادات العامة التي يجوز تركها فارغة لإخفائها من الرسالة.
const optionalText = { senderName: 120, senderNameEn: 120, senderTitle: 120, senderTitleEn: 120, footerAr: 300, footerEn: 300, reasonAr: 300, reasonEn: 300, websiteLabel: 80 };

// نوع الحقل: line سطر واحد، text فقرة، list قائمة (كل عنصر في سطر، والأجزاء يفصل بينها |).
const F = (key, label, type, ar, en, hint = '') => ({ key, label, type, ar, en, hint });
export const schoolTemplates = [
  { id: 'letter', name: 'رسالة شخصية', summary: 'رسالة قصيرة هادئة بلا مظهر إعلاني، كأنها مكتوبة لهذه المدرسة تحديدًا. الأنسب كأول تواصل.', fields: [
    F('subject', 'عنوان الرسالة', 'line', 'إلى إدارة {{school}} — فكرة لمعلميكم هذا الفصل', 'A short note for the leadership of {{school}}'),
    F('greeting', 'التحية', 'line', 'السادة إدارة {{school}} المحترمين،', 'Dear {{school}} leadership team,'),
    F('p1', 'الفقرة الأولى (من نحن)', 'text', 'تحية طيبة، نكتب لكم من شركة التميز الابتكاري (INEXC) في دبي. نعمل مع المعلمين والقيادات المدرسية على هدف واحد: أن يتحول التدريب إلى عمل منجز داخل الصف، لا إلى شهادة حضور فقط.', 'We are INEXC Innovative Excellence, a training company based in Dubai. We work with teachers and school leaders on one thing: professional development that ends as finished work in the classroom, not just an attendance certificate.'),
    F('p2', 'سطر الإمارة', 'text', '{{emirateLine}}', '{{emirateLine}}', 'اتركه {{emirateLine}} ليُستخدم سطر الإمارة من الإعدادات.'),
    F('pointsTitle', 'عنوان النقاط', 'line', 'ما الذي يمكن أن نقدمه لمعلمي {{school}}؟', 'What we can offer the teachers of {{school}}'),
    F('points', 'النقاط (العنوان | الشرح)', 'list', 'الذكاء الاصطناعي في التحضير والتدريس | يخرج المعلم من الورشة بخطة درس وأنشطة متمايزة جاهزة لمادته.\nالتقويم الذكي | بناء الاختبارات وسلالم التقدير والتغذية الراجعة، مع بقاء الحكم التربوي بيد المعلم.\nتحليل بيانات التعلم | قراءة نتائج الطلبة وتحويلها إلى خطط دعم قابلة للمتابعة.', 'AI for planning and teaching | Each teacher leaves with a lesson plan and differentiated activities for their own subject.\nSmart assessment | Building tests, rubrics and feedback, with professional judgement staying in the teacher’s hands.\nLearning-data analysis | Reading student results and turning them into support plans that can be followed up.'),
    F('p3', 'الفقرة الختامية', 'text', 'نصمم البرنامج بحسب احتياج مدرستكم وعدد المعلمين والوقت المتاح. يكفي أن تردّوا على هذه الرسالة بكلمة «مهتمون» لنرسل لكم مقترحًا موجزًا من صفحة واحدة.', 'Programmes are delivered live in Arabic and shaped around your school’s needs, team size and available time — a natural fit for your Arabic-speaking staff. Simply reply “Interested” and we will send a one-page proposal.'),
    F('ps', 'ملاحظة أخيرة', 'line', 'ملاحظة: يمكن البدء بورشة قصيرة لفريق واحد، ثم تقررون ما بعدها.', 'P.S. You can start with one short workshop for a single team, then decide what comes next.'),
  ] },
  { id: 'day', name: 'يوم تدريبي بالساعة', summary: 'يعرض الخدمة كجدول يوم تطوير مهني: ماذا يحدث قبل اليوم، وخلاله، وبعده. يجيب عن سؤال «ماذا سنحصل بالضبط؟».', fields: [
    F('subject', 'عنوان الرسالة', 'line', 'يوم تطوير مهني واحد لمعلمي {{school}} — كيف يبدو؟', 'One professional-development day for {{school}} — what it looks like'),
    F('eyebrow', 'السطر العلوي', 'line', 'لمدارس {{emirate}}', 'For schools in {{emirate}}'),
    F('headline', 'العنوان الرئيسي', 'line', 'يوم واحد. مخرجات تبقى مع المعلم.', 'One day. Outputs that stay with the teacher.'),
    F('intro', 'المقدمة', 'text', 'هكذا يبدو يوم تطوير مهني تنفذه شركة التميز الابتكاري (INEXC) لمعلمي {{school}}:', 'This is how a professional-development day run by INEXC looks for the teachers of {{school}}:'),
    F('steps', 'خطوات اليوم (الوقت | العنوان | الشرح)', 'list', 'قبل اليوم | نسمع منكم | نحدد مع الإدارة أولوية واحدة: التحضير، التقويم، أو قراءة نتائج الطلبة.\nالجلسة الأولى | نطبّق على مادة المعلم | يعمل كل معلم على درس حقيقي من منهجه، لا على أمثلة عامة.\nالجلسة الثانية | نبني ونراجع | خطة درس ونشاط متمايز وأداة تقويم يراجعها المدرب مع المعلم.\nنهاية اليوم | مخرجات جاهزة | يغادر كل معلم بملف يمكنه استخدامه في الأسبوع التالي.\nبعد اليوم | ملخص للإدارة | ما الذي أُنجز، وما الخطوة المقترحة بعده.', 'Before | We listen | Together with leadership we pick one priority: planning, assessment, or reading student results.\nSession one | Applied to the teacher’s subject | Every teacher works on a real lesson from their own curriculum, not generic examples.\nSession two | Build and review | A lesson plan, a differentiated activity and an assessment tool, reviewed with the trainer.\nEnd of day | Ready outputs | Each teacher leaves with a file they can use the following week.\nAfter | A summary for leadership | What was achieved and the suggested next step.'),
    F('p2', 'سطر الإمارة', 'text', '{{emirateLine}}', '{{emirateLine}}', 'اتركه {{emirateLine}} ليُستخدم سطر الإمارة من الإعدادات.'),
    F('about', 'عن الشركة', 'text', 'شركة التميز الابتكاري (INEXC) — دبي. برامج عملية في الذكاء الاصطناعي والتطوير التعليمي، مصممة للمعلمين والقادة والمؤسسات التي تريد الانتقال من المعرفة إلى التطبيق.', 'INEXC Innovative Excellence — Dubai. Practical programmes in AI and educational development for teachers, leaders and institutions that want to move from knowledge to application. Delivered live in Arabic.'),
    F('cta', 'نص الزر', 'line', 'اطلبوا مقترحًا لمدرستكم', 'Request a proposal for your school'),
  ] },
  { id: 'menu', name: 'قائمة البرامج', summary: 'يعرض البرامج كقائمة مرقّمة يختار منها مدير المدرسة ويردّ برقم البرنامج فقط. قرار في ثوانٍ.', fields: [
    F('subject', 'عنوان الرسالة', 'line', 'قائمة التطوير المهني لمدارس {{emirate}} — اختاروا برقم', 'A professional-development menu for schools in {{emirate}} — choose by number'),
    F('eyebrow', 'السطر العلوي', 'line', 'إلى {{school}}', 'For {{school}}'),
    F('headline', 'العنوان الرئيسي', 'line', 'قائمة التطوير المهني', 'The professional-development menu'),
    F('intro', 'المقدمة', 'text', 'اختاروا برنامجًا واحدًا، وردّوا على هذه الرسالة برقمه فقط. نتولى الباقي.', 'Pick one programme and reply to this email with its number only. We take it from there.'),
    F('items', 'البرامج (الاسم | الوصف | الفئة)', 'list', 'هندسة الأوامر للمعلم | من السؤال إلى تحضير وأنشطة وأسئلة جاهزة للاستخدام. | للمعلمين\nالتقويم الذكي | بناء الاختبارات وسلالم التقدير والتغذية الراجعة. | للمعلمين ورؤساء الأقسام\nتحليل بيانات التعلم | من نتائج الطلبة إلى لوحة مؤشرات وخطة دعم. | لمنسقي التقويم والقيادة\nالعروض والموارد التعليمية | عرض وورقة عمل وإنفوجرافيك باستخدام Canva والذكاء الاصطناعي. | للمعلمين\nالتصميم التعليمي وصناعة الحقائب | حقيبة تدريبية متكاملة من الاحتياج إلى التقويم. | لمسؤولي التطوير المهني\nبرنامج مصمم لمدرستكم | نبدأ من احتياجكم ونبني البرنامج حوله. | للمدرسة كلها', 'Prompt engineering for teachers | From a question to ready-to-use planning, activities and questions. | Teachers\nSmart assessment | Building tests, rubrics and feedback. | Teachers and heads of department\nLearning-data analysis | From student results to a dashboard and a support plan. | Assessment coordinators and leaders\nTeaching resources and presentations | A presentation, worksheet and infographic with Canva and AI. | Teachers\nInstructional design | A complete training kit, from needs analysis to assessment. | PD coordinators\nA programme designed for your school | We start from your need and build around it. | Whole school'),
    F('p2', 'سطر الإمارة', 'text', '{{emirateLine}}', '{{emirateLine}}', 'اتركه {{emirateLine}} ليُستخدم سطر الإمارة من الإعدادات.'),
    F('note', 'ملاحظة أسفل القائمة', 'text', 'كل البرامج تطبيقية: يعمل المعلم على مادته ويخرج بمخرجات قابلة للاستخدام، مع شهادة إتمام.', 'Every programme is hands-on and delivered live in Arabic: teachers work on their own subject, leave with usable outputs, and receive a certificate of completion.'),
    F('cta', 'نص الزر', 'line', 'أرسلوا رقم البرنامج عبر واتساب', 'Send the programme number on WhatsApp'),
    F('waText', 'رسالة واتساب الجاهزة عند ضغط الزر', 'text', 'مرحبًا INEXC، معكم {{school}} ({{emirate}}). نختار البرنامج رقم: ', 'Hello INEXC, this is {{school}} ({{emirate}}). We choose programme number: '),
  ] },
  { id: 'question', name: 'سؤال واحد', summary: 'رسالة من سؤال واحد وثلاث إجابات قابلة للضغط. كل ضغطة تفتح محادثة جاهزة باسم المدرسة. الأقصر والأعلى تفاعلًا.', fields: [
    F('subject', 'عنوان الرسالة', 'line', 'سؤال واحد لإدارة {{school}}', 'One question for the leadership of {{school}}'),
    F('eyebrow', 'السطر العلوي', 'line', 'سؤال واحد فقط', 'Just one question'),
    F('headline', 'السؤال', 'line', 'ما أكثر ما يستنزف وقت معلمي {{school}} هذا الفصل؟', 'What takes most of your teachers’ time at {{school}} this term?'),
    F('answers', 'الإجابات (كل إجابة في سطر)', 'list', 'تحضير الدروس والأنشطة\nبناء الاختبارات والتصحيح\nتحليل نتائج الطلبة والتقارير', 'Lesson and activity planning\nBuilding tests and marking\nAnalysing results and writing reports'),
    F('waText', 'رسالة واتساب الجاهزة عند ضغط إجابة', 'text', 'مرحبًا INEXC، معكم {{school}} ({{emirate}}). إجابتنا: {{answer}}.', 'Hello INEXC, this is {{school}} ({{emirate}}). Our answer: {{answer}}.', '{{answer}} تُستبدل بالإجابة التي ضُغطت.'),
    F('after', 'ما بعد الإجابات', 'text', 'اضغطوا الإجابة الأقرب لواقعكم، ونرسل لكم مقترحًا قصيرًا مبنيًا عليها. لا نماذج طويلة ولا اجتماعات.', 'Tap the answer closest to your reality and we will send a short proposal built around it. No long forms, no meetings.'),
    F('p2', 'سطر الإمارة', 'text', '{{emirateLine}}', '{{emirateLine}}', 'اتركه {{emirateLine}} ليُستخدم سطر الإمارة من الإعدادات.'),
    F('about', 'عن الشركة', 'text', 'شركة التميز الابتكاري (INEXC) — دبي. برامج عملية في الذكاء الاصطناعي والتطوير التعليمي للمعلمين والقيادات المدرسية.', 'INEXC Innovative Excellence — Dubai. Practical programmes in AI and educational development for teachers and school leaders, delivered live in Arabic.'),
  ] },
];
export const templateById = id => schoolTemplates.find(t => t.id === id);

export function schoolSettings(raw = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const contact = { ...contactDefaults };
  for (const [key, max] of Object.entries(optionalText)) if (input[key] !== undefined) contact[key] = clean(input[key], max);
  for (const key of ['emirateLineAr', 'emirateLineEn']) if (input[key] !== undefined) contact[key] = clean(input[key], 400);
  // رابط إلغاء الاستلام يبقى ظاهرًا دائمًا؛ نصّه فقط قابل للتغيير.
  for (const key of ['unsubscribeAr', 'unsubscribeEn']) if (clean(input[key], 80)) contact[key] = clean(input[key], 80);
  const whatsapp = String(input.whatsapp ?? '').replace(/[^\d]/g, '').replace(/^00/, '');
  if (/^[1-9]\d{7,14}$/.test(whatsapp)) contact.whatsapp = whatsapp;
  for (const key of ['email', 'replyTo']) { const v = clean(input[key], 160).toLowerCase(); if (/^[^\s<>@]+@[^\s<>@]+\.[a-z]{2,}$/.test(v)) contact[key] = v; }
  for (const key of ['website', 'requestUrl']) { try { const u = new URL(clean(input[key], 400)); if (u.protocol === 'https:' && !u.username && !u.password) contact[key] = u.href; } catch { /* يبقى الافتراضي */ } }
  contact.emirateLines = {};
  for (const [emirate, value] of Object.entries(input.emirateLines && typeof input.emirateLines === 'object' ? input.emirateLines : {}).slice(0, 30)) {
    const entry = { ar: clean(value?.ar, 400), en: clean(value?.en, 400), nameAr: clean(value?.nameAr, 60), nameEn: clean(value?.nameEn, 60), authorityAr: clean(value?.authorityAr, 120), authorityEn: clean(value?.authorityEn, 120) };
    if (Object.values(entry).some(Boolean)) contact.emirateLines[clean(emirate, 40)] = entry;
  }
  const templates = {};
  for (const template of schoolTemplates) {
    const source = input.templates?.[template.id];
    if (!source || typeof source !== 'object') continue;
    const out = {};
    for (const lang of ['ar', 'en']) {
      const values = {};
      for (const field of template.fields) { const v = source[lang]?.[field.key]; if (typeof v === 'string') values[field.key] = v.trim().slice(0, field.type === 'line' ? 220 : 2400); }
      if (Object.keys(values).length) out[lang] = values;
    }
    if (Object.keys(out).length) templates[template.id] = out;
  }
  return { ...contact, templates };
}

// «مدرسة الأرقم الخاصة — Al Arqm Private School» → الاسم المناسب للغة الرسالة.
export function schoolName(name, lang) {
  const parts = String(name || '').split(/\s+[—–]\s+/).map(v => v.trim()).filter(Boolean);
  if (parts.length < 2) return parts[0] || '';
  const arabic = parts.find(p => /[؀-ۿ]/.test(p)), latin = parts.find(p => !/[؀-ۿ]/.test(p));
  return (lang === 'en' ? latin || arabic : arabic || latin) || parts[0];
}
// لغة الرسالة تلقائيًا: المنهج الوزاري بالعربية، المناهج الأجنبية بالإنجليزية، وغير المعروف باللغتين.
export function schoolLanguage(school = {}, mode = 'auto') {
  if (['ar', 'en', 'both'].includes(mode)) return mode;
  if (['ar', 'en', 'both'].includes(school.language)) return school.language;
  const curriculum = String(school.curriculum || '');
  if (/وزاري/.test(curriculum)) return 'ar';
  if (curriculum) return 'en';
  return /[؀-ۿ]/.test(String(school.name || '')) ? 'both' : 'en';
}

const table = (content, style = '', attrs = '') => `<table role="presentation" cellspacing="0" cellpadding="0" border="0" ${attrs} style="border-collapse:collapse;${style}">${content}</table>`;
const listLines = value => String(value || '').split(/\r?\n/).map(line => line.split('|').map(part => part.trim())).filter(parts => parts[0]);

function context({ template, lang, school, settings }) {
  const english = lang === 'en', info = emirateInfo(school.emirate), custom = settings.emirateLines?.[school.emirate] || {};
  const variables = {
    school: schoolName(school.name, lang) || (english ? 'your school' : 'مدرستكم'),
    emirate: (english ? custom.nameEn : custom.nameAr) || (english ? info.en : (school.emirate === 'الظفرة' ? 'منطقة الظفرة' : school.emirate)),
    authority: (english ? custom.authorityEn : custom.authorityAr) || (english ? info.authorityEn : info.authorityAr),
    sender: english ? settings.senderNameEn : settings.senderName,
  };
  const merge = value => String(value ?? '').replace(/\{\{(school|emirate|authority|sender)\}\}/g, (_, key) => variables[key]);
  const override = custom[lang];
  variables.emirateLine = merge(override || (english ? settings.emirateLineEn : settings.emirateLineAr));
  const raw = key => { const field = template.fields.find(f => f.key === key); return settings.templates?.[template.id]?.[lang]?.[key] ?? field?.[lang] ?? ''; };
  const plain = key => merge(raw(key)).replace(/\{\{emirateLine\}\}/g, variables.emirateLine).trim();
  const dir = english ? 'ltr' : 'rtl', align = english ? 'left' : 'right', font = english ? 'Arial,Helvetica,sans-serif' : "Tahoma,'Segoe UI',Arial,sans-serif";
  return { english, lang, dir, align, font, variables, plain, merge, html: key => esc(plain(key)).replace(/\n/g, '<br>'), list: key => listLines(plain(key)), settings, school };
}
const whatsappUrl = (settings, text) => 'https://wa.me/' + settings.whatsapp + '?text=' + encodeURIComponent(text);
// الزر داخل صف بعرض كامل حتى لا يلتف ما بعده بجانبه في برامج البريد.
const button = (c, label, href) => !label ? '' : table(`<tr><td align="${c.align}" dir="${c.dir}">` + table(`<tr><td align="center" bgcolor="${BLUE}" style="background:${BLUE};border-radius:8px"><a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font-family:${c.font};font-size:16px;font-weight:700;line-height:1.5;color:#ffffff;text-decoration:none">${esc(label)}</a></td></tr>`) + `</td></tr>`, 'width:100%', 'width="100%"');
const paragraph = (c, html, extra = '') => html ? `<p dir="${c.dir}" style="margin:0 0 16px;font-family:${c.font};font-size:16px;line-height:1.95;color:${INK};text-align:${c.align};${extra}">${html}</p>` : '';
const eyebrow = (c, html, color = BLUE) => html ? `<div dir="${c.dir}" style="font-family:${c.font};font-size:13px;font-weight:700;line-height:1.7;color:${color};text-align:${c.align};margin:0 0 8px">${html}</div>` : '';
const headline = (c, html, color = NAVY, size = 28) => !html ? '' : `<div dir="${c.dir}" style="font-family:${c.font};font-size:${size}px;font-weight:700;line-height:1.5;color:${color};text-align:${c.align};margin:0 0 14px">${html}</div>`;
const signature = c => { const name = c.english ? c.settings.senderNameEn : c.settings.senderName, title = c.english ? c.settings.senderTitleEn : c.settings.senderTitle; return `<div dir="${c.dir}" style="font-family:${c.font};text-align:${c.align};border-top:1px solid ${LINE};margin-top:8px;padding-top:16px">${name ? `<div style="font-size:16px;font-weight:700;line-height:1.7;color:${NAVY}">${esc(name)}</div>` : ''}${title ? `<div style="font-size:13px;line-height:1.8;color:${MUTED}">${esc(title)}</div>` : ''}<div dir="ltr" style="font-size:13px;line-height:1.8;color:${MUTED};text-align:${c.align}"><a href="mailto:${esc(c.settings.email)}" style="color:${BLUE};text-decoration:none">${esc(c.settings.email)}</a> &nbsp;·&nbsp; <a href="https://wa.me/${esc(c.settings.whatsapp)}" style="color:${BLUE};text-decoration:none">+${esc(c.settings.whatsapp)}</a></div></div>`; };
const hero = (c, inner) => table(`<tr><td bgcolor="${BLUE}" style="background:${BLUE};border-radius:12px;padding:28px 26px">${inner}</td></tr>`, 'width:100%;margin:0 0 24px', 'width="100%"');
const aboutBox = (c, html) => html ? table(`<tr><td bgcolor="${TINT}" style="background:${TINT};border-radius:10px;padding:16px 18px;border-${c.english ? 'left' : 'right'}:4px solid ${BLUE}"><div dir="${c.dir}" style="font-family:${c.font};font-size:14px;line-height:1.9;color:${INK};text-align:${c.align}">${html}</div></td></tr>`, 'width:100%;margin:8px 0 22px', 'width="100%"') : '';
const spacer = `<div style="height:22px;line-height:22px;font-size:0">&nbsp;</div>`;

const bodies = {
  letter(c) {
    const points = c.list('points').map(([title, text]) => `<tr><td valign="top" width="14" style="width:14px;padding:9px 0 0"><div style="width:8px;height:8px;background:${BLUE};border-radius:8px;font-size:0;line-height:0">&nbsp;</div></td><td style="padding:0 0 12px;font-family:${c.font};font-size:16px;line-height:1.9;color:${INK};text-align:${c.align}" dir="${c.dir}"><strong style="color:${NAVY}">${esc(title)}</strong>${text ? `<br><span style="color:${MUTED};font-size:15px">${esc(text)}</span>` : ''}</td></tr>`).join('');
    return paragraph(c, c.html('greeting'), `font-weight:700;color:${NAVY}`) + paragraph(c, c.html('p1')) + paragraph(c, c.html('p2'))
      + (points ? (c.plain('pointsTitle') ? `<div dir="${c.dir}" style="font-family:${c.font};font-size:17px;font-weight:700;line-height:1.7;color:${NAVY};text-align:${c.align};margin:6px 0 12px">${c.html('pointsTitle')}</div>` : '') + table(points, 'width:100%;margin:0 0 6px', `width="100%" dir="${c.dir}"`) : '')
      + paragraph(c, c.html('p3')) + paragraph(c, c.html('ps'), `font-size:14px;color:${MUTED}`) + signature(c);
  },
  day(c) {
    const steps = c.list('steps'), side = c.english ? 'left' : 'right';
    const rows = steps.map(([time, title, text], i) => `<tr><td valign="top" width="118" style="width:118px;padding:0 0 ${i === steps.length - 1 ? 0 : 6}px"><div dir="${c.dir}" style="font-family:${c.font};font-size:13px;font-weight:700;line-height:1.6;color:#ffffff;background:${i === steps.length - 1 ? NAVY : BLUE};border-radius:6px;padding:7px 8px;text-align:center">${esc(time)}</div></td><td valign="top" style="padding:0 14px ${i === steps.length - 1 ? 0 : 18}px;border-${side}:2px solid ${LINE}" dir="${c.dir}"><div style="font-family:${c.font};font-size:17px;font-weight:700;line-height:1.6;color:${NAVY};text-align:${c.align}">${esc(title || '')}</div><div style="font-family:${c.font};font-size:15px;line-height:1.9;color:${MUTED};text-align:${c.align}">${esc(text || '')}</div></td></tr>`).join('');
    const top = eyebrow(c, c.html('eyebrow'), '#cfe2ff') + headline(c, c.html('headline'), '#ffffff', 30) + (c.plain('intro') ? `<div dir="${c.dir}" style="font-family:${c.font};font-size:16px;line-height:1.9;color:#e7f0ff;text-align:${c.align}">${c.html('intro')}</div>` : '');
    return (top ? hero(c, top) : '')
      + table(rows, 'width:100%;margin:0 0 24px', `width="100%" dir="${c.dir}"`) + paragraph(c, c.html('p2')) + aboutBox(c, c.html('about'))
      + (c.plain('cta') ? button(c, c.plain('cta'), c.settings.requestUrl) + spacer : '') + signature(c);
  },
  menu(c) {
    const items = c.list('items');
    const rows = items.map(([title, text, meta], i) => `<tr><td valign="top" width="46" style="width:46px;padding:14px 0;border-bottom:1px dashed ${LINE}"><div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;line-height:1.2;color:${BLUE};text-align:center" dir="ltr">${String(i + 1).padStart(2, '0')}</div></td><td valign="top" style="padding:14px 10px;border-bottom:1px dashed ${LINE}" dir="${c.dir}"><div style="font-family:${c.font};font-size:17px;font-weight:700;line-height:1.6;color:${NAVY};text-align:${c.align}">${esc(title)}</div>${text ? `<div style="font-family:${c.font};font-size:15px;line-height:1.85;color:${MUTED};text-align:${c.align}">${esc(text)}</div>` : ''}${meta ? `<div style="font-family:${c.font};font-size:12px;font-weight:700;line-height:1.8;color:${BLUE};text-align:${c.align};margin-top:4px">${esc(meta)}</div>` : ''}</td></tr>`).join('');
    return table(`<tr><td style="border:2px solid ${BLUE};border-radius:12px;padding:26px 22px 12px">` + eyebrow(c, c.html('eyebrow')) + headline(c, c.html('headline'), NAVY, 30) + paragraph(c, c.html('intro'), `color:${MUTED};margin-bottom:6px`) + table(rows, 'width:100%', `width="100%" dir="${c.dir}"`) + `</td></tr>`, 'width:100%;margin:0 0 22px', 'width="100%"')
      + paragraph(c, c.html('p2')) + paragraph(c, c.html('note'), `font-size:15px;color:${MUTED}`) + (c.plain('cta') ? button(c, c.plain('cta'), whatsappUrl(c.settings, c.plain('waText') + ' ')) + spacer : '') + signature(c);
  },
  question(c) {
    const answers = c.list('answers').map(([label]) => label);
    const reply = label => (c.plain('waText') || label).replace(/\{\{answer\}\}/g, label);
    const rows = answers.map((label, i) => `<tr><td style="padding:0 0 10px"><a href="${esc(whatsappUrl(c.settings, reply(label)))}" dir="${c.dir}" style="display:block;border:1px solid ${BLUE};border-radius:10px;padding:14px 18px;font-family:${c.font};font-size:17px;font-weight:700;line-height:1.6;color:${BLUE};text-decoration:none;text-align:${c.align};background:#ffffff"><span style="display:inline-block;width:30px;color:${MUTED};font-weight:400">${'ABCDEFGH'[i] || '•'}</span>${esc(label)}</a></td></tr>`).join('');
    const top = eyebrow(c, c.html('eyebrow'), '#cfe2ff') + headline(c, c.html('headline'), '#ffffff', 27).replace('margin:0 0 14px', 'margin:0');
    return (top ? hero(c, top) : '')
      + table(rows, 'width:100%;margin:0 0 12px', 'width="100%"') + paragraph(c, c.html('after'), `font-size:15px;color:${MUTED}`) + paragraph(c, c.html('p2')) + aboutBox(c, c.html('about')) + signature(c);
  },
};
const texts = {
  letter: c => [c.plain('greeting'), c.plain('p1'), c.plain('p2'), c.plain('pointsTitle'), ...c.list('points').map(p => '• ' + p.filter(Boolean).join(': ')), c.plain('p3'), c.plain('ps')],
  day: c => [c.plain('headline'), c.plain('intro'), ...c.list('steps').map(p => '• ' + p.filter(Boolean).join(' — ')), c.plain('p2'), c.plain('about'), c.plain('cta') && c.plain('cta') + ': ' + c.settings.requestUrl],
  menu: c => [c.plain('headline'), c.plain('intro'), ...c.list('items').map((p, i) => `${i + 1}. ` + p.filter(Boolean).join(' — ')), c.plain('p2'), c.plain('note')],
  question: c => [c.plain('headline'), ...c.list('answers').map((p, i) => `${'ABCDEFGH'[i]}) ${p[0]}`), c.plain('after'), c.plain('p2'), c.plain('about')],
};

export function renderSchoolMail({ templateId, language = 'auto', school = {}, settings: rawSettings = {}, unsubscribeUrl = '', test = false }) {
  const template = templateById(templateId);
  if (!template) throw Object.assign(new Error('قالب المدارس غير معروف.'), { status: 400 });
  const settings = schoolSettings(rawSettings), mode = schoolLanguage(school, language);
  const langs = mode === 'both' ? ['ar', 'en'] : [mode];
  const contexts = langs.map(lang => context({ template, lang, school, settings }));
  const first = contexts[0];
  const defaultSubject = first.merge(template.fields.find(f => f.key === 'subject')[first.lang]);
  const subject = (test ? '[تجربة] ' : '') + (first.plain('subject') || defaultSubject).slice(0, 160);
  const sections = contexts.map((c, i) => `<tr><td class="sm-pad" style="padding:${i ? '28px 34px 30px' : '30px 34px'};${i ? `border-top:6px solid ${PAGE}` : ''}">${bodies[template.id](c)}</td></tr>`).join('');
  const footer = contexts.map(c => {
    const company = esc(c.english ? settings.footerEn : settings.footerAr), reason = esc(c.merge(c.english ? settings.reasonEn : settings.reasonAr));
    const site = settings.websiteLabel ? `<a href="${esc(settings.website)}" style="color:${BLUE}">${esc(settings.websiteLabel)}</a>` : '';
    const unsubscribe = unsubscribeUrl ? `<a href="${esc(unsubscribeUrl)}" style="color:${MUTED}">${esc(c.english ? settings.unsubscribeEn : settings.unsubscribeAr)}</a>` : '';
    return `<div dir="${c.dir}" style="font-family:${c.font};font-size:12px;line-height:1.9;color:${MUTED};text-align:center">${[company, site].filter(Boolean).join(' · ')}${company || site ? '<br>' : ''}${[reason, unsubscribe].filter(Boolean).join(' ')}</div>`;
  }).join('<div style="height:8px;line-height:8px;font-size:0">&nbsp;</div>');
  const preview = esc(first.plain(template.id === 'letter' ? 'p1' : template.id === 'question' ? 'after' : 'intro').slice(0, 140));
  const html = `<!doctype html><html lang="${first.lang}" dir="${first.dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(subject)}</title><style>body{margin:0;padding:0}@media (max-width:620px){.sm-card{width:100%!important}.sm-pad{padding:22px 18px!important}}</style></head><body style="margin:0;padding:0;background:${PAGE}"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAGE};font-size:1px;line-height:1px">${preview}</div>`
    + table(`<tr><td align="center" style="padding:26px 12px">` + table(
      `<tr><td align="center" style="padding:22px 34px 20px;border-bottom:1px solid ${LINE};border-top:5px solid ${BLUE};border-radius:14px 14px 0 0"><a href="${esc(settings.website)}"><img src="${LOGO_URL}" width="210" alt="INEXC Innovative Excellence — التميز الابتكاري" style="display:block;width:210px;max-width:70%;height:auto;border:0"></a></td></tr>${sections}`,
      'width:600px;max-width:600px;background:#ffffff;border-radius:14px', 'class="sm-card" width="600" align="center" bgcolor="#ffffff"')
      + `<div style="height:18px;line-height:18px;font-size:0">&nbsp;</div>` + table(`<tr><td style="padding:0 20px">${footer}</td></tr>`, 'width:600px;max-width:600px', 'class="sm-card" width="600" align="center"') + `</td></tr>`, `width:100%;background:${PAGE}`, `width="100%" bgcolor="${PAGE}"`)
    + `</body></html>`;
  const text = contexts.map(c => [...texts[template.id](c).filter(Boolean), '', c.english ? settings.senderNameEn : settings.senderName, c.english ? settings.senderTitleEn : settings.senderTitle, settings.email + ' · https://wa.me/' + settings.whatsapp].join('\n')).join('\n\n———\n\n')
    + (unsubscribeUrl ? `\n\n${first.english ? settings.unsubscribeEn : settings.unsubscribeAr}: ${unsubscribeUrl}` : '');
  return { subject, html, text, language: mode, replyTo: settings.replyTo };
}
