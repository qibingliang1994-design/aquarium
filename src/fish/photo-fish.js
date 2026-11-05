// @ts-check
import * as THREE from 'three';
import { decorateFishMaterial, FIN_TR, FIN_TINT } from './glb-style.js';
import { injectTranslucency } from '../scenes/items/common.js';
import { U } from '../uniforms.js';

/* ================================================================
 * 照片皮鱼：整条鱼一个网格、一张照片贴图，顶点着色器里游动（实例化，每物种 1 次绘制）
 * 着色器移植自 aquarium-editor 的 fishlib.js（MIT License，Copyright (c) 2026 SkentSun）
 *
 * glb 的内容：顶点属性 _FIN = (部位, 权重, 收拢角), _PIV = 转动中心（保持 Blender 的 Z 向上坐标）
 *   部位：0 躯干, 1 背鳍, 2 臀鳍, 3 尾鳍, 4 胸鳍, 5 腹鳍, 6 眼, 7 鳃盖
 *   节点 extras.swim = { snout, length, lambda, freq, amp, env:[c0,c1,c2], pect_rest }（米，头朝 +X，侧向是 z）
 * 逐实例状态（photo-gait.js 每帧给出）：
 *   aSwim = (尾摆相位[周], 尾摆幅度倍率, 身体弯曲[1/m], 胸鳍张开[rad])
 *   aFin  = (胸鳍划水相位[周], 划水幅度[rad], 背鳍/臀鳍竖起 0..1, 腹鳍张开 0..1)
 * 本项目的改动：只保留实例化分支；鳍片（部位 1–5）逆光透光（injectTranslucency）；与本项目的焦散/逆光轮廓合成（decorateFishMaterial）
 * ================================================================ */

