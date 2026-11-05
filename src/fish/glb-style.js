// @ts-check
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { causticsOn, CAUSTIC_FACING, CAU_U, CAUSTICS_GLSL, CAUSTIC_LIFT_GLSL } from '../scene/caustics.js';
import { VAT_VERT_HEAD } from './vat-glsl.js';
import { injectTranslucency } from '../scenes/items/common.js';
import { bodyAxis } from './body-axis.js';

/* ================================================================
 * GLB 鱼体美化
 * Quaternius 原模型是纯色块 + metalness 0.4 + 硬面片法线，在水下显得灰暗发闷。
 * 这里在加载后统一重塑：
 *  1. 折角法线（>55° 保留棱角，其余平滑）——低模变"软陶"质感
 *  2. 按物种调色板换成湿润的非金属皮肤（clearcoat 水膜 + 轻微虹彩）
 *  3. 着色器：腹→背纵向渐变（反荫蔽色）、霓虹带自发光、焦散、逆光轮廓（水中透光感）
 *  4. 与照片皮鱼统一画风：鱼鳞（沿体长一行行覆瓦状排列的弧，鳞缘压暗 + 屏幕导数凹凸，鳞片小于约 2 px 时淡出）、
 *     低频斑驳；白色不再顶满（泛光会把它糊成一团光）；水膜/镜面收到照片鱼的量级；鳍逆光透光
 * ================================================================ */

// 物种调色板：键为材质名正则；grad=[腹, 中, 背] 三段渐变，mid=中段位置，glow=中段自发光
const PALETTES = {
  tetra: [
    [/Main/,  { grad:['#eef3f4','#17b9f2','#3f5446'], mid:0.6, band:0.16, glow:0.55, irid:0.6 }],
    [/Light/, { color:'#ef2b30', rough:0.34 }],
    [/Fins/,  { color:'#dbe8ec', fin:0.62 }],
  ],
  gold: [
    [/Main/,  { grad:['#ffd59a','#ff7a18','#e04f16'], mid:0.5, irid:0.25 }],
    [/Light|Material\.016/, { color:'#fff2de' }],
    [/Fins/,  { color:'#ffab62', fin:0.72 }],
  ],
  angel: [
    [/Main/,  { grad:['#ece9e1','#e6e1d5','#cdc4b0'], mid:0.5, irid:0.3 }],
    [/Light/, { color:'#ffc21f' }],
    [/Dark/,  { color:'#17191d', rough:0.45 }],
  ],
  cory: [
    [/Main/,  { grad:['#ecdcc8','#9b937e','#5d594b'], mid:0.45, irid:0.12 }],
    [/Light/, { color:'#3a3b35', rough:0.5 }],
  ],
  clown: [
    [/Main/,  { grad:['#ffb366','#ff6c0a','#ef5200'], mid:0.5, irid:0.12 }],
    [/Light/, { color:'#ecebe4' }],
    [/Dark/,  { color:'#131313', rough:0.45 }],
  ],
  mandarin: [
    [/Main/,  { color:'#ff7d1f', scale:0 }],                // 花斑连鳍䲗无鳞：只留斑驳
    [/Light/, { color:'#19d6c8', glow:0.35, scale:0 }],
    [/Dark/,  { color:'#1a4fd0', glow:0.2, scale:0 }],
  ],
};
const EYE = { color:'#050607', rough:0.04 };
/** 鳞片默认密度：每个体高约多少片 */
const SCALE_F = 16;
const CREASE = THREE.MathUtils.degToRad(55);

// 逆光轮廓：全部鱼共享，昼夜切换时由 applyNight 调节
export const fishRim = { k:{ value:0.42 }, color:{ value:new THREE.Color(0.42,0.74,0.9) } };

const srgb = (/** @type {any} */ hex) => new THREE.Color(hex);

