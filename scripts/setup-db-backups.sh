#!/usr/bin/env bash
# تثبيت النسخ الاحتياطي اليومي لقاعدة بيانات INEXC (يُشغَّل مرة واحدة على خادم DigitalOcean بصلاحية root).
# لا يغيّر الخدمة أو قاعدة البيانات؛ يضيف سكربتَي نسخ/استعادة ومهمة cron ويأخذ أول نسخة فورًا.
set -euo pipefail

inexc_api_dir="${INEXC_API_DIR:-/opt/inexc-training/inexc-api}"
backup_root="${INEXC_BACKUP_DIR:-/opt/inexc-training/backups}"
backup_bin="$backup_root/bin"

[ "$(id -u)" = 0 ] || { echo 'شغّل السكربت بصلاحية root (sudo).' >&2; exit 1; }
cd "$inexc_api_dir" || { echo "لم يُعثر على $inexc_api_dir" >&2; exit 1; }
docker compose config --services | grep -qx db || { echo 'خدمة db غير موجودة في docker compose.' >&2; exit 1; }
docker compose ps -q db | grep -q . || { echo 'حاوية db غير مشغلة؛ شغّلها ثم أعد المحاولة.' >&2; exit 1; }
docker compose exec -T db sh -c 'command -v pg_dump >/dev/null' || { echo 'pg_dump غير متوفر داخل حاوية db.' >&2; exit 1; }

mkdir -p "$backup_root/daily" "$backup_root/weekly" "$backup_bin"
chmod 700 "$backup_root"

cat > "$backup_bin/inexc-db-backup.sh" <<'BACKUP'
#!/usr/bin/env bash
# نسخة احتياطية يومية: pg_dump بصيغة custom المضغوطة + تحقق بنيوي + تدوير 30 يومية و12 أسبوعية.
set -euo pipefail
inexc_api_dir="${INEXC_API_DIR:-/opt/inexc-training/inexc-api}"
backup_root="${INEXC_BACKUP_DIR:-/opt/inexc-training/backups}"
status_file="$backup_root/last-status"
stamp="$(date -u +%Y%m%d-%H%M%S)"
target="$backup_root/daily/inexc-db-$stamp.dump"

mkdir -p "$backup_root/daily" "$backup_root/weekly"
fail(){ echo "FAIL $(date -u +%FT%TZ) $1" | tee "$status_file" >&2; rm -f "$target" "$target.sha256"; exit 1; }
cd "$inexc_api_dir" || fail "compose dir missing"
docker compose ps -q db | grep -q . || fail "db container not running"

# التفريغ: صيغة custom (مضغوطة وقابلة للاستعادة الانتقائية). بيانات الاعتماد من بيئة الحاوية نفسها.
docker compose exec -T db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner' > "$target" || fail "pg_dump exited non-zero"

# حراسات السلامة: حجم منطقي + فهرس pg_restore يُقرأ كاملًا (عبر ملف مؤقت داخل الحاوية لأن صيغة custom قد ترفض الأنابيب).
size=$(stat -c%s "$target"); [ "$size" -ge 20000 ] || fail "dump too small (${size}B)"
docker compose exec -T db sh -c 'cat > /tmp/inexc-verify.dump && pg_restore --list /tmp/inexc-verify.dump >/dev/null; rc=$?; rm -f /tmp/inexc-verify.dump; exit $rc' < "$target" || fail "pg_restore --list rejected dump"
( cd "$(dirname "$target")" && sha256sum "$(basename "$target")" > "$(basename "$target").sha256" )

