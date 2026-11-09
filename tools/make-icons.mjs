// Usage: node tools/make-icons.mjs public/icons
// Renders the Motivational Anti-Distraction icon: rounded square in the
// extension's accent orange (#b3541e, src/shared/style.css --accent) with a
// white clock glyph (ring + hands + hub). Supersampled raster, PNG via zlib.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const ORANGE = [0xb3, 0x54, 0x1e];
const WHITE = [255, 255, 255];

// --- geometry in unit space (0..1), scaled per size ---
const inRoundedRect = (x, y, r) => {
  if (x < 0 || x > 1 || y < 0 || y > 1) return false;
  const cx = Math.max(r, Math.min(1 - r, x));
  const cy = Math.max(r, Math.min(1 - r, y));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const dist = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);
const inRing = (x, y, rOut, rIn) => {
  const d = dist(x, y, 0.5, 0.5);
  return d <= rOut && d >= rIn;
};
const nearSeg = (x, y, ax, ay, bx, by, halfW) => {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
  return dist(x, y, ax + t * vx, ay + t * vy) <= halfW;
};
const inWhiteShape = (x, y) =>
  inRing(x, y, 0.34, 0.245) || // clock ring
  nearSeg(x, y, 0.5, 0.5, 0.5, 0.235, 0.042) || // minute hand → 12
  nearSeg(x, y, 0.5, 0.5, 0.72, 0.5, 0.042) || // hour hand → 3
  dist(x, y, 0.5, 0.5) <= 0.06; // hub

function render(size) {
  const SS = size <= 16 ? 16 : 8; // supersample factor
  const samples = new Uint8Array(size * size * 4);
  const r = 0.23; // corner radius
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let rs = 0, gs = 0, bs = 0, as = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          if (!inRoundedRect(x, y, r)) continue;
          const c = inWhiteShape(x, y) ? WHITE : ORANGE;
          rs += c[0]; gs += c[1]; bs += c[2]; as += 255;
        }
      }
      const n = SS * SS;
      const i = (py * size + px) * 4;
      // Unpremultiply for PNG's straight alpha.
      samples[i] = as ? Math.round((rs / as) * 255) : 0;
      samples[i + 1] = as ? Math.round((gs / as) * 255) : 0;
      samples[i + 2] = as ? Math.round((bs / as) * 255) : 0;
      samples[i + 3] = Math.round(as / n);
    }
  }
  return samples;
}

// --- minimal PNG encoder (truecolor+alpha, no interlace) ---
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = process.argv[2];
mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const file = `${outDir}/icon-${size}.png`;
  writeFileSync(file, encodePng(size, render(size)));
  console.log('wrote', file);
}