// toCreasedNormals 以 0.01 精度哈希顶点位置；Quaternius 网格本地尺寸仅 ~0.02（节点缩放 100），
// 直接用会把不相干的顶点并到一起——先放大到 ~1000 单位再算，算完缩回
function smoothNormals(/** @type {any} */ geo){
  geo.computeBoundingBox();
  const k = 1000/(geo.boundingBox.getSize(new THREE.Vector3()).length() || 1);
  return toCreasedNormals(geo.clone().scale(k,k,k), CREASE).scale(1/k,1/k,1/k);
}

function makeSkin(/** @type {any} */ old, /** @type {any} */ look){
  const m = new THREE.MeshPhysicalMaterial({
    name: old.name,
    color: look.color ? srgb(look.color) : old.color.clone(),
    roughness: look.rough ?? 0.36, metalness: 0,
    clearcoat: 0.45, clearcoatRoughness: 0.24,             // 水膜 / 镜面收到照片皮鱼的量级，低模不再像上釉的塑料
    iridescence: look.irid ?? 0.15, iridescenceIOR: 1.3,
    specularIntensity: 0.55, envMapIntensity: 0.95,
    side: THREE.DoubleSide,
  });
  if(look.fin){                           // 鳍：半透明 + 柔和高光
    m.transparent = true; m.opacity = look.fin;
    m.clearcoat = 0.3; m.roughness = 0.45; m.iridescence = 0;
    m.userData.fin = true;
  } else m.userData.skin = { f: look.scale ?? SCALE_F };   // 身体：鱼鳞 + 斑驳（scale 0 = 无鳞，只有斑驳）
  // 渐变/自发光在着色器里乘到底色上，底色置白
  if(look.grad) m.userData.paint = { grad:look.grad, mid:look.mid ?? 0.5, band:look.band ?? 0.2, glow:look.glow ?? 0 };
  else if(look.glow) m.userData.paint = { grad:[look.color,look.color,look.color], mid:0.5, band:1, glow:look.glow };
  if(m.userData.paint) m.color.set(0xffffff);
  return m;
}

// 计算模型"世界向上"在网格局部坐标中的方向与范围（用于腹→背渐变），以及指向头部的体长方向（鱼鳞成行）
function verticalFrame(/** @type {any} */ root){
  root.updateMatrixWorld(true);
  /** @type {any} */ let up = null; let lo = Infinity, hi = -Infinity;
  const q = new THREE.Quaternion(), v = new THREE.Vector3();
  /** @type {number[]} */ const body = [];
  /** @type {number[]} */ const eyes = [];
  root.traverse((/** @type {any} */ o)=>{
    if(!o.isMesh) return;
    const p = o.geometry.attributes.position, arr = /Eyes/i.test(o.material?.name ?? '') ? eyes : body;
    for(let i=0;i<p.count;i++) arr.push(p.getX(i), p.getY(i), p.getZ(i));
    if(arr === eyes) return;
    if(!up){ o.matrixWorld.decompose(v,q,v); up = new THREE.Vector3(0,1,0).applyQuaternion(q.invert()); }
    for(let i=0;i<p.count;i++){ const d = v.fromBufferAttribute(p,i).dot(up); lo = Math.min(lo,d); hi = Math.max(hi,d); }
  });
  up = up ?? new THREE.Vector3(0,1,0);
  return { up, lo, hi: hi>lo ? hi : lo+1, fwd: bodyAxis(body, up.toArray(), eyes) };
}

