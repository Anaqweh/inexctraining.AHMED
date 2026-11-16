import { readFileSync, writeFileSync } from 'fs';
import { Resvg } from '@resvg/resvg-js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', 'assets');

const exportsList = [
  { svg: 'inexc-logo.svg', png: 'inexc-logo.png', width: 1260 },
  { svg: 'inexc-logo-white.svg', png: 'inexc-logo-white.png', width: 1260 },
  { svg: 'inexc-logo.svg', png: 'inexc-logo-sm.png', width: 630 },
  { svg: 'inexc-logo-white.svg', png: 'inexc-logo-white-sm.png', width: 630 },
];

for (const item of exportsList) {
  const svg = readFileSync(join(assetsDir, item.svg), 'utf8');
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: item.width },
    background: 'transparent',
  });
  writeFileSync(join(assetsDir, item.png), resvg.render().asPng());
  console.log('Wrote', item.png);
}

// أيقونة التبويب تُولَّد من الشعار الرسمي المعتمد فقط عبر scripts/build-favicon.py
