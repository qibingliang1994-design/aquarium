// 照片皮鱼模型导入：把 aquarium-editor（MIT）里 base64 存放的 glb 解码进 public/fish-models/species/
// 用法：node scripts/fish-import.mjs neon:tetra angel:scalare ...   （源 id[:本项目文件名]，缺省同名）
//      源目录缺省 ../aquarium-editor/fish，可用 --src <dir> 指定
// 模型原样收录（不减面、不改属性）：顶点属性 _FIN/_PIV 与节点 extras.swim 是游动着色器的输入，见 src/fish/photo-fish.js
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const si = args.indexOf('--src');
const src = si >= 0 ? resolve(args.splice(si, 2)[1]) : resolve(root, '../aquarium-editor/fish');
if (!args.length) { console.error('用法: node scripts/fish-import.mjs <源id[:文件名]> ...'); process.exit(1); }

for (const a of args) {
  const [id, name = id] = a.split(':');
  const file = resolve(src, `${id}.glb.b64.txt`);
  if (!existsSync(file)) { console.error(`找不到 ${file}`); process.exitCode = 1; continue; }
  const buf = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
  if (buf.readUInt32LE(0) !== 0x46546c67) { console.error(`${id}: 不是 glb`); process.exitCode = 1; continue; }
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  const node = json.nodes.find((/** @type {any} */ n) => n.mesh === 0);
  if (!node?.extras?.swim) { console.error(`${id}: 缺少 extras.swim`); process.exitCode = 1; continue; }
  const out = resolve(root, `public/fish-models/species/species-${name}.glb`);
  writeFileSync(out, buf);
  console.log(`${id} → ${out}  ${(buf.length / 1024).toFixed(0)} KB  体长 ${node.extras.swim.length} m`);
}