// 加载后调用一次（模板上），克隆体共享几何、复制材质与 userData
export function prepareFishModel(/** @type {any} */ root, /** @type {string} */ speciesId){
  if(root.userData.fishStyled) return root;
  root.userData.fishStyled = true;
  const palette = (/** @type {Record<string, any>} */ (PALETTES))[speciesId];
  if(!palette){                           // 贴图模型（锦鲤）：压住原模型过强的镜面，保留贴图细节
    root.traverse((/** @type {any} */ o)=>{
      if(!o.isMesh || !o.material?.isMeshStandardMaterial) return;
      const old = o.material;
      const m = old.isMeshPhysicalMaterial ? old : new THREE.MeshPhysicalMaterial({
        name:old.name, color:old.color, map:old.map, normalMap:old.normalMap,
        roughnessMap:old.roughnessMap, metalnessMap:old.metalnessMap, roughness:old.roughness, side:old.side });
      // 原始 glTF 的 KHR_materials_specular 把 specularColorFactor 拉到 2.0，
      // 在 ACES + 环境光下会把锦鲤的白斑冲成一片高光；这里按鱼皮重新收一遍。
      m.metalness = 0;
      m.specularColor?.setRGB(0.5, 0.5, 0.5);
      m.specularIntensity = Math.min(m.specularIntensity ?? 1, 0.45);
      m.clearcoat = 0.45; m.clearcoatRoughness = 0.28;
      m.envMapIntensity = 0.9;
      o.material = m;
    });
    return root;
  }
  const frame = verticalFrame(root);
  const done = new Map();
  root.traverse((/** @type {any} */ o)=>{
    if(!o.isMesh) return;
    if(!done.has(o.geometry)) done.set(o.geometry, smoothNormals(o.geometry));
    o.geometry = done.get(o.geometry);
    const old = o.material, name = old.name ?? '';
    const look = /Eyes/i.test(name) ? EYE : (palette.find((/** @type {any} */ entry)=>entry[0].test(name))?.[1] ?? {});
    const m = makeSkin(old, look);
    if(/Eyes/i.test(name)){ m.clearcoat = 1; m.clearcoatRoughness = 0.02; m.iridescence = 0; m.userData.eye = true; delete m.userData.skin; }
    m.userData.frame = { up:frame.up.toArray(), lo:frame.lo, hi:frame.hi, fwd:frame.fwd };
    o.material = m;
  });
  return root;
}

/* ---------- 着色器装饰：渐变 / 霓虹 / 焦散 / 逆光 / （无动画模型）尾摆 / （实例化鱼）骨骼位姿蒙皮 ----------
 * opts: { causticK?:{value}, sway?:{ phaseU, L, amp, waveK }, vat?:{ uPose, uC0, uC1, uC2 }（fish-vat.js 的实例化蒙皮）,
 *   inst?:boolean（实例化但不走骨骼位姿，如 photo-fish.js：焦散取世界坐标时要乘 instanceMatrix） } */