# التدوير: 30 نسخة يومية؛ نسخة الأحد تُرقّى أسبوعية (نحتفظ بـ12). الأقواس تحمي pipefail عند خلو المجلد.
(ls -1t "$backup_root"/daily/inexc-db-*.dump 2>/dev/null || true) | tail -n +31 | while read -r old; do rm -f "$old" "$old.sha256"; done
if [ "$(date -u +%u)" = 7 ]; then cp -f "$target" "$target.sha256" "$backup_root/weekly/"; fi
(ls -1t "$backup_root"/weekly/inexc-db-*.dump 2>/dev/null || true) | tail -n +13 | while read -r old; do rm -f "$old" "$old.sha256"; done

# نسخة خارج الخادم (اختياري): ضع اسم وجهة rclone في backups/remote.conf مثل: spaces:inexc-db-backups
remote_conf="$backup_root/remote.conf"
if [ -s "$remote_conf" ] && command -v rclone >/dev/null; then
  remote="$(head -n1 "$remote_conf" | tr -d '[:space:]')"
  rclone copy "$target" "$remote/daily/" && rclone copy "$target.sha256" "$remote/daily/" || fail "rclone copy to $remote"
fi

echo "OK $(date -u +%FT%TZ) $target (${size}B)" | tee "$status_file"
BACKUP

cat > "$backup_bin/inexc-db-restore.sh" <<'RESTORE'
#!/usr/bin/env bash
# استعادة نسخة: يوقف api، يستعيد فوق القاعدة الحالية (clean --if-exists)، ثم يعيد تشغيل api.
# الاستخدام: inexc-db-restore.sh /opt/inexc-training/backups/daily/inexc-db-....dump --yes
set -euo pipefail
inexc_api_dir="${INEXC_API_DIR:-/opt/inexc-training/inexc-api}"
file="${1:-}"; confirm="${2:-}"
[ -f "$file" ] || { echo 'مرّر مسار ملف .dump موجودًا.' >&2; exit 1; }
sha="$file.sha256"
if [ -f "$sha" ]; then (cd "$(dirname "$file")" && sha256sum -c "$(basename "$sha")") || { echo 'فشل تحقق sha256.' >&2; exit 1; }; fi
if [ "$confirm" != "--yes" ]; then
  echo "تحذير: ستُستبدل بيانات قاعدة الإنتاج بمحتوى: $file"
  echo "للتنفيذ أعد الأمر مضيفًا --yes"
  exit 2
fi
cd "$inexc_api_dir"
docker compose stop api
docker compose exec -T db sh -c 'cat > /tmp/inexc-restore.dump && pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner /tmp/inexc-restore.dump; rc=$?; rm -f /tmp/inexc-restore.dump; exit $rc' < "$file"
docker compose up -d --no-build --no-deps api
echo "تمت الاستعادة من $file وأعيد تشغيل api."
RESTORE

chmod 700 "$backup_bin/inexc-db-backup.sh" "$backup_bin/inexc-db-restore.sh"

cat > /etc/cron.d/inexc-db-backup <<CRON
# نسخة احتياطية يومية لقاعدة INEXC — 02:17 بتوقيت الخادم. السجل: $backup_root/backup.log
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
17 2 * * * root INEXC_API_DIR=$inexc_api_dir INEXC_BACKUP_DIR=$backup_root $backup_bin/inexc-db-backup.sh >> $backup_root/backup.log 2>&1
CRON
chmod 644 /etc/cron.d/inexc-db-backup

echo '— تشغيل أول نسخة احتياطية الآن للتأكد —'
INEXC_API_DIR="$inexc_api_dir" INEXC_BACKUP_DIR="$backup_root" "$backup_bin/inexc-db-backup.sh"
echo
echo "تم التثبيت. النسخ اليومية في: $backup_root/daily (30 نسخة) والأسبوعية في: $backup_root/weekly (12 نسخة)."
echo "حالة آخر نسخة: cat $backup_root/last-status"
echo "للاستعادة لاحقًا: $backup_bin/inexc-db-restore.sh <ملف.dump> --yes"
echo "لنسخة خارج الخادم: ثبّت rclone وهيّئ وجهة، ثم ضع اسمها في $backup_root/remote.conf"
