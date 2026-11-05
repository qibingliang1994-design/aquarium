// @ts-check
import * as THREE from 'three';
import { makeRng } from '../utils.js';

/* ================================================================
 * 焦散生成：光子泼溅（学自 tidewater src/ocean/Caustics.js，源自 Evan Wallace 的 "WebGL Water"）
 *
 * 一张细网格覆盖一块周期性水面 tile，画进离屏 RT。每个顶点是真实波面上的一点：灯光方向在那里
 * 按波面法线折射，沿折射线落到水下 D 深的平面上，顶点就放在落点。片元写
 *   （水面上的面积 / 落到底面后的面积）
 * 并做加法混合——这正是光的汇聚度：波面把光聚焦、折叠处自然长出亮网纹，光被摊开处变暗，均值 ≈ 1。
 *
 * - 波面是整数波数的正弦组（在 tile 上严格周期），网格向四周多铺 MARGIN 圈（= 相邻 tile 的水面），
 *   从 tile 外折进来的光也落进来，结果无缝平铺。
 * - 两个焦平面：R = 浅、G = 深，查找时按真实水深混合；越深 mip 越糊（太阳/灯有尺寸 + 前向散射）。
 * - 两层：fine（细涟漪，网纹本体）+ broad（更长的波、不同 tile 尺寸），相乘打散平铺重复感。
 * - 平水面时的折射偏移被减掉，图案和"入射点"对齐，查找处再按真实水深加回（cauEntry）。
 * 与原 Voronoi 贴图的区别：网纹的形状、流动、变亮变暗都来自波面本身，随天气的浪（U.chop）
 * 与水流（U.flow）一起变，不再是一张图在滑。
 * ================================================================ */

const ETA = 1 / 1.333;
/** 片元面积比软上限：单个几乎对折的网格不该成一块白斑（I = ao / (an + ao/SOFT)，上限 SOFT） */
const SOFT = 8;

/**
 * @typedef {{ kx:number, kz:number, a:number, w:number, ph:number }} Wave   k = 弧度/世界单位；a = 振幅；w = 角速度；ph = 初相
 * @typedef {{ name:string, res:number, tile:number, grid:number, gridLo:number, depths:[number,number], waves:Wave[] }} LayerSpec   gridLo = 低画质档的网格
 */

/** 生成在 tile 上严格周期的波组：整数波数 (m, n)，|(m,n)| ∈ [nLo, nHi]；振幅按目标斜率 slope / |k| 给，
 * 角速度取毛细-重力波色散的放慢版（短波快、长波慢），初相随机。确定性（同 seed 同结果）。
 * @param {{ seed:number, count:number, tile:number, nLo:number, nHi:number, slope:number, speed:number }} o
 * @returns {Wave[]} */
export function makeWaveSet({ seed, count, tile, nLo, nHi, slope, speed }){
  const rnd = makeRng(seed);
  /** @type {Wave[]} */
  const out = [];
  const used = new Set();
  let guard = 0;
  while(out.length < count && guard++ < 1000){
    const ang = rnd() * Math.PI * 2, r = nLo + (nHi - nLo) * rnd();
    const m = Math.round(Math.cos(ang) * r), n = Math.round(Math.sin(ang) * r);
    const len = Math.hypot(m, n);
    if(len < nLo - 0.5 || len > nHi + 0.5) continue;
    const key = `${m},${n}`, anti = `${-m},${-n}`;
    if(used.has(key) || used.has(anti)) continue;   // 同向或反向的同一波数会互相抵消/重复
    used.add(key);
    const kx = 2 * Math.PI * m / tile, kz = 2 * Math.PI * n / tile, k = Math.hypot(kx, kz);
    out.push({ kx, kz, a: slope * (0.7 + 0.6 * rnd()) / k, w: speed * Math.sqrt(k) * (0.8 + 0.4 * rnd()), ph: rnd() * Math.PI * 2 });
  }
  return out;
}

/** 每帧的相位（双精度在 CPU 上取模，GPU 端 cos(k·x - φ) 永不丢精度）。drift = 水流累计位移（+x）
 * @param {Wave[]} waves @param {number} t @param {number} drift @param {Float32Array} out */