/** @param {any} mat @param {any} [opts] */
export function decorateFishMaterial(mat, opts={}){
  const ud=(/** @type {any} */ (mat.userData)); const paint = ud.paint, frame = ud.frame;
  const { causticK, sway, vat, inst } = opts;
  const eye = !!ud.eye, skin = frame ? ud.skin : null;
  const flags = `${paint?'g':''}${causticK?'c':''}${sway?'s':''}${vat?'v':''}${eye?'e':''}${skin ? (skin.f > 0 ? 'k' : 'm') : ''}`;
  mat.customProgramCacheKey = ()=> `fishfx_${flags}`;
  mat.onBeforeCompile = (/** @type {any} */ sh)=>{
    Object.assign(sh.uniforms, { uRimK:fishRim.k, uRimColor:fishRim.color });
    let vHead = 'varying float vYN;\n', vBody = '';
    let fHead = 'uniform float uRimK; uniform vec3 uRimColor; varying float vYN;\n';
    if(frame){
      sh.uniforms.uUp = { value:new THREE.Vector3().fromArray(frame.up) };
      sh.uniforms.uYR = { value:new THREE.Vector2(frame.lo, frame.hi) };
      vHead += 'uniform vec3 uUp; uniform vec2 uYR;\n';
      vBody += 'vYN = clamp((dot(position,uUp)-uYR.x)/(uYR.y-uYR.x),0.0,1.0);\n';
      if(skin){ vHead += 'varying vec3 vSkP;\n'; vBody += 'vSkP = position/(uYR.y-uYR.x);\n'; }   // 蒙皮前的物体空间（以体高为单位）：鳞片贴着鱼身走
    } else vBody += 'vYN = 0.5;\n';
    if(sway){
      Object.assign(sh.uniforms, { uTP:sway.phaseU, uTL:{value:sway.L}, uTA:{value:sway.amp}, uTK:{value:sway.waveK} });
      vHead += 'uniform float uTP,uTL,uTA,uTK;\n';
    }
    if(vat){ Object.assign(sh.uniforms, vat); vHead += VAT_VERT_HEAD; }
    if(causticK){
      Object.assign(sh.uniforms, CAU_U, { uCK:causticK, uCOn:causticsOn });
      vHead += 'varying vec3 vFxW;\n';
      fHead += 'uniform float uCK, uCOn; varying vec3 vFxW;\n' + CAUSTICS_GLSL + CAUSTIC_LIFT_GLSL;
    }
    if(skin){
      sh.uniforms.uSkF = { value:skin.f };
      sh.uniforms.uFwd = { value:new THREE.Vector3().fromArray(frame.fwd ?? [0, 0, 1]) };
      fHead += 'uniform float uSkF; uniform vec3 uUp, uFwd; varying vec3 vSkP;\n' + SKIN_GLSL;
    }
    if(paint){
      const [c0,c1,c2] = paint.grad.map(srgb);
      Object.assign(sh.uniforms, { uG0:{value:c0}, uG1:{value:c1}, uG2:{value:c2},
        uGM:{value:paint.mid}, uGB:{value:paint.band}, uGlow:{value:paint.glow} });
      fHead += 'uniform vec3 uG0,uG1,uG2; uniform float uGM,uGB,uGlow;\n';
    }
    sh.vertexShader = vHead + sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${vBody}
        ${sway ? `{ float k=clamp((uTL*0.5-transformed.z)/uTL,0.0,1.2);
          transformed.x += uTA*uTL*pow(k,1.7)*sin(uTP-uTK*k); }` : ''}`)
      .replace('#include <skinnormal_vertex>', `#include <skinnormal_vertex>
        ${vat ? 'mat4 vatS = vatSkin(); objectNormal = normalize((vatS * vec4(objectNormal, 0.0)).xyz);' : ''}`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        ${vat ? 'transformed = (vatS * vec4(transformed, 1.0)).xyz;' : ''}
        ${causticK ? `vFxW = (modelMatrix*${vat || inst ? 'instanceMatrix*' : ''}vec4(transformed,1.0)).xyz;` : ''}`);
    sh.fragmentShader = fHead + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${paint ? `{ vec3 g = vYN<uGM ? mix(uG0,uG1,smoothstep(0.0,uGM,vYN))
                                 : mix(uG1,uG2,smoothstep(uGM,1.0,vYN));
          diffuseColor.rgb *= g; }` : ''}
`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        ${skin ? SKIN_APPLY : ''}
        ${causticK ? `{ vec3 ca=cauLift(vFxW)*smoothstep(1.75,1.0,vFxW.y)*${CAUSTIC_FACING};
          diffuseColor.rgb += vec3(0.62,0.85,0.95)*ca*uCK*uCOn; }` : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${paint ? 'totalEmissiveRadiance += uG1*uGlow*(1.0-smoothstep(0.0,uGB,abs(vYN-uGM)));' : ''}
        ${eye ? `{ float en = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          float ring = smoothstep(0.06, 0.2, 1.0-en) * (1.0-smoothstep(0.45, 0.72, 1.0-en));
          totalEmissiveRadiance += vec3(0.5, 0.28, 0.06) * ring * 0.55; }` : ''}`)
      .replace('#include <opaque_fragment>', `{
          float nv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          outgoingLight += mix(uRimColor, diffuseColor.rgb, 0.45) * pow(1.0-nv, 3.0) * uRimK;
        }
        #include <opaque_fragment>`);
  };
  mat.needsUpdate = true;
  if(ud.fin) injectTranslucency(mat, { k:FIN_TR, tint:FIN_TINT });   // 鳍膜很薄：逆光时透出自身颜色
}