const SWIM_HEAD = /* glsl */`
uniform float uSwT, uSnout, uLen, uLam, uBreath, uSwimAmp, uPectRest, uLookAt;
uniform vec3 uEnv;
attribute vec3 _fin;
attribute vec3 _piv;
attribute vec4 aSwim;
attribute vec4 aFin;
varying float vFinP;
// 头→尾的行波；包络 A(s) = c0 + c1 s + c2 s²（s：吻端 0 .. 尾尖 1），cyc 以摆尾周期计
float fishH(float s, float cyc, float amp) {
  float A = uEnv.x + uEnv.y * s + uEnv.z * s * s;
  return uLen * amp * A * sin(6.2831853 * (s / uLam - cyc));
}
mat3 rotAxis(vec3 a, float t) {
  float c = cos(t), s = sin(t), k = 1.0 - c;
  return mat3(c + a.x * a.x * k, a.y * a.x * k + a.z * s, a.z * a.x * k - a.y * s,
              a.x * a.y * k - a.z * s, c + a.y * a.y * k, a.z * a.y * k + a.x * s,
              a.x * a.z * k + a.y * s, a.y * a.z * k - a.x * s, c + a.z * a.z * k);
}
float fishHash(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
// 眼动：停在一个随机方向，约 80 ms 跳到下一个；两只眼各有节奏
vec2 eyeGaze(float id) {
  float T = 0.8 + 1.6 * fishHash(id);
  float k = uSwT / T + fishHash(id + 1.0) * 7.0, seg = floor(k);
  vec2 g0 = vec2(fishHash(seg * 1.7 + id), fishHash(seg * 2.3 + id + 11.0));
  vec2 g1 = vec2(fishHash(seg * 1.7 - 1.7 + id), fishHash(seg * 2.3 - 2.3 + id + 11.0));
  return mix(g1, g0, smoothstep(0.0, 0.08 / T, fract(k))) - 0.5;
}
`;
const SWIM_BODY = /* glsl */`
vec4 sw = aSwim, fs4 = aFin; float seed = float(gl_InstanceID);
float cyc = sw.x, amp = sw.y * uSwimAmp, bend = sw.z;
vec3 fishP = position;
vec3 objectNormal = normal;
float part = floor(_fin.x + 0.5);
float fw = _fin.y;
vec3 piv = vec3(_piv.x, _piv.z, -_piv.y);
bool hasPiv = dot(_piv, _piv) > 1e-10;
vFinP = (part >= 1.0 && part <= 5.0) ? 1.0 : 0.0;
mat3 R = mat3(1.0);
if (part == 4.0) {
  // 胸鳍：sw.w = 离开体侧的张开角；划水时绕（近竖直的）鳍基外摆再收回，外缘鳍条比鳍基慢半拍
  float sd = sign(piv.z);
  float ang = uPectRest + sw.w + fs4.y * (0.5 - 0.5 * cos(6.2831853 * fs4.x - fw * 0.9));
  R = rotAxis(normalize(vec3(0.2, 1.0, 0.0)), sd * fw * ang);
} else if (part == 5.0) {
  // 腹鳍：收拢时贴腹，刹车/悬停时向外前方张开
  float sd = sign(piv.z);
  float ang = mix(-0.12, 0.55, fs4.w) + 0.04 * sin(4.4 * uSwT + seed);
  R = rotAxis(vec3(1.0, 0.0, 0.0), -sd * fw * ang);
} else if ((part == 1.0 || part == 2.0) && hasPiv) {
  // 背鳍/臀鳍：每根鳍条绕自己的根部像折扇一样向后收拢，直到贴着身体
  R = rotAxis(vec3(0.0, 0.0, 1.0), _fin.z * (1.0 - fs4.z));
} else if (part == 3.0 && hasPiv) {
  // 尾鳍：不摆尾（滑行）时上下叶略收，摆动时张开
  R = rotAxis(vec3(0.0, 0.0, 1.0), _fin.z * 0.22 * (1.0 - clamp(amp * 1.5, 0.0, 1.0)));
} else if (part == 6.0 && hasPiv) {
  // 眼：各自扫视 + 转弯时两眼一起瞟向弯内；uLookAt 让看得见相机的那只眼看向镜头（叠一点小扫视，不至于玻璃珠似的盯着）
  float sd = sign(piv.z);
  vec2 g = eyeGaze(seed * 7.13 + (sd > 0.0 ? 0.0 : 3.7));
  float fwd = g.x * 0.6, up = g.y * 0.3, lw = 0.0;
  if (uLookAt > 0.0) {
    vec3 d = (inverse(modelMatrix * instanceMatrix) * vec4(cameraPosition, 1.0)).xyz - piv;
    float side = d.z * sd, hz = length(vec2(d.x, side));
    lw = uLookAt * smoothstep(0.0, 0.35, side / max(length(d), 1e-4));
    fwd = mix(fwd, clamp(atan(d.x, side), -0.65, 0.65) + g.x * 0.12, lw);
    up = mix(up, clamp(atan(d.y, hz), -0.45, 0.45) + g.y * 0.06, lw);
  }
  float yaw = sd * fwd + clamp(bend * uLen, -1.0, 1.0) * 0.3 * (1.0 - lw);
  R = rotAxis(vec3(0.0, 1.0, 0.0), yaw) * rotAxis(vec3(1.0, 0.0, 0.0), -sd * up);
} else if (part == 7.0) {
  fishP.z += sign(fishP.z) * fw * uBreath * (0.5 + 0.5 * sin(4.712 * uSwT + seed));
}
if (part >= 1.0 && part <= 6.0) { fishP = piv + R * (fishP - piv); objectNormal = R * objectNormal; }
float fs = (uSnout - fishP.x) / uLen;
float fd = (fishH(fs + 0.002, cyc, amp) - fishH(fs - 0.002, cyc, amp)) / 0.004 * (-1.0 / uLen);
// 转弯：整条鱼绕重心（吻端后约 35%）弯成弧
float bx = (fs - 0.35) * uLen;
fishP.z += fishH(fs, cyc, amp) + 0.5 * bend * bx * bx;
fd += bend * bx * (-1.0);
objectNormal = normalize(vec3(objectNormal.x - fd * objectNormal.z, objectNormal.y, objectNormal.z));
`;

/** @typedef {{ snout:number, length:number, lambda:number, freq:number, amp:number, env?:number[], pect_rest?:number }} SwimInfo */
/** @typedef {{ geometry:THREE.BufferGeometry, map:THREE.Texture, swim:SwimInfo }} PhotoSource */

/** 照片皮模型的网格与游动参数（节点 extras.swim 被 GLTFLoader 放进 userData）；不是照片皮模型返回 null
 * @param {THREE.Object3D} root @returns {PhotoSource|null} */
export function photoSource(root){
  /** @type {any} */ let mesh=null;
  root.traverse((/** @type {any} */ o)=>{ if(!mesh && o.isMesh && o.userData?.swim && o.geometry.attributes._fin) mesh=o; });
  if(!mesh?.material?.map) return null;
  return { geometry:mesh.geometry, map:mesh.material.map, swim:mesh.userData.swim };
}

/** 本物种的着色器常量（逐材质一份；程序按源码共享） @param {SwimInfo} swim */
function swimUniforms(swim){
  const env = swim.env ?? [0.02, -0.08, 0.16];
  return {
    uSwT:U.time, uSnout:{ value:swim.snout }, uLen:{ value:swim.length }, uLam:{ value:swim.lambda },
    uSwimAmp:{ value:swim.amp }, uEnv:{ value:new THREE.Vector3(env[0], env[1], env[2]) },
    uBreath:{ value:0.004*swim.length }, uPectRest:{ value:swim.pect_rest ?? 0 }, uLookAt:{ value:1 },
  };
}