export function wavePhases(waves, t, drift, out){
  const TAU = Math.PI * 2;
  for(let i = 0; i < waves.length; i++){
    const w = waves[i];
    const p = (w.w * t + w.kx * drift + w.ph) % TAU;
    out[i] = p < 0 ? p + TAU : p;
  }
  return out;
}

/** 波面梯度（与着色器同式，测试用）：∇h = Σ a·k·cos(k·x - φ) */
export function waveGrad(/** @type {Wave[]} */ waves, /** @type {Float32Array} */ ph, /** @type {number} */ x, /** @type {number} */ z){
  let gx = 0, gz = 0;
  for(let i = 0; i < waves.length; i++){
    const w = waves[i], c = Math.cos(w.kx * x + w.kz * z - ph[i]) * w.a;
    gx += c * w.kx; gz += c * w.kz;
  }
  return [gx, gz];
}

/** 两层的参数（世界单位：缸宽 4.6、水深约 1.5）。fine：细涟漪（波长 0.13~0.4）；broad：长波（0.7~2），
 * tile 尺寸互不成整数比，叠在一起不会出现规则重复 */
const TILE_F = 1.7, TILE_B = 4.3;
/** @type {LayerSpec} */
export const FINE = { name:'cauFine', res:512, tile:TILE_F, grid:200, gridLo:128, depths:[0.55, 1.5],
  waves: makeWaveSet({ seed:0xc0a5, count:10, tile:TILE_F, nLo:4.5, nHi:13, slope:0.05, speed:0.55 }) };
/** @type {LayerSpec} */
export const BROAD = { name:'cauBroad', res:256, tile:TILE_B, grid:96, gridLo:64, depths:[0.9, 2.2],
  waves: makeWaveSet({ seed:0x7a1e, count:6, tile:TILE_B, nLo:2.2, nHi:6, slope:0.045, speed:0.4 }) };
/** 网格向四周外扩的比例：最坏情况（各波同相、天气浪 ×2）的落点偏移 0.25·D·Σ斜率 也要小于它（单测守着） */
export const MARGIN = 0.3;
/** 从这一档起换稀网格（三角形约少 60%：fine 41 万 → 17 万）。网格只决定网纹折叠尖点的锐度，
 * 焦散图分辨率不变；弱 GPU 上泼溅的光栅化是这里的大头 */
export const LOW_GRID_LEVEL = 3;
/** 画质档 → 网格密度 @param {LayerSpec} spec @param {number} level */
export function gridFor(spec, level){ return level >= LOW_GRID_LEVEL ? spec.gridLo : spec.grid; }

/** 顶点着色器：网格点 → 波面法线 → 折射 → 落到 D 深处（去掉平水面偏移） */
function vertexShader(/** @type {number} */ n){
  return `
  uniform vec4 uK[${n}];     // xy = 波矢, z = 振幅, w 备用
  uniform float uPh[${n}];
  uniform vec3 uL;           // 灯光方向（向下）
  uniform float uTile, uD, uAmp;
  varying vec2 vOld; varying vec2 vNew;
  void main(){
    vec2 p = position.xy * uTile;
    vec2 g = vec2(0.0);
    for(int i = 0; i < ${n}; i++){ g += uK[i].xy * (uK[i].z * cos(dot(uK[i].xy, p) - uPh[i])); }
    g *= uAmp;
    vec3 T = refract(uL, normalize(vec3(-g.x, 1.0, -g.y)), ${ETA.toFixed(5)});
    vec3 T0 = refract(uL, vec3(0.0, 1.0, 0.0), ${ETA.toFixed(5)});
    vec2 off = (T.xz / max(-T.y, 0.15) - T0.xz / max(-T0.y, 0.15)) * uD;
    vec2 q = p + off;
    vOld = p; vNew = q;
    gl_Position = vec4(q / uTile * 2.0 - 1.0, 0.0, 1.0);
  }`;
}
const FRAGMENT = `
  uniform vec3 uMask; uniform float uOut;
  varying vec2 vOld; varying vec2 vNew;
  void main(){
    // 水面小块与它在底面上的像的面积比 = 光的汇聚度（每个三角形内导数恒定，精确）
    vec2 ox = dFdx(vOld), oy = dFdy(vOld), nx = dFdx(vNew), ny = dFdy(vNew);
    float ao = abs(ox.x * oy.y - ox.y * oy.x);
    float an = abs(nx.x * ny.y - nx.y * ny.x);
    float I = ao / max(an + ao * ${(1 / SOFT).toFixed(4)}, 1e-12);
    gl_FragColor = vec4(uMask * I * uOut, 1.0);
  }`;

