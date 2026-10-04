// Generates the app icons (PNG + SVG) without any image dependencies.
// Motif: the four Mandarin tone contours (ˉ ˊ ˇ ˋ) on an indigo→teal tile.
// Run: node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../public/', import.meta.url);
mkdirSync(OUT, { recursive: true });

// Geometry in a 512×512 design space.
const STROKES = [
  [[84, 200], [136, 200]], // tone 1: high level
  [[184, 290], [228, 200]], // tone 2: rising
  [[278, 250], [302, 318], [328, 236]], // tone 3: dipping
  [[380, 200], [424, 318]], // tone 4: falling
];
const STROKE_W = 26;
const RADIUS = 112;

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}

function insideRoundedRect(x, y, size, r) {
  const cx = Math.max(r, Math.min(size - r, x));
  const cy = Math.max(r, Math.min(size - r, y));
  return Math.hypot(x - cx, y - cy) <= r;
}

function render(size, { rounded }) {
  const scale = size / 512;
  const px = Buffer.alloc(size * size * 4);
  const SS = 4; // supersampling per axis
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const dxp = (x + (sx + 0.5) / SS) / scale;
          const dyp = (y + (sy + 0.5) / SS) / scale;
          const inBg = rounded ? insideRoundedRect(dxp, dyp, 512, RADIUS) : true;
          if (!inBg) continue;
          bg++;
          for (const stroke of STROKES) {
            let hit = false;
            for (let i = 0; i < stroke.length - 1; i++) {
              if (distToSegment(dxp, dyp, stroke[i], stroke[i + 1]) <= STROKE_W / 2) {
                hit = true;
                break;
              }
            }
            if (hit) {
              fg++;
              break;
            }
          }
        }
      }
      const total = SS * SS;
      const t = (x + y) / (2 * size);
      // indigo-600 → teal-600 gradient
      const r0 = Math.round(79 + (13 - 79) * t);
      const g0 = Math.round(70 + (148 - 70) * t);
      const b0 = Math.round(229 + (136 - 229) * t);
      const a = bg / total;
      const f = bg ? fg / bg : 0;
      const i = (y * size + x) * 4;
      px[i] = Math.round(r0 + (255 - r0) * f);
      px[i + 1] = Math.round(g0 + (255 - g0) * f);
      px[i + 2] = Math.round(b0 + (255 - b0) * f);
      px[i + 3] = Math.round(255 * a);
    }
  }
  return encodePng(size, size, px);
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(new URL('icon-512.png', OUT), render(512, { rounded: false }));
writeFileSync(new URL('icon-192.png', OUT), render(192, { rounded: false }));
writeFileSync(new URL('apple-touch-icon.png', OUT), render(180, { rounded: false }));

const path = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#0d9488"/></linearGradient></defs>
  <rect width="512" height="512" rx="${RADIUS}" fill="url(#g)"/>
  <g fill="none" stroke="#fff" stroke-width="${STROKE_W}" stroke-linecap="round" stroke-linejoin="round">
    ${STROKES.map((s) => `<path d="${path(s)}"/>`).join('\n    ')}
  </g>
</svg>
`;
writeFileSync(new URL('icon.svg', OUT), svg);
console.log('icons written to public/');
