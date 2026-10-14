// Draws the app icons as PNGs with no dependencies: a navy square with a
// gold band and a white "F", matching public/favicon.svg.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const NAVY = [0x17, 0x29, 0x5a];
const GOLD = [0xd9, 0x9e, 0x1c];
const WHITE = [0xf4, 0xf6, 0xfb];

function pixel(x, y, size) {
  const u = (x / size) * 64;
  const v = (y / size) * 64;
  if (v >= 52) return GOLD;
  const inF =
    (u >= 18 && u < 27 && v >= 14 && v < 50) || (u >= 18 && u < 46 && v >= 14 && v < 22) || (u >= 18 && u < 43 && v >= 29 && v < 37);
  return inF ? WHITE : NAVY;
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y, size);
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync('public/pwa-192.png', png(192));
writeFileSync('public/pwa-512.png', png(512));
writeFileSync('public/apple-touch-icon.png', png(180));
console.log('icons written');
