// Generates throwaway placeholder icons (PNG + Windows ICO + macOS ICNS) so
// `cargo check` / `tauri build` succeed. Replace these with real icons via:
//   npm run tauri:icon -- ./path/to/source.png
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = resolve(ROOT, 'icons');
mkdirSync(ICONS, { recursive: true });

// 1x1 transparent PNG (89 bytes). Used as the raw PNG icon at multiple sizes.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

// Windows .ico container holding the PNG above (PNG-in-ICO format).
function buildIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(1, 4); // 1 image

  const entry = Buffer.alloc(16);
  entry[0] = 1; // width  (0 = 256)
  entry[1] = 1; // height
  entry[2] = 0; // colors
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(png.length, 8); // size
  entry.writeUInt32LE(22, 12); // offset

  return Buffer.concat([header, entry, png]);
}

// Apple .icns container holding the same PNG as a single ic07 image.
function buildIcns(png) {
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  const subHead = Buffer.alloc(8);
  subHead.write('ic07', 0, 'ascii');
  subHead.writeUInt32BE(8 + png.length, 4);
  const total = 8 + 8 + png.length;
  head.writeUInt32BE(total, 4);
  return Buffer.concat([head, subHead, png]);
}

const targets = {
  '32x32.png': PNG_1X1,
  '128x128.png': PNG_1X1,
  '128x128@2x.png': PNG_1X1,
  'icon.png': PNG_1X1,
  'icon.ico': buildIco(PNG_1X1),
  'icon.icns': buildIcns(PNG_1X1),
};

for (const [name, bytes] of Object.entries(targets)) {
  writeFileSync(resolve(ICONS, name), bytes);
  console.log('wrote', name, bytes.length, 'bytes');
}