/** [-MARGIN, 1+MARGIN]² 的索引网格（顶点共享：每个波面点只算一次） */
function gridGeometry(/** @type {number} */ grid){
  const g = Math.ceil(grid * (1 + 2 * MARGIN)), row = g + 1;
  const pos = new Float32Array(row * row * 3);
  for(let y = 0, i = 0; y <= g; y++) for(let x = 0; x <= g; x++, i += 3){
    pos[i] = x / g * (1 + 2 * MARGIN) - MARGIN; pos[i + 1] = y / g * (1 + 2 * MARGIN) - MARGIN;
  }
  const idx = new Uint32Array(g * g * 6);
  for(let y = 0, i = 0; y < g; y++) for(let x = 0; x < g; x++){
    const a = y * row + x;
    idx[i++] = a; idx[i++] = a + 1; idx[i++] = a + row;
    idx[i++] = a + row; idx[i++] = a + 1; idx[i++] = a + row + 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

/** @param {number} res @param {boolean} half */
function makeTarget(res, half){
  const rt = new THREE.WebGLRenderTarget(res, res, {
    type: half ? THREE.HalfFloatType : THREE.UnsignedByteType,
    format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
  });
  rt.texture.anisotropy = 4;   // 底面多半是掠射着看：沿视线方向滤波，横向保持锐利
  return rt;
}

class CausticLayer {
  /** @param {LayerSpec} spec @param {THREE.Vector3} lightDir @param {{value:number}} amp */
  constructor(spec, lightDir, amp){
    this.spec = spec;
    this.rt = makeTarget(spec.res, true);
    this.ph = new Float32Array(spec.waves.length);
    const K = spec.waves.map(w => new THREE.Vector4(w.kx, w.kz, w.a, 0));
    this.out = { value: 1 };
    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = false;
    /** @type {Map<number, THREE.BufferGeometry>} 网格密度 → 几何（稀网格首次用到时才建） */
    this.geos = new Map([[spec.grid, gridGeometry(spec.grid)]]);
    this.grid = spec.grid;
    const geo = /** @type {THREE.BufferGeometry} */ (this.geos.get(spec.grid));
    spec.depths.forEach((D, k) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uK:{ value:K }, uPh:{ value:this.ph }, uL:{ value:lightDir }, uTile:{ value:spec.tile },
          uD:{ value:D }, uAmp:amp, uMask:{ value:new THREE.Vector3(k === 0 ? 1 : 0, k === 1 ? 1 : 0, 0) }, uOut:this.out },
        vertexShader: vertexShader(spec.waves.length), fragmentShader: FRAGMENT,
        depthTest: false, depthWrite: false, transparent: true, side: THREE.DoubleSide,
        blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
    });
  }
  /** 换网格密度（两个焦平面共用同一几何；旧几何留在缓存里，档位来回切不重建） @param {number} grid */
  setGrid(grid){
    if(grid === this.grid) return;
    let geo = this.geos.get(grid);
    if(!geo){ geo = gridGeometry(grid); this.geos.set(grid, geo); }
    for(const m of this.scene.children) /** @type {THREE.Mesh} */ (m).geometry = geo;
    this.grid = grid;
  }
  /** 半精度浮点 RT 不可渲染/混合的老设备：退回 8 位，存 I/SOFT，查找时乘回 */
  useBytes(){
    this.rt.dispose();
    this.rt = makeTarget(this.spec.res, false);
    this.out.value = 1 / SOFT;
  }
}

/** 焦散生成器（单例；材质在模块加载时就要引用贴图，所以贴图对象先建好，首帧 update 才画内容）。
 *  CAU_U：所有采样焦散的材质共享的 uniform（贴图、tile、水面高、灯光方向、8 位回退倍率） */