/** 鳍逆光透光（低模鳍与照片皮鱼的鳍共用） */
export const FIN_TR = 0.8;
/** @type {[number, number, number]} */
export const FIN_TINT = [1.05, 1.0, 0.88];

/* 鱼鳞 + 斑驳（片元）。vSkP：蒙皮前的物体空间位置 / 体高；uFwd：指向头部的体长方向。
 * - 覆瓦状鳞片：在（体长, 体高）平面上隔行错开半格排鳞心，每点归属"覆盖它且最靠头"的那片（前鳞压后鳞），
 *   露出的鳞缘是一道道凸向尾部的弧；鳞缘压暗，鳞片中部微隆起，用屏幕空间导数做凹凸（three perturbNormalArb 同式），
 *   隆起高度按"每格多少视空间单位"（导数之比）换算，与鱼的大小无关
 * - 鳞片小于约 2 px 时整体淡出（远处的鱼不闪）；斑驳是一层低频值噪声 */
const SKIN_GLSL = `
vec3 skHash3(vec3 p){
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}
float skNoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  float a = skHash3(i).x, b = skHash3(i + vec3(1, 0, 0)).x, c = skHash3(i + vec3(0, 1, 0)).x, d = skHash3(i + vec3(1, 1, 0)).x;
  float e = skHash3(i + vec3(0, 0, 1)).x, g = skHash3(i + vec3(1, 0, 1)).x, h = skHash3(i + vec3(0, 1, 1)).x, j = skHash3(i + vec3(1, 1, 1)).x;
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, j, f.x), f.y), f.z);
}
// 覆瓦鳞：返回所属鳞片内离鳞缘的距离（0 = 露出的鳞缘）
float skScale(vec2 q){
  vec2 cell = floor(q); float best = -1e9, e = 0.0;
  for(int j = -1; j <= 1; j++) for(int i = -1; i <= 1; i++){
    float row = cell.y + float(j);
    vec2 c = vec2(cell.x + float(i) + 0.5 * mod(row, 2.0), row);
    float dd = length(q - c), key = c.x + 0.01 * c.y;
    if(dd < 0.78 && key > best){ best = key; e = 0.78 - dd; }
  }
  return e;
}
`;
const SKIN_APPLY = `{
  diffuseColor.rgb *= 0.92 + 0.14 * skNoise(vSkP * 3.0);               // 低频斑驳：纯色块有了生气
  if(uSkF > 0.0){
    vec2 q = vec2(dot(vSkP, uFwd), dot(vSkP, uUp) * 1.15) * uSkF;
    float lod = 1.0 - smoothstep(0.25, 0.6, length(fwidth(q)));       // 鳞片小于约 2 px：淡出
    if(lod > 0.0){
      float hgt = smoothstep(0.0, 0.24, skScale(q));                     // 鳞缘 0 → 鳞片中部 1
      vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
      float wpc = length(sx) / max(length(dFdx(q)), 1e-6);               // 每格多少视空间单位
      float dHx = dFdx(hgt) * wpc * 0.035, dHy = dFdy(hgt) * wpc * 0.035;
      vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
      float det = dot(sx, r1) * faceDirection;
      vec3 gr = sign(det) * (dHx * r1 + dHy * r2);
      normal = normalize(mix(normal, normalize(abs(det) * normal - gr), lod));
      diffuseColor.rgb *= mix(1.0, mix(0.86, 1.02, hgt), lod);          // 鳞缘压暗
    }
  }
}`;