/** @param {string} vs */
const swimVertex = vs => vs
  .replace('#include <common>', `#include <common>\n${SWIM_HEAD}`)
  .replace('#include <beginnormal_vertex>', SWIM_BODY)
  .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = fishP;');

export class PhotoFish {
  /** @param {PhotoSource} src @param {{ capacity:number, causticK:any, castShadow:boolean }} opts */
  constructor(src, { capacity, causticK, castShadow }){
    this.capacity = capacity; this.swim = src.swim;
    this.group = new THREE.Group();
    const vec4 = (/** @type {number[]} */ init)=>{
      const a = new Float32Array(capacity*4);
      for(let i=0;i<capacity;i++) a.set(init, i*4);
      return new THREE.InstancedBufferAttribute(a, 4).setUsage(THREE.DynamicDrawUsage);
    };
    this.swimAttr = vec4([0, 1, 0, 0.1]);
    this.finAttr = vec4([0, 0, 0.3, 0.2]);
    const geo = new THREE.BufferGeometry();          // 顶点属性与模板共享，逐实例属性每个鱼群一份
    for(const [k, a] of Object.entries(src.geometry.attributes)) geo.setAttribute(k, a);
    if(src.geometry.index) geo.setIndex(src.geometry.index);
    geo.setAttribute('aSwim', this.swimAttr); geo.setAttribute('aFin', this.finAttr);
    this.geo = geo;
    const map = src.map;
    map.anisotropy = 4;
    const u = swimUniforms(src.swim);
    this.uniforms = u;
    // 照片贴图的透明度几乎只有 0/1（鳍形靠镂空），alphaTest 镂空即可，不用半透明排序
    const mat = new THREE.MeshPhysicalMaterial({ map, roughness:0.42, metalness:0, side:THREE.DoubleSide, alphaTest:0.5,
      clearcoat:0.32, clearcoatRoughness:0.3, specularIntensity:0.5, envMapIntensity:0.85 });
    decorateFishMaterial(mat, { causticK, inst:true });
    const deco = /** @type {(sh:any, r:any)=>void} */ (mat.onBeforeCompile);
    mat.onBeforeCompile = (/** @type {any} */ sh, /** @type {any} */ r)=>{
      Object.assign(sh.uniforms, u);
      sh.vertexShader = swimVertex(sh.vertexShader);
      deco(sh, r);
      sh.fragmentShader = 'varying float vFinP;\n' + sh.fragmentShader;
    };
    mat.customProgramCacheKey = ()=> `photofish_${causticK ? 'c' : ''}`;
    // 鳍膜很薄：逆光时透出自身颜色（与低模鳍同一套透光项，光色已含阴影；原来是按轮廓强度补的自发光，夜里也亮）
    injectTranslucency(mat, { k:FIN_TR, mask:'vFinP', tint:FIN_TINT });
    this.material = mat;
    const mesh = new THREE.InstancedMesh(geo, mat, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = castShadow;
    if(castShadow){
      mat.shadowSide = THREE.DoubleSide;
      const dm = new THREE.MeshDepthMaterial({ depthPacking:THREE.RGBADepthPacking, map, alphaTest:0.5, side:THREE.DoubleSide });
      dm.onBeforeCompile = (/** @type {any} */ sh)=>{
        Object.assign(sh.uniforms, u);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${SWIM_HEAD}`)
          .replace('#include <begin_vertex>', `${SWIM_BODY}\nvec3 transformed = fishP;`);
      };
      dm.customProgramCacheKey = ()=> 'photofish_depth';
      mesh.customDepthMaterial = dm;
    }
    this.mesh = mesh;
    this.matAttr = mesh.instanceMatrix;
    this.group.add(mesh);
  }
  /** @param {number} n */
  setCount(n){ this.mesh.count = n; }
  /** 实例矩阵：模型 +X 对准游向，含整体缩放 @param {number} i @param {THREE.Matrix4} m */
  setMatrix(i, m){ m.toArray(this.matAttr.array, i*16); }
  flush(){ this.matAttr.needsUpdate = true; this.swimAttr.needsUpdate = true; this.finAttr.needsUpdate = true; }
  dispose(){
    this.group.removeFromParent();
    this.mesh.customDepthMaterial?.dispose();
    this.geo.dispose();                            // 只释放逐实例属性；材质保留（同 VatFish：着色器程序跨场景复用）
  }
}