const lightDir = new THREE.Vector3(0.05, -1, 0.1).normalize();
const amp = { value: 1 };
const fine = new CausticLayer(FINE, lightDir, amp);
const broad = new CausticLayer(BROAD, lightDir, amp);
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

export const CAU_U = {
  uCauF: { value: fine.rt.texture },
  uCauB: { value: broad.rt.texture },
  /** x = 1/fine tile, y = 1/broad tile, z = 水面高（世界 y）, w = 读回倍率（8 位回退 = SOFT） */
  uCauA: { value: new THREE.Vector4(1 / FINE.tile, 1 / BROAD.tile, 1.84, 1) },
  uCauL: { value: lightDir },
};

/** GLSL：焦散查找（需要 CAU_U 的 uniform；片元着色器用）。
 *  cauEntry(P, depth)：平水面时到达 P 的光的入水点（图案按它对齐）
 *  cauRGB(P)：带色散的焦散光强（均值 ≈ 1），按像素足迹各向异性滤波（textureGrad）——远处/掠射的底面不闪烁
 *  cauMono(P, lvl)：单通道、固定模糊档（光柱 ray march / 顶点着色器用，无导数）
 *  顶点着色器里引用前先 #define CAU_VERTEX：cauRGB 用到 dFdx，顶点阶段没有，整段跳过 */
export const CAUSTICS_GLSL = `
uniform sampler2D uCauF, uCauB;
uniform vec4 uCauA;
uniform vec3 uCauL;
vec2 cauEntry(vec3 P, float depth){
  vec3 T0 = refract(uCauL, vec3(0.0, 1.0, 0.0), ${ETA.toFixed(5)});
  return P.xz - T0.xz * (depth / max(-T0.y, 0.15));
}
vec2 cauStretch(vec2 g, float m){ return g * max(m / max(length(g), 1e-9), 1.0); }
float cauBroad(vec2 e, float depth){
  vec2 b = textureLod(uCauB, e * uCauA.y, 1.5).rg * uCauA.w;
  return mix(1.0, mix(b.x, b.y, clamp((depth - ${BROAD.depths[0].toFixed(2)}) / ${(BROAD.depths[1] - BROAD.depths[0]).toFixed(2)}, 0.0, 1.0)), 0.6);
}
#ifndef CAU_VERTEX
vec3 cauRGB(vec3 P){
  float depth = max(uCauA.z - P.y, 0.0);
  vec2 e = cauEntry(P, depth);
  float lv = clamp(depth * 0.7 - 0.3, 0.0, 2.5);           // 越深越糊（缸只有 ~1.5 深：别糊掉网纹）
  float wD = clamp((depth - ${FINE.depths[0].toFixed(2)}) / ${(FINE.depths[1] - FINE.depths[0]).toFixed(2)}, 0.0, 1.0);   // 两个焦平面之间按深度混
  vec2 uv = e * uCauA.x;
  float mn = exp2(lv) / ${FINE.res.toFixed(1)};
  vec2 gx = cauStretch(dFdx(uv), mn), gy = cauStretch(dFdy(uv), mn);
  // 轻微色散：各色沿光线水平方向错开一点，越深错得越多
  vec3 T0 = refract(uCauL, vec3(0.0, 1.0, 0.0), ${ETA.toFixed(5)});
  vec2 dsp = normalize(T0.xz + vec2(1e-4, 0.0)) * (0.001 + depth * 0.0018) * uCauA.x;   // 只在亮线边缘透一点彩，别成彩虹斑
  vec2 tg = textureGrad(uCauF, uv, gx, gy).rg;
  vec2 tr = textureGrad(uCauF, uv + dsp, gx, gy).rg;
  vec2 tb = textureGrad(uCauF, uv - dsp, gx, gy).rg;
  vec3 c = vec3(mix(tr.x, tr.y, wD), mix(tg.x, tg.y, wD), mix(tb.x, tb.y, wD)) * uCauA.w;
  return c * cauBroad(e, depth);
}
#endif
float cauMono(vec3 P, float lvl){
  float depth = max(uCauA.z - P.y, 0.0);
  vec2 e = cauEntry(P, depth);
  float wD = clamp((depth - ${FINE.depths[0].toFixed(2)}) / ${(FINE.depths[1] - FINE.depths[0]).toFixed(2)}, 0.0, 1.0);
  vec2 t = textureLod(uCauF, e * uCauA.x, lvl).rg * uCauA.w;
  return mix(t.x, t.y, wD) * cauBroad(e, depth);
}
`;

