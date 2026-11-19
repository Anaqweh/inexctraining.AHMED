// قارئ XLSX صغير بلا اعتماديات: يفك الأرشيف ويعيد كل ورقة باسمها وصفوفها.
// يُستخدم لاستيراد ملف المدارس المقسّم بالإمارات (ورقة لكل إمارة).
import zlib from 'node:zlib';

const fail = message => Object.assign(new Error(message), { status: 400 });
const decode = value => String(value ?? '')
  .replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function unzipEntries(buffer, { maxEntries = 600, maxEntryBytes = 30 * 1024 * 1024 } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw fail('الملف فارغ أو ليس ملف Excel بصيغة XLSX.');
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i--) if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw fail('تعذرت قراءة الملف. احفظه من Excel بصيغة XLSX ثم أعد الرفع.');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  if (count > maxEntries) throw fail('الملف يحتوي على عناصر أكثر من المسموح.');
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw fail('بنية ملف Excel غير سليمة.');
    const method = buffer.readUInt16LE(offset + 10), compressed = buffer.readUInt32LE(offset + 20), size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28), extraLength = buffer.readUInt16LE(offset + 30), commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42), name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    entries.set(name, { method, compressed, size, local });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return name => {
    const entry = entries.get(name);
    if (!entry) return null;
    if (entry.size > maxEntryBytes) throw fail('إحدى أوراق الملف أكبر من الحد المسموح.');
    if (entry.local + 30 > buffer.length || buffer.readUInt32LE(entry.local) !== 0x04034b50) throw fail('بنية ملف Excel غير سليمة.');
    const start = entry.local + 30 + buffer.readUInt16LE(entry.local + 26) + buffer.readUInt16LE(entry.local + 28);
    const data = buffer.subarray(start, start + entry.compressed);
    if (entry.method === 0) return data;
    if (entry.method !== 8) throw fail('طريقة ضغط غير مدعومة في ملف Excel.');
    try { return zlib.inflateRawSync(data, { maxOutputLength: maxEntryBytes }); }
    catch { throw fail('تعذر فك ضغط ملف Excel؛ قد يكون تالفًا.'); }
  };
}

const columnIndex = ref => { let n = 0; for (const ch of ref) { const c = ch.charCodeAt(0); if (c < 65 || c > 90) break; n = n * 26 + c - 64; } return n - 1; };
const inlineText = xml => [...xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '').matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(m => decode(m[1])).join('');

export function readXlsxSheets(buffer, { maxSheets = 40, maxRows = 5000, maxColumns = 40 } = {}) {
  const read = unzipEntries(buffer);
  const text = name => read(name)?.toString('utf8') || '';
  const workbook = text('xl/workbook.xml');
  if (!workbook) throw fail('الملف ليس مصنف Excel بصيغة XLSX.');
  const targets = new Map([...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map(m => {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1], target = /\bTarget="([^"]+)"/.exec(m[0])?.[1] || '';
    return [id, target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '')];
  }));
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m => inlineText(m[1]));
  const sheets = [];
  for (const m of workbook.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
    if (sheets.length >= maxSheets) break;
    const name = decode(/\bname="([^"]*)"/.exec(m[0])?.[1] || ''), id = /\b(?:\w+:)?id="([^"]+)"/.exec(m[0])?.[1];
    const xml = text(targets.get(id) || '');
    const rows = [];
    for (const row of xml.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
      if (rows.length >= maxRows) break;
      const cells = [];
      for (const cell of row[1].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
        const ref = /\br="([A-Z]+)\d+"/.exec(cell[1])?.[1], type = /\bt="([^"]+)"/.exec(cell[1])?.[1] || '', inner = cell[2] || '';
        const index = ref ? columnIndex(ref) : cells.length;
        if (index < 0 || index >= maxColumns) continue;
        const raw = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner)?.[1];
        let value = '';
        if (type === 's') value = shared[Number(raw)] ?? '';
        else if (type === 'inlineStr') value = inlineText(inner);
        else if (raw !== undefined) value = decode(raw);
        cells[index] = String(value).replace(/\s+/g, ' ').trim();
      }
      rows.push(Array.from(cells, v => v ?? ''));
    }
    sheets.push({ name, rows });
  }
  if (!sheets.length) throw fail('لم نجد أوراقًا في ملف Excel.');
  return sheets;
}
