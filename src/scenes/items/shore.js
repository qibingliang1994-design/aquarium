// @ts-check
import * as THREE from 'three';
import { shared, injectSway, paintGradient, castAll } from './common.js';
import { injectSurfaceTex, surfacePair, onTexPair } from './surface-tex.js';
import { injectWet } from '../../scene/wet.js';

/* ================================================================
 * 岸边景物：松、秋枫、岸草、石灯。材质按类型共享，几何每个物件一份。
 * 草丛和枫叶是 InstancedMesh（画质档改 count）；树干 / 松冠 / 灯石是普通网格，走物件批处理。
 * 石灯的火室和萤火虫由 scene-runtime.glowShore 按昼夜点亮，反射 pass 照样能看见。
 * ================================================================ */

const BARK = () => shared('mat:bark', () => {
  const m = new THREE.MeshStandardMaterial({ color:0xd2bfae, roughness:0.92, metalness:0 });
  injectSurfaceTex(m, { name:'b_pine', scale:1.5, k:0.85, gain:1.2, key:'bark' });
  injectWet(m, 'bark');
  return m;
});
const NEEDLE = () => shared('mat:needle', () => {
  const m = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.88, metalness:0 });
  injectWet(m, 'needle');
  return m;
});
const LEAF = () => shared('mat:maple', () => {
  const m = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.62, metalness:0, side:THREE.DoubleSide });
  injectSway(m, 0.04, 1.6, 'maple', false, 0.22);
  injectWet(m, 'maple');
  return m;
});
const GRASS = () => shared('mat:bankgrass', () => {
  const pair = surfacePair('g_leaf');
  const m = new THREE.MeshStandardMaterial({ map:pair.map, vertexColors:true, roughness:0.8, metalness:0, side:THREE.DoubleSide });
  onTexPair(pair, (/** @type {any} */ t) => { m.map = t.map; m.needsUpdate = true; });
  injectSway(m, 0.07, 2.2, 'bgrass', false, 0.42);
  injectWet(m, 'bgrass');
  return m;
});
const STONE = () => shared('mat:lichen', () => {
  const m = new THREE.MeshStandardMaterial({ color:0xd5d0c8, roughness:0.9, metalness:0 });
  injectSurfaceTex(m, { name:'r_lichen', scale:2.4, k:1, gain:1.15, key:'lichen' });
  injectWet(m, 'lichen');
  return m;
});
/** 火室共用这一份，昼夜只改 emissiveIntensity */
export const lanternGlow = () => shared('mat:lanternGlow', () => new THREE.MeshStandardMaterial({
  color:0x2a1408, emissive:new THREE.Color(0xffb060), emissiveIntensity:0.04, roughness:0.45, metalness:0,
}));
export const fireflyMat = () => shared('mat:firefly', () => new THREE.PointsMaterial({
  color:0xc6ff8a, size:0.07, transparent:true, opacity:0, depthWrite:false, toneMapped:false, sizeAttenuation:true,
}));

/** @param {number} r @param {number} h @param {number} y @param {number} c0 @param {number} c1 */
function cone(r, h, y, c0, c1){
  const g = new THREE.ConeGeometry(r, h, 7);
  g.translate(0, h/2, 0);
  g.computeBoundingBox();
  paintGradient(g, c0, c1, 0, h);
  const mesh = new THREE.Mesh(g, NEEDLE());
  mesh.position.y = y;
  return mesh;
}

/** @param {any} rng @param {number} seed */
export function buildPine(rng, seed){
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.15, 1.25, 6), BARK());
  trunk.position.y = 0.62;
  g.add(trunk);
  const lean = (rng()-0.5)*0.08;
  const layers = [[0.78, 0.95, 0.85], [0.62, 0.82, 1.45], [0.42, 0.7, 1.95], [0.24, 0.55, 2.4]];
  for(const [r, h, y] of layers){
    const c = cone(r*(0.92+rng()*0.16), h, y, 0x1a3d22, 0x3f7a34);
    c.rotation.z = lean;
    g.add(c);
  }
  g.rotation.y = (seed%7)*0.4;
  return { object:castAll(g), obstacles:[{ c:new THREE.Vector3(0, 0.5, 0), r:0.2 }] };
}

const MAPLE_COLS = [0xc4492a, 0xe07a2f, 0xd4a017, 0x8d2f2a, 0xf0c14a];