let checked = false, tick = 0, every = 1, drift = 0;

/** 每帧调用（在 composer.render 之前）。light：主灯（缸 = 顶灯 spot；自然水域 = 斜射太阳）
 * @param {THREE.WebGLRenderer} renderer
 * @param {{ position:THREE.Vector3, target:{ position:THREE.Vector3 } }} light
 * @param {{ t:number, dt:number, flow:number, chop:number, on:boolean }} s */
export function updateCaustics(renderer, light, { t, dt, flow, chop, on }){
  drift += flow * 0.9 * dt;                 // 与 waterWave 同速顺流漂移
  if(!on) return;
  if(!checked){                             // 首次：确认半精度浮点 RT 可渲染（WebGL2 + EXT_color_buffer_float）
    checked = true;
    if(!renderer.extensions.has('EXT_color_buffer_float') && !renderer.extensions.has('EXT_color_buffer_half_float')){
      fine.useBytes(); broad.useBytes();
      CAU_U.uCauF.value = fine.rt.texture; CAU_U.uCauB.value = broad.rt.texture; CAU_U.uCauA.value.w = SOFT;
    }
  }
  if(tick++ % every) return;
  lightDir.copy(light.target.position).sub(light.position).normalize();
  if(lightDir.y > -0.2){ lightDir.y = -0.2; lightDir.normalize(); }   // 灯/太阳贴着地平线时防止折射线几乎水平
  amp.value = Math.min(2, Math.max(0.35, chop));
  wavePhases(fine.spec.waves, t, drift, fine.ph);
  wavePhases(broad.spec.waves, t, drift, broad.ph);
  const prevRT = renderer.getRenderTarget(), prevAuto = renderer.autoClear;
  const prevColor = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  for(const L of [fine, broad]){
    renderer.setRenderTarget(L.rt);
    renderer.clear(true, false, false);
    renderer.render(L.scene, cam);          // 渲完 three 自动给 RT 生成 mip（generateMipmaps）
  }
  renderer.setRenderTarget(prevRT);
  renderer.setClearColor(prevColor, prevAlpha);
  renderer.autoClear = prevAuto;
}

/** 画质档：≥3 换稀网格，≥4 再隔帧更新（波面慢，30 Hz 肉眼看不出） @param {number} level */
export function setCausticsLevel(level){
  every = level >= 4 ? 2 : 1;
  fine.setGrid(gridFor(FINE, level));
  broad.setGrid(gridFor(BROAD, level));
}

/** 水面高（世界 y）：缸与自然水域都是 TANK.waterY，tank.js 设一次 @param {number} y */
export function setCausticsWaterY(y){ CAU_U.uCauA.value.z = y; }

/** 调试：读回焦散图统计（均值应 ≈ 1；暗区占比、峰值看网纹对比度）。layer = 'fine' | 'broad'
 * @param {THREE.WebGLRenderer} renderer @param {'fine'|'broad'} [layer] */
export function causticStats(renderer, layer = 'fine'){
  const L = layer === 'broad' ? broad : fine, rt = L.rt, n = rt.width * rt.height;
  const half = rt.texture.type === THREE.HalfFloatType;
  const buf = half ? new Uint16Array(n * 4) : new Uint8Array(n * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, buf);
  const val = (/** @type {number} */ x) => half ? THREE.DataUtils.fromHalfFloat(x) : x / 255 * SOFT;
  const acc = [0, 0], mx = [0, 0], dark = [0, 0];
  for(let i = 0; i < n; i++) for(let c = 0; c < 2; c++){
    const v = val(buf[i * 4 + c]); acc[c] += v; mx[c] = Math.max(mx[c], v); if(v < 0.5) dark[c]++;
  }
  return { mean: acc.map(v => +(v / n).toFixed(3)), max: mx.map(v => +v.toFixed(2)), dark: dark.map(v => +(v / n).toFixed(3)),
    light: lightDir.toArray().map(v => +v.toFixed(3)), half, grid: L.grid, every };
}
