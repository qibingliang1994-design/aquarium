// 生成 PWA 图标（纯 Node + zlib 手写 PNG，无第三方依赖）：npm run icons
// 画法：圆角深色底 + 水面线 + 青色小鱼（椭圆身 + 三角尾 + 眼睛）+ 气泡，3×3 超采样抗锯齿。
// maskable 版本整幅铺满、主体缩到 60% 安全区内。
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

/* ---------- PNG 编码（RGBA8、filter 0） ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;                    // 8bit RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rows[y * (width * 4 + 1)] = 0;             // filter: None
    rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- 画布：坐标全部归一化到 0..1 ---------- */
function mix(a, b, t) { return a + (b - a) * t; }
function roundedRect(x, y, w, h, r) {           // SDF：到圆角矩形的距离
  const dx = Math.max(Math.abs(x - w / 2) - (w / 2 - r), 0);
  const dy = Math.max(Math.abs(y - h / 2) - (h / 2 - r), 0);
  return Math.hypot(dx, dy) - r <= 0;
}
function ellipse(x, y, cx, cy, rx, ry, rotDeg) {
  const a = rotDeg * Math.PI / 180, cos = Math.cos(-a), sin = Math.sin(-a);
  const dx = x - cx, dy = y - cy;
  const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
  return (lx / rx) ** 2 + (ly / ry) ** 2 <= 1;
}
function circle(x, y, cx, cy, r) { return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; }
function tri(x, y, ax, ay, bx, by, cx, cy) {    // 三角形内部（同侧法）
  const cross = (px, py, qx, qy, xx, yy) => (xx - px) * (qy - py) - (yy - py) * (qx - px);
  const d1 = cross(ax, ay, bx, by, x, y), d2 = cross(bx, by, cx, cy, x, y), d3 = cross(cx, cy, ax, ay, x, y);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** @param {number} size @param {boolean} maskable */
function renderIcon(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 3;
  const k = maskable ? 0.6 : 1, off = (1 - k) / 2;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let rSum = 0, gSum = 0, bSum = 0, cnt = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const x = (px + (sx + 0.5) / SS) / size, y = (py + (sy + 0.5) / SS) / size;
        if (!(maskable || roundedRect(x, y, 1, 1, 0.18))) continue;
        const grad = y;
        let r = mix(10, 5, grad), g = mix(32, 14, grad), b = mix(44, 22, grad);
        const band = Math.exp(-((y - 0.16) ** 2) / 0.002);
        r = mix(r, 95, band * 0.5); g = mix(g, 212, band * 0.5); b = mix(b, 232, band * 0.5);
        const fx = (x - off) / k, fy = (y - off) / k;
        let hit = false;
        if (tri(fx, fy, 0.30, 0.50, 0.14, 0.32, 0.14, 0.68)) { r = 60; g = 170; b = 195; hit = true; }
        if (ellipse(fx, fy, 0.50, 0.50, 0.20, 0.125, -8)) {
          const belly = fy > 0.54;
          r = belly ? 160 : 95; g = belly ? 225 : 212; b = belly ? 235 : 232; hit = true;
        }
        if (tri(fx, fy, 0.52, 0.40, 0.60, 0.28, 0.66, 0.38)) { r = 120; g = 215; b = 230; hit = true; }
        if (circle(fx, fy, 0.62, 0.475, 0.022)) { r = 8; g = 12; b = 16; }
        if (!hit) for (const [bx, by, br] of [[0.72, 0.28, 0.028], [0.80, 0.16, 0.02], [0.86, 0.30, 0.014]]) {
          if (circle(fx, fy, bx, by, br)) {
            const d = Math.hypot(fx - bx, fy - by);
            if (d > br - 0.008) { r = mix(r, 150, 0.85); g = mix(g, 230, 0.85); b = mix(b, 240, 0.85); }
            else { r = mix(r, 200, 0.35); g = mix(g, 240, 0.35); b = mix(b, 250, 0.35); }
          }
        }
        rSum += r; gSum += g; bSum += b; cnt++;
      }
      const i = (py * size + px) * 4;
      if (!cnt) { rgba[i + 3] = 0; continue; }  // 透明角
      rgba[i] = Math.round(rSum / cnt); rgba[i + 1] = Math.round(gSum / cnt);
      rgba[i + 2] = Math.round(bSum / cnt); rgba[i + 3] = 255;
    }
  }
  return rgba;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [192, 512]) {
  for (const maskable of [false, true]) {
    const name = `${maskable ? 'maskable-' : ''}icon-${size}.png`;
    writeFileSync(join(OUT_DIR, name), encodePNG(size, size, renderIcon(size, maskable)));
    console.log('written', name);
  }
}