/** @param {any} rng @param {number} seed */
export function buildMaple(rng, seed){
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.13, 1.45, 6), BARK());
  trunk.position.y = 0.7;
  g.add(trunk);
  for(let i=0;i<3;i++){
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.7, 5), BARK());
    b.position.set(Math.cos(i*2.1)*0.15, 1.15, Math.sin(i*2.1)*0.15);
    b.rotation.z = 0.7*(i%2===0 ? 1 : -1);
    b.rotation.y = i;
    g.add(b);
  }
  const n = 22;
  const leaf = new THREE.PlaneGeometry(0.34, 0.2);
  leaf.translate(0, 0.02, 0);
  const mesh = new THREE.InstancedMesh(leaf, LEAF(), n);
  mesh.userData.shore = { kind:'leaf', full:n, extra:false };
  mesh.frustumCulled = false;
  mesh.castShadow = true; mesh.receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color(), e = new THREE.Euler();
  const phases = new Float32Array(n);
  for(let i=0;i<n;i++){
    const a = rng()*6.283, rad = 0.15+rng()*0.75, y = 1.55+rng()*0.85;
    p.set(Math.cos(a)*rad, y, Math.sin(a)*rad*(0.75+rng()*0.3));
    e.set(rng()*0.8, rng()*6.283, (rng()-0.5)*0.6);
    q.setFromEuler(e);
    const k = 0.75+rng()*0.55;
    s.set(k, k, k);
    mesh.setMatrixAt(i, m.compose(p, q, s));
    col.setHex(MAPLE_COLS[Math.floor(rng()*MAPLE_COLS.length)] ?? 0xc4492a);
    col.multiplyScalar(0.85+rng()*0.3);
    mesh.setColorAt(i, col);
    phases[i] = rng()*6.283;
  }
  leaf.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  if(mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  g.add(mesh);
  g.rotation.y = (seed%5)*0.5;
  return { object:g, obstacles:[{ c:new THREE.Vector3(0, 0.5, 0), r:0.16 }] };
}

/** @param {any} rng @param {number} seed */
export function buildBankGrass(rng, seed){
  const n = 26;
  const blade = shared('geo:bankblade', () => {
    const geo = new THREE.PlaneGeometry(0.07, 0.42, 1, 3);
    geo.translate(0, 0.21, 0);
    const p = geo.attributes.position;
    for(let i=0;i<p.count;i++){
      const y = /** @type {number} */ (p.getY(i));
      const k = y/0.42;
      p.setX(i, /** @type {number} */ (p.getX(i))*(1-k*0.72));
      p.setZ(i, Math.sin(k*1.15)*0.035);
    }
    geo.computeVertexNormals();
    return geo;
  }).clone();
  const mesh = new THREE.InstancedMesh(blade, GRASS(), n);
  mesh.userData.shore = { kind:'grass', full:n, extra:seed%3===0 };
  mesh.frustumCulled = false;
  mesh.castShadow = false; mesh.receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color(), phases = new Float32Array(n);
  for(let i=0;i<n;i++){
    const a = rng()*6.283, rad = Math.sqrt(rng())*0.42;
    p.set(Math.cos(a)*rad, 0, Math.sin(a)*rad);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng()*6.283);
    const k = 0.7+rng()*0.6;
    s.set(k, k*(0.75+rng()*0.5), k);
    mesh.setMatrixAt(i, m.compose(p, q, s));
    col.setHex(rng()<0.25 ? 0x8d9a48 : 0x3f7a32);
    col.multiplyScalar(0.85+rng()*0.3);
    mesh.setColorAt(i, col);
    phases[i] = rng()*6.283;
  }
  blade.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  if(mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return { object:mesh, obstacles:[] };
}

/** @param {any} _rng @param {number} seed */
export function buildLantern(_rng, seed){
  const g = new THREE.Group();
  const stone = STONE();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.42), stone);
  base.position.y = 0.04;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.46, 6), stone);
  post.position.y = 0.3;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.3), stone);
  box.position.y = 0.64;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.22, 4), stone);
  roof.position.y = 0.86;
  roof.rotation.y = Math.PI/4;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.08), stone);
  cap.position.y = 1.0;
  g.add(base, post, box, roof, cap);
  const glow = lanternGlow();
  for(let i=0;i<4;i++){
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.14), glow);
    const a = i*Math.PI/2;
    w.position.set(Math.sin(a)*0.152, 0.64, Math.cos(a)*0.152);
    w.rotation.y = a;
    w.castShadow = false;
    g.add(w);
  }
  const light = new THREE.PointLight(0xffb56a, 0, 8, 2);
  light.position.y = 0.66;
  light.castShadow = false;
  light.userData.shoreLight = true;
  g.add(light);
  const pts = new Float32Array(10*3);
  for(let i=0;i<10;i++){
    const a = i/10*6.283+seed;
    pts[i*3] = Math.cos(a)*0.35;
    pts[i*3+1] = 0.7+(i%5)*0.12;
    pts[i*3+2] = Math.sin(a)*0.35;
  }
  const flies = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pts, 3)), fireflyMat());
  flies.frustumCulled = false;
  flies.visible = false;
  g.add(flies);
  castAll(g);
  for(const c of /** @type {any[]} */ (g.children)){ if(c.material===glow || c.isLight || c.isPoints) c.castShadow = false; }
  return { object:g, obstacles:[{ c:new THREE.Vector3(0, 0.3, 0), r:0.2 }] };
}
