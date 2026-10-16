import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { causticsTex, causticsOn } from '../scene/caustics.js';
import { U } from '../uniforms.js';

/* ================================================================
 * GLB 鱼体美化
 * Quaternius 原模型是纯色块 + metalness 0.4 + 硬面片法线，在水下显得灰暗发闷。
 * 这里在加载后统一重塑：
 *  1. 折角法线（>55° 保留棱角，其余平滑）——低模变"软陶"质感
 *  2. 按物种调色板换成湿润的非金属皮肤（clearcoat 水膜 + 轻微虹彩）
 *  3. 着色器：腹→背纵向渐变（反荫蔽色）、霓虹带自发光、焦散、逆光轮廓（水中透光感）
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
    [/Main/,  { grad:['#ffffff','#f5f2ea','#d8d0bc'], mid:0.5, irid:0.3 }],
    [/Light/, { color:'#ffc21f' }],
    [/Dark/,  { color:'#17191d', rough:0.45 }],
  ],
  cory: [
    [/Main/,  { grad:['#ecdcc8','#9b937e','#5d594b'], mid:0.45, irid:0.12 }],
    [/Light/, { color:'#3a3b35', rough:0.5 }],
  ],
  clown: [
    [/Main/,  { grad:['#ffb366','#ff6c0a','#ef5200'], mid:0.5, irid:0.12 }],
    [/Light/, { color:'#fbfbf6' }],
    [/Dark/,  { color:'#131313', rough:0.45 }],
  ],
  lion: [
    [/Main/,  { grad:['#f4d8cb','#cc3a20','#7c1e12'], mid:0.5 }],
    [/Light/, { color:'#fff6ec' }],
    [/Fins/,  { color:'#e0a07a', fin:0.7 }],
  ],
  mandarin: [
    [/Main/,  { color:'#ff7d1f' }],
    [/Light/, { color:'#19d6c8', glow:0.35 }],
    [/Dark/,  { color:'#1a4fd0', glow:0.2 }],
  ],
  parrot: [
    [/Main/,  { grad:['#93e6c6','#1fb28d','#11806e'], mid:0.5, irid:0.2 }],
    [/Light/, { color:'#ff7ea6' }],
    [/Fins/,  { color:'#3592ff', fin:0.8 }],
    [/Teeth/, { color:'#f1efe6' }],
  ],
};
const EYE = { color:'#050607', rough:0.04 };
const CREASE = THREE.MathUtils.degToRad(55);

// 逆光轮廓：全部鱼共享，昼夜切换时由 applyNight 调节
export const fishRim = { k:{ value:0.42 }, color:{ value:new THREE.Color(0.42,0.74,0.9) } };

const srgb = hex => new THREE.Color(hex);

// toCreasedNormals 以 0.01 精度哈希顶点位置；Quaternius 网格本地尺寸仅 ~0.02（节点缩放 100），
// 直接用会把不相干的顶点并到一起——先放大到 ~1000 单位再算，算完缩回
function smoothNormals(geo){
  geo.computeBoundingBox();
  const k = 1000/(geo.boundingBox.getSize(new THREE.Vector3()).length() || 1);
  return toCreasedNormals(geo.clone().scale(k,k,k), CREASE).scale(1/k,1/k,1/k);
}

function makeSkin(old, look){
  const m = new THREE.MeshPhysicalMaterial({
    name: old.name,
    color: look.color ? srgb(look.color) : old.color.clone(),
    roughness: look.rough ?? 0.36, metalness: 0,
    clearcoat: 0.6, clearcoatRoughness: 0.22,
    iridescence: look.irid ?? 0.15, iridescenceIOR: 1.3,
    specularIntensity: 0.7, envMapIntensity: 1.1,
    side: THREE.DoubleSide,
  });
  if(look.fin){                           // 鳍：半透明 + 柔和高光
    m.transparent = true; m.opacity = look.fin;
    m.clearcoat = 0.3; m.roughness = 0.45; m.iridescence = 0;
  }
  // 渐变/自发光在着色器里乘到底色上，底色置白
  if(look.grad) m.userData.paint = { grad:look.grad, mid:look.mid ?? 0.5, band:look.band ?? 0.2, glow:look.glow ?? 0 };
  else if(look.glow) m.userData.paint = { grad:[look.color,look.color,look.color], mid:0.5, band:1, glow:look.glow };
  if(m.userData.paint) m.color.set(0xffffff);
  return m;
}

// 计算模型"世界向上"在网格局部坐标中的方向与范围（用于腹→背渐变）
function verticalFrame(root){
  root.updateMatrixWorld(true);
  let lo = Infinity, hi = -Infinity, up = null;
  const q = new THREE.Quaternion(), v = new THREE.Vector3();
  root.traverse(o=>{
    if(!o.isMesh || /Eyes/i.test(o.material?.name ?? '')) return;
    if(!up){ o.matrixWorld.decompose(v,q,v); up = new THREE.Vector3(0,1,0).applyQuaternion(q.invert()); }
    const p = o.geometry.attributes.position;
    for(let i=0;i<p.count;i++){ const d = v.fromBufferAttribute(p,i).dot(up); lo = Math.min(lo,d); hi = Math.max(hi,d); }
  });
  return { up: up ?? new THREE.Vector3(0,1,0), lo, hi: hi>lo ? hi : lo+1 };
}

// 加载后调用一次（模板上），克隆体共享几何、复制材质与 userData
export function prepareFishModel(root, speciesId){
  if(root.userData.fishStyled) return root;
  root.userData.fishStyled = true;
  const palette = PALETTES[speciesId];
  if(!palette){                           // 贴图模型（锦鲤）：只压金属感、加水膜
    root.traverse(o=>{
      if(!o.isMesh || !o.material?.isMeshStandardMaterial) return;
      const old = o.material;
      const m = old.isMeshPhysicalMaterial ? old : new THREE.MeshPhysicalMaterial({
        name:old.name, color:old.color, map:old.map, normalMap:old.normalMap,
        roughnessMap:old.roughnessMap, metalnessMap:old.metalnessMap, roughness:old.roughness, side:old.side });
      m.metalness = Math.min(old.metalness, 0.15); m.clearcoat = 0.7; m.clearcoatRoughness = 0.2;
      o.material = m;
    });
    return root;
  }
  const frame = verticalFrame(root);
  const done = new Map();
  root.traverse(o=>{
    if(!o.isMesh) return;
    if(!done.has(o.geometry)) done.set(o.geometry, smoothNormals(o.geometry));
    o.geometry = done.get(o.geometry);
    const old = o.material, name = old.name ?? '';
    const look = /Eyes/i.test(name) ? EYE : (palette.find(([re])=>re.test(name))?.[1] ?? {});
    const m = makeSkin(old, look);
    if(/Eyes/i.test(name)){ m.clearcoat = 1; m.clearcoatRoughness = 0.02; m.iridescence = 0; }
    m.userData.frame = { up:frame.up.toArray(), lo:frame.lo, hi:frame.hi };
    o.material = m;
  });
  return root;
}

/* ---------- 着色器装饰：渐变 / 霓虹 / 焦散 / 逆光 / （静态模型）尾摆 ----------
 * opts: { causticK?:{value}, sway?:{ phaseU, L, amp, waveK } } */
