import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import toIco from 'to-ico';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const svg = readFileSync(join(publicDir, 'favicon.svg'));

const outputs = [
  { file: 'favicon-16x16.png', size: 16 },
  { file: 'favicon-32x32.png', size: 32 },
  { file: 'apple-touch-icon.png', size: 180 },
];

const icoInputs = [];

for (const { file, size } of outputs) {
  const buffer = await sharp(svg).resize(size, size).png().toBuffer();
  writeFileSync(join(publicDir, file), buffer);
  if (size === 16 || size === 32) {
    icoInputs.push(buffer);
  }
  console.log(`Wrote ${file} (${size}x${size})`);
}

const ico = await toIco(icoInputs);
writeFileSync(join(publicDir, 'favicon.ico'), ico);
console.log('Wrote favicon.ico');
