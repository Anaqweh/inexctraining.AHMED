# النسخ الاحتياطي اليومي لقاعدة البيانات — 2026-11-06

البنية الفعلية: قاعدة PostgreSQL **مُدارة على Render** (خدمة `inexctraining-db`). النسخ الاحتياطي الخارجي يعمل عبر **GitHub Actions** في المستودع الخاص:

**https://github.com/Anaqweh/inexctraining-db-backups** (خاص — لا تجعله عامًا أبدًا)

## ما يحدث يوميًا (02:17 فجرًا بتوقيت دبي)
- `pg_dump -Fc` من رابط القاعدة الخارجي (سر `DATABASE_URL` في ذلك المستودع) عبر حاوية postgres:17 مع `PGSSLMODE=require`.
- حراسات قبل الاعتماد: حجم ≥ 20KB + قراءة فهرس `pg_restore --list` + بصمة sha256.
- التخزين كإصدارات (Releases) خاصة: `backup-*` يومية (آخر 30) و`weekly-*` أسبوعية أيام الأحد (آخر 12) ≈ 3 أشهر عمق.
- نبض commit يبقي الجدولة فعّالة، وأي فشل يرسل GitHub بريدًا تلقائيًا.
- شرط شبكي على Render: قاعدة سماح `0.0.0.0/0` في PostgreSQL Inbound IP Rules (الحماية بكلمة المرور + TLS) — أُضيفت في 2026-11-06.

## الاستعادة
من صفحة الإصدارات في المستودع الخاص نزّل `.dump` و`.sha256`، ثم من أي جهاز فيه Docker:
```bash
sha256sum -c inexc-db-XXXX.dump.sha256
docker run --rm -i -e PGURL="EXTERNAL_DATABASE_URL" -e PGSSLMODE=require postgres:17-alpine \
  sh -c 'exec pg_restore -d "$PGURL" --clean --if-exists --no-owner' < inexc-db-XXXX.dump
```
`--clean` يستبدل محتوى القاعدة الحالي — يُفضّل إيقاف خدمة الـ API في Render أثناءها.

## التحقق عند الإعداد (2026-11-06)
تشغيل فعلي كامل: فشل أولي بسبب SSL ثم بسبب قائمة سماح IP (كانت تقبل IP ترحيل واحدًا فقط)، وبعد المعالجة نجح التشغيل بكل خطواته وأُنتجت نسخة حقيقية 44.9MB محفوظة كإصدار خاص مع بصمتها.

---
*ملاحظة: `scripts/setup-db-backups.sh` في هذا المستودع حل بديل لخادم ذاتي الاستضافة فيه docker compose (الإعداد القديم على DigitalOcean) — غير مستخدم حاليًا.*