export function decorateFishMaterial(mat, opts={}){
  const paint = mat.userData.paint, frame = mat.userData.frame;
  const { causticK, sway } = opts;
  const flags = `${paint?'g':''}${causticK?'c':''}${sway?'s':''}`;
  mat.customProgramCacheKey = ()=> `fishfx_${flags}`;
  mat.onBeforeCompile = sh=>{
    Object.assign(sh.uniforms, { uRimK:fishRim.k, uRimColor:fishRim.color });
    let vHead = 'varying float vYN;\n', vBody = '';
    let fHead = 'uniform float uRimK; uniform vec3 uRimColor; varying float vYN;\n';
    if(frame){
      sh.uniforms.uUp = { value:new THREE.Vector3().fromArray(frame.up) };
      sh.uniforms.uYR = { value:new THREE.Vector2(frame.lo, frame.hi) };
      vHead += 'uniform vec3 uUp; uniform vec2 uYR;\n';
      vBody += 'vYN = clamp((dot(position,uUp)-uYR.x)/(uYR.y-uYR.x),0.0,1.0);\n';
    } else vBody += 'vYN = 0.5;\n';
    if(sway){
      Object.assign(sh.uniforms, { uTP:sway.phaseU, uTL:{value:sway.L}, uTA:{value:sway.amp}, uTK:{value:sway.waveK} });
      vHead += 'uniform float uTP,uTL,uTA,uTK;\n';
    }
    if(causticK){
      Object.assign(sh.uniforms, { uCMap:{value:causticsTex}, uCK:causticK, uCOn:causticsOn, uCT:U.time });
      vHead += 'varying vec3 vFxW;\n';
      fHead += 'uniform sampler2D uCMap; uniform float uCK, uCOn, uCT; varying vec3 vFxW;\n';
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
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        ${causticK ? 'vFxW = (modelMatrix*vec4(transformed,1.0)).xyz;' : ''}`);
    sh.fragmentShader = fHead + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${paint ? `{ vec3 g = vYN<uGM ? mix(uG0,uG1,smoothstep(0.0,uGM,vYN))
                                 : mix(uG1,uG2,smoothstep(uGM,1.0,vYN));
          diffuseColor.rgb *= g; }` : ''}
        ${causticK ? `{ float c1=texture2D(uCMap,vFxW.xz*0.55+vec2(uCT*0.021,uCT*0.017)).r;
          float c2=texture2D(uCMap,vFxW.xz*0.92-vec2(uCT*0.013,-uCT*0.019)).r;
          diffuseColor.rgb += vec3(0.62,0.85,0.95)*pow(min(c1,c2),1.4)*smoothstep(1.75,1.0,vFxW.y)*uCK*uCOn; }` : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${paint ? 'totalEmissiveRadiance += uG1*uGlow*(1.0-smoothstep(0.0,uGB,abs(vYN-uGM)));' : ''}`)
      .replace('#include <opaque_fragment>', `{
          float nv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          outgoingLight += mix(uRimColor, diffuseColor.rgb, 0.45) * pow(1.0-nv, 3.0) * uRimK;
        }
        #include <opaque_fragment>`);
  };
  mat.needsUpdate = true;
}
